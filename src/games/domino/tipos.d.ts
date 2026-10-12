// Jogo em JS puro (veio de fora, sem tipos). Só o que o React usa.
declare module '*/games/domino/GameScene.js' {
  const GameScene: unknown;
  export default GameScene;
}
declare module '*/games/domino/scenes/UIScene.js' {
  const UIScene: unknown;
  export default UIScene;
}
declare module '*/games/domino/audio/audio.js' {
  export const audio: { unlock(): void };
}
declare module '*/games/domino/scenes/BootScene.js' {
  const BootScene: unknown;
  export default BootScene;
}
