// Auto-verificação da API e do socket: autenticação, fila de salas, relay da
// tacada, e o dinheiro entrando e saindo nos lugares certos.
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';   // teste não manda e-mail de verdade
process.env.HTTP = '1';
process.env.SIMULAR_DEPOSITO = '1';
process.env.ADMIN_EMAILS = 'moder@ex.com, outro@ex.com';   // painel de moderação   // libera /api/deposit, o crédito de mentira   // sem TLS aqui: o fetch do Node recusa cert autoassinado
const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen, sanitize } = await import('./index.js');
const M0 = await import('./model.js');

assert.equal(sanitize(' ab-3! '), 'AB3');
assert.equal(sanitize('../etc/passwd'), 'ETCPASSW');   // corta em 8
assert.equal(sanitize(null), '');

const PORT = 3443;
const BASE = `http://localhost:${PORT}`;
const { http, io } = listen(PORT);

const post = (rota, body, token) => fetch(BASE + rota, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body ?? {}),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (rota, token) => fetch(BASE + rota, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}).then(async (r) => ({ status: r.status, body: await r.json() }));

// Cadastro pela API agora só devolve token depois do código do e-mail.
const { one: umaLinha } = await import('./db.js');
const criar = async (name, email) => {
  const reg = await post('/api/register', { name, email, password: 'segredo123' });
  assert.equal(reg.status, 200, `cadastro de ${email}`);
  const code = umaLinha('SELECT code FROM email_codes WHERE user_id = ?', reg.body.userId).code;
  return post('/api/verify', { email, code });
};

// ----------------------------------------------------------------- API HTTP
// sem confirmar o e-mail não entra
const pendente = await post('/api/register', { name: 'Zeca', email: 'zeca@ex.com', password: 'segredo123' });
assert.equal(pendente.body.token, undefined, 'cadastro não entrega token');
assert.equal((await post('/api/login', { email: 'zeca@ex.com', password: 'segredo123' })).status, 403);

let r = await criar('Ana', 'ana@ex.com');
assert.equal(r.status, 200);
const ana = r.body.token;
assert.equal(r.body.bonusBalance, 5, 'o cadastro já devolve o estado inteiro');
assert.ok(r.body.missions.length, 'e as missões junto');

assert.equal((await post('/api/register', { name: 'X', email: 'ana@ex.com', password: 'segredo123' })).status, 409);
assert.equal((await post('/api/login', { email: 'ana@ex.com', password: 'errada' })).status, 401);
assert.equal((await get('/api/me')).status, 401, 'sem token não vê nada');
assert.equal((await get('/api/me', 'token-falso')).status, 401);
assert.equal((await get('/api/me', ana)).body.profile.name, 'Ana');
assert.equal((await get('/api/nao-existe')).status, 404);

await post('/api/deposit', { amount: 30 }, ana);
assert.equal((await get('/api/me', ana)).body.walletBalance, 30);
assert.equal((await post('/api/deposit', { amount: -5 }, ana)).status, 400, 'depósito negativo é recusado');
assert.equal((await post('/api/withdraw', { amount: 999, pixKey: 'a@b.c' }, ana)).status, 400);
assert.equal((await get('/api/ranking')).body.ranking.length >= 1, true);
console.log('✔ API: cadastro, login, sessão, carteira e validação');

const beto = (await criar('Beto', 'beto@ex.com')).body.token;
await post('/api/deposit', { amount: 30 }, ana);
await post('/api/deposit', { amount: 30 }, beto);

// ------------------------------------------------------------------- socket
// Cada jogo tem seu caminho de socket: este processo é o do sinuca.
const cliente = (token) => connect(BASE, { path: '/ws/sinuca', auth: { token }, transports: ['websocket'] });
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const silent = (s, ev, ms = 250) =>
  new Promise((r) => { const t = setTimeout(() => r(true), ms); s.once(ev, () => { clearTimeout(t); r(false); }); });

const anon = connect(BASE, { path: '/ws/sinuca', transports: ['websocket'] });
assert.match((await once(anon, 'connect_error')).message, /login/, 'socket sem token é recusado');
anon.close();
console.log('✔ socket exige o mesmo token da API');

// --- fila por valor de entrada ---
const A = cliente(ana);
const B = cliente(beto);
A.emit('join', { roomType: 'r_bronze' });
const jA = await once(A, 'joined');
assert.equal(jA.you, 0);
assert.ok(await silent(A, 'start'), 'sozinho na fila, ninguém começa');
B.emit('join', { roomType: 'bronze' });
const [sA, sB] = await Promise.all([once(A, 'start'), once(B, 'start')]);
assert.equal(sA.seed, sB.seed, 'mesma semente pros dois');
assert.equal(sA.seat, 0);
assert.equal(sB.seat, 1);
assert.equal(sA.players[1].name, 'Beto', 'o perfil do oponente chega pro modal VS');
assert.equal(sB.players[0].name, 'Ana');
assert.equal(sA.room.stake, 200);

const anaEmJogo = (await get('/api/me', ana)).body;
assert.equal(anaEmJogo.inDisputeBalance, 2, 'a entrada ficou presa');
assert.equal(anaEmJogo.bonusBalance, 3, 'e saiu do bônus antes do saldo');
assert.equal(anaEmJogo.walletBalance, 60);
// Duro sem saldo não entra nem na fila: senão ele segura a vaga e derruba a
// partida do próximo que chegar.
const duroToken = (await criar('Duro', 'duro@ex.com')).body.token;
const D0 = cliente(duroToken);
D0.emit('join', { roomType: 'r_ouro' });                        // R$ 10,00 e ele só tem o bônus de R$ 5,00
assert.match(await once(D0, 'denied'), /R\$ 10,00/, 'sala paga sem saldo é recusada na entrada');
assert.ok(await silent(D0, 'joined'), 'e ele não fica esperando na fila');
D0.emit('join', { roomType: 'treino' });
assert.ok((await once(D0, 'joined')).code, 'sala sem aposta continua liberada');
D0.disconnect();
console.log('✔ fila casa os dois, debita a entrada e manda os perfis');

// --- tacada ---
const shot = { angle: 1.2, power: 0.8, spinX: 0, spinY: 0, cue: { x: 0, z: -0.5 } };
const relayed = Promise.all([once(A, 'shot'), once(B, 'shot')]);
A.emit('shot', shot);
assert.deepEqual(await relayed, [shot, shot], 'chega nos dois, eco inclusive');
B.emit('shot', shot);
assert.ok(await silent(A, 'shot'), 'tacada de quem não é da vez foi bloqueada');
A.emit('resolved', { balls: [], state: { current: 1 }, result: {} });
await once(B, 'resolved');
const after = once(A, 'shot');
B.emit('shot', shot);
assert.deepEqual(await after, shot, 'depois do resolved a vez virou');
console.log('✔ relay da tacada e validação de vez');

// --- fim de partida: os dois precisam concordar ---
A.emit('over', { winner: 0, potted: 4 });
assert.ok(await silent(A, 'settled'), 'um lado só não paga ninguém');
const pagos = Promise.all([once(A, 'settled'), once(B, 'settled')]);
B.emit('over', { winner: 0, potted: 1 });
const [pA, pB] = await pagos;
assert.equal(pA.winnerId, pB.winnerId);
assert.equal(pA.prize, 360);
assert.equal(pA.state.walletBalance, 63.6, 'R$ 60,00 + R$ 3,60 de prêmio');
assert.equal(pA.state.inDisputeBalance, 0);
assert.equal(pB.state.walletBalance, 30, 'quem perdeu não recebe de volta');
assert.equal(pA.state.profile.wins, 1);
assert.equal(pA.state.matchHistory[0].opponent, 'Beto');
console.log('✔ fim de partida por consenso: prêmio, XP e histórico');

// --- relatos divergentes: ninguém ganha, todo mundo é estornado ---
const antesA = (await get('/api/me', ana)).body;   // antes de entrar: nada preso
A.emit('join', { roomType: 'bronze' });
await once(A, 'joined');
B.emit('join', { roomType: 'bronze' });
await Promise.all([once(A, 'start'), once(B, 'start')]);
const disputa = Promise.all([once(A, 'settled'), once(B, 'settled')]);
A.emit('over', { winner: 0 });
B.emit('over', { winner: 1 });
const [dA] = await disputa;
assert.equal(dA.disputed, true, 'relatos diferentes não pagam prêmio');
assert.equal(dA.state.bonusBalance, antesA.bonusBalance, 'a entrada volta pro bônus de onde saiu');
assert.equal(dA.state.walletBalance, antesA.walletBalance, 'e não vira saldo sacável');
assert.equal(dA.state.inDisputeBalance, 0);
console.log('✔ relatos divergentes derrubam a partida e estornam');

// --- sala privada por código ---
A.emit('join', { code: 'sala1' });
const pj = await once(A, 'joined');
assert.equal(pj.code, 'SALA1');
B.emit('join', { code: 'SALA1' });
await Promise.all([once(A, 'start'), once(B, 'start')]);
assert.equal((await get('/api/me', ana)).body.inDisputeBalance, 0, 'sala privada não cobra entrada');
A.emit('over', { winner: 0 });
B.emit('over', { winner: 0 });
await Promise.all([once(A, 'settled'), once(B, 'settled')]);
const anaId = umaLinha('SELECT id FROM users WHERE email = ?', 'ana@ex.com').id;
assert.equal(M0.stateOf(anaId).missions.find((m) => m.key === 'friends3').current, 1,
  'partida por código conta pra missão de jogar com amigos');
console.log('✔ sala privada por código');

// --- sair no meio é W.O. pra quem fica ---
A.emit('join', { roomType: 'bronze' });
await once(A, 'joined');
B.emit('join', { roomType: 'bronze' });
await Promise.all([once(A, 'start'), once(B, 'start')]);
const antesWo = (await get('/api/me', ana)).body.walletBalance;
const wo = once(A, 'settled');
const saiu = once(A, 'left');
B.close();
const rWo = await wo;
assert.equal(rWo.wo, true);
assert.equal(rWo.state.walletBalance, antesWo + 3.6, 'quem ficou levou o prêmio');
assert.equal(rWo.state.inDisputeBalance, 0);
assert.equal(await saiu, 1);
console.log('✔ desistir no meio entrega a partida pro adversário');

// --- sala privada com aposta combinada ---
// Todo usuário novo tem R$ 5,00 de bônus, então a aposta do teste é maior que
// isso: senão "convidado sem saldo" não existiria.
const caio = (await criar('Caio', 'caio@ex.com')).body.token;
const duda = (await criar('Duda', 'duda@ex.com')).body.token;
await post('/api/deposit', { amount: 20 }, caio);
await post('/api/deposit', { amount: 20 }, duda);
const C = cliente(caio);
const D = cliente(duda);

// dono não pode apostar mais do que tem (ele tem R$ 20,00 + R$ 5,00 de bônus)
C.emit('join', { code: 'APOSTA', stake: 100 });
assert.match(await once(C, 'denied'), /precisa de R\$ 100,00/);

// nem acima do teto
C.emit('join', { code: 'APOSTA', stake: 900 });
assert.match(await once(C, 'denied'), /limite de R\$ 500,00/);

// cria valendo R$ 10,00: prêmio de R$ 18,00 (mesma fatia das salas fixas)
C.emit('join', { code: 'aposta', stake: 10 });
const jc = await once(C, 'joined');
assert.equal(jc.code, 'APOSTA');
assert.equal(jc.room.stake, 1000);
assert.equal(jc.room.prize, 1800);
assert.equal((await get('/api/me', caio)).body.inDisputeBalance, 0, 'criar a sala ainda não cobra');

// convidado que não alcança a aposta nem entra — e ouve de quanto ela é
const zeToken = (await criar('Zé', 'ze@ex.com')).body.token;
const Z = cliente(zeToken);
Z.emit('join', { code: 'APOSTA' });
assert.match(await once(Z, 'denied'), /Caio apostou R\$ 10,00/);
assert.ok(await silent(C, 'convidado'), 'e o dono nem fica sabendo');
Z.close();

// convidado com saldo recebe a proposta, e o dono sabe que chegou alguém
const avisoDono = once(C, 'convidado');
D.emit('join', { code: 'APOSTA' });
const proposta = await once(D, 'proposta');
assert.equal(proposta.stake, 1000);
assert.equal(proposta.prize, 1800);
assert.equal(proposta.host.name, 'Caio');
assert.equal((await avisoDono).player.name, 'Duda');
assert.ok(await silent(C, 'start'), 'ninguém começa antes do convidado aceitar');
assert.equal((await get('/api/me', caio)).body.inDisputeBalance, 0, 'e ninguém é debitado antes');
console.log('✔ sala privada: dono define a aposta, convidado vê e decide');

// recusar devolve a sala pro dono, sem cobrar ninguém
const recusa = once(C, 'recusada');
D.emit('recusar');
assert.equal((await recusa).player.name, 'Duda');
assert.equal((await get('/api/me', caio)).body.inDisputeBalance, 0);
assert.equal((await get('/api/me', duda)).body.inDisputeBalance, 0);

// aceitar debita os dois e começa
D.emit('join', { code: 'APOSTA' });
await once(D, 'proposta');
const comecou = Promise.all([once(C, 'start'), once(D, 'start')]);
D.emit('aceitar');
const [scc, sdd] = await comecou;
assert.equal(scc.room.stake, 1000);
assert.equal(scc.seat, 0);
assert.equal(sdd.seat, 1);
assert.equal((await get('/api/me', caio)).body.inDisputeBalance, 10, 'a aposta combinada foi debitada');
assert.equal((await get('/api/me', duda)).body.inDisputeBalance, 10);

const pagamento = Promise.all([once(C, 'settled'), once(D, 'settled')]);
C.emit('over', { winner: 0 });
D.emit('over', { winner: 0 });
const [pc] = await pagamento;
assert.equal(pc.prize, 1800);
assert.equal(pc.state.inDisputeBalance, 0);
assert.equal(pc.state.bonusBalance, 0, 'o bônus foi consumido primeiro na aposta');
assert.equal(pc.state.walletBalance, 20 - 5 + 18, 'vencedor leva os R$ 18,00 combinados');
console.log('✔ aceitar debita os dois e o prêmio segue a aposta combinada');

// --- foto de perfil: valida o arquivo de verdade, serve com cache e vai pra mesa
{
  const tk = (await criar('Foto', 'foto@ex.com')).body.token;
  // JPEG mínimo: só a assinatura importa pra validação.
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`;
  const r = await post('/api/avatar', { image: jpeg }, tk);
  assert.equal(r.status, 200);
  const url = r.body.profile.avatarUrl;
  assert.match(url, /^\/api\/avatar\/\d+\?v=\d+&c=1$/, 'o perfil ganha a URL versionada');
  const img = await fetch(BASE + url);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(img.headers.get('access-control-allow-origin'), '*', 'canvas de outro domínio pode usar a foto');
  assert.match(img.headers.get('cache-control'), /immutable/);

  const falso = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
  assert.equal((await post('/api/avatar', { image: falso }, tk)).status, 400, 'tipo declarado sem a assinatura: recusa');
  assert.equal((await post('/api/avatar', { image: 'data:image/svg+xml;base64,AAAA' }, tk)).status, 400, 'SVG não');
  const grande = `data:image/jpeg;base64,${Buffer.alloc(70 * 1024, 0xff).toString('base64')}`;
  // Acima do limite do corpo o servidor derruba a conexão: também é recusa.
  const st413 = await post('/api/avatar', { image: grande }, tk).then((x) => x.status, () => 'derrubada');
  assert.notEqual(st413, 200, 'grande demais');
  assert.equal((await post('/api/avatar', { image: jpeg })).status, 401, 'sem login não troca');

  // Na mesa: o start leva a foto de cada jogador.
  const F = connect(BASE, { path: '/ws/sinuca', auth: { token: tk }, transports: ['websocket'] });
  const G = connect(BASE, { path: '/ws/sinuca', auth: { token: (await criar('Sem Foto', 'semfoto@ex.com')).body.token }, transports: ['websocket'] });
  const sf = once(F, 'start');
  F.emit('join', { roomType: 'treino' });
  await once(F, 'joined');
  G.emit('join', { roomType: 'treino' });
  const st = await sf;
  assert.equal(st.players.find((p) => p.name === 'Foto').avatar, url, 'o adversário recebe a foto');
  assert.equal(st.players.find((p) => p.name !== 'Foto').avatar, null, 'quem não tem foto vai sem');
  F.emit('leave'); G.emit('leave');

  const sem = await post('/api/avatar', { image: null }, tk);
  assert.equal(sem.body.profile.avatarUrl, null, 'remover volta pro avatar padrão');
  assert.equal((await fetch(BASE + url)).status, 404);
  F.close(); G.close();
  console.log('✔ foto de perfil: valida, serve com cache e aparece pro adversário');
}

// --- reação na mesa: lista fixa, só em partida, com intervalo ---------------
{
  const R1 = connect(BASE, { path: '/ws/sinuca', auth: { token: (await criar('Reage', 'reage@ex.com')).body.token }, transports: ['websocket'] });
  const R2 = connect(BASE, { path: '/ws/sinuca', auth: { token: (await criar('Reage2', 'reage2@ex.com')).body.token }, transports: ['websocket'] });
  const st = once(R1, 'start');
  R1.emit('join', { roomType: 'treino' });
  await once(R1, 'joined');
  R2.emit('join', { roomType: 'treino' });
  await st;
  const chegou = once(R2, 'reacao');
  R1.emit('reacao', { emoji: '🔥' });
  const r1 = await chegou;
  assert.equal(r1.emoji, '🔥');
  assert.equal(r1.assento, 0, 'com o assento de quem mandou');
  R1.emit('reacao', { emoji: '🔥' });                 // dentro de 1,5s: ignorada
  assert.equal(await silent(R2, 'reacao', 300), true, 'uma a cada 1,5s');
  R2.emit('reacao', { emoji: 'xingamento' });
  assert.equal(await silent(R1, 'reacao', 300), true, 'emoji fora da lista não passa');
  const fala = once(R1, 'reacao');
  R2.emit('reacao', { emoji: 'Truco!' });
  assert.equal((await fala).emoji, 'Truco!', 'as falas prontas do truco estão na lista');
  R1.close(); R2.close();
  console.log('✔ reação: lista fixa, só na partida, com intervalo');
}

// --- painel de moderação: só ADMIN_EMAILS -------------------------------------
{
  const moder = (await criar('Moder', 'moder@ex.com')).body;
  assert.equal(moder.profile.isAdmin, true, 'o perfil diz que é da moderação');
  assert.equal((await get('/api/admin/resumo', ana)).status, 403, 'quem não está na lista não entra');
  const r0 = await get('/api/admin/resumo', moder.token);
  assert.equal(r0.status, 200);
  assert.deepEqual(r0.body.auditoria, [], 'a auditoria do dinheiro está limpa');

  const C = await import('./chat.js');
  const { one: um } = await import('./db.js');
  const alvo = um("SELECT id FROM users WHERE email = 'ana@ex.com'").id;
  const quem = um("SELECT id FROM users WHERE email = 'moder@ex.com'").id;
  C.denunciar(quem, alvo, { motivo: 'spam' });
  const r1 = await get('/api/admin/resumo', moder.token);
  assert.equal(r1.body.denuncias.length, 1, 'a denúncia aparece na fila');
  const r2 = await post('/api/admin/denuncia', { id: r1.body.denuncias[0].id, acao: 'silenciar' }, moder.token);
  assert.equal(r2.body.denuncias.length, 0, 'decidida, sai da fila');
  assert.ok(um('SELECT silenciado_ate FROM users WHERE id = ?', alvo).silenciado_ate > Date.now(), 'e o alvo fica silenciado');
  console.log('✔ moderação: só ADMIN_EMAILS, fila de denúncias e auditoria');
}

C.close(); D.close();
A.close();
io.close();
http.close();
console.log('servidor: 13 grupos ok');
