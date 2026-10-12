// Auto-verificação da batalha de tanques no servidor: o laço de tempo real
// transmite, a entrada mexe o tanque, o tiro sai, o relógio fecha as rodadas,
// empate devolve a entrada e quem sai no meio perde por W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.TANQUE_CONTAGEM = '50';     // o teste não espera os 3s de contagem
process.env.TANQUE_PAUSA = '50';
process.env.TANQUE_RODADA = '1500';
process.env.ESPERA_MESA = '400';      // contagem da mesa variável: 400ms no teste

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3447;
const { http, io } = listen(PORT, 'tanque');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/tanque', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@tanque.com', 'Ana');
const beto = novo('beto@tanque.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

async function partida() {
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'verde' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'azul' });
  const [sa, sb] = await Promise.all(s);   // mesa de 2 a 4: abre quando a contagem acaba
  assert.equal(sa.game, 'tanque');
  return [sa.seat, sb.seat, sa];
}

// --- laço, entrada e tiro; as 3 rodadas no relógio empatam e devolvem a entrada
{
  const antes = [total(ana.userId), total(beto.userId)];
  const [sa, , start] = await partida();
  assert.ok(total(ana.userId) < antes[0], 'entrada debitada');
  assert.deepEqual(start.players.map((p) => p.cor), ['verde', 'azul'], 'cada um com a sua');

  const quadros = [];
  A.on('estado', (e) => quadros.push(e));
  await pausa(200);
  assert.ok(quadros.length >= 4, `laço transmitindo (${quadros.length} quadros em 200ms)`);

  // Ana desce e atira pra direita (bate nas caixas, não no Beto: as vidas ficam iguais).
  const y0 = quadros.at(-1).t[sa][1];
  A.emit('jogada', { mx: 0, my: 1, ang: 0, fogo: true });
  await pausa(400);
  A.emit('jogada', { mx: 0, my: 0, ang: 0, fogo: false });
  const depois = quadros.at(-1);
  assert.ok(depois.t[sa][1] > y0 + 20, 'a entrada mexeu o tanque');
  assert.ok(quadros.some((q) => q.ev.some((e) => e.tipo === 'tiro' && e.de === sa)), 'o tiro saiu');
  B.emit('jogada', 'lixo');   // não derruba nada

  const fim = await new Promise((ok) => A.on('settled', ok));
  A.off('estado');
  A.removeAllListeners('settled');
  assert.ok(fim.empate, 'rodadas no relógio com vida igual: empate');
  assert.deepEqual([total(ana.userId), total(beto.userId)], antes, 'empate devolve as entradas');
  assert.equal(quadros.at(-1).rodada, 3, 'jogou as 3 rodadas');
}
console.log('✔ laço, entrada, tiro e empate no relógio');

// --- W.O.: quem sai no meio perde a entrada pro outro
{
  const antes = [total(ana.userId), total(beto.userId)];
  await partida();
  await pausa(150);
  const pagoB = espera(B, 'settled');
  A.emit('leave');
  const r = await pagoB;
  assert.ok(r.prize > 0, 'quem ficou levou o pote');
  assert.ok(total(beto.userId) > antes[1], 'Beto levou');
  assert.ok(total(ana.userId) < antes[0], 'Ana perdeu a entrada');
}
console.log('✔ W.O. paga quem ficou');

// --- 3 na mesa: a contagem abre com quem tiver, cada um com sua cor
{
  const caio = novo('caio@tanque.com', 'Caio');
  const C = cliente(caio.token);
  const s = [espera(A, 'start'), espera(B, 'start'), espera(C, 'start')];
  A.emit('join', { roomType: 'prata', cor: 'amarelo' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'prata', cor: 'vermelho' });
  await espera(B, 'joined');
  C.emit('join', { roomType: 'prata', cor: 'azul' });
  const [st] = await Promise.all(s);
  assert.equal(st.players.length, 3, 'abriu com 3');
  assert.deepEqual(st.players.map((p) => p.cor), ['amarelo', 'vermelho', 'azul']);
  const e = await espera(A, 'estado');
  assert.equal(e.t.length, 3);
  assert.deepEqual(e.cores, ['amarelo', 'vermelho', 'azul']);
  // um sai: a mesa segue com dois
  C.emit('leave');
  await pausa(150);
  const e2 = await espera(A, 'estado');
  assert.equal(e2.fora[2], true);
  assert.equal(e2.fim, null, 'ainda tem dois');
  const fimA = espera(A, 'settled');
  B.emit('leave');
  const r = await fimA;
  assert.ok(r.prize > 0, 'o último que sobrou leva o pote dos 3');
  C.close();
}
console.log('✔ 3 jogadores: contagem, cores e eliminação');

A.close(); B.close(); io.close(); http.close();
console.log('tanque: servidor ok');
process.exit(0);
