import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function VideoBlock({ node, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className="my-6">
      <div
        className={`rounded-sm overflow-hidden border transition-colors ${
          selected ? "border-foreground" : "border-transparent"
        }`}
      >
        <video
          src={node.attrs.src ?? undefined}
          controls
          preload="metadata"
          className="w-full max-h-[60vh]"
        />
      </div>
    </NodeViewWrapper>
  );
}

/**
 * 视频节点（MP4 等）— 前台由主题渲染为 ArtPlayer 播放器
 */
export const VideoExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { controls: true, preload: "metadata" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlock);
  },
});
