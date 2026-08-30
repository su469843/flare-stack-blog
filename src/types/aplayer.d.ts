/**
 * APlayer 的最小类型声明（官方包未附带类型）
 * 仅覆盖本项目用到的构造参数与方法
 */
declare module "aplayer" {
  export interface APlayerAudio {
    name?: string;
    artist?: string;
    url: string;
    cover?: string;
    lrc?: string;
    theme?: string;
  }

  export default class APlayer {
    constructor(options: {
      container: HTMLElement;
      audio: APlayerAudio | APlayerAudio[];
      mini?: boolean;
      autoplay?: boolean;
      lrcType?: number;
      mutex?: boolean;
      listFolded?: boolean;
      listMaxHeight?: number;
      storageName?: string;
      loop?: "all" | "one" | "none";
      order?: "list" | "random";
      preload?: "none" | "metadata" | "auto";
      volume?: number;
      theme?: string;
    });
    play(): void;
    pause(): void;
    toggle(): void;
    seek(time: number): void;
    destroy(): void;
  }
}
