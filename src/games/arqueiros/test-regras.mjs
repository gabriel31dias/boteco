// Auto-verificação das regras de Arqueiros do Céu.
process.env.ARQ_CONTAGEM = '0';
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

let t = 1_000_000;
const anda = (p, ms, cada = () => {}) => { for (let k = 0; k < ms / 33; k++) { cada(); R.passo(p, (t += 33)); } };
const nova = (n = 2) => { const p = R.novaPartida(t, n); R.passo(p, (t += 1)); p.arqueiros.forEach((a) => (a.protegidoAte = 0)); return p; };
const por = (p, i, x, y) => Object.assign(p.arqueiros[i], { x, y, vx: 0, vy: 0, kx: 0, chao: true });
/** Puxa por `ms` mirando `ang` e solta. */
const disparar = (p, i, ang, ms) => { R.entrada(p, i, { ang, puxa: true }); anda(p, ms); R.entrada(p, i, { ang, puxa: false }); R.passo(p, (t += 33)); };

// no chão, parado, de pé
{
  const p = nova();
  anda(p, 500);
  assert.equal(p.arqueiros[0].chao, true);
  assert.equal(p.arqueiros[0].y, 470);
}

// puxar pouco não sai; puxar sai, cai com a gravidade e crava na ilha do outro lado
{
  const p = nova();
  R.entrada(p, 0, { ang: 0, puxa: true }); R.passo(p, (t += 33)); R.entrada(p, 0, { ang: 0, puxa: false }); R.passo(p, (t += 33));
  assert.equal(p.flechas.length, 0, 'toquinho não atira');
  por(p, 1, 1130, 200);   // fora do caminho
  p.arqueiros[1].chao = false;
  const evs = [];
  disparar(p, 0, -0.35, 900);
  assert.equal(p.flechas.length, 1);
  const y0 = p.flechas[0].vy;
  for (let k = 0; k < 120 && p.flechas.length; k++) { R.passo(p, (t += 33)); evs.push(...p.eventos); }
  assert.ok(evs.some((e) => e.tipo === 'cravou'), 'a flecha cravou em algo');
  assert.ok(y0 < 0, 'subiu antes de cair');
}

// pra cima: sobe, passa do topo da tela e volta caindo até cravar na grama
{
  const p = nova();
  por(p, 0, 150, 470); por(p, 1, 1130, 470);
  disparar(p, 0, -Math.PI / 2 + 0.05, 900);
  let topo = Infinity, cravou = null;
  for (let k = 0; k < 400 && p.flechas.length; k++) {
    R.passo(p, (t += 33));
    if (p.flechas[0]) topo = Math.min(topo, p.flechas[0].y);
    cravou ??= p.eventos.find((e) => e.tipo === 'cravou');
  }
  assert.ok(topo < 0, `passou do topo da tela (${Math.round(topo)})`);
  assert.ok(cravou && cravou.y > 300, 'voltou caindo e cravou');
  assert.ok(cravou.ang > 0.5, 'cravou de ponta pra baixo');
}

// acerto no corpo crava (dx, dy, ang) e tira vida; na cabeça dobra; a vida volta depois
{
  const p = nova();
  por(p, 0, 110, 470); por(p, 1, 210, 470);     // ilha da esquerda, nada no meio
  const evs = [];
  const mira = 0.08;                            // do arco (peito) pro peito/barriga do outro
  R.entrada(p, 0, { ang: mira, puxa: true }); anda(p, 300);
  R.entrada(p, 0, { ang: mira, puxa: false });
  for (let k = 0; k < 10; k++) { R.passo(p, (t += 33)); evs.push(...p.eventos); }
  const ac = evs.find((e) => e.tipo === 'acerto');
  assert.ok(ac, 'acertou');
  assert.ok(Number.isFinite(ac.dx) && Number.isFinite(ac.dy) && Number.isFinite(ac.ang), 'sabe onde cravou');
  assert.ok(p.arqueiros[1].vida < R.VIDA);
  const v = p.arqueiros[1].vida;
  anda(p, R.REGEN.espera + 1500);
  assert.ok(p.arqueiros[1].vida > v, 'a vida voltou');
}

// headshot: flecha cheia na cabeça mata
{
  const p = nova();
  por(p, 0, 110, 470); por(p, 1, 210, 470);
  const [ox, oy] = R.bocaDoArco({ ...p.arqueiros[0], ang: 0 });
  const cabeca = 470 - R.H + 9;
  const ang = Math.atan2(cabeca - oy, 210 - ox);
  const evs = [];
  R.entrada(p, 0, { ang, puxa: true }); anda(p, 900);
  R.entrada(p, 0, { ang, puxa: false });
  for (let k = 0; k < 10; k++) { R.passo(p, (t += 33)); evs.push(...p.eventos); }
  assert.ok(evs.some((e) => e.tipo === 'acerto' && e.cabeca), 'na cabeça');
  assert.equal(p.arqueiros[1].vivo, false, 'cheia na cabeça mata');
  assert.equal(p.abates[0], 1);
  assert.equal(p.cabecas[0], 1);
}

// cobertura segura a flecha; agachado atrás da paliçada não leva
{
  const p = nova();
  por(p, 0, 120, 470); por(p, 1, 360, 470);    // paliçada [306..342] entre os dois
  const evs = [];
  R.entrada(p, 1, { agacha: true, ang: Math.PI }); anda(p, 100);
  assert.equal(p.arqueiros[1].agachado, true);
  R.entrada(p, 0, { ang: -0.02, puxa: true }); anda(p, 900);
  R.entrada(p, 0, { ang: -0.02, puxa: false });
  for (let k = 0; k < 20; k++) { R.passo(p, (t += 33)); evs.push(...p.eventos); }
  assert.ok(evs.some((e) => e.tipo === 'cravou' && e.onde === 'palicada'), 'cravou na paliçada');
  assert.equal(p.arqueiros[1].vida, R.VIDA);
}

// deitado: rente ao chão, a flecha na altura do peito passa por cima; não pula; rasteja devagar
{
  const p = nova();
  por(p, 0, 110, 470); por(p, 1, 210, 470);
  R.entrada(p, 1, { deita: true, ang: Math.PI }); anda(p, 100);
  assert.equal(p.arqueiros[1].deitado, true);
  assert.ok(R.altura(p.arqueiros[1]) < R.H * 0.4, 'baixinho');
  const evs = [];
  R.entrada(p, 0, { ang: -0.02, puxa: true }); anda(p, 900);
  R.entrada(p, 0, { ang: -0.02, puxa: false });
  for (let k = 0; k < 15; k++) { R.passo(p, (t += 33)); evs.push(...p.eventos); }
  assert.ok(!evs.some((e) => e.tipo === 'acerto'), 'a flecha passou por cima');
  assert.equal(p.arqueiros[1].vida, R.VIDA);
  R.entrada(p, 1, { deita: true, pulo: true, ang: Math.PI }); R.passo(p, (t += 33));
  assert.equal(p.arqueiros[1].chao, true, 'deitado não pula');
  const x0 = p.arqueiros[1].x;
  R.entrada(p, 1, { deita: true, mx: 1, ang: 0 }); anda(p, 1000);
  const rastejou = p.arqueiros[1].x - x0;
  assert.ok(rastejou > 5 && rastejou < R.VEL * 0.3, `rasteja devagar (${Math.round(rastejou)})`);
  // a cabeça deitado é a ponta da frente
  const d = { ...p.arqueiros[1], dir: 1 };
  assert.equal(R.naCabeca(d, d.x + 28, d.y - 5), true);
  assert.equal(R.naCabeca(d, d.x - 28, d.y - 5), false);
}

// caiu no abismo depois de levar flecha: o abate é de quem acertou
{
  const p = nova();
  p.arqueiros[1].ultimoDe = 0; p.arqueiros[1].ultimoEm = t;
  por(p, 1, 450, 600); p.arqueiros[1].chao = false;     // no vão entre as ilhas
  anda(p, 800);
  assert.equal(p.arqueiros[1].vivo, false);
  assert.equal(p.abates[0], 1);
  anda(p, R.RENASCER + 100);
  assert.equal(p.arqueiros[1].vivo, true, 'renasceu');
}

// aljava de fogo: pega, 3 flechas explosivas
{
  const p = nova();
  const it = R.ITENS.find((x) => x.tipo === 'fogo');
  por(p, 0, it.x, it.y);
  anda(p, 66);
  assert.equal(p.arqueiros[0].especial, 'fogo');
  assert.equal(p.arqueiros[0].nEspecial, R.ESPECIAL);
}

// fim do tempo: mais abates; empatou, mais dano; tudo igual, empate. W.O. e lixo.
{
  const fim = (abates, dano) => { const p = nova(); p.abates = abates; p.dano = dano; p.fimEm = t + 10; anda(p, 66); return p.fim; };
  assert.deepEqual(fim([3, 1], [0, 0]), { vencedor: 0, motivo: 'tempo' });
  assert.deepEqual(fim([2, 2], [10, 90]), { vencedor: 1, motivo: 'dano' });
  assert.deepEqual(fim([2, 2], [5, 5]), { vencedor: null, motivo: 'empate' });
  const p = nova(3);
  assert.equal(R.entrada(p, 0, { mx: 'x', ang: null, puxa: 'sim' }).ok, true);
  assert.equal(p.arqueiros[0].entrada.puxa, false);
  R.eliminar(p, 1);
  assert.equal(p.fim, null, 'ainda tem dois');
  R.eliminar(p, 2);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
  assert.ok(JSON.stringify(R.estadoPara(nova(4), 0)).length < 2500, 'estado enxuto');
}
console.log('✔ arqueiros: regras');
