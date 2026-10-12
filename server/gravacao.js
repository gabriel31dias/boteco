import { gzipSync, gunzipSync } from 'node:zlib';
import { all, one, run } from './db.js';
import { assentosDe, Erro } from './model.js';

/**
 * Gravação das partidas, pro admin conferir fraude e bug depois. Cada processo
 * de jogo grava as partidas dele; a sequência fica em memória porque a partida
 * vive num processo só (e morre com ele: restart estorna como `interrupted`).
 *
 * Gravar nunca pode derrubar a mesa: erro aqui só vai pro log.
 */

const seqs = new Map();   // match_id -> último seq

/** Dias que a gravação fica guardada. */
export const DIAS_GRAVACAO = Number(process.env.GRAVACAO_DIAS) || 90;

export function gravar(matchId, tipo, { assento = null, dados = null, visoes = null, alerta = null } = {}) {
  if (!matchId) return;
  try {
    const seq = (seqs.get(matchId) ?? 0) + 1;
    seqs.set(matchId, seq);
    run(`INSERT INTO gravacao (match_id, seq, t, tipo, assento, dados, visoes, alerta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      matchId, seq, Date.now(), tipo, assento,
      dados == null ? null : JSON.stringify(dados),
      visoes == null ? null : gzipSync(JSON.stringify(visoes)),
      alerta);
  } catch (e) {
    console.error(`[gravacao] partida ${matchId}, '${tipo}':`, e.message);
  }
}

/** Partida encerrada: o contador não precisa mais ficar na memória. */
export const encerrarGravacao = (matchId) => seqs.delete(matchId);

/** Eventos de uma partida, já abertos. */
export const eventosDe = (matchId) => all(
  'SELECT seq, t, tipo, assento, dados, visoes, alerta FROM gravacao WHERE match_id = ? ORDER BY seq', matchId,
).map((e) => ({
  seq: e.seq, t: e.t, tipo: e.tipo, assento: e.assento, alerta: e.alerta,
  dados: e.dados == null ? null : JSON.parse(e.dados),
  visoes: e.visoes == null ? null : JSON.parse(gunzipSync(e.visoes).toString()),
}));

/** Dias que o vídeo das telas fica guardado (pesa bem mais que os eventos). */
export const DIAS_TELA = Number(process.env.TELA_DIAS) || 30;

/** Apaga as gravações velhas. Roda num processo só (o da sinuca). */
export function limparGravacoes(dias = DIAS_GRAVACAO, diasTela = DIAS_TELA) {
  const r = run('DELETE FROM gravacao WHERE t < ?', Date.now() - dias * 86_400_000);
  const v = run('DELETE FROM tela WHERE criado < ?', Date.now() - diasTela * 86_400_000);
  return Number(r.changes) + Number(v.changes);
}

// ------------------------------------------------------- vídeo das telas

export const TELA_BLOCO_MAX = 1_900_000;        // gzip vindo do app (o nginx corta em 2 MB)
const TELA_ABERTO_MAX = 30_000_000;             // um bloco aberto
const TELA_POR_JOGADOR = 250_000_000;           // teto por jogador numa partida
const TELA_DEPOIS_DO_FIM = 2 * 60_000;          // o app ainda manda o último bloco

/**
 * Bloco da tela de um jogador. Só quem está sentado na partida manda, e só
 * enquanto ela corre (ou logo depois do fim). Repetido (mesmo seq) é ignorado.
 */
export function gravarTela(matchId, userId, seq, corpo, gzip) {
  matchId = Number(matchId); seq = Number(seq);
  if (!Number.isInteger(matchId) || !Number.isInteger(seq) || seq < 0) throw new Erro('Bloco inválido');
  const m = one('SELECT * FROM matches WHERE id = ?', matchId);
  if (!m || !assentosDe(m).includes(userId)) throw new Erro('Partida não é sua', 403);
  if (m.status !== 'playing' && !(m.ended_at && Date.now() - m.ended_at < TELA_DEPOIS_DO_FIM)) throw new Erro('Partida encerrada', 409);
  const usado = one('SELECT COALESCE(SUM(LENGTH(dados)), 0) n FROM tela WHERE match_id = ? AND user_id = ?', matchId, userId).n;
  if (usado + corpo.length > TELA_POR_JOGADOR) throw new Erro('Gravação cheia', 413);

  let texto;
  try { texto = (gzip ? gunzipSync(corpo, { maxOutputLength: TELA_ABERTO_MAX }) : corpo).toString(); } catch { throw new Erro('Bloco inválido'); }
  let eventos;
  try { eventos = JSON.parse(texto); } catch { throw new Erro('Bloco inválido'); }
  if (!Array.isArray(eventos) || !eventos.length || eventos.some((e) => !e || typeof e.type !== 'number' || typeof e.timestamp !== 'number')) {
    throw new Erro('Bloco inválido');
  }
  run(`INSERT OR IGNORE INTO tela (match_id, user_id, seq, t0, t1, cheio, bytes, dados, criado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    matchId, userId, seq, eventos[0].timestamp, eventos.at(-1).timestamp, eventos[0].type === 4 ? 1 : 0,
    texto.length, gzip ? corpo : gzipSync(texto), Date.now());
  return { ok: true };
}

/** Quem tem tela gravada nessa partida. */
export const telasDe = (matchId) => all(
  `SELECT user_id, COUNT(*) blocos, SUM(LENGTH(dados)) bytes, MIN(t0) de, MAX(t1) ate, MAX(criado) ultimo
     FROM tela WHERE match_id = ? GROUP BY user_id`, Number(matchId));

const LOTE_MAX = 6_000_000;   // aberto, por resposta: o admin pede o resto com `desde`

/**
 * Eventos da tela a partir do bloco `desde`. `aoVivo` sem `desde` começa no
 * último bloco com a tela inteira, que é de onde dá pra assistir.
 * Devolve o JSON pronto (os blocos já são JSON: só junta).
 */
export function telaJson(matchId, userId, { desde, aoVivo } = {}) {
  matchId = Number(matchId); userId = Number(userId);
  let de = Number(desde);
  if (!Number.isInteger(de) || de < 0) {
    de = aoVivo ? (one('SELECT MAX(seq) s FROM tela WHERE match_id = ? AND user_id = ? AND cheio = 1', matchId, userId).s ?? 0) : 0;
  }
  const partes = [];
  let tam = 0, proximo = de;
  for (const b of all('SELECT seq, bytes FROM tela WHERE match_id = ? AND user_id = ? AND seq >= ? ORDER BY seq', matchId, userId, de)) {
    if (b.seq !== proximo) break;                                // buraco: o bloco ainda não chegou
    if (partes.length && tam + b.bytes > LOTE_MAX) break;
    const { dados } = one('SELECT dados FROM tela WHERE match_id = ? AND user_id = ? AND seq = ?', matchId, userId, b.seq);
    partes.push(gunzipSync(dados).toString().slice(1, -1));      // tira os [ ]
    tam += b.bytes; proximo = b.seq + 1;
  }
  const m = one('SELECT status FROM matches WHERE id = ?', matchId);
  const temMais = !!one('SELECT 1 FROM tela WHERE match_id = ? AND user_id = ? AND seq >= ?', matchId, userId, proximo);
  return `{"proximo":${proximo},"temMais":${temMais},"aoVivo":${m?.status === 'playing'},"eventos":[${partes.filter(Boolean).join(',')}]}`;
}
