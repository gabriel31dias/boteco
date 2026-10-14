// Auto-verificação da Forca no servidor: a palavra não vaza, os dois chutam
// sem vez, quem completa leva o pote, o relógio decide e W.O. paga quem ficou.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.FORCA_TEMPO = '1500';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const { TEMAS } = await import('../src/games/forca/palavras.js');
const R = await import('../src/games/forca/regras.js');

const PORT = 3455;
const { http, io } = listen(PORT, 'forca');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/forca', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@forca.com', 'Ana');
const beto = novo('beto@forca.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);
const ultimo = new Map();
for (const s of [A, B]) s.on('estado', (e) => ultimo.set(s, e));
async function partida() {
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  const [sa] = await Promise.all(s);
  assert.equal(sa.game, 'forca');
  await pausa(100);
  return sa.seat;
}

// --- a palavra não vaza; quem completa primeiro leva
{
  await partida();
  const e = ultimo.get(A);
  assert.ok(e.mascara.length > 1 && /^[_ -]+$/.test(e.mascara), 'só tracinhos');
  assert.ok(Object.keys(TEMAS).includes(e.tema));
  // descobre a palavra testando o banco do tema contra a máscara (o teste conhece o banco; o jogador não vê o servidor)
  const candidatas = TEMAS[e.tema].filter((w) => w.length === e.mascara.length && [...w].every((ch, k) => (e.mascara[k] === '_') === /[A-Z]/.test(R.base(ch))));
  const letras = [...new Set([...candidatas.join('')].map(R.base).filter((ch) => /[A-Z]/.test(ch)))];
  B.emit('jogada', { letra: 'Q' });   // o outro chuta ao mesmo tempo (sem vez)
  const pago = espera(A, 'settled');
  for (const l of letras) { A.emit('jogada', { letra: l }); await pausa(10); if (ultimo.get(A).fim) break; }
  const r = await pago;
  const f = ultimo.get(A).fim;
  if (f.vencedor === null) assert.ok(r.empate);
  else assert.ok(['palavra', 'enforcado'].includes(f.motivo), f.motivo);
  assert.ok(!ultimo.get(A).mascara.includes('_'), 'no fim abre a palavra');
  assert.ok(ultimo.get(B).rival.chutes > 0, 'o outro vê quantos chutes eu dei');
}
console.log('✔ palavra escondida, chutes sem vez e fim pago');

// --- relógio decide; W.O.
{
  await partida();
  B.emit('jogada', { letra: 'A' });
  const pagoB = espera(B, 'settled');
  await pagoB;
  assert.ok(['tempo', 'erros', 'empate'].includes(ultimo.get(B).fim.motivo), 'o relógio fechou a partida');
  await partida();
  const pB = espera(B, 'settled');
  A.emit('leave');
  assert.ok((await pB).prize > 0, 'W.O. paga quem ficou');
}
console.log('✔ relógio e W.O.');

A.close(); B.close(); io.close(); http.close();
console.log('forca: servidor ok');
process.exit(0);
