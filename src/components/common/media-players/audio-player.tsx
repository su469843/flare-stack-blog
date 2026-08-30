import APlayer from "aplayer";
import "aplayer/dist/APlayer.min.css";
import { useEffect, useRef } from "react";

interface AudioPlayerProps {
  src: string;
  title?: string | null;
  /** 播放器主题色（进度条/高亮），默认 DeepSeek 蓝 */
  theme?: string;
}

/**
 * APlayer 音频播放器（MP3/FLAC）
 * 仅在客户端挂载，SSR 渲染空容器
 */
export function AudioPlayer({ src, title, theme = "#4d6bfe" }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const player = new APlayer({
      container,
      audio: [
        {
          name: title || src.split("/").pop() || "audio",
          url: src,
        },
      ],
      theme,
    });

    return () => {
      player.destroy();
    };
  }, [src, title, theme]);

  return <div ref={containerRef} className="my-6" />;
}
