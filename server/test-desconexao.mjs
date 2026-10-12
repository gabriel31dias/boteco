// Queda de conexão no meio da partida, em todos os jogos de 2: quem caiu
// perde (W.O.) e quem ficou leva o prêmio. Também: cair ainda na fila não
// cobra nada, app em segundo plano por tempo demais é W.O., e quem volta a
// tempo não perde nada. Desconexão é `socket.disconnect()` — sem `leave`.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ESPERA_MESA = '300';        // mesa de 2 a N abre logo com 2
process.env.AUSENCIA_MS = '400';        // segundo plano: W.O. em 0,4s no teste
process.env.TANQUE_CONTAGEM = '50';
process.env.RATOS_CONTAGEM = '50';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const JOGOS = ['sinuca', 'velha', 'truco', 'damas', 'domino', 'poker', 'buraco', 'cacheta', 'tanque', 'ratos'];
const DUPLAS = ['truco-duplas', 'domino-duplas', 'buraco-duplas'];
const servidores = [...JOGOS, ...DUPLAS].map((jogo, k) => ({ jogo, porta: 3500 + k, ...listen(3500 + k, jogo) }));

let n = 0;
const novo = (nome) => {
  const email = `${nome.toLowerCase()}${++n}@queda.com`;
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const espera = (s, ev, ms = 5000) => new Promise((ok, falha) => {
  const t = setTimeout(() => falha(new Error(`não chegou '${ev}' em ${ms}ms`)), ms);
  s.once(ev, (v) => { clearTimeout(t); ok(v); });
});
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Math.round((s.walletBalance + s.bonusBalance) * 100); };
const cliente = (porta, jogo, token) => connect(`http://localhost:${porta}`, { path: `/ws/${jogo}`, auth: { token }, transports: ['websocket'] });

/** Abre uma partida de bronze (R$ 2,00) entre dois jogadores novos. */
async function partida({ jogo, porta }) {
  const a = novo('Ana'), b = novo('Beto');
  const A = cliente(porta, jogo, a.token), B = cliente(porta, jogo, b.token);
  await Promise.all([espera(A, 'connect'), espera(B, 'connect')]);
  const inicio = [espera(A, 'start'), espera(B, 'start')];
  // tanque e ratos: cada um escolhe o seu (sem escolha a mesa não abre)
  const cor = (c) => (['tanque', 'ratos'].includes(jogo) ? { cor: c } : {});
  A.emit('join', { roomType: 'bronze', ...cor('azul') });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze', ...cor('vermelho') });
  const [sa] = await Promise.all(inicio);
  return { a, b, A, B, matchId: sa.matchId };
}

// --- cada jogo: um cai no meio, o outro ganha
for (const srv of servidores.filter((s) => JOGOS.includes(s.jogo))) {
  const { a, b, A, B, matchId } = await partida(srv);
  const antes = [total(a.userId), total(b.userId)];   // já com a entrada debitada
  await pausa(150);                                    // partida rolando
  const pago = espera(B, 'settled');
  A.disconnect();                                      // caiu: sem 'leave'
  const r = await pago;
  assert.ok(r.prize > 0, `${srv.jogo}: quem ficou leva o prêmio`);
  const m = one('SELECT status, winner_id FROM matches WHERE id = ?', matchId);
  assert.equal(m.status, 'settled', `${srv.jogo}: partida fechada`);
  assert.equal(m.winner_id, b.userId, `${srv.jogo}: o vencedor é quem ficou`);
  assert.ok(total(b.userId) > antes[1], `${srv.jogo}: saldo de quem ficou subiu`);
  assert.equal(total(a.userId), antes[0], `${srv.jogo}: quem caiu não recebe nada (a entrada já tinha saído)`);
  assert.equal(M.emPartida(a.userId), false, `${srv.jogo}: quem caiu está livre pra jogar de novo`);
  assert.equal(M.emPartida(b.userId), false, `${srv.jogo}: quem ganhou também`);
  B.disconnect();
  console.log(`✔ ${srv.jogo}: caiu no meio, o outro ganhou`);
}

// --- caiu ainda na fila: nada foi cobrado, a fila fica livre
{
  const srv = servidores.find((s) => s.jogo === 'velha');
  const a = novo('Fila'), c = novo('Caio'), d = novo('Duda');
  const antes = total(a.userId);
  const A = cliente(srv.porta, srv.jogo, a.token);
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  A.disconnect();
  await pausa(100);
  assert.equal(total(a.userId), antes, 'sair da fila não cobra');
  // a fila não ficou presa com o fantasma: dois novos casam entre si
  const C = cliente(srv.porta, srv.jogo, c.token), D = cliente(srv.porta, srv.jogo, d.token);
  const inicio = [espera(C, 'start'), espera(D, 'start')];
  C.emit('join', { roomType: 'bronze' });
  await espera(C, 'joined');
  D.emit('join', { roomType: 'bronze' });
  const [sc] = await Promise.all(inicio);
  assert.deepEqual(sc.players.map((p) => p.name), ['Caio', 'Duda'], 'quem caiu não ocupa vaga');
  C.disconnect(); D.disconnect();
  await pausa(100);
  console.log('✔ caiu na fila: nada cobrado e a vaga liberada');
}

// --- app em segundo plano por tempo demais: W.O. (a conexão continua aberta)
{
  const srv = servidores.find((s) => s.jogo === 'truco');
  const { b, A, B, matchId } = await partida(srv);
  await pausa(100);
  const aviso = espera(B, 'ausente');
  const pago = espera(B, 'settled');
  A.emit('presenca', false);
  assert.ok((await aviso).segundos >= 0, 'quem ficou é avisado da contagem');
  await pago;
  assert.equal(one('SELECT winner_id FROM matches WHERE id = ?', matchId).winner_id, b.userId, 'segundo plano demais: W.O.');
  A.disconnect(); B.disconnect();
  console.log('✔ segundo plano demais: W.O. pra quem ficou');
}

// --- voltou a tempo: a partida segue, ninguém perde
{
  const srv = servidores.find((s) => s.jogo === 'damas');
  const { A, B, matchId } = await partida(srv);
  await pausa(100);
  A.emit('presenca', false);
  await pausa(150);
  A.emit('presenca', true);
  const voltou = await espera(B, 'ausente').catch(() => null);
  await pausa(500);                                     // passou do AUSENCIA_MS
  assert.equal(one('SELECT status FROM matches WHERE id = ?', matchId).status, 'playing', 'voltou a tempo: segue jogando');
  assert.ok(voltou === null || voltou.voltou || voltou.segundos >= 0);
  A.disconnect(); B.disconnect();
  await pausa(100);
  console.log('✔ voltou a tempo: partida segue');
}

// --- tempo real com 3: um cai, os outros dois continuam; o último que sobra leva
{
  const srv = servidores.find((s) => s.jogo === 'ratos');
  const js = ['Ana', 'Beto', 'Caio'].map(novo);
  const S = js.map((j) => cliente(srv.porta, srv.jogo, j.token));
  await Promise.all(S.map((s) => espera(s, 'connect')));
  const inicio = S.map((s) => espera(s, 'start'));
  for (const [k, s] of S.entries()) { s.emit('join', { roomType: 'bronze', cor: ['azul', 'vermelho', 'verde'][k] }); await espera(s, 'joined'); }
  const [st] = await Promise.all(inicio);
  assert.equal(st.players.length, 3);
  await pausa(150);
  S[2].disconnect();
  await pausa(100);
  const e2 = await espera(S[0], 'estado');
  assert.equal(e2.fora[2], true, 'quem caiu está fora');
  assert.equal(e2.fim, null, 'os outros dois seguem');
  const pago = espera(S[0], 'settled');
  S[1].disconnect();
  const r = await pago;
  assert.ok(r.prize > 0, 'o último leva o pote');
  assert.equal(one('SELECT winner_id FROM matches WHERE id = ?', st.matchId).winner_id, js[0].userId);
  S[0].disconnect();
  console.log('✔ ratos com 3: um cai, segue; o último leva');
}

// --- duplas: um cai, o time adversário inteiro ganha (os dois levam o prêmio)
for (const srv of servidores.filter((s) => DUPLAS.includes(s.jogo))) {
  const js = ['Ana', 'Beto', 'Caio', 'Duda'].map(novo);
  const S = js.map((j) => cliente(srv.porta, srv.jogo, j.token));
  await Promise.all(S.map((s) => espera(s, 'connect')));
  const inicio = S.map((s) => espera(s, 'start'));
  for (const s of S) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  const starts = await Promise.all(inicio);
  await pausa(150);
  // quem está no assento 0 cai: o time dos assentos ímpares ganha
  const k0 = starts.findIndex((st) => st.seat === 0);
  const timeB = starts.map((st, k) => (st.seat % 2 === 1 ? k : -1)).filter((k) => k >= 0);
  const antes = timeB.map((k) => total(js[k].userId));
  const pagos = timeB.map((k) => espera(S[k], 'settled'));
  S[k0].disconnect();
  await Promise.all(pagos);
  timeB.forEach((k, j) => assert.ok(total(js[k].userId) > antes[j], `${srv.jogo}: ${js[k].name} (time que ficou) levou`));
  const parceiro = starts.findIndex((st) => st.seat === 2);
  assert.equal(M.emPartida(js[parceiro].userId), false, `${srv.jogo}: o parceiro de quem caiu também fica livre`);
  for (const s of S) s.disconnect();
  await pausa(100);
  console.log(`✔ ${srv.jogo}: um caiu, o time adversário ganhou`);
}

for (const s of servidores) { s.io.close(); s.http.close(); }
console.log('desconexão: ok');
process.exit(0);
