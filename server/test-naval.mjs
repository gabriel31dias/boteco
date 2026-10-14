// Auto-verificação da Batalha Naval no servidor: a frota do outro não vaza,
// o tiro passa a vez (ou não, se acertou), afundar tudo paga o vencedor, o
// relógio posiciona sozinho e quem sai no meio perde por W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.NAVAL_POSICIONAR = '600';
process.env.NAVAL_TEMPO = '400';
process.env.NAVAL_ANIMA = '0';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/naval/regras.js');

const PORT = 3454;
const { http, io } = listen(PORT, 'naval');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/naval', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@naval.com', 'Ana');
const beto = novo('beto@naval.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);
const ultimo = new Map();
for (const s of [A, B]) s.on('estado', (e) => ultimo.set(s, e));

async function partida() {
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  const [sa, sb] = await Promise.all(s);
  assert.equal(sa.game, 'naval');
  await pausa(100);
  return [sa.seat, sb.seat];
}
const certa = [{ id: 'porta', x: 0, y: 0, horiz: true }, { id: 'encouracado', x: 0, y: 2, horiz: true }, { id: 'cruzador', x: 0, y: 4, horiz: true },
  { id: 'submarino', x: 0, y: 6, horiz: true }, { id: 'contra1', x: 0, y: 8, horiz: true }, { id: 'contra2', x: 9, y: 0, horiz: false }];

// --- partida inteira: frota escondida, tiros, vitória paga
{
  const antes = [total(ana.userId), total(beto.userId)];
  const [sa] = await partida();
  assert.ok(total(ana.userId) < antes[0], 'entrada debitada');
  const eA = ultimo.get(A);
  assert.equal(eA.fase, 'posicionar');
  assert.equal(eA.minhaFrota.length, R.FROTA.length, 'já vem com frota sorteada');
  assert.deepEqual(eA.afundados, [], 'nada do outro aparece');
  A.emit('jogada', { tipo: 'frota', navios: certa, pronto: true });
  B.emit('jogada', { tipo: 'frota', navios: certa, pronto: true });
  await pausa(150);
  const e = ultimo.get(A);
  assert.equal(e.fase, 'batalha');
  // quem tem a vez afunda tudo do outro (as duas frotas são iguais: sabe onde atirar)
  const vez = e.vez, S = vez === sa ? A : B, O = S === A ? B : A;
  const pago = espera(S, 'settled');
  const alvos = certa.flatMap((n) => R.casasDe(n));
  O.emit('jogada', { tipo: 'tiro', casa: 0 });   // não é a vez dele: ignorado
  for (const c of alvos) { S.emit('jogada', { tipo: 'tiro', casa: c }); await pausa(15); }
  const r = await pago;
  assert.ok(r.prize > 0, 'quem afundou tudo levou');
  const fim = ultimo.get(S).fim;
  assert.equal(fim.motivo, 'frota');
  assert.equal(ultimo.get(S).afundados.length, R.FROTA.length, 'no fim abre a frota do outro');
}
console.log('✔ frota escondida, tiros e vitória paga');

// --- relógio: ninguém posiciona, começa sozinho; quem não atira toma tiro aleatório
{
  await partida();
  await pausa(900);   // passou o tempo de posicionar
  const e = ultimo.get(A);
  assert.equal(e.fase, 'batalha', 'começou sozinho com a frota sorteada');
  const antes = (e.dei.match(/[ax]/g) ?? []).length + (e.levei.match(/[ax]/g) ?? []).length;
  await pausa(700);
  const d = ultimo.get(A);
  assert.ok((d.dei.match(/[ax]/g) ?? []).length + (d.levei.match(/[ax]/g) ?? []).length > antes, 'saiu tiro aleatório no relógio');
  const pagoB = espera(B, 'settled');
  A.emit('leave');
  assert.ok((await pagoB).prize > 0, 'W.O. paga quem ficou');
}
console.log('✔ relógio posiciona, atira sozinho e W.O.');

A.close(); B.close(); io.close(); http.close();
console.log('naval: servidor ok');
process.exit(0);
