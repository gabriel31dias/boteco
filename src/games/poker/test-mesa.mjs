// Auto-verificação da mão de apostas: node src/games/poker/test-mesa.mjs
import assert from 'node:assert/strict';
import { Mao } from './mesa.js';
import { mulberry32 } from './regras.js';

const nova = (fichas, botao = 0, sb = 10, bb = 20, seed = 1) => new Mao({ fichas, botao, sb, bb, rng: mulberry32(seed) });
const soma = (a) => a.reduce((x, y) => x + y, 0);
/**
 * Fixa o board depois dos blinds. A Mao tira do fim do deck nesta ordem:
 * queima, flop×3, queima, turn, queima, river — então o array é o inverso.
 */
const montarBoard = (m, [f1, f2, f3, turn, river]) => { m.deck = [river, '2s', turn, '3s', f3, f2, f1, '4s']; };
/** Check (ou call, se dever) com quem estiver na vez até a mão acabar. */
const passarAteOFim = (m) => {
  while (m.fase !== 'fim') m.agir(m.vez, { tipo: m.acoesLegais(m.vez).check ? 'check' : 'call' });
};

// --- heads-up: botão é SB, age primeiro no pré-flop e por último depois
{
  const m = nova([1000, 1000], 0);
  assert.equal(m.posSb, 0); assert.equal(m.posBb, 1);
  assert.equal(m.vez, 0, 'botão/SB age primeiro no pré-flop');
  m.agir(0, { tipo: 'call' });
  assert.equal(m.vez, 1, 'BB tem a opção');
  assert.ok(m.acoesLegais(1).check && m.acoesLegais(1).minRaise === 40);
  m.agir(1, { tipo: 'check' });
  assert.equal(m.fase, 'flop'); assert.equal(m.board.length, 3);
  assert.equal(m.vez, 1, 'pós-flop o BB age primeiro no heads-up');
  console.log('✔ heads-up: blinds e ordem');
}

// --- 3+ jogadores: UTG começa, min-raise, todos largam
{
  const m = nova([1000, 1000, 1000, 1000], 0);
  assert.deepEqual([m.posSb, m.posBb, m.vez], [1, 2, 3]);
  assert.throws(() => m.agir(3, { tipo: 'raise', valor: 30 }), /inválid/, 'raise abaixo do mínimo');
  m.agir(3, { tipo: 'raise', valor: 60 });                 // +40
  assert.equal(m.acoesLegais(0).minRaise, 100, 'mínimo = último aumento (40)');
  m.agir(0, { tipo: 'fold' }); m.agir(1, { tipo: 'fold' }); m.agir(2, { tipo: 'fold' });
  assert.equal(m.fase, 'fim');
  assert.deepEqual(m.resultado.ganhos, [0, 0, 0, 90]);
  assert.equal(m.resultado.mostradas, null, 'ninguém mostra quando todos largam');
  assert.equal(soma(m.pilha), 4000);
  console.log('✔ 4 na mesa: UTG, min-raise e vitória sem showdown');
}

// --- all-in curto não reabre a ação (TDA 47)
{
  const m = nova([1000, 1000, 130], 0);   // botão 0, SB 1, BB 2(130)
  m.agir(0, { tipo: 'raise', valor: 100 });  // +80
  m.agir(1, { tipo: 'call' });
  m.agir(2, { tipo: 'allin' });              // 130: sobe 30 < 80, curto
  assert.equal(m.vez, 0);
  const L = m.acoesLegais(0);
  assert.equal(L.call, 30);
  assert.equal(L.minRaise, null, 'quem já agiu não pode reaumentar');
  m.agir(0, { tipo: 'call' });
  assert.equal(m.acoesLegais(1).minRaise, null);
  m.agir(1, { tipo: 'call' });
  assert.equal(m.fase, 'flop');
  console.log('✔ all-in curto não reabre');
}

// --- três all-ins: side pots somam e vão pra quem disputou
{
  const m = nova([100, 300, 600, 1000], 0, 10, 20, 3);
  m.agir(3, { tipo: 'allin' }); m.agir(0, { tipo: 'allin' }); m.agir(1, { tipo: 'allin' }); m.agir(2, { tipo: 'allin' });
  assert.equal(m.fase, 'fim'); assert.equal(m.board.length, 5, 'board corre até o fim');
  const potes = m.resultado.potes;
  assert.deepEqual(potes.map((p) => p.valor), [400, 600, 600, 400]);
  assert.deepEqual(potes.map((p) => p.elegiveis.length), [4, 3, 2, 1]);
  assert.deepEqual(potes[3].vencedores, [3], 'excedente sem adversário volta pra quem apostou');
  assert.equal(soma(m.pilha), 2000, 'nenhuma ficha criada ou perdida');
  for (const p of potes) for (const v of p.vencedores) assert.ok(p.elegiveis.includes(v));
  console.log('✔ side pots com 4 all-ins');
}

// --- pote dividido: a sequência até o Ás está na mesa, os três dividem
{
  const m = nova([1000, 1000, 1000], 2);              // botão 2, SB 0, BB 1
  m.cartas = [['2c', '3d'], ['2h', '3s'], ['4c', '5d']];
  montarBoard(m, ['Ah', 'Kd', 'Qs', 'Jc', 'Td']);
  passarAteOFim(m);                                    // botão paga, SB completa, BB e os outros dão check
  assert.equal(m.resultado.maos[0].nome, 'Sequência', 'mesa tem a sequência até o Ás');
  assert.deepEqual(m.resultado.potes[0].vencedores, [0, 1, 2], 'os três, a partir da esquerda do botão');
  assert.deepEqual(m.resultado.ganhos, [20, 20, 20]);
  console.log('✔ pote dividido');
}

// --- ficha ímpar: 105 dividido por 2 → 53 pro primeiro à esquerda do botão
{
  const m = nova([1000, 1000, 1000], 2, 5, 10);       // botão 2, SB 0 (5), BB 1 (10)
  m.cartas = [['2c', '3d'], ['2h', '3s'], ['Ac', 'Ad']];
  montarBoard(m, ['Ah', 'Kd', 'Qs', 'Jc', 'Td']);
  m.agir(2, { tipo: 'call' }); m.agir(0, { tipo: 'call' }); m.agir(1, { tipo: 'check' });   // pote 30
  m.agir(0, { tipo: 'check' }); m.agir(1, { tipo: 'check' });
  m.agir(2, { tipo: 'raise', valor: 15 });             // aposta 15 no flop
  m.agir(0, { tipo: 'raise', valor: 30 });             // aumento completo (+15)
  m.agir(1, { tipo: 'call' });
  m.agir(2, { tipo: 'fold' });                         // pote: 30 + 15 + 30 + 30 = 105
  passarAteOFim(m);
  assert.deepEqual(m.resultado.potes.map((p) => p.vencedores), [[0, 1]]);
  assert.deepEqual(m.resultado.ganhos, [53, 52, 0], 'ímpar vai pro SB (primeiro à esquerda do botão)');
  console.log('✔ ficha ímpar');
}
// --- abandono fora da vez: a mão segue; se sobra um, ele leva
{
  const m = nova([1000, 1000, 1000], 0);
  const vez = m.vez;                       // 0 (UTG = botão com 3)
  m.abandonar(1);                          // SB sai sem ser a vez
  assert.equal(m.vez, vez, 'a vez não muda');
  assert.ok(m.foldou[1]);
  m.abandonar(2);
  assert.equal(m.fase, 'fim', 'sobrou um: acabou');
  assert.deepEqual(m.resultado.ganhos, [30, 0, 0]);
  console.log('✔ abandono fora da vez');
}

// --- blind curto: posta o que tem e fica all-in
{
  const m = nova([1000, 15], 0);           // heads-up: 0 é SB, 1 é BB com 15
  assert.equal(m.aposta[1], 15); assert.equal(m.pilha[1], 0);
  assert.equal(m.acoesLegais(0).call, 5, 'SB completa só até 15');
  m.agir(0, { tipo: 'call' });
  assert.equal(m.fase, 'fim', 'ninguém mais aposta: board corre');
  assert.equal(m.pilha[0] + m.pilha[1], 1015);
  console.log('✔ blind curto');
}

// --- ação inválida não muda nada
{
  const m = nova([1000, 1000], 0);
  const antes = JSON.stringify(m);
  assert.throws(() => m.agir(1, { tipo: 'check' }), /vez/);
  assert.throws(() => m.agir(0, { tipo: 'check' }), /inválid/);       // deve 10
  assert.throws(() => m.agir(0, { tipo: 'raise', valor: 5000 }), /inválid/);
  assert.throws(() => m.agir(0, { tipo: 'raise', valor: 'abc' }), /inválid/);
  assert.equal(JSON.stringify(m), antes);
  console.log('✔ ação inválida recusada sem efeito');
}

// --- all-ins curtos que somam um aumento completo reabrem (TDA 47)
{
  const m = nova([150, 210, 1000, 1000], 0);           // botão 0, SB 1 (210), BB 2, UTG 3
  m.agir(3, { tipo: 'raise', valor: 100 });            // +80: aumento completo
  m.agir(0, { tipo: 'allin' });                        // 150 (+50, curto)
  m.agir(1, { tipo: 'allin' });                        // 210 (+60, curto) — somados, +110 ≥ 80
  m.agir(2, { tipo: 'call' });
  assert.equal(m.vez, 3);
  assert.equal(m.acoesLegais(3).minRaise, 290, 'encara 110 a mais (≥ 80): pode reaumentar');
  console.log('✔ all-ins curtos cumulativos reabrem');
}

// --- ninguém pode responder: não pede ação de quem já cobriu
{
  const m = nova([20, 1000, 1000], 0);                 // botão 0 só com 20; SB 1, BB 2
  m.agir(0, { tipo: 'allin' });                        // 20 = paga o BB
  m.agir(1, { tipo: 'fold' });
  assert.equal(m.fase, 'fim', 'BB cobre e ninguém mais aposta: o board corre');
  console.log('✔ sem pedir ação quando ninguém pode responder');
}
{
  const m = nova([1000, 1000, 50], 0);                 // botão 0 (UTG), SB 1, BB 2 com 50
  m.agir(0, { tipo: 'fold' });
  m.agir(1, { tipo: 'raise', valor: 200 });
  assert.equal(m.acoesLegais(2).minRaise, null, 'BB all-in pra pagar: não tem contra quem aumentar');
  console.log('✔ sem aumento contra quem está all-in');
}

// --- devolução de aposta sem resposta não é vitória
{
  const m = nova([100, 1000, 1000], 2, 10, 20, 5);     // botão 2: UTG; SB 0 (100), BB 1
  m.agir(2, { tipo: 'raise', valor: 500 });
  m.agir(0, { tipo: 'allin' });
  m.agir(1, { tipo: 'fold' });
  assert.equal(m.fase, 'fim');
  const dev = m.resultado.potes.filter((p) => p.devolvido);
  assert.equal(dev.length, 1, 'o excedente do botão volta como devolução');
  assert.deepEqual(dev[0].elegiveis, [2]);
  assert.ok(m.resultado.potes.filter((p) => !p.devolvido).every((p) => p.elegiveis.length > 1), 'o resto é disputado');
  console.log('✔ devolução marcada');
}
