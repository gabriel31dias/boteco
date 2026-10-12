/**
 * Onde cada jogador fica na tela, pra mesa (GameScene) e a HUD (UIScene)
 * concordarem. Posição relativa: 0 sou eu, embaixo; os outros ficam na faixa
 * de cima. A vez gira no sentido anti-horário (direita, frente, esquerda), então
 * da esquerda pra direita a ordem é a inversa da vez.
 */
export const relDe = (assento, eu, n) => (assento - eu + n) % n;

/** Faixa de cada adversário no alto, indexada pela posição relativa (1..n-1). */
export function faixasNoAlto(n, W, ins) {
  const outros = n - 1;
  const x0 = ins.left + 15;
  const largura = W - ins.left - ins.right - 30;
  const w = largura / outros;
  const faixas = [];
  for (let rel = 1; rel <= outros; rel++) {
    const col = outros - rel;
    faixas[rel] = { x0: x0 + col * w, x1: x0 + (col + 1) * w, cx: x0 + (col + 0.5) * w, w };
  }
  return faixas;
}
