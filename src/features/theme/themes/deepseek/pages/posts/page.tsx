import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { PostsPageProps } from "@/features/theme/contract/pages";
import { PostItem } from "@/features/theme/themes/deepseek/components/post-item";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export const INITIAL_TAG_COUNT = 8;

export function PostsPage({
  posts,
  tags,
  selectedTag,
  onTagClick,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: PostsPageProps) {
  const { siteConfig } = useRouteContext({ from: "__root__" });
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMoreTags = tags.length > INITIAL_TAG_COUNT;
  const visibleTags = isExpanded ? tags : tags.slice(0, INITIAL_TAG_COUNT);

  // Infinite scroll observer
  const observerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "0px" },
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="w-full max-w-3xl mx-auto pb-20 px-6 md:px-0">
      {/* Header Section */}
      <header className="py-12 md:py-20 space-y-6">
        <h1 className="text-4xl md:text-5xl font-sans font-bold tracking-tight text-foreground">
          {m.nav_posts()}
        </h1>
        <p className="max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
          {siteConfig.description}
        </p>
      </header>

      {/* Tag Filters - DeepSeek Pill Chips */}
      <div className="mb-12 space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground/50">
          <span>{m.posts_tags_filter()}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onTagClick(undefined)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-all duration-300",
              !selectedTag
                ? "border-primary bg-primary/10 font-medium text-primary shadow-[0_4px_12px_-4px_rgba(77,107,254,0.4)]"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            {m.posts_all()}
          </button>

          {visibleTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onTagClick(tag.name)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-all duration-300 flex items-baseline gap-1.5",
                selectedTag === tag.name
                  ? "border-primary bg-primary/10 font-medium text-primary shadow-[0_4px_12px_-4px_rgba(77,107,254,0.4)]"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
              )}
            >
              <span>{tag.name}</span>
              <span className="text-[10px] opacity-50">{tag.postCount}</span>
            </button>
          ))}

          {hasMoreTags && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs font-mono text-muted-foreground/50 hover:text-foreground transition-colors ml-2"
            >
              {isExpanded
                ? `[- ${m.tags_collapse()}]`
                : `[+ ${m.tags_expand()} ${tags.length - INITIAL_TAG_COUNT}]`}
            </button>
          )}
        </div>
      </div>

      {/* Posts List - Card Flow */}
      <div className="flex flex-col gap-4">
        {posts.length === 0 ? (
          <div className="py-20 text-left">
            <p className="text-xl text-muted-foreground/50">
              {m.posts_no_posts()}
            </p>
          </div>
        ) : (
          posts.map((post) => <PostItem key={post.id} post={post} />)
        )}
      </div>

      {/* Load More Area */}
      <div
        ref={observerRef}
        className="py-16 flex flex-col items-center justify-center gap-6"
      >
        {isFetchingNextPage ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 fill-mode-both">
            <div className="w-1.5 h-1.5 bg-foreground animate-ping" />
            <span className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground uppercase">
              {m.posts_loading()}
            </span>
          </div>
        ) : hasNextPage ? (
          <div className="h-px w-24 bg-border/40"></div>
        ) : posts.length > 0 ? (
          <div className="flex items-center gap-4 text-muted-foreground/20">
            <span className="h-px w-12 bg-current" />
            <span className="text-lg font-serif italic">{m.posts_end()}</span>
            <span className="h-px w-12 bg-current" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
