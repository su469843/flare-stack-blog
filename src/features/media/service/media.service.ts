import * as MediaRepo from "@/features/media/data/media.data";
import * as Storage from "@/features/media/data/media.storage";
import type {
  GetMediaListInput,
  UpdateMediaNameInput,
} from "@/features/media/media.schema";
import { getImageDimensions } from "@/features/media/utils/image-dimensions";
import {
  buildTransformOptions,
  getContentTypeFromKey,
  parseRangeHeader,
} from "@/features/media/utils/media.utils";
import * as PostMediaRepo from "@/features/posts/data/post-media.data";
import { CACHE_CONTROL } from "@/lib/constants";
import { err, ok } from "@/lib/errors";

export async function upload(
  context: DbContext & { executionCtx: ExecutionContext },
  input: { file: File },
) {
  const { file } = input;

  // 仅图片做尺寸嗅探；音视频跳过，避免把整个文件读进 Worker 内存
  const dimensions = file.type.startsWith("image/")
    ? getImageDimensions(await file.arrayBuffer())
    : null;
  const width = dimensions?.width;
  const height = dimensions?.height;

  const uploaded = await Storage.putToR2(context.env, file);

  try {
    const mediaRecord = await MediaRepo.insertMedia(context.db, {
      key: uploaded.key,
      url: uploaded.url,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      sizeInBytes: uploaded.sizeInBytes,
      width,
      height,
    });
    return ok(mediaRecord);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "media db insert failed, rolling back r2 upload",
        key: uploaded.key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    context.executionCtx.waitUntil(
      Storage.deleteFromR2(context.env, uploaded.key).catch((rollbackError) =>
        console.error(
          JSON.stringify({
            message: "r2 rollback delete failed",
            key: uploaded.key,
            error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          }),
        ),
      ),
    );
    return err({ reason: "MEDIA_RECORD_CREATE_FAILED" });
  }
}

export async function deleteImage(
  context: DbContext & { executionCtx: ExecutionContext },
  key: string,
) {
  // 后端兜底检查：防止删除正在被引用的媒体
  const inUse = await PostMediaRepo.isMediaInUse(context.db, key);
  if (inUse) {
    return err({ reason: "MEDIA_IN_USE" });
  }

  await MediaRepo.deleteMedia(context.db, key);
  context.executionCtx.waitUntil(
    Storage.deleteFromR2(context.env, key).catch((deleteError) =>
      console.error(
        JSON.stringify({
          message: "r2 delete failed",
          key,
          error:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        }),
      ),
    ),
  );

  return ok({ success: true });
}

export async function getMediaList(
  context: DbContext,
  data: GetMediaListInput,
) {
  return await MediaRepo.getMediaList(context.db, data);
}

export async function isMediaInUse(context: DbContext, key: string) {
  return await PostMediaRepo.isMediaInUse(context.db, key);
}

export async function getLinkedPosts(context: DbContext, key: string) {
  return await PostMediaRepo.getPostsByMediaKey(context.db, key);
}

export async function getLinkedMediaKeys(
  context: DbContext,
  keys: Array<string>,
) {
  return await PostMediaRepo.getLinkedMediaKeys(context.db, keys);
}

export async function getTotalMediaSize(context: DbContext) {
  return await MediaRepo.getTotalMediaSize(context.db);
}

export async function updateMediaName(
  context: DbContext,
  data: UpdateMediaNameInput,
) {
  return await MediaRepo.updateMediaName(context.db, data.key, data.name);
}

export async function handleImageRequest(
  env: Env,
  key: string,
  request: Request,
) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const serveOriginal = async () => {
    // 支持 Range 分段读取（音视频流式播放、拖动进度条）
    const range = parseRangeHeader(request.headers.get("range"));
    const object = await env.R2.get(key, range ? { range } : undefined);
    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    const contentType =
      object.httpMetadata?.contentType ||
      getContentTypeFromKey(key) ||
      "application/octet-stream";

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", contentType);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");

    if (range) {
      // 以 R2 返回的 object.range 为准计算实际范围（R2 会在请求超出对象末尾时截断），
      // 保证 Content-Range 与真实返回的正文一致。
      const size = object.size;
      let start = 0;
      let end = size - 1;
      const actual = object.range;
      if (typeof actual === "number") {
        start = actual;
        end = size - 1;
      } else if (
        actual &&
        "suffix" in actual &&
        typeof actual.suffix === "number"
      ) {
        start = Math.max(0, size - actual.suffix);
        end = size - 1;
      } else if (
        actual &&
        "offset" in actual &&
        typeof actual.offset === "number"
      ) {
        start = actual.offset;
        const requestedEnd =
          "end" in actual && typeof actual.end === "number"
            ? actual.end
            : "length" in actual && typeof actual.length === "number"
              ? start + actual.length - 1
              : size - 1;
        end = Math.max(start, Math.min(requestedEnd, size - 1));
      } else {
        // R2 未返回 range 时的兜底：按请求参数计算并钳制到对象末尾
        if ("suffix" in range) {
          start = Math.max(0, size - range.suffix);
        } else {
          start = range.offset ?? 0;
          end = Math.max(
            start,
            Math.min(
              range.length !== undefined ? start + range.length - 1 : size - 1,
              size - 1,
            ),
          );
        }
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      return new Response(object.body, { status: 206, headers });
    }

    return new Response(object.body, { headers });
  };

  // 1. 防止循环调用 & 显式请求原图
  const viaHeader = request.headers.get("via");
  const isLoop = viaHeader && /image-resizing/.test(viaHeader);
  const wantsOriginal = searchParams.get("original") === "true";

  // 2. 非图片文件（音视频等）不走 Cloudflare Images 变换管线，直接回源
  const isImageKey = (getContentTypeFromKey(key) || "").startsWith("image/");

  if (isLoop || wantsOriginal || !isImageKey) {
    return await serveOriginal();
  }

  // 2. 构建 Cloudflare Image Resizing 参数
  const transformOptions = buildTransformOptions(
    searchParams,
    request.headers.get("Accept") || "",
  );

  // 3. 尝试进行图片处理
  try {
    const origin = url.origin;
    const sourceImageUrl = `${origin}/images/${key}?original=true`;

    const subRequestHeaders = new Headers();

    const headersToKeep = ["user-agent", "accept"];
    for (const [k, v] of request.headers.entries()) {
      if (headersToKeep.includes(k.toLowerCase())) {
        subRequestHeaders.set(k, v);
      }
    }

    const imageRequest = new Request(sourceImageUrl, {
      headers: subRequestHeaders,
    });

    // 调用 Cloudflare Images 变换
    const response = await fetch(imageRequest, {
      cf: { image: transformOptions },
    });

    // 如果变换失败 (如格式不支持)，降级回原图
    if (!response.ok) {
      console.error(
        JSON.stringify({
          message: "image transform failed",
          key,
          status: response.status,
          statusText: response.statusText,
        }),
      );
      return await serveOriginal();
    }

    // 4. 返回处理后的图片
    // 使用 new Response(response.body, response) 保持状态码和其它优化头信息
    const newResponse = new Response(response.body, response);

    // 覆盖/补充必要的缓存头
    newResponse.headers.set("Vary", "Accept");
    Object.entries(CACHE_CONTROL.immutable).forEach(([k, v]) => {
      newResponse.headers.set(k, v);
    });

    return newResponse;
  } catch (e) {
    console.error(
      JSON.stringify({
        message: "image transform error",
        key,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return await serveOriginal();
  }
}
