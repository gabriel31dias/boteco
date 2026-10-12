import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { AlertTriangle, ArrowLeft, MessageCircle, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida, JogadorCard } from '../components/Chat';
import { net } from '../../net';
import { Boot, Match as MatchScene } from '../../games/damas/game.js';
import { audio } from '../../games/damas/audio.js';
import '../../games/damas/damas.css';
import logo from '../../assets/damas/logo.webp';
import saldoImg from '../../assets/damas/saldo.webp';
import apostarImg from '../../assets/damas/apostar.webp';
import vitoriaImg from '../../assets/damas/vitoria.webp';
import derrotaImg from '../../assets/damas/derrota.webp';
import coroaImg from '../../assets/damas/coroa.webp';
import iconeTorneio from '../../assets/damas/torneio.webp';
import iconeRanking from '../../assets/damas/ranking.webp';
import iconeEngrenagem from '../../assets/damas/engrenagem.webp';
import iconeSom from '../../assets/damas/som.webp';
import iconeMenu from '../../assets/damas/menu.webp';
import falaBoa from '../../assets/damas/fala-boa.webp';
import falaAgoraVai from '../../assets/damas/fala-agora-vai.webp';
import falaQueJogada from '../../assets/damas/fala-que-jogada.webp';
import falaHaha from '../../assets/damas/fala-haha.webp';
import falaValeu from '../../assets/damas/fala-valeu.webp';

// Avatares da arte com as 8 expressões: sem foto, o jogador vira o personagem
// e ele reage (ri, comemora) quando come peça ou manda fala.
const EXPRESSOES = {
  azul: Object.values(import.meta.glob('../../assets/damas/avatar-azul-*.webp', { eager: true, import: 'default' })) as string[],
  vermelho: Object.values(import.meta.glob('../../assets/damas/avatar-vermelho-*.webp', { eager: true, import: 'default' })) as string[],
};
import avatarAzul from '../../assets/damas/avatar-azul.webp';
import avatarVermelho from '../../assets/damas/avatar-vermelho.webp';

const FALAS: [string, string][] = [['Boa!', falaBoa], ['Agora vai!', falaAgoraVai], ['Que jogada!', falaQueJogada],
  ['Haha!', falaHaha], ['Valeu!', falaValeu]];
const EMOJIS = ['👏', '😂', '😱', '🔥', '😎', '🙏', '👍', '😡'];
const brl = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
type Jogador = { id: number; name: string; avatar?: string | null; level?: number };

type Fim = { vencedor: number | null; motivo: string };
type Estado = { assento: number; vez: number; tabuleiro: number[]; lances: unknown[]; prazo: number; fim: Fim | null };
type Pago = { prize?: number; empate?: boolean; wo?: boolean; desistiu?: boolean };

/**
 * Casca React das damas. Informação perfeita: o tabuleiro inteiro vai pros dois.
 * Quem decide o que é lance legal é o servidor — o cliente só desenha e resolve
 * o toque contra a lista que recebeu.
 */
export const DamasScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification, walletBalance, bonusBalance } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const jogoRef = useRef<Phaser.Game | null>(null);
  const pendenteRef = useRef<Estado | null>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  // Cartão de quem eu toquei na mesa (a cena Phaser chama onPerfil).
  const [perfil, setPerfil] = useState<{ id: number; name: string; avatar?: string | null; level?: number } | null>(null);
  // Estourar o prazo é W.O.: o relógio fica no cartão de quem joga.
  const [relogio, setRelogio] = useState<{ prazo: number; vez: number } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [tabuleiro, setTabuleiro] = useState<number[]>([]);
  const [falas, setFalas] = useState<{ id: number; assento: number; texto: string }[]>([]);
  const [reagindo, setReagindo] = useState<Record<number, number>>({});   // assento -> quadro da expressão
  const [espera, setEspera] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [confirma, setConfirma] = useState(false);
  const [mudo, setMudo] = useState(!audio.on);
  // Em pé é o padrão em qualquer tela; a engrenagem deita a mesa (e lembra).
  const [deitado, setDeitado] = useState(() => { try { return localStorage.getItem('damas.deitado') === '1'; } catch { return false; } });
  const girar = () => setDeitado((d) => {
    try { localStorage.setItem('damas.deitado', d ? '0' : '1'); } catch { /* modo privado */ }
    return !d;
  });

  /** Personagem da arte passa pelas 8 expressões e volta pra padrão. */
  const reagir = (assento: number) => {
    for (let q = 0; q <= 8; q++) {
      setTimeout(() => setReagindo((r) => {
        const n = { ...r };
        if (q === 8) delete n[assento]; else n[assento] = q;
        return n;
      }), q * 140);
    }
  };
  const falar = (assento: number, texto: string) => {
    const id = Date.now() + Math.random();
    setFalas((f) => [...f.filter((x) => x.assento !== assento), { id, assento, texto }]);
    setTimeout(() => setFalas((f) => f.filter((x) => x.id !== id)), 2600);
    reagir(assento);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!match || !host) return;
    let vivo = true;
    audio.resume();

    const sair = () => { net.leave(); setMatch(null); };

    const jogo = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      transparent: true,                       // o cenário é o CSS do palco
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60 },
      scene: [Boot, MatchScene],
    });
    jogoRef.current = jogo;
    // Gancho de console/e2e, como o `window.__sinuca` da mesa: o app não lê.
    if (import.meta.env.DEV) (window as unknown as { __damas: unknown }).__damas = jogo;

    // O Phaser não acompanha o tamanho do container sozinho quando ele é um div
    // do React: o observer garante que o canvas siga a tela (e a virada do
    // celular) em vez de congelar na medida do primeiro frame.
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w && h) jogo.scale.resize(w, h);
    });
    observer.observe(host);

    // O Boot gera as texturas do tabuleiro e só então abre a partida; os dados
    // esperam no registry.
    jogo.registry.set('mp', {
      seat: match.seat,
      players: match.players,
      onPerfil: (p: { id: number; name: string; avatar?: string | null; level?: number }) => setPerfil(p),
      onJogada: (acao: Record<string, unknown>) => net.jogada(acao),
      onSair: sair,
      // O Phaser sobe assíncrono: o primeiro estado costuma chegar antes de a
      // cena existir. Ela puxa o último estado quando estiver pronta.
      getEstado: () => pendenteRef.current,
    });

    /** A cena só aceita estado depois do create(); `lances` é a prova disso. */
    const cenaPronta = () => {
      const c = jogo.scene.getScene('Match') as unknown as ({ lances?: unknown; aplicar(e: Estado): void }) | null;
      return c?.lances ? c : null;
    };

    const pecas = (t: number[]) => [t.filter((v) => v > 0).length, t.filter((v) => v < 0).length];
    let antes: number[] | null = null;
    const offEstado = net.on('estado', (e: Estado) => {
      // quem comeu peça comemora: o outro lado perdeu peças (assento 0 = positivas)
      const agora = pecas(e.tabuleiro);
      if (antes) [0, 1].forEach((a) => { if (agora[1 - a] < antes![1 - a]) reagir(a); });
      antes = agora;
      setTabuleiro(e.tabuleiro);
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
      // o observer continua: a engrenagem muda o tamanho do palco sem mexer na janela
      if (pendenteRef.current) c.aplicar(pendenteRef.current);
    }, 100);
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if ((s as { state?: unknown }).state) applyServerState((s as { state: never }).state);
      setPago(s);
      if (s.wo && !s.desistiu) setFim({ vencedor: match.seat, motivo: 'wo' });
    });
    const offLeft = net.on('left', () => showNotification('Adversário saiu da partida'));
    const offReacao = net.on('reacao', (r: { assento: number; emoji: string }) => falar(r.assento, r.emoji));

    return () => {
      vivo = false;
      clearInterval(espera);
      observer.disconnect();       // senão ele redimensiona um Phaser já destruído
      offEstado();
      offSettled();
      offLeft();
      offReacao();
      jogo.destroy(true);
      jogoRef.current = null;
      // pendenteRef NÃO é limpo: no StrictMode o efeito monta duas vezes, e o
      // primeiro `estado` (que veio da fila e só existe uma vez) morreria aqui.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  // Engrenagem: o palco muda de proporção sem a janela mudar. O Phaser mede no
  // quadro seguinte, com o CSS novo já aplicado (o observer chegava um passo atrasado).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const h = hostRef.current;
      if (h?.clientWidth && jogoRef.current) jogoRef.current.scale.resize(h.clientWidth, h.clientHeight);
    });
    return () => cancelAnimationFrame(id);
  }, [deitado]);

  useEffect(() => {
    if (!relogio?.prazo) return;
    const tick = () => setSegundos(Math.max(0, Math.ceil((relogio.prazo - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [relogio?.prazo]);

  if (!match) return null;
  const emDinheiro = match.room.stake > 0;
  const ganhei = fim?.vencedor === match.seat;
  const empatou = fim?.vencedor === null;
  const eu = match.seat;

  const mandar = (texto: string) => {
    if (espera || fim) return;
    net.emit('reacao', { emoji: texto });
    setEspera(true);                                  // o servidor aceita uma a cada 1,5s
    setTimeout(() => setEspera(false), 1500);
    setEmojis(false);
  };
  const desistir = () => {
    if (!confirma) { setConfirma(true); setTimeout(() => setConfirma(false), 3000); return; }
    net.leave(); setMatch(null);
  };

  // Cartão de cada assento: 0 é o azul (pretas), 1 o vermelho (vermelhas), como na arte.
  const cartao = (assento: number) => {
    const j: Jogador | undefined = match.players[assento];
    const cor = assento === 0 ? 'azul' : 'vermelho';
    const quadro = reagindo[assento];
    const foto = j?.avatar || (quadro !== undefined ? EXPRESSOES[cor][quadro] : assento === 0 ? avatarAzul : avatarVermelho);
    const damas = tabuleiro.filter((v) => (assento === 0 ? v === 2 : v === -2)).length;
    const daVez = !fim && relogio?.vez === assento;
    const fala = falas.find((f) => f.assento === assento);
    return (
      <div className={`cartao ${cor} ${daVez ? 'vez' : ''}`}>
        <button className="foto" disabled={assento === eu} onClick={() => j && setPerfil(j)} aria-label={`Ver perfil de ${j?.name ?? ''}`}>
          <img src={foto} alt="" />
        </button>
        <div className="dados">
          <span className="nome">🇧🇷 {assento === eu ? 'Você' : j?.name ?? '—'}</span>
          <span className="valor"><i />{emDinheiro ? brl(match.room.stake) : 'Grátis'}</span>
          <span className="coroas" aria-label={`${damas} damas`}>
            {[0, 1, 2, 3].map((i) => <img key={i} src={coroaImg} alt="" className={i < damas ? 'on' : ''} />)}
          </span>
        </div>
        <span className={`tempo ${daVez && segundos <= 10 ? 'urgente' : ''}`}>⏱ {daVez ? mmss(segundos) : '--:--'}</span>
        {fala && (
          <span key={fala.id} className="fala">
            {FALAS.find(([t]) => t === fala.texto) ? <img src={FALAS.find(([t]) => t === fala.texto)![1]} alt={fala.texto} /> : fala.texto}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={`damas ${deitado ? 'deitado' : ''}`}>
      <div className="palco">
        <div ref={hostRef} className="mesa" />

        <div className="saldo"><img src={saldoImg} alt="" /><b>{brl(Math.round((walletBalance + bonusBalance) * 100))}</b></div>
        <button className="voltar" onClick={desistir} aria-label="Desistir da partida"><ArrowLeft /></button>
        <img className="logo" src={logo} alt="Dama Aposta" />
        {/* ponytail: torneio, ranking e menu são a arte; sem ação na partida */}
        <img className="icone torneio" src={iconeTorneio} alt="" />
        <img className="icone ranking" src={iconeRanking} alt="" />
        <button className="icone engrenagem" onClick={girar} aria-label={deitado ? 'Ver a mesa em pé' : 'Ver a mesa deitada'}>
          <img src={iconeEngrenagem} alt="" />
        </button>
        <button className={`icone som ${mudo ? 'mudo' : ''}`} aria-label="Som"
          onClick={() => { audio.setEnabled(!audio.on); setMudo(!audio.on); }}><img src={iconeSom} alt="" /></button>
        <img className="icone menu" src={iconeMenu} alt="" />

        <div className="lado a">{cartao(0)}</div>
        <div className="lado b">{cartao(1)}</div>

        <div className="falas">
          {FALAS.map(([t, img]) => (
            <button key={t} disabled={espera || !!fim} onClick={() => mandar(t)}><img src={img} alt={t} /></button>
          ))}
        </div>

        <div className="aposta">
          <small>VALOR DA APOSTA</small>
          <b>{emDinheiro ? brl(match.room.stake) : 'GRÁTIS'}</b>
          <span>{emDinheiro ? `vencedor leva ${brl(match.room.prize)}` : 'partida sem valor'}</span>
        </div>
        <div className="apostar">
          <img src={apostarImg} alt="" />
          <span><small>EM JOGO</small><b>{emDinheiro ? brl(match.room.prize) : 'GRÁTIS'}</b></span>
        </div>
        <button className={`quadrado desistir ${confirma ? 'confirma' : ''}`} onClick={desistir}>
          <Users /><span>{confirma ? 'TOCA DE NOVO' : 'DESISTIR'}</span>
        </button>
        <button className="quadrado chat" onClick={() => setEmojis((v) => !v)} aria-expanded={emojis}>
          <MessageCircle /><span>CHAT</span>
        </button>
        {emojis && (
          <div className="emojis" role="menu">
            {EMOJIS.map((e) => <button key={e} role="menuitem" disabled={espera} onClick={() => mandar(e)}>{e}</button>)}
          </div>
        )}
      </div>

      <JogadorCard jogador={perfil} onClose={() => setPerfil(null)} />

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#1b1008] border border-amber-500/40 rounded-3xl p-6 pt-2 text-center shadow-[0_0_50px_rgba(245,158,11,0.35)]">
            {!empatou && <img src={ganhei ? vitoriaImg : derrotaImg} alt={ganhei ? 'Vitória' : 'Derrota'} className="w-60 mx-auto -mt-16 drop-shadow-2xl" />}
            {empatou && <h3 className="text-2xl font-black text-white mt-4">Empate</h3>}
            <p className="text-xs text-gray-300 mt-1">
              {fim.motivo === 'wo' ? 'Adversário desistiu'
                : fim.motivo === 'tempo' ? (ganhei ? 'O adversário não jogou a tempo' : 'Você não jogou a tempo')
                : fim.motivo === 'empate' ? 'Empate: 40 lances sem captura'
                : 'Sem lances possíveis'}
            </p>

            <div className="mt-4 min-h-[52px] flex items-center justify-center">
              {pago?.empate ? (
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Entrada devolvida para os dois.
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
              className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-b from-green-500 to-green-700 border border-green-300/50 text-white font-black text-sm active:scale-95 transition-all"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
