import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { mediaInfiniteQueryOptions } from "@/features/media/queries";
import { useDebounce } from "@/hooks/use-debounce";

export type MediaPickerKind = "image" | "audio" | "video";

const KIND_PREFIXES: Record<MediaPickerKind, string> = {
  image: "image/",
  audio: "audio/",
  video: "video/",
};

/**
 * Simplified media hook for the insert modal (no delete/selection logic)
 */
export function useMediaPicker(kind: MediaPickerKind = "image") {
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Infinite Query for media list (filtered by kind)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useInfiniteQuery({
      ...mediaInfiniteQueryOptions(debouncedSearch),
    });

  // Flatten all pages and filter to the requested kind
  const mediaItems = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    return items.filter((m) => m.mimeType.startsWith(KIND_PREFIXES[kind]));
  }, [data, kind]);

  // Load more handler - memoized to prevent IntersectionObserver recreation
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  return {
    mediaItems,
    searchQuery,
    setSearchQuery,
    loadMore,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    isPending,
  };
}
