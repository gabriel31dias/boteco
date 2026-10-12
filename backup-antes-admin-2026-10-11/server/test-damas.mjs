// Auto-verificação das damas valendo dinheiro. O motor já vem com perft
// validado; o que este teste cobra é o que o servidor acrescenta: lance por
// índice (não por origem/destino), captura obrigatória, o relógio dando W.O.
// em quem não joga, e o dinheiro caindo no lugar certo.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.DAMAS_TEMPO = '1200';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const D = await import('./jogos/damas.js');

const PORT = 3447;
const { http, io } = listen(PORT, 'damas');

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
  path: '/ws/damas', auth: { token }, transports: ['websocket'],
});
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@damas.com', 'Ana');
const beto = novo('beto@damas.com', 'Beto');
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
assert.equal(sa.game, 'damas');
await pausa(150);

// --- o tabuleiro chega inteiro e os lances só pra quem joga ---------------
{
  const [ea, eb] = estados;
  assert.equal(ea.tabuleiro.length, 64, 'tabuleiro 8x8 como array de verdade');
  assert.ok(Array.isArray(ea.tabuleiro), 'e não o objeto que Int8Array vira no JSON');
  assert.deepEqual(ea.tabuleiro, eb.tabuleiro, 'informação perfeita: os dois veem o mesmo');
  assert.deepEqual(ea.pecas, { p: 12, c: 12, pk: 0, ck: 0 }, '12 peças de cada lado');
  const daVez = ea.vez;
  assert.ok(estados[daVez].lances.length > 0, 'quem está na vez recebe os lances');
  assert.equal(estados[1 - daVez].lances.length, 0, 'o outro não recebe lance nenhum');
  console.log('✔ tabuleiro completo pros dois, lances só pra quem joga');
}

// --- lance por índice, e índice inválido não mexe em nada -----------------
{
  const vez = estados[0].vez;
  const antes = [...estados[0].tabuleiro];
  sock[1 - vez].emit('jogada', { indice: 0 });          // fora da vez
  await pausa(100);
  assert.deepEqual(estados[0].tabuleiro, antes, 'jogada fora da vez é ignorada');
  sock[vez].emit('jogada', { indice: 999 });            // índice que não existe
  await pausa(100);
  assert.deepEqual(estados[0].tabuleiro, antes, 'índice inválido também');

  const lance = estados[vez].lances[0];
  sock[vez].emit('jogada', { indice: lance.i });
  await pausa(150);
  assert.equal(estados[0].tabuleiro[lance.from], 0, 'a casa de origem esvaziou');
  assert.notEqual(estados[0].tabuleiro[lance.to], 0, 'e a de destino tem peça');
  assert.equal(estados[0].vez, 1 - vez, 'a vez passou');
  console.log('✔ lance por índice: fora da vez e índice inexistente não mudam nada');
}

// --- captura obrigatória: com captura na mesa, só ela é lance legal -------
{
  // Monta uma posição de captura direto no motor, sem depender de sorte.
  const p = D.novaPartida();
  p.st.b.fill(0);
  p.st.b[8 * 5 + 2] = 1;      // peça do assento 0
  p.st.b[8 * 4 + 3] = -1;     // peça adversária na diagonal
  p.st.turn = 1;
  const lances = p.rules.moves(p.st);
  assert.ok(lances.length > 0);
  assert.ok(lances.every((m) => m.captures.length > 0), 'havendo captura, todo lance legal captura');
  console.log('✔ captura obrigatória: nenhum lance quieto aparece na lista');
}

// --- partida inteira, lance a lance, até alguém vencer --------------------
{
  let voltas = 0;
  while (!estados[0]?.fim && voltas++ < 2000) {
    const vez = estados[0]?.vez;
    if (vez == null) { await pausa(20); continue; }
    const e = estados[vez];
    if (!e?.lances?.length) { await pausa(20); continue; }
    // joga o lance que captura mais; sem captura, o primeiro
    const melhor = e.lances.reduce((a, b) => (b.captures.length > a.captures.length ? b : a));
    sock[vez].emit('jogada', { indice: melhor.i });
    await pausa(12);
  }
  assert.ok(estados[0].fim, 'a partida termina sozinha');
  const fim = estados[0].fim;
  await acabou;

  const ids = [ana.userId, beto.userId];
  if (fim.vencedor === null) {
    assert.equal(total(ids[0]), saldoAntes[0], 'empate estorna a entrada dos dois');
    assert.equal(total(ids[1]), saldoAntes[1]);
    console.log('✔ partida completa: empate pela regra dos 40 lances, aposta devolvida');
  } else {
    const v = fim.vencedor;
    assert.equal(total(ids[v]), saldoAntes[v] - 2 + 3.6, 'vencedor levou o prêmio');
    assert.equal(total(ids[1 - v]), saldoAntes[1 - v] - 2, 'perdedor pagou a entrada');
    console.log('✔ partida completa: vencedor por lances e a aposta paga');
  }
}

// --- relógio: quem não joga no prazo perde por W.O. -----------------------
{
  A.emit('leave'); B.emit('leave');
  await pausa(150);
  const s2 = espera(A, 'start');
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  const st = await s2;
  await pausa(150);

  const ids = [ana.userId, beto.userId];
  const antes = ids.map(total);                   // já sem a entrada: ela sai na abertura
  const vez = estados[0].vez;
  const tabuleiro = [...estados[0].tabuleiro];
  const pago = espera(A, 'settled');
  await pausa(1500);                              // ninguém joga: estoura

  assert.deepEqual(estados[0].fim, { vencedor: 1 - vez, motivo: 'tempo' }, 'quem estava na vez perdeu no tempo');
  assert.deepEqual(estados[0].tabuleiro, tabuleiro, 'e ninguém jogou por ele');
  await pago;
  assert.equal(total(ids[vez]), antes[vez], 'o ausente fica sem a entrada');
  assert.equal(total(ids[1 - vez]), Number((antes[1 - vez] + 3.6).toFixed(2)), 'o adversário leva o prêmio');
  assert.ok(st.matchId);
  console.log('✔ relógio: estourar o prazo é W.O., sem lance automático');
}

A.close(); B.close();
io.close();
http.close();
console.log('damas: 5 grupos ok');
