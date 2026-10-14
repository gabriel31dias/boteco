// Auto-verificação de Arqueiros do Céu no servidor: o laço transmite, a
// entrada mexe o arqueiro e a flecha sai, o relógio fecha e paga (ou devolve no empate), quem
// sai no meio perde por W.O. e a mesa abre com 3.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ARQ_CONTAGEM = '50';
process.env.ARQ_TEMPO = '1200';
process.env.ARQ_RENASCER = '300';
process.env.ESPERA_MESA = '400';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3453;
const { http, io } = listen(PORT, 'arqueiros');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/arqueiros', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@arco.com', 'Ana');
const beto = novo('beto@arco.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

// --- laço, entrada e fim no relógio: paga a maior (ou devolve no empate)
{
  const antes = [total(ana.userId), total(beto.userId)];
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'azul' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'vermelho' });
  const [sa] = await Promise.all(s);
  assert.equal(sa.game, 'arqueiros');
  assert.deepEqual(sa.players.map((p) => p.cor), ['azul', 'vermelho']);
  assert.ok(total(ana.userId) < antes[0], 'entrada debitada');

  const quadros = [];
  A.on('estado', (e) => quadros.push(e));
  await pausa(200);
  assert.ok(quadros.length >= 4, `laço transmitindo (${quadros.length} quadros em 200ms)`);
  const x0 = quadros.at(-1).r[sa.seat][0];
  A.emit('jogada', { mx: sa.seat === 0 ? 1 : -1, ang: -1.2, puxa: true });
  await pausa(400);
  A.emit('jogada', { mx: 0, ang: -1.2, puxa: false });
  await pausa(150);
  assert.ok(Math.abs(quadros.at(-1).r[sa.seat][0] - x0) > 20, 'a entrada mexeu o arqueiro');
  assert.ok(quadros.some((q) => q.ev.some((e) => e.tipo === 'tiro' && e.de === sa.seat)), 'a flecha saiu');
  B.emit('jogada', 'lixo');

  const [fa, fb] = await Promise.all([espera(A, 'settled'), espera(B, 'settled')]);
  A.off('estado');
  const fim = quadros.at(-1).fim ?? (await espera(A, 'estado')).fim;
  if (fa.empate) assert.deepEqual([total(ana.userId), total(beto.userId)], antes, 'empate devolve');
  else {
    const ganhou = [fa, fb].findIndex((f) => f.prize > 0);
    assert.ok(ganhou >= 0, 'alguém levou o pote');
    assert.ok(fim == null || ['tempo', 'dano'].includes(fim.motivo));
  }
}
console.log('✔ laço, entrada e fim no relógio');

// --- W.O.
{
  const antes = [total(ana.userId), total(beto.userId)];
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'verde' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'roxo' });
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
  const caio = novo('caio@arco.com', 'Caio');
  const C = cliente(caio.token);
  const s = [espera(A, 'start'), espera(B, 'start'), espera(C, 'start')];
  A.emit('join', { roomType: 'prata', cor: 'roxo' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'prata', cor: 'vermelho' });
  await espera(B, 'joined');
  C.emit('join', { roomType: 'prata', cor: 'azul' });
  const [st] = await Promise.all(s);
  assert.deepEqual(st.players.map((p) => p.cor), ['roxo', 'vermelho', 'azul']);
  assert.equal((await espera(A, 'estado')).r.length, 3);
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
console.log('arqueiros: servidor ok');
process.exit(0);
