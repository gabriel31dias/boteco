import React, { useEffect, useRef, useState } from 'react';
import { Trophy, XCircle, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida } from '../components/Chat';
import { net } from '../../net';
import { entrarTelaCheia, sairTelaCheia } from '../telaCheia';
import { Jogo } from '../../games/hockey/jogo.js';

type Fim = { vencedor: number | null; motivo: string };
type Pago = { prize?: number; empate?: boolean; wo?: boolean; desistiu?: boolean };

/**
 * Casca React do Air Hockey Neon: o canvas (games/hockey/jogo.js) desenha e lê
 * o dedo, o servidor simula a mesa. Aqui só a ponte e o resultado em dinheiro
 * no fim, igual aos outros jogos.
 */
export const HockeyScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!match || !canvas) return;
    // partida nova (revanche) não herda o resultado da anterior
    setFim(null); setPago(null);
    entrarTelaCheia();
    const jogo = new Jogo(canvas, {
      assento: match.seat,
      jogadores: match.players,
      onEntrada: (e: object) => net.jogada(e),
      onSair: () => { net.leave(); setMatch(null); },
      onCaiu: () => net.instavel(),
    });
    (window as any).__jogo = jogo;   // gancho do e2e
    // conexão caiu de vez: congela; o aviso e a contagem são da tela de partida (ConexaoPerdida)
    const offCaiu = net.on('caiu', () => jogo.destroy());
    const offEstado = net.on('estado', (e: { fim: Fim | null }) => {
      jogo.aplicar(e);
      if (e.fim) setTimeout(() => setFim(e.fim), 3500);
    });
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if (s.state) applyServerState(s.state);
      setPago(s);
      if (s.wo && !s.desistiu) setFim({ vencedor: match.seat, motivo: 'wo' });
    });
    const offLeft = net.on('left', () => showNotification('Adversário saiu da partida'));
    // primeiro toque destrava o som e a tela cheia (o navegador exige gesto)
    const toque = () => entrarTelaCheia();
    canvas.addEventListener('pointerdown', toque, { once: true });
    return () => {
      offEstado(); offSettled(); offLeft(); offCaiu();
      canvas.removeEventListener('pointerdown', toque);
      jogo.destroy();
      sairTelaCheia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  if (!match) return null;
  const emDinheiro = match.room.stake > 0;
  const ganhei = fim?.vencedor === match.seat;

  return (
    <div className="hockey fixed inset-0 z-40 bg-[#07040f] select-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm max-h-full overflow-y-auto bg-[#120a1f] border border-fuchsia-400/30 rounded-3xl p-6 text-center shadow-[0_0_60px_rgba(180,77,255,0.35)]">
            <div className="flex justify-center mb-3">
              {ganhei ? (
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-400">
                  <Trophy className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-700/40 border border-slate-500/50 flex items-center justify-center text-slate-300">
                  <XCircle className="w-8 h-8" />
                </div>
              )}
            </div>
            <h3 className="text-2xl font-black text-white">
              {ganhei ? 'Rei da mesa! 🏒🏆' : 'Levou de lavada… 🏒'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'gols' ? 'Quem fizer 7 gols primeiro leva'
                : fim.motivo === 'tempo' ? 'Mais gols quando o tempo acabou'
                : fim.motivo === 'ouro' ? 'Decidido no gol de ouro'
                : 'O adversário largou o taco'}
            </p>
            <div className="mt-4 min-h-[52px] flex items-center justify-center">
              {pago?.empate ? (
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Entrada devolvida para todos.
                </p>
              ) : pago ? (
                emDinheiro && ganhei ? (
                  <p className="text-lg font-black text-[#4ade80]">
                    + R$ {((pago.prize ?? 0) / 100).toFixed(2).replace('.', ',')}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {emDinheiro ? 'A entrada ficou com o vencedor.' : 'Partida sem valor de entrada.'}
                  </p>
                )
              ) : (
                <p className="text-xs text-gray-500">Confirmando o resultado com o servidor…</p>
              )}
            </div>
            <BotaoRevanche match={match} />
            <JogadoresDaPartida players={match.players} eu={match.players[match.seat]?.id} />
            <button
              onClick={() => setMatch(null)}
              className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-b from-[#f2141e] to-[#b80a12] text-white font-black text-sm active:scale-95 transition-all"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
