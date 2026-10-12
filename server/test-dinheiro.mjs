// Conservação do dinheiro: nenhuma combinação de abrir, pagar e estornar
// partidas pode criar ou sumir com centavo. O total (saldo + bônus + travado)
// só cai pela taxa da casa das partidas pagas. node server/test-dinheiro.mjs
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';

const assert = (await import('node:assert/strict')).default;
const M = await import('./model.js');
const { one } = await import('./db.js');

let semente = 7;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const escolhe = (xs) => xs[Math.floor(rnd() * xs.length)];

const users = Array.from({ length: 10 }, (_, i) => {
  const r = M.register({ name: `J${i}`, email: `j${i}@din.com`, password: 'segredo123' });
  M.verifyEmail({ email: `j${i}@din.com`, code: one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code });
  if (i % 3) M.deposit(r.userId, 20_000);   // alguns só com bônus
  return r.userId;
});
const total = () => one('SELECT SUM(balance + bonus + locked) t FROM users').t;
const bonusTotal = () => one('SELECT SUM(bonus) b FROM users').b;

// Mesas possíveis: [jogo, jogadores]
const MESAS = [['velha', 2], ['truco', 2], ['domino', 3], ['domino', 4], ['truco-duplas', 4], ['domino-duplas', 4]];
let taxa = 0;
const abertas = [];
let pagas = 0, estornadas = 0;

for (let passo = 0; passo < 600; passo++) {
  const acao = rnd();
  if (acao < 0.5 || !abertas.length) {
    const [game, n] = escolhe(MESAS);
    const livres = users.filter((u) => !abertas.some((a) => a.ids.includes(u)));
    if (livres.length < n) continue;
    const ids = [...livres].sort(() => rnd() - 0.5).slice(0, n);
    const roomType = escolhe(['treino', 'bronze', 'prata']);
    try {
      const m = M.openMatch({ game, roomType, aId: ids[0], bId: ids[1], cId: ids[2] ?? null, dId: ids[3] ?? null });
      abertas.push({ id: m.id, ids, game, room: m.room });
    } catch (e) {
      assert.match(e.message, /Saldo insuficiente/, 'só falta de saldo pode recusar a abertura');
    }
  } else if (acao < 0.8) {
    const a = abertas.splice(Math.floor(rnd() * abertas.length), 1)[0];
    const r = M.settleMatch(a.id, escolhe(a.ids));
    taxa += a.room.stake * a.ids.length - r.prize * r.winners.length;
    assert.ok(r.prize * r.winners.length <= a.room.stake * a.ids.length, 'prêmio nunca maior que o arrecadado');
    pagas++;
  } else if (acao < 0.95) {
    const a = abertas.splice(Math.floor(rnd() * abertas.length), 1)[0];
    M.refundMatch(a.id, escolhe(['refunded', 'disputed']));
    estornadas++;
  } else {
    // o processo daquele jogo "reiniciou": as abertas dele são estornadas
    const game = escolhe(MESAS)[0];
    M.estornarOrfas(game);
    for (let i = abertas.length - 1; i >= 0; i--) if (abertas[i].game === game) { abertas.splice(i, 1); estornadas++; }
  }
  assert.deepEqual(M.auditoria(), [], `passo ${passo}: travado bate com as partidas abertas, ninguém negativo`);
}

const inicial = users.length * 500 + users.filter((_, i) => i % 3).length * 20_000;   // bônus de boas-vindas + depósitos
assert.equal(total(), inicial - taxa, 'o total só caiu pela taxa da casa');
// Estorno devolve bônus pro bônus: nenhum bônus virou saldo sacável.
for (const a of abertas.splice(0)) M.refundMatch(a.id);
assert.deepEqual(M.auditoria(), []);
assert.ok(bonusTotal() <= users.length * 500, 'bônus não cresce: estorno devolve pro lugar certo');
assert.ok(pagas > 50 && estornadas > 20, `cobriu os dois caminhos (${pagas} pagas, ${estornadas} estornadas)`);
console.log(`✔ dinheiro: ${pagas} partidas pagas e ${estornadas} estornadas, nenhum centavo criado ou perdido`);

// A auditoria acusa quando alguém mexe no travado por fora.
{
  const u = users[0];
  const { run } = await import('./db.js');
  run('UPDATE users SET locked = locked + 100 WHERE id = ?', u);
  const p = M.auditoria();
  assert.equal(p.length, 1);
  assert.equal(p[0].tipo, 'travado');
  run('UPDATE users SET locked = locked - 100 WHERE id = ?', u);
  console.log('✔ auditoria: acusa travado que não bate com as partidas');
}
console.log('dinheiro: 2 grupos ok');
