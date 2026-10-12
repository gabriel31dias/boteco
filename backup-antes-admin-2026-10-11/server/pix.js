// Cash-in Pix (Gatebox). Só o servidor fala com eles: o cliente nunca vê o
// client_secret nem opina sobre quanto foi pago.
// Lido na hora do uso, não no import: `import` é içado e o .env do index.js
// carrega depois.
const env = () => ({
  base: process.env.PIX_BASE ?? 'https://api.gatebox.com.br/v1/customers',
  id: process.env.PIX_CLIENT_ID,
  secret: process.env.PIX_CLIENT_SECRET,
});

export const pixConfigurado = () => !!(env().id && env().secret);

let cache = { token: null, expira: 0 };

async function token(renovar) {
  if (!renovar && cache.token && Date.now() < cache.expira) return cache.token;
  const { base, id, secret } = env();
  const r = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`gatebox auth ${r.status}`);
  cache = { token: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 };
  return cache.token;
}

async function call(rota, opcoes = {}, renovou = false) {
  const t = await token(renovou);
  const r = await fetch(`${env().base}${rota}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 401 && !renovou) return call(rota, opcoes, true);   // token vencido
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `gatebox ${r.status}`);
  return j;
}

/** Cobrança imediata: devolve o BR Code (copia e cola) pra pagar. */
export async function criarCobranca({ externalId, cents, expira, nome, email }) {
  const { data } = await call('/pix/create-immediate-qrcode', {
    method: 'POST',
    body: JSON.stringify({
      amount: cents / 100, externalId, expire: expira,
      description: 'Recarga Sinuca', name: nome, email,
    }),
  });
  if (!data?.key) throw new Error('gatebox não devolveu o código Pix');
  return { brcode: data.key, uuid: data.uuid };
}

const PAGO = new Set(['PAID', 'COMPLETED', 'CONFIRMED', 'APPROVED', 'SETTLED', 'SUCCESS']);

/** Status da cobrança no provedor. `centavos` é o valor que ele diz ter recebido. */
export async function consultarCobranca(externalId) {
  const r = await call(`/pix/invoice?externalId=${encodeURIComponent(externalId)}`, { method: 'GET' });
  // ponytail: a doc não fixa a palavra do status pago, mas `transaction` só
  // aparece quando o dinheiro entrou — ela é o sinal, a lista é cinto extra.
  const status = String(r?.data?.status ?? '').toUpperCase();
  return {
    pago: !!r?.transaction || PAGO.has(status),
    status,
    centavos: Math.round(Number(r?.data?.amount ?? 0) * 100),
  };
}
