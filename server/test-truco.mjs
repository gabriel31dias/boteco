// Auto-verificação do truco valendo dinheiro. O que este teste cobra é o que o
// servidor acrescenta à engine (que já vem testada): sigilo da mão, a escada de
// aumentos pelo socket, o relógio que às vezes cobra quem NÃO está jogando, e o
// dinheiro caindo no lugar certo.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.TRUCO_TEMPO = '1200';
process.env.TRUCO_RESPOSTA = '1000';
process.env.TRUCO_PAUSA = '60';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3446;
const { http, io } = listen(PORT, 'truco');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const total = (id) => {
  const s = M.stateOf(id);
  return Number((s.walletBalance + s.bonusBalance).toFixed(2));
};
const cliente = (token) => connect(`http://localhost:${PORT}`, {
  path: '/ws/truco', auth: { token }, transports: ['websocket'],
});
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@truco.com', 'Ana');
const beto = novo('beto@truco.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);
const sock = [A, B];
const estados = [null, null];
A.on('estado', (e) => { estados[0] = e; });
B.on('estado', (e) => { estados[1] = e; });

const saldoAntes = [total(ana.userId), total(beto.userId)];
const abriu = [espera(A, 'start'), espera(B, 'start')];
const acabou = espera(A, 'settled');
A.emit('join', { roomType: 'bronze' });
await espera(A, 'joined');
B.emit('join', { roomType: 'bronze' });
const [sa] = await Promise.all(abriu);
assert.equal(sa.game, 'truco');
await pausa(150);

// --- sigilo -------------------------------------------------------------
{
  const [ea, eb] = estados;
  assert.equal(ea.mao.length, 3, 'três cartas na mão');
  assert.equal(ea.naMaoDoOutro, 3, 'e sabe quantas o outro tem');
  assert.equal(ea.maoDoOutro, undefined, 'mas não quais');
  assert.equal(JSON.stringify(ea).includes('"hands"'), false, 'nada de mão crua no payload');
  // Carta é { r, s }: índice de valor e de naipe.
  const idA = ea.mao.map((c) => `${c.r}-${c.s}`);
  assert.ok(eb.mao.every((c) => !idA.includes(`${c.r}-${c.s}`)), 'as duas mãos não se cruzam');
  assert.ok(ea.vira, 'a vira é pública');
  assert.equal(ea.valor, 1, 'a mão começa valendo 1');
  console.log('✔ sigilo: cada assento vê a própria mão, a vira e o placar');
}

// --- escada de aumentos: truco, retruco e correr -------------------------
{
  const pedinte = estados[0].vez;                  // quem está na vez pode pedir
  const respondente = 1 - pedinte;
  sock[pedinte].emit('jogada', { tipo: 'aumentar' });
  await pausa(120);
  assert.equal(estados[respondente].fase, 'respond', 'o outro entra em resposta');
  assert.equal(estados[respondente].pedido.para, 3, 'truco pede 3');
  assert.equal(estados[respondente].relogioDe, respondente, 'e o relógio cobra quem responde');

  // retruco: aceita o 3 e pede 6
  sock[respondente].emit('jogada', { tipo: 'responder', acao: 'raise' });
  await pausa(120);
  assert.equal(estados[pedinte].pedido.para, 6, 'retruco pede 6');
  assert.equal(estados[pedinte].valor, 3, 'e o valor corrente já é 3');

  // correr no 6: quem correu entrega o valor ANTERIOR (3), não o pedido
  const placarAntes = [...estados[0].placar];
  sock[pedinte].emit('jogada', { tipo: 'responder', acao: 'run' });
  await pausa(200);
  const ganhou = estados[0].placar.map((v, i) => v - placarAntes[i]);
  assert.equal(ganhou[respondente], 3, 'quem foi corrido leva 3, o valor anterior ao pedido');
  assert.equal(ganhou[pedinte], 0);
  console.log('✔ aumentos: truco, retruco e correr pagando o valor anterior');
}

// --- partida inteira até 12 pontos --------------------------------------
{
  let voltas = 0;
  while (!estados[0]?.fim && voltas++ < 600) {
    const e0 = estados[0];
    if (!e0) { await pausa(30); continue; }
    const alvo = e0.relogioDe;
    if (alvo == null) { await pausa(30); continue; }
    const e = estados[alvo];
    if (!e || e.relogioDe !== alvo) { await pausa(30); continue; }
    if (e.fase === 'respond') sock[alvo].emit('jogada', { tipo: 'responder', acao: 'accept' });
    else if (e.fase === 'onze') sock[alvo].emit('jogada', { tipo: 'onze', aceita: true });
    else sock[alvo].emit('jogada', { tipo: 'jogar', indice: 0 });
    await pausa(35);
  }
  assert.ok(estados[0].fim, 'a partida termina sozinha');
  const venceu = estados[0].fim.vencedor;
  assert.ok(estados[0].placar[venceu] >= 12, 'o vencedor cruzou os 12 pontos');

  await acabou;
  const ids = [ana.userId, beto.userId];
  assert.equal(total(ids[venceu]), saldoAntes[venceu] - 2 + 3.6, 'vencedor levou o prêmio');
  assert.equal(total(ids[1 - venceu]), saldoAntes[1 - venceu] - 2, 'perdedor pagou a entrada');
  console.log('✔ partida completa: 12 pontos, mão de onze incluída, e a aposta paga');
}

// --- relógio: estourar respondendo é correr, não aceitar -----------------
{
  A.emit('leave'); B.emit('leave');
  await pausa(150);
  const s2 = espera(A, 'start');
  A.emit('join', { roomType: 'treino' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'treino' });
  await s2;
  await pausa(150);

  const pedinte = estados[0].vez;
  const placarAntes = [...estados[0].placar];
  sock[pedinte].emit('jogada', { tipo: 'aumentar' });
  await pausa(120);
  assert.equal(estados[0].relogioDe, 1 - pedinte, 'o relógio passou pra quem responde');
  await pausa(1300);                                  // ninguém responde: estoura

  const ganhou = estados[0].placar.map((v, i) => v - placarAntes[i]);
  assert.equal(ganhou[pedinte], 1, 'quem pediu leva 1, o valor anterior ao truco');
  assert.equal(estados[0].fase !== 'respond', true, 'e a mão seguinte já está de pé');
  console.log('✔ relógio: estourar um pedido corre, nunca aceita por quem sumiu');
}

A.close(); B.close();
io.close();
http.close();
console.log('truco: 4 grupos ok');
