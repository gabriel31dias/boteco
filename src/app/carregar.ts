/**
 * Pré-carrega as imagens de um jogo e conta o progresso (pra tela de
 * carregamento). Começa já na sala de espera (Lobby), então quando a partida
 * abre quase sempre está tudo no cache e a barra enche na hora.
 * Um carregamento por jogo, reaproveitado (revanche não baixa de novo).
 */
const TODAS = import.meta.glob('../assets/*/*.{webp,png,jpg,jpeg}', { eager: true, import: 'default' }) as Record<string, string>;

/** Pastas de src/assets que cada jogo usa (cacheta pega cartas do buraco, galinhas os efeitos dos psicopatas). */
const PASTAS: Record<string, string[]> = {
  sinuca: ['sinuca'], sinuca9: ['sinuca'], sinuca10: ['sinuca'], sinucabr: ['sinuca'], snooker: ['sinuca'], truco: ['truco'], poker: ['poker'], buraco: ['buraco'], cacheta: ['cacheta', 'buraco'],
  damas: ['damas'], tanque: ['tanque'], ratos: ['ratos'], capivara: ['capivara'], psicopatas: ['psicopatas'],
  galinhas: ['galinhas', 'psicopatas'], cobras: ['cobras'], arqueiros: ['arqueiros'], naval: ['naval'], forca: ['forca'], golfe: ['golfe'], ultima: ['ultima'], patos: ['patos'], botao: ['botao'],
};

export const baseDoJogo = (jogo: string) => jogo.replace(/-duplas$/, '');

type Carga = { feitas: number; total: number; pronto: Promise<void>; ouvintes: Set<(f: number) => void> };
const cargas = new Map<string, Carga>();

export function carregar(jogo: string): Carga {
  const base = baseDoJogo(jogo);
  const ja = cargas.get(base);
  if (ja) return ja;
  const pastas = PASTAS[base] ?? [];
  const urls = Object.entries(TODAS).filter(([k]) => pastas.includes(k.split('/')[2])).map(([, url]) => url);
  const c: Carga = { feitas: 0, total: urls.length, pronto: Promise.resolve(), ouvintes: new Set() };
  const uma = () => { c.feitas++; for (const f of c.ouvintes) f(c.feitas / c.total); };
  c.pronto = Promise.all(urls.map((url) => new Promise<void>((ok) => {
    const im = new Image();
    // erro também conta: imagem quebrada não pode travar a partida na tela de carregamento
    const fim = () => { uma(); ok(); };
    im.onload = () => (im.decode ? im.decode().then(fim, fim) : fim());
    im.onerror = fim;
    im.src = url;
  }))).then(() => undefined);
  cargas.set(base, c);
  return c;
}

/** Fração já carregada (0..1); jogo sem imagens próprias conta como pronto. */
export const progresso = (c: Carga) => (c.total ? c.feitas / c.total : 1);
