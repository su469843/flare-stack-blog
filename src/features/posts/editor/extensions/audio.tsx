import { Node, mergeAttributes } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function AudioBlock({ node, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className="my-6">
      <div
        className={`rounded-sm border transition-colors ${
          selected ? "border-foreground" : "border-transparent"
        }`}
      >
        <audio
          src={node.attrs.src ?? undefined}
          controls
          preload="none"
          className="w-full"
        />
      </div>
    </NodeViewWrapper>
  );
}

/**
 * 音频节点（MP3/FLAC 等）— 前台由主题渲染为 APlayer 播放器
 */
export const AudioExtension = Node.create({
  name: "audio",
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
    return [{ tag: "audio[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, { controls: true, preload: "none" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioBlock);
  },
});
