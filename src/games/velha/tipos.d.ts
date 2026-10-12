// O jogo é JS puro (veio de fora, sem tipos). Isto é só o que o React usa.
declare module '*/games/velha/game.js' {
  export class GameScene {
    aplicar(estado: unknown): void;
  }
}
declare module '*/games/velha/background.js' {
  export const BackgroundScene: unknown;
}
declare module '*/games/velha/audio.js' {
  export function unlock(): void;
}
