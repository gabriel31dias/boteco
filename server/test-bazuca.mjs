// Auto-verificação de Bazuca x Helicópteros no servidor: 5 soldados pela rede, cada robô
// atirando no helicóptero que vê (um mira na frente, um no lugar, um nunca atira), até o
// fim do tempo; quem derrubou mais leva e recebe; saída no meio.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.BAZUCA_TEMPO = '15000';
process.env.BAZUCA_CONTAGEM = '300';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/bazuca/regras.js');

const PORT = 3470;
const { http, io } = listen(PORT, 'bazuca');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/bazuca', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto', 'Caio', 'Dani', 'Edu'].map((n) => novo(`${n.toLowerCase()}@bazuca.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(qtd, sala) {
  const quem = S.slice(0, qtd);
  const starts = quem.map((s) => espera(s, 'start'));
  for (const s of quem) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  quem.forEach((s, k) => s.emit('cor', R.CORES[k]));
  await Promise.all(starts);
  return quem;
}

/** Robô: mira no helicóptero mais perto `frente` ms à frente; `cada` = de quantos em quantos estados tenta. */
function soldado(s, frente, cada, log) {
  let k = 0, seq = 0;
  s.on('estado', (e) => {
    log.ultimo = e;
    for (const ev of e.ev) log.ev.push(ev);
    if (e.fase === 'jogo' && log.anda && k % 30 === 0) s.emit('jogada', { andar: [1, -1, 0][(k / 30) % 3] });
    if (e.fase !== 'jogo' || !cada || k++ % cada) return;
    const h = e.h.map(([id, tipo, t0, x0, y0, dir, v, amp, freq, fase, morto]) => ({ t0, x0, y0, dir, v, amp, freq, fase, morto }))
      .find((h) => h.morto == null && (() => { const c = R.posHeli(h, e.agora); return c.x > 50 && c.x < R.LARGURA - 50; })());
    if (!h) return;
    const c = R.posHeli(h, e.agora + frente);
    s.emit('jogada', { x: c.x, y: c.y, t: e.agora, seq: ++seq });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  const quem = await mesa(5, 'bronze');
  const logs = quem.map(() => ({ ev: [] }));
  const fins = quem.map((s) => espera(s, 'settled'));
  logs[3].anda = true;
  const xs = [];
  quem[0].on('estado', (e) => xs.push(e.x[3]));
  quem.forEach((s, k) => soldado(s, [380, 380, 0, 380, 0][k], [1, 4, 2, 8, 0][k], logs[k]));
  await Promise.all(fins);
  quem.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  assert.equal(e.n, 5);
  assert.deepEqual(e.cores, R.CORES, 'cada um com o soldado que escolheu');
  const abates = logs[0].ev.filter((x) => x.tipo === 'abate');
  assert.ok(abates.length > 3, `derrubaram: ${abates.length}`);
  assert.equal(e.abates[4], 0, 'quem não atira não derruba');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 100, `o 3 andou: ${Math.min(...xs)}..${Math.max(...xs)}`);
  assert.equal(new Set(e.x).size, 5);
  assert.deepEqual(logs[2].ev.map((x) => x.id), logs[0].ev.map((x) => x.id), 'todo mundo viu os mesmos eventos');
  if (e.fim.vencedor != null) {
    assert.equal(e.abates[e.fim.vencedor], Math.max(...e.abates), 'quem derrubou mais venceu');
    assert.ok(total(contas[e.fim.vencedor].userId) > antes[e.fim.vencedor], 'o vencedor recebeu');
  }
  console.log(`✔ 5 soldados até o fim: abates ${e.abates}, vencedor ${e.fim.vencedor}`);
}
{
  const quem = await mesa(3, 'prata');
  await pausa(400);
  quem[2].emit('leave');
  await pausa(300);
  const fimA = espera(quem[0], 'settled');
  quem[1].emit('leave');
  assert.ok((await fimA).prize > 0, 'o último leva');
}
console.log('✔ saída no meio');
S.forEach((s) => s.close()); io.close(); http.close();
console.log('bazuca: servidor ok');
process.exit(0);
