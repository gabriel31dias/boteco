import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { all, one, run, tx } from './db.js';
import { consultarCobranca, criarCobranca, pixConfigurado } from './pix.js';
import { enviarCodigo } from './mail.js';
import { JOGO_PADRAO, jogoDe } from './jogos.js';
import { regras, taxaCasa } from './config.js';

// ---------------------------------------------------------------- catálogos

/** Colunas de assento, na ordem da mesa. Duplas usa a..d; o pôquer chega a f. */
export const ASSENTOS = ['a_id', 'b_id', 'c_id', 'd_id', 'e_id', 'f_id'];
const EM_ALGUM_ASSENTO = `? IN (${ASSENTOS.join(', ')})`;

/**
 * Salas: aposta em centavos. O prêmio (de 2 jogadores) é o pote menos a taxa da
 * casa, que o admin muda no painel: uma padrão (config.taxa_bp, 10%) e, se
 * quiser, uma por jogo (config.taxas_jogo).
 */
const SALAS = {
  treino: { name: 'Sala treino', stake: 0, points: 50 },
  bronze: { name: 'Sala bronze', stake: 200, points: 120 },
  prata: { name: 'Sala prata', stake: 500, points: 120 },
  ouro: { name: 'Sala ouro', stake: 1000, points: 120 },
  privada: { name: 'Sala privada', stake: 0, points: 50 },
};

/** Prêmio de uma mesa de 2 com essa entrada: o pote menos a taxa do jogo. */
export const premioDe = (stake, jogo) => (stake ? Math.round(stake * 2 * (1 - taxaCasa(jogo))) : 0);

const comPremio = (sala, jogo) => ({ ...sala, prize: premioDe(sala.stake, jogo) });

/** Catálogo com o prêmio pela taxa de agora (sem jogo: a taxa padrão). */
export const salas = (jogo) => Object.fromEntries(Object.entries(SALAS).map(([k, v]) => [k, comPremio(v, jogo)]));

/** `r_bronze` (id que o front usa) e `bronze` caem na mesma sala. */
export const roomOf = (type, jogo) => {
  const sala = SALAS[String(type ?? '').replace(/^r_/, '')];
  return sala ? comPremio(sala, jogo) : null;
};

export const MISSIONS = [
  { key: 'play20', title: 'Jogar 20 partidas', subtitle: 'Jogue qualquer modo', type: 'game', total: 20, rewardCoins: 150, color: 'purple' },
  { key: 'friends3', title: 'Jogar em sala privada', subtitle: 'Jogue 3 partidas com amigos', type: 'friends', total: 3, rewardCoins: 200, color: 'blue' },
  { key: 'pot10', title: 'Encaçapar 10 bolas', subtitle: 'Em qualquer modo', type: 'eliminations', total: 10, rewardCoins: 100, color: 'green' },
  { key: 'login', title: 'Fazer login diário', subtitle: 'Entre no app', type: 'login', total: 1, rewardCoins: 50, color: 'orange' },
  // Progresso calculado, não contado: a sequência de dias e o total de partidas
  // já vivem na tabela de usuários — um contador paralelo só sairia do lugar.
  // 300 moedas: o resgate paga o dobro em pontos (600) e 1.000 pontos valem
  // R$ 5,00, então dá exatamente R$ 3,00 na conversão.
  { key: 'fiel10', title: 'Fiel por 10 dias', subtitle: '10 dias seguidos de login + 1 partida',
    type: 'login', total: 11, rewardCoins: 300, color: 'blue',
    progresso: (u) => Math.min(10, u.streak_days) + (u.total_games > 0 ? 1 : 0) },
];

const ACHIEVEMENTS = [
  { key: 'trophy_streak', title: '10 vitórias seguidas', type: 'trophy_streak' },
  { key: 'first_withdraw', title: 'Primeiro saque', type: 'first_withdraw' },
  { key: 'top10', title: 'Top 10 da liga', type: 'top10' },
];

const LEAGUES = [[12000, 'Liga Diamante'], [6000, 'Liga Ouro'], [2000, 'Liga Prata'], [0, 'Liga Bronze']];
const leagueOf = (points) => LEAGUES.find(([min]) => points >= min)[1];

/** XP do nível atual pro próximo. Curva rasa de propósito: dá pra sentir progresso. */
export const xpToNext = (level) => 500 + (level - 1) * 250;

export const APOSTA_MAX = 500_00;          // teto de aposta em sala privada
export const POINTS_RATE = 5 / 1000;       // 1.000 pontos = R$ 5,00
const XP_WIN = 100, XP_LOSS = 30;
const PTS_WIN = 120, PTS_LOSS = -80;
const MAX_CENTS = 100_000_00;              // teto por operação: R$ 100.000

const now = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);

// -------------------------------------------------------------------- erros

export class Erro extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

/** Valor em reais vindo do cliente → centavos. Rejeita lixo antes do banco. */
export function toCents(v) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (!Number.isFinite(n)) throw new Erro('Valor inválido');
  const c = Math.round(n * 100);
  if (c <= 0) throw new Erro('O valor precisa ser maior que zero');
  if (c > MAX_CENTS) throw new Erro('Valor acima do limite por operação');
  return c;
}

/** Aposta escolhida pelo dono da sala privada → {stake, prize} em centavos. */
export function apostaPrivada(valor, jogo) {
  if (valor == null || valor === '' || Number(valor) === 0) return { stake: 0, prize: 0 };
  const stake = toCents(valor);
  if (stake > APOSTA_MAX) throw new Erro('Aposta acima do limite de R$ 500,00');
  return { stake, prize: premioDe(stake, jogo) };
}

/** Bônus conta pra entrar na sala; só não conta pra sacar. */
export function saldoDisponivel(userId) {
  const u = one('SELECT balance, bonus FROM users WHERE id = ?', userId);
  return u ? u.balance + u.bonus : 0;
}

// --------------------------------------------------------------------- auth

function hashPass(password) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPass(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

const newToken = () => randomBytes(32).toString('base64url');

function openSession(userId) {
  const token = newToken();
  run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, now());
  return token;
}

/** O @ é identidade pública: dois iguais confundem quem está jogando com quem. */
const usernameTomado = (username, exceto = 0) => !!one(
  'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?', username, exceto);

/** Primeiro @ livre a partir de uma base: @joao, @joao2, @joao3... */
function usernameLivre(base, exceto = 0) {
  let tentativa = base;
  for (let n = 2; usernameTomado(tentativa, exceto); n++) tentativa = `${base}${n}`;
  return tentativa;
}

const CODIGO_VALIDADE = 15 * 60 * 1000;   // 15 minutos
const CODIGO_TENTATIVAS = 5;              // erros antes de invalidar o código
const CODIGO_ESPERA = 60 * 1000;          // intervalo mínimo entre reenvios

const novoCodigo = () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');

/** Grava o código do usuário (um por vez) e devolve pra quem vai enviar. */
function gerarCodigo(userId) {
  const code = novoCodigo();
  run(`INSERT INTO email_codes (user_id, code, expires_at, tries, sent_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at,
                                          tries = 0, sent_at = excluded.sent_at`,
    userId, code, now() + CODIGO_VALIDADE, now());
  return code;
}

const novoCodigoRef = () => randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toUpperCase();

/** Código do indique e ganhe, criado na primeira vez que alguém precisa dele. */
export function codigoRef(userId) {
  const u = one('SELECT ref_code FROM users WHERE id = ?', userId);
  if (u?.ref_code) return u.ref_code;
  for (;;) {
    const code = novoCodigoRef();
    if (code.length < 6) continue;
    try { run('UPDATE users SET ref_code = ? WHERE id = ? AND ref_code IS NULL', code, userId); break; }
    catch (e) { if (!/UNIQUE/.test(e.message)) throw e; }   // colidiu: sorteia outro
  }
  return one('SELECT ref_code FROM users WHERE id = ?', userId).ref_code;
}

const VISITA_JANELA = 60 * 60 * 1000;   // link de influencer vale pro mesmo IP por 1h

/** Influencer ativo pelo código do link; sem código, a última visita desse IP. */
function influencerDoCadastro(inf, ip, email) {
  let infl = inf ? one('SELECT * FROM influencers WHERE codigo = ? AND ativo = 1', String(inf).trim()) : null;
  if (!infl && ip) {
    const v = one(`SELECT codigo FROM inf_visitas WHERE ip = ? AND criado_em > ? ORDER BY id DESC LIMIT 1`,
      ip, now() - VISITA_JANELA);
    if (v) infl = one('SELECT * FROM influencers WHERE codigo = ? AND ativo = 1', v.codigo);
  }
  if (!infl) return null;
  // Influencer não se inscreve no próprio link.
  const dono = one('SELECT email FROM users WHERE id = ?', infl.user_id);
  return dono && dono.email.toLowerCase() === email.toLowerCase() ? null : infl.id;
}

/** Visita pelo link do influencer: guarda o IP pro cadastro que vier depois. */
export function visitaInfluencer(codigo, ip) {
  codigo = String(codigo ?? '').trim().slice(0, 32);
  if (!codigo || !one('SELECT 1 FROM influencers WHERE codigo = ? AND ativo = 1', codigo)) return { ok: false };
  run('INSERT INTO inf_visitas (codigo, ip, criado_em) VALUES (?, ?, ?)', codigo, ip ?? null, now());
  return { ok: true };
}

export function register({ name, email, password, ref, inf }, ip = null) {
  name = String(name ?? '').trim();
  email = String(email ?? '').trim();
  password = String(password ?? '');
  if (!name || !email || !password) throw new Erro('Preencha todos os campos obrigatórios');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Erro('E-mail inválido');
  if (password.length < 6) throw new Erro('A senha precisa ter ao menos 6 caracteres');
  if (one('SELECT id FROM users WHERE email = ?', email)) throw new Erro('Esse e-mail já tem conta', 409);

  const base = `@${email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '')}`;
  const username = usernameLivre(base === '@' ? '@jogador' : base);
  // Sem sessão aqui: a conta nasce por confirmar, e login exige e-mail confirmado.
  const cfg = regras();
  const influencerId = influencerDoCadastro(inf, ip, email);
  const indicador = cfg.indicacao_ativa && ref
    ? one('SELECT id FROM users WHERE ref_code = ? COLLATE NOCASE AND bloqueado_em IS NULL', String(ref).trim())
    : null;
  const { id, code } = tx(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO users (name, username, email, pass, created_at, influencer_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      name, username, email, hashPass(password), now(), influencerId);
    const id = Number(lastInsertRowid);
    if (cfg.bonus_cadastro_ativo && cfg.bonus_cadastro > 0) {
      darBonus(id, { tipo: 'cadastro', chave: `cadastro:${id}`, valor: cfg.bonus_cadastro, titulo: 'Bônus de boas-vindas' });
    }
    if (indicador) {
      run('INSERT INTO indicacoes (indicador_id, indicado_id, criado_em) VALUES (?, ?, ?)', indicador.id, id, now());
    }
    return { id, code: gerarCodigo(id) };
  });
  enviarCodigo(email, name, code);   // e-mail não segura a resposta do cadastro
  return { userId: id, email, pendente: true };
}

/** Confere o código e libera a conta, já entrando. */
export function verifyEmail({ email, code }) {
  const u = one('SELECT * FROM users WHERE email = ?', String(email ?? '').trim());
  if (!u) throw new Erro('Código inválido', 400);
  if (u.bloqueado_em) throw new Erro('Conta bloqueada. Fale com o suporte.', 403);
  if (u.is_verified) return { token: tx(() => openSession(u.id)), userId: u.id };

  const linha = one('SELECT * FROM email_codes WHERE user_id = ?', u.id);
  if (!linha) throw new Erro('Peça um novo código', 400);
  if (linha.expires_at < now()) throw new Erro('O código expirou, peça outro', 400);
  if (linha.tries >= CODIGO_TENTATIVAS) throw new Erro('Muitas tentativas, peça outro código', 429);
  if (String(code ?? '').trim() !== linha.code) {
    run('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ?', u.id);
    throw new Erro('Código inválido', 400);
  }
  return tx(() => {
    run('UPDATE users SET is_verified = 1 WHERE id = ?', u.id);
    run('DELETE FROM email_codes WHERE user_id = ?', u.id);
    return { token: openSession(u.id), userId: u.id };
  });
}

/** Manda outro código. Resposta igual pra e-mail que não existe: não entrega quem tem conta. */
export function resendCode({ email }) {
  const u = one('SELECT * FROM users WHERE email = ?', String(email ?? '').trim());
  if (u && !u.is_verified) {
    const linha = one('SELECT sent_at FROM email_codes WHERE user_id = ?', u.id);
    if (linha && now() - linha.sent_at < CODIGO_ESPERA) {
      throw new Erro('Espere um minuto pra pedir outro código', 429);
    }
    enviarCodigo(u.email, u.name, tx(() => gerarCodigo(u.id)));
  }
  return { ok: true };
}

export function login({ email, password }) {
  const u = one('SELECT * FROM users WHERE email = ?', String(email ?? '').trim());
  // Mesma mensagem nos dois casos: não entrega quais e-mails existem.
  if (!u || !verifyPass(String(password ?? ''), u.pass)) throw new Erro('E-mail ou senha incorretos', 401);
  if (u.bloqueado_em) throw new Erro('Conta bloqueada. Fale com o suporte.', 403);
  if (!u.is_verified) {
    // Manda outro código junto: quem chegou aqui perdeu o primeiro e-mail.
    const linha = one('SELECT sent_at FROM email_codes WHERE user_id = ?', u.id);
    if (!linha || now() - linha.sent_at >= CODIGO_ESPERA) {
      enviarCodigo(u.email, u.name, tx(() => gerarCodigo(u.id)));
    }
    throw new Erro('Confirme seu e-mail para entrar. Mandamos um código novo.', 403);
  }
  const token = tx(() => openSession(u.id));
  bumpMission(u.id, 'login', 1);
  return { token, userId: u.id };
}

/** Conta criada pelo admin (influencer): já nasce confirmada, sem bônus de cadastro. */
export function criarContaVerificada({ nome, email, senha }) {
  nome = String(nome ?? '').trim().slice(0, 40);
  email = String(email ?? '').trim();
  if (!nome) throw new Erro('Informe o nome');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Erro('E-mail inválido');
  if (String(senha ?? '').length < 6) throw new Erro('A senha precisa ter ao menos 6 caracteres');
  if (one('SELECT id FROM users WHERE email = ?', email)) throw new Erro('Esse e-mail já tem conta', 409);
  const base = `@${email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '')}`;
  const { lastInsertRowid } = run(
    `INSERT INTO users (name, username, email, pass, created_at, is_verified) VALUES (?, ?, ?, ?, ?, 1)`,
    nome, usernameLivre(base === '@' ? '@parceiro' : base), email, hashPass(String(senha)), now());
  return Number(lastInsertRowid);
}

/** Troca a senha e derruba todas as sessões da conta. */
export function trocarSenha(userId, senha) {
  if (String(senha ?? '').length < 6) throw new Erro('A senha precisa ter ao menos 6 caracteres');
  run('UPDATE users SET pass = ? WHERE id = ?', hashPass(String(senha)), userId);
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export const logout = (token) => run('DELETE FROM sessions WHERE token = ?', String(token ?? ''));

export function updateProfile(userId, { name, username }) {
  name = String(name ?? '').trim().slice(0, 40);
  username = String(username ?? '').trim().replace(/^@/, '').toLowerCase()
    .replace(/[^a-z0-9._]/g, '').slice(0, 24);
  if (!name) throw new Erro('O nome não pode ficar vazio');
  if (!username) throw new Erro('Escolha um nome de usuário válido');
  if (usernameTomado(`@${username}`, userId)) throw new Erro(`@${username} já está em uso`, 409);
  run('UPDATE users SET name = ?, username = ? WHERE id = ?', name, `@${username}`, userId);
  return stateOf(userId);
}

// ------------------------------------------------------------------ foto

export const AVATAR_MAX = 64 * 1024;          // bytes da imagem, depois de decodificada
const AVATAR_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
// Assinatura real do arquivo: o tipo declarado no data URL é só uma alegação.
const ASSINATURA = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

/** URL pública da foto, ou null. A versão muda a cada troca: cache pode ser eterno. */
// API_URL: a foto é servida pela API, que em produção fica em outro domínio
// que o front. Sem ela a URL é relativa (dev, mesma origem). O `c=1` troca a
// URL de quem já estava em cache (immutable) sem o cabeçalho de CORS.
export const avatarUrl = (u) =>
  (u?.avatar_v ? `${process.env.API_URL ?? ''}/api/avatar/${u.id}?v=${u.avatar_v}&c=1` : null);

/** Troca (data URL) ou remove (null) a foto de perfil. */
export function setAvatar(userId, image) {
  if (image == null || image === '') {
    run('UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_v = 0 WHERE id = ?', userId);
    return stateOf(userId);
  }
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(image));
  if (!m || !AVATAR_TIPOS.includes(m[1])) throw new Erro('Envie uma imagem JPG, PNG ou WebP');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > AVATAR_MAX) throw new Erro('Imagem grande demais');
  if (!ASSINATURA[m[1]](bytes)) throw new Erro('O arquivo não é uma imagem válida');
  run('UPDATE users SET avatar = ?, avatar_type = ?, avatar_v = ? WHERE id = ?', bytes, m[1], now(), userId);
  return stateOf(userId);
}

export const avatarDe = (userId) =>
  one('SELECT avatar, avatar_type FROM users WHERE id = ? AND avatar IS NOT NULL', userId) ?? null;

export function userByToken(token) {
  if (!token) return null;
  return one(`SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
              WHERE s.token = ? AND u.bloqueado_em IS NULL`,
    String(token)) ?? null;
}

// ------------------------------------------------------------------ estado

/** Missão contada no user_missions ou calculada a partir do próprio usuário. */
const progressoDe = (def, u, linha) => (def.progresso ? def.progresso(u) : linha?.current ?? 0);

/**
 * Moderação: quem está em ADMIN_EMAILS (vírgula entre os e-mails, no .env). Não
 * existe papel de admin no banco; pra dar acesso, edite o .env e reinicie.
 */
export const ehAdmin = (u) => !!u && (process.env.ADMIN_EMAILS ?? '').split(',')
  .map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(u.email).toLowerCase());

/** Tudo que o front precisa numa chamada só. */
export function stateOf(userId) {
  const u = one('SELECT * FROM users WHERE id = ?', userId);
  if (!u) throw new Erro('Usuário não encontrado', 404);

  const progress = new Map(all('SELECT * FROM user_missions WHERE user_id = ?', userId)
    .map((m) => [m.key, m]));

  const missions = MISSIONS.map((m, i) => {
    const current = Math.min(progressoDe(m, u, progress.get(m.key)), m.total);
    return {
      id: String(i + 1), key: m.key, title: m.title, subtitle: m.subtitle, type: m.type,
      color: m.color, total: m.total, rewardCoins: m.rewardCoins,
      current, completed: current >= m.total, claimed: !!progress.get(m.key)?.claimed,
    };
  });

  const unlocked = new Set(all('SELECT key FROM achievements WHERE user_id = ?', userId).map((a) => a.key));
  const cfg = regras();

  return {
    profile: {
      id: u.id, name: u.name, username: u.username, email: u.email,
      level: u.level, currentXp: u.xp, nextLevelXp: xpToNext(u.level),
      isVerified: !!u.is_verified, league: leagueOf(u.points), leagueRank: rankOf(u.id),
      totalGames: u.total_games, wins: u.wins, avatarUrl: avatarUrl(u), isAdmin: ehAdmin(u),
      isInfluencer: !!one('SELECT 1 FROM influencers WHERE user_id = ? AND ativo = 1', u.id),
      winRate: u.total_games ? Math.round((u.wins / u.total_games) * 100) : 0,
    },
    walletBalance: u.balance / 100,
    bonusBalance: u.bonus / 100,
    inDisputeBalance: u.locked / 100,
    points: u.points,
    coins: u.coins,
    streakDays: u.streak_days,
    hasClaimedStreakToday: u.streak_day === today(),
    missions,
    transactions: all(
      'SELECT id, kind, title, amount, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30',
      userId).map((t) => ({ id: `t${t.id}`, title: t.title, at: t.created_at, amount: t.amount / 100, type: t.kind })),
    matchHistory: all(
      `SELECT m.*, ua.name AS a_name, ub.name AS b_name, uc.name AS c_name, ud.name AS d_name,
         ue.name AS e_name, uf.name AS f_name
       FROM matches m
       JOIN users ua ON ua.id = m.a_id JOIN users ub ON ub.id = m.b_id
       LEFT JOIN users uc ON uc.id = m.c_id LEFT JOIN users ud ON ud.id = m.d_id
       LEFT JOIN users ue ON ue.id = m.e_id LEFT JOIN users uf ON uf.id = m.f_id
       WHERE ? IN (${ASSENTOS.map((c) => `m.${c}`).join(', ')}) AND m.ended_at IS NOT NULL
       ORDER BY m.id DESC LIMIT 20`, userId).map((m) => {
      // Duplas: ganhou quem está no time (paridade do assento) do vencedor.
      // Sem duplas só o vencedor ganhou, e adversário é todo o resto da mesa.
      const assentos = assentosDe(m);
      const eu = assentos.indexOf(userId);
      const duplas = !!jogoDe(m.game)?.duplas;
      const win = m.winner_id != null && (duplas
        ? assentos.indexOf(m.winner_id) % 2 === eu % 2 : m.winner_id === userId);
      const nomes = [m.a_name, m.b_name, m.c_name, m.d_name, m.e_name, m.f_name];
      return {
        id: `m${m.id}`,
        opponent: nomes.filter((n, i) => n != null && (duplas ? i % 2 !== eu % 2 : i !== eu)).join(duplas ? ' e ' : ', '),
        game: m.game ?? JOGO_PADRAO,
        isWin: win, pts: win ? PTS_WIN : PTS_LOSS,
        prizeMoney: win && m.prize ? m.prize / 100 : undefined, at: m.ended_at,
      };
    }),
    saques: all(`SELECT id, valor, chave_pix, status, motivo, criado_em, decidido_em FROM saques
                  WHERE user_id = ? ORDER BY id DESC LIMIT 10`, userId).map((q) => ({
      id: q.id, valor: q.valor / 100, chavePix: q.chave_pix, status: q.status, motivo: q.motivo,
      criadoEm: q.criado_em, decididoEm: q.decidido_em,
    })),
    regrasSaque: { minimo: cfg.saque_minimo / 100, maxDia: cfg.saque_max_dia / 100 },
    indicacao: {
      ativa: !!cfg.indicacao_ativa, codigo: cfg.indicacao_ativa ? codigoRef(userId) : null,
      premio: cfg.indicacao_premio / 100, minPartidas: cfg.indicacao_min_partidas,
      percentual: cfg.indicacao_bp / 100,
      indicados: one('SELECT COUNT(*) n FROM indicacoes WHERE indicador_id = ?', userId).n,
      ganho: one(`SELECT COALESCE(SUM(valor), 0) v FROM bonus WHERE user_id = ? AND tipo = 'indicacao'`, userId).v / 100,
    },
    conversaoAtiva: !!cfg.conversao_ativa,
    achievements: [
      ...ACHIEVEMENTS.map((a, i) => ({ id: `a${i + 1}`, title: a.title, type: a.type, unlocked: unlocked.has(a.key) })),
      { id: 'a4', title: 'Bloqueada', type: 'locked', unlocked: false },
    ],
  };
}

const rankOf = (userId) => one(
  'SELECT COUNT(*) + 1 AS r FROM users WHERE points > (SELECT points FROM users WHERE id = ?)', userId).r;

/** Início do período no horário do servidor. Semana começa na segunda. */
function inicioDo(periodo, d = new Date()) {
  const ini = new Date(d.getFullYear(), d.getMonth(), periodo === 'mes' ? 1 : d.getDate());
  if (periodo === 'semana') ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
  return ini.getTime();
}

export const PERIODOS = ['dia', 'semana', 'mes', 'geral'];

/**
 * Geral = pontos acumulados da conta. Dia/semana/mês = pontos ganhos nas
 * partidas encerradas no período, com a mesma regra do settleMatch (vitória,
 * derrota e bônus de sala grátis), nunca abaixo de zero.
 */
export function ranking(limit = 20, periodo = 'geral') {
  limit = Math.min(Number(limit) || 20, 100);
  const cols = 'id, name, username, points, wins, avatar_v';
  const comRank = (u, i) => ({
    id: u.id, name: u.name, username: u.username, points: u.points, wins: u.wins,
    avatarUrl: avatarUrl(u), rank: i + 1, league: leagueOf(u.points),
  });
  if (!PERIODOS.includes(periodo) || periodo === 'geral') {
    return all(`SELECT ${cols} FROM users ORDER BY points DESC, wins DESC, id LIMIT ?`, limit).map(comRank);
  }

  // ponytail: soma em JS sobre as partidas do período; vira tabela de pontos por dia se o volume crescer
  const placar = new Map();
  for (const m of all(`SELECT * FROM matches WHERE status = 'settled' AND ended_at >= ?`, inicioDo(periodo))) {
    const bonusSala = m.stake ? 0 : roomOf(m.room_type, m.game)?.points ?? 0;
    for (const id of assentosDe(m)) {
      const p = placar.get(id) ?? { points: 0, wins: 0 };
      const ganhou = venceu(m, id);
      p.points += ganhou ? PTS_WIN + bonusSala : PTS_LOSS;
      p.wins += ganhou ? 1 : 0;
      placar.set(id, p);
    }
  }
  const top = [...placar].map(([id, p]) => ({ id, points: Math.max(0, p.points), wins: p.wins }))
    .sort((x, y) => y.points - x.points || y.wins - x.wins || x.id - y.id).slice(0, limit);
  if (!top.length) return [];
  const users = new Map(all(`SELECT ${cols} FROM users WHERE id IN (${top.map(() => '?').join(',')})`,
    ...top.map((t) => t.id)).map((u) => [u.id, u]));
  return top.filter((t) => users.has(t.id)).map((t, i) => comRank({ ...users.get(t.id), ...t }, i));
}

// ------------------------------------------------------------------ dinheiro

export function logTx(userId, kind, title, amount) {
  run('INSERT INTO transactions (user_id, kind, title, amount, created_at) VALUES (?, ?, ?, ?, ?)',
    userId, kind, title, amount, now());
}

export function deposit(userId, cents) {
  return tx(() => {
    run('UPDATE users SET balance = balance + ? WHERE id = ?', cents, userId);
    logTx(userId, 'deposit', 'Recarga via Pix', cents);
    return stateOf(userId);
  });
}

// ----------------------------------------------------------------- pix cash-in

export const PIX_MIN = 300;          // R$ 3,00
const PIX_EXPIRA = 3600;             // segundos de validade da cobrança

/** Gera a cobrança no provedor e guarda como pendente. Nada de saldo aqui. */
export async function criarPix(userId, cents) {
  if (!pixConfigurado()) throw new Erro('Pix indisponível no momento', 503);
  if (cents < PIX_MIN) throw new Erro('O depósito mínimo é de R$ 3,00');
  const u = one('SELECT name, email FROM users WHERE id = ?', userId);
  const externalId = `sinuca-${userId}-${randomBytes(6).toString('hex')}`;
  const { brcode } = await criarCobranca({ externalId, cents, expira: PIX_EXPIRA, nome: u.name, email: u.email });
  const agora = now();
  const expiresAt = agora + PIX_EXPIRA * 1000;
  run(`INSERT INTO pix_charges (external_id, user_id, amount, brcode, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`, externalId, userId, cents, brcode, agora, expiresAt);
  return { externalId, brcode, amount: cents / 100, expiresAt };
}

/** Credita uma vez só: quem ganha o UPDATE pending -> paid é quem credita. */
function creditarPix(c) {
  return tx(() => {
    const { changes } = run(
      `UPDATE pix_charges SET status = 'paid', paid_at = ? WHERE external_id = ? AND status = 'pending'`,
      now(), c.external_id);
    if (!changes) return false;
    run('UPDATE users SET balance = balance + ? WHERE id = ?', c.amount, c.user_id);
    logTx(c.user_id, 'deposit', 'Recarga via Pix', c.amount);
    liberarIndicacao(c.user_id);
    return true;
  });
}

/**
 * Pergunta ao provedor sobre as cobranças pendentes do usuário e credita as
 * pagas. Sem `externalId`, confere todas — é o que salva quem pagou e fechou o
 * app antes do crédito.
 * ponytail: polling. Webhook (PIX_PAY_IN) é o caminho certo quando houver URL
 * pública; ele chamaria creditarPix do mesmo jeito.
 */
export async function conferirPix(userId, externalId) {
  const pendentes = all(
    `SELECT * FROM pix_charges WHERE user_id = ? AND status = 'pending'${externalId ? ' AND external_id = ?' : ''}`,
    ...(externalId ? [userId, externalId] : [userId]));

  let creditou = false;
  for (const c of pendentes) {
    let r;
    try { r = await consultarCobranca(c.external_id); }
    catch (e) { console.error('pix consulta:', e.message); continue; }
    // Só entra o que o provedor confirma, e nunca mais do que ele recebeu.
    if (r.pago && r.centavos >= c.amount) creditou = creditarPix(c) || creditou;
    else if (!r.pago && now() > c.expires_at) {
      run(`UPDATE pix_charges SET status = 'expired' WHERE external_id = ? AND status = 'pending'`, c.external_id);
    }
  }

  const c = externalId && one('SELECT status FROM pix_charges WHERE external_id = ? AND user_id = ?', externalId, userId);
  return { pago: c ? c.status === 'paid' : creditou, status: c ? c.status : null, ...stateOf(userId) };
}

const TIPOS_CHAVE = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
const inicioDoDiaSP = () => {
  const d = new Date(now() - 3 * 3600_000);   // São Paulo, UTC−3
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * 3600_000;
};

/**
 * Pedido de saque: o valor sai do saldo na hora (fica reservado) e o pedido
 * entra na fila do painel. O admin faz o Pix e aprova, ou cancela e devolve.
 */
export function withdraw(userId, cents, pixKey, tipoChave = null) {
  const u0 = one('SELECT is_verified FROM users WHERE id = ?', userId);
  if (!u0?.is_verified) throw new Erro('Confirme seu e-mail antes de sacar', 403);
  const key = String(pixKey ?? '').trim().slice(0, 140);
  if (!key) throw new Erro('Informe a chave Pix');
  if (key.includes('*')) throw new Erro('Digite a chave Pix completa');
  const tipo = TIPOS_CHAVE.includes(tipoChave) ? tipoChave : null;
  const cfg = regras();
  if (cents < cfg.saque_minimo) {
    throw new Erro(`O saque mínimo é de R$ ${(cfg.saque_minimo / 100).toFixed(2).replace('.', ',')}`);
  }
  if (cfg.saque_exige_deposito
    && !one(`SELECT 1 FROM pix_charges WHERE user_id = ? AND status = 'paid'`, userId)) {
    throw new Erro('Faça um depósito antes do primeiro saque');
  }
  return tx(() => {
    if (cfg.saque_max_dia) {
      const hoje = one(`SELECT COALESCE(SUM(valor), 0) v FROM saques
                        WHERE user_id = ? AND status <> 'cancelado' AND criado_em >= ?`, userId, inicioDoDiaSP()).v;
      if (hoje + cents > cfg.saque_max_dia) {
        throw new Erro(`Limite de saque por dia: R$ ${(cfg.saque_max_dia / 100).toFixed(2).replace('.', ',')}`);
      }
    }
    // Bônus não é sacável — só o que entrou como saldo real sai.
    const u = one('SELECT balance FROM users WHERE id = ?', userId);
    if (!u || u.balance < cents) throw new Erro('Saldo insuficiente para saque');
    run('UPDATE users SET balance = balance - ? WHERE id = ?', cents, userId);
    run(`INSERT INTO saques (user_id, valor, chave_pix, tipo_chave, saldo_no_pedido, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)`, userId, cents, key, tipo, u.balance, now());
    logTx(userId, 'withdrawal', 'Saque solicitado via Pix', -cents);
    return stateOf(userId);
  });
}

/** Admin pagou o Pix: o pedido sai da fila. O saldo já tinha saído no pedido. */
export function aprovarSaque(id, por) {
  return tx(() => {
    const q = one(`SELECT * FROM saques WHERE id = ?`, Number(id));
    if (!q) throw new Erro('Saque não encontrado', 404);
    const { changes } = run(`UPDATE saques SET status = 'aprovado', decidido_em = ?, decidido_por = ?
                             WHERE id = ? AND status = 'pendente'`, now(), por, q.id);
    if (!changes) throw new Erro('Esse saque já foi decidido', 409);
    unlock(q.user_id, 'first_withdraw');
    return { ok: true };
  });
}

/** Cancelado: o valor volta pro saldo e o jogador vê o motivo. */
export function cancelarSaque(id, motivo, por) {
  motivo = String(motivo ?? '').trim().slice(0, 300);
  if (motivo.length < 3) throw new Erro('Escreva o motivo do cancelamento');
  return tx(() => {
    const q = one(`SELECT * FROM saques WHERE id = ?`, Number(id));
    if (!q) throw new Erro('Saque não encontrado', 404);
    const { changes } = run(`UPDATE saques SET status = 'cancelado', motivo = ?, decidido_em = ?, decidido_por = ?
                             WHERE id = ? AND status = 'pendente'`, motivo, now(), por, q.id);
    if (!changes) throw new Erro('Esse saque já foi decidido', 409);
    run('UPDATE users SET balance = balance + ? WHERE id = ?', q.valor, q.user_id);
    logTx(q.user_id, 'withdrawal', `Saque cancelado: ${motivo}`, q.valor);
    return { ok: true };
  });
}

export function convertPoints(userId, pts) {
  pts = Math.floor(Number(pts));
  if (!Number.isFinite(pts) || pts <= 0) throw new Erro('Quantidade de pontos inválida');
  if (!regras().conversao_ativa) throw new Erro('A conversão de pontos está pausada');
  return tx(() => {
    const u = one('SELECT points FROM users WHERE id = ?', userId);
    if (!u || u.points < pts) throw new Erro('Pontos insuficientes');
    const cents = Math.floor(pts * POINTS_RATE * 100);
    if (cents <= 0) throw new Erro('Converta ao menos 200 pontos');
    run('UPDATE users SET points = points - ?, balance = balance + ? WHERE id = ?', pts, cents, userId);
    const titulo = `Conversão de ${pts.toLocaleString('pt-BR')} pontos`;
    const { lastInsertRowid } = run(
      'INSERT INTO transactions (user_id, kind, title, amount, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, 'reward', titulo, cents, now());
    // Vai pro saldo, não pro bônus — mas é dinheiro que a casa deu: entra no custo.
    run(`INSERT INTO bonus (chave, tipo, user_id, valor, motivo, criado_em) VALUES (?, 'conversao', ?, ?, ?, ?)`,
      `conversao:${lastInsertRowid}`, userId, cents, titulo, now());
    return stateOf(userId);
  });
}

// ------------------------------------------------------------------ missões

export function bumpMission(userId, key, by = 1) {
  const def = MISSIONS.find((m) => m.key === key);
  if (!def) return;
  run(`INSERT INTO user_missions (user_id, key, current) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET current = min(current + ?, ?)`,
    userId, key, Math.min(by, def.total), by, def.total);
}

export function claimMissions(userId) {
  return tx(() => {
    const u = one('SELECT * FROM users WHERE id = ?', userId);
    const linhas = new Map(all('SELECT * FROM user_missions WHERE user_id = ?', userId)
      .map((r) => [r.key, r]));
    let coins = 0;
    for (const def of MISSIONS) {
      const linha = linhas.get(def.key);
      if (linha?.claimed) continue;
      if (progressoDe(def, u, linha) < def.total) continue;
      coins += def.rewardCoins;
      // Missão de progresso calculado pode não ter linha ainda: cria pra marcar.
      run(`INSERT INTO user_missions (user_id, key, current, claimed) VALUES (?, ?, ?, 1)
           ON CONFLICT(user_id, key) DO UPDATE SET claimed = 1`, userId, def.key, def.total);
    }
    if (!coins) throw new Erro('Nenhuma recompensa pra resgatar');
    run('UPDATE users SET coins = coins + ?, points = points + ? WHERE id = ?', coins, coins * 2, userId);
    return { coins, state: stateOf(userId) };
  });
}

export function claimStreak(userId) {
  return tx(() => {
    const u = one('SELECT streak_day, streak_days FROM users WHERE id = ?', userId);
    if (u.streak_day === today()) throw new Erro('Sequência de hoje já confirmada');
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dias = u.streak_day === ontem ? u.streak_days + 1 : 1;   // pulou um dia, zera
    run('UPDATE users SET streak_day = ?, streak_days = ?, coins = coins + 50 WHERE id = ?',
      today(), dias, userId);
    return { streakDays: dias, state: stateOf(userId) };
  });
}

// ---------------------------------------------------------- bônus e comissões

/**
 * Crédito de bônus (não sacável) com registro no livro `bonus`. A chave única
 * garante uma vez só: devolve false se já tinha sido dado.
 */
export function darBonus(userId, { tipo, chave, valor, titulo, motivo = null, por = null, origemId = null }) {
  if (!(valor > 0)) return false;
  const { changes } = run(
    `INSERT OR IGNORE INTO bonus (chave, tipo, user_id, valor, motivo, criado_por, origem_id, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, chave, tipo, userId, valor, motivo ?? titulo, por, origemId, now());
  if (!changes) return false;
  run('UPDATE users SET bonus = bonus + ? WHERE id = ?', valor, userId);
  logTx(userId, 'reward', titulo, valor);
  return true;
}

/**
 * Indique e ganhe: o prêmio fixo sai quando o indicado já depositou e jogou o
 * mínimo de partidas pagas. Chamado no depósito e no fim de cada partida.
 */
export function liberarIndicacao(indicadoId) {
  const cfg = regras();
  if (!cfg.indicacao_ativa) return false;
  const ind = one(`SELECT * FROM indicacoes WHERE indicado_id = ? AND status = 'pendente'`, indicadoId);
  if (!ind) return false;
  if (!one(`SELECT 1 FROM pix_charges WHERE user_id = ? AND status = 'paid'`, indicadoId)) return false;
  const jogou = one(`SELECT COUNT(*) n FROM matches WHERE status = 'settled' AND stake > 0
                       AND ? IN (a_id, b_id, c_id, d_id)`, indicadoId).n;
  if (jogou < cfg.indicacao_min_partidas) return false;
  const { changes } = run(`UPDATE indicacoes SET status = 'liberada', premio = ?, liberada_em = ?
                           WHERE id = ? AND status = 'pendente'`, cfg.indicacao_premio, now(), ind.id);
  if (!changes) return false;
  const nome = one('SELECT name FROM users WHERE id = ?', indicadoId)?.name ?? 'amigo';
  darBonus(ind.indicador_id, { tipo: 'indicacao', chave: `ind-premio:${indicadoId}`, valor: cfg.indicacao_premio,
    titulo: `Indicação de ${nome}`, origemId: indicadoId });
  return true;
}

/**
 * Taxa da partida dividida por jogador; dessa parte sai a comissão do
 * influencer de quem entrou pelo link dele e a % de quem indicou o jogador.
 * Tudo dentro da transação do settle: sem partida paga, sem comissão.
 */
function repartirTaxa(m, assentos, rake) {
  const cfg = regras();
  const parte = Math.floor(rake / assentos.length);
  for (const id of assentos) {
    const u = one('SELECT influencer_id FROM users WHERE id = ?', id);
    if (u?.influencer_id) {
      const inf = one('SELECT * FROM influencers WHERE id = ? AND ativo = 1', u.influencer_id);
      const bp = inf ? (inf.percentual_bp ?? cfg.inf_bp) : 0;
      const valor = Math.floor(parte * bp / 10_000);
      if (valor > 0) {
        run(`INSERT OR IGNORE INTO inf_comissoes (chave, influencer_id, indicado_id, match_id, jogo, base, valor, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, `taxa:${m.id}:${id}`, inf.id, id, m.id, m.game, parte, valor, now());
      }
    }
    if (cfg.indicacao_ativa) {
      const ind = one('SELECT indicador_id FROM indicacoes WHERE indicado_id = ?', id);
      const valor = ind ? Math.floor(parte * cfg.indicacao_bp / 10_000) : 0;
      if (valor > 0) {
        darBonus(ind.indicador_id, { tipo: 'indicacao', chave: `ind-taxa:${m.id}:${id}`, valor,
          titulo: `Comissão de indicação · partida #${m.id}`, origemId: id });
      }
      liberarIndicacao(id);
    }
  }
}

const unlock = (userId, key) =>
  run('INSERT OR IGNORE INTO achievements (user_id, key, unlocked_at) VALUES (?, ?, ?)', userId, key, now());

// ------------------------------------------------------------------ partidas

/**
 * Assentos da partida na ordem da mesa: a, b e, nas duplas, c e d. O time é a
 * paridade do assento — a e c contra b e d.
 */
export const assentosDe = (m) => ASSENTOS.map((c) => m[c]).filter((id) => id != null);
const bonusDe = (m) => [m.a_bonus, m.b_bonus, m.c_bonus, m.d_bonus, m.e_bonus, m.f_bonus];

/**
 * Sentado numa partida aberta. No pôquer quem é eliminado se levanta antes do
 * fim (`fora`): a entrada dele segue no pote, mas ele já pode jogar outra.
 */
export function emPartida(userId) {
  return all(`SELECT fora FROM matches WHERE status = 'playing' AND ${EM_ALGUM_ASSENTO}`, userId)
    .some((m) => !m.fora.split(',').includes(String(userId)));
}

export function liberarAssento(matchId, userId) {
  run(`UPDATE matches SET fora = fora || ? WHERE id = ? AND status = 'playing' AND instr(',' || fora, ?) = 0`,
    `${userId},`, matchId, `,${userId},`);
}

/** Abre a partida e prende a aposta de todos. Bônus é gasto antes do saldo. */
export function openMatch({ game = JOGO_PADRAO, roomType, code, aId, bId, cId = null, dId = null, eId = null, fId = null, stake, prize }) {
  const base = roomOf(roomType, game);
  if (!base) throw new Erro('Sala inválida');
  if (!jogoDe(game)) throw new Erro('Jogo inválido');
  const ids = [aId, bId, cId, dId, eId, fId].filter((id) => id != null);
  // Um processo por jogo não enxerga a sala do outro: sem esta trava o mesmo
  // usuário casa nos dois ao mesmo tempo e paga duas entradas.
  if (ids.some(emPartida)) throw new Erro('Um de vocês já está em outra partida', 409);
  // Sala privada traz a aposta combinada; as fixas usam a do catálogo.
  const sala = stake == null ? base : { ...base, stake, prize };
  // `prize` do catálogo é o de 2 jogadores. Sem duplas o vencedor leva o pote:
  // com mais gente na mesa ele cresce na mesma proporção (mesma taxa da casa).
  const duplas = !!jogoDe(game).duplas;
  const room = duplas ? sala : { ...sala, prize: Math.round(sala.prize * ids.length / 2) };
  const vencedores = duplas ? ids.length / 2 : 1;
  if (room.stake < 0 || room.prize < 0 || room.prize * vencedores > room.stake * ids.length) {
    throw new Erro('Aposta inválida');   // prêmio nunca pode criar dinheiro
  }
  return tx(() => {
    const doBonus = ids.map((id) => (room.stake ? debitStake(id, room.stake, room.name) : 0));
    const { lastInsertRowid } = run(
      `INSERT INTO matches (code, game, room_type, stake, prize,
         a_bonus, b_bonus, c_bonus, d_bonus, e_bonus, f_bonus,
         a_id, b_id, c_id, d_id, e_id, f_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'playing', ?)`,
      code ?? null, game, roomType, room.stake, room.prize,
      ...[0, 1, 2, 3, 4, 5].map((i) => doBonus[i] ?? 0), aId, bId, cId, dId, eId, fId, now());
    return { id: Number(lastInsertRowid), room };
  });
}

function debitStake(userId, stake, roomName) {
  const u = one('SELECT balance, bonus FROM users WHERE id = ?', userId);
  if (!u || u.balance + u.bonus < stake) throw new Erro('Saldo insuficiente para entrar na sala');
  const fromBonus = Math.min(u.bonus, stake);
  run('UPDATE users SET bonus = bonus - ?, balance = balance - ?, locked = locked + ? WHERE id = ?',
    fromBonus, stake - fromBonus, stake, userId);
  logTx(userId, 'tournament_entry', `Entrada · ${roomName}`, -stake);
  return fromBonus;
}

/**
 * Fecha a partida: prêmio pro vencedor, XP e pontos pra todos. Nas duplas
 * `winnerId` é qualquer um do time que ganhou, e os dois levam o `prize`
 * inteiro — cada um pagou a sua entrada, então cada um recebe o seu prêmio.
 * Sem duplas só o `winnerId` ganha (o `prize` já é o pote, ver openMatch).
 */
export function settleMatch(matchId, winnerId, stats = {}) {
  return tx(() => {
    const m = one('SELECT * FROM matches WHERE id = ? AND status = ?', matchId, 'playing');
    if (!m) throw new Erro('Partida não está aberta', 409);
    const assentos = assentosDe(m);
    const lado = assentos.indexOf(winnerId);
    if (lado < 0) throw new Erro('Vencedor não é dessa partida');
    const vencedores = jogoDe(m.game)?.duplas
      ? assentos.filter((_, i) => i % 2 === lado % 2)
      : [winnerId];

    for (const id of assentos) {
      const ganhou = vencedores.includes(id);
      if (m.stake) run('UPDATE users SET locked = locked - ? WHERE id = ?', m.stake, id);
      if (m.stake && ganhou) {
        run('UPDATE users SET balance = balance + ? WHERE id = ?', m.prize, id);
        logTx(id, 'reward', `Prêmio da partida #${m.id}`, m.prize);
      }
      grant(id, ganhou ? { xp: XP_WIN, points: PTS_WIN, win: true } : { xp: XP_LOSS, points: PTS_LOSS, win: false });
    }

    const room = roomOf(m.room_type);
    if (!m.stake && room?.points) {
      for (const id of vencedores) run('UPDATE users SET points = points + ? WHERE id = ?', room.points, id);
    }

    for (const id of assentos) {
      bumpMission(id, 'play20', 1);
      if (m.code) bumpMission(id, 'friends3', 1);
      const potted = Number(stats[id]?.potted) || 0;
      if (potted > 0) bumpMission(id, 'pot10', potted);
    }
    const rake = m.stake * assentos.length - (m.stake ? m.prize * vencedores.length : 0);
    run(`UPDATE matches SET winner_id = ?, status = 'settled', ended_at = ?, rake = ? WHERE id = ?`,
      winnerId, now(), rake, matchId);
    if (rake > 0) repartirTaxa(m, assentos, rake);

    // Depois de fechar a partida: streakWins olha as 10 últimas já encerradas,
    // e esta é a décima. Antes daqui a conquista só saía na 11ª vitória.
    for (const id of vencedores) {
      if (streakWins(id) >= 10) unlock(id, 'trophy_streak');
      if (rankOf(id) <= 10) unlock(id, 'top10');
    }
    return { matchId, winnerId, winners: vencedores, prize: m.prize };
  });
}

/**
 * Partidas que ficaram "em andamento" de um processo que caiu ou reiniciou: a
 * mesa vivia em memória e sumiu. Sem isto os jogadores ficam presos ("já está
 * em outra partida") e a entrada fica travada no `locked`. Estorna cada uma.
 * Só chame ao SUBIR o processo daquele jogo: aí nenhuma delas tem mesa viva.
 */
export function estornarOrfas(game) {
  const orfas = all(`SELECT id FROM matches WHERE status = 'playing' AND game = ?`, game);
  for (const { id } of orfas) refundMatch(id, 'interrupted');
  return orfas.length;
}

/**
 * Conferência do dinheiro, pro painel de moderação: o travado (`locked`) de
 * cada um tem que ser a soma das entradas das partidas abertas dele, e ninguém
 * pode ter saldo, bônus ou travado negativo. Lista só o que está errado.
 */
export function auditoria() {
  const esperado = new Map();
  for (const m of all(`SELECT * FROM matches WHERE status = 'playing'`)) {
    for (const id of assentosDe(m)) esperado.set(id, (esperado.get(id) ?? 0) + m.stake);
  }
  const problemas = [];
  for (const u of all('SELECT id, name, email, balance, bonus, locked FROM users')) {
    const deveria = esperado.get(u.id) ?? 0;
    if (u.locked !== deveria) problemas.push({ ...u, tipo: 'travado', deveria });
    if (u.balance < 0 || u.bonus < 0 || u.locked < 0) problemas.push({ ...u, tipo: 'negativo' });
  }
  return problemas;
}

/** Ninguém ganhou (saiu no meio, ou os dois relataram vencedores diferentes). */
export function refundMatch(matchId, status = 'refunded') {
  return tx(() => {
    const m = one('SELECT * FROM matches WHERE id = ? AND status = ?', matchId, 'playing');
    if (!m) return null;
    if (m.stake) {
      // Devolve cada parte pra onde veio: bônus que virasse saldo sacável seria
      // uma torneira de dinheiro (abre partida, aborta, saca o bônus).
      const bonus = bonusDe(m);
      for (const [i, id] of assentosDe(m).entries()) {
        const doBonus = bonus[i] ?? 0;
        run('UPDATE users SET locked = locked - ?, bonus = bonus + ?, balance = balance + ? WHERE id = ?',
          m.stake, doBonus, m.stake - doBonus, id);
        logTx(id, 'reward', `Estorno da partida #${m.id}`, m.stake);
      }
    }
    run('UPDATE matches SET status = ?, ended_at = ? WHERE id = ?', status, now(), matchId);
    return { matchId, status };
  });
}

function grant(userId, { xp, points, win }) {
  const u = one('SELECT level, xp, points FROM users WHERE id = ?', userId);
  let level = u.level;
  let acc = u.xp + xp;
  while (acc >= xpToNext(level)) { acc -= xpToNext(level); level++; }
  run(`UPDATE users SET level = ?, xp = ?, points = max(0, points + ?),
       total_games = total_games + 1, wins = wins + ? WHERE id = ?`,
    level, acc, points, win ? 1 : 0, userId);
}

const streakWins = (userId) => {
  const rows = all(
    `SELECT * FROM matches WHERE ${EM_ALGUM_ASSENTO} AND status = 'settled'
     ORDER BY id DESC LIMIT 10`, userId);
  return rows.length === 10 && rows.every((m) => venceu(m, userId)) ? 10 : 0;
};

// Sem duplas só o vencedor ganhou; paridade de assento só vale pra time.
function venceu(m, userId) {
  if (!jogoDe(m.game)?.duplas) return m.winner_id === userId;
  const a = assentosDe(m);
  return a.indexOf(m.winner_id) % 2 === a.indexOf(userId) % 2;
}
