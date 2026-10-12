import { JOGOS } from './jogos.js';
import { decidir, resumo } from './admin.js';
import { configPainel, salvarConfig, taxaCasa } from './config.js';
import * as P from './painel.js';
import { gravarTela, telaJson, TELA_BLOCO_MAX } from './gravacao.js';
import { Erro, salas, visitaInfluencer, claimMissions, claimStreak, conferirPix, convertPoints, criarPix, deposit,
  AVATAR_MAX, avatarDe, login, logout, ranking, register, resendCode, setAvatar, stateOf, toCents,
  updateProfile, userByToken,
  verifyEmail,
  withdraw } from './model.js';

const MAX_BODY = 8 * 1024;   // nada que a gente recebe passa disso

/**
 * `auth: true` = precisa de Bearer token; `admin: true` = e estar em ADMIN_EMAILS.
 * O handler recebe (body, user, token, ctx) — ctx = { params, query, ip }.
 * `:nome` no caminho vira ctx.params.nome.
 */
const ROTAS = {
  // Cadastro não devolve token: a conta só entra depois do código do e-mail.
  'POST /api/register': { fn: (b, u, t, c) => register(b, c.ip) },
  'POST /api/inf/visita': { fn: (b, u, t, c) => visitaInfluencer(b.codigo, c.ip) },
  'POST /api/verify': { fn: (b) => sessao(verifyEmail(b)) },
  'POST /api/verify/resend': { fn: (b) => resendCode(b) },
  'POST /api/login': { fn: (b) => sessao(login(b)) },
  'POST /api/logout': { auth: true, fn: (b, u, token) => (logout(token), { ok: true }) },
  'GET /api/me': { auth: true, fn: (b, u) => stateOf(u.id) },
  'POST /api/profile': { auth: true, fn: (b, u) => updateProfile(u.id, b) },
  // A foto vem em base64 (+1/3) dentro do JSON: é a única rota com corpo grande.
  'POST /api/avatar': { auth: true, max: Math.ceil(AVATAR_MAX * 4 / 3) + 1024, fn: (b, u) => setAvatar(u.id, b.image) },
  'POST /api/deposit/pix': { auth: true, fn: (b, u) => criarPix(u.id, toCents(b.amount)) },
  'POST /api/deposit/pix/check': { auth: true, fn: (b, u) => conferirPix(u.id, b.externalId) },
  // Crédito sem pagamento é torneira de dinheiro: só existe com SIMULAR_DEPOSITO=1.
  ...(process.env.SIMULAR_DEPOSITO
    ? { 'POST /api/deposit': { auth: true, fn: (b, u) => deposit(u.id, toCents(b.amount)) } }
    : {}),
  'POST /api/withdraw': { auth: true, fn: (b, u) => withdraw(u.id, toCents(b.amount), b.pixKey, b.pixKeyType) },
  'POST /api/bonus-link': { auth: true, fn: (b, u) => ({ ...P.resgatarLink(u.id, b.codigo), ...stateOf(u.id) }) },
  'POST /api/convert': { auth: true, fn: (b, u) => convertPoints(u.id, b.points) },
  'POST /api/missions/claim': { auth: true, fn: (b, u) => claimMissions(u.id) },
  'POST /api/streak/claim': { auth: true, fn: (b, u) => claimStreak(u.id) },
  'GET /api/ranking': { fn: (b, u, t, c) => ({ ranking: ranking(20, c.query.periodo ?? 'geral') }) },
  // Cada jogo leva a sua taxa: o app mostra o prêmio certo antes de entrar.
  'GET /api/rooms': {
    fn: () => ({
      rooms: salas(), taxa: taxaCasa(),
      jogos: Object.fromEntries(Object.entries(JOGOS).map(([id, j]) => [id, { ...j, taxa: taxaCasa(id) }])),
    }),
  },

  // Painel admin (docs/ADMIN-API.md). Só GET e POST: é o que o CORS libera.
  'GET /api/admin/resumo': { admin: true, fn: () => resumo() },
  'POST /api/admin/denuncia': { admin: true, fn: (b) => decidir(b.id, b.acao) },
  'GET /api/admin/dashboard': { admin: true, fn: (b, u, t, c) => P.dashboard(c.query) },
  'GET /api/admin/ao-vivo': { admin: true, fn: () => P.aoVivo() },
  'GET /api/admin/depositos': { admin: true, fn: (b, u, t, c) => P.depositos(c.query) },
  'GET /api/admin/saques': { admin: true, fn: (b, u, t, c) => P.saques(c.query) },
  'POST /api/admin/saques/:id/aprovar': { admin: true, fn: (b, u, t, c) => P.aprovarSaque(c.params.id, u.email) },
  'POST /api/admin/saques/:id/cancelar': { admin: true, fn: (b, u, t, c) => P.cancelarSaque(c.params.id, b.motivo, u.email) },
  'GET /api/admin/partidas': { admin: true, fn: (b, u, t, c) => P.partidas(c.query) },
  'GET /api/admin/gravacoes': { admin: true, fn: (b, u, t, c) => P.gravacoes(c.query) },
  'GET /api/admin/gravacoes/:id': { admin: true, fn: (b, u, t, c) => P.gravacao(c.params.id) },
  'GET /api/admin/gravacoes/:id/telas': { admin: true, fn: (b, u, t, c) => P.telas(c.params.id) },
  // `raw`: o handler já devolve o JSON em texto (blocos grandes, só concatenados)
  'GET /api/admin/gravacoes/:id/tela/:user': { admin: true, raw: true,
    fn: (b, u, t, c) => telaJson(c.params.id, c.params.user, { desde: c.query.desde, aoVivo: c.query.aoVivo === '1' }) },
  'GET /api/admin/jogadores': { admin: true, fn: (b, u, t, c) => P.jogadores(c.query) },
  'GET /api/admin/jogadores/:id': { admin: true, fn: (b, u, t, c) => P.ficha(c.params.id) },
  'GET /api/admin/jogadores/:id/historico': { admin: true, fn: (b, u, t, c) => P.historico(c.params.id, c.query) },
  'POST /api/admin/jogadores/:id/bonus': { admin: true, fn: (b, u, t, c) => P.bonusManual(c.params.id, b, u.email) },
  'POST /api/admin/jogadores/:id/remover': { admin: true, fn: (b, u, t, c) => P.remover(c.params.id, b, u.email) },
  'POST /api/admin/jogadores/:id/bloquear': { admin: true, fn: (b, u, t, c) => P.bloquear(c.params.id, b, u.email) },
  'POST /api/admin/jogadores/:id/desbloquear': { admin: true, fn: (b, u, t, c) => P.desbloquear(c.params.id) },
  'GET /api/admin/bonus': { admin: true, fn: (b, u, t, c) => P.bonusLista(c.query) },
  'POST /api/admin/bonus': { admin: true, fn: (b, u) => P.bonusPorEmail(b, u.email) },
  'GET /api/admin/bonus-links': { admin: true, fn: () => P.bonusLinks() },
  'POST /api/admin/bonus-links': { admin: true, fn: (b, u) => P.criarBonusLink(b, u.email) },
  'POST /api/admin/bonus-links/:id': { admin: true, fn: (b, u, t, c) => P.editarBonusLink(c.params.id, b) },
  'GET /api/admin/bonus-links/:id/resgates': { admin: true, fn: (b, u, t, c) => P.resgatesLink(c.params.id, c.query) },
  'GET /api/admin/indicacoes': { admin: true, fn: (b, u, t, c) => P.indicacoes(c.query) },
  'GET /api/admin/influencers': { admin: true, fn: (b, u, t, c) => P.influencers(c.query) },
  'POST /api/admin/influencers': { admin: true, fn: (b, u) => P.criarInfluencer(b, u.email) },
  'GET /api/admin/influencers/saques': { admin: true, fn: (b, u, t, c) => P.infSaques(c.query) },
  'POST /api/admin/influencers/saques/:id/aprovar': { admin: true, fn: (b, u, t, c) => P.decidirInfSaque(c.params.id, 'aprovar', null, u.email) },
  'POST /api/admin/influencers/saques/:id/cancelar': { admin: true, fn: (b, u, t, c) => P.decidirInfSaque(c.params.id, 'cancelar', b.motivo, u.email) },
  'POST /api/admin/influencers/:id': { admin: true, fn: (b, u, t, c) => P.editarInfluencer(c.params.id, b) },
  'GET /api/admin/influencers/:id/inscritos': { admin: true, fn: (b, u, t, c) => P.inscritos(c.params.id, c.query) },
  'GET /api/admin/config': { admin: true, fn: () => configPainel() },
  'POST /api/admin/config': { admin: true, fn: (b, u) => salvarConfig(b, u.email) },

  // Painel do influencer: a conta dele, sem ser admin.
  'GET /api/influencer/me': { auth: true, fn: (b, u) => P.influencerMe(u) },
  'GET /api/influencer/inscritos': { auth: true, fn: (b, u, t, c) => P.meusInscritos(u, c.query) },
  'POST /api/influencer/saques': { auth: true, fn: (b, u) => P.pedirSaqueInf(u, b) },
};

// Rotas com `:param` viram regex; as fixas continuam por chave exata (vêm antes:
// /influencers/saques não pode cair em /influencers/:id).
const DINAMICAS = Object.entries(ROTAS).filter(([k]) => k.includes('/:')).map(([k, rota]) => {
  const nomes = [];
  const re = new RegExp(`^${k.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; })}$`);
  return { re, nomes, rota };
});

function acharRota(method, pathname) {
  const fixa = ROTAS[`${method} ${pathname}`];
  if (fixa) return { rota: fixa, params: {} };
  for (const d of DINAMICAS) {
    const m = d.re.exec(`${method} ${pathname}`);
    if (m) return { rota: d.rota, params: Object.fromEntries(d.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

// Atrás do nginx o IP de verdade vem no X-Real-IP; direto, é o do socket.
const ipDe = (req) => String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? '').slice(0, 64) || null;

const sessao = ({ token, userId }) => ({ token, ...stateOf(userId) });

export const tokenDe = (req) => (req.headers.authorization ?? '').replace(/^Bearer /, '') || null;

/** Corpo binário (bloco da tela, gzip). */
function bruto(req, max) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tam = 0;
    req.on('data', (c) => {
      tam += c.length;
      if (tam > max) { req.destroy(); reject(new Erro('Corpo grande demais', 413)); } else partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function corpo(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > max) { req.destroy(); reject(new Erro('Corpo grande demais', 413)); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Erro('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const json = (res, status, body) => {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};

// Front e API em domínios diferentes em produção. A sessão é Bearer token,
// não cookie, então basta liberar a origem do front — sem credentials.
// CORS_ORIGIN vazio = mesma origem (dev), nenhum cabeçalho.
export const ORIGENS = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);

function cors(req, res) {
  const origem = req.headers.origin;
  if (!origem || !ORIGENS.includes(origem)) return;
  res.setHeader('access-control-allow-origin', origem);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
  res.setHeader('access-control-max-age', '86400');
}

/** @returns {boolean} true se a requisição era da API (tratada aqui). */
export async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;

  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }

  // Foto de perfil: pública (aparece pros adversários na mesa), binária, e
  // imutável por URL — a versão na query muda quando a foto muda.
  const foto = req.method === 'GET' && /^\/api\/avatar\/(\d+)$/.exec(url.pathname);
  if (foto) {
    const a = avatarDe(Number(foto[1]));
    if (!a) { json(res, 404, { error: 'Sem foto' }); return true; }
    res.writeHead(200, {
      'content-type': a.avatar_type,
      'content-length': a.avatar.length,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Pública e sem credencial: qualquer origem pode desenhar num canvas
      // (os jogos em Phaser viram a foto em textura WebGL).
      'access-control-allow-origin': '*',
    });
    res.end(Buffer.from(a.avatar));
    return true;
  }

  // Bloco do vídeo da tela do jogador: binário (gzip) ou JSON, fora do parser comum.
  const tela = req.method === 'POST' && /^\/api\/tela\/(\d+)$/.exec(url.pathname);
  if (tela) {
    try {
      const user = userByToken(tokenDe(req));
      if (!user) throw new Erro('Faça login pra continuar', 401);
      const gzip = /gzip/.test(req.headers['content-type'] ?? '');
      json(res, 200, gravarTela(tela[1], user.id, url.searchParams.get('seq'), await bruto(req, TELA_BLOCO_MAX), gzip));
    } catch (e) {
      if (!(e instanceof Erro)) console.error('api tela:', e);
      json(res, e.status ?? 500, { error: e instanceof Erro ? e.message : 'Erro interno' });
    }
    return true;
  }

  const achada = acharRota(req.method, url.pathname);
  if (!achada) { json(res, 404, { error: 'Rota não encontrada' }); return true; }
  const { rota, params } = achada;

  try {
    let user = null;
    const token = tokenDe(req);
    if (rota.auth || rota.admin) {
      user = userByToken(token);
      if (!user) throw new Erro('Faça login pra continuar', 401);
      if (rota.admin) P.exigirAdmin(user);
    }
    const ctx = { params, query: Object.fromEntries(url.searchParams), ip: ipDe(req) };
    const r = await rota.fn(await corpo(req, rota.max), user, token, ctx);
    if (rota.raw) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(r) });
      res.end(r);
    } else json(res, 200, r ?? { ok: true });
  } catch (e) {
    if (!(e instanceof Erro)) console.error('api:', e);
    json(res, e.status ?? 500, { error: e instanceof Erro ? e.message : 'Erro interno' });
  }
  return true;
}
