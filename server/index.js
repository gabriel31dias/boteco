import { readFileSync } from 'node:fs';

// Credenciais do Pix ficam no .env (fora do git). Sem ele o app roda, só não
// gera cobrança.
try { process.loadEnvFile(); } catch { /* sem .env */ }

import { createServer } from 'node:https';
import { createServer as createHttp } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { ORIGENS, api } from './api.js';
import { apostaPrivada, avatarUrl, emPartida, estornarOrfas, liberarAssento, openMatch, refundMatch, roomOf, saldoDisponivel, settleMatch, stateOf,
  userByToken } from './model.js';
import { CHAT, JOGO_PADRAO, caminhoDe, jogoDe } from './jogos.js';
import { attachChat } from './chat.js';
import { all, one } from './db.js';
import { encerrarGravacao, gravar, limparGravacoes } from './gravacao.js';
import * as velha from './jogos/velha.js';
import * as domino from './jogos/domino.js';
import * as truco from './jogos/truco.js';
import * as damas from './jogos/damas.js';
import * as poker from './jogos/poker.js';
import * as buraco from './jogos/buraco.js';
import * as cacheta from './jogos/cacheta.js';
import * as tanque from './jogos/tanque.js';
import * as ratos from './jogos/ratos.js';
import * as capivara from './jogos/capivara.js';
import * as psicopatas from './jogos/psicopatas.js';
import * as galinhas from './jogos/galinhas.js';
import * as cobras from './jogos/cobras.js';
import * as arqueiros from './jogos/arqueiros.js';
import * as naval from './jogos/naval.js';
import * as forca from './jogos/forca.js';
import * as golfe from './jogos/golfe.js';
import * as ultima from './jogos/ultima.js';
import * as patos from './jogos/patos.js';
import * as botao from './jogos/botao.js';

/** Quanto tempo o app pode ficar fora da tela, em partida, antes do W.O. */
export const AUSENCIA_MS = Number(process.env.AUSENCIA_MS) || 30_000;
/** Quanto cada jogador tem pra responder "estou aqui" antes da partida abrir. */
export const CONFERE_MS = Number(process.env.CONFERE_MS) || 3_000;
/** Mesmo valor do `pingInterval` do socket.io (lá embaixo): cliente vivo manda pacote pelo menos nesse ritmo. */
const PING_MS = 10_000;
/** Mesa cheia em jogo de escolher personagem: tempo pro último escolher antes de abrir. */
const ESCOLHA = Number(process.env.ESCOLHA_MS ?? 5000);

/** Reações que a mesa aceita. Lista fixa: nada de texto livre durante a partida. */
// Lista fechada (sem texto livre na partida): emojis e as falas prontas do truco.
export const REACOES = ['👏', '😂', '😱', '🔥', '😎', '🙏', '👍', '😡',
  'Bora!', 'Truco!', 'Seis!', 'Nove!', 'Doze!', 'Corre!', 'Boa!',
  'Agora vai!', 'Que jogada!', 'Haha!', 'Valeu!'];                    // falas da dama

/** Código de sala vindo do cliente: só A-Z0-9, curto. */
export const sanitize = (code) =>
  String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// Relê a foto: o socket.data.user é de quando conectou, e a foto pode ter
// mudado depois disso sem o socket reconectar.
const perfil = (u) => ({
  id: u.id, name: u.name, username: u.username, level: u.level,
  avatar: avatarUrl(one('SELECT id, avatar_v FROM users WHERE id = ?', u.id)),
});
const brl = (centavos) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

/** Cada processo serve um jogo só. O árbitro de tabuleiro fica aqui. */
const ARBITROS = { velha, domino, truco, damas, 'truco-duplas': truco, 'domino-duplas': domino, poker, buraco, 'buraco-duplas': buraco, cacheta, tanque, ratos, capivara, psicopatas, galinhas, cobras, arqueiros, naval, forca, golfe, ultima, patos, botao };

export function attach(io, jogoId = JOGO_PADRAO) {
  const jogo = jogoDe(jogoId);
  if (!jogo) throw new Error(`Jogo desconhecido: ${jogoId}`);
  const arbitro = jogo.arbitro === 'servidor' ? ARBITROS[jogo.id] : null;
  // Processo novo não tem mesa nenhuma: o que o banco diz estar em andamento
  // deste jogo é sobra de antes do restart.
  const idsOrfas = all(`SELECT id FROM matches WHERE status = 'playing' AND game = ?`, jogo.id).map((m) => m.id);
  const orfas = estornarOrfas(jogo.id);
  for (const id of idsOrfas) {
    gravar(id, 'fim', { dados: { estorno: true, motivo: 'reinicio' }, alerta: 'Interrompida: o servidor reiniciou no meio da partida' });
  }
  if (orfas) console.log(`[${jogo.id}] ${orfas} partida(s) interrompida(s) estornada(s)`);
  // Tamanho da mesa. Fixa (`jogadores`) abre cheia; variável abre com MIN e
  // espera ESPERA por mais gente (cheia abre na hora). Duplas: time = paridade.
  const MAX = jogo.jogadores ?? jogo.maxJogadores ?? 2;
  const MIN = jogo.minJogadores ?? MAX;
  const DUPLAS = !!jogo.duplas;
  const ESPERA = Number(process.env.ESPERA_MESA) || jogo.esperaMs || 0;
  /** Prêmio de cada vencedor com `n` na mesa: sem duplas o pote cresce com a mesa. */
  const premioCom = (sala, n) => (DUPLAS ? sala.room.prize : Math.round(sala.room.prize * n / 2));
  // ponytail: salas em memória, somem no restart. O que é dinheiro está no
  // SQLite; o que é partida em andamento não sobrevive a um deploy — e uma
  // partida interrompida é estornada, então ninguém perde nada.
  const rooms = new Map();      // código -> sala
  const filas = new Map();      // tipo de sala -> código esperando alguém

  /** Solta a sala dos dois lados: nenhum jogador fica preso num jogo que acabou. */
  const fechar = (sala) => {
    if (!sala) return;
    clearTimeout(sala.relogio);
    clearTimeout(sala.espera);
    clearInterval(sala.laco);
    for (const p of sala.players) { if (p.socket) { p.socket.data.sala = null; p.socket.leave(sala.code); } }
    if (filas.get(sala.type) === sala.code) filas.delete(sala.type);
    rooms.delete(sala.code);
  };

  /** Quem está na sala, em que time e quando ela abre: o lobby mostra isso. */
  const avisarMesa = (sala) => io.to(sala.code).emit('mesa', {
    code: sala.code, jogadores: MAX, minimo: MIN, duplas: DUPLAS,
    inicioEm: sala.inicioEm ?? null,
    premio: premioCom(sala, Math.max(sala.players.length, MIN)),
    players: sala.players.map((p) => ({ ...perfil(p.user), time: p.time, cor: p.cor })),
  });

  /** Mesa variável caiu abaixo do mínimo: o relógio de abertura para. */
  const pararEspera = (sala) => {
    clearTimeout(sala.espera);
    sala.espera = null;
    sala.inicioEm = null;
  };

  // ------------------------------------------------- jogos de tabuleiro
  // Aqui fora (e não por conexão) porque o `sair` também fecha jogada: no
  // dominó individual quem sai é eliminado e a mesa segue. Jogador eliminado
  // fica no assento sem socket — daí os `socket?.`.

  /**
   * O que cada assento está vendo agora, pra gravação. Jogo de informação
   * perfeita (velha) manda o mesmo pra todos: aí grava uma visão só.
   */
  function visoesDe(sala) {
    if (!arbitro || !sala.partida) return null;
    const v = sala.players.map((_, i) => arbitro.estadoPara(sala.partida, i));
    const j = v.map((x) => JSON.stringify({ ...x, assento: 0 }));
    return j.every((x) => x === j[0]) ? [v[0]] : v;
  }

  /** Só nos jogos que o servidor arbitra: ele é o dono do estado. */
  function abrirTabuleiro(sala) {
    sala.partida = arbitro.novaPartida(sala.players.length, DUPLAS, sala.players.map((p) => p.cor));
    sala.turn = sala.partida.vez;
    transmitir(sala);
    if (arbitro?.TEMPO_REAL) sala.laco = setInterval(() => passoTempoReal(sala), arbitro.TICK_MS);
  }

  /**
   * Jogo em tempo real (tanque): sem turno nem relógio de jogada. A cada tick
   * a simulação anda e o estado vai pros dois. Na gravação entra só o que
   * importa (abate e fim de rodada) — 30 quadros por segundo encheriam o banco.
   */
  function passoTempoReal(sala) {
    if (!sala.partida || !sala.matchId) { clearInterval(sala.laco); return; }
    try {
      const p = arbitro.passo(sala.partida);
      for (const e of p.eventos) {
        if (e.tipo === 'abate' || e.tipo === 'rodada') gravar(sala.matchId, 'jogada', { dados: e });
      }
      if (p.fim) { clearInterval(sala.laco); fecharJogada(sala, { tipo: 'fim' }); return; }
      for (const [assento, jog] of sala.players.entries()) {
        jog.socket?.emit('estado', arbitro.estadoPara(p, assento));
      }
    } catch (e) {
      clearInterval(sala.laco);
      console.error(`[${jogoId}] erro no tempo real:`, e);
      gravar(sala.matchId, 'erro', { dados: { onde: 'tempo real', erro: e.message, stack: e.stack }, alerta: `Erro do servidor no tempo real: ${e.message}` });
    }
  }

  /**
   * Um payload por assento, nunca broadcast: em jogo de mão escondida o
   * estado da sala inteira entregaria as peças do adversário pra quem abrisse
   * o console.
   */
  function transmitir(sala, extra = {}) {
    if (!sala.partida) return;
    sala.turn = sala.partida.vez;
    // Pôquer: eliminado se levanta já — a conta fica livre pra outra partida
    // enquanto o torneio segue (a entrada dele continua no pote).
    if (sala.matchId) {
      for (const i of arbitro.fora?.(sala.partida) ?? []) liberarAssento(sala.matchId, sala.players[i].user.id);
    }
    for (const [assento, jog] of sala.players.entries()) {
      jog.socket?.emit('estado', { ...arbitro.estadoPara(sala.partida, assento), ...extra });
    }
    armarRelogio(sala);
  }

  /** Relógio da jogada. Vive no servidor porque é ele que arbitra. */
  function armarRelogio(sala) {
    clearTimeout(sala.relogio);
    sala.relogio = null;
    if (!sala.partida || sala.partida.fim || arbitro?.TEMPO_REAL) return;   // tempo real tem o laço dele
    sala.relogio = setTimeout(() => {
      // Fora de handler de socket: um erro aqui derrubaria o processo.
      try {
        // Alguém fora do app: quem perde é ele, não quem ficou esperando ele
        // voltar. Sem isso, quem sai sem desistir ganhava no relógio do outro.
        const ausente = sala.players.find((p) => p.socket?.data.ausencia);
        if (ausente) { sair(ausente.socket, 'ausencia'); return; }
        const vez = sala.partida.vez;
        const r = arbitro.estourou(sala.partida);
        if (r) {
          gravar(sala.matchId, 'relogio', { assento: Number.isInteger(vez) ? vez : null, dados: { r }, visoes: visoesDe(sala) });
          fecharJogada(sala, r);
        }
      } catch (e) {
        console.error(`[${jogoId}] erro no relógio:`, e);
        gravar(sala.matchId, 'erro', { dados: { onde: 'relógio', erro: e.message, stack: e.stack }, alerta: `Erro do servidor no relógio: ${e.message}` });
      }
    }, arbitro.restante(sala.partida));
  }

  /** Depois de uma jogada (ou do estouro): transmite e paga se acabou. */
  function fecharJogada(sala, r) {
    const p = sala.partida;
    if (!p.fim) { transmitir(sala, { ultima: r }); return; }

    clearTimeout(sala.relogio);
    sala.relogio = null;
    for (const [assento, jog] of sala.players.entries()) {
      jog.socket?.emit('estado', { ...arbitro.estadoPara(p, assento), ultima: r });
    }

    const matchId = sala.matchId;
    sala.matchId = null;
    // Vencedor null = empate no placar e no relógio: devolve a entrada.
    const resultado = p.fim.vencedor === null
      ? { ...refundMatch(matchId), empate: true }
      : settleMatch(matchId, sala.players[p.fim.vencedor].user.id, {});
    gravar(matchId, 'fim', { assento: p.fim.vencedor, dados: { fim: p.fim, resultado } });
    encerrarGravacao(matchId);
    for (const jog of sala.players) {
      jog.socket?.emit('settled', { ...resultado, state: stateOf(jog.user.id) });
    }
    fechar(sala);
  }

  /** `motivo`: 'saiu' (botão), 'desconectou' ou 'ausencia' (app fora da tela). */
  const sair = (socket, motivo = 'saiu') => {
    clearTimeout(socket.data.ausencia);
    socket.data.ausencia = null;
    const sala = socket.data.sala;
    if (!sala) return;
    const i = sala.players.findIndex((p) => p.socket === socket);
    if (i < 0) return;
    // Com a partida aberta o índice é o assento (comecar ordena). Quem leva o
    // W.O. o árbitro sabe (no dominó com 3–4 é o líder do placar); sem ele, é
    // o outro time pela paridade — que no 1×1 é o outro jogador.
    const emJogo = !!sala.matchId;

    // Dominó individual: quem sai é eliminado e a mesa segue sem ele. O assento
    // fica (sem socket) pra não embaralhar o índice dos outros; a entrada dele
    // fica no pote. Nas duplas e no resto, sair continua sendo W.O.
    if (emJogo && sala.partida && arbitro?.eliminar && !DUPLAS) {
      const r = arbitro.eliminar(sala.partida, i);
      gravar(sala.matchId, 'saiu', { assento: i, dados: { motivo, eliminado: true }, visoes: visoesDe(sala) });
      sala.players[i] = { ...sala.players[i], socket: null, saiu: true };
      socket.data.sala = null;
      socket.leave(sala.code);
      socket.emit('settled', { desistiu: true, eliminado: true, state: stateOf(socket.data.user.id) });
      for (const p of sala.players) p.socket?.emit('left', i);
      if (r) fecharJogada(sala, r);
      return;
    }

    const timeW = emJogo && sala.partida && arbitro?.vencedorWO ? arbitro.vencedorWO(sala.partida, i) : null;
    const vencedor = timeW != null ? sala.players[timeW] : sala.players.find((_, j) => j % 2 !== i % 2);
    sala.players.splice(i, 1);
    if (emJogo) {
      const matchId = sala.matchId;
      sala.matchId = null;
      // Sair no meio é W.O.: o outro time leva. Estornar seria dar botão de
      // desistir sem custo pra quem está perdendo.
      const r = vencedor ? settleMatch(matchId, vencedor.user.id, {}) : refundMatch(matchId);
      const wo = { ...r, wo: true, timeVencedor: timeW ?? 1 - (i % 2) };
      gravar(matchId, 'saiu', { assento: i, dados: { motivo } });
      gravar(matchId, 'fim', { dados: { wo: true, motivo, saiu: i, vencedorId: vencedor?.user.id ?? null, resultado: r } });
      encerrarGravacao(matchId);
      for (const p of sala.players) p.socket?.emit('settled', { ...wo, state: stateOf(p.user.id) });
      // Quem saiu também precisa saber: perdeu a aposta e o saldo mudou.
      socket.emit('settled', { ...wo, desistiu: true, state: stateOf(socket.data.user.id) });
    }
    for (const p of sala.players) p.socket?.emit('left', i);
    if (!emJogo && sala.players.length && MAX > 2) {
      // Ainda esperando gente: a sala continua, só com uma vaga a mais.
      if (sala.dono === socket) sala.dono = sala.players[0].socket;
      if (sala.players.length < MIN) pararEspera(sala);
      sala.proposta = false;
      socket.data.sala = null;
      socket.leave(sala.code);
      sala.agendar?.();   // quem faltava escolher pode ter sido quem saiu
      avisarMesa(sala);
      return;
    }
    fechar({ ...sala, players: [...sala.players, { socket }] });
  };

  io.use((socket, next) => {
    const user = userByToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('Faça login pra jogar'));
    socket.data.user = user;   // identidade vem do token, nunca do cliente
    next();
  });

  io.on('connection', (socket) => {
    socket.data.sala = null;
    // Último sinal de vida (qualquer pacote, inclusive o pong do ping): é por
    // ele que se confere cliente antigo, que não sabe responder 'vivo'.
    socket.data.visto = Date.now();
    socket.conn.on('packet', () => { socket.data.visto = Date.now(); });

    // Boundary: exceção em handler de socket derruba o processo inteiro (o
    // socket.io não isola). Com um jogo por processo isso já não contamina o
    // outro, mas o bug ainda tiraria todas as mesas deste aqui.
    const on = (evento, fn) => socket.on(evento, (...args) => {
      try { fn(...args); } catch (e) {
        console.error(`[${jogoId}] erro em '${evento}':`, e);
        socket.emit('denied', e.status ? e.message : 'Erro no servidor');
        const sala = socket.data.sala;
        if (sala?.matchId && !e.status) {
          gravar(sala.matchId, 'erro', {
            assento: sala.players.findIndex((p) => p.socket === socket),
            dados: { evento, args: args.slice(0, 1), erro: e.message, stack: e.stack },
            alerta: `Erro do servidor em '${evento}': ${e.message}`,
          });
        }
      }
    });

    on('join', (req = {}) => {
      if (socket.data.sala) return;
      const user = socket.data.user;
      const code = sanitize(req.code);
      const type = code ? 'privada' : String(req.roomType ?? '').replace(/^r_/, '');
      const room = roomOf(type, jogo.id);
      if (!room) return socket.emit('denied', 'Sala inválida');
      // Sentado numa partida aberta (outro jogo, ou um torneio de pôquer em que
      // ainda está vivo): entrar na fila só travaria a mesa dos outros no openMatch.
      if (emPartida(user.id)) return socket.emit('denied', 'Você ainda está numa partida em andamento');

      // Sala privada é pelo código; sala com valor é fila: pega quem espera.
      let alvo = code ? rooms.get(code) : rooms.get(filas.get(type));
      if (alvo && alvo.players.some((p) => p.user.id === user.id)) {
        return socket.emit('denied', 'Você já está nessa sala');
      }
      if (alvo && (alvo.players.length >= MAX || alvo.proposta || alvo.matchId || alvo.conferindo)) {
        return socket.emit('denied', 'Sala cheia');
      }

      // Time: só nas duplas. Na sala privada quem entra escolhe; na fila vai
      // pro time com menos gente, que é ordem de chegada (1º e 3º contra 2º e 4º).
      let time = null;
      if (DUPLAS) {
        const naMesa = alvo?.players ?? [];
        const contagem = [0, 1].map((t) => naMesa.filter((p) => p.time === t).length);
        const pedido = code && (req.time === 0 || req.time === 1) ? req.time : null;
        time = pedido ?? (contagem[1] < contagem[0] ? 1 : 0);
        if (contagem[time] >= MAX / 2) return socket.emit('denied', 'Esse time já está completo');
      }

      // Personagem/cor (tanque, ratos): ninguém ganha um automático. Entra sem
      // (ou com o que pediu, se estiver livre) e escolhe na sala de espera;
      // a mesa só abre quando todo mundo sentado escolheu (ver `agendar`).
      let cor = null;
      if (jogo.cores) {
        const usadas = new Set((alvo?.players ?? []).map((p) => p.cor));
        cor = jogo.cores.includes(req.cor) && !usadas.has(req.cor) ? req.cor : null;
      }

      // Quanto custa entrar: a sala que já existe manda; criando, é o valor da
      // sala fixa ou a aposta que o dono da privada escolheu.
      let aposta;
      if (alvo) aposta = { stake: alvo.room.stake, prize: alvo.room.prize };
      else if (code) {
        try { aposta = apostaPrivada(req.stake, jogo.id); } catch (e) { return socket.emit('denied', e.message); }
      } else aposta = { stake: room.stake, prize: room.prize };

      // A entrada é debitada quando a partida abre, então sem saldo não se
      // entra — nem pra esperar na fila. Antes isso só valia pra sala privada,
      // e quem estava sem dinheiro segurava a fila até derrubar o adversário.
      if (aposta.stake > saldoDisponivel(user.id)) {
        const dono = code && alvo?.players[0]?.user;
        return socket.emit('denied', dono
          ? `${dono.name} apostou ${brl(aposta.stake)} e você não tem esse saldo`
          : `Você precisa de ${brl(aposta.stake)} pra entrar nessa sala`);
      }

      if (!alvo) {
        alvo = {
          code: code || `#${randomBytes(4).toString('hex').toUpperCase()}`,
          type, room: { ...room, ...aposta }, players: [], seed: randomBytes(4).readUInt32BE(0),
          turn: 0, matchId: null, reports: new Map(), partida: null, relogio: null,
        };
        rooms.set(alvo.code, alvo);
        if (!code) filas.set(type, alvo.code);
      }

      alvo.players.push({ socket, user, time, cor });
      alvo.dono ??= socket;
      socket.data.sala = alvo;
      socket.join(alvo.code);
      socket.emit('joined', {
        code: alvo.code, you: alvo.players.length - 1, game: jogo.id, room: { type, ...alvo.room },
        time, cor, jogadores: MAX,
      });
      if (jogo.cores) {
        alvo.agendar ??= () => agendar(alvo, code);
        alvo.agendar();
        avisarMesa(alvo);
        return;
      }
      // Mesa variável: com o mínimo sentado, o relógio de abertura começa (e
      // não reinicia a cada um que chega). Cheia, abre na hora.
      if (alvo.players.length >= MIN && alvo.players.length < MAX && ESPERA && !alvo.espera) {
        const sala = alvo;
        sala.inicioEm = Date.now() + ESPERA;
        sala.espera = setTimeout(() => {
          sala.espera = null;
          // Fora de handler de socket: um erro aqui derrubaria o processo.
          try {
            if (rooms.get(sala.code) === sala && sala.players.length >= MIN && !sala.matchId && !sala.proposta) {
              fecharMesa(sala, sala.players[sala.players.length - 1].socket, code);
            }
          } catch (e) { console.error(`[${jogoId}] erro abrindo a mesa:`, e); }
        }, ESPERA);
      }
      avisarMesa(alvo);
      if (alvo.players.length < MAX) return;
      fecharMesa(alvo, socket, code);
    });

    /**
     * Jogo de escolher personagem: a contagem só corre com o mínimo sentado E
     * todo mundo com o seu escolhido. Alguém sem escolher (ou que entrou agora
     * sem escolher) para a contagem; mesa cheia e todos prontos abre em ESCOLHA.
     */
    function agendar(sala, code) {
      if (sala.matchId || rooms.get(sala.code) !== sala) return;
      const pronta = sala.players.length >= MIN && sala.players.every((p) => p.cor);
      if (!pronta) { pararEspera(sala); return; }
      const ms = sala.players.length >= MAX ? ESCOLHA : ESPERA;
      if (sala.espera && sala.inicioEm - Date.now() <= ms) return;   // já está contando (e mais perto)
      clearTimeout(sala.espera);
      sala.inicioEm = Date.now() + ms;
      sala.espera = setTimeout(() => {
        sala.espera = null;
        try {
          const ok = rooms.get(sala.code) === sala && !sala.matchId && !sala.proposta
            && sala.players.length >= MIN && sala.players.every((p) => p.cor);
          if (ok) fecharMesa(sala, sala.players[sala.players.length - 1].socket, code);
        } catch (e) { console.error(`[${jogoId}] erro abrindo a mesa:`, e); }
      }, ms);
    }

    /** A mesa não recebe mais ninguém: combina a aposta (privada) ou começa. */
    function fecharMesa(alvo, socket, code) {
      pararEspera(alvo);
      if (filas.get(alvo.type) === alvo.code) filas.delete(alvo.type);

      // Sala privada valendo dinheiro: cada convidado vê a aposta e decide. Sem
      // valor não há o que combinar, então começa direto.
      if (code && alvo.room.stake > 0) {
        const dono = alvo.players.find((p) => p.socket === alvo.dono);
        alvo.proposta = true;
        alvo.aceitos = new Set();
        for (const p of alvo.players) {
          if (p === dono) continue;
          p.socket.emit('proposta', {
            code: alvo.code, game: jogo.id, stake: alvo.room.stake, prize: premioCom(alvo, alvo.players.length),
            host: perfil(dono.user),
          });
        }
        dono.socket.emit('convidado', { player: perfil(socket.data.user) });
        return;
      }

      comecar(alvo, socket, code);
    }

    /**
     * Ninguém joga com fantasma: antes de debitar a entrada, cada um tem que
     * responder agora e estar com o app na tela. Conexão morta (celular sem
     * sinal) só cai no ping, até ~30s depois; app em segundo plano mantém a
     * conexão aberta. Os dois entrariam na partida sem jogar.
     * Devolve quem não passou.
     */
    async function conferirVivos(alvo) {
      const ok = await Promise.all(alvo.players.map(async ({ socket: s }) => {
        if (!s?.connected) return false;
        // Cliente antigo (página aberta antes desta versão) não sabe responder:
        // vale se mandou pacote no último ciclo de ping.
        if (!s.handshake.auth?.vivo) return Date.now() - (s.data.visto ?? 0) < PING_MS + CONFERE_MS;
        try {
          const r = await s.timeout(CONFERE_MS).emitWithAck('vivo');
          return r?.visivel !== false;
        } catch { return false; }
      }));
      return alvo.players.filter((_, i) => !ok[i]);
    }

    /** Confere a presença de todos e só então abre a partida. */
    function comecar(alvo, socket, code) {
      if (alvo.conferindo) return;
      alvo.conferindo = true;
      const antes = [...alvo.players];
      conferirVivos(alvo).then((fantasmas) => {
        alvo.conferindo = false;
        // Nesse meio-tempo a mesa fechou ou alguém saiu: quem mexeu já cuidou dela.
        if (rooms.get(alvo.code) !== alvo || alvo.matchId) return;
        if (alvo.players.length !== antes.length || alvo.players.some((p, i) => p !== antes[i])) {
          voltarAEsperar(alvo, code);
          return;
        }
        if (fantasmas.length) { tirarFantasmas(alvo, fantasmas, code); return; }
        abrirPartida(alvo, socket, code);
      }).catch((e) => {
        alvo.conferindo = false;
        console.error(`[${jogoId}] erro conferindo os jogadores:`, e);
      });
    }

    /** Quem não respondeu sai da mesa antes de pagar nada; quem ficou espera outro. */
    function tirarFantasmas(alvo, fantasmas, code) {
      console.log(`[${jogoId}] mesa ${alvo.code}: ${fantasmas.length} fora do ar antes de abrir (${fantasmas.map((p) => p.user.id).join(', ')})`);
      for (const p of fantasmas) {
        if (!p.socket) continue;
        p.socket.emit('denied', 'Você estava fora do app quando a partida ia começar. Entre de novo.');
        p.socket.data.sala = null;
        p.socket.leave(alvo.code);
      }
      alvo.players = alvo.players.filter((p) => !fantasmas.includes(p));
      if (!alvo.players.length) { fechar(alvo); return; }
      if (fantasmas.some((p) => p.socket === alvo.dono)) alvo.dono = alvo.players[0].socket;
      for (const p of alvo.players) p.socket?.emit('ausente', { caiuAntes: true });
      voltarAEsperar(alvo, code);
    }

    /** A mesa não abriu (alguém sumiu ou saiu): volta a esperar gente, ou abre com quem tem. */
    function voltarAEsperar(alvo, code) {
      alvo.proposta = false;
      alvo.aceitos = new Set();
      if (jogo.cores) { alvo.agendar?.(); avisarMesa(alvo); }
      else if (alvo.players.length >= MIN && MAX > MIN) { avisarMesa(alvo); comecar(alvo, alvo.players[alvo.players.length - 1].socket, code); return; }
      else avisarMesa(alvo);
      if (code) return;
      // Fila pública: a mesa volta a ser a da vez. Se outra já ocupou o lugar,
      // quem sobrou procura de novo (ficar numa mesa que ninguém acha é pior).
      const daVez = rooms.get(filas.get(alvo.type));
      if (!daVez || daVez === alvo) { filas.set(alvo.type, alvo.code); return; }
      for (const p of alvo.players) {
        p.socket?.emit('denied', 'O adversário caiu antes de começar. Procure outra partida.');
        if (p.socket) { p.socket.data.sala = null; p.socket.leave(alvo.code); }
      }
      alvo.players = [];
      fechar(alvo);
    }

    /** Debita todos e manda todos pra mesa. */
    function abrirPartida(alvo, socket, code) {
      alvo.proposta = false;
      // Daqui em diante índice = assento. Duplas: times intercalados, parceiro
      // de frente. Sem duplas fica a ordem de chegada.
      if (DUPLAS) {
        const times = [0, 1].map((t) => alvo.players.filter((p) => p.time === t));
        alvo.players = alvo.players.map((_, i) => times[i % 2][Math.floor(i / 2)]);
      }
      const [a, b, c, d, e, f] = alvo.players.map((p) => p.user.id);
      try {
        const m = openMatch({
          game: jogo.id, roomType: alvo.type, code: code || null,
          stake: alvo.room.stake, prize: alvo.room.prize,
          aId: a, bId: b, cId: c, dId: d, eId: e, fId: f,
        });
        alvo.matchId = m.id;
      } catch (e) {
        // Alguém sem saldo ou já em outra partida (corrida entre processos): sai
        // quem causou, se der pra saber; senão quem fechou a mesa. O resto espera.
        const presos = alvo.players.filter((p) => emPartida(p.user.id));
        const saem = presos.length ? presos : alvo.players.filter((p) => p.socket === socket);
        for (const p of saem) {
          p.socket.emit('denied', e.message);
          p.socket.data.sala = null;
          p.socket.leave(alvo.code);
        }
        alvo.players = alvo.players.filter((p) => !saem.includes(p));
        if (!code) filas.set(alvo.type, alvo.code);
        avisarMesa(alvo);
        return;
      }
      for (const [seat, p] of alvo.players.entries()) {
        p.socket.emit('start', {
          seed: alvo.seed, seat, matchId: alvo.matchId, game: jogo.id,
          players: alvo.players.map((x) => ({ ...perfil(x.user), cor: x.cor })),
          room: { type: alvo.type, ...alvo.room },
          // A entrada foi debitada agora: manda o saldo junto, senão a carteira
          // do cliente fica mentindo até o fim da partida.
          state: stateOf(p.user.id),
        });
      }
      if (arbitro) abrirTabuleiro(alvo);
      gravar(alvo.matchId, 'inicio', {
        dados: {
          jogo: jogo.id, sala: alvo.type, codigo: code || null, aposta: alvo.room.stake, premio: alvo.room.prize, seed: alvo.seed,
          jogadores: alvo.players.map((p, assento) => ({ assento, id: p.user.id, nome: p.user.name, username: p.user.username, time: p.time })),
        },
        visoes: visoesDe(alvo),
      });
    }


    on('jogada', (acao = {}) => {
      const sala = socket.data.sala;
      if (!arbitro || !sala?.partida || !sala.matchId) return;
      const assento = sala.players.findIndex((p) => p.socket === socket);
      // Tempo real: a jogada é só a entrada (mover/mirar/atirar), chega várias
      // vezes por segundo e o laço transmite. Nada de gravar nem transmitir aqui.
      if (arbitro.TEMPO_REAL) { if (assento >= 0) arbitro.agir(sala.partida, assento, acao && typeof acao === 'object' ? acao : {}); return; }
      // Cada jogo define o formato da ação: a velha manda uma casa, o dominó
      // manda peça e ponta. O árbitro é quem sabe ler.
      // `= {}` não cobre null: payload que não é objeto vira ação vazia (o árbitro recusa).
      const r = arbitro.agir(sala.partida, assento, acao && typeof acao === 'object' ? acao : {});
      if (!r) {
        // Recusada: clique duplo e atraso de rede acontecem; muitas seguidas
        // é cliente mexido tentando jogada que a tela nunca ofereceria.
        gravar(sala.matchId, 'recusada', {
          assento, dados: { acao },
          alerta: assento < 0 ? 'Jogada de quem não está sentado na mesa' : null,
        });
        return;
      }
      gravar(sala.matchId, 'jogada', { assento, dados: { acao, r }, visoes: visoesDe(sala) });
      fecharJogada(sala, r);
    });

    const souConvidado = () => {
      const sala = socket.data.sala;
      return sala?.proposta && sala.dono !== socket && !sala.aceitos.has(socket) ? sala : null;
    };

    // Escolha do personagem/cor na sala de espera (tanque, ratos): cada um
    // troca até a partida começar; cor de outro jogador não pode.
    on('cor', (cor) => {
      const sala = socket.data.sala;
      if (!sala || sala.matchId || !jogo.cores?.includes(cor)) return;
      const eu = sala.players.find((p) => p.socket === socket);
      if (!eu || eu.cor === cor) return;
      if (sala.players.some((p) => p !== eu && p.cor === cor)) return avisarMesa(sala);   // alguém pegou antes
      eu.cor = cor;
      sala.agendar?.();
      avisarMesa(sala);
    });

    on('aceitar', () => {
      const sala = souConvidado();
      if (!sala) return;
      sala.aceitos.add(socket);
      if (sala.aceitos.size === sala.players.length - 1) comecar(sala, socket, sala.code);
    });

    on('recusar', () => {
      const sala = souConvidado();
      if (!sala) return;
      sala.players = sala.players.filter((p) => p.socket !== socket);
      sala.proposta = false;
      socket.data.sala = null;
      socket.leave(sala.code);
      // Quem já tinha aceitado aceita de novo quando a mesa encher outra vez.
      for (const p of sala.players) p.socket.emit('recusada', { player: perfil(socket.data.user) });
      avisarMesa(sala);
    });

    /** Sinuca: o cliente honesto só manda tacada na vez dele. */
    const foraDaVez = (oque, dados) => {
      const sala = socket.data.sala;
      if (!sala?.matchId) return;
      gravar(sala.matchId, 'recusada', {
        assento: sala.players.findIndex((p) => p.socket === socket), dados,
        alerta: `Mandou ${oque} fora da vez`,
      });
    };

    const daVez = () => {
      const sala = socket.data.sala;
      return sala?.matchId && sala.players[sala.turn]?.socket === socket ? sala : null;
    };

    on('shot', (shot) => {
      if (arbitro) return;              // jogo de tabuleiro não tem tacada
      const sala = daVez();
      if (!sala) { foraDaVez('tacada', shot); return; }
      gravar(sala.matchId, 'tacada', { assento: sala.turn, dados: shot });
      // Volta pra sala inteira, inclusive quem tacou: os dois lados executam a
      // tacada pelo mesmo caminho de código e com o mesmo timing.
      io.to(sala.code).emit('shot', shot);
    });

    on('resolved', (snapshot) => {
      if (arbitro) return;
      const sala = daVez();
      if (!sala) { foraDaVez('resultado da tacada', snapshot); return; }
      gravar(sala.matchId, 'resolvido', { assento: sala.turn, dados: snapshot });
      const next = snapshot?.state?.current;
      if (next === 0 || next === 1) sala.turn = next;
      socket.to(sala.code).emit('resolved', snapshot);
    });

    // Cada lado relata o vencedor pela SUA simulação. Só paga quando os dois
    // dizem o mesmo — um cliente adulterado sozinho não consegue se declarar
    // vencedor, no máximo derruba a partida pra estorno.
    on('over', (report = {}) => {
      if (arbitro) return;              // aqui quem declara o fim é o servidor
      const sala = socket.data.sala;
      if (!sala?.matchId) return;
      const seat = sala.players.findIndex((p) => p.socket === socket);
      if (seat < 0 || report.winner !== 0 && report.winner !== 1) {
        gravar(sala.matchId, 'recusada', { assento: seat, dados: report, alerta: 'Relato de fim de partida inválido' });
        return;
      }
      sala.reports.set(seat, { winner: report.winner, potted: Number(report.potted) || 0 });
      gravar(sala.matchId, 'relato', { assento: seat, dados: sala.reports.get(seat) });
      if (sala.reports.size < sala.players.length) return;

      const [r0, r1] = [sala.reports.get(0), sala.reports.get(1)];
      const matchId = sala.matchId;
      sala.matchId = null;
      let resultado;
      if (r0.winner === r1.winner) {
        const stats = Object.fromEntries(sala.players.map((p, i) =>
          [p.user.id, { potted: sala.reports.get(i).potted }]));
        resultado = settleMatch(matchId, sala.players[r0.winner].user.id, stats);
      } else {
        refundMatch(matchId, 'disputed');
        resultado = { disputed: true };
      }
      gravar(matchId, 'fim', {
        assento: r0.winner === r1.winner ? r0.winner : null,
        dados: { relatos: [r0, r1], resultado },
        alerta: r0.winner === r1.winner ? null : 'Os dois lados disseram vencedores diferentes: partida contestada e estornada',
      });
      encerrarGravacao(matchId);
      for (const p of sala.players) {
        p.socket.emit('settled', { ...resultado, state: stateOf(p.user.id) });
      }
      sala.reports.clear();
      fechar(sala);   // partida encerrada: os dois voltam livres pro lobby
    });

    // Reação rápida na mesa: emoji de uma lista fixa, no máximo uma a cada 1,5s.
    // Só durante a partida, e vai pra mesa inteira (inclusive quem mandou).
    on('reacao', ({ emoji } = {}) => {
      const sala = socket.data.sala;
      if (!sala?.matchId || !REACOES.includes(emoji)) return;
      const agora = Date.now();
      if (agora - (socket.data.ultimaReacao ?? 0) < 1500) return;
      socket.data.ultimaReacao = agora;
      const assento = sala.players.findIndex((p) => p.socket === socket);
      io.to(sala.code).emit('reacao', { assento, emoji, de: socket.data.user.id });
    });

    // App em segundo plano (trocou de app, bloqueou a tela): a conexão costuma
    // seguir aberta e o servidor acharia que o jogador está na mesa. Se não
    // voltar em AUSENCIA_MS, é W.O. — e quem ficou é avisado da contagem.
    on('presenca', (visivel) => {
      const sala = socket.data.sala;
      const estava = !!socket.data.ausencia;
      clearTimeout(socket.data.ausencia);
      socket.data.ausencia = null;
      if (!sala?.matchId) return;
      const i = sala.players.findIndex((p) => p.socket === socket);
      const avisar = (msg) => { for (const p of sala.players) if (p.socket !== socket) p.socket?.emit('ausente', msg); };
      if (visivel === false) {
        gravar(sala.matchId, 'ausente', { assento: i });
        socket.data.ausencia = setTimeout(() => {
          try { if (socket.data.sala?.matchId) sair(socket, 'ausencia'); } catch (e) { console.error(`[${jogoId}] erro na ausência:`, e); }
        }, AUSENCIA_MS);
        avisar({ assento: i, segundos: Math.round(AUSENCIA_MS / 1000) });
      } else if (estava) {
        gravar(sala.matchId, 'voltou', { assento: i });
        avisar({ assento: i, voltou: true });
      }
    });
    // O app pergunta de tempos em tempos (e quando a internet volta) se ainda
    // está na partida. Caiu e voltou: o servidor já deu W.O. e este socket é
    // outro, então a resposta é não — e a tela sai da mesa congelada.
    on('conferir', (cb) => { if (typeof cb === 'function') cb({ naPartida: !!socket.data.sala?.matchId }); });
    on('leave', () => sair(socket, 'saiu'));
    on('disconnect', () => sair(socket, 'desconectou'));
  });

  return { rooms, filas };
}

export function listen(port, jogoId = process.env.JOGO || JOGO_PADRAO) {
  const jogo = jogoId === CHAT.id ? CHAT : jogoDe(jogoId);
  if (!jogo) throw new Error(`JOGO=${jogoId} não existe no catálogo`);
  port ??= Number(process.env.PORT) || jogo.porta;
  const plain = !!process.env.HTTP;
  const opts = plain ? {} : {
    key: readFileSync(new URL('../certs/key.pem', import.meta.url)),
    cert: readFileSync(new URL('../certs/cert.pem', import.meta.url)),
  };
  const handler = (req, res) => {
    api(req, res).then((tratado) => {
      if (!tratado) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('não é aqui'); }
    });
  };
  const http = plain ? createHttp(handler) : createServer(opts, handler);
  // Um caminho por jogo: o proxy manda cada um pro processo certo. Em produção
  // o front está em outro domínio, e o CORS_ORIGIN libera ele no polling.
  // Conexão morta (celular sem sinal, app fechado à força) não avisa: só o
  // ping descobre. O padrão (25s + 20s) deixava o adversário até 45s vendo um
  // fantasma na mesa; assim cai em no máximo ~30s.
  const io = new Server(http, {
    path: caminhoDe(jogo.id),
    pingInterval: PING_MS,
    pingTimeout: 20_000,
    ...(ORIGENS.length ? { cors: { origin: ORIGENS, methods: ['GET', 'POST'] } } : {}),
  });
  if (jogo === CHAT) attachChat(io);
  else attach(io, jogo.id);
  // Gravação velha sai uma vez por dia; um processo só cuida disso.
  if (jogo.id === JOGO_PADRAO) {
    const limpar = () => { try { limparGravacoes(); } catch (e) { console.error('[gravacao] limpeza:', e.message); } };
    limpar();
    setInterval(limpar, 86_400_000).unref();
  }
  // HOST=127.0.0.1 em produção: só o nginx fala com o processo.
  http.listen(port, process.env.HOST, () => console.log(
    `[${jogo.id}] api + socket.io ${plain ? 'http' : 'https'}://localhost:${port}${caminhoDe(jogo.id)}`));
  return { http, io };
}

if (import.meta.main) listen();
