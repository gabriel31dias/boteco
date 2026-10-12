// Auto-verificação das regras da cacheta: node src/games/cacheta/test-regras.mjs
import assert from 'node:assert/strict';
import { Rodada, baralho, batida, curingaDe, ehCuringa, jogoValido, particionar } from './regras.js';
import { mulberry32 } from '../domino/regras.js';

const cs = (s) => s.split(' ');
const VIRA = '8c0';                       // curinga: 9 pretos (9s, 9c)

// --- vira e curinga: valor de cima, mesma cor; K vira A
{
  assert.equal(baralho().length, 104);
  assert.equal(new Set(baralho()).size, 104);
  assert.deepEqual(curingaDe('8c0'), { valor: '9', vermelho: false });
  assert.deepEqual(curingaDe('Kh1'), { valor: 'A', vermelho: true });
  assert.equal(ehCuringa('9s0', VIRA), true);
  assert.equal(ehCuringa('9c1', VIRA), true);
  assert.equal(ehCuringa('9h0', VIRA), false, 'cor errada');
  assert.equal(ehCuringa('Ad0', 'Kh0'), true);
  console.log('✔ vira e curinga');
}

// --- trinca: as três primeiras de naipes diferentes; a 4ª/5ª pode repetir
{
  const ok = (s) => jogoValido(cs(s), VIRA);
  assert.equal(ok('5s0 5h0 5d0').tipo, 'trinca');
  assert.equal(ok('5s0 5s1 5h0'), null, 'só dois naipes');
  assert.ok(ok('5s0 5h0 5d0 5d1'), 'quarta repete naipe');
  assert.ok(ok('5s0 5h0 5d0 5c0 5h1'), 'quina');
  assert.equal(ok('5s0 5h0'), null, 'mínimo 3');
  assert.equal(ok('5s0 6h0 5d0'), null);
  console.log('✔ trinca');
}

// --- sequência: mesmo naipe, Ás embaixo ou em cima, sem dar a volta
{
  const ok = (s) => jogoValido(cs(s), VIRA);
  assert.deepEqual(ok('5h0 3h0 4h1').cartas, ['3h0', '4h1', '5h0'], 'ordena');
  assert.ok(ok('Ah0 2h0 3h0'), 'Ás embaixo');
  assert.ok(ok('Qh0 Kh0 Ah0'), 'Ás em cima');
  assert.equal(ok('Kh0 Ah0 2h0'), null, 'K-A-2 não');
  assert.equal(ok('3h0 4h0 5d0'), null, 'naipe misturado');
  assert.equal(ok('3h0 3h1 4h0'), null, 'valor repetido');
  console.log('✔ sequência');
}

// --- curinga: um por jogo, tapa buraco ou ponta, e também vale como carta natural
{
  const ok = (s) => jogoValido(cs(s), VIRA);
  assert.deepEqual(ok('3h0 5h0 9s0').cartas, ['3h0', '9s0', '5h0'], 'tapa o buraco');
  assert.deepEqual(ok('3h0 4h0 9c0').cartas, ['3h0', '4h0', '9c0'], 'vira ponta');
  assert.equal(ok('3h0 4h0 9c0').curinga, '9c0');
  assert.ok(ok('5s0 5h0 9s1'), 'trinca com curinga');
  assert.equal(ok('5s0 5s1 9s1'), null, 'curinga não salva naipe repetido');
  assert.equal(ok('3h0 9s0 9c0'), null, 'dois curingas não');
  assert.equal(ok('3h0 6h0 9s0'), null, 'dois buracos, um curinga');
  const natural = ok('8s0 9s0 Ts0');
  assert.equal(natural.curinga, null, '9♠ natural na sequência de espadas');
  assert.equal(ok('9s0 9h0 9d0').curinga, null, 'trinca de 9 natural');
  console.log('✔ curinga');
}

// --- bater: com 10 (um jogo com ponta) tira 2; com 9 (descartando uma) tira 1
{
  const mao10 = cs('3h0 4h0 5h0 6h0 7s0 7d0 7c0 Qs0 Ks0 As0');
  const b10 = batida(mao10, VIRA);
  assert.equal(b10.cartas, 10);
  assert.equal(b10.jogos.length, 3);
  const mao9 = cs('3h0 4h0 5h0 7s0 7d0 7c0 Qs0 Ks0 As0 2d0');
  const b9 = batida(mao9, VIRA);
  assert.equal(b9.cartas, 9);
  assert.equal(b9.descarte, '2d0');
  assert.equal(batida(mao9, VIRA, { descarte: '3h0' }), null, 'descartando a errada não bate');
  assert.equal(batida(mao9, VIRA, { proibida: '2d0' }), null, 'a carta do lixo não pode ser o descarte');
  assert.equal(batida(cs('3h0 4h0 5h0 7s0 7d0 7c0 Qs0 Ks0 2c0 2d0'), VIRA), null);
  assert.equal(batida(mao9.slice(0, 9), VIRA), null, 'precisa ter comprado (10 na mão)');
  assert.equal(particionar(cs('3h0 4h0 5h0 6h0 7h0 8h0'), VIRA).length, 2, 'sequência longa vira duas');
  assert.equal(batida(cs('3h0 4h0 5h0 6h0 7h0 8h0 9h0 Th0 Jh0 Qh0'), 'Ac0').cartas, 10, 'sequência de 10 bate');
  console.log('✔ bater');
}

// --- rodada: distribui 9, vira, compra/descarta, lixo, vez, sair
{
  const r = new Rodada({ jogadores: 4, assentos: [0, 1, 3], inicio: 1, rng: mulberry32(7) });
  assert.deepEqual(r.maos.map((m) => m.length), [9, 9, 0, 9], 'quem está fora da mão não recebe');
  assert.equal(r.monte.length, 104 - 27 - 1);
  assert.throws(() => r.comprar(0), /fora da vez/);
  assert.throws(() => r.descartar(1, r.maos[1][0]), /compre antes/);
  assert.throws(() => r.pegarLixo(1), /lixo vazio/);
  const c = r.comprar(1);
  assert.ok(r.maos[1].includes(c));
  assert.throws(() => r.comprar(1), /já comprou/);
  r.descartar(1, c);
  assert.equal(r.vez, 3, 'pula o assento 2, que está fora');
  assert.deepEqual(r.lixo, [c]);
  r.pegarLixo(3);
  assert.throws(() => r.descartar(3, c), /não volta/);
  r.descartar(3, r.maos[3][0]);
  assert.equal(r.vez, 0, 'volta pro começo da mesa');
  r.sair(0);
  assert.equal(r.vez, 1, 'saiu na vez: passa');
  assert.equal(r.maos[0].length, 0);
  r.sair(3);
  assert.equal(r.fim.motivo, 'abandono', 'sobrou um: mão acaba sem perda');
  console.log('✔ rodada');
}

// --- monte acabou: o lixo (menos a de cima) volta embaralhado
{
  const r = new Rodada({ jogadores: 2, rng: mulberry32(3) });
  r.lixo = r.monte.splice(0, r.monte.length - 1);
  const topo = r.lixo.at(-1);
  r.comprar(0);
  r.descartar(0, r.maos[0][0]);
  r.comprar(1);
  assert.ok(r.monte.length > 50, 'lixo virou monte');
  assert.equal(r.lixo.length, 1);
  assert.notEqual(r.lixo[0], topo);
  console.log('✔ monte acabou');
}

// --- 150 mãos aleatórias: 104 cartas sempre, ninguém com mão errada, termina
{
  let batidas = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rng = mulberry32(seed);
    const n = 2 + (seed % 5);
    const r = new Rodada({ jogadores: n, rng });
    for (let t = 0; t < 400 && !r.fim; t++) {
      const s = r.vez;
      if (rng() < 0.3 && r.lixo.length) r.pegarLixo(s); else r.comprar(s);
      if (r.fim) break;
      if (batida(r.maos[s], r.vira, { proibida: r.doLixo })) { r.bater(s); batidas++; break; }
      const opcoes = r.maos[s].filter((c) => c !== r.doLixo);
      r.descartar(s, opcoes[Math.floor(rng() * opcoes.length)]);
      const total = r.maos.reduce((a, m) => a + m.length, 0) + r.monte.length + r.lixo.length + 1;
      assert.equal(total, 104, `conservação (seed ${seed})`);
      for (const x of r.assentos) assert.equal(r.maos[x].length, 9);
    }
  }
  assert.ok(batidas > 0, 'alguém bate em jogo aleatório');
  console.log(`✔ 150 mãos aleatórias (${batidas} batidas)`);
}
