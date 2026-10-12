/**
 * Calcula onde cada peça da corrente fica na mesa. Camada pura (sem Phaser):
 * recebe a corrente lógica + o espaço disponível, devolve posição/ângulo/limites.
 *
 * A corrente anda na horizontal até encher a linha, faz a curva (desce uma peça
 * e volta na direção oposta, como no dominó real) e segue. É isso que mantém
 * tudo dentro da tela em celular.
 */

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const RIGHT = 0, DOWN = 1, LEFT = 2;
export const isHoriz = (d) => d === RIGHT || d === LEFT;

export function layoutChain(chain, opt) {
  const { tileL, tileW, gap, maxRow } = opt;
  const tiles = [];
  let dir = RIGHT, rowDir = RIGHT, phase = 'row', rowUsed = 0;
  let attach = { x: 0, y: 0 };
  let first = true;

  /** Decide a direção da próxima peça sem colocá-la (serve p/ o fantasma). */
  const nextDir = (isDouble, along) => {
    if (first) return RIGHT;
    if (isDouble) return dir; // carroça nunca faz a curva: ela é curta demais
    if (phase === 'row' && rowUsed + gap + along > maxRow) return DOWN;
    if (phase === 'turnBack') return rowDir === RIGHT ? LEFT : RIGHT;
    return dir;
  };

  /** Posição de uma peça hipotética na ponta direita, dada a direção. */
  const project = (nd, along) => {
    if (first) return { x: 0, y: 0 };
    if (nd === dir) {
      return { x: attach.x + DX[dir] * (gap + along / 2), y: attach.y + DY[dir] * (gap + along / 2) };
    }
    const hx = attach.x + DX[dir] * (gap + tileW / 2);
    const hy = attach.y + DY[dir] * (gap + tileW / 2);
    return { x: hx + DX[nd] * (along / 2 - tileW / 2), y: hy + DY[nd] * (along / 2 - tileW / 2) };
  };

  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  for (const entry of chain) {
    const along = entry.double ? tileW : tileL;
    const cross = entry.double ? tileL : tileW;
    const nd = nextDir(entry.double, along);
    const c = project(nd, along);

    if (nd !== dir) {
      if (phase === 'row') phase = 'turnBack';
      else { phase = 'row'; rowDir = nd; rowUsed = along; }
      dir = nd;
    } else if (isHoriz(dir)) {
      rowUsed += (first ? 0 : gap) + along;
    }
    if (phase === 'row' && nd !== dir) rowUsed = along;

    const angle = (dir * 90 + (entry.double ? 90 : 0)) % 360;
    tiles.push({ x: c.x, y: c.y, angle, dir, entry, double: !!entry.double });

    const w = isHoriz(dir) ? along : cross;
    const h = isHoriz(dir) ? cross : along;
    if (first) { minX = c.x - w / 2; maxX = c.x + w / 2; minY = c.y - h / 2; maxY = c.y + h / 2; }
    else {
      minX = Math.min(minX, c.x - w / 2); maxX = Math.max(maxX, c.x + w / 2);
      minY = Math.min(minY, c.y - h / 2); maxY = Math.max(maxY, c.y + h / 2);
    }
    attach = { x: c.x + DX[dir] * (along / 2), y: c.y + DY[dir] * (along / 2) };
    first = false;
  }

  // Âncoras: onde entraria a próxima peça em cada ponta.
  const ndR = nextDir(false, tileL);
  const right = { ...project(ndR, tileL), angle: (ndR * 90) % 360, dir: ndR };
  const t0 = tiles[0];
  const left = t0
    ? {
        x: t0.x - (t0.double ? tileW : tileL) / 2 - gap - tileL / 2,
        y: t0.y,
        angle: 0,
        dir: RIGHT,
      }
    : { x: 0, y: 0, angle: 0, dir: RIGHT };
  if (!tiles.length) { right.x = 0; right.y = 0; }

  const bounds = {
    minX: Math.min(minX, left.x - tileL / 2, right.x - tileL / 2),
    maxX: Math.max(maxX, left.x + tileL / 2, right.x + tileL / 2),
    minY: Math.min(minY, left.y - tileL / 2, right.y - tileL / 2),
    maxY: Math.max(maxY, left.y + tileL / 2, right.y + tileL / 2),
  };
  bounds.width = bounds.maxX - bounds.minX;
  bounds.height = bounds.maxY - bounds.minY;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  for (const t of tiles) { t.x -= cx; t.y -= cy; }
  for (const a of [left, right]) { a.x -= cx; a.y -= cy; }
  bounds.minX -= cx; bounds.maxX -= cx; bounds.minY -= cy; bounds.maxY -= cy;

  return { tiles, left, right, bounds };
}

/** AABB de uma peça já posicionada — usado no teste de sobreposição. */
export function tileRect(t, tileL, tileW) {
  const along = t.double ? tileW : tileL;
  const cross = t.double ? tileL : tileW;
  const w = isHoriz(t.dir) ? along : cross;
  const h = isHoriz(t.dir) ? cross : along;
  return { x1: t.x - w / 2, y1: t.y - h / 2, x2: t.x + w / 2, y2: t.y + h / 2 };
}
