// Pôquer valendo dinheiro, de ponta a ponta pelo socket. O que importa: a
// mão dos outros nunca chega no seu socket, e o pote vai inteiro pro último.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.POKER_TEMPO = '800';
process.env.POKER_PAUSA = '30';
process.env.ESPERA_MESA = '150';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3449;
const { http, io } = listen(PORT, 'poker');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/poker', auth: { token }, transports: ['websocket'] });
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const contas = ['ana', 'beto', 'caio'].map((n) => novo(`${n}@poker.com`, n));
const socks = contas.map((c) => cliente(c.token));
const estados = [null, null, null];
const vistos = [[], [], []];                                // todo payload que cada um recebeu
socks.forEach((s, i) => s.on('estado', (e) => { estados[i] = e; vistos[i].push(JSON.stringify(e)); }));

const antes = contas.map((c) => total(c.userId));
const starts = socks.map((s) => espera(s, 'start'));
const pagos = socks.map((s) => espera(s, 'settled'));
for (const s of socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
const [st] = await Promise.all(starts);
assert.equal(st.game, 'poker');
assert.equal(st.players.length, 3, 'mesa de 3 abre com 3 (cheia não; espera curta)');
await pausa(100);

// --- payload lixo não pode virar "Erro no servidor" (null derrubava a desestruturação)
{
  const negados = [];
  socks.forEach((s) => s.on('denied', (m) => negados.push(m)));
  const vez = estados[0].vez;
  for (const lixo of [null, 'fold', 42, [], { tipo: null }]) socks[vez].emit('jogada', lixo);
  await pausa(150);
  assert.deepEqual(negados, [], 'jogada lixo é ignorada em silêncio');
  assert.equal(estados[0].vez, vez, 'e não muda a vez');
  console.log('✔ socket: jogada lixo ignorada');
}

// --- joga até acabar: sempre all-in (termina rápido) ----------------------
let voltas = 0;
let liberado = null;
while (!estados[0]?.fim && voltas++ < 2000) {
  const e = estados.find((x) => x && x.vez != null && x.vez === x.assento && x.legais);
  // O assento 2 larga até alguém quebrar: assim sobra torneio depois da 1ª eliminação.
  if (e) socks[e.assento].emit('jogada', e.assento === 2 && liberado === null ? { tipo: e.legais.check ? 'check' : 'fold' } : { tipo: 'allin' });
  // Eliminado no meio do torneio: a conta já fica livre pra outra partida.
  const fora = estados.find((x) => x?.colocacao?.length && !x.fim)?.colocacao[0];
  if (fora != null && liberado === null) liberado = !M.emPartida(contas[fora].userId);
  await pausa(15);
}
assert.equal(liberado, true, 'eliminado é liberado antes do torneio acabar');
assert.ok(estados[0].fim, 'o torneio termina');
const v = estados[0].fim.vencedor;
await Promise.all(pagos);
assert.equal(total(contas[v].userId), antes[v] - 2 + 5.4, 'vencedor leva o pote de 3 (R$ 5,40)');
for (const i of [0, 1, 2].filter((i) => i !== v)) assert.equal(total(contas[i].userId), antes[i] - 2);
console.log('✔ socket: torneio de 3 até o fim, pote pago');

// --- sigilo: nenhum payload trouxe carta fechada alheia fora do showdown --
for (let i = 0; i < 3; i++) {
  for (const raw of vistos[i]) {
    const e = JSON.parse(raw);
    if (e.fase === 'fim') continue;                          // showdown: cartas reveladas são públicas
    assert.equal(e.cartas, null, 'cartas dos outros só no fim da mão');
  }
}
console.log('✔ socket: sigilo das cartas');

// --- quem está sentado numa partida aberta não entra em fila (senão trava a mesa dos outros)
{
  const d = novo('dani@poker.com', 'Dani'), e2 = novo('edu@poker.com', 'Edu');
  M.openMatch({ game: 'truco', roomType: 'treino', aId: d.userId, bId: e2.userId });
  const sd = cliente(d.token);
  const negado = espera(sd, 'denied');
  sd.emit('join', { roomType: 'bronze' });
  assert.match(await negado, /partida/, 'recusado na fila');
  sd.close();
  console.log('✔ socket: preso em outra partida não entra na fila');
}

for (const s of socks) s.close();
io.close(); http.close();
process.exit(0);
