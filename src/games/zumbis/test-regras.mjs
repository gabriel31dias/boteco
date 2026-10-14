// Auto-verificação das regras do Zombie Rush.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

let t = 1_000_000;
const passo = (p, ms = R.TICK_MS) => R.passo(p, (t += ms));
const largar = (n = 2, sem = 7) => { const p = R.novaPartida(t, n, [], R.sorteador(sem)); while (p.fase === 'contagem') passo(p); p.proxZumbi = Infinity; p.proxItem = Infinity; return p; };
const zumbi = (p, tipo, x, y = R.CHAO) => { const z = { id: ++p.id, tipo, x, y, vy: 0, kx: 0, chao: true, atravessa: 0, vida: R.ZUMBIS[tipo].vida, max: R.ZUMBIS[tipo].vida, dir: -1, vel: R.ZUMBIS[tipo].vel, surgeAte: 0, bateEm: 0, puloEm: Infinity, ultimoDe: null, morto: null }; p.zumbis.push(z); return z; };
const espera = (p, ms) => { for (let k = 0; k < ms / R.TICK_MS; k++) passo(p); };
const evs = (p, ms, tipo) => { const out = []; for (let k = 0; k < ms / R.TICK_MS; k++) { passo(p); out.push(...p.eventos.filter((e) => e.tipo === tipo)); } return out; };

// cores: a escolhida vale; repetida ou inválida vira uma livre
{
  const p = R.novaPartida(t, 4, ['verde', 'verde', 'xx']);
  assert.equal(p.cores[0], 'verde');
  assert.equal(new Set(p.cores).size, 4);
}
// movimento: anda, pula duplo, desce da plataforma, não sai da tela
{
  const p = largar();
  const s = p.soldados[0];
  const x0 = s.x;
  R.entrada(p, 0, { mx: 1 }); espera(p, 500);
  assert.ok(s.x > x0 + 100, 'andou');
  R.entrada(p, 0, { mx: 0, pulo: true }); passo(p);
  R.entrada(p, 0, { mx: 0 }); espera(p, 150);
  const y1 = s.y;
  R.entrada(p, 0, { mx: 0, pulo: true }); passo(p); R.entrada(p, 0, { mx: 0 }); espera(p, 100);
  assert.ok(s.y < y1, 'pulo duplo sobe mais');
  espera(p, 1500);
  assert.ok(s.chao);
  // em cima da plataforma do meio, ↓ atravessa
  s.x = 640; s.y = 380; s.vy = 0;
  passo(p);
  assert.equal(s.y, 380, 'parado na plataforma');
  R.entrada(p, 0, { mx: 0, desce: true }); espera(p, 400); R.entrada(p, 0, { mx: 0 }); espera(p, 800);
  assert.equal(s.y, R.CHAO, 'desceu até o chão');
  R.entrada(p, 0, { mx: -1 }); espera(p, 6000);
  assert.equal(s.x, R.SOLDADO.w / 2, 'parou na beira');
}
// tiro mata zumbi e dá pontos; combo multiplica
{
  const p = largar();
  const s = p.soldados[0];
  s.x = 300; s.y = R.CHAO; s.ang = 0;
  const z = zumbi(p, 'comum', 520);
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: true });
  const mortos = evs(p, 2000, 'zumbiMorreu');
  assert.equal(mortos.length, 1);
  assert.equal(mortos[0].de, 0);
  assert.equal(p.pontos[0], 10);
  assert.ok(z.morto != null);
  // 5 seguidos: o 5º vale dobrado
  for (let k = 0; k < 5; k++) { const zz = zumbi(p, 'comum', 420 + k * 6); zz.vida = 1; }
  const combos = evs(p, 2000, 'combo');
  assert.ok(combos.some((c) => c.combo === 5), 'COMBO!');
  assert.equal(p.combo[0], 6);
  assert.equal(p.pontos[0], 10 + 10 * 3 + 20 * 2, `pontos ${p.pontos[0]}`);   // combos 2–4 valem 10, 5 e 6 valem 20
  // passou o tempo do combo: zera
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: false }); espera(p, R.COMBO_MS + 200);
  const z2 = zumbi(p, 'comum', 420); z2.vida = 1;
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: true }); espera(p, 600);
  assert.equal(p.combo[0], 1);
}
// explosivo: explode quando morre (mata os vizinhos, pontos pra quem matou) e quando encosta (machuca)
{
  const p = largar();
  const s = p.soldados[0];
  s.x = 200; s.y = R.CHAO; s.ang = 0;
  const g = zumbi(p, 'explosivo', 600); g.vel = 0;
  const viz = zumbi(p, 'comum', 640); viz.vel = 0;
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: true });
  const ex = evs(p, 3000, 'explosao');
  assert.ok(ex.some((e) => e.gordo), 'explodiu');
  assert.ok(viz.morto != null, 'levou o vizinho');
  assert.equal(p.abates[0], 2);
  const p2 = largar();
  const s2 = p2.soldados[0]; s2.x = 300; s2.y = R.CHAO; s2.protegidoAte = 0;
  zumbi(p2, 'explosivo', 360);
  espera(p2, 1500);
  assert.ok(s2.vida < R.SOLDADO.vida, 'encostou e machucou');
  assert.equal(p2.pontos[0], 0, 'explodir sozinho não dá ponto');
}
// barril: tiro estoura, mata zumbis perto
{
  const p = largar();
  const [bx, by] = R.BARRIS[3];
  const s = p.soldados[0]; s.x = bx - 300; s.y = by; s.ang = -0.06;
  const z = zumbi(p, 'comum', bx + 40); z.vel = 0;
  R.entrada(p, 0, { mx: 0, ang: 0.03, fogo: true });
  espera(p, 1500);
  assert.equal(p.barris[3] > 0, true, 'barril estourou');
  assert.ok(z.morto != null);
}
// armas: pega do caixote, munição acaba e volta pra pistola; kit cura
{
  const p = largar();
  const s = p.soldados[0];
  p.itens.push({ id: 900, tipo: 'arma', arma: 'escopeta', x: s.x + 10, y: s.y, some: Infinity });
  passo(p);
  assert.equal(s.arma, 'escopeta');
  assert.equal(s.municao, R.ARMAS.escopeta.municao);
  R.entrada(p, 0, { mx: 0, ang: -1.5, fogo: true });
  espera(p, R.ARMAS.escopeta.cd * (R.ARMAS.escopeta.municao + 2));
  assert.equal(s.arma, 'pistola', 'acabou a munição');
  const balas = p.balas.length;
  void balas;
  s.vida = 30;
  p.itens.push({ id: 901, tipo: 'kit', x: s.x, y: s.y, some: Infinity });
  passo(p);
  assert.equal(s.vida, 90);
  // bazuca: explode em área
  p.itens.push({ id: 902, tipo: 'arma', arma: 'bazuca', x: s.x, y: s.y, some: Infinity });
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: false }); passo(p);
  s.ang = 0;
  const a = zumbi(p, 'comum', s.x + 260); a.vel = 0;
  const b = zumbi(p, 'comum', s.x + 330); b.vel = 0;
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: true }); espera(p, 700);
  assert.ok(a.morto != null && b.morto != null, 'bazuca pegou dois');
  // lança-chamas atravessa
  const p2 = largar();
  const s2 = p2.soldados[0]; s2.arma = 'lanca'; s2.municao = 50;
  const zs = [0, 1, 2].map((k) => { const z = zumbi(p2, 'comum', s2.x + 70 + k * 30); z.vel = 0; return z; });
  R.entrada(p2, 0, { mx: 0, ang: 0, fogo: true }); espera(p2, 1200);
  assert.ok(zs.every((z) => z.vida < R.ZUMBIS.comum.vida), 'chama pega todos');
}
// mordida: machuca, morre, renasce sem combo e protegido; pontos ficam
{
  const p = largar();
  const s = p.soldados[1]; s.protegidoAte = 0; s.vida = 30;   // o gigante empurra longe: uma mordida tem que bastar
  p.pontos[1] = 50; p.combo[1] = 7; p.comboEm[1] = t;
  const g = zumbi(p, 'gigante', s.x + 20); g.vel = 0;
  g.bateEm = 0;
  let mortes = 0;
  for (let k = 0; k < 120 && !mortes; k++) { passo(p); mortes = p.eventos.filter((e) => e.tipo === 'morreu').length; }
  assert.ok(mortes >= 1);
  g.morto = t;   // o gigante sai: não mata de novo na volta
  assert.equal(p.pontos[1], 50);
  assert.equal(p.combo[1], 0);
  for (let k = 0; k < 200 && !s.vivo; k++) passo(p);
  assert.ok(s.vivo, 'renasceu');
  assert.equal(s.vida, R.SOLDADO.vida);
  assert.ok(s.protegidoAte > t);
}
// ondas: só comuns no começo; corredores a partir de 20s; o gigante aos 80s
{
  const p = R.novaPartida(t, 4, [], R.sorteador(3));
  while (p.fase === 'contagem') passo(p);
  for (const s of p.soldados) s.protegidoAte = Infinity;   // ninguém morre: só olha os zumbis
  const tipos = new Set(), antes20 = new Set(); let chefe = false;
  const ondas = [];
  while (!p.fim) {
    passo(p, 50);
    for (const e of p.eventos) {
      if (e.tipo === 'brota') { tipos.add(e.zt); if (t - p.largada < 19_000) antes20.add(e.zt); }
      if (e.tipo === 'chefe') chefe = true;
      if (e.tipo === 'onda') ondas.push(e.nome);
    }
    for (const s of p.soldados) s.protegidoAte = Infinity;
    if ((t - p.largada) % 2000 < 50) for (const z of p.zumbis) if (z.tipo !== 'gigante') z.morto ??= t;   // abre vaga pra brotar mais
  }
  assert.deepEqual([...antes20], ['comum']);
  for (const z of ['comum', 'corredor', 'saltador', 'explosivo', 'gigante']) assert.ok(tipos.has(z), `brotou ${z}`);
  assert.ok(chefe);
  assert.equal(ondas.length, 4);
  assert.ok(p.zumbis.filter((z) => z.morto == null).length <= 24);
}
// partida inteira: robô que atira no zumbi mais perto faz pontos; o parado não; fim por pontos
{
  const p = R.novaPartida(t, 3, [], R.sorteador(11));
  let k = 0;
  while (!p.fim && k++ < 30 * 100) {
    for (const i of [0, 1]) {
      const s = p.soldados[i];
      if (!s.vivo) continue;
      const z = p.zumbis.filter((z) => z.morto == null).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      const ang = z ? Math.atan2(z.y - R.ZUMBIS[z.tipo].h / 2 - (s.y - R.SOLDADO.h * 0.55), z.x - s.x) : 0;
      const longe = z && Math.abs(z.x - s.x) > 250 ? Math.sign(z.x - s.x) : z && Math.abs(z.x - s.x) < 80 ? -Math.sign(z.x - s.x) : 0;
      R.entrada(p, i, { mx: i === 0 ? longe : 0, ang, fogo: !!z, pulo: i === 0 && k % 45 === 0 });
    }
    passo(p);
  }
  assert.ok(p.fim, 'acabou');
  assert.equal(p.fim.motivo, 'pontos');
  assert.ok(p.pontos[0] > 100 && p.pontos[1] > 50, `pontos ${p.pontos}`);
  assert.equal(p.pontos[2], 0);
  assert.equal(p.pontos[p.fim.vencedor], Math.max(...p.pontos));
  console.log(`  partida simulada: pontos ${p.pontos}, abates ${p.abates}, mortes ${p.mortes}, melhor combo ${p.melhorCombo}`);
}
// W.O., lixo e estado
{
  const p = largar(3);
  assert.equal(R.entrada(p, 0, 'lixo'), null);
  assert.equal(R.entrada(p, 9, { mx: 1 }), null);
  const e = R.estadoPara(p, 1, t);
  assert.equal(e.assento, 1);
  assert.equal(e.s.length, 3);
  R.eliminar(p, 1); assert.equal(p.fim, null);
  R.eliminar(p, 2); assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ zumbis: regras');
