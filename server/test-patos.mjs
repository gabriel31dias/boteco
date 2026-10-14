// Auto-verificação da Caçada de Patos no servidor: 4 caçadores pela rede,
// cada um mirando nos patos que recebe (com o tempo que viu), até o fim;
// pontos batem com os abates anunciados, vencedor recebe; saída no meio.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.PATOS_RODADA = '5000';
process.env.PATOS_INTERVALO = '300';
process.env.PATOS_CONTAGEM = '200';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/patos/regras.js');

const PORT = 3468;
const { http, io } = listen(PORT, 'patos');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/patos', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto', 'Caio', 'Dani'].map((n) => novo(`${n.toLowerCase()}@patos.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(qtd, sala) {
  const quem = S.slice(0, qtd);
  const starts = quem.map((s) => espera(s, 'start'));
  for (const s of quem) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  await Promise.all(starts);
  return quem;
}

/** Caçador: a cada estado, mira no primeiro pato vivo (pontaria piora com `erro`). */
function cacador(s, erro, log) {
  s.on('estado', (e) => {
    log.ultimo = e;
    for (const ev of e.ev) if (ev.tipo === 'abate') log.abates.push(ev);
    if (e.fase !== 'jogo' || Math.random() > 0.5) return;
    const vivo = e.d.find((d) => d[11] == null);
    if (!vivo) return;
    const [id, tipo, t0, x0, y0, dir, v, amp, freq, fase, sobe] = vivo;
    const q = R.posicao({ t0, x0, y0, dir, v, amp, freq, fase, sobe }, e.agora);
    s.emit('jogada', { x: q.x + (Math.random() - 0.5) * erro, y: q.y + (Math.random() - 0.5) * erro, t: e.agora });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  const quem = await mesa(4, 'bronze');
  const logs = quem.map(() => ({ abates: [] }));
  const fins = quem.map((s) => espera(s, 'settled'));
  quem.forEach((s, k) => cacador(s, [10, 40, 90, 200][k], logs[k]));
  await Promise.all(fins);
  quem.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  // os pontos de cada um = soma dos abates anunciados pra ele (todos receberam os mesmos anúncios)
  const soma = [0, 0, 0, 0];
  for (const ev of logs[0].abates) soma[ev.de] += ev.pontos;
  assert.deepEqual(e.pontos, soma, 'placar bate com os abates');
  assert.deepEqual(logs[1].abates.map((x) => x.pato), logs[0].abates.map((x) => x.pato), 'todo mundo viu os mesmos abates');
  assert.equal(new Set(logs[0].abates.map((x) => x.pato)).size, logs[0].abates.length, 'cada pato morre uma vez');
  const depois = contas.map((c) => total(c.userId));
  if (e.fim.vencedor != null) assert.ok(depois[e.fim.vencedor] > antes[e.fim.vencedor], 'o vencedor recebeu');
  console.log(`✔ 4 caçadores até o fim: pontos ${e.pontos}, abates ${e.abates}, tiros ${e.tiros}`);
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
console.log('patos: servidor ok');
process.exit(0);
