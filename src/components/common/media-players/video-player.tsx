import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  src: string;
}

/**
 * ArtPlayer 视频播放器（MP4）
 * 与 APlayer 同理：在 effect 中动态加载，避免打包进服务端 SSR 包；
 * 支持清晰度设置、倍速、比例调整与全屏。
 */
export function VideoPlayer({ src }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let player: { destroy: (removeHtml?: boolean) => void } | null = null;
    let cancelled = false;

    void (async () => {
      const { default: Artplayer } = await import("artplayer");
      if (cancelled || !containerRef.current) return;
      player = new Artplayer({
        container: containerRef.current,
        url: src,
        setting: true,
        playbackRate: true,
        aspectRatio: true,
        flip: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
      });
    })();

    return () => {
      cancelled = true;
      player?.destroy(false);
    };
  }, [src]);

  return <div ref={containerRef} className="my-6 aspect-video" />;
}
