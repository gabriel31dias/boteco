import React, { useEffect, useRef, useState } from 'react';
import { Trophy, XCircle, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida } from '../components/Chat';
import { net } from '../../net';
import { entrarTelaCheia, sairTelaCheia } from '../telaCheia';
import { Jogo } from '../../games/ultima/jogo.js';

type Fim = { vencedor: number | null; motivo: string };
type Pago = { prize?: number; empate?: boolean; wo?: boolean; desistiu?: boolean };

/**
 * Casca React da Última Carta: o canvas (games/ultima/jogo.js) desenha e lê
 * os toques, o servidor arbitra e esconde as mãos. Aqui só a ponte e o
 * resultado em dinheiro no fim, igual aos outros jogos.
 */
export const UltimaScreen: React.FC = () => {
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
    });
    (window as any).__jogo = jogo;   // gancho do e2e (como o __estado do AppContext)
    // conexão caiu de vez: congela; o aviso e a contagem são da tela de partida (ConexaoPerdida)
    const offCaiu = net.on('caiu', () => jogo.encerrar());
    const offEstado = net.on('estado', (e: { fim: Fim | null; fora?: boolean[] }) => {
      jogo.aplicar(e);
      // dormiu 3 vezes com 3–4 na mesa: está fora, a mesa segue sem ele; a entrada fica no pote
      if (!e.fim && e.fora?.[match.seat]) { setFim({ vencedor: -1, motivo: 'eliminado' }); setPago({}); }
      // deixa a última carta cair e a festa antes do resultado
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
  const empatou = fim?.vencedor === null;

  return (
    <div className="ultima fixed inset-0 z-40 bg-[#0c1630] select-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#140c2c] border border-purple-500/30 rounded-3xl p-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
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
              {empatou ? 'Empate' : ganhei ? 'Zerou a mão! 🃏👑' : 'Não foi dessa vez 🃏'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'bateu' ? (ganhei ? 'Você jogou a última carta primeiro' : 'Alguém jogou a última carta antes')
                : fim.motivo === 'eliminado' || (fim.motivo === 'wo' && !ganhei) ? 'Você ficou sem jogar 3 vezes e saiu da mesa'
                : fim.motivo === 'wo' ? (match.players.length > 2 ? 'Os outros saíram da mesa' : 'O adversário saiu da mesa')
                : 'Fim da partida'}
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
              onClick={() => { if (fim.motivo === 'eliminado') net.leave(); setMatch(null); }}
              className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm active:scale-95 transition-all"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
