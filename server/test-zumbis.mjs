// Auto-verificação do Zombie Rush no servidor: 4 soldados pela rede, cada robô atirando
// no zumbi mais perto que vê no estado (um nunca atira), até o fim do tempo; quem fez
// mais pontos leva e recebe; saída no meio.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ZUMBIS_TEMPO = '20000';
process.env.ZUMBIS_CONTAGEM = '300';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/zumbis/regras.js');

const PORT = 3471;
const { http, io } = listen(PORT, 'zumbis');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/zumbis', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto', 'Caio', 'Dani'].map((n) => novo(`${n.toLowerCase()}@zumbis.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(qtd, sala) {
  const quem = S.slice(0, qtd);
  const starts = quem.map((s) => espera(s, 'start'));
  for (const s of quem) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  quem.forEach((s, k) => s.emit('cor', R.CORES[k]));
  await Promise.all(starts);
  return quem;
}

/** Robô: mira no zumbi vivo mais perto e atira (comandos numerados, igual o cliente). */
function soldado(s, atira, log) {
  let seq = 0;
  s.on('estado', (e) => {
    log.ultimo = e;
    for (const ev of e.ev) log.ev.push(ev);
    if (e.fase !== 'jogo') return;
    const [x, y] = e.s[e.assento];
    const z = e.z.filter((z) => !z[8] && !z[7]).sort((a, b) => Math.hypot(a[2] - x, a[3] - y) - Math.hypot(b[2] - x, b[3] - y))[0];
    const ang = z ? Math.atan2(z[3] - R.ZUMBIS[z[1]].h / 2 - (y - R.SOLDADO.h * 0.55), z[2] - x) : 0;
    s.emit('jogada', { cmds: [{ s: ++seq, dt: 33, mx: 0, pulo: false, desce: false, ang, fogo: atira && !!z }] });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  const quem = await mesa(4, 'bronze');
  const logs = quem.map(() => ({ ev: [] }));
  const fins = quem.map((s) => espera(s, 'settled'));
  quem.forEach((s, k) => soldado(s, k !== 3, logs[k]));
  await Promise.all(fins);
  quem.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  assert.deepEqual(e.cores, R.CORES, 'cada um com o soldado que escolheu');
  assert.ok(logs[0].ev.filter((x) => x.tipo === 'zumbiMorreu').length > 5, 'mataram zumbis');
  assert.equal(e.pontos[3], 0, 'quem não atira não pontua');
  assert.deepEqual(logs[1].ev.map((x) => x.id), logs[0].ev.map((x) => x.id), 'todo mundo viu os mesmos eventos');
  if (e.fim.vencedor != null) {
    assert.equal(e.pontos[e.fim.vencedor], Math.max(...e.pontos), 'quem fez mais pontos venceu');
    assert.ok(total(contas[e.fim.vencedor].userId) > antes[e.fim.vencedor], 'o vencedor recebeu');
  }
  console.log(`✔ 4 soldados até o fim: pontos ${e.pontos}, vencedor ${e.fim.vencedor}`);
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
console.log('zumbis: servidor ok');
process.exit(0);
