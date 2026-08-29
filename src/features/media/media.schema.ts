import { z } from "zod";
import type { Messages } from "@/lib/i18n";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — 图片
// 音视频上限低于 Workers 100MB 请求体硬上限，为 multipart/form-data 边界与表单字段留出余量，
// 确保超限请求能在 parseUploadMediaInput 中返回友好错误而不是被边缘直接拒绝。
// Business/Enterprise 套餐的请求体上限更高，可按实际套餐调大此常量（唯一调整点）。
export const MAX_AV_FILE_SIZE = 95 * 1024 * 1024; // 95MB — 音视频
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg", // mp3
  "audio/mp3",
  "audio/flac",
  "audio/x-flac",
];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4"];
export const ACCEPTED_MEDIA_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_AUDIO_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
];

export const UploadMediaInputSchema = z.instanceof(FormData);

export function parseUploadMediaInput(formData: FormData, messages: Messages) {
  const file = formData.get("image");
  if (!(file instanceof File)) {
    throw new Error(messages.media_validation_file_required());
  }
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const isAudio = ACCEPTED_AUDIO_TYPES.includes(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isAudio && !isVideo) {
    throw new Error(messages.media_validation_file_invalid_type());
  }
  const maxSize = isImage ? MAX_FILE_SIZE : MAX_AV_FILE_SIZE;
  if (file.size > maxSize) {
    throw new Error(messages.media_validation_file_too_large());
  }

  return { file };
}

export const MediaKeyInputSchema = z.object({
  key: z.string(),
});

export function assertMediaKey(key: string, messages: Messages) {
  const trimmedKey = key.trim();
  if (trimmedKey.length === 0) {
    throw new Error(messages.media_validation_key_required());
  }

  return trimmedKey;
}

export const UpdateMediaNameInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

export const GetMediaListInputSchema = z.object({
  cursor: z.number().optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  unusedOnly: z.boolean().optional(),
});

export type UpdateMediaNameInput = z.infer<typeof UpdateMediaNameInputSchema>;
export type GetMediaListInput = z.infer<typeof GetMediaListInputSchema>;
