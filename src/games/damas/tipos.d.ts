// Jogo em JS puro (veio de fora, sem tipos). Só o que a tela React usa.
declare module '*/games/damas/game.js' {
  export const Boot: unknown;
  export const Match: unknown;
}
declare module '*/games/damas/audio.js' {
  export const audio: { resume(): void; on: boolean; setEnabled(v: boolean): void };
}
