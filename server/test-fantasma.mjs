// Ninguém joga com fantasma. Antes de abrir a partida (e cobrar), cada um tem
// que responder "estou aqui" com o app na tela; quem não responde sai da mesa e
// quem ficou espera outro adversário, sem pagar nada. E quem caiu, levou W.O. e
// voltou com outra conexão ouve "não está mais na partida" ao conferir.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.CONFERE_MS = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORTA = 3620;
listen(PORTA, 'velha');

let n = 0;
const novo = (nome) => {
  const email = `${nome.toLowerCase()}${++n}@fantasma.com`;
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const espera = (s, ev, ms = 3000) => new Promise((ok, falha) => {
  const t = setTimeout(() => falha(new Error(`não chegou '${ev}' em ${ms}ms`)), ms);
  s.once(ev, (v) => { clearTimeout(t); ok(v); });
});
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Math.round((s.walletBalance + s.bonusBalance) * 100); };
/** `responde`: o que o app diz na conferência (null = app travado, não responde). */
const cliente = (token, responde = { visivel: true }) => {
  const s = connect(`http://localhost:${PORTA}`, { path: '/ws/velha', auth: { token, vivo: 1 }, transports: ['websocket'] });
  s.on('vivo', (cb) => { if (responde) cb(responde); });
  return s;
};

for (const [caso, resposta] of [['não respondeu', null], ['app em segundo plano', { visivel: false }]]) {
  const a = novo('Fantasma'), b = novo('Bia'), c = novo('Caio');
  const A = cliente(a.token, resposta), B = cliente(b.token), C = cliente(c.token);
  await Promise.all([espera(A, 'connect'), espera(B, 'connect'), espera(C, 'connect')]);
  const antes = [total(a.userId), total(b.userId)];

  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  const negado = espera(A, 'denied');
  let comecouB = false;
  B.once('start', () => { comecouB = true; });
  B.emit('join', { roomType: 'bronze' });
  await negado;
  await pausa(100);
  assert.equal(comecouB, false, `${caso}: a partida não abre com fantasma`);
  assert.equal(total(a.userId), antes[0], `${caso}: o fantasma não pagou nada`);
  assert.equal(total(b.userId), antes[1], `${caso}: quem estava presente não pagou nada`);
  assert.equal(M.emPartida(b.userId), false, `${caso}: nenhuma partida aberta`);

  // quem ficou continua na fila: o próximo que chega joga com ele
  const comeca = [espera(B, 'start'), espera(C, 'start')];
  C.emit('join', { roomType: 'bronze' });
  const [sb, sc] = await Promise.all(comeca);
  assert.equal(sb.matchId, sc.matchId, `${caso}: quem ficou joga com o próximo`);
  for (const s of [A, B, C]) s.disconnect();
  console.log(`✔ ${caso}: fantasma fora da mesa, ninguém pagou, o outro achou adversário`);
  await pausa(100);
}

// caiu no meio, levou W.O. e voltou com outra conexão: conferir diz que acabou
{
  const a = novo('Volta'), b = novo('Beto');
  const A = cliente(a.token), B = cliente(b.token);
  await Promise.all([espera(A, 'connect'), espera(B, 'connect')]);
  const inicio = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  await Promise.all(inicio);

  const naPartida = (s) => new Promise((ok) => s.timeout(1000).emit('conferir', (err, r) => ok(err ? 'sem resposta' : r.naPartida)));
  assert.equal(await naPartida(A), true, 'durante a partida: está nela');

  const pago = espera(B, 'settled');
  A.disconnect();   // internet caiu
  await pago;
  const A2 = cliente(a.token);   // internet voltou: conexão nova
  await espera(A2, 'connect');
  assert.equal(await naPartida(A2), false, 'voltou depois do W.O.: não está mais na partida');
  A2.disconnect(); B.disconnect();
  console.log('✔ caiu, levou W.O. e voltou: o app fica sabendo que a partida acabou');
}

console.log('fantasma: ok');
process.exit(0);
