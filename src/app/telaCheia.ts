const noCelular = () => matchMedia('(pointer: coarse)').matches;

/**
 * Tela cheia de verdade no celular: a barra do navegador come altura, e é a
 * altura que limita o tamanho da mesa. Precisa de gesto do usuário — a entrada
 * automática costuma pegar carona na "ativação transitória" do clique na sala;
 * quando não pega, o primeiro toque na mesa resolve.
 */
export async function entrarTelaCheia() {
  if (!noCelular() || document.fullscreenElement) return;
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { return; }
}

export function sairTelaCheia() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
