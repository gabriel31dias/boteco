// Auto-verificação das regras do buraco: node src/games/buraco/test-regras.mjs
import assert from 'node:assert/strict';
import { Rodada, baralho, montarJogo, pontos } from './regras.js';
import { mulberry32 } from '../domino/regras.js';

const soma = (a) => a.reduce((x, y) => x + y, 0);

// --- baralho: 2 baralhos, sem coringa, ids únicos
{
  const b = baralho();
  assert.equal(b.length, 104);
  assert.equal(new Set(b).size, 104, 'ids únicos (o deck vai no id)');
  assert.equal(b.filter((c) => c.startsWith('As')).length, 2);
  assert.deepEqual(['As0', '2h1', '7c0', 'Kd0', 'Ts1', '8h0'].map(pontos), [15, 10, 5, 10, 10, 10]);
  console.log('✔ baralho e pontos');
}

// --- jogos: sequência do mesmo naipe, 2 curinga (no máximo um), Ás alto ou baixo
{
  const ok = (s) => montarJogo(s.split(' '));
  assert.deepEqual(ok('4s0 5s0 6s0').cartas, ['4s0', '5s0', '6s0']);
  assert.deepEqual(ok('6s0 4s0 5s1').cartas, ['4s0', '5s1', '6s0'], 'ordena');
  assert.equal(ok('4s0 5s0 6s0').limpa, true);
  assert.equal(ok('4s0 5h0 6s0'), null, 'naipe misturado');
  assert.equal(ok('4s0 5s0'), null, 'mínimo 3');
  assert.equal(ok('4s0 4s1 5s0'), null, 'valor repetido');
  assert.equal(ok('4s0 6s0 8s0'), null, 'dois buracos, um curinga só');
  assert.equal(ok('Ks0 Qs0 Js0').limpa, true);

  const sujo = ok('4s0 2h0 6s0');
  assert.deepEqual(sujo.cartas, ['4s0', '2h0', '6s0'], 'curinga tapa o buraco');
  assert.equal(sujo.limpa, false);
  assert.equal(sujo.curinga, '2h0');
  assert.equal(ok('4s0 2h0 6s0 2d0'), null, 'no máximo um curinga');
  assert.deepEqual(ok('4s0 5s0 2c0').cartas, ['4s0', '5s0', '2c0'], 'curinga sobrando vai em cima');
  assert.deepEqual(ok('Qs0 Ks0 As0 2c0').cartas, ['2c0', 'Qs0', 'Ks0', 'As0'], 'em cima do Ás não cabe: vai embaixo');

  const natural = ok('As0 2s0 3s0');
  assert.equal(natural.limpa, true, 'A-2-3 do mesmo naipe: o 2 é natural');
  assert.deepEqual(natural.cartas, ['As0', '2s0', '3s0']);
  const doisDois = ok('2s0 2s1 3s0 4s0');
  assert.equal(doisDois.limpa, false, 'um 2 natural e o outro curinga');
  assert.equal(doisDois.cartas.length, 4);
  assert.equal(ok('Qs0 Ks0 As0').limpa, true, 'Ás alto');
  assert.equal(ok('Ks0 As0 3s0'), null, 'não dá a volta (K-A-3)');
  assert.deepEqual(ok('Ks0 As0 2s0').cartas, ['2s0', 'Ks0', 'As0'], 'K-A + 2: o 2 vira a dama (curinga)');
  assert.equal(ok('2s0 2h0 2d0'), null, 'só curingas não é jogo');
  console.log('✔ jogos: sequência, curinga, Ás alto/baixo');
}

const nova = (n = 2, seed = 1) => new Rodada({ jogadores: n, inicio: 0, rng: mulberry32(seed) });
const contar = (r) => soma(r.maos.map((m) => m.length)) + r.monte.length + r.lixo.length
  + soma(r.mortos.map((m) => m.length)) + soma(r.jogos.flat().map((j) => j.cartas.length));

// --- distribuição
{
  for (const n of [2, 4]) {
    const r = nova(n);
    assert.ok(r.maos.every((m) => m.length === 11));
    assert.equal(r.mortos.length, 2);
    assert.ok(r.mortos.every((m) => m.length === 11));
    assert.equal(r.monte.length, 104 - 11 * n - 22);
    assert.equal(contar(r), 104);
  }
  console.log('✔ distribuição: 11 cada, 2 mortos de 11');
}

// --- turno: comprar ou lixo, depois descartar; vez anda
{
  const r = nova(2);
  assert.throws(() => r.descartar(0, r.maos[0][0]), /compr/, 'descartar sem comprar');
  assert.throws(() => r.comprar(1), /vez/);
  r.comprar(0);
  assert.equal(r.maos[0].length, 12);
  assert.throws(() => r.comprar(0), /compr/, 'compra uma vez só');
  const c = r.maos[0][0];
  r.descartar(0, c);
  assert.deepEqual(r.lixo, [c]);
  assert.equal(r.vez, 1);
  r.pegarLixo(1);
  assert.equal(r.maos[1].length, 12);
  assert.equal(r.lixo.length, 0);
  assert.equal(contar(r), 104);
  console.log('✔ turno: compra/lixo, descarte, vez');
}

/** Rodada com mãos escolhidas; a próxima compra é `proxima` (se dada). O resto vira monte e mortos. */
function montar(maos, { proxima } = {}) {
  const r = nova(maos.length);
  const usadas = new Set([...maos.flat(), ...(proxima ? [proxima] : [])]);
  const resto = baralho().filter((c) => !usadas.has(c));
  r.maos = maos.map((m) => [...m]);
  r.mortos = [resto.splice(0, 11), resto.splice(0, 11)];
  r.monte = proxima ? [...resto, proxima] : resto;      // compra tira do fim
  return r;
}

// --- baixar e adicionar
{
  const r = montar([['4s0', '5s0', '6s0', '7s0', '9h0', 'Kd0'], ['3c0', '8c0', 'Jd1']]);
  r.comprar(0);
  r.baixar(0, ['4s0', '5s0', '6s0']);
  assert.equal(r.jogos[0].length, 1);
  assert.ok(!r.maos[0].includes('4s0'));
  r.adicionar(0, 0, ['7s0']);
  assert.deepEqual(r.jogos[0][0].cartas, ['4s0', '5s0', '6s0', '7s0']);
  assert.throws(() => r.adicionar(0, 0, ['9h0']), /inválid/);
  assert.throws(() => r.baixar(0, ['9h0', 'Kd0']), /inválid/);
  assert.throws(() => r.baixar(0, ['3c0', '4c0', '5c0']), /mão/, 'carta que não é sua');
  assert.throws(() => r.adicionar(0, 5, ['9h0']), /jogo/, 'jogo que não existe');
  console.log('✔ baixar e adicionar');
}

// --- morto indireto: esvaziou no descarte, pega o morto e a vez passa
{
  const r = montar([['4s0', '5s0', '6s0'], ['3c0', '8c0', 'Jd1']], { proxima: 'Kd1' });
  const morto = [...r.mortos[0]];
  r.comprar(0);
  r.baixar(0, ['4s0', '5s0', '6s0']);                   // sobra 1: pode, o morto está disponível
  r.descartar(0, 'Kd1');
  assert.deepEqual(r.maos[0], morto);
  assert.equal(r.pegouMorto[0], true);
  assert.equal(r.mortos.length, 1);
  assert.equal(r.vez, 1, 'indireto: a vez passa');
  console.log('✔ morto indireto');
}

// --- morto direto: esvaziou baixando, pega o morto e continua
{
  const r = montar([['4s0', '5s0', '6s0'], ['3c0', '8c0', 'Jd1']], { proxima: '7s0' });
  const morto = [...r.mortos[0]];
  r.comprar(0);
  r.baixar(0, ['4s0', '5s0', '6s0', '7s0']);
  assert.deepEqual(r.maos[0], morto);
  assert.equal(r.vez, 0, 'direto: continua jogando');
  assert.equal(r.fase, 'jogar');
  console.log('✔ morto direto');
}

// --- duplas: o morto é do time; o parceiro não pega o segundo
{
  const r = montar([['4s0', '5s0', '6s0'], ['3c0', '8c0', 'Jd1'], ['4h0', '5h0', '6h0'], ['9c0', 'Tc0', 'Qd0']], { proxima: '7s0' });
  r.comprar(0);
  r.baixar(0, ['4s0', '5s0', '6s0', '7s0']);
  assert.equal(r.pegouMorto[0], true);
  r.descartar(0, r.maos[0][0]);
  r.comprar(1); r.descartar(1, r.maos[1].at(-1));
  r.comprar(2);
  assert.throws(() => r.baixar(2, ['4h0', '5h0', '6h0']), /bater/, 'parceiro: morto do time já foi');
  console.log('✔ duplas: um morto por time');
}

// --- não pode esvaziar sem morto e sem canastra limpa
{
  const r = montar([['4s0', '5s0', '6s0'], ['3c0', '8c0', 'Jd1']], { proxima: 'Kd1' });
  r.pegouMorto[0] = true; r.mortos = [r.mortos[1]];
  r.comprar(0);
  assert.throws(() => r.baixar(0, ['4s0', '5s0', '6s0']), /bater/, 'sobraria 1 sem poder bater');
  assert.deepEqual(r.maos[0].length, 4, 'e a mão fica intacta');
  assert.equal(r.jogos[0].length, 0);
  console.log('✔ não esvazia sem poder bater');
}

// --- batida: morto pego + canastra limpa; fecha a rodada e pontua
{
  const r = montar([['8h0', 'Kc1'], ['3c0', '8c0', 'Jd1']], { proxima: '9h0' });
  r.pegouMorto = [true, true]; r.mortos = [];
  r.jogos[0].push(montarJogo(['Ah1', '2h1', '3h1', '4h1', '5h1', '6h1', '7h1']));
  r.jogos[1].push(montarJogo(['9d0', 'Td0', 'Jd0']));
  r.comprar(0);
  r.adicionar(0, 0, ['8h0', '9h0']);
  r.descartar(0, 'Kc1');
  assert.ok(r.fim, 'bateu: rodada encerrada');
  assert.equal(r.fim.bateu, 0);
  const [t0, t1] = r.fim.times;
  // time 0: A(15) 2(10) 3..7 (5×5) 8(10) 9(10) = 70 na mesa, canastra limpa 200, batida 100
  assert.equal(t0.mesa, 70);
  assert.equal(t0.canastras, 200);
  assert.equal(t0.batida, 100);
  assert.equal(t0.total, 370);
  // time 1: 9-10-J♦ = 30 na mesa, mão 3c0 8c0 Jd1 = 25 contra
  assert.equal(t1.mesa, 30);
  assert.equal(t1.mao, 25);
  assert.equal(t1.total, 5);
  console.log('✔ batida e pontuação');
}

// --- canastra suja vale 100 e não deixa bater
{
  const r = montar([['8h0', 'Kc1'], ['3c0', '8c0', 'Jd1']], { proxima: '9h0' });
  r.pegouMorto = [true, true]; r.mortos = [];
  r.jogos[0].push(montarJogo(['Ah1', '2c1', '3h1', '4h1', '5h1', '6h1', '7h1']));   // 2♣ curinga
  assert.equal(r.jogos[0][0].limpa, false);
  r.comprar(0);
  assert.throws(() => r.adicionar(0, 0, ['8h0', '9h0']), /bater/, 'só canastra suja: não deixa ficar com 1 pra bater');
  r.adicionar(0, 0, ['8h0']);                            // ficando com 2, pode
  assert.throws(() => r.descartar(0, 'Kc1') || r.descartar(0, '9h0'), /vez|compre/, 'descarta uma e a vez passa');
  console.log('✔ canastra suja não bate');
}

// --- monte acaba: morto vira monte; sem monte e sem morto: rodada acaba, morto perdido -100
{
  const r = montar([['8h0'], ['3c0']]);
  r.monte = [];
  r.comprar(0);
  assert.equal(r.mortos.length, 1, 'um morto virou monte');
  assert.equal(r.maos[0].length, 2);
  r.monte = []; r.mortos = [];
  r.descartar(0, '8h0');
  r.comprar(1);
  assert.ok(r.fim, 'sem monte e sem morto: acabou');
  assert.equal(r.fim.bateu, null);
  assert.equal(r.fim.times[0].morto, -100);
  assert.equal(r.fim.times[1].morto, -100);
  console.log('✔ fim por monte, morto perdido');
}

// --- ação inválida não muda nada
{
  const r = nova(2);
  r.comprar(0);
  const antes = JSON.stringify(r);
  for (const f of [() => r.baixar(0, ['xx']), () => r.baixar(0, null), () => r.adicionar(0, 'a', []), () => r.descartar(0, 'Zz9'),
    () => r.pegarLixo(0), () => r.descartar(1, r.maos[1][0])]) assert.throws(f);
  assert.equal(JSON.stringify(r), antes);
  console.log('✔ ação inválida recusada sem efeito');
}

// --- 300 rodadas aleatórias: conservação e nada trava
{
  for (let seed = 1; seed <= 300; seed++) {
    const n = seed % 2 ? 2 : 4;
    const r = nova(n, seed);
    const rng = mulberry32(seed * 7);
    let passos = 0;
    while (!r.fim && passos++ < 3000) {
      const s = r.vez;
      if (r.fase === 'comprar') { if (r.lixo.length && rng() < 0.3) r.pegarLixo(s); else r.comprar(s); continue; }
      const mao = r.maos[s];
      for (let i = 0; i < mao.length && rng() < 0.9; i++) {
        const tentar = mao.filter((c) => c[1] === mao[i][1]).slice(0, 3 + Math.floor(rng() * 3));
        try { if (tentar.length >= 3) r.baixar(s, tentar); } catch { /* inválido */ }
        if (r.fim || r.vez !== s) break;
      }
      if (r.fim || r.vez !== s || r.fase !== 'jogar') continue;
      let foi = false;
      for (const c of [...r.maos[s]].sort(() => rng() - 0.5)) { try { r.descartar(s, c); foi = true; break; } catch { /* não pode esvaziar */ } }
      assert.ok(foi || r.fim, `seed ${seed}: alguém ficou sem descarte possível`);
      assert.equal(contar(r), 104, `seed ${seed}: cartas conservadas`);
    }
    assert.ok(r.fim, `seed ${seed}: a rodada termina`);
  }
  console.log('✔ 300 rodadas aleatórias: conservação e fim');
}
