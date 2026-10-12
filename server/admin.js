import { all, one, run } from './db.js';
import { ASSENTOS, Erro, auditoria } from './model.js';

/** Moderação e conferência do dinheiro. Quem pode: ver `exigirAdmin` em painel.js. */

const nome = (id) => one('SELECT name, username FROM users WHERE id = ?', id);

/** Tudo que o painel mostra numa chamada: denúncias abertas, partidas a olhar e a auditoria. */
export function resumo() {
  const denuncias = all(
    `SELECT d.*, a.silenciado_ate FROM denuncias d JOIN users a ON a.id = d.alvo_id
     WHERE d.status = 'aberta' ORDER BY d.id DESC LIMIT 100`).map((d) => ({
    id: d.id, motivo: d.motivo, texto: d.texto, em: d.created_at,
    de: { id: d.de_id, ...nome(d.de_id) }, alvo: { id: d.alvo_id, ...nome(d.alvo_id) },
    silenciadoAte: d.silenciado_ate,
    // quantas pessoas diferentes denunciaram o mesmo alvo e ainda estão abertas
    total: one(`SELECT COUNT(DISTINCT de_id) n FROM denuncias WHERE alvo_id = ? AND status = 'aberta'`, d.alvo_id).n,
  }));
  // Contestadas (sinuca: os dois relataram vencedores diferentes) e interrompidas
  // (servidor caiu com a mesa aberta): as duas foram estornadas — é pra conferir.
  const partidas = all(
    `SELECT * FROM matches WHERE status IN ('disputed', 'interrupted') ORDER BY id DESC LIMIT 50`).map((m) => ({
    id: m.id, jogo: m.game, sala: m.room_type, code: m.code, status: m.status, stake: m.stake,
    em: m.ended_at ?? m.created_at,
    jogadores: ASSENTOS.map((c) => m[c]).filter((x) => x != null).map((id) => ({ id, ...nome(id) })),
  }));
  return { denuncias, partidas, auditoria: auditoria(), agora: Date.now() };
}

/** Decisão sobre uma denúncia. Resolver/descartar vale pra todas as abertas do mesmo alvo. */
export function decidir(id, acao) {
  const d = one('SELECT * FROM denuncias WHERE id = ?', Number(id));
  if (!d) throw new Erro('Denúncia não encontrada', 404);
  if (acao === 'descartar') {
    run(`UPDATE denuncias SET status = 'descartada' WHERE alvo_id = ? AND status = 'aberta'`, d.alvo_id);
    run('UPDATE users SET silenciado_ate = NULL WHERE id = ?', d.alvo_id);   // silêncio automático era por causa delas
  } else if (acao === 'silenciar') {
    run(`UPDATE denuncias SET status = 'resolvida' WHERE alvo_id = ? AND status = 'aberta'`, d.alvo_id);
    run('UPDATE users SET silenciado_ate = ? WHERE id = ?', Date.now() + 86_400_000, d.alvo_id);
  } else {
    throw new Erro('Ação inválida');
  }
  return resumo();
}
