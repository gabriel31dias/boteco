// Auto-verificação das regras da Forca.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');
const { TEMAS } = await import('./palavras.js');

for (const [tema, lista] of Object.entries(TEMAS)) for (const w of lista) assert.ok([...w].every((ch) => /[A-Z]/.test(R.base(ch)) || ch === '-' || ch === ' '), `${tema}: ${w}`);
assert.equal(R.base('Ç'), 'C');
assert.equal(R.base('Ã'), 'A');

const nova = (palavra) => R.novaPartida(1000, { tema: 'TESTE', palavra });

// acerto revela (com acento), erro arranca pedaço na ordem, repetido recusado
{
  const p = nova('MARACUJÁ');
  assert.equal(R.estadoPara(p, 0).mascara, '________');
  let r = R.agir(p, 0, { letra: 'a' });
  assert.deepEqual([r.acertou, r.casas], [true, 3]);
  assert.equal(R.estadoPara(p, 0).mascara, '_A_A___Á', 'o A pega o Á');
  assert.equal(R.estadoPara(p, 1).mascara, '________', 'o rival não vê as minhas letras');
  assert.deepEqual(R.estadoPara(p, 1).rival, { erros: 0, revelados: 3, chutes: 1 });
  assert.equal(R.agir(p, 0, { letra: 'A' }), null, 'repetida');
  assert.equal(R.agir(p, 0, { letra: '1' }), null);
  assert.equal(R.agir(p, 0, { letra: 'AB' }), null);
  r = R.agir(p, 0, { letra: 'Z' });
  assert.deepEqual([r.acertou, r.peca], [false, 'chapeu']);
  assert.equal(R.agir(p, 0, { letra: 'X' }).peca, 'braco-e');
  assert.equal(R.estadoPara(p, 0).erros, 2);
}

// completou a palavra: ganha
{
  const p = nova('CAJU');
  for (const l of 'CAJ') R.agir(p, 1, { letra: l });
  assert.equal(p.fim, null);
  R.agir(p, 1, { letra: 'U' });
  assert.deepEqual(p.fim, { vencedor: 1, motivo: 'palavra' });
  assert.equal(R.estadoPara(p, 0).mascara, 'CAJU', 'no fim abre a palavra');
  assert.equal(R.agir(p, 0, { letra: 'C' }), null, 'acabou');
}

// 6 erros: enforcado, o outro ganha
{
  const p = nova('CAJU');
  for (const l of 'BDEFG') R.agir(p, 0, { letra: l });
  assert.equal(p.fim, null);
  const r = R.agir(p, 0, { letra: 'H' });
  assert.equal(r.peca, 'tronco');
  assert.deepEqual(p.fim, { vencedor: 1, motivo: 'enforcado' });
}

// guarda-chuva: o hífen já aparece e não conta como letra
{
  const p = nova('GUARDA-CHUVA');
  assert.equal(R.estadoPara(p, 0).mascara, '______-_____');
  assert.equal(p.letras, 11);
}

// tempo: mais revelado; depois menos erros; depois empate
{
  const fim = (a, b) => { const p = nova('BANANA'); for (const l of a) R.agir(p, 0, { letra: l }); for (const l of b) R.agir(p, 1, { letra: l }); R.estourou(p); return p.fim; };
  assert.deepEqual(fim('A', 'N'), { vencedor: 0, motivo: 'tempo' });
  assert.deepEqual(fim('AZ', 'AX'), { vencedor: null, motivo: 'empate' });
  assert.deepEqual(fim('AZ', 'A'), { vencedor: 1, motivo: 'erros' });
}
console.log('✔ forca: regras');
