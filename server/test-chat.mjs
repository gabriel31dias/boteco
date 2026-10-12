// Auto-verificação do chat e das amizades: node server/test-chat.mjs
process.env.DB = ':memory:';
process.env.MAIL_OFF = '1';
process.env.HTTP = '1';

const assert = (await import('node:assert/strict')).default;
const { io: connect } = await import('socket.io-client');
const { listen } = await import('./index.js');
const M = await import('./model.js');
const C = await import('./chat.js');
const { one } = await import('./db.js');

const PORT = 3450;
const { http, io } = listen(PORT, 'chat');

const novo = (email, nome) => {
  const r = M.register({ name: nome, email, password: 'segredo123' });
  const code = one('SELECT code FROM email_codes WHERE user_id = ?', r.userId).code;
  const { token } = M.verifyEmail({ email, code });
  return { id: r.userId, token };
};
const cliente = (u) => connect(`http://localhost:${PORT}`, { path: '/ws/chat', auth: { token: u.token }, transports: ['websocket'] });
const espera = (s, ev) => new Promise((ok) => s.once(ev, ok));
const pede = (s, ev, dados) => new Promise((ok) => s.emit(ev, dados, ok));
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ana = novo('ana@chat.com', 'Ana');
const beto = novo('beto@chat.com', 'Beto');
const caio = novo('caio@chat.com', 'Caio');   // nunca jogou com ninguém

// --- filtro e limites do texto ---------------------------------------------
{
  assert.equal(C.filtrar('que porra é essa'), 'que ***** é essa');
  assert.equal(C.filtrar('P0RR4 meu'), '***** meu', 'pega letra trocada por número');
  assert.equal(C.filtrar('Caralhooo'), '*********', 'e esticado');
  assert.equal(C.filtrar('essas putas'), 'essas *****', 'e plural');
  assert.equal(C.filtrar('computador'), 'computador', 'palavra normal que contém um palavrão fica');
  assert.throws(() => C.limpar('   '), /vazia/);
  assert.throws(() => C.limpar('x'.repeat(C.TEXTO_MAX + 1)), /Máximo/);
  console.log('✔ texto: filtro de palavrão e limites');
}

const A = cliente(ana);
const B = cliente(beto);
const X = cliente(caio);
const [iniA] = await Promise.all([espera(A, 'chat:inicio'), espera(B, 'chat:inicio'), espera(X, 'chat:inicio')]);
assert.deepEqual(iniA.amigos, [], 'começa sem amigos');

// --- geral: todo mundo recebe, com histórico ---------------------------------
{
  const chegou = [espera(B, 'geral:msg'), espera(X, 'geral:msg')];
  const r = await pede(A, 'geral:enviar', { texto: 'boa noite, mesa!' });
  assert.ok(r.ok);
  const [mb] = await Promise.all(chegou);
  assert.equal(mb.texto, 'boa noite, mesa!');
  assert.equal(mb.de.name, 'Ana', 'com o perfil de quem mandou');
  assert.equal((await pede(A, 'geral:enviar', { texto: '' })).erro, 'Mensagem vazia');

  const Y = cliente(caio);
  const ini = await espera(Y, 'chat:inicio');
  assert.equal(ini.geral.at(-1).texto, 'boa noite, mesa!', 'quem entra recebe o histórico');
  Y.close();

  // rajada: a 6ª em 10s é recusada (a 1ª já foi acima)
  for (let i = 0; i < 4; i++) assert.ok((await pede(A, 'geral:enviar', { texto: `msg ${i}` })).ok);
  assert.match((await pede(A, 'geral:enviar', { texto: 'spam' })).erro, /Calma/);
  console.log('✔ geral: chega pra todos, guarda histórico e segura rajada');
}

// --- amizade: só com quem jogou junto; o outro aceita -------------------------
{
  // Pedir é livre: Caio nunca jogou com a Ana e pode pedir mesmo assim.
  assert.equal(C.pedirAmizade(caio.id, ana.id), 'enviado', 'sem ter jogado junto também pode');
  C.responderAmizade(ana.id, caio.id, false);   // Ana recusa: não atrapalha o resto do teste
  assert.equal((await pede(B, 'amizade:pedir', { id: beto.id })).erro, 'Jogador não encontrado', 'nem consigo mesmo');

  const chegou = espera(A, 'amizade:pedido');
  const r = await pede(B, 'amizade:pedir', { id: ana.id });
  assert.equal(r.relacao, 'enviado');
  assert.equal((await chegou).name, 'Beto', 'Ana recebe o pedido na hora');
  assert.equal((await pede(B, 'amizade:pedir', { id: ana.id })).erro, 'Pedido já enviado');
  assert.equal((await pede(A, 'relacao', { com: beto.id })).relacao, 'recebido');

  const aceita = espera(B, 'amizade:aceita');
  const resp = await pede(A, 'amizade:responder', { id: beto.id, aceitar: true });
  assert.equal(resp.relacao, 'amigos');
  assert.equal(resp.amigo.online, true, 'e já vem sabendo que ele está online');
  assert.equal((await aceita).name, 'Ana', 'Beto fica sabendo que foi aceito');
  assert.deepEqual(C.amigosDe(ana.id).map((a) => a.id), [beto.id]);
  console.log('✔ amizade: livre pra qualquer um, pedido chega e o aceite avisa');
}

// --- pedido cruzado vira amizade na hora -------------------------------------
{
  const dani = novo('dani@chat.com', 'Dani');
  assert.equal(C.pedirAmizade(dani.id, caio.id), 'enviado');
  assert.equal(C.pedirAmizade(caio.id, dani.id), 'amigos', 'se ele já tinha pedido, aceitar é pedir de volta');
  console.log('✔ pedido cruzado: vira amizade sem modal');
}

// --- mensagem privada: só entre amigos, com não lidas -------------------------
{
  assert.match((await pede(X, 'dm:enviar', { para: ana.id, texto: 'oi' })).erro, /amigos/);
  const chegou = espera(A, 'dm:msg');
  await pausa(10_100);                      // passa a janela da rajada da Ana
  const r = await pede(B, 'dm:enviar', { para: ana.id, texto: 'bora uma partida?' });
  assert.ok(r.ok);
  assert.equal((await chegou).texto, 'bora uma partida?');
  assert.deepEqual(C.naoLidas(ana.id), { [beto.id]: 1 }, 'Ana tem uma não lida do Beto');
  const conv = await pede(A, 'dm:conversa', { com: beto.id });
  assert.equal(conv.msgs.length, 1);
  assert.deepEqual(C.naoLidas(ana.id), {}, 'abrir a conversa marca como lida');
  assert.equal(C.conversa(caio.id, ana.id).length, 0, 'ninguém lê conversa dos outros');
  console.log('✔ privado: só amigos, chega na hora e conta não lidas');
}

// --- convite pra sala privada: só amigo, chega na hora ------------------------
{
  await pausa(10_100);                      // passa a janela da rajada do Beto
  assert.match((await pede(X, 'convite:enviar', { para: ana.id, jogo: 'domino', code: 'ABC1' })).erro, /amigos/, 'Caio não é amigo da Ana');
  assert.match((await pede(B, 'convite:enviar', { para: ana.id, jogo: 'xadrez', code: 'ABC1' })).erro, /Jogo inválido/);
  const chegou = espera(A, 'convite');
  const r = await pede(B, 'convite:enviar', { para: ana.id, jogo: 'domino', code: 'mesa-7!', stake: 500 });
  assert.equal(r.online, true, 'quem convida sabe que o amigo está online');
  const c = await chegou;
  assert.equal(c.de.name, 'Beto');
  assert.equal(c.code, 'MESA7', 'o código chega limpo, no formato do servidor dos jogos');
  assert.equal(c.nomeJogo, 'Dominó');
  assert.equal(c.stake, 500);
  console.log('✔ convite: só pra amigo, com jogo, código e valor');
}

// --- online dos amigos ---------------------------------------------------------
{
  const saiu = espera(A, 'amigo:online');
  B.close();
  assert.deepEqual(await saiu, { id: beto.id, online: false, presenca: null }, 'Ana vê o Beto sair');
  const B2 = cliente(beto);
  const voltou = await espera(A, 'amigo:online');
  assert.equal(voltou.online, true);
  // presença: o app conta onde está, e o amigo vê
  const mudou = espera(A, 'amigo:online');
  B2.emit('presenca', { estado: 'procurando', jogo: 'truco', sala: { tipo: 'privada', code: 'ab-12' } });
  const p = (await mudou).presenca;
  assert.deepEqual(p, { estado: 'procurando', jogo: 'truco', nomeJogo: 'Truco paulista', sala: { tipo: 'privada', code: 'AB12' } });
  assert.deepEqual(C.limparPresenca({ estado: 'hackeando' }), { estado: 'lobby' }, 'estado inventado vira lobby');
  B2.close();
  console.log('✔ online: amigos veem quem entra e sai');
}

// --- bloquear: desfaz, impede pedido e mensagem --------------------------------
{
  const r = await pede(A, 'bloquear', { id: beto.id });
  assert.deepEqual(r.bloqueados, [beto.id]);
  assert.equal(C.relacao(beto.id, ana.id), 'nenhuma', 'o bloqueado não sabe que foi bloqueado');
  assert.throws(() => C.pedirAmizade(beto.id, ana.id), /Não foi possível/);
  assert.throws(() => C.enviarDM(beto.id, ana.id, 'oi?'), /amigos/);
  C.desbloquear(ana.id, beto.id);
  assert.equal(C.relacao(ana.id, beto.id), 'nenhuma', 'desbloquear não refaz a amizade');
  console.log('✔ bloquear: some da lista, sem pedido e sem mensagem');
}

// --- denúncia: 3 pessoas diferentes silenciam o geral por 1h -----------------
{
  const alvo = novo('troll@chat.com', 'Troll');
  const [d1, d2, d3] = ['d1', 'd2', 'd3'].map((n) => novo(`${n}@chat.com`, n));
  const m1 = C.enviarGeral(alvo.id, 'mensagem ruim');
  assert.throws(() => C.denunciar(d1.id, alvo.id, { motivo: 'xingou' }), /motivo/);
  assert.equal(C.denunciar(d1.id, alvo.id, { mensagemId: m1.id, motivo: 'ofensa' }), false);
  assert.throws(() => C.denunciar(d1.id, alvo.id, { motivo: 'ofensa' }), /já denunciou/, 'a mesma pessoa não soma duas vezes');
  assert.equal(C.denunciar(d2.id, alvo.id, { motivo: 'spam' }), false);
  assert.equal(C.denunciar(d3.id, alvo.id, { motivo: 'ofensa' }), true, 'a 3ª pessoa silencia');
  assert.throws(() => C.enviarGeral(alvo.id, 'de novo'), /denunciado/, 'silenciado não escreve no geral');
  assert.equal(one('SELECT texto FROM denuncias WHERE mensagem_id = ?', m1.id).texto, 'mensagem ruim', 'a denúncia guarda a mensagem');
  console.log('✔ denúncia: uma por pessoa, 3 pessoas silenciam o geral');
}

// --- histórico entre dois jogadores, e revanche logo depois -----------------
{
  const e1 = novo('e1@chat.com', 'E1');
  const e2 = novo('e2@chat.com', 'E2');
  for (const vencedor of [e1.id, e1.id, e2.id]) {
    const mm = M.openMatch({ game: 'velha', roomType: 'treino', aId: e1.id, bId: e2.id });
    M.settleMatch(mm.id, vencedor);
  }
  const h = C.historicoContra(e1.id, e2.id);
  assert.deepEqual([h.partidas, h.vitorias, h.derrotas], [3, 2, 1], 'jogaram 3, e1 ganhou 2');
  assert.equal(C.historicoContra(e2.id, e1.id).vitorias, 1, 'e do outro lado, 1');

  assert.throws(() => C.montarConvite(e1.id, e2.id, { jogo: 'velha', code: 'X1' }), /amigos/, 'sem revanche, só amigo');
  assert.equal(C.montarConvite(e1.id, e2.id, { jogo: 'velha', code: 'X1', revanche: true }).revanche, true,
    'revanche logo depois da partida vale sem ser amigo');
  assert.throws(() => C.montarConvite(e1.id, caio.id, { jogo: 'velha', code: 'X1', revanche: true }), /logo depois/,
    'e só com quem acabou de jogar');
  console.log('✔ histórico e revanche: placar entre os dois, convite logo depois da partida');
}

A.close(); X.close();
io.close();
http.close();
console.log('chat: 11 grupos ok');
process.exit(0);
