// Cash-in Pix contra um provedor de mentira: o que importa é creditar o valor
// certo, uma vez só, e só depois de o provedor confirmar.
process.env.DB = ':memory:';
process.env.PIX_CLIENT_ID = 'x';
process.env.PIX_CLIENT_SECRET = 'y';

const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');

let pago = false;          // o "banco" só confirma quando isto virar true
let consultas = 0;
const stub = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const responde = (o) => res.end(JSON.stringify(o));
  res.setHeader('content-type', 'application/json');
  if (url.pathname.endsWith('/auth/token')) return responde({ access_token: 't', expires_in: '8000' });
  if (url.pathname.endsWith('/create-immediate-qrcode')) return responde({ data: { key: '000201-brcode', uuid: 'u1' } });
  if (url.pathname.endsWith('/pix/invoice')) {
    consultas++;
    return responde({
      data: { status: pago ? 'PAID' : 'CREATED', amount: '30' },
      ...(pago ? { transaction: { transactionId: 'tx1' } } : {}),
    });
  }
  res.statusCode = 404; responde({ message: 'nao existe' });
});
await new Promise((ok) => stub.listen(0, ok));
process.env.PIX_BASE = `http://localhost:${stub.address().port}`;

const M = await import('./model.js');
const { userId } = M.register({ name: 'Ana', email: 'ana@ex.com', password: 'segredo123' });

await assert.rejects(M.criarPix(userId, 400), /mínimo/, 'abaixo de R$ 5,00 nem gera cobrança');

const cobranca = await M.criarPix(userId, 3000);
assert.equal(cobranca.brcode, '000201-brcode');
assert.equal(M.stateOf(userId).walletBalance, 0, 'gerar cobrança não credita nada');

let r = await M.conferirPix(userId, cobranca.externalId);
assert.equal(r.pago, false);
assert.equal(r.walletBalance, 0, 'sem confirmação do provedor, sem saldo');

pago = true;
r = await M.conferirPix(userId, cobranca.externalId);
assert.equal(r.pago, true);
assert.equal(r.walletBalance, 30, 'confirmado: R$ 30,00 na carteira');

r = await M.conferirPix(userId, cobranca.externalId);
assert.equal(r.walletBalance, 30, 'conferir de novo não credita duas vezes');
r = await M.conferirPix(userId);
assert.equal(r.walletBalance, 30, 'nem a conferência geral');

const antes = consultas;
await M.conferirPix(userId);
assert.equal(consultas, antes, 'cobrança já paga não vira consulta ao provedor');

assert.equal(M.stateOf(userId).transactions[0].title, 'Recarga via Pix');

stub.close();
console.log('pix: 10 verificações ok');
