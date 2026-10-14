// Auto-verificação de Cobras do Templo no servidor: o laço transmite, a
// entrada vira a cobra, o relógio fecha e paga (ou devolve no empate), quem
// sai no meio perde por W.O. e a mesa abre com 3.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.COBRAS_CONTAGEM = '50';
process.env.COBRAS_TEMPO = '1200';
process.env.ESPERA_MESA = '400';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3452;
const { http, io } = listen(PORT, 'cobras');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/cobras', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@cobra.com', 'Ana');
const beto = novo('beto@cobra.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

// --- laço, entrada e fim no relógio: paga a maior (ou devolve no empate)
{
  const antes = [total(ana.userId), total(beto.userId)];
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'verde' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'arcoiris' });
  const [sa] = await Promise.all(s);
  assert.equal(sa.game, 'cobras');
  assert.deepEqual(sa.players.map((p) => p.cor), ['verde', 'arcoiris']);
  assert.ok(total(ana.userId) < antes[0], 'entrada debitada');

  const quadros = [];
  A.on('estado', (e) => quadros.push(e));
  await pausa(200);
  assert.ok(quadros.length >= 4, `laço transmitindo (${quadros.length} quadros em 200ms)`);
  assert.ok(quadros.some((q) => q.fr?.length >= 16), 'frutas no piso');
  const ang0 = quadros.at(-1).c[sa.seat][2];
  A.emit('jogada', { ang: ang0 + Math.PI / 2 });
  await pausa(300);
  assert.ok(Math.abs(quadros.at(-1).c[sa.seat][2] - ang0) > 0.5, 'a entrada virou a cobra');
  B.emit('jogada', 'lixo');

  const [fa, fb] = await Promise.all([espera(A, 'settled'), espera(B, 'settled')]);
  A.off('estado');
  const fim = quadros.at(-1).fim ?? (await espera(A, 'estado')).fim;
  if (fa.empate) assert.deepEqual([total(ana.userId), total(beto.userId)], antes, 'empate devolve');
  else {
    const ganhou = [fa, fb].findIndex((f) => f.prize > 0);
    assert.ok(ganhou >= 0, 'alguém levou o pote');
    assert.ok(fim == null || ['tamanho', 'frutas'].includes(fim.motivo));
  }
}
console.log('✔ laço, entrada e fim no relógio');

// --- W.O.
{
  const antes = [total(ana.userId), total(beto.userId)];
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'azul' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'rosa' });
  await Promise.all(s);
  await pausa(150);
  const pagoB = espera(B, 'settled');
  A.emit('leave');
  const r = await pagoB;
  assert.ok(r.prize > 0, 'quem ficou levou');
  assert.ok(total(beto.userId) > antes[1] && total(ana.userId) < antes[0]);
}
console.log('✔ W.O. paga quem ficou');

// --- 3 na mesa
{
  const caio = novo('caio@cobra.com', 'Caio');
  const C = cliente(caio.token);
  const s = [espera(A, 'start'), espera(B, 'start'), espera(C, 'start')];
  A.emit('join', { roomType: 'prata', cor: 'amarelo' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'prata', cor: 'vermelho' });
  await espera(B, 'joined');
  C.emit('join', { roomType: 'prata', cor: 'preto' });
  const [st] = await Promise.all(s);
  assert.deepEqual(st.players.map((p) => p.cor), ['amarelo', 'vermelho', 'preto']);
  assert.equal((await espera(A, 'estado')).c.length, 3);
  C.emit('leave');
  await pausa(150);
  const e2 = await espera(A, 'estado');
  assert.equal(e2.fora[2], true);
  assert.equal(e2.fim, null, 'ainda tem dois');
  const fimA = espera(A, 'settled');
  B.emit('leave');
  assert.ok((await fimA).prize > 0, 'o último leva o pote dos 3');
  C.close();
}
console.log('✔ 3 jogadores: contagem e eliminação');

A.close(); B.close(); io.close(); http.close();
console.log('cobras: servidor ok');
process.exit(0);
