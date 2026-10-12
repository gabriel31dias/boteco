import { ehCanastra, ehDois, montarJogo, naipe, VALORES } from './regras.js';

/**
 * Jogador automático simples: compra do monte, estende os jogos do time,
 * baixa sequências que tiver e descarta a carta mais solta. Serve de
 * adversário no treino e de cliente nos testes. Lê só o estado do próprio
 * assento (o mesmo que o navegador recebe).
 *
 * @returns {{tipo: string, cartas?: string[], jogo?: number, carta?: string} | null}
 */
export function jogadaBot(e) {
  if (e.fim || e.vez !== e.assento || e.resultado) return null;
  if (e.fase === 'comprar') return { tipo: 'comprar' };

  const t = e.time;
  const podeEsvaziar = (!e.pegouMorto[t] && e.mortos > 0)
    || (e.pegouMorto[t] && e.jogos[t].some((j) => ehCanastra(j) && j.limpa));
  const sobra = (n) => e.mao.length - n >= 2 || podeEsvaziar;

  // 1. estende jogo do time com uma carta
  for (const [i, j] of e.jogos[t].entries()) {
    for (const c of e.mao) {
      if (ehDois(c) && !j.limpa) continue;
      if (ehDois(c) && ehCanastra(j)) continue;           // não suja canastra limpa à toa
      if (montarJogo([...j.cartas, c]) && sobra(1)) return { tipo: 'adicionar', jogo: i, cartas: [c] };
    }
  }
  // 2. baixa a maior sequência natural de 3+
  const corrida = melhorCorrida(e.mao);
  if (corrida && sobra(corrida.length)) return { tipo: 'baixar', cartas: corrida };

  // 3. descarta a mais solta (sem vizinho no naipe), nunca um 2 se der
  const solta = [...e.mao].sort((a, b) => vizinhos(e.mao, a) - vizinhos(e.mao, b) || (ehDois(a) ? 1 : 0) - (ehDois(b) ? 1 : 0));
  if (e.mao.length === 1 && !podeEsvaziar) return null;
  return { tipo: 'descartar', carta: solta[0] };
}

const ord = (c) => VALORES.indexOf(c[0]) + 1;

function vizinhos(mao, c) {
  return mao.filter((x) => x !== c && naipe(x) === naipe(c) && Math.abs(ord(x) - ord(c)) <= 2).length;
}

function melhorCorrida(mao) {
  let melhor = null;
  for (const n of 'shdc') {
    const porRank = new Map();
    for (const c of mao) if (naipe(c) === n && !ehDois(c)) porRank.set(ord(c), c);
    let atual = [];
    for (let r = 1; r <= 14; r++) {
      const c = porRank.get(r === 14 ? 1 : r);
      if (c && !atual.includes(c)) { atual.push(c); continue; }
      if (atual.length >= 3 && (!melhor || atual.length > melhor.length)) melhor = atual;
      atual = c ? [c] : [];
    }
    if (atual.length >= 3 && (!melhor || atual.length > melhor.length)) melhor = atual;
  }
  return melhor && montarJogo(melhor) ? melhor : null;
}
