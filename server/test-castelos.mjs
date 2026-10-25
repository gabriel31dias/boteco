// Auto-verificação de Castelos em Guerra no servidor: 2 robôs pela rede jogam até o fim
// (mirando com a mesma física das regras), o vencedor recebe; e saída no meio é W.O.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.CASTELOS_CONTAGEM = '200';
process.env.CASTELOS_VEZ = '4000';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');
const R = await import('../src/games/castelos/regras.js');

const PORT = 3471;
const { http, io } = listen(PORT, 'castelos');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/castelos', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const contas = ['Ana', 'Beto'].map((n) => novo(`${n.toLowerCase()}@castelos.com`, n));
const S = contas.map((c) => cliente(c.token));

async function mesa(sala) {
  const starts = S.map((s) => espera(s, 'start'));
  for (const s of S) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  return Promise.all(starts);
}

/**
 * Robô: na sua vez, monta um mundo de mentira com o que VÊ (estado do servidor) e varre a mira.
 * Mira no castelo rival (herói escondido não aparece no estado); `erro` em graus.
 */
function robo(s, erro, log) {
  let mirou = -1;
  s.on('estado', (e) => {
    log.ultimo = e;
    for (const ev of e.ev) log.ev.push(ev);
    if (e.fase !== 'mira' || e.vez !== e.assento || mirou === e.rodada * 2 + e.vez) return;
    mirou = e.rodada * 2 + e.vez;
    const t = R.terreno(e.semente);
    const p = { t, castelos: e.castelos.map((c, lado) => ({ x: c.x, ang: c.ang, baseY: c.baseY, lado, buracos: c.b, prox: c.prox,
      herois: c.h.map(([heroi, vida, max, x, y]) => ({ heroi, vida, max, x: x ?? 0, y: y ?? -24 })) })) };
    const foe = p.castelos[1 - e.assento], alvo = R.paraMundo(foe, 0, -120);
    let best = { d: Infinity, a: 30, f: .7 };
    for (let a = -6; a <= 70; a += 3) for (let f = .3; f <= 1.0001; f += .04) {
      const b = R.lancar({ ...p, vez: e.assento }, e.assento, a, f)[0];
      let r = null;
      for (let k = 0; k < 500 && !r; k++) r = R.avancar(p, b, 1 / 60);
      if (!r || r.oque === 'fora') continue;
      const d = Math.hypot(r.x - alvo.x, r.y - alvo.y);
      if (d < best.d) best = { d, a, f };
    }
    s.emit('jogada', { fogo: { a: best.a + (Math.random() - .5) * 2 * erro, f: best.f } });
  });
}

{
  const antes = contas.map((c) => total(c.userId));
  await mesa('bronze');
  const logs = S.map(() => ({ ev: [] }));
  const fins = S.map((s) => espera(s, 'settled'));
  S.forEach((s, k) => robo(s, [1, 6][k], logs[k]));
  const pagos = await Promise.all(fins);
  S.forEach((s) => s.removeAllListeners('estado'));
  const e = logs[0].ultimo;
  assert.ok(e.fim, 'acabou');
  assert.ok(logs[0].ev.some((x) => x.tipo === 'boom'), 'teve explosão');
  assert.ok(e.castelos.some((c) => c.b.length), 'furou fachada');
  assert.deepEqual(logs[1].ev.map((x) => x.id), logs[0].ev.map((x) => x.id), 'os dois viram os mesmos eventos');
  if (e.fim.vencedor != null) {
    const v = e.fim.vencedor;
    assert.ok(total(contas[v].userId) > antes[v], 'o vencedor recebeu');
    assert.ok(total(contas[1 - v].userId) < antes[1 - v], 'o perdedor pagou');
    assert.ok(pagos[v].prize > 0);
  } else assert.ok(pagos[0].empate, 'empate devolve');
  console.log(`✔ partida até o fim pela rede: ${JSON.stringify(e.fim)}, rodada ${e.rodada}`);
}
{
  await pausa(300);
  const antes = contas.map((c) => total(c.userId));
  await mesa('prata');
  await pausa(400);
  const fimA = espera(S[0], 'settled');
  S[1].emit('leave');
  const r = await fimA;
  assert.ok(r.prize > 0, 'quem ficou leva');
  await pausa(100);
  assert.ok(total(contas[0].userId) > antes[0] && total(contas[1].userId) < antes[1]);
  console.log('✔ saída no meio é W.O.');
}
S.forEach((s) => s.close()); io.close(); http.close();
console.log('castelos: servidor ok');
process.exit(0);
