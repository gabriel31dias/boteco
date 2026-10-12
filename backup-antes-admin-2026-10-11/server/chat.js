import { all, one, run, tx } from './db.js';
import { ASSENTOS, Erro, avatarUrl, userByToken } from './model.js';
import { jogoDe } from './jogos.js';

/**
 * Chat e amizades. Roda num processo próprio (JOGO=chat, /ws/chat): um erro
 * aqui não derruba mesa nenhuma, e o socket do chat fica aberto o app inteiro,
 * enquanto o dos jogos troca de servidor a cada partida.
 *
 * O cliente não decide nada: quem pode mandar mensagem privada (só amigos), o
 * que pode ser dito (texto curto, com filtro) e o ritmo (limite de envio) são
 * conferidos aqui. Pedir amizade é livre: qualquer um pode pedir a qualquer um,
 * e quem não quer recusa ou bloqueia.
 */

export const TEXTO_MAX = 300;
export const GERAL_GUARDA = 100;     // o geral guarda só as últimas N
export const GERAL_ENVIA = 50;       // e quem entra recebe as N mais recentes
const RAJADA = { max: 5, janela: 10_000 };   // mensagens por usuário
const now = () => Date.now();

// ------------------------------------------------------------------ texto

// ponytail: lista curta e fixa, pega o grosso. Filtro de verdade (variações,
// contexto) é serviço de moderação; aumente a lista quando aparecer abuso.
const PALAVROES = ['porra', 'caralho', 'merda', 'puta', 'puto', 'buceta', 'foder', 'fodase', 'foda',
  'fdp', 'vsf', 'vtnc', 'tnc', 'arrombado', 'arrombada', 'viado', 'bosta', 'cacete', 'piroca',
  'cuzao', 'otario', 'otaria', 'desgracado', 'desgracada', 'vagabundo', 'vagabunda', 'corno'];
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

/** Troca palavrão por asteriscos, olhando a palavra sem acento e sem "leet". */
export function filtrar(texto) {
  return texto.replace(/[\p{L}\p{N}@$]+/gu, (palavra) => {
    const base = semAcento(palavra.toLowerCase()).replace(/[013457@$]/g, (c) => LEET[c]);
    return PALAVROES.some((p) => base === p || base.startsWith(p) && base.length <= p.length + 2)
      ? '*'.repeat(palavra.length) : palavra;
  });
}

/** Texto que o usuário mandou → texto que vai pro banco (ou erro). */
export function limpar(texto) {
  const t = String(texto ?? '').replace(/\s*\n\s*\n+/g, '\n').trim();
  if (!t) throw new Erro('Mensagem vazia');
  if (t.length > TEXTO_MAX) throw new Erro(`Máximo de ${TEXTO_MAX} caracteres`);
  return filtrar(t);
}

// --------------------------------------------------------------- pessoas

const perfilDe = (id) => {
  const u = one('SELECT id, name, username, level, avatar_v FROM users WHERE id = ?', id);
  return u && { id: u.id, name: u.name, username: u.username, level: u.level, avatar: avatarUrl(u) };
};
const par = (x, y) => (x < y ? [x, y] : [y, x]);
const amizadeDe = (x, y) => one('SELECT * FROM amizades WHERE a_id = ? AND b_id = ?', ...par(x, y));


/** Como `eu` enxerga a relação com `outro`. */
export function relacao(eu, outro) {
  const a = amizadeDe(eu, outro);
  if (!a) return 'nenhuma';
  if (a.status === 'aceita') return 'amigos';
  if (a.status === 'bloqueada') return a.bloqueador_id === eu ? 'bloqueei' : 'nenhuma';   // não revela o bloqueio
  return a.de_id === eu ? 'enviado' : 'recebido';
}

export const amigosDe = (eu) => all(
  `SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS id FROM amizades
   WHERE ? IN (a_id, b_id) AND status = 'aceita'`, eu, eu).map((r) => perfilDe(r.id));

export const pedidosPara = (eu) => all(
  `SELECT de_id FROM amizades WHERE ? IN (a_id, b_id) AND de_id != ? AND status = 'pendente'`, eu, eu)
  .map((r) => perfilDe(r.de_id));

export const bloqueadosPor = (eu) => all(
  `SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS id FROM amizades
   WHERE ? IN (a_id, b_id) AND status = 'bloqueada' AND bloqueador_id = ?`, eu, eu, eu).map((r) => r.id);

/** Quem jogou comigo nas últimas partidas, e a relação com cada um. */
export function recentesDe(eu, limite = 20) {
  const partidas = all(
    `SELECT ${ASSENTOS.join(', ')}, game, created_at FROM matches
     WHERE ? IN (${ASSENTOS.join(', ')}) ORDER BY id DESC LIMIT 40`, eu);
  const vistos = new Map();
  for (const m of partidas) {
    for (const id of ASSENTOS.map((c) => m[c])) {
      if (id == null || id === eu || vistos.has(id)) continue;
      vistos.set(id, { jogo: m.game, em: m.created_at });
    }
  }
  return [...vistos].slice(0, limite).map(([id, v]) => ({ ...perfilDe(id), ...v, relacao: relacao(eu, id) }))
    .filter((p) => p.id && p.relacao !== 'bloqueei');
}

// ------------------------------------------------------------- amizades

/** @returns {'enviado'|'amigos'} — se ele já tinha me pedido, vira amizade na hora */
export function pedirAmizade(eu, outro) {
  outro = Number(outro);
  if (!outro || outro === eu || !perfilDe(outro)) throw new Erro('Jogador não encontrado', 404);
  return tx(() => {
    const a = amizadeDe(eu, outro);
    if (a?.status === 'aceita') throw new Erro('Vocês já são amigos');
    if (a?.status === 'bloqueada') throw new Erro('Não foi possível enviar o pedido');
    if (a?.status === 'pendente' && a.de_id === eu) throw new Erro('Pedido já enviado');
    if (a?.status === 'pendente') {                 // ele tinha me pedido: aceito
      run(`UPDATE amizades SET status = 'aceita', updated_at = ? WHERE a_id = ? AND b_id = ?`, now(), ...par(eu, outro));
      return 'amigos';
    }
    run(`INSERT INTO amizades (a_id, b_id, de_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pendente', ?, ?)`,
      ...par(eu, outro), eu, now(), now());
    return 'enviado';
  });
}

/** Resposta ao pedido que `de` me mandou. Recusar apaga: dá pra pedir de novo depois. */
export function responderAmizade(eu, de, aceitar) {
  const a = amizadeDe(eu, Number(de));
  if (!a || a.status !== 'pendente' || a.de_id === eu) throw new Erro('Pedido não encontrado', 404);
  if (aceitar) run(`UPDATE amizades SET status = 'aceita', updated_at = ? WHERE a_id = ? AND b_id = ?`, now(), a.a_id, a.b_id);
  else run('DELETE FROM amizades WHERE a_id = ? AND b_id = ?', a.a_id, a.b_id);
  return aceitar ? 'amigos' : 'nenhuma';
}

export function desfazerAmizade(eu, outro) {
  const a = amizadeDe(eu, Number(outro));
  if (a && a.status !== 'bloqueada') run('DELETE FROM amizades WHERE a_id = ? AND b_id = ?', a.a_id, a.b_id);
}

/** Bloquear desfaz a amizade, impede pedido e mensagem, e esconde ele do meu geral. */
export function bloquear(eu, outro) {
  outro = Number(outro);
  if (!outro || outro === eu) throw new Erro('Jogador não encontrado', 404);
  run(`INSERT INTO amizades (a_id, b_id, de_id, status, bloqueador_id, created_at, updated_at)
       VALUES (?, ?, ?, 'bloqueada', ?, ?, ?)
       ON CONFLICT (a_id, b_id) DO UPDATE SET status = 'bloqueada', bloqueador_id = excluded.bloqueador_id,
         updated_at = excluded.updated_at`, ...par(eu, outro), eu, eu, now(), now());
}

export function desbloquear(eu, outro) {
  const a = amizadeDe(eu, Number(outro));
  if (a?.status === 'bloqueada' && a.bloqueador_id === eu) run('DELETE FROM amizades WHERE a_id = ? AND b_id = ?', a.a_id, a.b_id);
}

// ------------------------------------------------------------- mensagens

const msgDe = (m) => ({ id: m.id, canal: m.canal, de: perfilDe(m.de_id), para: m.para_id, texto: m.texto, em: m.created_at, lida: !!m.lida });

export function enviarGeral(eu, texto) {
  const ate = one('SELECT silenciado_ate FROM users WHERE id = ?', eu)?.silenciado_ate;
  if (ate && ate > now()) {
    const hora = new Date(ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    throw new Erro(`Você foi denunciado e está sem escrever no chat geral até ${hora}`);
  }
  const t = limpar(texto);
  return tx(() => {
    const { lastInsertRowid } = run(`INSERT INTO mensagens (canal, de_id, texto, created_at) VALUES ('geral', ?, ?, ?)`, eu, t, now());
    // Guarda só as últimas GERAL_GUARDA: o geral é conversa, não arquivo.
    run(`DELETE FROM mensagens WHERE canal = 'geral' AND id <= (
           SELECT id FROM mensagens WHERE canal = 'geral' ORDER BY id DESC LIMIT 1 OFFSET ?)`, GERAL_GUARDA);
    return msgDe(one('SELECT * FROM mensagens WHERE id = ?', Number(lastInsertRowid)));
  });
}

export const geralRecente = () => all(
  `SELECT * FROM mensagens WHERE canal = 'geral' ORDER BY id DESC LIMIT ?`, GERAL_ENVIA).reverse().map(msgDe);

export function enviarDM(eu, para, texto) {
  para = Number(para);
  if (relacao(eu, para) !== 'amigos') throw new Erro('Só dá pra mandar mensagem pra amigos');
  const t = limpar(texto);
  const { lastInsertRowid } = run(`INSERT INTO mensagens (canal, de_id, para_id, texto, created_at) VALUES ('dm', ?, ?, ?, ?)`,
    eu, para, t, now());
  return msgDe(one('SELECT * FROM mensagens WHERE id = ?', Number(lastInsertRowid)));
}

/** Conversa com um amigo, da mais antiga pra mais nova. `antes` pagina pra trás. */
export function conversa(eu, com, antes = null, limite = 50) {
  com = Number(com);
  return all(
    `SELECT * FROM mensagens WHERE canal = 'dm'
       AND ((de_id = ? AND para_id = ?) OR (de_id = ? AND para_id = ?))
       AND (? IS NULL OR id < ?)
     ORDER BY id DESC LIMIT ?`, eu, com, com, eu, antes, antes, limite).reverse().map(msgDe);
}

export const marcarLidas = (eu, de) =>
  run(`UPDATE mensagens SET lida = 1 WHERE canal = 'dm' AND para_id = ? AND de_id = ? AND lida = 0`, eu, Number(de));

/** Não lidas por amigo: { [amigoId]: n }. */
export const naoLidas = (eu) => Object.fromEntries(all(
  `SELECT de_id, COUNT(*) n FROM mensagens WHERE canal = 'dm' AND para_id = ? AND lida = 0 GROUP BY de_id`, eu)
  .map((r) => [r.de_id, r.n]));

// ------------------------------------------------------------- denúncias

export const MOTIVOS = ['ofensa', 'spam', 'golpe', 'outro'];
export const SILENCIO = { denuncias: 3, janela: 86_400_000, dura: 3_600_000 };   // 3 pessoas em 24h → 1h

/**
 * Denúncia de alguém do chat. Uma por pessoa denunciada a cada 24h (denunciar
 * de novo não soma). Com SILENCIO.denuncias pessoas diferentes na janela, o
 * denunciado fica SILENCIO.dura sem escrever no geral — até alguém da
 * moderação olhar a fila. @returns se o denunciado foi silenciado agora
 */
export function denunciar(eu, alvo, { mensagemId = null, motivo } = {}) {
  alvo = Number(alvo);
  if (!alvo || alvo === eu || !perfilDe(alvo)) throw new Erro('Jogador não encontrado', 404);
  if (!MOTIVOS.includes(motivo)) throw new Erro('Escolha um motivo');
  const desde = now() - SILENCIO.janela;
  if (one('SELECT 1 FROM denuncias WHERE de_id = ? AND alvo_id = ? AND created_at > ?', eu, alvo, desde)) {
    throw new Erro('Você já denunciou essa pessoa hoje');
  }
  // A cópia do texto fica com a denúncia: o geral apaga as mensagens antigas.
  const msg = mensagemId ? one('SELECT texto FROM mensagens WHERE id = ? AND de_id = ?', Number(mensagemId), alvo) : null;
  return tx(() => {
    run(`INSERT INTO denuncias (de_id, alvo_id, mensagem_id, texto, motivo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      eu, alvo, msg ? Number(mensagemId) : null, msg?.texto ?? null, motivo, now());
    const quantos = one(`SELECT COUNT(DISTINCT de_id) n FROM denuncias WHERE alvo_id = ? AND created_at > ? AND status = 'aberta'`,
      alvo, desde).n;
    if (quantos < SILENCIO.denuncias) return false;
    run('UPDATE users SET silenciado_ate = ? WHERE id = ?', now() + SILENCIO.dura, alvo);
    return true;
  });
}

// ------------------------------------------------------------ histórico

/**
 * Nós dois nas partidas que foram pagas: quantas, quantas eu ganhei. Nas
 * duplas vale o time (ganhar junto do parceiro conta como vitória).
 */
export function historicoContra(eu, com) {
  com = Number(com);
  const partidas = all(
    `SELECT * FROM matches WHERE status = 'settled'
       AND ? IN (${ASSENTOS.join(', ')}) AND ? IN (${ASSENTOS.join(', ')}) ORDER BY id DESC`, eu, com);
  let vitorias = 0;
  for (const m of partidas) {
    const lugares = ASSENTOS.map((c) => m[c]).filter((x) => x != null);
    const ganhei = jogoDe(m.game)?.duplas
      ? lugares.indexOf(m.winner_id) % 2 === lugares.indexOf(eu) % 2
      : m.winner_id === eu;
    if (ganhei) vitorias++;
  }
  return { partidas: partidas.length, vitorias, derrotas: partidas.length - vitorias, ultima: partidas[0]?.ended_at ?? null };
}

// --------------------------------------------------------------- convites

/**
 * Convite pra sala privada: só pra amigo, jogo do catálogo e código no mesmo
 * formato do servidor dos jogos (A-Z0-9, até 8). Não fica guardado: convite é
 * pra agora — se o amigo está offline, quem convidou fica sabendo.
 *
 * Revanche é a exceção: dá pra chamar quem acabou de jogar com você (partida
 * terminada nos últimos REVANCHE_MS), amigo ou não.
 */
export const REVANCHE_MS = 15 * 60_000;
export function montarConvite(eu, para, { jogo, code, stake, revanche } = {}) {
  para = Number(para);
  const acabaramDeJogar = revanche && !!one(
    `SELECT 1 FROM matches WHERE ended_at > ? AND ? IN (${ASSENTOS.join(', ')}) AND ? IN (${ASSENTOS.join(', ')}) LIMIT 1`,
    now() - REVANCHE_MS, eu, para);
  if (relacao(eu, para) !== 'amigos' && !acabaramDeJogar) {
    throw new Erro(revanche ? 'A revanche vale só logo depois da partida' : 'Só dá pra convidar amigos');
  }
  if (relacao(eu, para) === 'nenhuma' && amizadeDe(eu, para)?.status === 'bloqueada') throw new Erro('Não foi possível convidar');
  const j = jogoDe(jogo);
  if (!j) throw new Erro('Jogo inválido');
  const codigo = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!codigo) throw new Erro('Sala inválida');
  return { de: perfilDe(eu), jogo: j.id, nomeJogo: j.nome, code: codigo, stake: Math.max(0, Number(stake) || 0), revanche: !!revanche };
}

// --------------------------------------------------------------- socket

/**
 * Cada usuário tem uma sala `u:<id>` (pode estar com o app aberto em mais de
 * um aparelho). Toda ação responde por ack: `{ ok: true, ... }` ou `{ erro }`.
 */
/** O que dá pra dizer sobre onde a pessoa está (vem do app, é só informativo). */
export function limparPresenca({ estado, jogo, sala } = {}) {
  if (!['lobby', 'procurando', 'jogando'].includes(estado)) return { estado: 'lobby' };
  const j = jogoDe(jogo);
  const p = { estado, jogo: j?.id ?? null, nomeJogo: j?.nome ?? null };
  if (estado === 'procurando' && sala?.tipo === 'privada') {
    p.sala = { tipo: 'privada', code: String(sala.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) };
  } else if (estado === 'procurando' && sala?.tipo === 'fila') {
    p.sala = { tipo: 'fila', roomType: String(sala.roomType ?? '').replace(/[^a-z_]/g, '').slice(0, 20) };
  }
  return p;
}

export function attachChat(io) {
  const online = new Map();           // userId -> sockets abertos
  const presenca = new Map();         // userId -> { estado, jogo, sala }
  const rajadas = new Map();          // userId -> horários dos últimos envios
  const sala = (id) => `u:${id}`;

  /**
   * Limite de envio por usuário (somando todos os aparelhos). Confere antes e
   * conta só o que foi aceito: mensagem recusada (vazia, longa) não gasta cota.
   */
  const segurar = (id, fn) => {
    const agora = now();
    const recentes = (rajadas.get(id) ?? []).filter((t) => agora - t < RAJADA.janela);
    if (recentes.length >= RAJADA.max) throw new Erro('Calma aí: espere uns segundos pra mandar de novo');
    const r = fn();
    recentes.push(agora);
    rajadas.set(id, recentes);
    return r;
  };

  const avisarAmigos = (id, estaOnline) => {
    const p = estaOnline ? presenca.get(id) ?? { estado: 'lobby' } : null;
    for (const a of amigosDe(id)) io.to(sala(a.id)).emit('amigo:online', { id, online: estaOnline, presenca: p });
  };
  const listaAmigos = (id) => amigosDe(id).map((a) => ({
    ...a, online: online.has(a.id), presenca: online.has(a.id) ? presenca.get(a.id) ?? { estado: 'lobby' } : null,
  }));

  io.use((socket, next) => {
    const user = userByToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('Faça login pra usar o chat'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const eu = socket.data.user.id;
    socket.join(sala(eu));
    if (!online.has(eu)) { online.set(eu, new Set()); avisarAmigos(eu, true); }
    online.get(eu).add(socket);

    socket.emit('chat:inicio', {
      geral: geralRecente(),
      amigos: listaAmigos(eu),
      pedidos: pedidosPara(eu),
      naoLidas: naoLidas(eu),
      bloqueados: bloqueadosPor(eu),
    });

    // Mesmo boundary dos jogos: exceção em handler derrubaria o processo.
    const on = (evento, fn) => socket.on(evento, (dados = {}, ack) => {
      const responder = typeof ack === 'function' ? ack : () => {};
      try {
        responder({ ok: true, ...(fn(dados) ?? {}) });
      } catch (e) {
        if (!(e instanceof Erro)) console.error(`[chat] erro em '${evento}':`, e);
        responder({ erro: e instanceof Erro ? e.message : 'Erro no servidor' });
      }
    });

    on('geral:enviar', ({ texto }) => {
      io.emit('geral:msg', segurar(eu, () => enviarGeral(eu, texto)));
    });

    on('dm:enviar', ({ para, texto }) => {
      const m = segurar(eu, () => enviarDM(eu, para, texto));
      io.to(sala(eu)).to(sala(m.para)).emit('dm:msg', m);
      return { msg: m };
    });

    on('dm:conversa', ({ com, antes }) => {
      if (relacao(eu, Number(com)) !== 'amigos') throw new Erro('Só dá pra conversar com amigos');
      marcarLidas(eu, com);
      return { msgs: conversa(eu, com, antes ?? null) };
    });

    on('dm:lida', ({ de }) => { marcarLidas(eu, de); });

    on('recentes', () => ({ jogadores: recentesDe(eu) }));

    on('historico', ({ com }) => historicoContra(eu, com));

    on('denunciar', ({ id, mensagemId, motivo }) => ({ silenciado: segurar(eu, () => denunciar(eu, id, { mensagemId, motivo })) }));

    // O app conta onde a pessoa está; os amigos veem "jogando Truco" etc.
    on('presenca', (dados) => {
      presenca.set(eu, limparPresenca(dados));
      avisarAmigos(eu, true);
    });

    on('convite:enviar', ({ para, jogo, code, stake, revanche }) => {
      const c = segurar(eu, () => montarConvite(eu, para, { jogo, code, stake, revanche }));
      io.to(sala(Number(para))).emit('convite', c);
      return { online: online.has(Number(para)) };
    });

    on('relacao', ({ com }) => ({ relacao: relacao(eu, Number(com)) }));

    on('amizade:pedir', ({ id }) => {
      const r = segurar(eu, () => pedirAmizade(eu, id));
      const outro = Number(id);
      if (r === 'amigos') {
        io.to(sala(outro)).emit('amizade:aceita', { ...perfilDe(eu), online: true });
        return { relacao: r, amigo: { ...perfilDe(outro), online: online.has(outro) } };
      }
      io.to(sala(outro)).emit('amizade:pedido', perfilDe(eu));
      return { relacao: r };
    });

    on('amizade:responder', ({ id, aceitar }) => {
      const outro = Number(id);
      const r = responderAmizade(eu, outro, !!aceitar);
      if (r === 'amigos') io.to(sala(outro)).emit('amizade:aceita', { ...perfilDe(eu), online: true });
      return { relacao: r, amigo: r === 'amigos' ? { ...perfilDe(outro), online: online.has(outro) } : null };
    });

    on('amizade:desfazer', ({ id }) => {
      desfazerAmizade(eu, id);
      io.to(sala(Number(id))).emit('amizade:desfeita', { id: eu });
    });

    on('bloquear', ({ id }) => {
      bloquear(eu, id);
      io.to(sala(Number(id))).emit('amizade:desfeita', { id: eu });
      return { bloqueados: bloqueadosPor(eu) };
    });

    on('desbloquear', ({ id }) => { desbloquear(eu, id); return { bloqueados: bloqueadosPor(eu) }; });

    socket.on('disconnect', () => {
      const abertos = online.get(eu);
      abertos?.delete(socket);
      if (abertos && !abertos.size) { online.delete(eu); presenca.delete(eu); avisarAmigos(eu, false); }
    });
  });

  return { online };
}
