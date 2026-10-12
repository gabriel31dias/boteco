import { io } from 'socket.io-client';
import { token } from './api.js';

/**
 * Socket do chat: um só, aberto do login ao logout — diferente do `net.js`,
 * que troca de servidor a cada jogo. Cada pedido espera a resposta do servidor
 * (ack): `pedir()` resolve com os dados ou rejeita com a mensagem de erro.
 */
let socket = null;
const ouvintes = new Map();      // evento -> Set<fn>

const EVENTOS = ['chat:inicio', 'geral:msg', 'dm:msg', 'amizade:pedido', 'amizade:aceita',
  'amizade:desfeita', 'amigo:online', 'convite'];

export const chat = {
  get conectado() { return !!socket?.connected; },

  conectar() {
    if (socket || !token) return;
    socket = io({ path: '/ws/chat', auth: { token }, transports: ['websocket', 'polling'] });
    for (const ev of EVENTOS) socket.on(ev, (p) => { for (const fn of [...(ouvintes.get(ev) ?? [])]) fn(p); });
  },

  desconectar() {
    socket?.disconnect();
    socket = null;
  },

  /** @returns {() => void} cancela a inscrição */
  on(evento, fn) {
    if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
    ouvintes.get(evento).add(fn);
    return () => ouvintes.get(evento)?.delete(fn);
  },

  /** Pede e espera a resposta. Sem conexão, falha em 8s em vez de pendurar. */
  pedir(evento, dados = {}) {
    return new Promise((ok, falha) => {
      if (!socket) { falha(new Error('Chat desconectado')); return; }
      socket.timeout(8000).emit(evento, dados, (err, r) => {
        if (err) falha(new Error('O chat não respondeu'));
        else if (r?.erro) falha(new Error(r.erro));
        else ok(r ?? {});
      });
    });
  },
};
