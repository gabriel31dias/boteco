// node src/games/tanque/test-regras.mjs
import assert from 'node:assert/strict';
import * as R from './regras.js';

const T0 = 1_000_000;
/** Roda a simulação de `de` até `ate` em passos de 33ms; devolve os eventos todos. */
function rodar(p, de, ate) {
  const ev = [];
  for (let t = de; t <= ate; t += R.TICK_MS) { R.passo(p, t); ev.push(...p.eventos); }
  return ev;
}
const jogando = () => { const p = R.novaPartida(T0); R.passo(p, T0 + R.CONTAGEM); return p; };

// --- mapa: dentro da arena, sem sobreposição, nascimento livre
for (const o of R.MAPA) {
  assert.ok(o.x - o.w / 2 >= 0 && o.x + o.w / 2 <= R.LARGURA && o.y - o.h / 2 >= 0 && o.y + o.h / 2 <= R.ALTURA, `${o.tipo} fora da arena`);
}
for (const [i, a] of R.MAPA.entries()) {
  if (a.fixo) continue;   // o que vem no fundo pode encostar; o que quebra, não
  for (const b of R.MAPA.slice(i + 1)) {
    const sobre = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
    assert.ok(!sobre, `${a.tipo}@${a.x},${a.y} sobre ${b.tipo}@${b.x},${b.y}`);
  }
}
{
  const p = jogando();
  for (const [i, t] of p.tanques.entries()) assert.ok(R.livre(p, t.x, t.y, i), `assento ${i} nasce encostado`);
  // pontos que os testes abaixo usam: livres no mapa
  for (const [x, y] of [[850, 330], [1030, 330], [260, 190], [990, 187], [1060, 420], [820, 420]]) {
    assert.ok(R.livre(p, x, y, 0), `(${x},${y}) livre`);
  }
}
console.log('✔ mapa');

// --- contagem: ninguém anda nem atira antes do "fogo"
{
  const p = R.novaPartida(T0);
  R.entrada(p, 0, { mx: 1, my: 0, ang: 0, fogo: true });
  rodar(p, T0, T0 + R.CONTAGEM - 100);
  assert.equal(p.tanques[0].x, R.NASCER[0].x);
  assert.equal(p.balas.length, 0);
  const ev = rodar(p, T0 + R.CONTAGEM, T0 + R.CONTAGEM + 100);
  assert.ok(ev.some((e) => e.tipo === 'fogo') && ev.some((e) => e.tipo === 'tiro'));
}
console.log('✔ contagem');

// --- entrada: lixo não quebra nada, vetor é normalizado
{
  const p = jogando();
  assert.ok(R.entrada(p, 0, { mx: 5, my: 5, ang: 'x', fogo: 'sim' }));
  const e = p.tanques[0].entrada;
  assert.ok(Math.abs(Math.hypot(e.mx, e.my) - 1) < 1e-9 && e.fogo === false && Number.isFinite(e.ang));
  assert.equal(R.entrada(p, 5, {}), null, 'assento que não existe');
}
console.log('✔ entrada');

// --- tiro acerta o outro tanque e dá dano; recarga segura a metralhadora
{
  const p = jogando();
  const t1 = p.tanques[1];
  Object.assign(p.tanques[0], { x: 850, y: 330 });   // areia aberta da direita: limpo até o outro
  Object.assign(t1, { x: 1030, y: 330 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const t = T0 + R.CONTAGEM;
  const ev = rodar(p, t, t + 560);
  assert.equal(ev.filter((e) => e.tipo === 'tiro').length, 2, 'recarga de 500ms: 2 tiros em 560ms (passos de 33ms)');
  const acertos = ev.filter((e) => e.tipo === 'acerto');
  assert.ok(acertos.length >= 1 && acertos[0].alvo === 1 && acertos[0].dano === R.DANO_BALA);
  assert.equal(t1.vida, R.VIDA - R.DANO_BALA * acertos.length);
  assert.equal(p.dano[0], R.DANO_BALA * acertos.length);
}
console.log('✔ tiro, dano e recarga');

// --- caixa quebra em 2 tiros; pedra segura bala pra sempre
{
  const p = jogando();
  const ic = R.MAPA.findIndex((o) => o.tipo === 'caixa');
  const c = R.MAPA[ic];
  Object.assign(p.tanques[0], { x: c.x - 120, y: c.y });
  Object.assign(p.tanques[1], { x: 1000, y: 600 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const t = T0 + R.CONTAGEM;
  const ev = rodar(p, t, t + 1200);
  const cx = ev.filter((e) => e.tipo === 'caixa' && e.i === ic);
  assert.deepEqual(cx.map((e) => e.vida).slice(0, 2), [1, 0], 'rachou e quebrou');
  assert.equal(p.obstaculos[ic], 0);
}
{
  const p = jogando();
  const ip = R.MAPA.findIndex((o) => o.fixo && !o.agua && Math.abs(1097 - o.x) < o.w / 2 && Math.abs(187 - o.y) < o.h / 2);
  assert.ok(R.MAPA[ip], "bloco fixo em (1097,187)");
  Object.assign(p.tanques[0], { x: 990, y: 187 });
  Object.assign(p.tanques[1], { x: 1000, y: 600 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const t = T0 + R.CONTAGEM;
  const ev = rodar(p, t, t + 1500);
  assert.ok(ev.filter((e) => e.tipo === 'impacto').length >= 2);
  assert.equal(p.obstaculos[ip], null);
}
console.log('✔ caixa quebra, pedra segura');

// --- barril: explode, machuca quem está perto e não quem está longe
{
  const p = jogando();
  const ib = R.MAPA.findIndex((o) => o.tipo === 'barril' && o.x === 1000 && o.y === 380);
  const b = R.MAPA[ib];
  Object.assign(p.tanques[1], { x: b.x + 60, y: b.y + 40 });   // perto do barril
  Object.assign(p.tanques[0], { x: 820, y: 420 });             // longe, com linha de tiro limpa
  R.entrada(p, 0, { ang: Math.atan2(b.y - p.tanques[0].y, b.x - p.tanques[0].x), fogo: true });
  const t = T0 + R.CONTAGEM;
  const ev = rodar(p, t, t + 400);
  assert.ok(ev.some((e) => e.tipo === 'explosao' && e.x === b.x));
  assert.equal(p.obstaculos[ib], 0);
  assert.ok(p.tanques[1].vida < R.VIDA, 'perto leva dano');
  assert.equal(p.tanques[0].vida, R.VIDA, 'longe não');
}
console.log('✔ barril explode em área');

// --- parede segura o tanque
{
  const p = jogando();
  const pd = R.MAPA.find((o) => o.fixo && !o.agua && Math.abs(1097 - o.x) < o.w / 2 && Math.abs(187 - o.y) < o.h / 2);
  Object.assign(p.tanques[0], { x: pd.x - pd.w / 2 - R.RAIO_TANQUE - 5, y: 187 });
  Object.assign(p.tanques[1], { x: 1000, y: 600 });
  R.entrada(p, 0, { mx: 1, my: 0, ang: 0 });
  const t = T0 + R.CONTAGEM;
  rodar(p, t, t + 1000);
  assert.ok(p.tanques[0].x <= pd.x - pd.w / 2 - R.RAIO_TANQUE + 0.01, 'não atravessa a pedra');
}
console.log('✔ parede segura o tanque');

// --- abate fecha a rodada; 2 rodadas fecham a partida
{
  const p = jogando();
  let t = T0 + R.CONTAGEM;
  for (let rodada = 1; rodada <= 2; rodada++) {
    p.tanques[1].vida = R.DANO_BALA;            // um tiro e acabou
    Object.assign(p.tanques[0], { x: 850, y: 330 });
    Object.assign(p.tanques[1], { x: 1030, y: 330 });
    R.entrada(p, 0, { ang: 0, fogo: true });
    const ev = rodar(p, t, t + 600);
    assert.ok(ev.some((e) => e.tipo === 'abate' && e.alvo === 1));
    assert.equal(p.fase, 'fim-rodada');
    t += 600 + R.PAUSA_FIM_RODADA + 100;
    rodar(p, t - R.PAUSA_FIM_RODADA, t);
    if (rodada === 1) {
      assert.equal(p.rodada, 2);
      assert.equal(p.fase, 'contagem');
      assert.equal(p.tanques[1].vida, R.VIDA, 'rodada nova: vida cheia');
      t += R.CONTAGEM + 100;
      R.passo(p, t);
      assert.equal(p.fase, 'jogo');
    }
  }
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'placar' });
  assert.deepEqual(p.placar, [2, 0]);
}
console.log('✔ rodada e partida');

// --- relógio zerou: leva quem tem mais vida
{
  const p = jogando();
  p.tanques[0].vida = 40;
  const t = p.rodadaAte;
  R.passo(p, t + 10);
  assert.equal(p.fase, 'fim-rodada');
  assert.equal(p.vencedorRodada, 1);
}
console.log('✔ tempo esgotado');

// --- estado pro cliente: só números e o que ele precisa
{
  const p = jogando();
  const e = R.estadoPara(p, 1, 123);
  assert.equal(e.assento, 1);
  assert.equal(e.t.length, 2);
  assert.equal(e.o.length, R.MAPA.length);
  assert.ok(JSON.stringify(e).length < 3000, 'pacote pequeno (vai 30x por segundo)');
}
console.log('✔ estado');
// --- comandos numerados: o servidor aplica, confirma, e a previsão do cliente bate
{
  const p = jogando();
  const t = R.CONTAGEM + T0;
  const cmds = Array.from({ length: 10 }, (_, k) => ({ s: k + 1, mx: 1, my: 0, dt: 33, ang: 0, fogo: false }));
  // previsão: a mesma conta, numa cópia
  const sombra = { tanques: p.tanques.map((x) => ({ ...x })), obstaculos: p.obstaculos };
  for (const c of cmds) R.mover(sombra, 0, c.mx, c.my, c.dt / 1000);
  R.entrada(p, 0, { cmds });
  rodar(p, t, t + 400);
  assert.equal(p.ack[0], 10, 'todos aplicados e confirmados');
  assert.ok(Math.abs(p.tanques[0].x - sombra.tanques[0].x) < 1e-9, 'previsão = servidor');
  assert.equal(R.estadoPara(p, 0).t[0][6], 10, 'ack vai no estado');
  // repetido e fora de ordem não andam de novo
  const x = p.tanques[0].x;
  R.entrada(p, 0, { cmds: cmds.slice(3) });
  rodar(p, t + 433, t + 600);
  assert.equal(p.tanques[0].x, x);
}
{
  // trapaça de velocidade: 40 comandos de 50ms de uma vez não andam 2s em 100ms
  const p = jogando();
  const t = R.CONTAGEM + T0;
  const x0 = p.tanques[0].x;
  R.entrada(p, 0, { cmds: Array.from({ length: 60 }, (_, k) => ({ s: k + 1, mx: 1, my: 0, dt: 999, ang: 0 })) });
  assert.equal(p.fila[0].length, R.FILA_MAX, 'fila tem teto');
  assert.ok(p.fila[0].every((c) => c.dt === R.CMD_MS_MAX), 'dt tem teto');
  rodar(p, t, t + 100);
  assert.ok(p.tanques[0].x - x0 <= R.VEL_TANQUE * 0.16 + 1, `andou só o que o tempo real deixa (${(p.tanques[0].x - x0).toFixed(1)})`);
}
{
  // contagem: comando chega, é confirmado, e ninguém sai do lugar
  const p = R.novaPartida(T0);
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 1, my: 0, dt: 33, ang: 1 }, { s: 2, mx: 1, my: 0, dt: 33, ang: 1 }] });
  R.passo(p, T0 + 100);
  assert.equal(p.ack[0], 2);
  assert.equal(p.tanques[0].x, R.NASCER[0].x);
  assert.equal(p.fila[0].length, 0);
}
console.log('✔ comandos: confirmação, previsão igual, teto de velocidade e contagem');
// --- 4 jogadores, cada um por si
{
  const p = R.novaPartida(T0, 4, ['verde', 'azul', 'xpto']);
  assert.equal(p.cores[0], 'verde'); assert.equal(p.cores[1], 'azul');
  assert.equal(p.cores[2], R.CORES[2], 'cor inválida cai na do assento');
  assert.equal(p.tanques.length, 4);
  for (const [i, t] of p.tanques.entries()) assert.ok(R.livre(p, t.x, t.y, i), `assento ${i} nasce livre`);
  assert.equal(R.novaPartida(T0, 9).tanques.length, R.MAX_JOGADORES, 'teto de 4');
}
{
  // bala acerta qualquer outro, não só "o adversário"; a rodada só acaba quando sobra um
  const p = R.novaPartida(T0, 3);
  let t = T0 + R.CONTAGEM; R.passo(p, t);
  Object.assign(p.tanques[0], { x: 850, y: 330 });
  Object.assign(p.tanques[2], { x: 1030, y: 330, vida: R.DANO_BALA });   // o 3º na linha de tiro
  Object.assign(p.tanques[1], { x: 1000, y: 600 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, t, t + 600);
  assert.ok(ev.some((e) => e.tipo === 'abate' && e.alvo === 2 && e.de === 0), 'o 3º caiu');
  assert.equal(p.fase, 'jogo', 'ainda tem dois vivos');
  p.tanques[1].vida = 1;
  Object.assign(p.tanques[1], { x: 1030, y: 330 });
  rodar(p, t + 633, t + 1400);
  assert.equal(p.fase, 'fim-rodada');
  assert.equal(p.vencedorRodada, 0);
}
{
  // tempo esgotado com 3: leva o vivo com mais vida
  const p = R.novaPartida(T0, 3);
  R.passo(p, T0 + R.CONTAGEM);
  p.tanques[0].vida = 30; p.tanques[1].vida = 90; p.tanques[2].vida = 50;
  R.passo(p, p.rodadaAte + 10);
  assert.equal(p.vencedorRodada, 1);
}
{
  // saiu no meio: eliminado, não volta; sobrou um, ele leva
  const p = R.novaPartida(T0, 3);
  R.passo(p, T0 + R.CONTAGEM);
  assert.ok(R.eliminar(p, 1));
  assert.equal(p.tanques[1].vivo, false);
  assert.equal(p.fim, null, 'ainda tem dois na partida');
  assert.equal(R.eliminar(p, 1), null, 'não sai duas vezes');
  R.eliminar(p, 2);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
{
  // eliminado não renasce na rodada seguinte
  const p = R.novaPartida(T0, 3);
  let t = T0 + R.CONTAGEM; R.passo(p, t);
  R.eliminar(p, 2);
  p.tanques[1].vida = 0; p.tanques[1].vivo = false;   // rodada pro 0
  R.passo(p, t + 50);
  // força o fim da rodada pelo relógio
  R.passo(p, p.rodadaAte + 10); R.passo(p, p.faseAte + 10);
  assert.equal(p.rodada, 2);
  assert.equal(p.tanques[2].vivo, false, 'quem saiu continua fora');
  assert.equal(p.tanques[1].vivo, true);
}
{
  // 3 rodadas, cada um ganhou uma: decide o dano entre os empatados
  const p = R.novaPartida(T0, 3);
  p.placar = [1, 1, 0]; p.rodada = 3; p.dano = [40, 90, 200];
  p.fase = 'fim-rodada'; p.vencedorRodada = 2; p.faseAte = T0;
  R.passo(p, T0 + 10);
  assert.deepEqual(p.fim, { vencedor: 2, motivo: 'dano' }, 'placar 1-1-1, o 3º causou mais dano');
}
console.log('✔ 3 e 4 jogadores: cores, cada um por si, relógio, W.O. e desempate');
console.log('tanque: regras ok');
