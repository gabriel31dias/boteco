import { io } from 'socket.io-client';
import { token } from './api.js';

// Um socket para a sessão inteira: o lobby entra na sala e a partida usa a
// mesma conexão. Reconectar entre as duas telas faria o servidor ver um
// jogador novo tentando entrar numa sala que ele já considera cheia.
let socket = null;
const ouvintes = new Map();      // evento -> Set<fn>
const fila = new Map();          // evento -> payloads que chegaram sem ouvinte

const EM_FILA = new Set(['shot', 'resolved', 'estado', 'settled', 'left', 'start', 'denied',
  'proposta', 'convidado', 'recusada', 'mesa']);   // reação velha não se guarda

function entregar(evento, payload) {
  const fns = ouvintes.get(evento);
  if (fns?.size) { for (const fn of [...fns]) fn(payload); return; }
  if (EM_FILA.has(evento)) {
    if (!fila.has(evento)) fila.set(evento, []);
    fila.get(evento).push(payload);
  }
}

// Cada jogo roda no seu processo, com seu caminho de socket. Uma conexão por
// vez: entrar num jogo derruba a do outro, e é isso que garante que ninguém
// fica em duas filas ao mesmo tempo.
let jogoAtual = null;

export const net = {
  get socket() { return socket; },
  get conectado() { return !!socket?.connected; },
  get jogo() { return jogoAtual; },

  connect(jogo = 'sinuca') {
    if (socket && jogoAtual === jogo) return socket;
    if (socket) net.disconnect();
    jogoAtual = jogo;
    socket = io({ path: `/ws/${jogo}`, auth: { token }, transports: ['websocket', 'polling'] });
    // Lista fixa: evento que não estiver aqui nunca chega em quem escuta.
    for (const ev of ['joined', 'denied', 'proposta', 'convidado', 'recusada',
      'start', 'shot', 'resolved', 'estado', 'settled', 'left', 'mesa', 'reacao']) {
      socket.on(ev, (p) => entregar(ev, p));
    }
    socket.on('connect_error', (e) => entregar('erro', e.message));
    return socket;
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
    jogoAtual = null;
    fila.clear();
    // ouvintes NÃO são limpos: quem se inscreveu cancela no próprio unmount, e
    // apagar aqui deixaria o app surdo depois de um relogin.
  },

  /** @returns {() => void} função pra cancelar a inscrição */
  on(evento, fn) {
    if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
    ouvintes.get(evento).add(fn);
    const atrasados = fila.get(evento);
    if (atrasados?.length) { fila.delete(evento); for (const p of atrasados) fn(p); }
    return () => ouvintes.get(evento)?.delete(fn);
  },

  emit(evento, payload) { socket?.emit(evento, payload); },
  /** `req.game` escolhe o servidor; o resto vai pro socket daquele jogo. */
  join({ game = 'sinuca', ...req }) {
    // Partida nova não pode receber evento guardado da anterior: o placar da
    // velha voltava pra tela com o resultado do jogo passado.
    fila.clear();
    net.connect(game);
    socket.emit('join', req);
  },
  /** Ação de jogo: o formato é do jogo (velha: {casa}; dominó: {tipo,id,side}). */
  jogada(acao) { socket?.emit('jogada', acao); },
  leave() { socket?.emit('leave'); },
};
