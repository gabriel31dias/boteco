// node src/gira.test.mjs — o inverso precisa casar com o transform do CSS
import assert from 'node:assert'
globalThis.innerWidth = 390
globalThis.document = { documentElement: { classList: { contains: () => true } } }
const { ponto, desgira } = await import('./gira.js')
// CSS: ponto local (lx, ly) aparece na tela em (vw - ly, lx)
for (const [lx, ly] of [[0, 0], [100, 50], [844, 390]]) {
  const p = ponto({ clientX: 390 - ly, clientY: lx })
  assert.deepEqual([p.x, p.y], [lx, ly])
}
assert.deepEqual(desgira(10, 0), [0, -10])   // dedo pra direita na tela = pra cima na mesa
console.log('ok')
