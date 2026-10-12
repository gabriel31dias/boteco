// Auto-verificação da mesa de dominó de 2 a 4 e das duplas. As regras de 3 e 4
// mãos o motor já testa; aqui é o que muda no servidor: a espera pra abrir, o
// pote que cresce com a mesa, o W.O. com mais de 2 e o time nas duplas.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.DOMINO_TEMPO = '5000';
process.env.DOMINO_PAUSA = '40';
process.env.ESPERA_MESA = '600';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const individual = listen(3448, 'domino');
const duplas = listen(3449, 'domino-duplas');

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
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const redondo = (x) => Number(x.toFixed(2));

const users = ['Ana', 'Beto', 'Caio', 'Duda'].map((n) => novo(`${n.toLowerCase()}@mesa.com`, n));

/** Conecta, entra na fila e acompanha o estado por ASSENTO. */
function mesa(porta, caminho, quem) {
  const socks = quem.map((u) => connect(`http://localhost:${porta}`, { path: caminho, auth: { token: u.token }, transports: ['websocket'] }));
  const estados = [];
  const assentoDe = [];
  socks.forEach((s, k) => s.on('estado', (e) => { estados[e.assento] = e; assentoDe[k] = e.assento; }));
  return { socks, estados, assentoDe, porAssento: (a) => socks[assentoDe.indexOf(a)] };
}

/** Joga até o fim: primeira peça válida, compra se precisa, passa. */
async function jogarAteOFim(m) {
  for (let voltas = 0; !m.estados[0]?.fim && voltas < 2500; voltas++) {
    const vez = m.estados[0]?.vez;
    const e = vez == null ? null : m.estados[vez];
    if (!e || e.fase !== 'playing' || e.vez !== vez) { await pausa(20); continue; }
    const s = m.porAssento(vez);
    if (e.podeJogar.length) s.emit('jogada', { tipo: 'jogar', ...e.podeJogar[0] });
    else if (e.precisaComprar) s.emit('jogada', { tipo: 'comprar' });
    else s.emit('jogada', { tipo: 'passar' });
    await pausa(25);
  }
  assert.ok(m.estados[0].fim, 'a partida termina');
}

const sairTodos = async (m) => { for (const s of m.socks) s.close(); await pausa(150); };

// --- 2 na mesa: espera, e o terceiro que chega entra na mesma partida -------
{
  const m = mesa(3448, '/ws/domino', users.slice(0, 3));
  const antes = users.map((u) => total(u.userId));
  const starts = m.socks.map((s) => espera(s, 'start'));
  let abriu = false;
  starts[0].then(() => { abriu = true; });
  const mesaEv = espera(m.socks[0], 'mesa');
  m.socks[0].emit('join', { roomType: 'bronze' });
  await espera(m.socks[0], 'joined');
  await mesaEv;
  const contagem = espera(m.socks[0], 'mesa');
  m.socks[1].emit('join', { roomType: 'bronze' });
  const aviso = await contagem;
  assert.ok(aviso.inicioEm > Date.now(), 'com 2 sentados a mesa avisa quando abre');
  await pausa(300);
  assert.equal(abriu, false, 'e espera, não abre na hora');
  m.socks[2].emit('join', { roomType: 'bronze' });
  const st = await Promise.all(starts);
  assert.equal(st[0].players.length, 3, 'abriu com os três');
  assert.equal(st[0].state.inDisputeBalance, 2, 'e cobrou a entrada');
  console.log('✔ espera: com 2 conta 10s, quem chega no meio entra');

  // o pote de 3: R$ 2,00 × 3 − 10% = R$ 5,40, e só o vencedor leva
  const pago = espera(m.socks[0], 'settled');
  await jogarAteOFim(m);
  const r = await pago;
  assert.equal(r.prize, 540, 'prêmio de 3 jogadores é o pote menos a taxa');
  assert.equal(r.winners.length, 1, 'individual: um vencedor só');
  const venc = users.findIndex((u) => u.userId === r.winners[0]);
  users.slice(0, 3).forEach((u, k) => assert.equal(total(u.userId),
    redondo(antes[k] - 2 + (k === venc ? 5.4 : 0)), `${u.name ?? k}: ${k === venc ? 'leva o pote' : 'paga a entrada'}`));
  await sairTodos(m);
  console.log('✔ três na mesa: partida até o fim e o vencedor leva R$ 5,40');
}

// --- mesa cheia abre na hora, sem esperar ----------------------------------
{
  const m = mesa(3448, '/ws/domino', users);
  const starts = m.socks.map((s) => espera(s, 'start'));
  const t0 = Date.now();
  for (const s of m.socks) { s.emit('join', { roomType: 'treino' }); await espera(s, 'joined'); }
  const st = await Promise.all(starts);
  assert.equal(st[0].players.length, 4);
  assert.ok(Date.now() - t0 < 600, 'com 4 não espera o relógio');
  await pausa(150);
  assert.deepEqual(m.estados[0].naMao, [7, 7, 7, 7], 'quatro mãos de 7');
  assert.equal(m.estados[0].monte, 0, 'e nada no monte');
  await sairTodos(m);
  console.log('✔ quatro: abre na hora, sem monte');
}

// --- com 3, quem sai é eliminado e a partida segue sem ele ------------------
{
  const m = mesa(3448, '/ws/domino', users.slice(0, 3));
  const starts = m.socks.map((s) => espera(s, 'start'));
  for (const s of m.socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  await Promise.all(starts);
  await pausa(150);
  const antes = users.map((u) => total(u.userId));
  const saiu = m.assentoDe[0];
  let pagouCedo = false;
  m.socks.slice(1).forEach((s) => s.once('settled', () => { pagouCedo = true; }));
  const eliminado = espera(m.socks[0], 'settled');
  m.socks[0].emit('leave');
  assert.ok((await eliminado).eliminado, 'quem saiu recebe o aviso de eliminado');
  await pausa(200);
  assert.equal(pagouCedo, false, 'ninguém recebe prêmio na hora: a partida segue');
  assert.equal(m.estados[m.assentoDe[1]].ativos[saiu], false, 'a mesa sabe que ele saiu');
  assert.notEqual(m.estados[m.assentoDe[1]].vez, saiu, 'e a vez nunca cai nele');

  // joga até o fim só com os dois que ficaram
  const fim = espera(m.socks[1], 'settled');
  for (let voltas = 0; !m.estados[m.assentoDe[1]]?.fim && voltas < 2500; voltas++) {
    const e0 = m.estados[m.assentoDe[1]];
    const vez = e0?.vez;
    const e = vez == null ? null : m.estados[vez];
    if (!e || e.fase !== 'playing' || e.vez !== vez || vez === saiu) { await pausa(20); continue; }
    const sock = m.porAssento(vez);
    if (e.podeJogar.length) sock.emit('jogada', { tipo: 'jogar', ...e.podeJogar[0] });
    else if (e.precisaComprar) sock.emit('jogada', { tipo: 'comprar' });
    else sock.emit('jogada', { tipo: 'passar' });
    await pausa(25);
  }
  const r = await fim;
  assert.equal(r.winners.length, 1, 'um vencedor só');
  assert.notEqual(r.winners[0], users[0].userId, 'e nunca quem saiu');
  const venc = users.findIndex((u) => u.userId === r.winners[0]);
  assert.equal(total(users[venc].userId), redondo(antes[venc] + 5.4), 'o vencedor leva o pote de 3, com a entrada de quem saiu');
  assert.equal(total(users[0].userId), antes[0], 'quem saiu fica sem a entrada');
  await sairTodos(m);
  console.log('✔ com 3, quem sai é eliminado e os outros jogam até o fim');
}

// --- duplas: 4 fixos, parceiro de frente, o time leva -----------------------
{
  const m = mesa(3449, '/ws/domino-duplas', users);
  const antes = users.map((u) => total(u.userId));
  const starts = m.socks.map((s) => espera(s, 'start'));
  for (const s of m.socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  const st = await Promise.all(starts);
  const seat = st.map((x) => x.seat);
  assert.equal(seat[0] % 2, seat[2] % 2, '1º e 3º são parceiros');
  await pausa(150);
  assert.equal(m.estados[0].duplas, true);
  assert.equal(m.estados[0].placar.length, 2, 'placar por time');

  const pago = espera(m.socks[0], 'settled');
  await jogarAteOFim(m);
  const r = await pago;
  const time = m.estados[0].fim.vencedor;
  assert.equal(r.winners.length, 2, 'duplas: os dois do time ganham');
  users.forEach((u, k) => {
    const ganhou = m.assentoDe[k] % 2 === time;
    assert.equal(total(u.userId), redondo(antes[k] - 2 + (ganhou ? 3.6 : 0)), 'cada vencedor leva R$ 3,60');
  });
  await sairTodos(m);
  console.log('✔ duplas: parceiro de frente, cada um do time leva o prêmio');
}

// --- duplas: quem sai entrega o time (W.O. na hora) -------------------------
{
  const m = mesa(3449, '/ws/domino-duplas', users);
  const starts = m.socks.map((s) => espera(s, 'start'));
  for (const s of m.socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  await Promise.all(starts);
  await pausa(150);
  const antes = users.map((u) => total(u.userId));
  const pagos = m.socks.slice(1).map((s) => espera(s, 'settled'));
  m.socks[0].emit('leave');
  const [r] = await Promise.all(pagos);
  const timeQueSaiu = m.assentoDe[0] % 2;
  assert.equal(r.wo, true, 'nas duplas sair é W.O.');
  assert.equal(r.winners.length, 2, 'e os dois adversários ganham');
  users.forEach((u, k) => {
    const ganhou = m.assentoDe[k] % 2 !== timeQueSaiu;
    assert.equal(total(u.userId), redondo(antes[k] + (ganhou ? 3.6 : 0)), ganhou ? 'adversário leva' : 'a dupla de quem saiu perde');
  });
  await sairTodos(m);
  console.log('✔ duplas: quem sai entrega o time na hora');
}

for (const s of [individual, duplas]) { s.io.close(); s.http.close(); }
console.log('dominó mesa: 6 grupos ok');
process.exit(0);
