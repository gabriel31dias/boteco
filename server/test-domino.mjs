// Auto-verificação do dominó valendo dinheiro. O que mais importa aqui não é a
// regra (ela já vem testada), é o sigilo: a mão do adversário não pode sair do
// servidor, senão a aposta vira brincadeira.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.DOMINO_TEMPO = '1200';   // relógio curto: o teste não espera 60s
process.env.DOMINO_PAUSA = '60';
process.env.ESPERA_MESA = '150';     // mesa de 2 a 4: abre com 2 depois da espera

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3445;
const { http, io } = listen(PORT, 'domino');

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
  path: '/ws/domino', auth: { token }, transports: ['websocket'],
});
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@domino.com', 'Ana');
const beto = novo('beto@domino.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

const estados = [null, null];
A.on('estado', (e) => { estados[0] = e; });
B.on('estado', (e) => { estados[1] = e; });

// Antes de entrar na sala: a entrada é debitada na abertura da partida.
const saldoAntes = [total(ana.userId), total(beto.userId)];
const startA = espera(A, 'start');
const startB = espera(B, 'start');
const acabou = espera(A, 'settled');
A.emit('join', { roomType: 'bronze' });
await espera(A, 'joined');
B.emit('join', { roomType: 'bronze' });
const [sa] = await Promise.all([startA, startB]);
assert.equal(sa.game, 'domino');
await pausa(120);

// --- o sigilo da mão -----------------------------------------------------
{
  const [ea, eb] = estados;
  assert.equal(ea.mao.length, 7, 'cada um recebe 7 peças');
  assert.deepEqual(ea.naMao, [7, 7], 'e sabe quantas cada um tem');
  assert.equal(ea.maos, null, 'mas não quais são');
  assert.equal(eb.maos, null);
  assert.equal(ea.monte, 14, 'monte é só a contagem');
  assert.equal(JSON.stringify(ea).includes('"hands"'), false, 'nada de mão crua no payload');
  const idsA = new Set(ea.mao.map((p) => p.id));
  assert.ok(eb.mao.every((p) => !idsA.has(p.id)), 'as duas mãos não se cruzam');
  console.log('✔ sigilo: cada assento vê a própria mão e só a contagem da outra');
}

// --- jogar de verdade até alguém cruzar os 50 pontos ---------------------
{
  const socketDe = (assento) => (assento === 0 ? A : B);
  let voltas = 0;
  while (!estados[0]?.fim && voltas++ < 400) {
    const vez = estados[0]?.vez;
    if (vez == null || estados[0]?.fase !== 'playing') { await pausa(40); continue; }
    const e = estados[vez];
    if (!e || e.vez !== vez) { await pausa(40); continue; }
    const s = socketDe(vez);
    if (e.podeJogar.length) s.emit('jogada', { tipo: 'jogar', ...e.podeJogar[0] });
    else if (e.precisaComprar) s.emit('jogada', { tipo: 'comprar' });
    else s.emit('jogada', { tipo: 'passar' });
    await pausa(45);
  }
  assert.ok(estados[0].fim, 'a partida termina sozinha');
  const vencedor = estados[0].fim.vencedor;
  assert.ok(vencedor === 0 || vencedor === 1, 'e tem um vencedor');
  assert.ok(estados[0].placar[vencedor] >= 50, 'que cruzou os 50 pontos');

  await acabou;
  const ids = [ana.userId, beto.userId];
  assert.equal(total(ids[vencedor]), saldoAntes[vencedor] - 2 + 3.6, 'vencedor levou o prêmio');
  assert.equal(total(ids[1 - vencedor]), saldoAntes[1 - vencedor] - 2, 'perdedor pagou a entrada');
  console.log('✔ partida completa: rodadas até 50 pontos e a aposta paga');
}

// --- relógio: quem não joga no prazo perde por W.O. -----------------------
{
  A.emit('leave'); B.emit('leave');
  await pausa(150);
  const s2 = espera(A, 'start');
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  await s2;
  await pausa(120);

  const ids = [ana.userId, beto.userId];
  const antes = ids.map(total);                    // já sem a entrada: ela sai na abertura
  const vez = estados[0].vez;
  const corrente = estados[0].corrente.length;
  const pago = espera(A, 'settled');
  await pausa(1600);                               // ninguém joga: o relógio estoura

  assert.deepEqual(estados[0].fim, { vencedor: 1 - vez, motivo: 'tempo' }, 'quem estava na vez perdeu no tempo');
  assert.equal(estados[0].corrente.length, corrente, 'e ninguém jogou por ele');
  await pago;
  assert.equal(total(ids[vez]), antes[vez], 'o ausente fica sem a entrada');
  assert.equal(total(ids[1 - vez]), Number((antes[1 - vez] + 3.6).toFixed(2)), 'o adversário leva o prêmio');
  console.log('✔ relógio: estourar o prazo é W.O., sem jogada automática');
}

A.close(); B.close();
io.close();
http.close();
console.log('dominó: 3 grupos ok');
