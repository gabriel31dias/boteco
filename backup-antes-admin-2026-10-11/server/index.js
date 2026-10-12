import { readFileSync } from 'node:fs';

// Credenciais do Pix ficam no .env (fora do git). Sem ele o app roda, só não
// gera cobrança.
try { process.loadEnvFile(); } catch { /* sem .env */ }

import { createServer } from 'node:https';
import { createServer as createHttp } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { api } from './api.js';
import { apostaPrivada, avatarUrl, emPartida, estornarOrfas, liberarAssento, openMatch, refundMatch, roomOf, saldoDisponivel, settleMatch, stateOf,
  userByToken } from './model.js';
import { CHAT, JOGO_PADRAO, caminhoDe, jogoDe } from './jogos.js';
import { attachChat } from './chat.js';
import { one } from './db.js';
import * as velha from './jogos/velha.js';
import * as domino from './jogos/domino.js';
import * as truco from './jogos/truco.js';
import * as damas from './jogos/damas.js';
import * as poker from './jogos/poker.js';
import * as buraco from './jogos/buraco.js';
import * as cacheta from './jogos/cacheta.js';

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
const ARBITROS = { velha, domino, truco, damas, 'truco-duplas': truco, 'domino-duplas': domino, poker, buraco, 'buraco-duplas': buraco, cacheta };

export function attach(io, jogoId = JOGO_PADRAO) {
  const jogo = jogoDe(jogoId);
  if (!jogo) throw new Error(`Jogo desconhecido: ${jogoId}`);
  const arbitro = jogo.arbitro === 'servidor' ? ARBITROS[jogo.id] : null;
  // Processo novo não tem mesa nenhuma: o que o banco diz estar em andamento
  // deste jogo é sobra de antes do restart.
  const orfas = estornarOrfas(jogo.id);
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
    for (const p of sala.players) { if (p.socket) { p.socket.data.sala = null; p.socket.leave(sala.code); } }
    if (filas.get(sala.type) === sala.code) filas.delete(sala.type);
    rooms.delete(sala.code);
  };

  /** Quem está na sala, em que time e quando ela abre: o lobby mostra isso. */
  const avisarMesa = (sala) => io.to(sala.code).emit('mesa', {
    code: sala.code, jogadores: MAX, minimo: MIN, duplas: DUPLAS,
    inicioEm: sala.inicioEm ?? null,
    premio: premioCom(sala, Math.max(sala.players.length, MIN)),
    players: sala.players.map((p) => ({ ...perfil(p.user), time: p.time })),
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

  /** Só nos jogos que o servidor arbitra: ele é o dono do estado. */
  function abrirTabuleiro(sala) {
    sala.partida = arbitro.novaPartida(sala.players.length, DUPLAS);
    sala.turn = sala.partida.vez;
    transmitir(sala);
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
    if (!sala.partida || sala.partida.fim) return;
    sala.relogio = setTimeout(() => {
      // Fora de handler de socket: um erro aqui derrubaria o processo.
      try {
        const r = arbitro.estourou(sala.partida);
        if (r) fecharJogada(sala, r);
      } catch (e) { console.error(`[${jogoId}] erro no relógio:`, e); }
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
    for (const jog of sala.players) {
      jog.socket?.emit('settled', { ...resultado, state: stateOf(jog.user.id) });
    }
    fechar(sala);
  }

  const sair = (socket) => {
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

    // Boundary: exceção em handler de socket derruba o processo inteiro (o
    // socket.io não isola). Com um jogo por processo isso já não contamina o
    // outro, mas o bug ainda tiraria todas as mesas deste aqui.
    const on = (evento, fn) => socket.on(evento, (...args) => {
      try { fn(...args); } catch (e) {
        console.error(`[${jogoId}] erro em '${evento}':`, e);
        socket.emit('denied', e.status ? e.message : 'Erro no servidor');
      }
    });

    on('join', (req = {}) => {
      if (socket.data.sala) return;
      const user = socket.data.user;
      const code = sanitize(req.code);
      const type = code ? 'privada' : String(req.roomType ?? '').replace(/^r_/, '');
      const room = roomOf(type);
      if (!room) return socket.emit('denied', 'Sala inválida');
      // Sentado numa partida aberta (outro jogo, ou um torneio de pôquer em que
      // ainda está vivo): entrar na fila só travaria a mesa dos outros no openMatch.
      if (emPartida(user.id)) return socket.emit('denied', 'Você ainda está numa partida em andamento');

      // Sala privada é pelo código; sala com valor é fila: pega quem espera.
      let alvo = code ? rooms.get(code) : rooms.get(filas.get(type));
      if (alvo && alvo.players.some((p) => p.user.id === user.id)) {
        return socket.emit('denied', 'Você já está nessa sala');
      }
      if (alvo && (alvo.players.length >= MAX || alvo.proposta || alvo.matchId)) {
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

      // Quanto custa entrar: a sala que já existe manda; criando, é o valor da
      // sala fixa ou a aposta que o dono da privada escolheu.
      let aposta;
      if (alvo) aposta = { stake: alvo.room.stake, prize: alvo.room.prize };
      else if (code) {
        try { aposta = apostaPrivada(req.stake); } catch (e) { return socket.emit('denied', e.message); }
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

      alvo.players.push({ socket, user, time });
      alvo.dono ??= socket;
      socket.data.sala = alvo;
      socket.join(alvo.code);
      socket.emit('joined', {
        code: alvo.code, you: alvo.players.length - 1, game: jogo.id, room: { type, ...alvo.room },
        time, jogadores: MAX,
      });
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

    /** Debita todos e manda todos pra mesa. */
    function comecar(alvo, socket, code) {
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
          players: alvo.players.map((x) => perfil(x.user)),
          room: { type: alvo.type, ...alvo.room },
          // A entrada foi debitada agora: manda o saldo junto, senão a carteira
          // do cliente fica mentindo até o fim da partida.
          state: stateOf(p.user.id),
        });
      }
      if (arbitro) abrirTabuleiro(alvo);
    }


    on('jogada', (acao = {}) => {
      const sala = socket.data.sala;
      if (!arbitro || !sala?.partida || !sala.matchId) return;
      const assento = sala.players.findIndex((p) => p.socket === socket);
      // Cada jogo define o formato da ação: a velha manda uma casa, o dominó
      // manda peça e ponta. O árbitro é quem sabe ler.
      // `= {}` não cobre null: payload que não é objeto vira ação vazia (o árbitro recusa).
      const r = arbitro.agir(sala.partida, assento, acao && typeof acao === 'object' ? acao : {});
      if (r) fecharJogada(sala, r);
    });

    const souConvidado = () => {
      const sala = socket.data.sala;
      return sala?.proposta && sala.dono !== socket && !sala.aceitos.has(socket) ? sala : null;
    };

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

    const daVez = () => {
      const sala = socket.data.sala;
      return sala?.matchId && sala.players[sala.turn]?.socket === socket ? sala : null;
    };

    on('shot', (shot) => {
      if (arbitro) return;              // jogo de tabuleiro não tem tacada
      const sala = daVez();
      if (!sala) return;
      // Volta pra sala inteira, inclusive quem tacou: os dois lados executam a
      // tacada pelo mesmo caminho de código e com o mesmo timing.
      io.to(sala.code).emit('shot', shot);
    });

    on('resolved', (snapshot) => {
      if (arbitro) return;
      const sala = daVez();
      if (!sala) return;
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
      if (seat < 0 || report.winner !== 0 && report.winner !== 1) return;
      sala.reports.set(seat, { winner: report.winner, potted: Number(report.potted) || 0 });
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

    on('leave', () => sair(socket));
    on('disconnect', () => sair(socket));
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
  // Um caminho por jogo: o proxy manda cada um pro processo certo, e o cliente
  // continua na mesma origem (sem CORS).
  const io = new Server(http, { path: caminhoDe(jogo.id) });
  if (jogo === CHAT) attachChat(io);
  else attach(io, jogo.id);
  http.listen(port, () => console.log(
    `[${jogo.id}] api + socket.io ${plain ? 'http' : 'https'}://localhost:${port}${caminhoDe(jogo.id)}`));
  return { http, io };
}

if (import.meta.main) listen();
