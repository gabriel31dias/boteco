// Cacheta valendo dinheiro, de ponta a ponta pelo socket: os cenários online.
// Partida completa (4 na mesa), mesa cheia (6), sair no meio, cair a conexão,
// tempo estourando até sair da mesa, sala privada, jogada lixo, sigilo e o pote.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.CACHETA_PONTOS = '2';           // partida curta: duas batidas e o cara sai
process.env.CACHETA_TEMPO = '600';
process.env.CACHETA_PAUSA = '20';
process.env.ESPERA_MESA = '150';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const A = await import('./jogos/cacheta.js');
const { jogadaBot } = await import('../src/games/cacheta/bot.js');

// --- árbitro direto: relógio joga pelo ausente; 3 estouros e ele sai -----
{
  const p = A.novaPartida(3);
  const s = p.vez;
  const antes = p.r.maos[s].length;
  p.desde = 0;
  const r = A.estourou(p);
  assert.equal(r.tipo, 'tempo');
  assert.equal(p.r.maos[s].length, antes, 'comprou e descartou por ele');
  assert.notEqual(p.vez, s, 'a vez passou');
  // Mesmo jogador estoura mais duas vezes (os outros jogam normal no meio).
  for (let k = 0; k < 2; k++) {
    while (p.vez !== s) { const x = p.vez; A.agir(p, x, { tipo: 'comprar' }); A.agir(p, x, { tipo: 'descartar', carta: p.r.ultimaCompra }); }
    A.estourou(p);
  }
  assert.equal(p.saiu[s], true, 'terceiro estouro: fora da mesa');
  assert.equal(p.pontos[s], 0);
  assert.deepEqual(A.fora(p), [s]);
  assert.ok(!p.r.assentos.includes(s), 'as cartas dele saíram da mão');
  assert.equal(p.fim, null, 'com 2 vivos a mesa segue');
  console.log('✔ árbitro: tempo joga por ele; 3 estouros e sai');
}

// --- árbitro: batida desconta 1 (com 9) dos outros; jogada inválida não muda nada
{
  const p = A.novaPartida(3);
  const s = p.vez;
  assert.equal(A.agir(p, s, { tipo: 'descartar', carta: p.r.maos[s][0] }), null, 'descartar sem comprar');
  assert.equal(A.agir(p, (s + 1) % 3, { tipo: 'comprar' }), null, 'fora da vez');
  assert.equal(A.agir(p, s, { tipo: 'xyz' }), null);
  // Mão armada pra bater com 9: três trincas + uma solta, e a compra vem do monte.
  p.r.vira = 'Kh0';                                       // curinga: Ás vermelho (nenhum na mão)
  p.r.maos[s] = '3s0 3h0 3d0 5s0 5h0 5d0 7s0 7h0 7d0'.split(' ');
  p.r.monte.push('Qc1');
  A.agir(p, s, { tipo: 'comprar' });
  const r = A.agir(p, s, { tipo: 'bater', carta: 'Qc1' });
  assert.equal(r.rodadaFim.cartas, 9);
  assert.equal(r.rodadaFim.perda, 1);
  for (const x of [0, 1, 2]) assert.equal(p.pontos[x], x === s ? A.PONTOS : A.PONTOS - 1);
  assert.equal(p.vez, null, 'pausa entre as mãos');
  p.desde = 0;
  assert.equal(A.estourou(p).tipo, 'novaRodada');
  assert.equal(p.rodadaNum, 2);
  console.log('✔ árbitro: batida com 9 tira 1 de cada; inválida é ignorada');
}

// --- estado: cada um vê só a própria mão ---------------------------------
{
  const p = A.novaPartida(4);
  const e = A.estadoPara(p, 2);
  assert.equal(e.mao.length, 9);
  assert.deepEqual(e.naMao, [9, 9, 9, 9]);
  assert.equal(typeof e.monte, 'number', 'monte só a contagem');
  assert.equal(JSON.stringify(e).includes(p.r.maos[0][0]) && !p.r.maos[2].includes(p.r.maos[0][0]) && p.r.vira !== p.r.maos[0][0], false, 'mão alheia não vaza');
  console.log('✔ árbitro: sigilo das mãos');
}

const PORT = 3451;
const { http, io } = listen(PORT, 'cacheta');
let seq = 0;
const novo = (nome) => {
  const email = `${nome}${++seq}@cacheta.com`;
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const total = (id) => { const s = M.stateOf(id); return Math.round((s.walletBalance + s.bonusBalance) * 100); };
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/cacheta', auth: { token }, transports: ['websocket'] });
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Uma mesa de bots pelo socket. `quem` decide quem joga (os outros ficam
 * parados e o relógio joga por eles). Devolve o que cada um viu e recebeu.
 */
async function mesa(nomes, { sala = { roomType: 'bronze' }, joga = () => true } = {}) {
  const contas = nomes.map(novo);
  const socks = contas.map((c) => cliente(c.token));
  const estados = contas.map(() => null);
  const vistos = contas.map(() => []);
  const pagos = socks.map((s) => espera(s, 'settled'));
  socks.forEach((s, i) => s.on('estado', (e) => {
    estados[i] = e;
    vistos[i].push(e);
    const j = joga(i, e) ? jogadaBot(e) : null;
    if (j) setTimeout(() => s.emit('jogada', j), 2);
  }));
  const antes = contas.map((c) => total(c.userId));
  const starts = socks.map((s) => espera(s, 'start'));
  for (const s of socks) { s.emit('join', sala); await espera(s, 'joined'); }
  const st = await Promise.all(starts);
  return { contas, socks, estados, vistos, pagos, antes, start: st[0] };
}
const fechar = (m) => { for (const s of m.socks) s.close(); };

// --- partida completa com 4: até sobrar um; o pote de 4 vai inteiro pra ele
{
  const m = await mesa(['ana', 'beto', 'caio', 'duda']);
  assert.equal(m.start.game, 'cacheta');
  assert.equal(m.start.players.length, 4);
  const pagos = await Promise.all(m.pagos);
  const fim = m.estados[0].fim;
  assert.ok(fim, 'a partida termina');
  assert.equal(fim.motivo, 'pontos');
  const v = fim.vencedor;
  // Bronze: R$ 2 de entrada, prêmio de 2 = R$ 3,60 → com 4 na mesa, R$ 7,20 pro último.
  assert.equal(total(m.contas[v].userId), m.antes[v] - 200 + 720, 'vencedor leva o pote de 4');
  for (const i of [0, 1, 2, 3].filter((i) => i !== v)) assert.equal(total(m.contas[i].userId), m.antes[i] - 200);
  assert.equal(pagos[v].prize, 720);
  assert.ok(m.vistos[0].some((e) => e.ultima?.rodadaFim?.motivo === 'bateu'), 'alguém bateu');
  // Sigilo: fora do "mostra" da batida, ninguém recebe a mão de outro nem o monte.
  for (const [i, lista] of m.vistos.entries()) {
    for (const e of lista) {
      assert.equal(e.assento, i);
      assert.ok(!('maos' in e) && !Array.isArray(e.monte), 'nada de mãos alheias nem do monte');
      if (!e.resultado) assert.equal(e.mao.length, e.naMao[i], 'só a própria mão');
      if (!e.resultado) assert.ok(!JSON.stringify(e).includes('"maos"'), 'mãos de todos só depois da batida');
    }
  }
  fechar(m);
  console.log('✔ socket: partida de 4 até o fim, pote de R$ 7,20 pago');
}

// --- mesa cheia (6) abre na hora; sair no meio: eliminado, a mesa segue -----
{
  const m = await mesa(['eva', 'fabi', 'gil', 'hugo', 'ivo', 'jade'], { sala: { roomType: 'treino' } });
  assert.equal(m.start.players.length, 6, 'cheia abre na hora');
  await pausa(50);
  const sai = m.estados.find((e) => e && e.vez !== e.assento).assento;
  const tchau = espera(m.socks[sai], 'settled');
  const avisos = espera(m.socks[(sai + 1) % 6], 'left');
  m.socks[sai].emit('leave');
  const t = await tchau;
  assert.equal(t.desistiu, true);
  assert.equal(t.eliminado, true);
  assert.equal(await avisos, sai);
  await pausa(50);
  const outro = m.estados[(sai + 1) % 6];
  assert.equal(outro.saiu[sai], true, 'os outros veem que ele saiu');
  assert.equal(outro.naMao[sai], 0, 'as cartas dele saíram da mão');
  assert.equal(outro.fim, null, 'a mesa segue com 5');
  assert.equal(M.emPartida(m.contas[sai].userId), false, 'quem saiu fica livre pra outra mesa');
  // Cai a conexão de outro: mesma coisa que sair.
  const cai = [0, 1, 2, 3, 4, 5].find((i) => i !== sai);
  m.socks[cai].disconnect();
  await pausa(100);
  assert.equal(m.estados[[0, 1, 2, 3, 4, 5].find((i) => i !== sai && i !== cai)].saiu[cai], true, 'desconectou = saiu');
  await Promise.all(m.pagos.filter((_, i) => i !== sai && i !== cai));
  const fim = m.estados.find((e, i) => i !== sai && i !== cai).fim;
  assert.ok(![sai, cai].includes(fim.vencedor), 'quem saiu não ganha');
  fechar(m);
  console.log('✔ socket: mesa de 6, sair e cair no meio — eliminados, a mesa segue até o fim');
}

// --- tempo: quem não joga perde a vez 3 vezes e sai; o outro leva ----------
{
  const m = await mesa(['kiko', 'lia'], { joga: (i) => i === 0 });
  await Promise.all(m.pagos);
  const fim = m.estados[0].fim;
  assert.equal(fim.vencedor, 0);
  assert.ok(['tempo', 'pontos'].includes(fim.motivo));
  assert.equal(total(m.contas[0].userId), m.antes[0] - 200 + 360);
  assert.ok(m.vistos[0].some((e) => e.ultima?.tipo === 'tempo'), 'o relógio jogou pelo ausente');
  fechar(m);
  console.log('✔ socket: ausente estoura o tempo e perde');
}

// --- sala privada com código, sem aposta: abre com 3 depois da espera ------
{
  const m = await mesa(['mel', 'nico', 'olga'], { sala: { code: 'CACH1', stake: 0 } });
  assert.equal(m.start.players.length, 3);
  // Jogada lixo e fora da vez: ignoradas em silêncio.
  await pausa(30);
  const negados = [];
  m.socks.forEach((s) => s.on('denied', (x) => negados.push(x)));
  await Promise.all(m.pagos);
  assert.deepEqual(negados, []);
  for (const [i, c] of m.contas.entries()) {
    const ganhou = m.estados[0].fim.vencedor === i;
    assert.equal(total(c.userId), m.antes[i], ganhou ? 'sala grátis: ninguém ganha dinheiro' : 'nem perde');
  }
  fechar(m);
  console.log('✔ socket: sala privada grátis de 3');
}

// --- payload lixo não derruba nada --------------------------------------
{
  const m = await mesa(['paulo', 'quel'], { joga: () => false });
  await pausa(30);
  const negados = [];
  m.socks.forEach((s) => s.on('denied', (x) => negados.push(x)));
  const vez = m.estados[0].vez;
  for (const lixo of [null, 'bater', 42, [], { tipo: null }, { tipo: 'bater' }, { tipo: 'descartar', carta: 'Zz9' }]) m.socks[vez].emit('jogada', lixo);
  m.socks[1 - vez].emit('jogada', { tipo: 'comprar' });
  await pausa(100);
  assert.deepEqual(negados, [], 'jogada lixo é ignorada em silêncio');
  assert.equal(m.estados[0].vez, vez, 'e não muda a vez');
  assert.equal(m.estados[vez].fase, 'comprar');
  fechar(m);
  console.log('✔ socket: jogada lixo e fora da vez ignoradas');
}

io.close(); http.close();
process.exit(0);
