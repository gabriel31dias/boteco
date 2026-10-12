// Auto-verificação do árbitro do pôquer (sem socket): node server/test-poker-arbitro.mjs
process.env.POKER_PAUSA = '0';
const assert = (await import('node:assert/strict')).default;
const P = await import('./jogos/poker.js');

// --- sigilo no payload
{
  const p = P.novaPartida(3);
  const e0 = P.estadoPara(p, 0);
  assert.equal(e0.minhas.length, 2);
  assert.equal(e0.cartas, null, 'cartas dos outros: nada antes do showdown');
  const json = JSON.stringify(e0);
  for (const s of [1, 2]) for (const c of p.mao.cartas[s]) assert.ok(!json.includes(`"${c}"`) || p.mao.board.includes(c), `vazou ${c}`);
  assert.ok(!json.includes('deck'), 'baralho não sai');
  console.log('✔ árbitro: sigilo');
}

// --- estouro: check quando pode, fold quando não; 3 seguidos elimina
{
  const p = P.novaPartida(2);
  const vez = p.vez;
  const r = P.estourou(p);
  assert.equal(r.tipo, 'tempo');
  assert.equal(r.acao, 'fold', 'SB devendo: estouro larga');
  assert.equal(p.mao.fase, 'fim');
  P.estourou(p);                                     // pausa 0: próxima mão
  assert.equal(p.maoNum, 2);
  let estouros = 1;
  while (!p.fim && estouros < 10) {
    if (p.mao.fase === 'fim') { P.estourou(p); continue; }
    if (p.vez === vez) { P.estourou(p); estouros++; } else P.agir(p, p.vez, { tipo: p.mao.acoesLegais(p.vez).check ? 'check' : 'call' });
  }
  assert.deepEqual(p.fim, { vencedor: 1 - vez, motivo: 'tempo' }, 'ausente eliminado no 3º estouro');
  console.log('✔ árbitro: relógio');
}

// --- sair fora da vez: mão segue, relógio de quem joga não reinicia
{
  const p = P.novaPartida(3);
  const vez = p.vez;
  const fora = [0, 1, 2].find((s) => s !== vez);
  const desde = p.desde;
  const r = P.eliminar(p, fora, 'abandono');
  assert.equal(r.tipo, 'saiu');
  assert.equal(p.vez, vez);
  assert.equal(p.desde, desde, 'não reinicia o relógio de quem está na vez');
  console.log('✔ árbitro: saída fora da vez');
}

// --- partida até o fim: fichas conservadas, vencedor com tudo
{
  const p = P.novaPartida(4);
  let passos = 0;
  while (!p.fim && passos++ < 5000) {
    if (p.mao.fase === 'fim') { P.estourou(p); continue; }
    const total = p.mao.pilha.reduce((a, b) => a + b, 0) + p.mao.investido.reduce((a, b) => a + b, 0);
    assert.equal(total, 4 * P.FICHAS, 'nenhuma ficha criada ou perdida');
    P.agir(p, p.vez, { tipo: 'allin' });
  }
  assert.equal(p.fim.motivo, 'fichas');
  assert.equal(p.fichas[p.fim.vencedor], 4 * P.FICHAS);
  assert.equal(p.colocacao.length, 3, 'três eliminados registrados');
  console.log('✔ árbitro: torneio até sobrar um');
}
