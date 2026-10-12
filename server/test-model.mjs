// Auto-verificação do banco e da economia. O que mexe em dinheiro é testado
// primeiro: saldo errado não dá erro, dá prejuízo.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';   // teste não manda e-mail de verdade
const assert = (await import('node:assert/strict')).default;
const { one, all } = await import('./db.js');
const M = await import('./model.js');

// Cadastro + confirmação do e-mail: o resto da suíte assume conta pronta.
const codigoDe = (userId) => one('SELECT code FROM email_codes WHERE user_id = ?', userId).code;
const novo = (email, name = 'Fulano') => {
  const r = M.register({ name, email, password: 'segredo123' });
  M.verifyEmail({ email, code: codigoDe(r.userId) });
  return r;
};

// ---------------------------------------------------------------- cadastro
const a = novo('a@ex.com', 'Ana');
assert.equal(M.stateOf(a.userId).bonusBalance, 5, 'bônus de boas-vindas de R$ 5,00');
assert.equal(M.stateOf(a.userId).walletBalance, 0, 'bônus não vira saldo sacável');
assert.equal(M.stateOf(a.userId).profile.username, '@a');
assert.throws(() => novo('a@ex.com'), /já tem conta/);

// --- confirmação de e-mail ---
{
  const p = M.register({ name: 'Pendente', email: 'p@ex.com', password: 'segredo123' });
  assert.equal(p.pendente, true, 'cadastro não entrega token');
  assert.equal(p.token, undefined, 'nem por acidente');
  assert.equal(M.stateOf(p.userId).profile.isVerified, false);
  assert.throws(() => M.login({ email: 'p@ex.com', password: 'segredo123' }),
    /Confirme seu e-mail/, 'não entra sem confirmar');
  assert.throws(() => M.withdraw(p.userId, 1000, 'p@ex.com'),
    /Confirme seu e-mail antes de sacar/, 'nem saca');

  assert.throws(() => M.verifyEmail({ email: 'p@ex.com', code: '000000' }), /Código inválido/);
  const codigo = codigoDe(p.userId);
  const sessao = M.verifyEmail({ email: 'p@ex.com', code: codigo });
  assert.ok(sessao.token, 'confirmar já entra');
  assert.equal(M.stateOf(p.userId).profile.isVerified, true);
  assert.equal(one('SELECT 1 x FROM email_codes WHERE user_id = ?', p.userId), undefined,
    'código usado é apagado');
  assert.ok(M.login({ email: 'p@ex.com', password: 'segredo123' }).token, 'agora entra');

  // código expirado não vale
  const q = M.register({ name: 'Velho', email: 'q@ex.com', password: 'segredo123' });
  const codigoQ = codigoDe(q.userId);
  one('UPDATE email_codes SET expires_at = 1 WHERE user_id = ?', q.userId);
  assert.throws(() => M.verifyEmail({ email: 'q@ex.com', code: codigoQ }), /expirou/);
}
assert.throws(() => M.register({ name: 'X', email: 'nao-e-email', password: 'segredo123' }), /E-mail inválido/);
assert.throws(() => M.register({ name: 'X', email: 'b@ex.com', password: '123' }), /6 caracteres/);

// --- o @ é único no sistema ---
// mesmo apelido de e-mail em domínios diferentes não pode virar o mesmo @
const a2 = novo('a@outro.com', 'Ana Homônima');
assert.equal(M.stateOf(a2.userId).profile.username, '@a2', 'cadastro desvia pro próximo @ livre');
assert.throws(() => M.updateProfile(a2.userId, { name: 'Ana', username: '@a' }),
  /já está em uso/, 'não dá pra roubar o @ de outro');
assert.equal(M.stateOf(a2.userId).profile.username, '@a2', 'e o @ dele fica como estava');
// trocar pro próprio @ continua valendo (só mudou o nome de exibição)
M.updateProfile(a2.userId, { name: 'Ana H.', username: '@a2' });
assert.equal(M.stateOf(a2.userId).profile.name, 'Ana H.');
assert.throws(() => one('INSERT INTO users (name, username, email, pass, created_at) VALUES (?,?,?,?,?)',
  'Falso', '@A', 'c@ex.com', 'x', 0), /UNIQUE/, 'o banco também barra, sem depender do código');

console.log('✔ cadastro: bônus, e-mail e @ únicos, confirmação por código, validações');

// ------------------------------------------------------------------- login
assert.throws(() => M.login({ email: 'a@ex.com', password: 'errada' }), /incorretos/);
assert.throws(() => M.login({ email: 'naoexiste@ex.com', password: 'segredo123' }), /incorretos/);
const sess = M.login({ email: 'A@EX.COM', password: 'segredo123' });   // e-mail sem case
assert.equal(sess.userId, a.userId);
assert.equal(M.userByToken(sess.token).id, a.userId);
assert.equal(M.userByToken('token-falso'), null);
assert.ok(!one('SELECT * FROM users WHERE id = ?', a.userId).pass.includes('segredo123'),
  'senha nunca é guardada em claro');
M.logout(sess.token);
assert.equal(M.userByToken(sess.token), null, 'logout invalida o token');
console.log('✔ login: senha hasheada, mensagem única, token e logout');

// ---------------------------------------------------------------- dinheiro
M.deposit(a.userId, M.toCents(50));
let s = M.stateOf(a.userId);
assert.equal(s.walletBalance, 50);
assert.equal(s.transactions[0].amount, 50);
assert.equal(s.transactions[0].type, 'deposit');

assert.throws(() => M.toCents(-5), /maior que zero/);
assert.throws(() => M.toCents('abc'), /inválido/);
assert.throws(() => M.toCents(1e9), /limite/);
assert.equal(M.toCents('10,50'), 1050, 'aceita vírgula decimal');

assert.throws(() => M.withdraw(a.userId, M.toCents(60), 'pix@ex.com'), /insuficiente/);
assert.throws(() => M.withdraw(a.userId, M.toCents(52), 'pix@ex.com'), /insuficiente/,
  'bônus de R$5 não conta pro saque');
assert.throws(() => M.withdraw(a.userId, M.toCents(10), 'pix@ex.com'), /mínimo/, 'abaixo do mínimo de R$ 20');
assert.throws(() => M.withdraw(a.userId, M.toCents(20), '***.456.789-**'), /completa/, 'chave mascarada não serve');
M.withdraw(a.userId, M.toCents(20), 'pix@ex.com', 'email');
s = M.stateOf(a.userId);
assert.equal(s.walletBalance, 30, 'o pedido já reserva o valor');
assert.equal(s.bonusBalance, 5, 'saque não encosta no bônus');
assert.equal(s.saques[0].status, 'pendente');
assert.equal(s.saques[0].chavePix, 'pix@ex.com', 'a chave inteira fica guardada pro admin pagar');
assert.ok(!s.achievements.find((x) => x.type === 'first_withdraw').unlocked, 'conquista só quando o Pix sai');
M.aprovarSaque(s.saques[0].id, 'adm@ex.com');
assert.throws(() => M.aprovarSaque(s.saques[0].id, 'adm@ex.com'), /já foi decidido/);
assert.throws(() => M.cancelarSaque(s.saques[0].id, 'tarde demais', 'adm@ex.com'), /já foi decidido/);
s = M.stateOf(a.userId);
assert.equal(s.walletBalance, 30, 'aprovar não mexe no saldo de novo');
assert.ok(s.achievements.find((x) => x.type === 'first_withdraw').unlocked, 'conquista do 1º saque');
M.withdraw(a.userId, M.toCents(25), '11999998888', 'telefone');
assert.equal(M.stateOf(a.userId).walletBalance, 5);
assert.throws(() => M.cancelarSaque(M.stateOf(a.userId).saques[0].id, 'x', 'adm'), /motivo/);
M.cancelarSaque(M.stateOf(a.userId).saques[0].id, 'Chave não confere', 'adm@ex.com');
s = M.stateOf(a.userId);
assert.equal(s.walletBalance, 30, 'cancelar devolve o valor');
assert.equal(s.saques[0].motivo, 'Chave não confere');
console.log('✔ carteira: depósito, saque pendente/aprovado/cancelado, bônus não sacável, limites');

// ----------------------------------------------------------------- pontos
M.claimStreak(a.userId);                    // +50 moedas
assert.throws(() => M.claimStreak(a.userId), /já confirmada/);
s = M.stateOf(a.userId);
assert.equal(s.streakDays, 1);
assert.equal(s.hasClaimedStreakToday, true);

M.bumpMission(a.userId, 'pot10', 10);
const claim = M.claimMissions(a.userId);
assert.ok(claim.coins >= 100, 'resgatou as moedas da missão concluída');
assert.throws(() => M.claimMissions(a.userId), /Nenhuma recompensa/, 'não resgata duas vezes');
assert.equal(M.stateOf(a.userId).missions.find((m) => m.key === 'pot10').claimed, true);

const pts = M.stateOf(a.userId).points;
M.convertPoints(a.userId, 200);
assert.equal(M.stateOf(a.userId).points, pts - 200);
assert.equal(M.stateOf(a.userId).walletBalance, 31, '200 pontos = R$ 1,00');
assert.throws(() => M.convertPoints(a.userId, 999999), /insuficientes/);
console.log('✔ missões, sequência diária e conversão de pontos');

// --------------------------------------------------------------- partidas
const b = novo('b@ex.com', 'Beto');
M.deposit(a.userId, M.toCents(100));
M.deposit(b.userId, M.toCents(100));

const soma = () => all('SELECT balance, bonus, locked FROM users')
  .reduce((t, u) => t + u.balance + u.bonus + u.locked, 0);
const antes = soma();

const m1 = M.openMatch({ roomType: 'r_bronze', aId: a.userId, bId: b.userId });
assert.equal(M.stateOf(a.userId).inDisputeBalance, 2, 'a entrada fica presa, não some');
assert.equal(soma(), antes, 'abrir a partida não cria nem destrói dinheiro');

M.settleMatch(m1.id, a.userId, { [a.userId]: { potted: 3 } });
const sa = M.stateOf(a.userId), sb = M.stateOf(b.userId);
assert.equal(sa.inDisputeBalance, 0);
assert.equal(sb.inDisputeBalance, 0);
assert.equal(soma(), antes - 40, 'casa fica com 10%: R$ 4,00 entram, R$ 3,60 saem');
assert.equal(sa.profile.wins, 1);
assert.equal(sa.profile.totalGames, 1);
assert.equal(sb.profile.totalGames, 1);
assert.equal(sa.matchHistory[0].opponent, 'Beto');
assert.equal(sa.matchHistory[0].isWin, true);
assert.equal(sa.matchHistory[0].prizeMoney, 3.6);
assert.equal(sb.matchHistory[0].isWin, false);
assert.ok(sa.profile.currentXp > 0 || sa.profile.level > 1, 'vitória dá XP');
assert.equal(sa.missions.find((m) => m.key === 'play20').current, 1, 'missão de partidas andou');

assert.throws(() => M.settleMatch(m1.id, a.userId), /não está aberta/, 'não paga duas vezes');
const m2 = M.openMatch({ roomType: 'bronze', aId: a.userId, bId: b.userId });
assert.throws(() => M.settleMatch(m2.id, 99999), /não é dessa partida/);
M.refundMatch(m2.id);
assert.equal(M.stateOf(a.userId).inDisputeBalance, 0, 'estorno devolve a aposta');
console.log('✔ partidas: aposta presa, prêmio, estorno, XP, histórico e conservação');

// ------------------------------------------------------- saldo insuficiente
const c = novo('c@ex.com', 'Caio');   // só R$ 5,00 de bônus
assert.throws(() => M.openMatch({ roomType: 'ouro', aId: c.userId, bId: a.userId }), /insuficiente/);
assert.equal(M.stateOf(a.userId).inDisputeBalance, 0, 'a recusa não prende dinheiro de ninguém');
const m3 = M.openMatch({ roomType: 'bronze', aId: c.userId, bId: a.userId });
assert.equal(M.stateOf(c.userId).bonusBalance, 3, 'a entrada sai do bônus antes do saldo');
M.refundMatch(m3.id);
const sc = M.stateOf(c.userId);
assert.equal(sc.bonusBalance, 5, 'estorno devolve pro bônus o que saiu do bônus');
assert.equal(sc.walletBalance, 0, 'bônus não vira saldo sacável via estorno');

// --- missão de 10 dias + 1 partida ---
{
  const fiel = novo('fiel@ex.com', 'Fiel');
  const rival = novo('rival@ex.com', 'Rival');
  const missao = (id) => M.stateOf(id).missions.find((m) => m.key === 'fiel10');
  assert.equal(missao(fiel.userId).rewardCoins, 300, 'paga 300 moedas');
  assert.equal(missao(fiel.userId).current, 0);

  // 10 dias de sequência, ainda sem jogar: falta a partida
  one('UPDATE users SET streak_days = 10 WHERE id = ?', fiel.userId);
  assert.equal(missao(fiel.userId).current, 10, 'os dias contam');
  assert.equal(missao(fiel.userId).completed, false, 'só os dias não fecham a missão');

  const { id } = M.openMatch({ roomType: 'treino', aId: fiel.userId, bId: rival.userId });
  M.settleMatch(id, fiel.userId, {});
  assert.equal(missao(fiel.userId).completed, true, 'com a partida, fecha');

  const antesPts = M.stateOf(fiel.userId).points;
  const antesSaldo = M.stateOf(fiel.userId).walletBalance;
  const r = M.claimMissions(fiel.userId);
  assert.equal(r.coins, 300, 'a missão paga 300 moedas');
  assert.equal(M.stateOf(fiel.userId).points - antesPts, 600, 'o resgate paga o dobro em pontos');
  // e 600 pontos valem exatamente R$ 3,00 na conversão
  M.convertPoints(fiel.userId, 600);
  assert.equal(M.stateOf(fiel.userId).walletBalance, antesSaldo + 3, '600 pontos viram R$ 3,00');
  assert.equal(missao(fiel.userId).claimed, true);
  assert.throws(() => M.claimMissions(fiel.userId), /Nenhuma recompensa/, 'não paga duas vezes');
}
console.log('✔ missão de fidelidade: dias + partida, 300 moedas = R$ 3,00 em pontos');

// ------------------------------------------------------------- conquistas
// 10 vitórias seguidas: a conquista tem que sair NA décima, não na décima primeira.
{
  const campeao = novo('campeao@ex.com', 'Campeão');
  const vitima = novo('vitima@ex.com', 'Vítima');
  const conquista = (id) => M.stateOf(id).achievements.find((x) => x.type === 'trophy_streak').unlocked;
  for (let i = 1; i <= 10; i++) {
    const { id } = M.openMatch({ roomType: 'treino', aId: campeao.userId, bId: vitima.userId });
    M.settleMatch(id, campeao.userId, {});
    assert.equal(conquista(campeao.userId), i >= 10, `depois de ${i} vitórias`);
  }
  assert.equal(conquista(vitima.userId), false, 'quem perdeu não ganha a conquista');

  // uma derrota no meio quebra a sequência
  const outro = novo('quase@ex.com', 'Quase');
  for (let i = 0; i < 9; i++) {
    const { id } = M.openMatch({ roomType: 'treino', aId: outro.userId, bId: vitima.userId });
    M.settleMatch(id, outro.userId, {});
  }
  const perdida = M.openMatch({ roomType: 'treino', aId: outro.userId, bId: vitima.userId });
  M.settleMatch(perdida.id, vitima.userId, {});
  const decima = M.openMatch({ roomType: 'treino', aId: outro.userId, bId: vitima.userId });
  M.settleMatch(decima.id, outro.userId, {});
  assert.equal(M.stateOf(outro.userId).achievements.find((x) => x.type === 'trophy_streak').unlocked,
    false, 'derrota no meio zera a sequência');

  // top 10 da liga: com poucos jogadores no banco, quem vence entra
  assert.ok(M.stateOf(campeao.userId).achievements.find((x) => x.type === 'top10').unlocked,
    'top 10 da liga sai ao vencer estando entre os dez');
}
console.log('✔ conquistas: sequência de 10, primeiro saque e top 10');

// ------------------------------------------------------------------ ranking
const r = M.ranking(10);
assert.ok(r.length >= 3 && r[0].rank === 1);
assert.ok(r[0].points >= r[r.length - 1].points, 'ranking em ordem de pontos');
assert.ok(M.stateOf(a.userId).profile.league.startsWith('Liga'));
// as partidas do teste fecharam agora: entram no dia, na semana e no mês
for (const p of ['dia', 'semana', 'mes']) {
  const rp = M.ranking(10, p);
  assert.ok(rp.length >= 1 && rp[0].rank === 1 && rp[0].wins >= 1, `ranking ${p} tem quem venceu hoje`);
  assert.ok(rp.every((x, i) => i === 0 || rp[i - 1].points >= x.points), `ranking ${p} em ordem`);
  assert.ok(rp.every((x) => x.points >= 0 && 'avatarUrl' in x));
}
assert.deepEqual(M.ranking(10, 'xpto'), M.ranking(10), 'período inválido cai no geral');
console.log('✔ ranking e liga (geral, dia, semana, mês)');

// --- partida órfã: o processo caiu com a mesa aberta ---
{
  const x = novo('orfa1@ex.com', 'Órfã 1');
  const y = novo('orfa2@ex.com', 'Órfã 2');
  M.deposit(x.userId, 1000);
  M.deposit(y.userId, 1000);
  const antes = [x, y].map((u) => M.stateOf(u.userId));
  const m = M.openMatch({ game: 'damas', roomType: 'bronze', aId: x.userId, bId: y.userId });
  const outra = M.openMatch({ game: 'velha', roomType: 'treino', aId: novo('v1@ex.com').userId, bId: novo('v2@ex.com').userId });
  assert.throws(() => M.openMatch({ game: 'truco', roomType: 'treino', aId: x.userId, bId: y.userId }),
    /já está em outra partida/, 'com a órfã aberta, ninguém joga');

  assert.equal(M.estornarOrfas('damas'), 1, 'estorna a órfã do jogo que subiu');
  assert.equal(one('SELECT status FROM matches WHERE id = ?', m.id).status, 'interrupted');
  assert.equal(one('SELECT status FROM matches WHERE id = ?', outra.id).status, 'playing', 'e não mexe na de outro jogo');
  [x, y].forEach((u, i) => {
    const s = M.stateOf(u.userId);
    assert.equal(s.walletBalance, antes[i].walletBalance, 'o saldo volta');
    assert.equal(s.bonusBalance, antes[i].bonusBalance, 'o bônus volta pro bônus');
    assert.equal(s.inDisputeBalance, 0, 'nada fica travado');
  });
  M.openMatch({ game: 'truco', roomType: 'treino', aId: x.userId, bId: y.userId });
  assert.equal(M.estornarOrfas('damas'), 0, 'rodar de novo não estorna duas vezes');
  console.log('✔ partida órfã: subir o servidor estorna e libera os jogadores');
}

// --- mesa de 6 (pôquer): seis entradas presas, uma vitória, e o streak não
// conta vitória por paridade de assento quando não há duplas.
{
  const seis = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((n) => novo(`${n}@poker.com`, n));
  for (const s of seis) M.deposit(s.userId, 1000);
  const [a1, b1, c1, d1, e1, f1] = seis.map((s) => s.userId);
  const m = M.openMatch({ game: 'poker', roomType: 'bronze', aId: a1, bId: b1, cId: c1, dId: d1, eId: e1, fId: f1 });
  assert.equal(m.room.prize, 360 * 3, 'pote de 6 = prêmio de 2 × 3');
  for (const id of [e1, f1]) assert.equal(one('SELECT locked FROM users WHERE id = ?', id).locked, 200, 'e/f também pagam');
  assert.throws(() => M.openMatch({ game: 'poker', roomType: 'bronze', aId: f1, bId: a.userId }), /outra partida/);
  M.settleMatch(m.id, f1);
  for (const id of [a1, e1]) assert.equal(one('SELECT locked FROM users WHERE id = ?', id).locked, 0, 'entrada destravada');
  assert.equal(M.auditoria().length, 0, 'dinheiro confere');
  assert.equal(one('SELECT wins FROM users WHERE id = ?', b1).wins, 0, 'b (mesma paridade de f) não ganhou');
  // 10 vitórias seguidas de f1; b1 senta na mesma paridade e perde todas.
  for (let i = 0; i < 9; i++) {
    const x = M.openMatch({ game: 'poker', roomType: 'treino', aId: a1, bId: b1, cId: c1, dId: d1, eId: e1, fId: f1 });
    M.settleMatch(x.id, f1);
  }
  const conquistas = (id) => all('SELECT key FROM achievements WHERE user_id = ?', id).map((r) => r.key);
  assert.ok(conquistas(f1).includes('trophy_streak'), 'quem ganhou 10 seguidas leva');
  assert.ok(!conquistas(b1).includes('trophy_streak'), 'paridade não dá streak no individual');
  console.log('✔ mesa de 6: entradas, prêmio, auditoria e streak');
}

// --- pôquer: quem é eliminado fica livre pra outra partida antes do torneio acabar
{
  const [x, y, z] = ['q1', 'q2', 'q3'].map((n) => novo(`${n}@poker.com`, n));
  const m = M.openMatch({ game: 'poker', roomType: 'treino', aId: x.userId, bId: y.userId, cId: z.userId });
  assert.equal(M.emPartida(x.userId), true);
  M.liberarAssento(m.id, x.userId);
  assert.equal(M.emPartida(x.userId), false, 'eliminado não está mais em partida');
  assert.equal(M.emPartida(y.userId), true, 'os outros continuam');
  const outra = M.openMatch({ game: 'truco', roomType: 'treino', aId: x.userId, bId: novo('q4@poker.com').userId });
  assert.ok(outra.id, 'e pode abrir outra partida');
  assert.throws(() => M.openMatch({ game: 'truco', roomType: 'treino', aId: y.userId, bId: novo('q5@poker.com').userId }), /outra partida/);
  M.settleMatch(m.id, z.userId);                          // o torneio ainda paga normalmente
  assert.equal(M.auditoria().length, 0);
  console.log('✔ pôquer: eliminado liberado pra outra partida');
}

console.log('modelo: 13 grupos ok');
