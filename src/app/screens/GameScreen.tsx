import React, { useEffect, useRef, useState } from 'react';
import { Trophy, XCircle, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida, JogadorCard } from '../components/Chat';
import { net } from '../../net';
(window as any).__net = net;
import { Renderer } from '../../render.js';
import { Sinuca } from '../../sinuca.js';
import { entrarTelaCheia, sairTelaCheia } from '../telaCheia';
import '../../style.css';
// Vite carimba hash no nome: o service worker é cache-first e ficaria com a
// arte velha pra sempre se o arquivo morasse em public/.
import logo from '../../assets/sinuca/logo.webp';
import avatarAzul from '../../assets/sinuca/avatar-azul.webp';
import avatarVermelho from '../../assets/sinuca/avatar-vermelho.webp';
import iconePessoas from '../../assets/sinuca/pessoas.webp';
import iconeSom from '../../assets/sinuca/som.webp';
import botaoSair from '../../assets/sinuca/sair.webp';
import iconeMenu from '../../assets/sinuca/menu.webp';
import iconeEngrenagem from '../../assets/sinuca/engrenagem.webp';
import iconeChat from '../../assets/sinuca/chat.webp';
import iconeCamera from '../../assets/sinuca/camera.webp';

const brl = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

type Fim = { won: boolean | null; reason: string; names: string[] };

type Pago = { prize?: number; disputed?: boolean; wo?: boolean };

/**
 * A ponte: a mesa é imperativa (Pixi + física própria), o resto do app é React.
 * A HUD abaixo é JSX com os MESMOS ids que o jogo procura por querySelector —
 * por isso o `sinuca.js` não precisou saber que virou componente.
 */
export const GameScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const jogoRef = useRef<{ destroy: () => void } | null>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [perfil, setPerfil] = useState<{ id: number; name: string; avatar?: string | null; level?: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!match || !host) return;
    let vivo = true;
    let renderer: any = null;

    // O canvas é criado aqui, não no JSX: o destroy do Pixi arranca o elemento
    // do DOM, e no StrictMode (que monta duas vezes) o segundo jogo nasceria
    // num canvas que o primeiro já tinha levado embora.
    const canvas = document.createElement('canvas');
    canvas.id = 'game';
    host.insertBefore(canvas, host.firstChild);

    entrarTelaCheia();
    const noToque = () => entrarTelaCheia();
    host.addEventListener('pointerdown', noToque);

    Renderer.create(canvas).then((r: any) => {
      renderer = r;
      if (!vivo) { r.destroy(); return; }
      // window.__sinuca / __net: ganchos de console e do e2e — o app não lê isso.
      jogoRef.current = (window as any).__sinuca = new Sinuca(r, {
        net,
        seed: match.seed,
        seat: match.seat,
        modo: match.game,   // sinuca (bola 8), sinuca9, sinuca10, sinucabr, snooker
        players: match.players,
        onFinish: (f: Fim) => setFim(f),
        onExit: () => sair(),
      });
    });

    const offSettled = net.on('settled', (s: any) => {
      if (s.state) applyServerState(s.state);
      setPago(s);
      // `desistiu` marca o próprio W.O.: quem saiu não pode ver "você venceu".
      if (s.wo && !s.desistiu) setFim((f) => f ?? { won: true, reason: 'Adversário desistiu', names: [] });
    });
    const offLeft = net.on('left', () => showNotification('Adversário saiu da partida'));

    return () => {
      vivo = false;
      if (jogoRef.current) jogoRef.current.destroy();   // já leva o renderer junto
      else renderer?.destroy();
      jogoRef.current = null;
      canvas.remove();
      host.removeEventListener('pointerdown', noToque);
      sairTelaCheia();
      offSettled();
      offLeft();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  const sair = () => {
    net.leave();
    setMatch(null);
  };

  if (!match) return null;
  const emDinheiro = match.room.stake > 0;

  return (
    <div className="sinuca" ref={hostRef}>
      <div id="hud">
        <div className="topo">
          {/* Assento = lado: 0 é o azul, 1 o vermelho. Sem foto, fica o avatar da arte. */}
          {[0, 1].map((i) => (
            <div key={i} className={`player p${i}`}>
              <img className="foto" src={match.players[i]?.avatar || (i ? avatarVermelho : avatarAzul)} alt="" />
              <span className="name" /><div className="balls" /><span className="score" />
            </div>
          ))}
          <img className="logo" src={logo} alt="Sinuca Aposta" />
        </div>

        {/* ponytail: menu, engrenagem e modo são a arte da referência;
            ainda não têm ação dentro da partida. */}
        <img className="canto menu" src={iconeMenu} alt="" />
        <img className="canto engrenagem" src={iconeEngrenagem} alt="" />
        <button id="som" className="canto" aria-label="Som"><img src={iconeSom} alt="" /></button>

        <div className="lateral">
          {/* O adversário abre o cartão dele (adicionar amigo). */}
          <button aria-label="Ver perfil do adversário"
            onClick={() => setPerfil(match.players[1 - match.seat] ?? null)}>
            <img src={iconePessoas} alt="" />
          </button>
          <button aria-label="Reações"
            onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Mandar uma reação"]')?.click()}>
            <img src={iconeChat} alt="" />
          </button>
          <button id="camera" aria-label="Girar a mesa (deitada ou em pé)"><img src={iconeCamera} alt="" /></button>
        </div>

        <div className="info">
          <div className="painel tempo"><small>TEMPO</small><b id="relogio" /></div>
        </div>

        <div id="banner" />
        <div id="toast" />

        <div id="power"><div className="track"><div className="fill" /><div className="knob" /></div></div>
        <div id="spin"><canvas width={120} height={120} /></div>

        <div className="rodape">
          {/* Boteco: sem modo (bola 8/torneio/rápido) e sem o selo de aposta — liberam espaço da mesa. */}
          <button id="menu-btn" aria-label="Sair da mesa"><img src={botaoSair} alt="Sair da mesa" /></button>
        </div>
      </div>

      <JogadorCard jogador={perfil} onClose={() => setPerfil(null)} />

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#140c2c] border border-purple-500/30 rounded-3xl p-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
            <div className="flex justify-center mb-3">
              {fim.won ? (
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
              {fim.won ? 'Você venceu!' : 'Você perdeu'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">{fim.reason}</p>

            <div className="mt-4 min-h-[52px] flex items-center justify-center">
              {pago?.disputed ? (
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Os dois lados relataram resultados diferentes — entrada estornada.
                </p>
              ) : pago ? (
                emDinheiro && fim.won ? (
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
