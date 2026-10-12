// Buraco valendo dinheiro, de ponta a ponta pelo socket (1×1 e duplas). O que
// importa: a mão dos outros e o monte nunca saem do servidor, e o prêmio cai
// certo pra quem ganhou (nas duplas, pros dois).
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.BURACO_ALVO = '250';      // partida curta: o teste não joga até 1000
process.env.BURACO_TEMPO = '600';
process.env.BURACO_PAUSA = '30';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const { jogadaBot } = await import('../src/games/buraco/bot.js');
const P = await import('./jogos/buraco.js');

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
let nconta = 0;
const novo = () => {
  const email = `b${++nconta}@buraco.com`;
  const r = M.register({ name: `B${nconta}`, email, password: 'segredo123' });
  const { token } = M.verifyEmail({ email, code: one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

// --- árbitro sem socket: relógio joga pelo ausente, 3 estouros é W.O.
{
  const p = P.novaPartida(2);
  const s = p.vez;
  const r = P.estourou(p);
  assert.equal(r.tipo, 'tempo');
  assert.ok(r.carta, 'comprou e descartou por ele');
  assert.equal(p.r.lixo.length, 1);
  assert.equal(p.vez, 1 - s);
  P.agir(p, p.vez, { tipo: 'comprar' });
  P.agir(p, p.vez, { tipo: 'descartar', carta: p.r.maos[p.vez][0] });
  P.estourou(p); P.agir(p, p.vez, { tipo: 'comprar' }); P.agir(p, p.vez, { tipo: 'descartar', carta: p.r.maos[p.vez][0] });
  P.estourou(p);
  assert.deepEqual(p.fim, { vencedor: 1 - s, motivo: 'tempo' }, 'terceiro estouro: W.O.');
  assert.equal(P.agir(P.novaPartida(2), 0, null ?? {}), null, 'ação vazia é recusada');
  console.log('✔ árbitro: relógio e W.O.');
}

/** Abre uma mesa de `n` pelo socket e deixa o bot jogar por todos até o fim. */
async function partida(porta, jogo, n) {
  const { http, io } = listen(porta, jogo);
  const contas = Array.from({ length: n }, novo);
  const socks = contas.map((c) => connect(`http://localhost:${porta}`, { path: `/ws/${jogo}`, auth: { token: c.token }, transports: ['websocket'] }));
  const estados = Array(n).fill(null);
  const vistos = Array.from({ length: n }, () => []);
  socks.forEach((s, i) => s.on('estado', (e) => { estados[i] = e; vistos[i].push(e); }));
  const antes = contas.map((c) => total(c.userId));
  const starts = socks.map((s) => espera(s, 'start'));
  const pagos = socks.map((s) => espera(s, 'settled'));
  for (const s of socks) { s.emit('join', { roomType: 'bronze' }); await espera(s, 'joined'); }
  const st = await Promise.all(starts);
  const seat = st.map((x) => x.seat);
  await pausa(80);

  let voltas = 0;
  while (!estados.some((e) => e?.fim) && voltas++ < 20000) {
    for (let i = 0; i < n; i++) {
      const a = estados[i] && jogadaBot(estados[i]);
      if (a) socks[i].emit('jogada', a);
    }
    await pausa(4);
  }
  const fim = estados.find((e) => e?.fim).fim;
  await Promise.all(pagos);
  for (const s of socks) s.close();
  io.close(); http.close();
  return { contas, antes, fim, seat, vistos };
}

// --- 1×1: sigilo, conservação e prêmio
{
  const { contas, antes, fim, seat, vistos } = await partida(3451, 'buraco', 2);
  assert.ok(fim.vencedor === 0 || fim.vencedor === 1);
  for (let i = 0; i < 2; i++) {
    for (const e of vistos[i]) {
      const raw = JSON.stringify(e);
      assert.ok(!/"maos"|"monte":\[|"mortos":\[|"deck"/.test(raw), 'nada de mão alheia, monte ou morto no payload');
      const soma = e.naMao.reduce((a, b) => a + b, 0) + e.monte + e.lixo.length + e.mortos * 11
        + e.jogos.flat().reduce((a, j) => a + j.cartas.length, 0);
      if (!e.resultado) assert.equal(soma, 104, 'as 104 cartas estão em algum lugar');
      assert.equal(e.mao.length, e.naMao[e.assento]);
    }
  }
  const ganhador = seat.indexOf(fim.vencedor);
  assert.equal(total(contas[ganhador].userId), antes[ganhador] - 2 + 3.6, 'vencedor leva R$ 3,60');
  assert.equal(total(contas[1 - ganhador].userId), antes[1 - ganhador] - 2);
  console.log(`✔ socket 1×1: partida até ${process.env.BURACO_ALVO}, sigilo e prêmio (${fim.motivo})`);
}

// --- duplas: os dois do time vencedor levam o prêmio
{
  const { contas, antes, fim, seat } = await partida(3452, 'buraco-duplas', 4);
  for (let i = 0; i < 4; i++) {
    const ganhou = seat[i] % 2 === fim.vencedor;
    assert.equal(total(contas[i].userId), Number((antes[i] - 2 + (ganhou ? 3.6 : 0)).toFixed(2)), `jogador ${i}`);
  }
  console.log('✔ socket duplas: cada um do time vencedor leva R$ 3,60');
}
process.exit(0);
