import { batida, ehCuringa, vizinhas } from './regras.js';

/**
 * Jogador automático simples: bate se der; pega o lixo quando a carta de cima
 * conversa com a mão; descarta a carta mais solta (nunca o curinga). Lê só o
 * estado do próprio assento (o mesmo que o navegador recebe). Serve de
 * adversário na mesa de teste e de cliente nos testes do servidor.
 *
 * @returns {{tipo: 'comprar'|'lixo'|'descartar'|'bater', carta?: string} | null}
 */
export function jogadaBot(e) {
  if (e.fim || e.resultado || e.vez !== e.assento || !e.mao) return null;
  const { mao, vira } = e;
  const ligadas = (c, cartas) => cartas.filter((o) => vizinhas(c, o, vira)).length;

  if (e.fase === 'comprar') {
    const topo = e.lixo;
    if (topo && (batida([...mao, topo], vira, { proibida: topo }) || ligadas(topo, mao) >= 2)) return { tipo: 'lixo' };
    return { tipo: 'comprar' };
  }

  const b = batida(mao, vira, { proibida: e.doLixo });
  if (b) return { tipo: 'bater', carta: b.descarte ?? undefined };
  const opcoes = mao.filter((c) => c !== e.doLixo && !ehCuringa(c, vira));
  const lista = opcoes.length ? opcoes : mao.filter((c) => c !== e.doLixo);
  const solta = lista.reduce((m, c) => (ligadas(c, mao) < ligadas(m, mao) ? c : m));
  return { tipo: 'descartar', carta: solta };
}
