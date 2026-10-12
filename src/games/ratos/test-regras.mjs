// node src/games/ratos/test-regras.mjs
import assert from 'node:assert/strict';
import * as R from './regras.js';

const T0 = 1_000_000;
function rodar(p, de, ate) {
  const ev = [];
  for (let t = de; t <= ate; t += R.TICK_MS) { R.passo(p, t); ev.push(...p.eventos); }
  return ev;
}
const jogando = (n = 2, cores) => { const p = R.novaPartida(T0, n, cores); R.passo(p, T0 + R.CONTAGEM); return p; };
const T = T0 + R.CONTAGEM;

// --- cores: a pedida, repetida vai pra primeira livre, até 4
{
  const p = R.novaPartida(T0, 4, ['verde', 'verde', 'xpto']);
  assert.equal(p.cores[0], 'verde');
  assert.equal(new Set(p.cores).size, 4, 'ninguém repete');
  assert.equal(R.novaPartida(T0, 9).ratos.length, 4);
  for (const [x, y] of R.NASCER) assert.ok(y === R.CHAO || R.PLATAFORMAS.some(([a, b, top]) => top === y && x > a && x < b), `nasce em cima de algo (${x},${y})`);
}
console.log('✔ cores e nascimento');

// --- gravidade, pulo, pulo duplo, plataforma de um lado só
{
  const p = jogando();
  const r = p.ratos[0];
  Object.assign(r, { x: 120, y: R.CHAO - 120, vy: 0, chao: false });
  rodar(p, T, T + 1500);
  assert.equal(r.y, R.CHAO, 'cai até o chão');
  assert.ok(r.chao);
  // pula por baixo da plataforma (70..350, topo 478) e fica em cima dela
  Object.assign(r, { x: 300, y: R.CHAO, vy: 0, chao: true, pulos: 0 });
  R.mover(p, 0, { mx: 0, pulo: true }, 0.033);
  for (let k = 0; k < 60; k++) R.mover(p, 0, { mx: 0, pulo: k === 8 }, 0.033);   // pulo duplo no meio do caminho
  assert.equal(r.y, 478, 'subiu por baixo e parou em cima');
  // segurando pra baixo, atravessa
  for (let k = 0; k < 40; k++) R.mover(p, 0, { mx: 0, desce: k < 3 }, 0.033);
  assert.equal(r.y, R.CHAO, 'desceu pela plataforma');
  // pulo triplo não existe
  Object.assign(r, { y: R.CHAO, vy: 0, chao: true, pulos: 0 });
  R.mover(p, 0, { mx: 0, pulo: true }, 0.033);
  R.mover(p, 0, { mx: 0, pulo: true }, 0.033);
  const vy = r.vy;
  R.mover(p, 0, { mx: 0, pulo: true }, 0.033);
  assert.ok(r.vy > vy, 'terceiro pulo não dá impulso');
}
console.log('✔ gravidade, pulo duplo e plataforma');

// --- caixa segura de lado
{
  const p = jogando();
  const r = p.ratos[0];
  Object.assign(r, { x: 330, y: R.CHAO, vy: 0, chao: true });
  for (let k = 0; k < 40; k++) R.mover(p, 0, { mx: 1 }, 0.033);
  assert.ok(r.x <= 380 - R.RATOS.azul.w / 2 + 0.01, `não atravessa a caixa (${r.x})`);
}
console.log('✔ caixa segura');

// --- tiro acerta, dá dano e empurra; protegido não leva
{
  const p = jogando(2, ['azul', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 480, y: R.CHAO, protegidoAte: 0 });
  Object.assign(b, { x: 760, y: R.CHAO, protegidoAte: 0 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, T, T + 600);
  const acertos = ev.filter((e) => e.tipo === 'acerto' && e.alvo === 1);
  assert.ok(acertos.length >= 2, 'fuzil acerta várias');
  assert.equal(b.vida, R.RATOS.vermelho.vida - acertos.reduce((s, e) => s + e.dano, 0));
  assert.ok(b.x > 760, 'empurrou');
  assert.ok(p.dano[0] > 0);
  b.protegidoAte = T + 99_999;
  const v = b.vida;
  rodar(p, T + 633, T + 1200);
  assert.equal(b.vida, v, 'protegido não leva dano');
}
console.log('✔ tiro, dano, empurrão e proteção');

// --- escopeta abre em leque; sniper mata o rato magro em 2
{
  const p = jogando(2, ['vermelho', 'verde']);
  R.entrada(p, 0, { ang: 0, fogo: true });
  Object.assign(p.ratos[0], { x: 160, y: R.CHAO }); Object.assign(p.ratos[1], { x: 1100, y: 262 });
  R.passo(p, T + 33);
  assert.equal(p.balas.length, R.RATOS.vermelho.balas);
  assert.ok(new Set(p.balas.map((b) => Math.round(b.vy))).size > 3, 'leque');
}
{
  const p = jogando(2, ['verde', 'azul']);
  Object.assign(p.ratos[0], { x: 490, y: 372 }); Object.assign(p.ratos[1], { x: 790, y: 372, protegidoAte: 0 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = [];
  for (let t = T; t <= T + 1300; t += R.TICK_MS) {
    if (p.ratos[1].vivo) Object.assign(p.ratos[1], { x: 790, y: 372, kx: 0, vy: 0 });   // o empurrão derrubaria da plataforma
    R.passo(p, t); ev.push(...p.eventos);
  }
  assert.equal(ev.find((e) => e.tipo === 'acerto').dano, 55);
  assert.ok(ev.some((e) => e.tipo === 'abate' && e.alvo === 1 && e.de === 0), 'sniper derruba em 2');
  assert.equal(p.abates[0], 1);
  assert.equal(p.mortes[1], 1);
}
console.log('✔ escopeta e sniper');

// --- abatido renasce longe, protegido, de vida cheia
{
  const p = jogando();
  const b = p.ratos[1];
  Object.assign(b, { x: 300, y: R.CHAO, protegidoAte: 0 });
  b.vida = 1;
  Object.assign(p.ratos[0], { x: 200, y: R.CHAO });
  R.entrada(p, 0, { ang: 0, fogo: true });
  rodar(p, T, T + 300);
  assert.equal(b.vivo, false);
  R.entrada(p, 0, { ang: 0, fogo: false });
  const ev = rodar(p, T + 333, T + 333 + R.RENASCER + 100);
  assert.ok(ev.some((e) => e.tipo === 'renasce' && e.i === 1));
  assert.ok(b.vivo && b.vida === R.RATOS[p.cores[1]].vida);
  assert.ok(Math.hypot(b.x - p.ratos[0].x, b.y - p.ratos[0].y) > 300, 'nasce longe de quem está vivo');
  assert.ok(b.protegidoAte > p.ultimo);
}
console.log('✔ renascer');

// --- barril estoura e machuca em área; volta depois
{
  const p = jogando();
  const [bx, by] = R.BARRIS[0];
  Object.assign(p.ratos[1], { x: bx + 50, y: by, protegidoAte: 0 });
  Object.assign(p.ratos[0], { x: 470, y: 372 });
  R.entrada(p, 0, { ang: Math.atan2(by - 20 - (372 - 62 * 0.52), bx - (470 + 17 + 18)), fogo: true });   // da boca da arma ao meio do barril
  const ev = rodar(p, T, T + 500);
  assert.ok(ev.some((e) => e.tipo === 'explosao'), 'estourou');
  assert.ok(p.ratos[1].vida < R.RATOS[p.cores[1]].vida, 'perto levou');
  assert.ok(p.barris[0] > 0);
  R.entrada(p, 0, { fogo: false });
  rodar(p, T + 533, T + 533 + R.BARRIL.volta + 100);
  assert.equal(p.barris[0], 0, 'voltou');
}
console.log('✔ barril');

// --- itens: sempre dá pra pegar (queijo vale ponto mesmo de vida cheia), área folgada
{
  const p = jogando();
  const it = R.ITENS[0];
  const r = p.ratos[0];
  Object.assign(r, { x: it.x + 24, y: it.y, vy: 0, chao: true });   // nem precisa estar em cima
  const ev = rodar(p, T + 33, T + 99);
  assert.ok(ev.some((e) => e.tipo === 'pega' && e.item === 'queijo'), 'vida cheia pega queijo');
  assert.equal(p.queijos[0], 1, 'queijo conta ponto');
  assert.ok(p.pegos[it.id] > 0, 'some até voltar');
  r.vida = 40;
  const kit = R.ITENS.find((x) => x.tipo === 'kit');
  Object.assign(r, { x: kit.x, y: kit.y, vy: 0, chao: true });
  rodar(p, T + 132, T + 200);
  assert.equal(r.vida, R.RATOS[p.cores[0]].vida, 'kit enche a vida');
  assert.equal(p.queijos[0], 1, 'kit não conta queijo');
  R.passo(p, T + 200 + it.volta + 50);
  assert.equal(p.pegos[it.id], undefined, 'o queijo volta');
}
console.log('✔ itens');

// --- mapa que sobe: igual pra mesma semente, alcançável, e segura o rato
{
  const a = R.fileira(42, 7), b = R.fileira(42, 7);
  assert.deepEqual(a, b, 'mesma semente, mesma fileira');
  assert.notDeepEqual(R.fileira(42, 7).plataformas, R.fileira(43, 7).plataformas, 'outra semente, outro mapa');
  let queijos = 0;
  for (let j = 1; j <= 60; j++) {
    const f = R.fileira(42, j);
    assert.ok(f.plataformas.length >= 2, `fileira ${j} tem plataforma`);
    for (const [x0, x1] of f.plataformas) assert.ok(x0 >= 0 && x1 <= R.LARGURA && x1 - x0 >= 120, `fileira ${j} dentro da arena`);
    queijos += f.itens.filter((i) => i.tipo === 'queijo').length;
  }
  assert.ok(queijos > 20, `tem queijo pelo caminho (${queijos} em 60 fileiras)`);
  // pulo duplo alcança a próxima fileira
  const alcance = R.PULO ** 2 / (2 * R.GRAVIDADE) + R.PULO_DUPLO ** 2 / (2 * R.GRAVIDADE);
  assert.ok(R.ALTURA_FILEIRA < alcance * 0.75, 'fileiras ao alcance do pulo duplo');
  // rato cai numa plataforma gerada e fica nela
  const p = jogando();
  const [x0, x1, top] = R.fileira(p.seed, 5).plataformas[0];
  Object.assign(p.ratos[0], { x: (x0 + x1) / 2, y: top - 80, vy: 0, chao: false });
  rodar(p, T, T + 600);
  assert.equal(p.ratos[0].y, top, 'parou na plataforma gerada');
  assert.equal(R.estadoPara(p, 0).seed, p.seed, 'a semente vai pro cliente');
}
console.log('✔ mapa que sobe');

// --- desempate: ninguém matou ninguém, mais queijo leva
{
  const p = jogando(3);
  p.queijos = [2, 5, 1]; p.dano = [900, 0, 0];
  R.passo(p, p.fimEm + 1);
  assert.deepEqual(p.fim, { vencedor: 1, motivo: 'queijo' });
}
// --- quem morre renasce perto da altura dos outros, não lá embaixo
{
  const p = jogando(2);
  const alto = R.fileira(p.seed, 12).plataformas[0];
  Object.assign(p.ratos[0], { x: (alto[0] + alto[1]) / 2, y: alto[2], vy: 0, chao: true });
  Object.assign(p.ratos[1], { vivo: false, renasceEm: T + 50 });
  rodar(p, T, T + 200);
  assert.ok(p.ratos[1].vivo && Math.abs(p.ratos[1].y - alto[2]) <= 300, `renasceu lá em cima (${p.ratos[1].y} perto de ${alto[2]})`);
}
console.log('✔ desempate por queijo e renascer no alto');

// --- 10 abates fecham a partida; tempo esgotado decide por abates, depois dano
{
  const p = jogando(3);
  p.abates[2] = R.ABATES_VITORIA - 1;
  Object.assign(p.ratos[2], { x: 200, y: R.CHAO }); Object.assign(p.ratos[0], { x: 420 - 60, y: R.CHAO, protegidoAte: 0, vida: 1 });
  p.ratos[2].x = 250;
  R.entrada(p, 2, { ang: 0, fogo: true });
  rodar(p, T, T + 400);
  assert.deepEqual(p.fim, { vencedor: 2, motivo: 'abates' });
}
{
  const p = jogando(3);
  p.abates = [3, 3, 1]; p.queijos = [2, 2, 0]; p.dano = [100, 250, 900];
  R.passo(p, p.fimEm + 1);
  assert.deepEqual(p.fim, { vencedor: 1, motivo: 'dano' }, 'empate em abates, mais dano entre os empatados');
}
{
  const p = jogando(2);
  R.passo(p, p.fimEm + 1);
  assert.equal(p.fim.vencedor, null, 'nada de nada: empate');
}
console.log('✔ fim por abates, tempo e dano');

// --- saiu: some; sobrou um, leva
{
  const p = jogando(3);
  R.eliminar(p, 1);
  assert.equal(p.fim, null);
  R.eliminar(p, 2);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ W.O.');

// --- comandos: previsão igual ao servidor, teto de velocidade, contagem parada
{
  const p = jogando();
  const cmds = Array.from({ length: 12 }, (_, k) => ({ s: k + 1, mx: 1, pulo: k === 2, desce: false, dt: 33, ang: 0 }));
  const sombra = { ...p, ratos: p.ratos.map((r) => ({ ...r })), barris: [...p.barris] };
  for (const c of cmds) R.mover(sombra, 0, c, c.dt / 1000);
  R.entrada(p, 0, { cmds });
  rodar(p, T, T + 500);
  assert.equal(p.ack[0], 12);
  assert.ok(Math.abs(p.ratos[0].x - sombra.ratos[0].x) < 1e-9 && Math.abs(p.ratos[0].y - sombra.ratos[0].y) < 1e-9, 'previsão = servidor');
}
{
  const p = jogando();
  const x0 = p.ratos[0].x;
  R.entrada(p, 0, { cmds: Array.from({ length: 60 }, (_, k) => ({ s: k + 1, mx: 1, dt: 999 })) });
  assert.equal(p.fila[0].length, R.FILA_MAX);
  rodar(p, T, T + 100);
  assert.ok(p.ratos[0].x - x0 <= R.RATOS[p.cores[0]].vel * 0.16 + 1, 'não anda mais que o tempo real');
}
{
  const p = R.novaPartida(T0);
  const x0 = p.ratos[0].x;
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 1, dt: 33 }] });
  R.passo(p, T0 + 100);
  assert.equal(p.ack[0], 1);
  assert.equal(p.ratos[0].x, x0, 'contagem: ninguém anda');
}
console.log('✔ comandos');

{
  const e = R.estadoPara(jogando(4), 0, 1);
  assert.equal(e.r.length, 4);
  assert.ok(JSON.stringify(e).length < 4000, 'pacote pequeno');
}
// --- headshot: bala na cabeça mata na hora, até a metralhadora; no corpo, não
{
  const p = jogando(2, ['roxo', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 490, y: 372 });
  Object.assign(b, { x: 790, y: 372, protegidoAte: 0 });
  const k = R.RATOS.vermelho;
  const cabecaY = 372 - k.h + k.h * R.CABECA * 0.5;          // meio da cabeça do Bolota
  const boca = { x: 490 + R.RATOS.roxo.w / 2 + 18, y: 372 - R.RATOS.roxo.h * 0.52 };
  R.entrada(p, 0, { ang: Math.atan2(cabecaY - boca.y, 790 - boca.x), fogo: true });
  const ev = [];
  for (let t = T; t <= T + 600 && b.vivo; t += R.TICK_MS) { Object.assign(b, { x: 790, y: 372, kx: 0, vy: 0 }); R.passo(p, t); ev.push(...p.eventos); }
  const hs = ev.find((e) => e.tipo === 'acerto' && e.cabeca);
  assert.ok(hs, 'acertou a cabeça');
  assert.equal(hs.dano, k.vida, 'tira a vida toda');
  assert.ok(ev.some((e) => e.tipo === 'abate' && e.cabeca && e.de === 0), 'abate de headshot');
}
{
  const p = jogando(2, ['azul', 'vermelho']);   // fuzil: quase não espalha (a metralhadora às vezes sobe até a cabeça)
  Object.assign(p.ratos[0], { x: 490, y: 372 }); Object.assign(p.ratos[1], { x: 790, y: 372, protegidoAte: 0 });
  R.entrada(p, 0, { ang: 0, fogo: true });                    // reto: na altura da barriga
  const ev = rodar(p, T, T + 400);
  assert.ok(ev.some((e) => e.tipo === 'acerto') && !ev.some((e) => e.cabeca), 'tiro reto pega o corpo');
  assert.ok(p.ratos[1].vivo);
}
console.log('✔ headshot');
// --- bomba: planta no chão, arma, dono passa, outro pisa e explode
{
  const p = jogando(2, ['azul', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 600, y: 372, vy: 0, chao: true });
  Object.assign(b, { x: 1100, y: 262, protegidoAte: 0 });
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 0, dt: 33, bomba: true }] });
  let ev = rodar(p, T, T + 100);
  assert.ok(ev.some((e) => e.tipo === 'bomba' && e.i === 0), 'plantou');
  assert.equal(p.bombas.length, 1);
  const bm = p.bombas[0];
  assert.equal(bm.x, 600); assert.equal(bm.y, 372);
  // dono pisa: nada
  ev = rodar(p, T + 133, T + 133 + R.BOMBA.arma + 200);
  assert.equal(p.bombas.length, 1, 'quem plantou passa por cima');
  // outro pisa (antes de armar não conta: já armou aqui)
  Object.assign(a, { x: 300 });
  Object.assign(b, { x: 600, y: 372, vy: 0, chao: true });
  ev = rodar(p, T + 1200, T + 1300);
  assert.ok(ev.some((e) => e.tipo === 'explosao' && e.bomba), 'pisou, explodiu');
  assert.equal(p.bombas.length, 0);
  assert.ok(b.vida < R.RATOS.vermelho.vida, 'quem pisou perdeu vida');
  assert.ok(b.vy < 0 || !b.vivo, 'e voou');
  assert.ok(p.dano[0] > 0, 'dano conta pra quem plantou');
}
{
  // bomba ainda não armada: pisar não detona
  const p = jogando(2, ['azul', 'verde']);
  Object.assign(p.ratos[0], { x: 600, y: 372, vy: 0, chao: true });
  Object.assign(p.ratos[1], { x: 600, y: 372, protegidoAte: 0 });
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 0, dt: 33, bomba: true }] });
  rodar(p, T, T + 300);
  assert.equal(p.bombas.length, 1, 'não armada não detona');
}
{
  // abate de bomba conta pro dono; limite de 2; recarga
  const p = jogando(2, ['azul', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 600, y: R.CHAO, vy: 0, chao: true });
  const cmds = [];
  for (let k = 0; k < 4; k++) cmds.push({ s: k + 1, mx: 0, dt: 33, bomba: true });
  R.entrada(p, 0, { cmds });
  rodar(p, T, T + 200);
  assert.equal(p.bombas.length, 1, 'recarga: uma por vez');
  R.entrada(p, 0, { cmds: [{ s: 10, mx: 0, dt: 33, bomba: true }] });
  Object.assign(a, { x: 900 });
  rodar(p, T + R.BOMBA.recarga + 300, T + R.BOMBA.recarga + 400);
  R.entrada(p, 0, { cmds: [{ s: 11, mx: 0, dt: 33, bomba: true }] });
  Object.assign(a, { x: 1000 });
  rodar(p, T + 2 * R.BOMBA.recarga + 500, T + 2 * R.BOMBA.recarga + 600);
  assert.equal(p.bombas.length, R.BOMBA.max, 'no máximo 2');
  b.vida = 5;
  Object.assign(b, { x: 600, y: R.CHAO, vy: 0, chao: true, protegidoAte: 0 });
  const ev = rodar(p, T + 7000, T + 7100);
  assert.ok(ev.some((e) => e.tipo === 'abate' && e.alvo === 1 && e.de === 0), 'abate de bomba é de quem plantou');
  assert.equal(p.abates[0], 1);
}
{
  // tiro detona; no ar não planta; some sozinha
  const p = jogando(2, ['azul', 'verde']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 700, y: 372, vy: 0, chao: true });
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 0, dt: 33, bomba: true }] });
  rodar(p, T, T + 100);
  Object.assign(a, { x: 300, y: R.CHAO });
  Object.assign(b, { x: 520, y: 372, vy: 0, chao: true });
  const boca = { x: 520 + R.RATOS.verde.w / 2 + 18, y: 372 - R.RATOS.verde.h * 0.52 };
  R.entrada(p, 1, { ang: Math.atan2(372 - 12 - boca.y, 700 - boca.x), fogo: true });
  const ev = rodar(p, T + 133, T + 600);
  assert.ok(ev.some((e) => e.tipo === 'explosao' && e.bomba), 'tiro detona a bomba');
  const q = jogando(2);
  Object.assign(q.ratos[0], { x: 600, y: 200, vy: 0, chao: false });
  R.entrada(q, 0, { cmds: [{ s: 1, mx: 0, dt: 33, bomba: true }] });
  R.passo(q, T + 33);
  assert.equal(q.bombas.length, 0, 'no ar não planta');
  Object.assign(q.ratos[0], { x: 600, y: R.CHAO, vy: 0, chao: true });
  R.entrada(q, 0, { cmds: [{ s: 2, mx: 0, dt: 33, bomba: true }] });
  R.passo(q, T + 66);
  assert.equal(q.bombas.length, 1);
  R.passo(q, T + 66 + R.BOMBA.dura + 10);
  assert.equal(q.bombas.length, 0, 'some sozinha');
  assert.ok(Array.isArray(R.estadoPara(p, 0).bm), 'bombas vão no estado');
}
console.log('✔ bombas');
console.log('ratos: regras ok');
