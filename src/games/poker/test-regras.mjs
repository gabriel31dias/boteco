// Auto-verificação do avaliador: node src/games/poker/test-regras.mjs
import assert from 'node:assert/strict';
import { avaliar, baralho, comparar, embaralhar, mulberry32 } from './regras.js';

const f = (s) => avaliar(s.split(' ')).forca;
const ganha = (a, b, msg) => assert.ok(comparar(f(a), f(b)) > 0, msg);
const empata = (a, b, msg) => assert.equal(comparar(f(a), f(b)), 0, msg);

assert.equal(baralho().length, 52);
assert.equal(new Set(baralho()).size, 52, 'sem carta repetida');
assert.deepEqual(embaralhar(baralho(), mulberry32(7)), embaralhar(baralho(), mulberry32(7)), 'mesma semente, mesma ordem');

// ranking das categorias
const ordem = ['As Ks Qs Js Ts', '9h 8h 7h 6h 5h', 'Ac Ad Ah As 2c', 'Kc Kd Kh 2s 2c', '2h 7h 9h Jh Kh',
  'Tc 9d 8h 7s 6c', 'Qc Qd Qh 5s 2c', 'Jc Jd 4h 4s 2c', 'Tc Td 8h 5s 2c', 'Ac Jd 8h 5s 2c'];
for (let i = 0; i + 1 < ordem.length; i++) ganha(ordem[i], ordem[i + 1], `${ordem[i]} > ${ordem[i + 1]}`);
assert.equal(avaliar('As Ks Qs Js Ts'.split(' ')).nome, 'Royal flush');

// roda (wheel): menor sequência, e Ás não dá a volta
ganha('2c 3d 4h 5s 6c', 'Ac 2d 3h 4s 5c', '6-alta vence a roda');
ganha('Ac 2d 3h 4s 5c', 'Kc Kd 8h 5s 2c', 'roda ainda é sequência');
assert.equal(f('Qc Kd Ah 2s 3c')[0], 0, 'Q-K-A-2-3 não é sequência');
ganha('2h 3h 4h 5h 6h', 'Ah 2h 3h 4h 5h', 'steel wheel é o menor straight flush');

// kickers e desempates
ganha('Ac Ad Kh 5s 2c', 'As Ah Qh 5d 2d', 'par de ases com kicker K > Q');
ganha('Kc Kd 4h 4s Ac', 'Kh Ks 4c 4d Qc', 'dois pares: kicker');
ganha('Kc Kd 5h 5s 2c', 'Kh Ks 4c 4d Ac', 'dois pares: segundo par antes do kicker');
ganha('3c 3d 3h 2s 2c', '2h 2s 2d As Ac', 'full: a trinca manda');
ganha('Ah 9h 7h 5h 3h', 'Ac 9c 7c 5c 2c', 'flush compara as 5');
empata('Ah 9h 7h 5h 3h', 'Ac 9c 7c 5c 3c', 'naipe não desempata');

// 7 cartas: melhor 5
const m = avaliar('Ah Kh 2c 3d Qh Jh Th'.split(' '));
assert.equal(m.nome, 'Royal flush');
assert.deepEqual([...m.melhores].sort(), ['Ah', 'Jh', 'Kh', 'Qh', 'Th']);
empata('Ac Ad Ah As Kc 2d 3d', 'Ac Ad Ah As Kd 7h 8h', 'quadra na mesa: kicker K nos dois');
ganha('7c 7d 7h 7s Ac 2d 3d', '7c 7d 7h 7s Kc 2d 3d', 'quadra na mesa: kicker decide');
assert.equal(avaliar(['As', 'Kd']), null, 'menos de 5 cartas não avalia');

console.log('✔ avaliador: ranking, roda, kickers, naipe e 7 cartas');
