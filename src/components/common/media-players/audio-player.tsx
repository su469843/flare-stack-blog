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
 * APlayer 的 UMD 包在模块加载时访问 window，不能静态 import 进服务端包，
 * 因此在 effect 中动态加载，仅在浏览器端执行。
 */
export function AudioPlayer({ src, title, theme = "#4d6bfe" }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let player: { destroy: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      const { default: APlayer } = await import("aplayer");
      if (cancelled || !containerRef.current) return;
      player = new APlayer({
        container: containerRef.current,
        audio: [
          {
            name: title || src.split("/").pop() || "audio",
            url: src,
          },
        ],
        theme,
      });
    })();

    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [src, title, theme]);

  return <div ref={containerRef} className="my-6" />;
}
