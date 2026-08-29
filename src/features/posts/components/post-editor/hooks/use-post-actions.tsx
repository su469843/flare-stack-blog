import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  findPostByIdFn,
  generateSlugFn,
  previewSummaryFn,
  startPostProcessWorkflowFn,
  updatePostFn,
} from "@/features/posts/api/posts.admin.api";
import type { PostEditorData } from "@/features/posts/components/post-editor/types";
import { convertToPlainText, slugify } from "@/features/posts/utils/content";
import { createTagFn, generateTagsFn } from "@/features/tags/api/tags.api";
import { TAGS_KEYS } from "@/features/tags/queries";
import type { Tag } from "@/features/tags/tags.schema";
import { useDebounce } from "@/hooks/use-debounce";
import { POSTS_KEYS } from "@/features/posts/queries";
import { toLocalDateString } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface UsePostActionsOptions {
  postId: number;
  post: PostEditorData;
  initialData: PostEditorData;
  setPost: React.Dispatch<React.SetStateAction<PostEditorData>>;
  setError: (error: string | null) => void;
  allTags: Array<Tag>;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function usePostActions({
  postId,
  post,
  initialData,
  setPost,
  setError,
  allTags,
}: UsePostActionsOptions) {
  const queryClient = useQueryClient();

  const contentStats = useMemo(() => {
    const text = convertToPlainText(post.contentJson);
    const chars = text.replace(/\n/g, "").length;
    const cjkChars = (
      text.match(
        /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g,
      ) || []
    ).length;
    const textWithoutCjk = text.replace(
      /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g,
      " ",
    );
    const englishWords = textWithoutCjk.split(/\s+/).filter(Boolean).length;
    return { chars, words: cjkChars + englishWords, cjkChars, englishWords };
  }, [post.contentJson]);

  const [isCalculatingReadTime, setIsCalculatingReadTime] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [processState, setProcessState] = useState<
    "IDLE" | "PROCESSING" | "SUCCESS"
  >("IDLE");
  // kvSnapshot tracks what is currently in the public KV storage.
  // It is only updated on initial load or after a successful manual publish/sync.
  const [kvSnapshot, setKvSnapshot] = useState<PostEditorData>(initialData);
  const [sessionSynced, setSessionSynced] = useState(false);

  // Sync state when initialData changes ONLY IF we haven't synced to KV yet
  // but wait, if the post was already published and we just loaded it,
  // initialData is our best guess for what's in KV.
  const [hasInitializedSnapshot, setHasInitializedSnapshot] = useState(false);
  useEffect(() => {
    if (!hasInitializedSnapshot) {
      setKvSnapshot(initialData);
      setHasInitializedSnapshot(true);
    }
  }, [initialData, hasInitializedSnapshot]);

  // Compare current post to kvSnapshot to determine if KV needs an update.
  // This is INDEPENDENT of the auto-save state.
  const isDirty = useMemo(() => {
    const compareTags = (a: Array<number>, b: Array<number>) => {
      return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    };

    // If backend reports not synced, and we haven't synced in this session, it's dirty.
    if (!initialData.isSynced && !sessionSynced) {
      return true;
    }

    return (
      post.title !== kvSnapshot.title ||
      post.slug !== kvSnapshot.slug ||
      post.status !== kvSnapshot.status ||
      post.summary !== kvSnapshot.summary ||
      post.readTimeInMinutes !== kvSnapshot.readTimeInMinutes ||
      post.publishedAt?.getTime() !== kvSnapshot.publishedAt?.getTime() ||
      post.pinnedAt?.getTime() !== kvSnapshot.pinnedAt?.getTime() ||
      // For content, referential comparison is usually enough since Tiptap
      // returns a new object on change, but we'll stick to it.
      post.contentJson !== kvSnapshot.contentJson ||
      !compareTags(post.tagIds, kvSnapshot.tagIds)
    );
  }, [post, kvSnapshot, initialData.isSynced, sessionSynced]);

  // Keep track of how slug was requested to control noisy toasts
  const slugGenerationMode = useRef<"manual" | "auto">("manual");
  // Track previous values to detect actual changes & skip first mount
  const prevTitleRef = useRef(post.title);
  const prevContentRef = useRef(post.contentJson);
  const isFirstTitleMount = useRef(true);
  const isFirstContentMount = useRef(true);

  // Debounced values
  const debouncedTitle = useDebounce(post.title, 500);
  const debouncedContentJson = useDebounce(post.contentJson, 500);

  // 发布/下架复核参数：最多 3 轮，每轮触发后轮询验证状态是否真正落库
  const PROCESS_MAX_ATTEMPTS = 3;
  const VERIFY_POLL_INTERVAL_MS = 4000;
  const VERIFY_POLLS_PER_ATTEMPT = 3;

  const finalizeProcessSuccess = (snapshot: PostEditorData) => {
    toast.success(m.editor_action_publish_success(), {
      description: m.editor_action_publish_success_desc(),
    });
    setSessionSynced(true);
    setKvSnapshot(snapshot);
    setProcessState("SUCCESS");
    // Reset after cooldown
    setTimeout(() => {
      setProcessState("IDLE");
    }, 3000);
    void queryClient.invalidateQueries({ queryKey: POSTS_KEYS.adminLists });
    void queryClient.invalidateQueries({ queryKey: POSTS_KEYS.lists });
    void queryClient.invalidateQueries({ queryKey: POSTS_KEYS.counts });
  };

  const runProcessWorkflow = async () => {
    const isUnpublish = post.status === "draft" && post.hasPublicCache;
    const targetStatus: PostEditorData["status"] = isUnpublish
      ? "draft"
      : "published";
    const targetPublishedAt =
      targetStatus === "published"
        ? (post.publishedAt ?? new Date())
        : post.publishedAt;

    let lastFailure: string | null = null;
    let statusPersisted = false;
    let processingSettled = false;

    for (let attempt = 1; attempt <= PROCESS_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        toast.info(
          m.editor_action_publish_retrying({ attempt: String(attempt - 1) }),
        );
      }
      try {
        // 1) 先把目标状态显式写入数据库，绝不依赖自动保存的时机，
        //    否则工作流可能针对草稿运行，导致“点了发布却一直停在草稿箱”。
        const updateResult = await updatePostFn({
          data: {
            id: postId,
            data: {
              status: targetStatus,
              publishedAt: targetPublishedAt,
            },
          },
        });
        if (updateResult.error) {
          lastFailure = `${m.editor_action_publish_error_save()}: ${updateResult.error.reason}`;
          continue;
        }

        statusPersisted = true;
        setPost((prev) => ({
          ...prev,
          status: targetStatus,
          publishedAt: targetPublishedAt,
        }));

        // 2) 触发后台处理工作流（生成摘要/快照/清缓存/搜索索引）。
        await startPostProcessWorkflowFn({
          data: {
            id: postId,
            status: targetStatus,
            clientToday: toLocalDateString(new Date()),
          },
        });

        // 3) 复核：轮询后端，确认状态真正变成目标值、且公开缓存已结算。
        for (let poll = 0; poll < VERIFY_POLLS_PER_ATTEMPT; poll++) {
          await sleep(VERIFY_POLL_INTERVAL_MS);
          const check = await findPostByIdFn({ data: { id: postId } });
          if (!check) {
            lastFailure = m.editor_action_publish_error_save();
            break;
          }

          const statusOk = check.status === targetStatus;
          processingSettled = isUnpublish
            ? !check.hasPublicCache
            : check.hasPublicCache;

          if (statusOk && processingSettled) {
            finalizeProcessSuccess({
              ...post,
              status: targetStatus,
              publishedAt: targetPublishedAt,
              isSynced: true,
              hasPublicCache: !isUnpublish,
            });
            return;
          }

          lastFailure = statusOk
            ? null
            : m.editor_action_publish_status_mismatch();
        }
      } catch (error) {
        lastFailure =
          error instanceof Error
            ? error.message
            : m.editor_action_unknown_error();
      }
    }

    setProcessState("IDLE");
    void queryClient.invalidateQueries({ queryKey: POSTS_KEYS.adminLists });

    if (statusPersisted && lastFailure === null) {
      // 状态已经改成目标值，但后台工作流始终没有结算（最常见：AI 摘要失败）。
      toast.warning(m.editor_action_publish_success_partial(), {
        description: m.editor_action_publish_success_partial_desc(),
      });
      return;
    }

    toast.error(m.editor_action_publish_failed(), {
      description: m.editor_action_publish_failed_desc({
        reason: lastFailure ?? m.editor_action_unknown_error(),
      }),
    });
  };

  const handleProcessData = () => {
    if (processState !== "IDLE") return;
    setProcessState("PROCESSING");
    void runProcessWorkflow();
  };

  // Slug generation mutation
  const slugMutation = useMutation({
    mutationFn: (title: string) =>
      generateSlugFn({
        data: {
          title,
          excludeId: postId,
        },
      }),
    onSuccess: (result) => {
      setPost((prev) => ({ ...prev, slug: result.slug }));
      if (slugGenerationMode.current === "manual") {
        toast.success(m.editor_action_slug_set(), {
          description: m.editor_action_slug_set_desc({ slug: result.slug }),
        });
      }
    },
    onSettled: (_data, error) => {
      if (!error) return;
      console.error("Slug generation failed:", error);
      setError(m.editor_action_slug_error());
      const fallbackSlug = slugify(post.title) || "untitled-log";
      setPost((prev) => ({ ...prev, slug: fallbackSlug }));
    },
  });

  const previewSummaryMutation = useMutation({
    mutationFn: () =>
      previewSummaryFn({
        data: {
          contentJson: post.contentJson,
        },
      }),
    onSuccess: (result) => {
      setPost((prev) => ({ ...prev, summary: result.summary }));
    },
  });

  // Auto-generate slug on title change (debounced)
  useEffect(() => {
    // Skip first mount to avoid regenerating slug on edit page load
    if (isFirstTitleMount.current) {
      isFirstTitleMount.current = false;
      prevTitleRef.current = debouncedTitle;
      return;
    }

    // Only run if title actually changed
    if (debouncedTitle === prevTitleRef.current) {
      return;
    }
    prevTitleRef.current = debouncedTitle;

    if (!debouncedTitle.trim()) {
      return;
    }
    if (slugMutation.isPending) return;
    slugGenerationMode.current = "auto";
    slugMutation.mutate(debouncedTitle);
  }, [debouncedTitle]);

  const runReadTimeCalculation = (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!post.contentJson) {
      if (!silent) {
        toast.error(m.editor_action_no_content(), {
          description: m.editor_action_no_content_read_time(),
        });
      }
      return;
    }
    setIsCalculatingReadTime(true);

    setTimeout(() => {
      const { cjkChars, englishWords, words } = contentStats;

      // Reading speed: ~400 CJK chars/min, ~200 English words/min
      const cjkMinutes = cjkChars / 400;
      const englishMinutes = englishWords / 200;
      const mins = Math.max(1, Math.ceil(cjkMinutes + englishMinutes));

      setPost((prev) => ({ ...prev, readTimeInMinutes: mins }));
      setIsCalculatingReadTime(false);

      if (!silent) {
        toast.success(m.editor_action_read_time_done(), {
          description: m.editor_action_read_time_desc({
            mins: String(mins),
            words: String(words),
          }),
        });
      }
    }, 400);
  };

  // Auto-calculate read time on content changes (debounced)
  useEffect(() => {
    // Skip first mount
    if (isFirstContentMount.current) {
      isFirstContentMount.current = false;
      prevContentRef.current = debouncedContentJson;
      return;
    }

    // Only run if content actually changed
    if (debouncedContentJson === prevContentRef.current) {
      return;
    }
    prevContentRef.current = debouncedContentJson;

    if (!debouncedContentJson) {
      return;
    }
    runReadTimeCalculation({ silent: true });
  }, [debouncedContentJson]);

  const handleGenerateSlug = () => {
    if (!post.title.trim()) {
      setError(m.editor_action_title_empty());
      return;
    }
    slugGenerationMode.current = "manual";
    slugMutation.mutate(post.title);
  };

  const handleCalculateReadTime = () => {
    runReadTimeCalculation({ silent: false });
  };

  const handleGenerateSummary = () => {
    if (!post.contentJson) {
      toast.error(m.editor_action_no_content(), {
        description: m.editor_action_no_content_summary(),
      });
      return;
    }
    setIsGeneratingSummary(true);
    previewSummaryMutation.mutate(undefined, {
      onSettled: () => {
        setIsGeneratingSummary(false);
      },
    });
  };

  const handleGenerateTags = async () => {
    try {
      setIsGeneratingTags(true);
      const generatedTagNames = await generateTagsFn({
        data: {
          title: post.title,
          summary: post.summary,
          content:
            typeof post.contentJson === "string"
              ? post.contentJson
              : JSON.stringify(post.contentJson),
          existingTags: allTags.map((t) => t.name),
        },
      });

      // Match or Create Tags
      const newTagIds: Array<number> = [];
      const currentTagIds = new Set(post.tagIds);

      for (const name of generatedTagNames) {
        const existingTag = allTags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );

        if (existingTag) {
          if (!currentTagIds.has(existingTag.id)) {
            newTagIds.push(existingTag.id);
            currentTagIds.add(existingTag.id);
          }
        } else {
          const result = await createTagFn({ data: { name } });
          if (result.error) {
            // 当前仅会返回 TAG_NAME_ALREADY_EXISTS，直接跳过即可
            continue;
          }
          newTagIds.push(result.data.id);
          currentTagIds.add(result.data.id);
        }
      }

      if (newTagIds.length > 0) {
        setPost((prev) => ({
          ...prev,
          tagIds: [...prev.tagIds, ...newTagIds],
        }));

        await queryClient.invalidateQueries({
          queryKey: TAGS_KEYS.adminList({}),
        });

        toast.success(m.editor_action_tags_done(), {
          description: m.editor_action_tags_added({
            count: String(newTagIds.length),
          }),
        });
      } else {
        toast.info(m.editor_action_tags_done(), {
          description: m.editor_action_tags_none(),
        });
      }
    } catch (error) {
      console.error("Failed to generate tags:", error);
      toast.error(m.editor_action_tags_error(), {
        description:
          error instanceof Error
            ? error.message
            : m.editor_action_unknown_error(),
      });
    } finally {
      setIsGeneratingTags(false);
    }
  };

  return {
    isGeneratingSlug: slugMutation.isPending,
    isCalculatingReadTime,
    isGeneratingSummary,
    handleGenerateSlug,
    handleCalculateReadTime,
    handleGenerateSummary,
    handleProcessData,
    processState,
    isGeneratingTags,
    handleGenerateTags,
    isDirty,
    contentStats,
  };
}
