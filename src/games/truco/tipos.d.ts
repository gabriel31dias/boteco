// Jogo em JS puro (veio de fora, sem tipos). Só o que a tela React usa.
declare module '*/games/truco/render/scene.js' {
  export class Scene {
    static create(canvas: HTMLCanvasElement, jogadores?: number): Promise<Scene>;
    app: { destroy(removeView: boolean): void };
    onPlay: (indice: number) => void;
    setPlayable(v: boolean): void;
  }
}
declare module '*/games/truco/ponte.js' {
  export class Ponte {
    constructor(scene: unknown, assento: number, opts: { onBanner?: (t: string, posicao?: number) => void });
    meuIndice: number;
    aplicar(estado: unknown): void;
  }
}
declare module '*/games/truco/sound.js' {
  export const sound: { resume(): void; enabled: boolean };
}
