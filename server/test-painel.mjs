// Painel admin e influencer (docs/ADMIN-API.md): permissões, rotas com
// parâmetro, taxa e lucro, fila de saques, comissões e bônus.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ADMIN_EMAILS = 'chefe@ex.com';
const assert = (await import('node:assert/strict')).default;
const { listen } = await import('./index.js');
const M = await import('./model.js');
const { one, run } = await import('./db.js');

const PORT = 3461;
const BASE = `http://localhost:${PORT}`;
const { http, io } = listen(PORT);

const req = (method, rota, body, token, ip) => fetch(BASE + rota, {
  method,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(ip ? { 'x-real-ip': ip } : {}),
  },
  ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (rota, token) => req('GET', rota, null, token);
const post = (rota, body, token, ip) => req('POST', rota, body, token, ip);

async function criar(name, email, extra = {}, ip) {
  const reg = await post('/api/register', { name, email, password: 'segredo123', ...extra }, null, ip);
  assert.equal(reg.status, 200, `cadastro de ${email}: ${JSON.stringify(reg.body)}`);
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', reg.body.userId).code;
  const r = await post('/api/verify', { email, code });
  return { token: r.body.token, id: reg.body.userId };
}
/** Partida paga direto no model: a fila de socket já tem teste próprio. */
function jogar(game, room, ids, vencedor) {
  const m = M.openMatch({ game, roomType: room, aId: ids[0], bId: ids[1], cId: ids[2] ?? null, dId: ids[3] ?? null });
  M.settleMatch(m.id, vencedor);
  return m.id;
}

try {
  // ------------------------------------------------------------ permissões
  const chefe = await criar('Chefe', 'chefe@ex.com');
  const ana = await criar('Ana Souza', 'ana@ex.com');
  assert.equal((await get('/api/admin/dashboard')).status, 401);
  assert.equal((await get('/api/admin/dashboard', ana.token)).status, 403, 'jogador comum não entra');
  assert.equal((await get('/api/admin/jogadores/1', ana.token)).status, 403, 'nem em rota com parâmetro');
  assert.equal((await get('/api/admin/dashboard', chefe.token)).status, 200);
  assert.equal((await get('/api/admin/jogadores/999999', chefe.token)).status, 404);
  assert.equal((await get('/api/me', chefe.token)).body.profile.isAdmin, true);
  console.log('✔ painel: só admin, rotas com :id');

  // ---------------------------------------------------- config muda a taxa
  let cfg = (await get('/api/admin/config', chefe.token)).body;
  assert.equal(cfg.taxaCasa, 10);
  assert.equal(cfg.bonusCadastro, 5);
  assert.equal((await post('/api/admin/config', { taxaCasa: 80 }, chefe.token)).status, 400, 'taxa absurda é recusada');
  cfg = (await post('/api/admin/config', { taxaCasa: 20, indicacaoAtiva: true, indicacaoPremio: 4,
    indicacaoMinPartidas: 1, indicacaoPercentual: 10, infPercentual: 50, infSaqueMinimo: 0.5 }, chefe.token)).body;
  assert.equal(cfg.taxaCasa, 20);
  assert.equal(cfg.atualizadoPor, 'chefe@ex.com');
  assert.equal((await get('/api/rooms')).body.rooms.bronze.prize, 320, 'R$ 4,00 de pote − 20%');
  console.log('✔ config: limites, taxa refaz o prêmio das salas');

  // ------------------------------------------------ taxa própria por jogo
  assert.equal((await post('/api/admin/config', { taxasJogo: { xadrez: 5 } }, chefe.token)).status, 400, 'jogo que não existe');
  assert.equal((await post('/api/admin/config', { taxasJogo: { velha: 31 } }, chefe.token)).status, 400, 'acima de 30%');
  cfg = (await post('/api/admin/config', { taxasJogo: { velha: 5, poker: 12.5 } }, chefe.token)).body;
  assert.deepEqual(cfg.taxasJogo, { velha: 5, poker: 12.5 });
  let rooms = (await get('/api/rooms')).body;
  assert.equal(rooms.jogos.velha.taxa, 0.05);
  assert.equal(rooms.jogos.poker.taxa, 0.125);
  assert.equal(rooms.jogos.sinuca.taxa, 0.2, 'sem taxa própria segue a padrão');
  cfg = (await post('/api/admin/config', { taxasJogo: { velha: null, poker: '' } }, chefe.token)).body;
  assert.deepEqual(cfg.taxasJogo, {}, 'em branco volta pra padrão');
  rooms = (await get('/api/rooms')).body;
  assert.equal(rooms.jogos.velha.taxa, 0.2);
  console.log('✔ config: taxa por jogo, validação e volta pra padrão');

  // ------------------------------------------- influencer, link e comissão
  const inf = await post('/api/admin/influencers', { nome: 'Lia Influ', email: 'lia@ex.com', senha: 'lia12345', chavePix: 'lia@pix.com' }, chefe.token);
  assert.equal(inf.status, 200, JSON.stringify(inf.body));
  const lia = (await post('/api/login', { email: 'lia@ex.com', password: 'lia12345' })).body;
  assert.equal(lia.profile.isInfluencer, true, 'conta do influencer já nasce confirmada');
  assert.equal((await get('/api/admin/dashboard', lia.token)).status, 403, 'influencer não é admin');

  const beto = await criar('Beto', 'beto@ex.com', { inf: inf.body.codigo });
  // Sem código, mas o mesmo IP clicou no link há pouco: conta também.
  assert.equal((await post('/api/inf/visita', { codigo: inf.body.codigo }, null, '9.9.9.9')).body.ok, true);
  const caio = await criar('Caio', 'caio@ex.com', {}, '9.9.9.9');
  const dani = await criar('Dani', 'dani@ex.com', {}, '1.1.1.1');
  assert.equal(one('SELECT influencer_id FROM users WHERE id = ?', beto.id).influencer_id, inf.body.id);
  assert.equal(one('SELECT influencer_id FROM users WHERE id = ?', caio.id).influencer_id, inf.body.id, 'pelo IP da visita');
  assert.equal(one('SELECT influencer_id FROM users WHERE id = ?', dani.id).influencer_id, null);

  for (const u of [ana, beto, caio, dani]) await post('/api/deposit', { amount: 50 }, u.token);
  // Bronze: pote R$ 4,00, prêmio R$ 3,20, taxa R$ 0,80 → R$ 0,40 por jogador.
  // Beto é do influencer (50%): R$ 0,20 de comissão.
  jogar('velha', 'bronze', [beto.id, dani.id], dani.id);
  let me = (await get('/api/influencer/me', lia.token)).body;
  assert.equal(me.ganho, 0.2);
  assert.equal(me.taxaGerada, 0.4);
  assert.equal(me.inscritos, 2);
  assert.equal(me.depositaram, 0, 'depósito simulado não é Pix pago');
  assert.equal(me.comissoes[0].jogo, 'Jogo da velha');
  assert.equal((await get('/api/influencer/inscritos', lia.token)).body.itens.find((i) => i.nome === 'Beto').comissao, 0.2);

  // Percentual próprio do influencer passa por cima do padrão.
  await post(`/api/admin/influencers/${inf.body.id}`, { percentual: 100 }, chefe.token);
  jogar('velha', 'bronze', [beto.id, caio.id], beto.id);        // 2 inscritos × R$ 0,40 × 100%
  me = (await get('/api/influencer/me', lia.token)).body;
  assert.equal(me.ganho, 1.0);
  assert.equal((await post('/api/influencer/saques', { valor: 0.2 }, lia.token)).status, 400, 'abaixo do mínimo');
  assert.equal((await post('/api/influencer/saques', { valor: 5 }, lia.token)).status, 400, 'acima do disponível');
  assert.equal((await post('/api/influencer/saques', { valor: 0.6 }, lia.token)).status, 200);
  me = (await get('/api/influencer/me', lia.token)).body;
  assert.equal(me.disponivel, 0.4);
  assert.equal(me.saquePendente, 0.6);
  const infSaq = (await get('/api/admin/influencers/saques', chefe.token)).body;
  assert.equal(infSaq.pendentes.valor, 0.6);
  assert.equal((await post(`/api/admin/influencers/saques/${infSaq.itens[0].id}/aprovar`, {}, chefe.token)).status, 200);
  assert.equal((await post(`/api/admin/influencers/saques/${infSaq.itens[0].id}/cancelar`, {}, chefe.token)).status, 409);
  const lista = (await get('/api/admin/influencers', chefe.token)).body;
  assert.equal(lista[0].sacado, 0.6);
  assert.equal(lista[0].cliques, 1);
  assert.equal(lista[0].percentualEfetivo, 100);
  assert.equal((await get(`/api/admin/influencers/${inf.body.id}/inscritos`, chefe.token)).body.total, 2);
  // Desativado: some o acesso e para de ganhar.
  await post(`/api/admin/influencers/${inf.body.id}`, { ativo: false }, chefe.token);
  assert.equal((await get('/api/influencer/me', lia.token)).status, 401, 'sessão derrubada');
  jogar('velha', 'bronze', [beto.id, caio.id], beto.id);
  assert.equal(one('SELECT SUM(valor) v FROM inf_comissoes').v, 100, 'inativo não gera comissão');
  console.log('✔ influencer: link e IP, % da taxa, saque dele, desativar');

  // --------------------------------------------------- indique e ganhe
  const codigoAna = (await get('/api/me', ana.token)).body.indicacao.codigo;
  assert.match(codigoAna, /^[A-Z0-9]{6}$/);
  const edu = await criar('Edu', 'edu@ex.com', { ref: codigoAna.toLowerCase() });
  assert.equal((await get('/api/me', ana.token)).body.indicacao.indicados, 1);
  const bonusAntes = (await get('/api/me', ana.token)).body.bonusBalance;
  // Edu joga sem depositar: o prêmio fixo espera o depósito, a % da taxa não.
  jogar('velha', 'bronze', [edu.id, dani.id], dani.id);          // edu paga com o bônus de cadastro
  let anaMe = (await get('/api/me', ana.token)).body;
  assert.equal(anaMe.bonusBalance, Math.round((bonusAntes + 0.04) * 100) / 100, '10% dos R$ 0,40 do Edu');
  assert.equal(one(`SELECT status FROM indicacoes WHERE indicado_id = ?`, edu.id).status, 'pendente');
  await post('/api/deposit', { amount: 10 }, edu.token);
  // SIMULAR_DEPOSITO não passa pelo Pix: o crédito de verdade chama liberarIndicacao.
  run(`INSERT INTO pix_charges (external_id, user_id, amount, brcode, status, created_at, expires_at, paid_at)
       VALUES ('t-edu', ?, 1000, 'x', 'paid', ?, ?, ?)`, edu.id, Date.now(), Date.now(), Date.now());
  assert.equal(M.liberarIndicacao(edu.id), true);
  assert.equal(M.liberarIndicacao(edu.id), false, 'uma vez só');
  anaMe = (await get('/api/me', ana.token)).body;
  assert.equal(anaMe.indicacao.ganho, 4.04);
  const ind = (await get('/api/admin/indicacoes', chefe.token)).body;
  assert.equal(ind.itens[0].status, 'liberada');
  assert.equal(ind.itens[0].premio, 4);
  assert.equal(ind.itens[0].comissao, 0.04);
  assert.equal(ind.soma.valorPago, 4);
  console.log('✔ indicação: código, % da taxa, prêmio depois do depósito, uma vez');

  // --------------------------------------------------------------- saques
  assert.equal((await post('/api/withdraw', { amount: 30, pixKey: '***.456.789-**' }, ana.token)).status, 400);
  assert.equal((await post('/api/withdraw', { amount: 30, pixKey: '123.456.789-00', pixKeyType: 'cpf' }, ana.token)).status, 200);
  let saq = (await get('/api/admin/saques', chefe.token)).body;
  assert.equal(saq.pendentes.quantidade, 1);
  const s1 = saq.itens[0];
  assert.equal(s1.chavePix, '123.456.789-00');
  assert.equal(s1.conferencia.depositado, 0, 'depósito simulado não é Pix');
  assert.equal(s1.conferencia.saldoAgora, 20);
  assert.equal((await post(`/api/admin/saques/${s1.id}/cancelar`, { motivo: 'no' }, chefe.token)).status, 400);
  assert.equal((await post(`/api/admin/saques/${s1.id}/cancelar`, { motivo: 'CPF de outra pessoa' }, chefe.token)).status, 200);
  assert.equal((await get('/api/me', ana.token)).body.walletBalance, 50, 'cancelado volta pro saldo');
  await post('/api/withdraw', { amount: 25, pixKey: 'ana@pix.com', pixKeyType: 'email' }, ana.token);
  saq = (await get('/api/admin/saques', chefe.token)).body;
  assert.equal((await post(`/api/admin/saques/${saq.itens[0].id}/aprovar`, {}, chefe.token)).status, 200);
  assert.equal((await post(`/api/admin/saques/${saq.itens[0].id}/aprovar`, {}, chefe.token)).status, 409, 'não aprova duas vezes');
  assert.equal((await get('/api/admin/saques?status=todos', chefe.token)).body.total, 2);
  // limite por dia
  await post('/api/admin/config', { saqueMaxDia: 30 }, chefe.token);
  assert.match((await post('/api/withdraw', { amount: 20, pixKey: 'ana@pix.com' }, ana.token)).body.error, /por dia/);
  await post('/api/admin/config', { saqueMaxDia: 0, saqueExigeDeposito: true }, chefe.token);
  assert.match((await post('/api/withdraw', { amount: 20, pixKey: 'x@pix.com' }, dani.token)).body.error, /depósito/);
  console.log('✔ saques: chave inteira, cancelar devolve, aprovar uma vez, limites');

  // ------------------------------------------------- bônus, links, remoção
  assert.equal((await post(`/api/admin/jogadores/${dani.id}/bonus`, { valor: 7, motivo: 'campanha' }, chefe.token)).status, 200);
  assert.equal((await post('/api/admin/bonus', { email: 'nao@existe.com', valor: 1, motivo: 'teste' }, chefe.token)).status, 404);
  const link = (await post('/api/admin/bonus-links', { nome: 'Live sexta', valor: 2, limite: 1 }, chefe.token)).body;
  assert.equal((await post('/api/bonus-link', { codigo: link.codigo }, dani.token)).body.valor, 2);
  assert.equal((await post('/api/bonus-link', { codigo: link.codigo }, dani.token)).status, 409, 'um por conta');
  assert.match((await post('/api/bonus-link', { codigo: link.codigo }, beto.token)).body.error, /esgotou/);
  const links = (await get('/api/admin/bonus-links', chefe.token)).body;
  assert.equal(links[0].esgotado, true);
  assert.equal(links[0].totalPago, 2);
  assert.equal((await get(`/api/admin/bonus-links/${link.id}/resgates`, chefe.token)).body.total, 1);
  await post(`/api/admin/bonus-links/${link.id}`, { ativo: false }, chefe.token);
  assert.equal((await get('/api/admin/bonus-links', chefe.token)).body[0].ativo, false);

  const bl = (await get('/api/admin/bonus?tipo=manual', chefe.token)).body;
  assert.equal(bl.total, 1);
  assert.equal(bl.itens[0].criadoPor, 'chefe@ex.com');
  assert.equal(bl.soma.porTipo.manual.valor, 7);

  assert.equal((await post(`/api/admin/jogadores/${dani.id}/remover`, { carteira: 'bonus', valor: 999, motivo: 'erro' }, chefe.token)).status, 400);
  const rem = (await post(`/api/admin/jogadores/${dani.id}/remover`, { carteira: 'bonus', tudo: true, motivo: 'abuso de bônus' }, chefe.token)).body;
  assert.ok(rem.removido > 0);
  assert.equal((await get('/api/me', dani.token)).body.bonusBalance, 0);
  console.log('✔ bônus manual, links com limite, remover saldo');

  // ------------------------------------------------------------ bloqueio
  await post(`/api/admin/jogadores/${dani.id}/bloquear`, { motivo: 'multicontas' }, chefe.token);
  assert.equal((await get('/api/me', dani.token)).status, 401, 'sessão cai');
  assert.match((await post('/api/login', { email: 'dani@ex.com', password: 'segredo123' })).body.error, /bloqueada/);
  let ficha = (await get(`/api/admin/jogadores/${dani.id}`, chefe.token)).body;
  assert.equal(ficha.bloqueio.motivo, 'multicontas');
  await post(`/api/admin/jogadores/${dani.id}/desbloquear`, {}, chefe.token);
  assert.equal((await post('/api/login', { email: 'dani@ex.com', password: 'segredo123' })).status, 200);
  console.log('✔ bloquear derruba e trava o login; desbloquear libera');

  // ---------------------------------------------- ficha, listas, dashboard
  ficha = (await get(`/api/admin/jogadores/${beto.id}`, chefe.token)).body;
  assert.equal(ficha.origem.influencer.nome, 'Lia Influ');
  assert.equal(ficha.partidas.quantidade, 3);
  assert.equal(ficha.partidas.vitorias, 2);
  assert.equal(ficha.partidas.apostado, 6);
  assert.equal(ficha.partidas.ganho, 6.4);
  assert.equal(ficha.partidas.taxaGerada, 1.2);
  assert.equal(ficha.partidas.porJogo[0].nome, 'Jogo da velha');
  for (const tipo of ['partidas', 'depositos', 'saques', 'bonus', 'transacoes', 'indicados']) {
    assert.equal((await get(`/api/admin/jogadores/${ana.id}/historico?tipo=${tipo}`, chefe.token)).status, 200, tipo);
  }
  assert.equal((await get(`/api/admin/jogadores/${ana.id}/historico?tipo=indicados`, chefe.token)).body.itens[0].nome, 'Edu');

  const jl = (await get('/api/admin/jogadores?q=beto', chefe.token)).body;
  assert.equal(jl.total, 1);
  assert.equal(jl.itens[0].influencer, 'Lia Influ');

  const pl = (await get('/api/admin/partidas?q=edu', chefe.token)).body;
  assert.equal(pl.total, 1);
  assert.equal(pl.itens[0].taxa, 0.8);
  assert.equal(pl.itens[0].jogadores.find((j) => j.venceu).nome, 'Dani');
  assert.equal((await get('/api/admin/partidas?jogo=velha&status=settled', chefe.token)).body.soma.taxa, 3.2);

  // 4 partidas bronze de velha a R$ 0,80 de taxa.
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const d = (await get(`/api/admin/dashboard?de=${hoje}&ate=${hoje}`, chefe.token)).body;
  assert.equal(d.periodo.granularidade, 'hora');
  assert.equal(d.serie.length, 24);
  assert.equal(d.partidas.quantidade, 4);
  assert.equal(d.partidas.taxa, 3.2);
  assert.equal(d.partidas.apostado, 16);
  assert.equal(d.partidas.premios, 12.8);
  assert.equal(d.custos.influencers, 1);
  assert.equal(d.custos.indicacoes, 4.04);
  assert.equal(d.saques.aprovados.valor, 25);
  assert.equal(d.alertas, 0, 'conferência do dinheiro fecha');
  // custos: 6 cadastros (exceto influencer) × R$ 5 + R$ 7 manual + R$ 2 link
  assert.equal(d.custos.bonus, 39);
  assert.equal(d.lucroLiquido, Math.round((3.2 - d.custos.total) * 100) / 100);
  assert.equal(Math.round(d.serie.reduce((s, x) => s + x.taxa, 0) * 100) / 100, 3.2, 'a série soma o total');
  assert.equal(d.porJogo[0].jogo, 'velha');
  assert.equal(d.porJogo[0].jogadores, 4);   // beto, dani, caio, edu
  const dj = (await get(`/api/admin/dashboard?jogo=sinuca`, chefe.token)).body;
  assert.equal(dj.partidas.quantidade, 0, 'filtro de jogo');
  assert.equal((await get('/api/admin/dashboard?de=2020-01-01&ate=2026-01-01', chefe.token)).status, 400, 'período longo demais');

  // ao vivo
  const viva = M.openMatch({ game: 'damas', roomType: 'bronze', aId: ana.id, bId: caio.id });
  assert.equal((await get('/api/admin/ao-vivo', chefe.token)).body.partidas[0].jogadores.length, 2);
  M.refundMatch(viva.id);
  console.log('✔ ficha, listas, partidas e dashboard batem com o que aconteceu');
} finally {
  io.close();
  http.close();
}
console.log('painel: ok');
process.exit(0);
