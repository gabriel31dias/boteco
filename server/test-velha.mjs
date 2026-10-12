// Auto-verificação do jogo da velha valendo dinheiro: melhor de 3, relógio,
// desempate no tempo e o dinheiro caindo no lugar certo. O servidor é o juiz,
// então é ele que este teste cobra.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.VELHA_TEMPO = '1500';    // relógio curto: o teste não pode esperar 15s
process.env.VELHA_PAUSA = '80';      // e a pausa entre rodadas também

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3444;
const { http, io } = listen(PORT, 'velha');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};

const cliente = (token) => connect(`http://localhost:${PORT}`, {
  path: '/ws/velha', auth: { token }, transports: ['websocket'],
});

const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
// A entrada sai do bônus antes do saldo, então quem confere é o total.
const total = (id) => {
  const s = M.stateOf(id);
  return Number((s.walletBalance + s.bonusBalance).toFixed(2));
};
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@velha.com', 'Ana');
const beto = novo('beto@velha.com', 'Beto');
const A = cliente(ana.token);
const B = cliente(beto.token);

/** Entra na sala e devolve o assento de cada um. */
async function partida() {
  const startA = espera(A, 'start');
  const startB = espera(B, 'start');
  // O primeiro `estado` sai junto com o `start`: escutar depois perderia ele.
  const primeiro = espera(A, 'estado');
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  const [sa, sb] = await Promise.all([startA, startB]);
  assert.equal(sa.game, 'velha', 'o start diz qual jogo é');
  return { assentos: [sa.seat, sb.seat], estado: await primeiro };
}

/** Manda as casas em ordem, alternando a partir de quem começa. */
async function jogar(casas, comeca, atraso = {}) {
  const socketDe = (assento) => (assento === 0 ? A : B);
  let vez = comeca;
  for (const casa of casas) {
    if (atraso[vez]) await pausa(atraso[vez]);
    const chegou = espera(A, 'estado');
    socketDe(vez).emit('jogada', { casa });
    await chegou;
    vez = 1 - vez;
  }
}

// Sequências de casas em ordem de jogada. Quem vence depende de quem começa,
// então tem uma pra cada caso.
const VENCE_1o = [0, 1, 3, 4, 6];                // quem abre fecha a coluna esquerda
const VENCE_2o = [4, 0, 8, 3, 1, 6];             // quem responde fecha a coluna esquerda
const EMPATE = [4, 0, 1, 7, 6, 2, 5, 3, 8];      // ninguém fecha nada

// --- melhor de 3: 2 a 0 e a aposta vai pro vencedor ----------------------
{
  const saldoAntes = [total(ana.userId), total(beto.userId)];
  const { estado } = await partida();
  // O `settled` sai colado no último `estado`: escutar depois perde o evento.
  const acabou = espera(A, 'settled');
  assert.equal(estado.rodada, 1);
  assert.deepEqual(estado.placar, [0, 0]);
  const comeca = estado.comeca;

  // jogada fora da vez não mexe em nada
  (comeca === 0 ? B : A).emit('jogada', { casa: 8 });
  await pausa(60);
  assert.equal(M.stateOf(ana.userId).inDisputeBalance, 2, 'a entrada de R$ 2,00 ficou presa');

  await jogar(VENCE_1o, comeca);                 // rodada 1: vence quem abriu
  await pausa(200);
  await jogar(VENCE_2o, 1 - comeca);             // rodada 2: abre o outro, vence o mesmo
  const settled = await acabou;

  const ids = [ana.userId, beto.userId];
  const venceu = ids[comeca], perdeu = ids[1 - comeca];
  assert.equal(total(venceu), saldoAntes[comeca] - 2 + 3.6,
    'vencedor: pagou R$ 2,00 de entrada e recebeu R$ 3,60');
  assert.equal(total(perdeu), saldoAntes[1 - comeca] - 2, 'perdedor: só a entrada');
  assert.equal(M.stateOf(venceu).inDisputeBalance, 0, 'nada fica preso depois do fim');
  assert.ok(settled.state, 'o settled traz o estado novo da carteira');
  console.log('✔ melhor de 3: 2 a 0 fecha a série e o prêmio é pago');
  A.emit('leave'); B.emit('leave');
  await pausa(120);
}

// --- 3 empates: decide quem pensou menos --------------------------------
{
  const saldoAntes = [total(ana.userId), total(beto.userId)];
  const { estado } = await partida();
  const acabou = espera(A, 'settled');
  let comeca = estado.comeca;
  const lento = 1 - estado.comeca;                // um deles enrola em toda jogada
  const ids = [ana.userId, beto.userId];
  for (let r = 0; r < 3; r++) {
    await jogar(EMPATE, comeca, { [lento]: 150 });
    await pausa(200);
    comeca = 1 - comeca;
  }
  const settled = await acabou;
  assert.equal(settled.empate, undefined, 'com tempos diferentes não é empate');
  const rapido = 1 - lento;
  assert.equal(total(ids[rapido]), saldoAntes[rapido] - 2 + 3.6, 'quem pensou mais rápido levou');
  assert.equal(total(ids[lento]), saldoAntes[lento] - 2, 'o lento pagou a entrada');
  console.log('✔ série empatada em 3 rodadas: o relógio decide');
  A.emit('leave'); B.emit('leave');
  await pausa(80);
}

// --- estourar o relógio perde a rodada, não a partida --------------------
{
  const { estado } = await partida();
  const perdedor = estado.comeca;                 // ninguém joga: quem começa estoura
  const depois = await espera(A, 'estado');
  assert.equal(depois.ultima?.tempo, true, 'o servidor marcou estouro de tempo');
  assert.equal(depois.placar[1 - perdedor], 1, 'quem esperou ganhou a rodada');
  assert.equal(depois.rodada, 2, 'e a partida continua na rodada 2');
  console.log('✔ estouro de relógio custa a rodada, e a série segue');
  A.emit('leave'); B.emit('leave');
  await pausa(80);
}

A.close(); B.close();
io.close();
http.close();
console.log('velha: 3 grupos ok');
