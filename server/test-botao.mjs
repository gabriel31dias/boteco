// Auto-verificação do Futebol de Botão no servidor: a petelecada vai pros
// dois com os quadros, fora da vez é recusada, quem larga o celular perde no
// relógio (e o outro recebe), e quem sai no meio dá W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.BOTAO_TEMPO = '250';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3467;
const { http, io } = listen(PORT, 'botao');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/botao', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const [ana, beto] = [novo('ana@botao.com', 'Ana'), novo('beto@botao.com', 'Beto')];
const A = cliente(ana.token), B = cliente(beto.token);
const ultimo = new Map();
for (const s of [A, B]) s.on('estado', (e) => ultimo.set(s, e));

const abrir = async (sala) => {
  const s = [espera(A, 'start'), espera(B, 'start')];
  A.emit('join', { roomType: sala });
  await espera(A, 'joined');
  B.emit('join', { roomType: sala });
  const [sa, sb] = await Promise.all(s);
  assert.equal(sa.game, 'botao');
  await pausa(100);
  return { sa, sb };
};

// --- a saída: quem tem a vez peteleca, os dois recebem os quadros; o outro é recusado
{
  const { sa } = await abrir('bronze');
  const e = ultimo.get(A);
  const vez = e.vez, [quem, outro] = vez === sa.seat ? [A, B] : [B, A];
  outro.emit('jogada', { b: 3, ang: 0, forca: 0.5 });
  await pausa(100);
  assert.equal(ultimo.get(A).ultima, undefined, 'fora da vez: nada');
  await pausa(Math.max(0, e.livre - e.agora));
  const visto = new Promise((ok) => outro.on('estado', (x) => { if (x.ultima?.tipo === 'chute') ok(x.ultima); }));
  quem.emit('jogada', { b: 3, ang: vez === 0 ? -Math.PI / 2 : Math.PI / 2, forca: 0.5 });
  const u = await visto;
  assert.equal(u.de, vez);
  assert.ok(u.quadros.length > 5 && u.quadros[0].length === 22, 'os quadros vieram');
  assert.ok(u.eventos.some((x) => x[1] === 'bola'), 'tocou na bola');
  outro.removeAllListeners('estado'); outro.on('estado', (x) => ultimo.set(outro, x));
  // ninguém joga mais: o relógio passa a vez até alguém estourar 3 e perder
  const [pa, pb] = [espera(A, 'settled'), espera(B, 'settled')];
  const [ra, rb] = await Promise.all([pa, pb]);
  const fim = ultimo.get(A).fim;
  assert.equal(fim.motivo, 'ausente');
  const ganhou = fim.vencedor === sa.seat ? ra : rb;
  assert.ok(ganhou.prize > 0, 'quem ficou leva');
}
console.log('✔ petelecada com quadros, vez, relógio e pagamento');

// --- sair no meio: W.O.
{
  await abrir('prata');
  const fimA = espera(A, 'settled');
  B.emit('leave');
  assert.ok((await fimA).prize > 0, 'quem ficou leva');
}
console.log('✔ W.O.');

A.close(); B.close(); io.close(); http.close();
console.log('botao: servidor ok');
process.exit(0);
