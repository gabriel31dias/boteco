// Gravação das partidas: o que o admin assiste em "Gravações". Cada jogada,
// tacada, saída e fim vai pro banco, com o que cada assento via, e o que é
// suspeito (tacada fora da vez, relatos diferentes) vira alerta.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ADMIN_EMAILS = 'chefe@grav.com';
process.env.VELHA_PAUSA = '0';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one, run } = await import('./db.js');
const { limparGravacoes } = await import('./gravacao.js');

const PV = 3471, PS = 3472;
const velha = listen(PV, 'velha');
const sinuca = listen(PS, 'sinuca');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (porta, jogo, token) => connect(`http://localhost:${porta}`, {
  path: `/ws/${jogo}`, auth: { token }, transports: ['websocket'],
});
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const get = (rota, token) => fetch(`http://localhost:${PV}${rota}`, { headers: { authorization: `Bearer ${token}` } })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

const chefe = novo('chefe@grav.com', 'Chefe');
const ana = novo('ana@grav.com', 'Ana');
const beto = novo('beto@grav.com', 'Beto');

/** Os dois entram na mesma sala bronze e esperam o start. */
async function sentar(A, B) {
  const sa = espera(A, 'start');
  const sb = espera(B, 'start');
  A.emit('join', { roomType: 'bronze' });
  await espera(A, 'joined');
  B.emit('join', { roomType: 'bronze' });
  return Promise.all([sa, sb]);
}

try {
  // ----------------------------------------------------------- velha: W.O.
  {
    const A = cliente(PV, 'velha', ana.token);
    const B = cliente(PV, 'velha', beto.token);
    const [sa] = await sentar(A, B);
    const matchId = sa.matchId;
    const [vez, outro] = sa.seat === 0 ? [A, B] : [B, A];
    await pausa(50);
    outro.emit('jogada', { casa: 4 });            // fora da vez: recusada
    let chegou = espera(A, 'estado');
    vez.emit('jogada', { casa: 4 });
    await chegou;
    chegou = espera(A, 'estado');
    outro.emit('jogada', { casa: 0 });
    await chegou;
    const fim = espera(vez, 'settled');
    outro.emit('leave');
    await fim;
    await pausa(30);

    const lista = await get('/api/admin/gravacoes', chefe.token);
    assert.equal(lista.status, 200);
    assert.equal(lista.body.itens.length, 1, 'a partida aparece na lista de gravações');
    assert.equal(lista.body.itens[0].recusadas, 1);

    const g = (await get(`/api/admin/gravacoes/${matchId}`, chefe.token)).body;
    assert.deepEqual(g.eventos.map((e) => e.tipo), ['inicio', 'recusada', 'jogada', 'jogada', 'saiu', 'fim']);
    assert.deepEqual(g.eventos.map((e) => e.seq), [1, 2, 3, 4, 5, 6], 'sequência sem buraco');
    assert.equal(g.eventos[0].dados.jogadores.length, 2, 'o início diz quem sentou onde');
    assert.equal(g.eventos[2].visoes[0].board.filter(Boolean).length, 1, 'cada jogada grava o tabuleiro depois dela');
    assert.equal(g.eventos[2].visoes.length, 1, 'velha: todo mundo vê o mesmo, grava uma visão só');
    assert.equal(g.eventos[4].dados.motivo, 'saiu');
    assert.equal(g.eventos[5].dados.wo, true);
    assert.equal(g.alertas.length, 0, 'uma recusada só não é alerta');
    assert.equal((await get(`/api/admin/gravacoes/${matchId}`, ana.token)).status, 403, 'jogador não vê gravação');
    A.close(); B.close();
    console.log('✔ velha: jogadas, recusada, W.O. e o tabuleiro de cada passo');
  }

  // ------------------------------------- sinuca: fora da vez e contestada
  {
    const A = cliente(PS, 'sinuca', ana.token);
    const B = cliente(PS, 'sinuca', beto.token);
    const [sa] = await sentar(A, B);
    const matchId = sa.matchId;
    const [vez, outro] = sa.seat === 0 ? [A, B] : [B, A];
    const tiro = { angle: 1, power: 0.5, spinX: 0, spinY: 0, cue: { x: -0.5, z: 0 } };
    const eco = espera(A, 'shot');
    outro.emit('shot', tiro);                    // não é a vez dele
    vez.emit('shot', tiro);
    await eco;
    vez.emit('resolved', { balls: [{ x: 0, z: 0, pocketed: false }], state: { current: 0 }, result: {} });
    await pausa(30);
    const fim = espera(A, 'settled');
    A.emit('over', { winner: 0, potted: 1 });
    B.emit('over', { winner: 1, potted: 1 });    // cada um diz que ganhou
    assert.equal((await fim).disputed, true);
    await pausa(30);

    const g = (await get(`/api/admin/gravacoes/${matchId}`, chefe.token)).body;
    assert.equal(g.partida.status, 'disputed');
    const tipos = g.eventos.map((e) => e.tipo);
    for (const t of ['inicio', 'recusada', 'tacada', 'resolvido', 'relato', 'fim']) assert.ok(tipos.includes(t), `grava '${t}'`);
    assert.ok(g.alertas.some((x) => /fora da vez/.test(x.texto)), 'tacada fora da vez é alerta');
    assert.ok(g.alertas.some((x) => /vencedores diferentes/.test(x.texto)), 'relatos diferentes é alerta');
    assert.equal(g.eventos.find((e) => e.tipo === 'tacada').dados.power, 0.5, 'a tacada fica gravada como veio');

    const so = (await get('/api/admin/gravacoes?alertas=1', chefe.token)).body;
    assert.deepEqual(so.itens.map((i) => i.id), [matchId], 'filtro "só com alerta" pega só a contestada');
    assert.equal(so.soma.comAlerta, 1);
    A.close(); B.close();
    console.log('✔ sinuca: tacada fora da vez e contestada viram alerta');
  }

  // ------------------------------------------------- vídeo da tela (rrweb)
  {
    const { gzipSync } = await import('node:zlib');
    const A = cliente(PV, 'velha', ana.token);
    const B = cliente(PV, 'velha', beto.token);
    const [sa] = await sentar(A, B);
    const matchId = sa.matchId;
    const subir = (token, seq, eventos, gzip = true) => fetch(`http://localhost:${PV}/api/tela/${matchId}?seq=${seq}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': gzip ? 'application/gzip' : 'application/json' },
      body: gzip ? gzipSync(JSON.stringify(eventos)) : JSON.stringify(eventos),
    }).then((r) => r.status);
    const ev = (type, timestamp, data = {}) => ({ type, timestamp, data });
    const bloco0 = [ev(4, 1000, { href: 'x', width: 800, height: 400 }), ev(2, 1001, { node: {} })];
    const bloco1 = [ev(3, 3000, { source: 1 }), ev(3, 3500, { source: 9, id: 5 })];

    assert.equal(await subir(chefe.token, 0, bloco0), 403, 'quem não está na mesa não manda tela');
    assert.equal(await subir(ana.token, 0, [{ nada: 1 }]), 400, 'lixo é recusado');
    assert.equal(await subir(ana.token, 0, bloco0), 200);
    assert.equal(await subir(ana.token, 0, bloco0), 200, 'bloco repetido (retentativa) não duplica');
    assert.equal(await subir(ana.token, 1, bloco1, false), 200, 'sem gzip também vale');
    assert.equal(await subir(ana.token, 2, [ev(4, 5000, { width: 800, height: 400 }), ev(2, 5001, { node: {} })]), 200);

    const t = (await get(`/api/admin/gravacoes/${matchId}/telas`, chefe.token)).body;
    assert.equal(t.aoVivo, true);
    const daAna = t.jogadores.find((j) => j.id === ana.userId);
    assert.equal(daAna.blocos, 3);
    assert.equal(t.jogadores.find((j) => j.id === beto.userId).blocos, 0);
    assert.equal((await get(`/api/admin/gravacoes/${matchId}/telas`, ana.token)).status, 403, 'só admin assiste');

    const tudo = (await get(`/api/admin/gravacoes/${matchId}/tela/${ana.userId}`, chefe.token)).body;
    assert.deepEqual(tudo.eventos.map((e) => e.timestamp), [1000, 1001, 3000, 3500, 5000, 5001], 'tudo em ordem');
    assert.equal(tudo.proximo, 3);
    const vivo = (await get(`/api/admin/gravacoes/${matchId}/tela/${ana.userId}?aoVivo=1`, chefe.token)).body;
    assert.deepEqual(vivo.eventos.map((e) => e.timestamp), [5000, 5001], 'ao vivo começa na última tela inteira');
    const depois = (await get(`/api/admin/gravacoes/${matchId}/tela/${ana.userId}?aoVivo=1&desde=3`, chefe.token)).body;
    assert.deepEqual(depois.eventos, [], 'nada novo');

    const fim = espera(A, 'settled');
    B.emit('leave');
    await fim;
    run(`UPDATE matches SET ended_at = ? WHERE id = ?`, Date.now() - 10 * 60_000, matchId);
    assert.equal(await subir(ana.token, 3, bloco1), 409, 'partida encerrada há tempo não recebe mais tela');
    A.close(); B.close();
    console.log('✔ tela: só quem joga manda, só admin assiste, ao vivo e completa');
  }

  // ----------------------------------------------------------- limpeza
  run('UPDATE tela SET criado = criado - ?', 40 * 86_400_000);
  run('UPDATE gravacao SET t = t - ?', 100 * 86_400_000);
  assert.ok(limparGravacoes(90) > 0, 'gravação de mais de 90 dias sai');
  assert.equal(one('SELECT COUNT(*) n FROM gravacao').n, 0);
  assert.equal(one('SELECT COUNT(*) n FROM tela').n, 0, 'vídeo de mais de 30 dias sai');
  console.log('✔ gravação velha é apagada');
} finally {
  velha.io.close(); velha.http.close();
  sinuca.io.close(); sinuca.http.close();
}
console.log('gravação: ok');
process.exit(0);
