// Auto-verificação do Mini-golfe no servidor: a tacada vai pra todos com o
// caminho, a bola não taca de novo antes de parar, o relógio fecha os 3
// buracos e paga, e quem sai no meio de 3 deixa os outros jogando.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.GOLFE_TEMPO = '2500';
process.env.GOLFE_INTERVALO = '150';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3466;
const { http, io } = listen(PORT, 'golfe');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/golfe', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const [ana, beto, caio] = [novo('ana@golfe.com', 'Ana'), novo('beto@golfe.com', 'Beto'), novo('caio@golfe.com', 'Caio')];
const A = cliente(ana.token), B = cliente(beto.token);
const ultimo = new Map();
for (const s of [A, B]) s.on('estado', (e) => ultimo.set(s, e));

// --- 2 na mesa: tacada com caminho pros dois, 3 buracos no relógio, paga
{
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  const [sa] = await Promise.all(s);
  assert.equal(sa.game, 'golfe');
  await pausa(900);   // o tee libera depois de 800ms
  const vistoB = new Promise((ok) => B.on('estado', (e) => { if (e.ultima?.tipo === 'tacada') ok(e.ultima); }));
  A.emit('jogada', { ang: -0.6, forca: 0.5 });
  const t = await vistoB;
  assert.equal(t.de, sa.seat);
  assert.ok(t.caminho.length >= 4, 'o caminho da bola veio');
  A.emit('jogada', { ang: -0.6, forca: 0.5 });   // a bola ainda rolando: recusada
  await pausa(100);
  assert.equal(ultimo.get(A).j[sa.seat].golpes, 1);
  const pago = await espera(A, 'settled');
  const e = ultimo.get(A);
  assert.ok(e.fim, 'acabou');
  assert.equal(e.j[0].cartao.length, 3, '3 buracos no cartão');
  assert.ok(pago.prize > 0 || pago.empate);
  B.removeAllListeners('estado'); B.on('estado', (x) => ultimo.set(B, x));
}
console.log('✔ tacada com caminho, 3 buracos e pagamento');

// --- 3 na mesa: um sai, os outros seguem
{
  const C = cliente(caio.token);
  C.on('estado', (e) => ultimo.set(C, e));
  const s = [espera(A, 'start'), espera(B, 'start'), espera(C, 'start')];
  A.emit('join', { roomType: 'prata' }); await espera(A, 'joined');
  B.emit('join', { roomType: 'prata' }); await espera(B, 'joined');
  C.emit('join', { roomType: 'prata' });
  const [st] = await Promise.all(s);
  assert.equal(st.players.length, 3);
  await pausa(200);
  C.emit('leave');
  await pausa(200);
  const e = ultimo.get(A);
  assert.equal(e.fora.filter(Boolean).length, 1);
  assert.equal(e.fim, null, 'os outros dois seguem');
  const fimA = espera(A, 'settled');
  B.emit('leave');
  assert.ok((await fimA).prize > 0, 'o último leva');
  C.close();
}
console.log('✔ 3 jogadores e eliminação');

A.close(); B.close(); io.close(); http.close();
console.log('golfe: servidor ok');
process.exit(0);
