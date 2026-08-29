import { ClientOnly, Link } from "@tanstack/react-router";
import { ArrowRight, Eye, Pin } from "lucide-react";
import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostItem as PostItemType } from "@/features/posts/schema/posts.schema";
import { formatDate } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface PostItemProps {
  post: PostItemType;
  pinned?: boolean;
  views?: number;
  isLoadingViews?: boolean;
}

export const PostItem = memo(
  ({ post, pinned, views, isLoadingViews }: PostItemProps) => {
    return (
      <div className="ds-card group">
        <Link
          to="/post/$slug"
          params={{ slug: post.slug }}
          className="block p-6 md:p-7"
        >
          <div className="flex flex-col gap-3">
            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground/70">
              <time
                dateTime={post.publishedAt?.toISOString()}
                className="whitespace-nowrap font-mono"
              >
                <ClientOnly fallback="-">
                  {formatDate(post.publishedAt)}
                </ClientOnly>
              </time>
              {post.tags && post.tags.length > 0 && (
                <>
                  <span className="opacity-30">/</span>
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary/90"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {isLoadingViews ? (
                <>
                  <span className="opacity-30">/</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground/70">
                    <Eye size={12} />
                    <Skeleton className="h-3 w-12 rounded bg-muted-foreground/20" />
                  </span>
                </>
              ) : views !== undefined ? (
                <>
                  <span className="opacity-30">/</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground/70">
                    <Eye size={12} />
                    {m.post_views_count({ count: views })}
                  </span>
                </>
              ) : null}
            </div>

            <h3
              className="text-xl md:text-2xl font-bold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary flex items-center gap-3"
              style={{ viewTransitionName: `post-title-${post.slug}` }}
            >
              {pinned && (
                <Pin
                  size={20}
                  className="text-primary/70 fill-primary/10"
                  strokeWidth={1.5}
                />
              )}
              <span className="line-clamp-2">{post.title}</span>
            </h3>

            <p className="text-muted-foreground leading-relaxed max-w-2xl line-clamp-2 text-sm md:text-base">
              {post.summary}
            </p>

            <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary/80 opacity-0 -translate-x-1 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
              {m.post_read_more()}
              <ArrowRight size={14} />
            </span>
          </div>
        </Link>
      </div>
    );
  },
);

PostItem.displayName = "PostItem";
