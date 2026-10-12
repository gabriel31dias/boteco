// Auto-verificação de Galinhas Psicopatas no servidor: o laço de tempo real
// transmite, a entrada mexe o rato, o tiro sai, o relógio fecha a partida,
// empate devolve a entrada e quem sai no meio perde por W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.GALINHAS_CONTAGEM = '50';     // o teste não espera os 3s de contagem
process.env.GALINHAS_RENASCER = '300';
process.env.GALINHAS_TEMPO = '1500';
process.env.ESPERA_MESA = '400';      // contagem da mesa variável: 400ms no teste

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3451;
const { http, io } = listen(PORT, 'galinhas');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/galinhas', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@galinha.com', 'Ana');
const beto = novo('beto@galinha.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

async function partida() {
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze', cor: 'branco' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', cor: 'preto' });
  const [sa, sb] = await Promise.all(s);   // mesa de 2 a 4: abre quando a contagem acaba
  assert.equal(sa.game, 'galinhas');
  return [sa.seat, sb.seat, sa];
}

// --- laço, entrada e tiro; ninguém abate ninguém até o relógio: empate devolve a entrada
{
  const antes = [total(ana.userId), total(beto.userId)];
  const [sa, , start] = await partida();
  assert.ok(total(ana.userId) < antes[0], 'entrada debitada');
  assert.deepEqual(start.players.map((p) => p.cor), ['branco', 'preto'], 'cada um com o seu');

  const quadros = [];
  A.on('estado', (e) => quadros.push(e));
  await pausa(200);
  assert.ok(quadros.length >= 4, `laço transmitindo (${quadros.length} quadros em 200ms)`);

  // Ana anda e golpeia o ar (a outra está do outro lado: ninguém leva dano).
  const x0 = quadros.at(-1).r[sa][0];
  A.emit('jogada', { mx: sa === 0 ? 1 : -1, ang: -Math.PI / 2, fogo: true });
  await pausa(400);
  A.emit('jogada', { mx: 0, ang: -Math.PI / 2, fogo: false });
  const depois = quadros.at(-1);
  assert.ok(Math.abs(depois.r[sa][0] - x0) > 20, 'a entrada mexeu o rato');
  assert.ok(quadros.some((q) => q.ev.some((e) => e.tipo === 'golpe' && e.de === sa)), 'o golpe saiu');
  B.emit('jogada', 'lixo');   // não derruba nada

  const fim = await new Promise((ok) => A.on('settled', ok));
  A.off('estado');
  A.removeAllListeners('settled');
  assert.ok(fim.empate, 'relógio acabou sem abate nem dano: empate');
  assert.deepEqual([total(ana.userId), total(beto.userId)], antes, 'empate devolve as entradas');
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

// --- ninguém ganha rato automático: sem escolher, a mesa não abre
{
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'ouro' });
  const ja = await espera(A, 'joined');
  assert.equal(ja.cor, null, 'entrou sem rato');
  B.emit('join', { roomType: 'ouro' });
  await espera(B, 'joined');
  let comecou = false;
  s[0].then(() => { comecou = true; });
  await pausa(700);                                          // passou da espera (400ms)
  assert.equal(comecou, false, 'sem todo mundo escolher, não começa');
  A.emit('cor', 'amarelo');
  B.emit('cor', 'amarelo');                                     // a Ana pegou antes: não pode
  await pausa(150);
  assert.equal(comecou, false, 'o Beto ainda não tem rato');
  B.emit('cor', 'branco');
  const [st] = await Promise.all(s);
  assert.deepEqual(st.players.map((p) => p.cor), ['amarelo', 'branco'], 'a partida sai com a escolha de cada um');
  B.emit('cor', 'preto');                                     // com a partida rolando: não muda mais
  await pausa(100);
  assert.deepEqual((await espera(A, 'estado')).cores, ['amarelo', 'branco']);
  const fim = espera(B, 'settled');
  A.emit('leave');
  await fim;
}
console.log('✔ cada um escolhe o seu rato; sem escolher não começa');

// --- 3 na mesa: a contagem abre com quem tiver, cada um com sua cor
{
  const caio = novo('caio@galinha.com', 'Caio');
  const C = cliente(caio.token);
  const s = [espera(A, 'start'), espera(B, 'start'), espera(C, 'start')];
  A.emit('join', { roomType: 'prata', cor: 'amarelo' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'prata', cor: 'vermelho' });
  await espera(B, 'joined');
  C.emit('join', { roomType: 'prata', cor: 'preto' });
  const [st] = await Promise.all(s);
  assert.equal(st.players.length, 3, 'abriu com 3');
  assert.deepEqual(st.players.map((p) => p.cor), ['amarelo', 'vermelho', 'preto']);
  const e = await espera(A, 'estado');
  assert.equal(e.r.length, 3);
  assert.deepEqual(e.cores, ['amarelo', 'vermelho', 'preto']);
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
console.log('✔ 3 jogadores: contagem, ratos e eliminação');

A.close(); B.close(); io.close(); http.close();
console.log('galinhas: servidor ok');
process.exit(0);
