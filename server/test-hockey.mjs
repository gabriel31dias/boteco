// Auto-verificação do Air Hockey Neon no servidor: dois robôs pela rede,
// cada um correndo atrás do disco que recebe, até o fim; placar bate com os
// gols anunciados, vencedor recebe; saída no meio dá W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.HOCKEY_TEMPO = '25000';
process.env.HOCKEY_CONTAGEM = '200';
process.env.HOCKEY_PAUSA = '200';
process.env.ESPERA_MESA = '300';
process.env.ESCOLHA_MS = '200';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/hockey/regras.js');

const PORT = 3469;
const { http, io } = listen(PORT, 'hockey');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/hockey', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto'].map((n) => novo(`${n.toLowerCase()}@hockey.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(sala) {
  const starts = S.map((s) => espera(s, 'start'));
  S[0].emit('join', { roomType: sala, cor: 'vermelho' }); await espera(S[0], 'joined');
  S[1].emit('join', { roomType: sala, cor: 'azul' }); await espera(S[1], 'joined');
  return Promise.all(starts);
}

/** Robô: vai pra trás do disco e empurra pro gol do outro. */
function robo(s, i, log) {
  s.on('estado', (e) => {
    log.ultimo = e;
    for (const ev of e.ev) if (ev.tipo === 'gol') log.gols.push(ev);
    const [x, y] = e.d;
    const atras = i === 0 ? 30 : -30;
    s.emit('jogada', { x: x + (Math.random() - 0.5) * (i === 0 ? 10 : 60), y: y + atras });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  await mesa('bronze');
  const logs = [{ gols: [] }, { gols: [] }];
  const fins = S.map((s) => espera(s, 'settled'));
  S.forEach((s, i) => robo(s, i, logs[i]));
  await Promise.all(fins);
  S.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  const soma = [0, 0];
  for (const g of logs[0].gols) soma[g.de]++;
  assert.deepEqual(e.placar, soma, 'placar bate com os gols anunciados');
  assert.deepEqual(logs[1].gols.map((g) => g.placar), logs[0].gols.map((g) => g.placar), 'os dois viram os mesmos gols');
  assert.ok(e.d[0] >= 0 && e.d[0] <= R.LARGURA, 'disco na mesa');
  const depois = contas.map((c) => total(c.userId));
  if (e.fim.vencedor != null) assert.ok(depois[e.fim.vencedor] > antes[e.fim.vencedor], 'o vencedor recebeu');
  console.log(`✔ partida pela rede até o fim: ${e.placar} (${e.fim.motivo})`);
}
{
  await mesa('prata');
  await pausa(500);
  const fim = espera(S[0], 'settled');
  S[1].emit('leave');
  assert.ok((await fim).prize > 0, 'quem ficou leva');
}
console.log('✔ saída no meio');
{
  // Na espera do 1×1, quem cancela não derruba quem ficou: ele segue na fila e o próximo joga com ele.
  const [a, b, c] = [S[0], S[1], cliente(novo('caio@hockey.com', 'Caio').token)];
  a.emit('join', { roomType: 'treino', cor: 'vermelho' }); const ja = await espera(a, 'joined');
  b.emit('join', { roomType: 'treino' }); await espera(b, 'joined');
  b.emit('leave'); await pausa(100);
  const start = espera(a, 'start');
  c.emit('join', { roomType: 'treino', cor: 'azul' });
  assert.equal((await espera(c, 'joined')).code, ja.code, 'entrou na sala de quem ficou');
  assert.equal((await start).players.length, 2, 'a partida abriu');
  a.emit('leave'); await pausa(200); c.close();
}
console.log('✔ quem cancela na espera não derruba o outro');
S.forEach((s) => s.close()); io.close(); http.close();
console.log('hockey: servidor ok');
process.exit(0);
