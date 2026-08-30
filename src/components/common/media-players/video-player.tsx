import Artplayer from "artplayer";
import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  src: string;
}

/**
 * ArtPlayer 视频播放器（MP4）
 * 仅在客户端挂载，SSR 渲染空容器；支持清晰度设置、倍速、比例调整与全屏
 */
export function VideoPlayer({ src }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const art = new Artplayer({
      container,
      url: src,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      flip: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
    });

    return () => {
      art.destroy(false);
    };
  }, [src]);

  return <div ref={containerRef} className="my-6 aspect-video" />;
}
