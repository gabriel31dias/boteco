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

/**
 * Fim da partida: o resultado ("Você venceu") é lido em pé. Com tela cheia o
 * Android aceita travar em retrato e o celular vira sozinho; sem ela (iOS) não
 * há como forçar. Quem solta a trava é o `sairTelaCheia` ao deixar a mesa.
 */
export function ficarEmPe() {
  if (!noCelular()) return;
  try { (screen.orientation as any)?.lock?.('portrait')?.catch?.(() => {}); } catch { /* sem trava */ }
}

export function sairTelaCheia() {
  try { (screen.orientation as any)?.unlock?.(); } catch { /* sem trava */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
