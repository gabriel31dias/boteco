// Celular em pé: a partida de sinuca gira 90° pra ficar igual ao desktop (paisagem).
// O giro é CSS (classe no <html>, ver index.css); aqui só se desfaz o giro do toque.
export const girada = () => document.documentElement.classList.contains('mesa-girada')

/**
 * clientX/Y -> coordenadas da página como se não houvesse giro.
 * rotate(90deg) translateY(-100%) leva (x, y) a (vw - y, x); o inverso é este.
 */
export const ponto = (e) => (girada() ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY })

/** Deslocamento de tela -> deslocamento no referencial da mesa. */
export const desgira = (dx, dy) => (girada() ? [dy, -dx] : [dx, dy])
