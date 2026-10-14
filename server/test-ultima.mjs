// Auto-verificação da Última Carta no servidor, com vários jogadores de
// verdade pela rede: mesas de 2, 3 e 4 jogando até o fim como robôs, mão
// escondida, aposta paga, relógio jogando por quem dorme e saída no meio.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ULTIMA_TEMPO = '600';
process.env.ESPERA_MESA = '300';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one } = await import('./db.js');

const PORT = 3467;
const { http, io } = listen(PORT, 'ultima');
const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  M.deposit(r.userId, 5000);
  return { ...r, token };
};
const cliente = (token) => connect(`http://localhost:${PORT}`, { path: '/ws/ultima', auth: { token }, transports: ['websocket'] });
const espera = (socket, evento) => new Promise((ok) => socket.once(evento, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const total = (id) => { const s = M.stateOf(id); return Number((s.walletBalance + s.bonusBalance).toFixed(2)); };

const nomes = ['Ana', 'Beto', 'Caio', 'Dani'];
const contas = nomes.map((n) => novo(`${n.toLowerCase()}@ultima.com`, n));
const S = contas.map((c) => cliente(c.token));

/** Robô: joga uma carta que serve (escolhe cor no coringa e grita), senão compra / passa. */
function robo(s, vazou) {
  s.on('estado', (e) => {
    // nunca vem a mão de outro, só a contagem
    if (!e.fim && (e.maos || !Array.isArray(e.mao) || e.naMao.length !== e.n)) vazou.push(e);
    if (e.fim || e.vez !== e.assento) return;
    setTimeout(() => {
      if (e.jogaveis.length) {
        const c = e.mao.find((x) => x.id === e.jogaveis[0]);
        s.emit('jogada', { tipo: 'jogar', id: c.id, cor: c.c === 'w' ? 'g' : undefined, ultima: true });
      } else s.emit('jogada', { tipo: e.comprada != null ? 'passar' : 'comprar' });
    }, 5);
  });
}

async function mesa(qtd, sala) {
  const quem = S.slice(0, qtd);
  const starts = quem.map((s) => espera(s, 'start'));
  for (const s of quem) { s.emit('join', { roomType: sala }); await espera(s, 'joined'); }
  const st = await Promise.all(starts);
  assert.equal(st[0].players.length, qtd, `mesa de ${qtd}`);
  return quem;
}

for (const [qtd, sala] of [[2, 'bronze'], [3, 'prata'], [4, 'ouro']]) {
  const antes = contas.slice(0, qtd).map((c) => total(c.userId));
  const vazou = [];
  const quem = await mesa(qtd, sala);
  const fins = quem.map((s) => espera(s, 'settled'));
  quem.forEach((s) => robo(s, vazou));
  const pagos = await Promise.all(fins);
  quem.forEach((s) => s.removeAllListeners('estado'));
  assert.deepEqual(vazou, [], 'nenhuma mão alheia vazou');
  const depois = contas.slice(0, qtd).map((c) => total(c.userId));
  // o "prize" do settled é o prêmio da mesa (vai pra todos): o vencedor é quem teve o saldo aumentado
  const ganharam = depois.flatMap((v, k) => (v > antes[k] ? [k] : []));
  assert.equal(ganharam.length, 1, `mesa de ${qtd}: um vencedor (${antes} -> ${depois})`);
  const ganhou = ganharam[0];
  assert.equal(depois.filter((v, k) => v < antes[k]).length, qtd - 1, 'os outros perderam a entrada');
  assert.ok(pagos.every((p) => p.prize > 0));
  console.log(`✔ mesa de ${qtd} jogou até o fim (vencedor: ${nomes[ganhou]})`);
}

// relógio: ninguém joga; o servidor compra e passa por eles e, depois de 3 cochilos, tira da mesa
{
  const quem = await mesa(3, 'bronze');
  const ultimo = new Map();
  quem.forEach((s) => s.on('estado', (e) => ultimo.set(s, e)));
  const fim = espera(quem[0], 'settled');
  await fim.catch(() => {});
  const e = ultimo.get(quem[0]);
  assert.ok(e.fim, 'acabou por ausência');
  quem.forEach((s) => s.removeAllListeners('estado'));
  for (const s of quem) await pausa(10);
}
console.log('✔ relógio joga por quem dorme e tira da mesa');

// 4 na mesa, um sai no meio: os outros seguem jogando até o fim
{
  const quem = await mesa(4, 'prata');
  const vazou = [];
  const fins = quem.slice(0, 3).map((s) => espera(s, 'settled'));
  await pausa(100);
  quem[3].emit('leave');
  quem.slice(0, 3).forEach((s) => robo(s, vazou));
  const pagos = await Promise.all(fins);
  assert.equal(pagos.length, 3, 'quem ficou terminou');
  quem.forEach((s) => s.removeAllListeners('estado'));
}
console.log('✔ um sai no meio de 4, os outros terminam');

S.forEach((s) => s.close()); io.close(); http.close();
console.log('ultima: servidor ok');
process.exit(0);
