// Auto-verificação da Corrida de Jegues no servidor: 4 jegues pela rede,
// cada robô pulando os obstáculos que vê no estado, até a chegada; quem
// cruzou primeiro é o vencedor e recebe; saída no meio.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.JEGUES_PISTA = '5000';
process.env.JEGUES_CONTAGEM = '300';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/jegues/regras.js');

const PORT = 3469;
const { http, io } = listen(PORT, 'jegues');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/jegues', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto', 'Caio', 'Dani'].map((n) => novo(`${n.toLowerCase()}@jegues.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(qtd, sala) {
  const quem = S.slice(0, qtd);
  const starts = quem.map((s) => espera(s, 'start'));
  for (const s of quem) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  // jogo com escolha: cada um pega um jegue (o servidor só abre quando todos escolheram)
  quem.forEach((s, k) => s.emit('cor', R.CORES[k]));
  await Promise.all(starts);
  return quem;
}

/** Robô: guarda a pista, pula quando o próximo obstáculo chega perto (`antes` px), chicoteia com fôlego. */
function corredor(s, antes, log) {
  let pista = null, passou = -1;
  s.on('estado', (e) => {
    log.ultimo = e;
    if (e.pista) pista = e.pista;
    for (const ev of e.ev) log.ev.push(ev);
    if (e.fase !== 'corrida' || !pista) return;
    const [x, , , cansaco] = e.j[e.assento];
    const o = pista.obst.find((q) => q.id > passou && q.x + R.OBSTACULOS[q.tipo].w > x + R.CORPO[0]);
    if (o && o.x - (x + R.CORPO[1]) < antes) { s.emit('jogada', { pular: true }); passou = o.id; }
    if (cansaco < 0.5 && Math.random() < 0.3) s.emit('jogada', { chicote: true });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  const quem = await mesa(4, 'bronze');
  const logs = quem.map(() => ({ ev: [] }));
  const fins = quem.map((s) => espera(s, 'settled'));
  quem.forEach((s, k) => corredor(s, [80, 80, 40, -100][k], logs[k]));
  await Promise.all(fins);
  quem.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  assert.equal(e.fim.motivo, 'chegada');
  const chegou = logs[0].ev.find((x) => x.tipo === 'chegou');
  assert.equal(chegou.i, e.fim.vencedor, 'quem cruzou primeiro venceu');
  assert.ok(e.j[e.fim.vencedor][0] >= 5000, 'o vencedor passou da chegada');
  assert.ok(logs[0].ev.some((x) => x.tipo === 'tombo' && x.i === 3), 'quem não pula cai');
  assert.deepEqual(logs[1].ev.map((x) => x.id), logs[0].ev.map((x) => x.id), 'todo mundo viu os mesmos eventos');
  assert.deepEqual(e.cores, R.CORES.slice(0, 4), 'cada um com o jegue que escolheu');
  const depois = contas.map((c) => total(c.userId));
  assert.ok(depois[e.fim.vencedor] > antes[e.fim.vencedor], 'o vencedor recebeu');
  console.log(`✔ 4 jegues até a chegada: vencedor ${e.fim.vencedor}, x ${e.j.map((j) => Math.round(j[0]))}`);
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
console.log('jegues: servidor ok');
process.exit(0);
