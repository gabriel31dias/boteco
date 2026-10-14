// Auto-verificação das regras de Cobras do Templo.
process.env.COBRAS_CONTAGEM = '0';
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

// rastro: gomos a cada SEG px, faltou rastro empilha no fim
{
  const pts = R.amostrar(R.rastroInicial(300, 500, 0, 5), 5);
  pts.forEach(([x, y], k) => { assert.ok(Math.abs(x - (300 - k * R.SEG)) < 1e-6); assert.equal(y, 500); });
  const curto = R.amostrar([[0, 0], [R.SEG, 0]], 4);
  assert.deepEqual(curto.at(-1), curto[1], 'rastro curto empilha');
}

let t = 1_000_000;
const anda = (p, ms) => { for (let k = 0; k < ms / 33; k++) R.passo(p, (t += 33)); };
const nova = () => { const p = R.novaPartida(t, 2, ['verde', 'azul']); R.passo(p, (t += 1)); p.frutas = []; p.cobras.forEach((c) => (c.protegidoAte = 0)); return p; };
const por = (p, i, x, y, ang) => Object.assign(p.cobras[i], { x, y, ang, alvo: ang, rastro: R.rastroInicial(x, y, ang, p.cobras[i].len) });
const semFrutas = (p) => { p.frutas = []; };

// come: cresce e conta
{
  const p = nova();
  por(p, 0, 300, 500, 0); por(p, 1, 300, 900, 0);
  R.passo(p, (t += 1)); semFrutas(p);
  p.frutas.push({ id: 999, x: 340, y: 500, tipo: 'uva', cresce: 3 });
  R.passo(p, (t += 33));
  assert.equal(p.cobras[0].len, R.INICIO + 3);
  assert.equal(p.comeu[0], 3);
  assert.ok(p.eventos.some((e) => e.tipo === 'come' && e.f === 999));
  assert.ok(p.frutas.filter((f) => f.tipo !== 'bola').length >= R.FRUTAS_MAX, 'repõe as frutas');
}

// cabeça no corpo do outro: morre, vira bolinha, o outro leva o abate; renasce depois
{
  const p = nova();
  por(p, 1, 400, 600, Math.PI / 2);           // azul em pé, de cima pra baixo
  por(p, 0, 400 - 40, 600 - 30, 0);           // verde vem da esquerda e bate no corpo
  semFrutas(p);
  anda(p, 400);
  assert.equal(p.cobras[0].vivo, false, 'bateu no corpo, morreu');
  assert.equal(p.abates[1], 1);
  assert.ok(p.frutas.some((f) => f.tipo === 'bola' && f.dono === 0), 'virou bolinha');
  anda(p, R.RENASCER + 100);
  assert.equal(p.cobras[0].vivo, true, 'renasceu');
  assert.ok(p.cobras[0].len < 20, 'renasce pequena');
}

// parede e pedra matam sozinhas
{
  const p = nova();
  por(p, 0, R.CAMPO.x0 + 30, 700, Math.PI); por(p, 1, 300, 1000, 0);
  anda(p, 400);
  assert.equal(p.cobras[0].vivo, false);
  assert.equal(p.mortes[0], 1);
  const [x0, y0, , y1] = R.PEDRAS[2];
  const q = nova();
  por(q, 0, x0 - 40, (y0 + y1) / 2, 0); por(q, 1, 300, 1000, 0);
  anda(q, 400);
  assert.equal(q.cobras[0].vivo, false, 'pedra');
}

// cabeça com cabeça: a menor morre
{
  const p = nova();
  p.cobras[1].len = 30;
  por(p, 0, 300, 700, 0); por(p, 1, 360, 700, Math.PI);
  anda(p, 300);
  assert.equal(p.cobras[0].vivo, false);
  assert.equal(p.cobras[1].vivo, true);
}

// turbo: corre mais e gasta gomo
{
  const p = nova();
  p.cobras[0].len = 30;
  por(p, 0, 200, 700, 0); por(p, 1, 300, 1050, 0);
  R.entrada(p, 0, { ang: 0, turbo: true });
  anda(p, 1000);
  assert.ok(p.cobras[0].len < 30 && p.cobras[0].len >= 25, `gastou (${p.cobras[0].len})`);
  assert.ok(p.cobras[0].x > 200 + R.VEL * 1.3, 'correu mais');
  assert.equal(R.entrada(p, 0, { ang: 'lixo', turbo: 'sim' }).ok, true);
  assert.equal(p.cobras[0].querTurbo, false);
}

// fim do tempo: maior viva leva; empatou, quem comeu mais; tudo igual, empate
{
  const fim = (lens, comeu) => {
    const p = nova();
    p.cobras.forEach((c, i) => { c.len = lens[i]; c.protegidoAte = Infinity; });
    p.comeu = comeu;
    p.fimEm = t + 10;
    anda(p, 66);
    return p.fim;
  };
  assert.deepEqual(fim([20, 15], [0, 0]), { vencedor: 0, motivo: 'tamanho' });
  assert.deepEqual(fim([20, 20], [3, 9]), { vencedor: 1, motivo: 'frutas' });
  assert.deepEqual(fim([20, 20], [5, 5]), { vencedor: null, motivo: 'empate' });
}

// quem sai perde por W.O.; estado vai sem rastro
{
  const p = nova();
  assert.deepEqual(R.eliminar(p, 1), { tipo: 'saiu', assento: 1 });
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
  const e = R.estadoPara(nova(), 0);
  assert.equal(e.c.length, 2);
  assert.ok(JSON.stringify(e).length < 3000, 'estado enxuto');
}
console.log('✔ cobras: regras');
