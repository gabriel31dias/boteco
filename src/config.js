/**
 * Configuração central do jogo (2D). Unidades em metros / segundos / quilogramas.
 * Mesa de 7 pés (área de jogo 1.98m x 0.99m), bolas de 57.15mm.
 */

export const TABLE = {
  playWidth: 1.98,        // eixo X (comprimento) — mesa de 7 pés, bolas maiores na tela
  playDepth: 0.99,        // eixo Z (largura)
  clothHeight: 0.78,      // altura da superfície do pano em relação ao piso
  cushionHeight: 0.0365,  // altura da borracha acima do pano
  cushionWidth: 0.05,
  railWidth: 0.115,       // madeira externa
  railTop: 0.052,
  slateThickness: 0.05,
};

export const BALL = {
  radius: 0.028575,
  mass: 0.17,
  restitution: 0.945,     // bola-bola
  cushionRestitution: 0.78,
};

export const PHYSICS = {
  gravity: 9.81,
  slideFriction: 0.21,    // atrito de escorregamento (pano)
  rollFriction: 0.042,    // resistência de rolamento
  spinFriction: 0.032,    // decaimento do efeito vertical (english)
  ballFriction: 0.06,     // atrito tangencial bola-bola (throw)
  cushionFriction: 0.22,
  fixedStep: 1 / 240,     // passo base do integrador
  maxSubSteps: 24,
  sleepSpeed: 0.011,      // abaixo disso a bola é considerada parada
  sleepSpin: 0.35,
  maxSpeed: 13.0,
};

// Raios das caçapas (abertura efetiva onde a bola cai)
export const POCKET = {
  // ponytail: caçapa 20% menor que a original, boca 36% menor. O vão real entre
  // as duas borrachas do canto é (mouth + 2*jaw)*raiz(2) - 2*jaw = 73mm, contra
  // 57.15mm de bola: 1.28x, passa mas exige linha. Meio: 2*mouth = 72mm.
  cornerMouth: 0.0399,    // abertura da caçapa de canto medida ao longo da tabela
  sideMouth: 0.0358,      // abertura da caçapa de meio
  cornerRadius: 0.045,    // raio de captura (é o círculo preto desenhado)
  sideRadius: 0.039,
  cornerOffset: 0.024,    // deslocamento do centro para fora da área de jogo
  sideOffset: 0.0176,
  jawRadius: 0.020,       // raio das "bocas" arredondadas da borracha
  depth: 0.20,
};

export const SHOT = {
  minPower: 0.04,
  maxPower: 1.0,
  maxSpeed: 12.2,         // velocidade da branca a 100% de força
  chargeTime: 1.15,       // segundos para carregar de 0 a 100%
  maxSpinOffset: 0.62,    // fração do raio onde o taco pode acertar
  maxElevation: Math.PI * 0.28,
};

export const AIM_LEVELS = {
  facil:        { label: 'Fácil',        ghost: true,  targetLine: 1.4,  cueLine: 1.0,  cushion: 2 },
  normal:       { label: 'Normal',       ghost: true,  targetLine: 0.62, cueLine: 0.42, cushion: 1 },
  dificil:      { label: 'Difícil',      ghost: true,  targetLine: 0.26, cueLine: 0.0,  cushion: 0 },
  profissional: { label: 'Profissional', ghost: false, targetLine: 0.0,  cueLine: 0.0,  cushion: 0 },
};



export const DEFAULT_SETTINGS = {
  aim: 'normal',
  sound: true,
};

export const STORAGE_KEY = 'sinuca2d.settings.v1';
