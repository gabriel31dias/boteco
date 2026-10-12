import { JOGOS } from './jogos.js';
import { decidir, exigirAdmin, resumo } from './admin.js';
import { Erro, ROOMS, claimMissions, claimStreak, conferirPix, convertPoints, criarPix, deposit,
  AVATAR_MAX, avatarDe, login, logout, ranking, register, resendCode, setAvatar, stateOf, toCents,
  updateProfile, userByToken,
  verifyEmail,
  withdraw } from './model.js';

const MAX_BODY = 8 * 1024;   // nada que a gente recebe passa disso

/** `auth: true` = precisa de Bearer token; o handler recebe (body, user). */
const ROTAS = {
  // Cadastro não devolve token: a conta só entra depois do código do e-mail.
  'POST /api/register': { fn: (b) => register(b) },
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
  'POST /api/withdraw': { auth: true, fn: (b, u) => withdraw(u.id, toCents(b.amount), b.pixKey) },
  'POST /api/convert': { auth: true, fn: (b, u) => convertPoints(u.id, b.points) },
  'POST /api/missions/claim': { auth: true, fn: (b, u) => claimMissions(u.id) },
  'POST /api/streak/claim': { auth: true, fn: (b, u) => claimStreak(u.id) },
  'GET /api/ranking': { fn: (b, u, t, url) => ({ ranking: ranking(20, url.searchParams.get('periodo') ?? 'geral') }) },
  'GET /api/rooms': { fn: () => ({ rooms: ROOMS, jogos: JOGOS }) },
  // Moderação: só quem está em ADMIN_EMAILS (ver server/admin.js).
  'GET /api/admin/resumo': { auth: true, fn: (b, u) => { exigirAdmin(u); return resumo(); } },
  'POST /api/admin/denuncia': { auth: true, fn: (b, u) => { exigirAdmin(u); return decidir(b.id, b.acao); } },
};

const sessao = ({ token, userId }) => ({ token, ...stateOf(userId) });

export const tokenDe = (req) => (req.headers.authorization ?? '').replace(/^Bearer /, '') || null;

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

/** @returns {boolean} true se a requisição era da API (tratada aqui). */
export async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;

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
    });
    res.end(Buffer.from(a.avatar));
    return true;
  }

  const rota = ROTAS[`${req.method} ${url.pathname}`];
  if (!rota) { json(res, 404, { error: 'Rota não encontrada' }); return true; }

  try {
    let user = null;
    const token = tokenDe(req);
    if (rota.auth) {
      user = userByToken(token);
      if (!user) throw new Erro('Faça login pra continuar', 401);
    }
    json(res, 200, (await rota.fn(await corpo(req, rota.max), user, token, url)) ?? { ok: true });
  } catch (e) {
    if (!(e instanceof Erro)) console.error('api:', e);
    json(res, e.status ?? 500, { error: e instanceof Erro ? e.message : 'Erro interno' });
  }
  return true;
}
