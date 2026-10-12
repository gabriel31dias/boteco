const CHAVE = 'sinuca.token';

export let token = (() => { try { return localStorage.getItem(CHAVE); } catch { return null; } })();

export function setToken(t) {
  token = t || null;
  try { t ? localStorage.setItem(CHAVE, t) : localStorage.removeItem(CHAVE); } catch { /* modo privado */ }
}

async function call(rota, { method = 'POST', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${rota}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // O status vai junto: quem chamou precisa distinguir "senha errada" de
    // "e-mail por confirmar" sem ler a mensagem.
    const erro = new Error(data.error || 'Algo deu errado');
    erro.status = res.status;
    throw erro;
  }
  return data;
}

export const api = {
  register: (body) => call('/register', { body }),
  verify: (email, code) => call('/verify', { body: { email, code } }),
  resendCode: (email) => call('/verify/resend', { body: { email } }),
  login: (body) => call('/login', { body }),
  logout: () => call('/logout'),
  me: () => call('/me', { method: 'GET' }),
  pixCriar: (amount) => call('/deposit/pix', { body: { amount } }),
  pixConferir: (externalId) => call('/deposit/pix/check', { body: { externalId } }),
  withdraw: (amount, pixKey) => call('/withdraw', { body: { amount, pixKey } }),
  convert: (points) => call('/convert', { body: { points } }),
  claimMissions: () => call('/missions/claim'),
  claimStreak: () => call('/streak/claim'),
  ranking: (periodo = 'geral') => call(`/ranking?periodo=${periodo}`, { method: 'GET' }),
  rooms: () => call('/rooms', { method: 'GET' }),
  updateProfile: (name, username) => call('/profile', { body: { name, username } }),
  /** `image`: data URL já reduzida, ou null pra remover. */
  setAvatar: (image) => call('/avatar', { body: { image } }),
  // Moderação (só ADMIN_EMAILS; o servidor recusa o resto)
  adminResumo: () => call('/admin/resumo', { method: 'GET' }),
  adminDecidir: (id, acao) => call('/admin/denuncia', { body: { id, acao } }),
};
