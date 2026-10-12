// Auto-verificação do truco em duplas. O motor já cobre as regras de 4
// assentos; aqui é o que a mesa de 4 muda no servidor: fila que só abre com
// quatro, parceiro de frente, sigilo entre os quatro, quem responde o truco, e
// o dinheiro — cada um paga a sua entrada e cada vencedor leva o prêmio.
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

const PORT = 3447;
const { http, io } = listen(PORT, 'truco-duplas');

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
  path: '/ws/truco-duplas', auth: { token }, transports: ['websocket'],
});
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const users = ['Ana', 'Beto', 'Caio', 'Duda'].map((n) => novo(`${n.toLowerCase()}@duplas.com`, n));
const socks = users.map((u) => cliente(u.token));
// Estado por ASSENTO (o servidor reordena na abertura), não por quem entrou.
let assentoDe = [];
const estados = [null, null, null, null];
socks.forEach((s, k) => s.on('estado', (e) => { estados[e.assento] = e; assentoDe[k] = e.assento; }));
const porAssento = (a) => socks[assentoDe.indexOf(a)];

// --- fila: só abre com quatro -------------------------------------------
const saldoAntes = users.map((u) => total(u.userId));
const starts = socks.map((s) => espera(s, 'start'));
const acabou = espera(socks[0], 'settled');
let abriu = false;
starts[0].then(() => { abriu = true; });
for (const s of socks.slice(0, 3)) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
await pausa(150);
assert.equal(abriu, false, 'com três na fila a mesa não abre');
socks[3].emit('join', { roomType: 'bronze' });
const st = await Promise.all(starts);
await pausa(200);
{
  assert.equal(st[0].players.length, 4, 'a mesa tem quatro');
  // Ordem de chegada: 1º e 3º contra 2º e 4º, e o parceiro fica de frente.
  const seat = st.map((x) => x.seat);
  assert.equal(seat[0] % 2, seat[2] % 2, '1º e 3º são parceiros');
  assert.equal(seat[1] % 2, seat[3] % 2, '2º e 4º são parceiros');
  assert.notEqual(seat[0] % 2, seat[1] % 2, 'e jogam contra');
  console.log('✔ fila: abre com quatro, 1º e 3º contra 2º e 4º');
}

// --- sigilo entre os quatro ----------------------------------------------
{
  const maos = estados.map((e) => e.mao.map((c) => `${c.r}-${c.s}`));
  assert.ok(maos.every((m) => m.length === 3), 'três cartas cada');
  assert.equal(new Set(maos.flat()).size, 12, 'as quatro mãos não se cruzam');
  assert.ok(estados.every((e) => e.maoDoParceiro === null), 'fora da mão de onze ninguém vê o parceiro');
  assert.deepEqual(estados[0].naMao, [3, 3, 3, 3], 'só a contagem das outras mãos');
  assert.equal(JSON.stringify(estados[0]).includes('"hands"'), false, 'nada de mão crua no payload');
  console.log('✔ sigilo: cada assento vê só a própria mão');
}

// --- truco: responde o adversário seguinte, e corre pelo time ------------
{
  const pedinte = estados[0].vez;
  const resp = (pedinte + 1) % 4;
  const placarAntes = [...estados[0].placar];
  porAssento(pedinte).emit('jogada', { tipo: 'aumentar' });
  await pausa(120);
  assert.equal(estados[0].relogioDe, resp, 'o relógio cobra o adversário seguinte');
  porAssento((pedinte + 2) % 4).emit('jogada', { tipo: 'responder', acao: 'accept' });
  await pausa(100);
  assert.equal(estados[0].fase, 'respond', 'o parceiro de quem pediu não responde');
  porAssento(resp).emit('jogada', { tipo: 'responder', acao: 'run' });
  await pausa(200);
  const ganhou = estados[0].placar.map((v, i) => v - placarAntes[i]);
  assert.equal(ganhou[pedinte % 2], 1, 'o time de quem pediu leva 1');
  console.log('✔ truco: responde o adversário seguinte, o ponto vai pro time');
}

// --- partida inteira e o dinheiro ----------------------------------------
{
  let voltas = 0;
  while (!estados[0]?.fim && voltas++ < 1500) {
    const alvo = estados[0].relogioDe;
    const e = alvo == null ? null : estados[alvo];
    if (!e || e.relogioDe !== alvo) { await pausa(25); continue; }
    const s = porAssento(alvo);
    if (e.fase === 'respond') s.emit('jogada', { tipo: 'responder', acao: 'accept' });
    else if (e.fase === 'onze') s.emit('jogada', { tipo: 'onze', aceita: true });
    else s.emit('jogada', { tipo: 'jogar', indice: 0 });
    await pausa(30);
  }
  assert.ok(estados[0].fim, 'a partida termina');
  const time = estados[0].fim.vencedor;
  assert.ok(estados[0].placar[time] >= 12, 'o time vencedor cruzou os 12');

  await acabou;
  await pausa(100);
  for (const [k, u] of users.entries()) {
    const ganhou = assentoDe[k] % 2 === time;
    assert.equal(total(u.userId), Number((saldoAntes[k] - 2 + (ganhou ? 3.6 : 0)).toFixed(2)),
      `${u.name ?? k}: ${ganhou ? 'prêmio inteiro' : 'só a entrada'}`);
  }
  const hist = M.stateOf(users[0].userId).matchHistory[0];
  assert.equal(hist.isWin, assentoDe[0] % 2 === time, 'o histórico conta a vitória do time');
  assert.ok(hist.opponent.includes(' e '), 'e mostra a dupla adversária');
  console.log('✔ partida completa: cada vencedor leva R$ 3,60, cada perdedor paga R$ 2,00');
}

// --- W.O.: quem sai perde pelo time --------------------------------------
{
  for (const s of socks) s.emit('leave');
  await pausa(150);
  const antes = users.map((u) => total(u.userId));
  assentoDe = [];
  const s2 = socks.map((s) => espera(s, 'start'));
  for (const s of socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  await Promise.all(s2);
  await pausa(150);
  const pagos = socks.map((s) => espera(s, 'settled'));
  socks[0].emit('leave');
  const r = await Promise.all(pagos);
  const perdeu = assentoDe[0] % 2;
  assert.ok(r.every((x) => x.wo && x.timeVencedor === 1 - perdeu), 'todos sabem que foi W.O. e quem levou');
  for (const [k, u] of users.entries()) {
    const ganhou = assentoDe[k] % 2 !== perdeu;
    assert.equal(total(u.userId), Number((antes[k] - 2 + (ganhou ? 3.6 : 0)).toFixed(2)),
      ganhou ? 'a dupla adversária leva' : 'quem saiu e o parceiro perdem a entrada');
  }
  console.log('✔ W.O.: quem sai entrega a partida pro outro time');
}

// --- sala privada: cada um escolhe o time ---------------------------------
{
  for (const s of socks) s.emit('leave');
  await pausa(150);
  const code = 'DUPLA1';
  const joined = [];
  for (const [k, time] of [[0, 1], [1, 1], [2, 0]]) {
    socks[k].emit('join', { code, time });
    joined.push(await espera(socks[k], 'joined'));
  }
  assert.deepEqual(joined.map((j) => j.time), [1, 1, 0], 'cada um no time que escolheu');
  socks[3].emit('join', { code, time: 1 });
  assert.equal(await espera(socks[3], 'denied'), 'Esse time já está completo');
  const s3 = socks.map((s) => espera(s, 'start'));
  socks[3].emit('join', { code, time: 0 });
  const st3 = await Promise.all(s3);
  assert.equal(st3[0].seat % 2, st3[1].seat % 2, 'Ana e Beto escolheram jogar juntos');
  console.log('✔ sala privada: time escolhido, time cheio recusa');
}

// --- sala privada valendo: os três convidados aceitam antes do débito ------
{
  for (const s of socks) s.emit('leave');
  await pausa(150);
  const code = 'DUPLA2';
  const antes = users.map((u) => total(u.userId));
  socks[0].emit('join', { code, stake: 5 });
  await espera(socks[0], 'joined');
  const propostas = socks.slice(1).map((s) => espera(s, 'proposta'));
  for (const s of socks.slice(1)) { s.emit('join', { code }); await espera(s, 'joined'); }
  const ps = await Promise.all(propostas);
  assert.ok(ps.every((p) => p.stake === 500), 'cada convidado vê a aposta');
  let abriu = false;
  const s4 = socks.map((s) => espera(s, 'start'));
  s4[0].then(() => { abriu = true; });
  socks[1].emit('aceitar'); socks[2].emit('aceitar');
  await pausa(150);
  assert.equal(abriu, false, 'com um convidado faltando não abre');
  assert.deepEqual(users.map((u) => total(u.userId)), antes, 'e ninguém foi debitado');
  socks[3].emit('aceitar');
  await Promise.all(s4);
  assert.ok(users.every((u, k) => total(u.userId) === antes[k] - 5), 'o último aceite debita os quatro');
  console.log('✔ sala privada valendo: abre quando os três convidados aceitam');
}

for (const s of socks) s.close();
io.close();
http.close();
console.log('truco em duplas: 7 grupos ok');
