/**
 * Catálogo de jogos. Cada processo do servidor serve UM jogo (JOGO=velha
 * node server/index.js), então um bug na velha não derruba as mesas de sinuca.
 *
 * `arbitro` é a diferença que importa:
 *  - 'consenso': o servidor não tem como julgar (física). Os dois clientes
 *    simulam, relatam o vencedor, e o dinheiro só sai quando eles concordam.
 *  - 'servidor': o servidor é dono do estado e decide sozinho. Não precisa de
 *    consenso e não dá pra trapacear.
 *
 * Mesa: `jogadores` é quantos ela precisa pra abrir (2 se omitido). Mesa de
 * tamanho variável usa `minJogadores`/`maxJogadores`: com o mínimo sentado,
 * espera `esperaMs` por mais gente e abre com quem tiver (cheia abre na hora).
 *
 * `duplas`: 0 e 2 contra 1 e 3, e cada vencedor leva o `prize` da sala. Sem
 * duplas é cada um por si, e o vencedor leva o pote (todas as entradas menos a
 * taxa) — com 2 jogadores dá o mesmo `prize` de sempre.
 */
export const JOGOS = {
  sinuca: {
    id: 'sinuca',
    nome: 'Sinuca',
    subtitulo: '8-ball · vence quem encaçapar a 8',
    porta: 3001,
    arbitro: 'consenso',
  },
  velha: {
    id: 'velha',
    nome: 'Jogo da velha',
    subtitulo: 'Melhor de 3 · empate decide no relógio',
    porta: 3002,
    arbitro: 'servidor',
    rodadas: 3,
    tempoJogada: 15,      // segundos por jogada
  },
  truco: {
    id: 'truco',
    nome: 'Truco paulista',
    subtitulo: '12 pontos · truco, seis, nove e doze',
    porta: 3004,
    arbitro: 'servidor',
    tempoJogada: 20,
  },
  // Mesmo árbitro do truco, com 4 assentos: 0 e 2 contra 1 e 3. Processo
  // próprio pra ter fila própria — e um bug aqui não derruba o 1×1.
  'truco-duplas': {
    id: 'truco-duplas',
    nome: 'Truco em duplas',
    subtitulo: '2×2 · parceiro de frente, 12 pontos',
    porta: 3006,
    arbitro: 'servidor',
    tempoJogada: 20,
    jogadores: 4,
    duplas: true,
  },
  damas: {
    id: 'damas',
    nome: 'Damas',
    subtitulo: 'Brasileiras · captura obrigatória',
    porta: 3005,
    arbitro: 'servidor',
    tempoJogada: 60,
  },
  domino: {
    id: 'domino',
    nome: 'Dominó',
    subtitulo: '2 a 4 jogadores · cada um por si · 50 pontos',
    porta: 3003,
    arbitro: 'servidor',
    tempoJogada: 60,
    minJogadores: 2,
    maxJogadores: 4,
    esperaMs: 10_000,
  },
  'domino-duplas': {
    id: 'domino-duplas',
    nome: 'Dominó em duplas',
    subtitulo: '2×2 · parceiro de frente · 50 pontos',
    porta: 3007,
    arbitro: 'servidor',
    tempoJogada: 60,
    jogadores: 4,
    duplas: true,
  },
  // Sit & Go: todos pagam a entrada, recebem fichas, e quem fica com todas
  // leva o pote — o mesmo vencedor-leva-tudo do dominó individual.
  poker: {
    id: 'poker',
    nome: "Pôquer Texas Hold'em",
    subtitulo: '2 a 6 · Sit & Go · quem fica com as fichas leva o pote',
    porta: 3009,
    arbitro: 'servidor',
    tempoJogada: 20,
    minJogadores: 2,
    maxJogadores: 6,
    esperaMs: 15_000,
  },
  // Buraco aberto: 104 cartas, 2 curinga, só sequência. Partida até 1000 pontos.
  buraco: {
    id: 'buraco',
    nome: 'Buraco',
    subtitulo: '1 contra 1 · buraco aberto · 1000 pontos',
    porta: 3010,
    arbitro: 'servidor',
    tempoJogada: 45,
  },
  'buraco-duplas': {
    id: 'buraco-duplas',
    nome: 'Buraco em duplas',
    subtitulo: '2×2 · parceiro de frente · 1000 pontos',
    porta: 3011,
    arbitro: 'servidor',
    tempoJogada: 45,
    jogadores: 4,
    duplas: true,
  },
  // Cacheta: 2 baralhos, 9 cartas, vira define o curinga. Cada um começa com
  // 10 pontos; quem bate tira 1 (ou 2) dos outros. Último na mesa leva.
  cacheta: {
    id: 'cacheta',
    nome: 'Cacheta',
    subtitulo: '2 a 6 · 10 pontos · o último na mesa leva o pote',
    porta: 3012,
    arbitro: 'servidor',
    tempoJogada: 30,
    minJogadores: 2,
    maxJogadores: 6,
    esperaMs: 15_000,
  },
  // Tempo real: o servidor simula a 30 passos/s e decide tudo (ver server/jogos/tanque.js).
  tanque: {
    id: 'tanque',
    nome: 'Batalha de tanques',
    subtitulo: '2 a 4 · cada um por si · tiro em tempo real',
    porta: 3014,
    arbitro: 'servidor',
    minJogadores: 2,
    maxJogadores: 4,
    esperaMs: 10_000,
    // Cada um escolhe a cor no lobby (`join` com `cor`); repetida, vai a primeira livre.
    cores: ['azul', 'vermelho', 'verde', 'amarelo'],
  },
  // Tiro de plataforma, de lado, em tempo real (ver server/jogos/ratos.js).
  ratos: {
    id: 'ratos',
    nome: 'Ratos em Guerra',
    subtitulo: '2 a 4 · suba sem fim, pegue queijo e derrube os outros',
    porta: 3015,
    arbitro: 'servidor',
    minJogadores: 2,
    maxJogadores: 4,
    esperaMs: 10_000,
    // a "cor" é o rato: cada um com a sua arma
    cores: ['azul', 'vermelho', 'verde', 'roxo'],
    nomesCores: { azul: 'Zé Boné · fuzil', vermelho: 'Bolota · escopeta', verde: 'Sargento · sniper', roxo: 'Punk · metralhadora' },
  },
  // Arena tropical vista de cima, tempo real (ver server/jogos/capivara.js).
  capivara: {
    id: 'capivara',
    nome: 'Capivara Pistola',
    subtitulo: '2 a 4 · todo mundo contra todo mundo · 10 abates leva',
    porta: 3016,
    arbitro: 'servidor',
    minJogadores: 2,
    maxJogadores: 4,
    esperaMs: 10_000,
    cores: ['vermelho', 'azul', 'verde', 'rosa'],
    nomesCores: { vermelho: 'Bandana · frigideira', azul: "Surfista · pistola d'água", verde: 'Sargento · coco-granada', rosa: 'Bailarina · melancia' },
  },
};

export const JOGO_PADRAO = 'sinuca';

/**
 * O chat roda como os jogos (mesmo index.js, JOGO=chat), mas fora do catálogo:
 * o lobby lista JOGOS, e o chat não é jogo.
 */
export const CHAT = { id: 'chat', porta: 3008 };

export const jogoDe = (id) => JOGOS[String(id ?? '').trim()] ?? null;

/** Caminho do socket.io de cada jogo: o proxy manda cada um pro seu processo. */
export const caminhoDe = (id) => `/ws/${id}`;
