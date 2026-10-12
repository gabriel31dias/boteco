import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Trophy, XCircle, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida, JogadorCard } from '../components/Chat';
import { net } from '../../net';
import BootScene from '../../games/domino/scenes/BootScene.js';
import GameScene from '../../games/domino/GameScene.js';
import UIScene from '../../games/domino/scenes/UIScene.js';
import { audio } from '../../games/domino/audio/audio.js';
import { AvisoPrazo } from '../components/AvisoPrazo';

type Fim = { vencedor: number | null; motivo: string };
type Estado = {
  assento: number; vez: number; rodada: number; placar: number[]; fase: string; prazo: number; fim: Fim | null;
};
type Pago = { prize?: number; empate?: boolean; wo?: boolean; desistiu?: boolean; winners?: number[]; timeVencedor?: number };

/**
 * Casca React do dominó. Mesma ponte da velha, com uma diferença que importa:
 * aqui o estado é por assento (mão escondida), então o que chega já vem
 * filtrado pelo servidor.
 */
export const DominoScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const jogoRef = useRef<Phaser.Game | null>(null);
  const pendenteRef = useRef<Estado | null>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  // Cartão de quem eu toquei na mesa (a cena Phaser chama onPerfil).
  const [perfil, setPerfil] = useState<{ id: number; name: string; avatar?: string | null; level?: number } | null>(null);
  // Estourar o prazo é W.O.: os dois veem a contagem nos últimos segundos.
  const [relogio, setRelogio] = useState<{ prazo: number; vez: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!match || !host) return;
    let vivo = true;
    audio.unlock();

    const sair = () => { net.leave(); setMatch(null); };

    const jogo = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: '#05060f',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60 },
      scene: [BootScene, GameScene, UIScene],
    });
    jogoRef.current = jogo;

    // O Phaser não acompanha o tamanho do container sozinho quando ele é um div
    // do React: o observer garante que o canvas siga a tela (e a virada do
    // celular) em vez de congelar na medida do primeiro frame.
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w && h) jogo.scale.resize(w, h);
    });
    observer.observe(host);

    // O Boot gera as texturas das peças e só então abre a mesa; os dados da
    // partida esperam no registry.
    jogo.registry.set('mp', {
      seat: match.seat,
      players: match.players,
      duplas: match.game === 'domino-duplas',
      onPerfil: (p: { id: number; name: string; avatar?: string | null; level?: number }) => setPerfil(p),
      onJogada: (acao: Record<string, unknown>) => net.jogada(acao),
      onSair: sair,
      // O Phaser sobe assíncrono: o primeiro estado costuma chegar antes de a
      // cena existir. Ela puxa o último estado quando estiver pronta.
      getEstado: () => pendenteRef.current,
    });

    /** A cena só aceita estado depois do create(); `match` é a prova disso. */
    const cenaPronta = () => {
      const c = jogo.scene.getScene('Game') as (GameScene & { match?: unknown }) | null;
      return c?.match ? c : null;
    };

    const offEstado = net.on('estado', (e: Estado) => {
      pendenteRef.current = e;
      cenaPronta()?.aplicar(e);
      if (e.fim) setFim(e.fim);
      setRelogio(e.fim ? null : { prazo: e.prazo, vez: e.vez });
    });

    // O Phaser boota quando quer. Enquanto a cena não existe, o estado fica
    // guardado; assim que ela nasce, entra o último que chegou.
    const espera = setInterval(() => {
      const c = cenaPronta();
      if (!c) return;
      clearInterval(espera);
      observer.disconnect();
      if (pendenteRef.current) c.aplicar(pendenteRef.current);
    }, 100);
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if ((s as { state?: unknown }).state) applyServerState((s as { state: never }).state);
      setPago(s);
      // W.O.: com 3 ou 4 na mesa quem fica não ganha necessariamente — o servidor diz quem levou.
      if (s.wo && !s.desistiu) setFim({ vencedor: s.timeVencedor ?? null, motivo: 'wo' });
    });
    // Individual com 3+: quem sai é eliminado e a partida continua sem ele.
    const offLeft = net.on('left', () => showNotification(
      match.players.length > 2 && match.game === 'domino' ? 'Um jogador saiu — a partida continua' : 'Adversário saiu da partida'));

    return () => {
      vivo = false;
      clearInterval(espera);
      offEstado();
      offSettled();
      offLeft();
      jogo.destroy(true);
      jogoRef.current = null;
      // pendenteRef NÃO é limpo: no StrictMode o efeito monta duas vezes, e o
      // primeiro `estado` (que veio da fila e só existe uma vez) morreria aqui.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  if (!match) return null;
  const emDinheiro = match.room.stake > 0;
  // `fim.vencedor` é um time: nas duplas a paridade, no individual o assento.
  // Quando o dinheiro já caiu, a lista de vencedores do servidor é a verdade.
  const duplas = match.game === 'domino-duplas';
  const meuId = match.players[match.seat]?.id;
  const ganhei = pago?.winners ? pago.winners.includes(meuId)
    : fim?.vencedor === (duplas ? match.seat % 2 : match.seat);
  const empatou = fim?.vencedor === null && !pago?.winners;
  const vencedorNome = !duplas && fim?.vencedor != null ? match.players[fim.vencedor]?.name : null;

  return (
    <div className="fixed inset-0 z-40 bg-[#0a0d12]">
      <div ref={hostRef} className="absolute inset-0" />

      {/* Em cima: embaixo fica a mão de peças. */}
      {!fim && <AvisoPrazo prazo={relogio?.prazo ?? null} minhaVez={relogio?.vez === match.seat} className="top-[22%]" />}

      <JogadorCard jogador={perfil} onClose={() => setPerfil(null)} />

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
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
              {empatou ? 'Empate' : ganhei ? 'Você venceu!' : 'Você perdeu'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'wo' ? (ganhei ? 'Um adversário saiu da mesa' : 'Alguém saiu da mesa')
                : fim.motivo === 'tempo' ? (ganhei ? 'O adversário não jogou a tempo' : 'Você não jogou a tempo')
                : fim.motivo === 'abandono' ? (ganhei ? 'Os outros saíram da mesa' : 'Você saiu da mesa')
                : !ganhei && vencedorNome && match.players.length > 2 ? `${vencedorNome} chegou primeiro aos 50 pontos`
                : 'Primeiro a 50 pontos'}
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
