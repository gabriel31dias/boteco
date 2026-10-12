import { randomBytes } from 'node:crypto';
import { all, one, run, tx } from './db.js';
import { JOGOS, jogoDe } from './jogos.js';
import { regras } from './config.js';
import { eventosDe, telasDe } from './gravacao.js';
import { Erro, aprovarSaque, assentosDe, auditoria, avatarUrl, cancelarSaque, criarContaVerificada, darBonus,
  ehAdmin, logTx, toCents, trocarSenha } from './model.js';

/**
 * Painel do admin e do influencer (contrato em docs/ADMIN-API.md). Aqui só
 * leitura e as ações do painel; a regra do dinheiro mora em model.js.
 * Banco em centavos e ms; o painel recebe reais.
 */

export function exigirAdmin(u) {
  if (!ehAdmin(u)) throw new Erro('Só administradores', 403);
}

const R = (c) => (c ?? 0) / 100;
const agora = () => Date.now();
const SITE = process.env.SITE_URL ?? 'https://joggpix.com';
const DUPLAS = Object.values(JOGOS).filter((j) => j.duplas).map((j) => `'${j.id}'`).join(', ');
const nomeJogo = (id) => jogoDe(id)?.nome ?? id;

// ------------------------------------------------------------------ período

const DIA = 86_400_000;
const SP = 3 * 3_600_000;   // São Paulo, UTC−3 (sem horário de verão desde 2019)

/** 'AAAA-MM-DD' (dia de São Paulo) → ms do começo do dia. */
function diaSP(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) + SP;
}
const ymd = (ms) => new Date(ms - SP).toISOString().slice(0, 10);

/** {ini, fim} em ms; sem `de`/`ate`, o período inteiro. */
function periodo(q, padraoDias = null) {
  let ini = diaSP(q.de);
  let fim = diaSP(q.ate);
  if (ini == null && padraoDias) ini = diaSP(ymd(agora())) - (padraoDias - 1) * DIA;
  if (fim == null && padraoDias) fim = diaSP(ymd(agora()));
  if (fim != null) fim += DIA;
  if (ini != null && fim != null && fim - ini > 400 * DIA) throw new Erro('Período grande demais (máximo 1 ano)');
  return { ini: ini ?? 0, fim: fim ?? agora() + DIA };
}

function paginar(q) {
  const pagina = Math.max(1, Math.floor(Number(q.pagina) || 1));
  const porPagina = Math.min(100, Math.max(1, Math.floor(Number(q.porPagina) || 20)));
  return { pagina, porPagina, offset: (pagina - 1) * porPagina };
}

const like = (s) => `%${String(s).trim().replace(/[%_]/g, '')}%`;

// ------------------------------------------------------------------ pedaços

const SEATS = `(2 + (m.c_id IS NOT NULL) + (m.d_id IS NOT NULL))`;
const POTE = `(m.stake * ${SEATS})`;

/** Dono da partida na lista: nome e @ de cada assento, com quem venceu. */
function jogadoresDe(m) {
  const assentos = assentosDe(m);
  const lado = m.winner_id != null ? assentos.indexOf(m.winner_id) % 2 : -1;
  const duplas = !!jogoDe(m.game)?.duplas;
  return assentos.map((id, i) => {
    const u = one('SELECT name, username FROM users WHERE id = ?', id);
    const venceu = m.status === 'settled' && (duplas ? i % 2 === lado : id === m.winner_id);
    return { id, nome: u?.name ?? '?', username: u?.username ?? '', venceu };
  });
}

const STATUS_PIX = (c) => (c.status === 'paid' ? 'pago'
  : c.status === 'pending' && c.expires_at > agora() ? 'pendente' : 'expirado');

const deposito = (c) => ({
  id: c.external_id, userId: c.user_id, nome: c.name, email: c.email, valor: R(c.amount),
  status: STATUS_PIX(c), criadoEm: c.created_at, pagoEm: c.paid_at,
});

const somaBonus = (where, ...args) => {
  const porTipo = {};
  for (const t of ['cadastro', 'manual', 'link', 'indicacao', 'conversao']) porTipo[t] = { quantidade: 0, valor: 0 };
  let valor = 0;
  for (const r of all(`SELECT tipo, COUNT(*) n, SUM(valor) v FROM bonus b WHERE ${where} GROUP BY tipo`, ...args)) {
    porTipo[r.tipo] = { quantidade: r.n, valor: R(r.v) };
    valor += r.v;
  }
  return { valor: R(valor), porTipo };
};

// ---------------------------------------------------------------- dashboard

export function dashboard(q) {
  const { ini, fim } = periodo(q, 7);
  const jogo = q.jogo && jogoDe(q.jogo) ? q.jogo : null;
  const fJogo = jogo ? 'AND m.game = ?' : '';
  const aJogo = jogo ? [jogo] : [];
  const umDia = fim - ini <= DIA;

  // Depósitos: pagos pela hora do pagamento; conversão pelos criados no período.
  const pagos = one(`SELECT COUNT(*) n, COALESCE(SUM(amount), 0) v, COUNT(DISTINCT user_id) c
                     FROM pix_charges WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?`, ini, fim);
  const criados = one(`SELECT COUNT(*) n, SUM(status = 'paid') p FROM pix_charges WHERE created_at >= ? AND created_at < ?`, ini, fim);
  const pend = one(`SELECT COUNT(*) n, COALESCE(SUM(amount), 0) v FROM pix_charges
                    WHERE status = 'pending' AND expires_at > ? AND created_at >= ? AND created_at < ?`, agora(), ini, fim);

  const p = one(`SELECT COUNT(*) n, COALESCE(SUM(${POTE}), 0) pote, COALESCE(SUM(m.rake), 0) taxa
                 FROM matches m WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? ${fJogo}`, ini, fim, ...aJogo);
  const jogadores = one(`SELECT COUNT(DISTINCT id) n FROM (
      SELECT a_id id FROM matches m WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? ${fJogo}
      UNION SELECT b_id FROM matches m WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? ${fJogo}
      UNION SELECT c_id FROM matches m WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? ${fJogo}
      UNION SELECT d_id FROM matches m WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? ${fJogo})
    WHERE id IS NOT NULL`, ...[0, 1, 2, 3].flatMap(() => [ini, fim, ...aJogo])).n;
  const estornadas = one(`SELECT COUNT(*) n FROM matches m WHERE m.status IN ('refunded', 'disputed', 'interrupted')
                          AND m.ended_at >= ? AND m.ended_at < ? ${fJogo}`, ini, fim, ...aJogo).n;

  const b = somaBonus('b.criado_em >= ? AND b.criado_em < ?', ini, fim).porTipo;
  const influencers = one(`SELECT COALESCE(SUM(valor), 0) v FROM inf_comissoes WHERE criado_em >= ? AND criado_em < ?`, ini, fim).v;
  const custos = {
    bonus: b.cadastro.valor + b.manual.valor + b.link.valor,
    conversao: b.conversao.valor,
    indicacoes: b.indicacao.valor,
    influencers: R(influencers),
  };
  custos.total = Math.round((custos.bonus + custos.conversao + custos.indicacoes + custos.influencers) * 100) / 100;

  const aprov = one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM saques
                     WHERE status = 'aprovado' AND decidido_em >= ? AND decidido_em < ?`, ini, fim);
  const sPend = one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM saques WHERE status = 'pendente'`);
  const carteiras = one('SELECT SUM(balance) s, SUM(bonus) b, SUM(locked) l FROM users');

  // Série: balde por hora (um dia só) ou por dia.
  const passo = umDia ? 3_600_000 : DIA;
  const baldes = [];
  for (let t = ini; t < fim; t += passo) {
    baldes.push({
      rotulo: umDia ? `${String(new Date(t - SP).getUTCHours()).padStart(2, '0')}h` : ymd(t).slice(5).split('-').reverse().join('/'),
      depositos: 0, taxa: 0, custos: 0, lucroLiquido: 0, partidas: 0,
    });
  }
  const balde = (t) => baldes[Math.floor((t - ini) / passo)];
  for (const r of all(`SELECT paid_at t, amount v FROM pix_charges WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?`, ini, fim)) {
    const x = balde(r.t); if (x) x.depositos += r.v;
  }
  for (const r of all(`SELECT ended_at t, rake v FROM matches m WHERE status = 'settled' AND ended_at >= ? AND ended_at < ? ${fJogo}`, ini, fim, ...aJogo)) {
    const x = balde(r.t); if (x) { x.taxa += r.v ?? 0; x.partidas++; }
  }
  for (const r of all(`SELECT criado_em t, valor v FROM bonus WHERE criado_em >= ? AND criado_em < ?
                       UNION ALL SELECT criado_em, valor FROM inf_comissoes WHERE criado_em >= ? AND criado_em < ?`, ini, fim, ini, fim)) {
    const x = balde(r.t); if (x) x.custos += r.v;
  }
  for (const x of baldes) {
    x.lucroLiquido = R(x.taxa - x.custos);
    x.depositos = R(x.depositos); x.taxa = R(x.taxa); x.custos = R(x.custos);
  }

  const porJogo = all(`SELECT m.game, COUNT(*) n, SUM(${POTE}) pote, SUM(m.rake) taxa FROM matches m
                       WHERE m.status = 'settled' AND m.ended_at >= ? AND m.ended_at < ? GROUP BY m.game ORDER BY taxa DESC`, ini, fim)
    .map((r) => ({
      jogo: r.game, nome: nomeJogo(r.game), partidas: r.n, apostado: R(r.pote), premios: R(r.pote - r.taxa), taxa: R(r.taxa),
      jogadores: one(`SELECT COUNT(DISTINCT id) n FROM (SELECT a_id id, game, status, ended_at FROM matches UNION ALL
          SELECT b_id, game, status, ended_at FROM matches UNION ALL SELECT c_id, game, status, ended_at FROM matches
          UNION ALL SELECT d_id, game, status, ended_at FROM matches)
        WHERE id IS NOT NULL AND game = ? AND status = 'settled' AND ended_at >= ? AND ended_at < ?`, r.game, ini, fim).n,
    }));

  const taxa = R(p.taxa);
  return {
    periodo: { de: ymd(ini), ate: ymd(fim - 1), granularidade: umDia ? 'hora' : 'dia' },
    depositos: {
      valor: R(pagos.v), quantidade: pagos.n, ticketMedio: pagos.n ? R(pagos.v) / pagos.n : 0, clientes: pagos.c,
      conversao: criados.n ? (criados.p ?? 0) / criados.n : 0,
      pendentes: { quantidade: pend.n, valor: R(pend.v) },
    },
    partidas: { quantidade: p.n, apostado: R(p.pote), premios: R(p.pote - p.taxa), taxa, jogadores, estornadas },
    custos,
    lucroLiquido: Math.round((taxa - custos.total) * 100) / 100,
    saques: { aprovados: { quantidade: aprov.n, valor: R(aprov.v) }, pendentes: { quantidade: sPend.n, valor: R(sPend.v) } },
    caixa: R(pagos.v - aprov.v),
    saldoJogadores: { saldo: R(carteiras.s), bonus: R(carteiras.b), travado: R(carteiras.l) },
    jogandoAgora: one(`SELECT COUNT(*) n FROM matches WHERE status = 'playing'`).n,
    alertas: auditoria().length,
    serie: baldes,
    porJogo,
    ultimosDepositos: all(`SELECT c.*, u.name, u.email FROM pix_charges c JOIN users u ON u.id = c.user_id
                           ORDER BY c.created_at DESC LIMIT 8`).map(deposito),
  };
}

/** Jogadores da partida e o que cada um tem de vídeo da tela. */
export function telas(id) {
  const m = one('SELECT * FROM matches WHERE id = ?', Number(id));
  if (!m) throw new Erro('Partida não encontrada', 404);
  const gravado = new Map(telasDe(m.id).map((t) => [t.user_id, t]));
  return {
    aoVivo: m.status === 'playing', jogo: m.game,
    jogadores: jogadoresDe(m).map((j) => {
      const t = gravado.get(j.id);
      return { ...j, blocos: t?.blocos ?? 0, bytes: t?.bytes ?? 0, de: t?.de ?? null, ate: t?.ate ?? null, ultimo: t?.ultimo ?? null };
    }),
  };
}

export const aoVivo = () => ({
  partidas: all(`SELECT * FROM matches m WHERE status = 'playing' ORDER BY created_at DESC LIMIT 200`).map((m) => ({
    id: m.id, jogo: m.game, sala: m.room_type, codigo: m.code, aposta: R(m.stake), pote: R(m.stake * assentosDe(m).length),
    jogadores: jogadoresDe(m).map(({ id, nome, username }) => ({ id, nome, username })), desde: m.created_at,
  })),
});

// ---------------------------------------------------------------- depósitos

export function depositos(q) {
  const { ini, fim } = periodo(q);
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['c.created_at >= ?', 'c.created_at < ?'];
  const a = [ini, fim];
  if (q.status === 'pago') w.push(`c.status = 'paid'`);
  else if (q.status === 'pendente') { w.push(`c.status = 'pending' AND c.expires_at > ?`); a.push(agora()); }
  else if (q.status === 'expirado') { w.push(`(c.status = 'expired' OR (c.status = 'pending' AND c.expires_at <= ?))`); a.push(agora()); }
  if (q.q) { w.push('(u.name LIKE ? OR u.email LIKE ? OR c.external_id LIKE ?)'); a.push(like(q.q), like(q.q), like(q.q)); }
  if (Number(q.min) > 0) { w.push('c.amount >= ?'); a.push(Math.round(Number(q.min) * 100)); }
  if (Number(q.max) > 0) { w.push('c.amount <= ?'); a.push(Math.round(Number(q.max) * 100)); }
  const where = w.join(' AND ');
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(c.amount), 0) v FROM pix_charges c JOIN users u ON u.id = c.user_id WHERE ${where}`, ...a);
  return {
    itens: all(`SELECT c.*, u.name, u.email FROM pix_charges c JOIN users u ON u.id = c.user_id WHERE ${where}
                ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, ...a, porPagina, offset).map(deposito),
    total: tot.n, pagina, porPagina, soma: R(tot.v),
  };
}

// ------------------------------------------------------------------- saques

/** Resultado das partidas pagas de um jogador: quanto entrou, quanto ganhou, taxa que gerou. */
function resultadoDe(userId) {
  let apostado = 0, ganho = 0, taxa = 0, partidas = 0, vitorias = 0;
  const porJogo = new Map();
  for (const m of all(`SELECT * FROM matches WHERE status = 'settled' AND ? IN (a_id, b_id, c_id, d_id)`, userId)) {
    const assentos = assentosDe(m);
    const lado = assentos.indexOf(m.winner_id) % 2;
    const venceu = assentos.indexOf(userId) % 2 === lado
      && (jogoDe(m.game)?.duplas || m.winner_id === userId);
    const g = porJogo.get(m.game) ?? { jogo: m.game, nome: nomeJogo(m.game), partidas: 0, vitorias: 0, apostado: 0, ganho: 0 };
    g.partidas++; partidas++;
    if (venceu) { g.vitorias++; vitorias++; }
    if (m.stake) {
      g.apostado += m.stake; apostado += m.stake;
      if (venceu) { g.ganho += m.prize; ganho += m.prize; }
      taxa += Math.floor((m.rake ?? 0) / assentos.length);
    }
    porJogo.set(m.game, g);
  }
  return {
    partidas, vitorias, apostado, ganho, taxa,
    porJogo: [...porJogo.values()].map((g) => ({ ...g, apostado: R(g.apostado), ganho: R(g.ganho), resultado: R(g.ganho - g.apostado) })),
  };
}

function conferencia(s) {
  const r = resultadoDe(s.user_id);
  return {
    depositado: R(one(`SELECT COALESCE(SUM(amount), 0) v FROM pix_charges WHERE user_id = ? AND status = 'paid'`, s.user_id).v),
    jaSacado: R(one(`SELECT COALESCE(SUM(valor), 0) v FROM saques WHERE user_id = ? AND status = 'aprovado' AND id <> ?`, s.user_id, s.id).v),
    resultadoPartidas: R(r.ganho - r.apostado),
    taxaPaga: R(r.taxa),
    bonusRecebido: R(one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus WHERE user_id = ?`, s.user_id).v),
    saldoAgora: R(one('SELECT balance FROM users WHERE id = ?', s.user_id)?.balance),
  };
}

export function saques(q) {
  const { ini, fim } = periodo(q);
  const { pagina, porPagina, offset } = paginar(q);
  const status = q.status || 'pendente';
  const w = ['s.criado_em >= ?', 's.criado_em < ?'];
  const a = [ini, fim];
  if (status !== 'todos') { w.push('s.status = ?'); a.push(status); }
  if (q.q) { w.push('(u.name LIKE ? OR u.email LIKE ? OR s.chave_pix LIKE ?)'); a.push(like(q.q), like(q.q), like(q.q)); }
  const where = w.join(' AND ');
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(s.valor), 0) v FROM saques s JOIN users u ON u.id = s.user_id WHERE ${where}`, ...a);
  const pend = one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM saques WHERE status = 'pendente'`);
  return {
    itens: all(`SELECT s.*, u.name, u.email FROM saques s JOIN users u ON u.id = s.user_id WHERE ${where}
                ORDER BY s.criado_em ${status === 'pendente' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`, ...a, porPagina, offset)
      .map((s) => ({
        id: s.id, userId: s.user_id, nome: s.name, email: s.email, chavePix: s.chave_pix, tipoChave: s.tipo_chave,
        valor: R(s.valor), status: s.status, motivo: s.motivo, criadoEm: s.criado_em, decididoEm: s.decidido_em,
        decididoPor: s.decidido_por, conferencia: conferencia(s),
      })),
    total: tot.n, pagina, porPagina, soma: R(tot.v),
    pendentes: { quantidade: pend.n, valor: R(pend.v) },
  };
}

export { aprovarSaque, cancelarSaque };

// ----------------------------------------------------------------- partidas

export function partidas(q) {
  const { ini, fim } = periodo(q);
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['m.created_at >= ?', 'm.created_at < ?'];
  const a = [ini, fim];
  if (q.jogo && jogoDe(q.jogo)) { w.push('m.game = ?'); a.push(q.jogo); }
  if (q.status) { w.push('m.status = ?'); a.push(q.status); }
  if (q.sala) { w.push('m.room_type = ?'); a.push(q.sala); }
  if (q.q) {
    const ids = all('SELECT id FROM users WHERE name LIKE ? OR username LIKE ? OR email LIKE ? LIMIT 200',
      like(q.q), like(q.q), like(q.q)).map((u) => u.id);
    if (!ids.length) return { itens: [], total: 0, pagina, porPagina, soma: { apostado: 0, premios: 0, taxa: 0 } };
    const l = ids.join(', ');
    w.push(`(m.a_id IN (${l}) OR m.b_id IN (${l}) OR m.c_id IN (${l}) OR m.d_id IN (${l}))`);
  }
  const where = w.join(' AND ');
  const tot = one(`SELECT COUNT(*) n,
      COALESCE(SUM(CASE WHEN m.status = 'settled' THEN ${POTE} END), 0) pote, COALESCE(SUM(m.rake), 0) taxa
    FROM matches m WHERE ${where}`, ...a);
  return {
    itens: all(`SELECT * FROM matches m WHERE ${where} ORDER BY m.id DESC LIMIT ? OFFSET ?`, ...a, porPagina, offset).map((m) => ({
      id: m.id, jogo: m.game, sala: m.room_type, codigo: m.code, status: m.status, aposta: R(m.stake),
      pote: R(m.stake * assentosDe(m).length), premio: R(m.prize), taxa: R(m.rake ?? 0),
      jogadores: jogadoresDe(m), criadoEm: m.created_at, encerradaEm: m.ended_at,
    })),
    total: tot.n, pagina, porPagina, soma: { apostado: R(tot.pote), premios: R(tot.pote - tot.taxa), taxa: R(tot.taxa) },
  };
}

// ---------------------------------------------------------------- gravações

/** Recusadas a partir daqui numa partida viram alerta: clique duplo não chega nisso. */
const RECUSADAS_SUSPEITAS = 5;

const ASSENTO_IN = (l) => ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => `m.${c}_id IN (${l})`).join(' OR ');

/** Partidas que têm gravação, com a contagem de eventos e alertas. */
export function gravacoes(q) {
  const { ini, fim } = periodo(q);
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['m.created_at >= ?', 'm.created_at < ?'];
  const a = [ini, fim];
  if (q.jogo && jogoDe(q.jogo)) { w.push('m.game = ?'); a.push(q.jogo); }
  if (q.status) { w.push('m.status = ?'); a.push(q.status); }
  if (q.id && Number(q.id)) { w.length = 0; a.length = 0; w.push('m.id = ?'); a.push(Number(q.id)); }
  if (q.q) {
    const ids = all('SELECT id FROM users WHERE name LIKE ? OR username LIKE ? OR email LIKE ? LIMIT 200',
      like(q.q), like(q.q), like(q.q)).map((u) => u.id);
    if (!ids.length) return { itens: [], total: 0, pagina, porPagina, soma: { comAlerta: 0 } };
    w.push(`(${ASSENTO_IN(ids.join(', '))})`);
  }
  const suspeita = `(g.alertas > 0 OR g.recusadas >= ${RECUSADAS_SUSPEITAS} OR m.status IN ('disputed', 'interrupted'))`;
  if (q.alertas === '1') w.push(suspeita);
  const from = `FROM matches m JOIN (
      SELECT match_id, COUNT(*) eventos, SUM(alerta IS NOT NULL) alertas, SUM(tipo = 'recusada') recusadas,
             MIN(t) ini, MAX(t) fim
        FROM gravacao GROUP BY match_id
    ) g ON g.match_id = m.id WHERE ${w.join(' AND ')}`;
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(${suspeita}), 0) suspeitas ${from}`, ...a);
  return {
    itens: all(`SELECT m.*, g.eventos, g.alertas, g.recusadas, g.ini, g.fim ${from} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      ...a, porPagina, offset).map((m) => ({
      id: m.id, jogo: m.game, sala: m.room_type, codigo: m.code, status: m.status, aposta: R(m.stake), premio: R(m.prize),
      jogadores: jogadoresDe(m), criadoEm: m.created_at, encerradaEm: m.ended_at,
      eventos: m.eventos, alertas: m.alertas + (m.recusadas >= RECUSADAS_SUSPEITAS ? 1 : 0), recusadas: m.recusadas,
      duracao: m.fim - m.ini,
    })),
    total: tot.n, pagina, porPagina, soma: { comAlerta: tot.suspeitas },
  };
}

/** Uma gravação inteira, pro player do painel. */
export function gravacao(id) {
  const m = one('SELECT * FROM matches WHERE id = ?', Number(id));
  if (!m) throw new Erro('Partida não encontrada', 404);
  const eventos = eventosDe(m.id);
  if (!eventos.length) throw new Erro('Essa partida não tem gravação', 404);
  const alertas = eventos.filter((e) => e.alerta).map((e) => ({ seq: e.seq, t: e.t, assento: e.assento, texto: e.alerta }));
  const recusadas = new Map();
  for (const e of eventos) if (e.tipo === 'recusada') recusadas.set(e.assento, (recusadas.get(e.assento) ?? 0) + 1);
  for (const [assento, n] of recusadas) {
    if (n >= RECUSADAS_SUSPEITAS) {
      alertas.push({ seq: null, t: null, assento, texto: `${n} jogadas recusadas pelo servidor: pode ser cliente adulterado` });
    }
  }
  if (m.status === 'disputed' && !alertas.some((x) => /contestada/.test(x.texto))) {
    alertas.push({ seq: null, t: null, assento: null, texto: 'Partida contestada' });
  }
  const jogadores = jogadoresDe(m);
  const inicio = eventos.find((e) => e.tipo === 'inicio')?.dados?.jogadores;
  return {
    partida: {
      id: m.id, jogo: m.game, nomeJogo: nomeJogo(m.game), sala: m.room_type, codigo: m.code, status: m.status,
      aposta: R(m.stake), premio: R(m.prize), taxa: R(m.rake ?? 0), criadoEm: m.created_at, encerradaEm: m.ended_at,
      // Assento vem da gravação (a ordem da mesa); sem ela, a ordem das colunas.
      jogadores: jogadores.map((j, i) => ({ ...j, assento: inicio?.find((x) => x.id === j.id)?.assento ?? i,
        time: inicio?.find((x) => x.id === j.id)?.time ?? null })),
    },
    alertas,
    eventos,
  };
}

// ---------------------------------------------------------------- jogadores

const usuario = (id) => {
  const u = one('SELECT * FROM users WHERE id = ?', Number(id));
  if (!u) throw new Erro('Jogador não encontrado', 404);
  return u;
};

export function jogadores(q) {
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['1 = 1'];
  const a = [];
  if (q.q) {
    w.push('(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.id = ?)');
    a.push(like(q.q), like(q.q), like(q.q), Number(q.q) || -1);
  }
  const where = w.join(' AND ');
  const DEP = `(SELECT COALESCE(SUM(amount), 0) FROM pix_charges WHERE user_id = u.id AND status = 'paid')`;
  const ordem = { saldo: 'u.balance DESC', nome: 'u.name COLLATE NOCASE', depositado: `${DEP} DESC` }[q.ordem] ?? 'u.id DESC';
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(balance), 0) s, COALESCE(SUM(bonus), 0) b FROM users u WHERE ${where}`, ...a);
  return {
    itens: all(`SELECT u.*, ${DEP} dep,
        (SELECT COALESCE(SUM(valor), 0) FROM saques WHERE user_id = u.id AND status = 'aprovado') sac,
        (SELECT nome FROM influencers WHERE id = u.influencer_id) inf,
        EXISTS (SELECT 1 FROM matches WHERE status = 'playing' AND u.id IN (a_id, b_id, c_id, d_id)) jogando
      FROM users u WHERE ${where} ORDER BY ${ordem} LIMIT ? OFFSET ?`, ...a, porPagina, offset).map((u) => ({
      id: u.id, nome: u.name, username: u.username, email: u.email, saldo: R(u.balance), bonus: R(u.bonus),
      travado: R(u.locked), depositado: R(u.dep), sacado: R(u.sac), partidas: u.total_games, vitorias: u.wins,
      criadoEm: u.created_at, verificado: !!u.is_verified, bloqueado: !!u.bloqueado_em, influencer: u.inf ?? null,
      jogandoAgora: !!u.jogando,
    })),
    total: tot.n, pagina, porPagina, soma: { saldo: R(tot.s), bonus: R(tot.b) },
  };
}

const qv = (r) => ({ quantidade: r.n, valor: R(r.v) });

export function ficha(id) {
  const u = usuario(id);
  const dep = (st) => one(`SELECT COUNT(*) n, COALESCE(SUM(amount), 0) v FROM pix_charges WHERE user_id = ? AND status = ?`, u.id, st);
  const saq = (st) => one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM saques WHERE user_id = ? AND status = ?`, u.id, st);
  const datas = one(`SELECT MIN(paid_at) p, MAX(paid_at) u FROM pix_charges WHERE user_id = ? AND status = 'paid'`, u.id);
  const r = resultadoDe(u.id);
  const ind = one('SELECT i.indicador_id, x.name FROM indicacoes i JOIN users x ON x.id = i.indicador_id WHERE i.indicado_id = ?', u.id);
  const inf = u.influencer_id ? one('SELECT id, nome, codigo FROM influencers WHERE id = ?', u.influencer_id) : null;
  const b = somaBonus('b.user_id = ?', u.id);
  return {
    conta: {
      id: u.id, nome: u.name, username: u.username, email: u.email, verificado: !!u.is_verified, criadoEm: u.created_at,
      saldo: R(u.balance), bonus: R(u.bonus), travado: R(u.locked), pontos: u.points, nivel: u.level, avatarUrl: avatarUrl(u),
    },
    origem: { indicadoPor: ind ? { id: ind.indicador_id, nome: ind.name } : null, influencer: inf ?? null },
    depositos: { pagos: qv(dep('paid')), pendentes: qv(dep('pending')), primeiroEm: datas.p, ultimoEm: datas.u },
    saques: { aprovados: qv(saq('aprovado')), pendentes: qv(saq('pendente')), cancelados: qv(saq('cancelado')) },
    partidas: {
      quantidade: r.partidas, vitorias: r.vitorias, apostado: R(r.apostado), ganho: R(r.ganho),
      resultado: R(r.ganho - r.apostado), taxaGerada: R(r.taxa), porJogo: r.porJogo,
    },
    bonus: { quantidade: Object.values(b.porTipo).reduce((s, t) => s + t.quantidade, 0), valor: b.valor, porTipo: b.porTipo },
    indicacoes: {
      codigo: u.ref_code,
      indicados: one('SELECT COUNT(*) n FROM indicacoes WHERE indicador_id = ?', u.id).n,
      ganho: b.porTipo.indicacao.valor,
    },
    bloqueio: u.bloqueado_em ? { em: u.bloqueado_em, por: u.bloqueado_por, motivo: u.bloqueio_motivo } : null,
  };
}

export function historico(id, q) {
  const u = usuario(id);
  const { pagina, porPagina, offset } = paginar({ porPagina: 10, ...q });
  const pag = (sqlCount, sqlItens, map, ...args) => ({
    itens: all(`${sqlItens} LIMIT ? OFFSET ?`, ...args, porPagina, offset).map(map),
    total: one(sqlCount, ...args).n, pagina, porPagina,
  });
  switch (q.tipo) {
    case 'depositos':
      return pag('SELECT COUNT(*) n FROM pix_charges WHERE user_id = ?',
        `SELECT c.*, u.name, u.email FROM pix_charges c JOIN users u ON u.id = c.user_id WHERE c.user_id = ? ORDER BY c.created_at DESC`,
        deposito, u.id);
    case 'saques':
      return pag('SELECT COUNT(*) n FROM saques WHERE user_id = ?', 'SELECT * FROM saques WHERE user_id = ? ORDER BY id DESC',
        (s) => ({ id: s.id, valor: R(s.valor), chavePix: s.chave_pix, status: s.status, motivo: s.motivo,
          criadoEm: s.criado_em, decididoEm: s.decidido_em }), u.id);
    case 'bonus':
      return pag('SELECT COUNT(*) n FROM bonus WHERE user_id = ?', 'SELECT * FROM bonus WHERE user_id = ? ORDER BY id DESC',
        (b) => ({ id: b.id, tipo: b.tipo, valor: R(b.valor), motivo: b.motivo, criadoPor: b.criado_por, criadoEm: b.criado_em }), u.id);
    case 'transacoes':
      return pag('SELECT COUNT(*) n FROM transactions WHERE user_id = ?', 'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC',
        (t) => ({ id: t.id, tipo: t.kind, titulo: t.title, valor: R(t.amount), criadoEm: t.created_at }), u.id);
    case 'indicados':
      return pag('SELECT COUNT(*) n FROM indicacoes WHERE indicador_id = ?',
        `SELECT i.*, x.name, x.email FROM indicacoes i JOIN users x ON x.id = i.indicado_id WHERE i.indicador_id = ? ORDER BY i.id DESC`,
        (i) => ({ id: i.indicado_id, nome: i.name, email: i.email, status: i.status, ...atividade(i.indicado_id), criadoEm: i.criado_em }), u.id);
    default:
      return pag(`SELECT COUNT(*) n FROM matches WHERE ? IN (a_id, b_id, c_id, d_id)`,
        `SELECT * FROM matches WHERE ? IN (a_id, b_id, c_id, d_id) ORDER BY id DESC`, (m) => {
          const js = jogadoresDe(m);
          const eu = js.find((j) => j.id === u.id);
          return { id: m.id, jogo: m.game, sala: m.room_type, aposta: R(m.stake), premio: R(m.prize), venceu: !!eu?.venceu,
            status: m.status, adversarios: js.filter((j) => j.id !== u.id).map((j) => j.nome).join(', '), criadoEm: m.created_at };
        }, u.id);
  }
}

/** Depositou? Quantas partidas pagas? (indicações e inscritos de influencer) */
function atividade(userId) {
  return {
    depositou: !!one(`SELECT 1 FROM pix_charges WHERE user_id = ? AND status = 'paid'`, userId),
    partidas: one(`SELECT COUNT(*) n FROM matches WHERE status = 'settled' AND stake > 0 AND ? IN (a_id, b_id, c_id, d_id)`, userId).n,
  };
}

const motivoDe = (m) => {
  const s = String(m ?? '').trim().slice(0, 300);
  if (s.length < 3) throw new Erro('Escreva o motivo');
  return s;
};

/** Bônus manual: vai pro bônus (não sacável). */
export function bonusManual(id, { valor, motivo }, por) {
  const u = usuario(id);
  const cents = toCents(valor);
  if (cents > 10_000_00) throw new Erro('Máximo de R$ 10.000,00 por bônus');
  const m = motivoDe(motivo);
  tx(() => darBonus(u.id, { tipo: 'manual', chave: `manual:${randomBytes(8).toString('hex')}`, valor: cents,
    titulo: 'Bônus da Joggpix', motivo: m, por }));
  return { ok: true, userId: u.id, nome: u.name };
}

export function bonusPorEmail(b, por) {
  const u = one('SELECT id FROM users WHERE email = ?', String(b.email ?? '').trim());
  if (!u) throw new Erro('Nenhuma conta com esse e-mail', 404);
  return bonusManual(u.id, b, por);
}

/** Tira saldo ou bônus (fraude, crédito errado). Nunca mexe no que está travado em partida. */
export function remover(id, { carteira, valor, tudo, motivo }, por) {
  const u = usuario(id);
  const col = carteira === 'bonus' ? 'bonus' : 'balance';
  const m = motivoDe(motivo);
  return tx(() => {
    const tem = one(`SELECT ${col} v FROM users WHERE id = ?`, u.id).v;
    const cents = tudo ? tem : toCents(valor);
    if (cents <= 0) throw new Erro('Nada pra remover');
    if (cents > tem) throw new Erro(`O jogador só tem R$ ${(tem / 100).toFixed(2).replace('.', ',')} ${col === 'bonus' ? 'de bônus' : 'de saldo'}`);
    run(`UPDATE users SET ${col} = ${col} - ? WHERE id = ?`, cents, u.id);
    run(`INSERT INTO remocoes (user_id, carteira, valor, motivo, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)`,
      u.id, col === 'bonus' ? 'bonus' : 'saldo', cents, m, por, agora());
    logTx(u.id, 'withdrawal', `Ajuste da Joggpix: ${m}`, -cents);
    return { ok: true, removido: R(cents) };
  });
}

/** Bloqueio: derruba as sessões; login e token passam a ser recusados. */
export function bloquear(id, { motivo }, por) {
  const u = usuario(id);
  const m = motivoDe(motivo);
  tx(() => {
    run('UPDATE users SET bloqueado_em = ?, bloqueado_por = ?, bloqueio_motivo = ? WHERE id = ?', agora(), por, m, u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id);
  });
  return { ok: true };
}

export function desbloquear(id) {
  const u = usuario(id);
  run('UPDATE users SET bloqueado_em = NULL, bloqueado_por = NULL, bloqueio_motivo = NULL WHERE id = ?', u.id);
  return { ok: true };
}

// -------------------------------------------------------------------- bônus

export function bonusLista(q) {
  const { ini, fim } = periodo(q);
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['b.criado_em >= ?', 'b.criado_em < ?'];
  const a = [ini, fim];
  if (q.tipo) { w.push('b.tipo = ?'); a.push(q.tipo); }
  if (q.q) { w.push('(u.name LIKE ? OR u.email LIKE ?)'); a.push(like(q.q), like(q.q)); }
  const where = w.join(' AND ');
  const join = 'FROM bonus b JOIN users u ON u.id = b.user_id';
  return {
    itens: all(`SELECT b.*, u.name, u.email ${join} WHERE ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`, ...a, porPagina, offset)
      .map((b) => ({ id: b.id, tipo: b.tipo, userId: b.user_id, nome: b.name, email: b.email, valor: R(b.valor),
        motivo: b.motivo, criadoPor: b.criado_por, criadoEm: b.criado_em })),
    total: one(`SELECT COUNT(*) n ${join} WHERE ${where}`, ...a).n, pagina, porPagina,
    soma: somaBonus(`b.id IN (SELECT b.id ${join} WHERE ${where})`, ...a),
  };
}

const linkDe = (l) => ({
  id: l.id, codigo: l.codigo, nome: l.nome, valor: R(l.valor), limite: l.limite, resgates: l.resgates,
  totalPago: R(one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus WHERE tipo = 'link' AND origem_id = ?`, l.id).v),
  ativo: !!l.ativo, esgotado: l.limite != null && l.resgates >= l.limite, criadoPor: l.criado_por, criadoEm: l.criado_em,
  link: `${SITE}/?bonus=${encodeURIComponent(l.codigo)}`,
});

export const bonusLinks = () => all('SELECT * FROM bonus_links ORDER BY id DESC').map(linkDe);

export function criarBonusLink({ nome, valor, limite, codigo }, por) {
  nome = String(nome ?? '').trim().slice(0, 60);
  if (!nome) throw new Erro('Dê um nome pro link');
  const cents = toCents(valor);
  if (cents > 1000_00) throw new Erro('Máximo de R$ 1.000,00 por resgate');
  const lim = limite == null || limite === '' ? null : Math.floor(Number(limite));
  if (lim != null && !(lim > 0)) throw new Erro('Limite inválido');
  codigo = String(codigo ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    || randomBytes(4).toString('hex').toUpperCase();
  if (one('SELECT 1 FROM bonus_links WHERE codigo = ?', codigo)) throw new Erro('Esse código já existe', 409);
  const { lastInsertRowid } = run(`INSERT INTO bonus_links (codigo, nome, valor, limite, criado_por, criado_em)
                                   VALUES (?, ?, ?, ?, ?, ?)`, codigo, nome, cents, lim, por, agora());
  return { id: Number(lastInsertRowid), codigo };
}

export function editarBonusLink(id, { ativo }) {
  if (!run('UPDATE bonus_links SET ativo = ? WHERE id = ?', ativo ? 1 : 0, Number(id)).changes) throw new Erro('Link não encontrado', 404);
  return { ok: true };
}

export function resgatesLink(id, q) {
  const { pagina, porPagina, offset } = paginar(q);
  const w = `b.tipo = 'link' AND b.origem_id = ?`;
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM bonus b WHERE ${w}`, Number(id));
  return {
    itens: all(`SELECT b.*, u.name, u.email FROM bonus b JOIN users u ON u.id = b.user_id WHERE ${w}
                ORDER BY b.id DESC LIMIT ? OFFSET ?`, Number(id), porPagina, offset)
      .map((b) => ({ userId: b.user_id, nome: b.name, email: b.email, valor: R(b.valor), criadoEm: b.criado_em })),
    total: tot.n, pagina, porPagina, soma: R(tot.v),
  };
}

/** Jogador logado abrindo /?bonus=CODIGO. Uma vez por conta, até o limite do link. */
export function resgatarLink(userId, codigo) {
  return tx(() => {
    const l = one('SELECT * FROM bonus_links WHERE codigo = ?', String(codigo ?? '').trim());
    if (!l || !l.ativo) throw new Erro('Esse link de bônus não está valendo', 404);
    if (one(`SELECT 1 FROM bonus WHERE chave = ?`, `link:${l.id}:${userId}`)) throw new Erro('Você já pegou esse bônus', 409);
    const { changes } = run(`UPDATE bonus_links SET resgates = resgates + 1
                             WHERE id = ? AND (limite IS NULL OR resgates < limite)`, l.id);
    if (!changes) throw new Erro('Esse bônus já esgotou', 409);
    darBonus(userId, { tipo: 'link', chave: `link:${l.id}:${userId}`, valor: l.valor, titulo: `Bônus · ${l.nome}`, origemId: l.id });
    return { ok: true, valor: R(l.valor) };
  });
}

// --------------------------------------------------------------- indicações

export function indicacoes(q) {
  const { pagina, porPagina, offset } = paginar(q);
  const w = ['1 = 1'];
  const a = [];
  if (q.status) { w.push('i.status = ?'); a.push(q.status); }
  if (q.q) { w.push('(x.name LIKE ? OR x.email LIKE ? OR y.name LIKE ? OR y.email LIKE ?)'); a.push(...Array(4).fill(like(q.q))); }
  const where = w.join(' AND ');
  const join = 'FROM indicacoes i JOIN users x ON x.id = i.indicador_id JOIN users y ON y.id = i.indicado_id';
  const com = (indicadorId, indicadoId) => one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus
    WHERE tipo = 'indicacao' AND user_id = ? AND origem_id = ? AND chave LIKE 'ind-taxa:%'`, indicadorId, indicadoId).v;
  return {
    itens: all(`SELECT i.*, x.name xn, y.name yn ${join} WHERE ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`, ...a, porPagina, offset)
      .map((i) => ({
        id: i.id, indicador: { id: i.indicador_id, nome: i.xn }, indicado: { id: i.indicado_id, nome: i.yn },
        ...atividade(i.indicado_id), status: i.status, premio: R(i.premio), comissao: R(com(i.indicador_id, i.indicado_id)),
        criadoEm: i.criado_em, liberadaEm: i.liberada_em,
      })),
    total: one(`SELECT COUNT(*) n ${join} WHERE ${where}`, ...a).n, pagina, porPagina,
    soma: {
      pendentes: one(`SELECT COUNT(*) n FROM indicacoes WHERE status = 'pendente'`).n,
      liberadas: one(`SELECT COUNT(*) n FROM indicacoes WHERE status = 'liberada'`).n,
      valorPago: R(one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus WHERE tipo = 'indicacao' AND chave LIKE 'ind-premio:%'`).v),
      comissoes: R(one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus WHERE tipo = 'indicacao' AND chave LIKE 'ind-taxa:%'`).v),
    },
  };
}

// --------------------------------------------------------------- influencers

const novoCodigoInf = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

/** Ganho, sacado, pendente e disponível de um influencer (centavos). */
function contasInf(infId) {
  const ganho = one('SELECT COALESCE(SUM(valor), 0) v FROM inf_comissoes WHERE influencer_id = ?', infId).v;
  const sacado = one(`SELECT COALESCE(SUM(valor), 0) v FROM inf_saques WHERE influencer_id = ? AND status = 'pago'`, infId).v;
  const pend = one(`SELECT COALESCE(SUM(valor), 0) v FROM inf_saques WHERE influencer_id = ? AND status = 'pendente'`, infId).v;
  return { ganho, sacado, pend, disponivel: ganho - sacado - pend };
}

function resumoInf(i) {
  const c = contasInf(i.id);
  const cfg = regras();
  return {
    inscritos: one('SELECT COUNT(*) n FROM users WHERE influencer_id = ?', i.id).n,
    depositaram: one(`SELECT COUNT(DISTINCT c.user_id) n FROM pix_charges c JOIN users u ON u.id = c.user_id
                      WHERE u.influencer_id = ? AND c.status = 'paid'`, i.id).n,
    totalDepositado: R(one(`SELECT COALESCE(SUM(c.amount), 0) v FROM pix_charges c JOIN users u ON u.id = c.user_id
                            WHERE u.influencer_id = ? AND c.status = 'paid'`, i.id).v),
    taxaGerada: R(one('SELECT COALESCE(SUM(base), 0) v FROM inf_comissoes WHERE influencer_id = ?', i.id).v),
    ganho: R(c.ganho), sacado: R(c.sacado), saquePendente: R(c.pend), disponivel: R(c.disponivel),
    percentualEfetivo: (i.percentual_bp ?? cfg.inf_bp) / 100,
    link: `${SITE}/?inf=${encodeURIComponent(i.codigo)}`,
  };
}

export function influencers(q) {
  const w = q.q ? 'WHERE i.nome LIKE ? OR u.email LIKE ? OR i.codigo LIKE ?' : '';
  const a = q.q ? [like(q.q), like(q.q), like(q.q)] : [];
  return all(`SELECT i.*, u.email FROM influencers i JOIN users u ON u.id = i.user_id ${w} ORDER BY i.id DESC`, ...a).map((i) => ({
    id: i.id, userId: i.user_id, nome: i.nome, email: i.email, codigo: i.codigo, chavePix: i.chave_pix, ativo: !!i.ativo,
    percentual: i.percentual_bp == null ? null : i.percentual_bp / 100, criadoEm: i.criado_em,
    cliques: one('SELECT COUNT(*) n FROM inf_visitas WHERE codigo = ?', i.codigo).n,
    pessoas: one('SELECT COUNT(DISTINCT ip) n FROM inf_visitas WHERE codigo = ?', i.codigo).n,
    ...resumoInf(i),
  }));
}

const percentualBp = (p) => {
  if (p === undefined) return undefined;
  if (p === null || p === '') return null;
  const n = Number(p);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Erro('Percentual de 0 a 100');
  return Math.round(n * 100);
};

export function criarInfluencer({ nome, email, senha, chavePix, percentual }, por) {
  nome = String(nome ?? '').trim().slice(0, 60);
  email = String(email ?? '').trim();
  if (!nome) throw new Erro('Informe o nome');
  const bp = percentualBp(percentual);
  return tx(() => {
    const existente = one('SELECT id FROM users WHERE email = ?', email);
    const userId = existente ? existente.id : criarContaVerificada({ nome, email, senha });
    if (existente && senha) trocarSenha(userId, senha);
    if (one('SELECT 1 FROM influencers WHERE user_id = ?', userId)) throw new Erro('Essa conta já é influencer', 409);
    let codigo;
    do codigo = novoCodigoInf(); while (one('SELECT 1 FROM influencers WHERE codigo = ?', codigo));
    const { lastInsertRowid } = run(`INSERT INTO influencers (user_id, codigo, nome, chave_pix, percentual_bp, criado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, userId, codigo, nome, String(chavePix ?? '').trim() || null, bp ?? null, por, agora());
    return { id: Number(lastInsertRowid), codigo };
  });
}

export function editarInfluencer(id, { ativo, chavePix, senha, percentual }) {
  const i = one('SELECT * FROM influencers WHERE id = ?', Number(id));
  if (!i) throw new Erro('Influencer não encontrado', 404);
  const bp = percentualBp(percentual);
  tx(() => {
    if (ativo !== undefined) {
      run('UPDATE influencers SET ativo = ? WHERE id = ?', ativo ? 1 : 0, i.id);
      if (!ativo) run('DELETE FROM sessions WHERE user_id = ?', i.user_id);
    }
    if (chavePix !== undefined) run('UPDATE influencers SET chave_pix = ? WHERE id = ?', String(chavePix ?? '').trim() || null, i.id);
    if (bp !== undefined) run('UPDATE influencers SET percentual_bp = ? WHERE id = ?', bp, i.id);
    if (senha) trocarSenha(i.user_id, senha);
  });
  return { ok: true };
}

/** Quem entrou pelo link. Pro próprio influencer o nome sai mascarado. */
function inscritosDe(infId, q, mascarar) {
  const { pagina, porPagina, offset } = paginar(q);
  const mascara = (n) => { const [a, b] = String(n).trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a; };
  const tot = one('SELECT COUNT(*) n FROM users WHERE influencer_id = ?', infId);
  return {
    itens: all('SELECT * FROM users WHERE influencer_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', infId, porPagina, offset).map((u) => {
      const c = one('SELECT COALESCE(SUM(base), 0) b, COALESCE(SUM(valor), 0) v FROM inf_comissoes WHERE influencer_id = ? AND indicado_id = ?', infId, u.id);
      const at = atividade(u.id);
      const base = { nome: mascarar ? mascara(u.name) : u.name, criadoEm: u.created_at, depositou: at.depositou,
        partidas: at.partidas, comissao: R(c.v) };
      return mascarar ? base : {
        ...base, id: u.id, email: u.email, taxaGerada: R(c.b),
        depositado: R(one(`SELECT COALESCE(SUM(amount), 0) v FROM pix_charges WHERE user_id = ? AND status = 'paid'`, u.id).v),
      };
    }),
    total: tot.n, pagina, porPagina,
    soma: R(one('SELECT COALESCE(SUM(valor), 0) v FROM inf_comissoes WHERE influencer_id = ?', infId).v),
  };
}

export const inscritos = (id, q) => inscritosDe(Number(id), q, false);

const infSaque = (s) => ({
  id: s.id, influencerId: s.influencer_id, influencer: s.nome, email: s.email, valor: R(s.valor), chavePix: s.chave_pix,
  status: s.status, motivo: s.motivo, decididoPor: s.decidido_por, decididoEm: s.decidido_em, criadoEm: s.criado_em,
});

export function infSaques(q) {
  const { pagina, porPagina, offset } = paginar(q);
  const status = q.status || 'pendente';
  const w = status === 'todos' ? '1 = 1' : 's.status = ?';
  const a = status === 'todos' ? [] : [status];
  const join = 'FROM inf_saques s JOIN influencers i ON i.id = s.influencer_id JOIN users u ON u.id = i.user_id';
  const tot = one(`SELECT COUNT(*) n, COALESCE(SUM(s.valor), 0) v ${join} WHERE ${w}`, ...a);
  const pend = one(`SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM inf_saques WHERE status = 'pendente'`);
  return {
    itens: all(`SELECT s.*, i.nome, u.email ${join} WHERE ${w} ORDER BY s.id DESC LIMIT ? OFFSET ?`, ...a, porPagina, offset).map(infSaque),
    total: tot.n, pagina, porPagina, soma: R(tot.v), pendentes: { quantidade: pend.n, valor: R(pend.v) },
  };
}

export function decidirInfSaque(id, acao, motivo, por) {
  const novo = acao === 'aprovar' ? 'pago' : 'cancelado';
  const m = acao === 'aprovar' ? null : String(motivo ?? '').trim().slice(0, 300) || null;
  const { changes } = run(`UPDATE inf_saques SET status = ?, motivo = ?, decidido_por = ?, decidido_em = ?
                           WHERE id = ? AND status = 'pendente'`, novo, m, por, agora(), Number(id));
  if (!changes) throw new Erro('Esse saque já foi decidido ou não existe', 409);
  return { ok: true };
}

// ----------------------------------------------------- painel do influencer

function infDoUsuario(u) {
  const i = one('SELECT * FROM influencers WHERE user_id = ? AND ativo = 1', u.id);
  if (!i) throw new Erro('Essa conta não é de influencer', 403);
  return i;
}

export function influencerMe(u) {
  const i = infDoUsuario(u);
  const cfg = regras();
  const r = resumoInf(i);
  const mascara = (n) => { const [a, b] = String(n ?? '').trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a; };
  return {
    nome: i.nome, codigo: i.codigo, link: r.link, chavePix: i.chave_pix,
    regras: { percentual: r.percentualEfetivo, saqueMinimo: R(cfg.inf_saque_minimo) },
    inscritos: r.inscritos, depositaram: r.depositaram, totalDepositado: r.totalDepositado, taxaGerada: r.taxaGerada,
    ganho: r.ganho, sacado: r.sacado, saquePendente: r.saquePendente, disponivel: r.disponivel,
    comissoes: all(`SELECT c.*, u.name FROM inf_comissoes c JOIN users u ON u.id = c.indicado_id
                    WHERE c.influencer_id = ? ORDER BY c.id DESC LIMIT 30`, i.id).map((c) => ({
      id: c.id, indicado: mascara(c.name), base: R(c.base), valor: R(c.valor), jogo: nomeJogo(c.jogo), criadoEm: c.criado_em,
    })),
    saques: all('SELECT * FROM inf_saques WHERE influencer_id = ? ORDER BY id DESC LIMIT 30', i.id).map((s) => ({
      id: s.id, valor: R(s.valor), chavePix: s.chave_pix, status: s.status, motivo: s.motivo, criadoEm: s.criado_em, decididoEm: s.decidido_em,
    })),
  };
}

export const meusInscritos = (u, q) => inscritosDe(infDoUsuario(u).id, q, true);

export function pedirSaqueInf(u, { valor }) {
  const i = infDoUsuario(u);
  if (!i.chave_pix) throw new Erro('Sem chave Pix cadastrada. Fale com o suporte.');
  const cents = toCents(valor);
  const cfg = regras();
  if (cents < cfg.inf_saque_minimo) throw new Erro(`O saque mínimo é de R$ ${(cfg.inf_saque_minimo / 100).toFixed(2).replace('.', ',')}`);
  // BEGIN IMMEDIATE: dois pedidos ao mesmo tempo não gastam o mesmo saldo.
  return tx(() => {
    if (cents > contasInf(i.id).disponivel) throw new Erro('Valor acima do disponível');
    run('INSERT INTO inf_saques (influencer_id, valor, chave_pix, criado_em) VALUES (?, ?, ?, ?)', i.id, cents, i.chave_pix, agora());
    return { ok: true };
  });
}
