import React, { useEffect, useRef, useState } from 'react';
import { Trophy, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida, JogadorCard } from '../components/Chat';
import { net } from '../../net';
import { Scene } from '../../games/truco/render/scene.js';
import { Ponte } from '../../games/truco/ponte.js';
import { sound } from '../../games/truco/sound.js';
import { RANKS, SUIT_CHAR } from '../../games/truco/engine/deck.js';
import '../../games/truco/truco.css';
import logo from '../../assets/truco/logo.webp';
import moeda from '../../assets/truco/moeda.webp';
import avatarBone from '../../assets/truco/avatar-bone.webp';
import avatarChapeu from '../../assets/truco/avatar-chapeu.webp';
import iconeEngrenagem from '../../assets/truco/engrenagem.webp';
import iconeSom from '../../assets/truco/som.webp';
import iconeMenu from '../../assets/truco/menu.webp';
import botaoVerde from '../../assets/truco/botao-verde.webp';
import botaoAzul from '../../assets/truco/botao-azul.webp';
import botaoAmarelo from '../../assets/truco/botao-amarelo.webp';
import botaoVermelho from '../../assets/truco/botao-vermelho.webp';
import botaoRoxo from '../../assets/truco/botao-roxo.webp';
import placaTruco from '../../assets/truco/placa-truco.webp';
import placaSeis from '../../assets/truco/placa-seis.webp';
import placaNove from '../../assets/truco/placa-nove.webp';
import placaDoze from '../../assets/truco/placa-doze.webp';
import emojiJoinha from '../../assets/truco/emoji-joinha.webp';
import emojiRisada from '../../assets/truco/emoji-risada.webp';
import emojiOculos from '../../assets/truco/emoji-oculos.webp';
import emojiBravo from '../../assets/truco/emoji-bravo.webp';
import emojiPalmas from '../../assets/truco/emoji-palmas.webp';

type Carta = { r: number; s: number };
type Fim = { vencedor: number | null; motivo: string };
type Estado = {
  assento: number; mao: Carta[]; naMaoDoOutro: number; vira: Carta; manilha: number;
  vazas: number[]; valor: number; placar: number[]; vez: number; fase: string;
  pedido: { de: number; para: number } | null; onzeDe: number | null;
  podeAumentar: boolean; proximoValor: number | null; relogioDe: number | null;
  prazo: number; fim: Fim | null;
  maoDoParceiro?: Carta[] | null;
};
type Pago = { prize?: number; wo?: boolean; desistiu?: boolean; timeVencedor?: number; state?: unknown };

const NOME: Record<number, string> = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };
const PLACA: Record<string, string> = { 'TRUCO!': placaTruco, 'SEIS!': placaSeis, 'NOVE!': placaNove, 'DOZE!': placaDoze };
const FALAS = ['Bora!', 'Truco!', 'Seis!', 'Nove!', 'Doze!', 'Corre!', 'Boa!'];
const EMOJIS: [string, string][] = [['👍', emojiJoinha], ['😂', emojiRisada], ['😎', emojiOculos], ['😡', emojiBravo], ['👏', emojiPalmas]];
/** Depois de um pedido de N, o próximo aumento. */
const PROXIMO: Record<number, number> = { 3: 6, 6: 9, 9: 12 };
const brl = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

type Jogador = { id: number; name: string; avatar?: string | null; level?: number };
type Fala = { id: number; pos: number; texto: string };

/**
 * Onde cada posição da mesa mora na arte (pixels da referência 941x1672):
 * `lado` diz de que lado do avatar sai o balão de fala.
 */
const LUGAR: Record<number, { x: number; y: number; lado: 'esq' | 'dir' | 'cima' }[]> = {
  2: [{ x: 180, y: 890, lado: 'cima' }, { x: 470, y: 465, lado: 'dir' }],
  4: [{ x: 180, y: 890, lado: 'cima' }, { x: 760, y: 890, lado: 'cima' },
    { x: 640, y: 465, lado: 'dir' }, { x: 300, y: 465, lado: 'esq' }],
};

/**
 * Casca React do truco. O Pixi desenha a mesa, o servidor arbitra, e a HUD fica
 * aqui em DOM — o original usava ids globais, que colidiriam com o CSS da mesa
 * de sinuca.
 */
export const TrucoScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification, walletBalance, bonusBalance } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const ponteRef = useRef<Ponte | null>(null);
  // Fila, não último: os eventos são um fluxo. Guardar só o estado mais recente
  // perdia o `deal` quando o adversário jogava antes da cena ficar pronta.
  const pendentesRef = useRef<Estado[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [banner, setBanner] = useState('');
  const [falas, setFalas] = useState<Fala[]>([]);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [menu, setMenu] = useState(false);
  const [mudo, setMudo] = useState(!sound.enabled);
  const [espera, setEspera] = useState(false);
  // Cartão de quem eu toquei na mesa (adicionar amigo sem sair da partida).
  const [perfil, setPerfil] = useState<Jogador | null>(null);

  /** Balão de fala saindo do avatar de uma posição da mesa. */
  const falar = (pos: number, texto: string) => {
    const id = Date.now() + Math.random();
    setFalas((f) => [...f.filter((x) => x.pos !== pos), { id, pos, texto }]);
    setTimeout(() => setFalas((f) => f.filter((x) => x.id !== id)), 2600);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!match || !host) return;
    let vivo = true;
    let cena: Scene | null = null;
    const n = match.players.length;
    const pos = (assento: number) => (assento - match.seat + n) % n;

    // O canvas nasce aqui, não no JSX: o destroy do Pixi ARRANCA o elemento do
    // DOM, e no StrictMode (que monta duas vezes) a segunda cena nasceria num
    // canvas que a primeira já levou embora — mesa em branco.
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 w-full h-full';
    host.insertBefore(canvas, host.firstChild);

    Scene.create(canvas, n).then((s: Scene) => {
      // O StrictMode desmonta antes desta promessa resolver: sem destruir aqui,
      // sobra uma Application viva rodando em cima do mesmo canvas — e as duas
      // brigam pelo contexto WebGL (INVALID_OPERATION a cada frame).
      if (!vivo) { s.app.destroy(true); return; }
      cena = s;
      const ponte = new Ponte(s, match.seat, {
        onBanner: (t: string, quem?: number) => {
          setBanner(t);
          setTimeout(() => setBanner((atual) => (atual === t ? '' : atual)), 1600);
          // o pedido também sai como fala de quem pediu, como na arte ("Truco!")
          if (quem != null && PLACA[t]) falar(quem, t.charAt(0) + t.slice(1).toLowerCase());
        },
      });
      ponteRef.current = ponte;
      // Gancho de console/e2e, como o `window.__sinuca` da mesa: o app não lê.
      if (import.meta.env.DEV) (window as unknown as { __truco: unknown }).__truco = { cena: s, ponte };
      s.onPlay = (i: number) => {
        ponte.meuIndice = i;
        sound.resume();
        net.jogada({ tipo: 'jogar', indice: i });
      };
      for (const e of pendentesRef.current) ponte.aplicar(e);
      pendentesRef.current = [];
    });

    const offEstado = net.on('estado', (e: Estado) => {
      setEstado(e);
      if (ponteRef.current) ponteRef.current.aplicar(e);
      else pendentesRef.current.push(e);
      if (e.fim) setFim(e.fim);
    });
    const offSettled = net.on('settled', (s: Pago) => {
      if (s.state) applyServerState(s.state as never);
      setPago(s);
      if (s.wo && !s.desistiu) setFim({ vencedor: s.timeVencedor ?? match.seat % 2, motivo: 'wo' });
    });
    const offLeft = net.on('left', () => showNotification(
      match.players.length > 2 ? 'Um jogador saiu da partida' : 'Adversário saiu da partida'));
    // Falas e emojis (lista fechada do servidor) saem do avatar de quem mandou.
    const offReacao = net.on('reacao', (r: { assento: number; emoji: string }) => falar(pos(r.assento), r.emoji));

    return () => {
      vivo = false;
      offEstado();
      offSettled();
      offLeft();
      offReacao();
      ponteRef.current = null;
      cena?.app?.destroy(true);
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  // Relógio: o servidor manda o prazo, aqui só conta pra tela.
  useEffect(() => {
    if (!estado?.prazo || estado.fim) { setSegundos(null); return; }
    const tick = () => setSegundos(Math.max(0, Math.ceil((estado.prazo - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [estado?.prazo, estado?.fim]);

  if (!match) return null;
  const eu = match.seat;
  const n = match.players.length;
  const duplas = n === 4;
  // Placar, vazas e vencedor vêm por TIME; no 1×1 o time é o próprio assento.
  const meuTime = eu % 2;
  const meuRelogio = estado?.relogioDe === eu;
  const emDinheiro = match.room.stake > 0;
  const ganhei = fim?.vencedor === meuTime;
  const nomeDe = (assento: number) => match.players[assento]?.name ?? 'Adversário';

  const sair = () => { net.leave(); setMatch(null); };
  const agir = (acao: Record<string, unknown>) => { sound.resume(); net.jogada(acao); };
  const reagir = (texto: string) => {
    if (espera || fim) return;
    net.emit('reacao', { emoji: texto });
    setEspera(true);                                   // o servidor aceita uma a cada 1,5s
    setTimeout(() => setEspera(false), 1500);
  };

  const placar = estado?.placar ?? [0, 0];
  const respondendo = estado?.fase === 'respond' && meuRelogio;
  const naOnze = estado?.fase === 'onze' && estado.onzeDe === eu;
  const cobrado = nomeDe(estado?.relogioDe ?? 0).toUpperCase();

  // De quem é a vez, em texto. No truco isso não é só "quem joga": num pedido
  // quem está sendo cobrado é quem responde.
  const aviso = !estado || fim ? null
    : estado.fase === 'respond'
      ? (meuRelogio ? `PEDIRAM ${NOME[estado.pedido?.para ?? 3]} — RESPONDA` : `${cobrado} DECIDINDO`)
      : estado.fase === 'onze'
        ? (naOnze ? 'MÃO DE ONZE — JOGA POR 3?' : `${cobrado} DECIDINDO`)
        : (estado.vez === eu ? 'SUA VEZ' : `VEZ DE ${nomeDe(estado.vez).toUpperCase()}`);

  // Botões da arte: sempre os cinco, acesos só quando valem agora.
  const podePedir = !!estado?.podeAumentar && estado.fase === 'play' && !respondendo;
  const alvoAumento = respondendo && estado?.pedido && estado.proximoValor && estado.pedido.para < 12
    ? PROXIMO[estado.pedido.para]
    : podePedir ? estado?.proximoValor ?? null : null;
  const aumentar = () => (respondendo ? agir({ tipo: 'responder', acao: 'raise' }) : agir({ tipo: 'aumentar' }));
  const verde = respondendo ? { rotulo: ['ACEITO', ''], acao: () => agir({ tipo: 'responder', acao: 'accept' }) }
    : naOnze ? { rotulo: ['JOGAR', ''], acao: () => agir({ tipo: 'onze', aceita: true }) }
      : { rotulo: ['PEDIR', 'TRUCO'], acao: () => agir({ tipo: 'aumentar' }), ativo: podePedir && alvoAumento === 3 };
  const correr = respondendo ? () => agir({ tipo: 'responder', acao: 'run' })
    : naOnze ? () => agir({ tipo: 'onze', aceita: false }) : null;

  const lugares = LUGAR[n] ?? LUGAR[2];
  const vez = estado?.relogioDe ?? null;

  return (
    <div className="truco">
      <div className="palco" ref={hostRef}>
        {/* Saldo de quem joga (o que dá pra apostar: carteira + bônus) */}
        <div className="saldo">
          <img src={moeda} alt="" />
          <span><small>SALDO</small><b>{((walletBalance + bonusBalance)).toFixed(2).replace('.', ',')}</b></span>
        </div>
        <img className="logo" src={logo} alt="Truco Aposta" />
        {/* ponytail: a engrenagem é só a arte por enquanto */}
        <img className="canto engrenagem" src={iconeEngrenagem} alt="" />
        <button className={`canto som ${mudo ? 'mudo' : ''}`} aria-label="Som"
          onClick={() => { sound.enabled = !sound.enabled; setMudo(!sound.enabled); }}>
          <img src={iconeSom} alt="" />
        </button>
        <button className="canto menu" aria-label="Menu" onClick={() => setMenu((m) => !m)}>
          <img src={iconeMenu} alt="" />
        </button>
        {menu && (
          <div className="menu-aberto">
            <button onClick={sair}>Sair da mesa</button>
            <small>{emDinheiro ? 'Sair agora é desistir: a entrada fica com os adversários.' : 'Partida grátis.'}</small>
          </div>
        )}

        {/* Jogadores nos lugares da arte; 0 sou eu. Assento = (eu + posição) % n. */}
        {lugares.map((l, p) => {
          const assento = (eu + p) % n;
          const j = match.players[assento];
          const time = assento % 2 === meuTime ? 'meu' : 'deles';
          const daVez = !fim && vez === assento;
          const fala = falas.find((f) => f.pos === p);
          return (
            <div key={p} className={`jogador ${time} ${daVez ? 'vez' : ''}`} style={{ '--x': l.x, '--y': l.y } as React.CSSProperties}>
              <button className="foto" disabled={p === 0} onClick={() => j && setPerfil(j)} aria-label={`Ver perfil de ${j?.name ?? ''}`}>
                <img src={j?.avatar || (assento % 2 ? avatarChapeu : avatarBone)} alt="" />
                <span className="nome"><i />{p === 0 ? 'Você' : j?.name ?? '—'}</span>
                {daVez && segundos !== null && <span className={`seg ${segundos <= 5 ? 'urgente' : ''}`}>{segundos}s</span>}
              </button>
              <span className="etiqueta">{emDinheiro ? brl(match.room.stake) : `Nível ${j?.level ?? 1}`}</span>
              {fala && (
                <span key={fala.id} className={`fala ${l.lado}`}>
                  {EMOJIS.find(([e]) => e === fala.texto)?.[1]
                    ? <img src={EMOJIS.find(([e]) => e === fala.texto)![1]} alt={fala.texto} />
                    : fala.texto}
                </span>
              )}
            </div>
          );
        })}

        {/* Pedido: a placa de madeira da arte; o resto, um balão no meio do pano */}
        {banner && (PLACA[banner]
          ? <img key={banner} className="placa" src={PLACA[banner]} alt={banner} />
          : <span key={banner} className="aviso-mesa">{banner}</span>)}

        {aviso && <span className={`vez-de ${meuRelogio ? 'minha' : ''}`}>
          {aviso}
          {naOnze && estado?.maoDoParceiro && (
            <small>Parceiro tem: {estado.maoDoParceiro.map((c) => RANKS[c.r] + SUIT_CHAR[c.s]).join(' ')}</small>
          )}
        </span>}

        <div className="painel aposta">
          <small>APOSTA DA MESA</small>
          <b><img src={moeda} alt="" />{emDinheiro ? brl(match.room.stake) : 'GRÁTIS'}</b>
        </div>
        <div className="painel placar">
          <small>PLACAR · mão vale {estado?.valor ?? 1}</small>
          <b>{placar[meuTime]} <em>×</em> {placar[1 - meuTime]}</b>
          <span className="vazas">
            {[0, 1, 2].map((i) => {
              const r = estado?.vazas?.[i];
              return <i key={i} className={r === undefined ? '' : r === -1 ? 'empate' : r === meuTime ? 'nossa' : 'deles'} />;
            })}
          </span>
        </div>

        <div className="botoes">
          <button className="acao" disabled={!(respondendo || naOnze || verde.ativo)} onClick={verde.acao}>
            <img src={botaoVerde} alt="" /><span><small>{verde.rotulo[0]}</small>{verde.rotulo[1] && <b>{verde.rotulo[1]}</b>}</span>
          </button>
          <button className="acao" disabled={!correr} onClick={() => correr?.()}>
            <img src={botaoAzul} alt="" /><span><b>CORRER</b></span>
          </button>
          {([[6, botaoAmarelo], [9, botaoVermelho], [12, botaoRoxo]] as [number, string][]).map(([v, img]) => (
            <button key={v} className="acao" disabled={alvoAumento !== v} onClick={aumentar}>
              <img src={img} alt="" /><span><small>AUMENTAR</small><b>{v}</b></span>
            </button>
          ))}
        </div>

        <div className="falas">
          {FALAS.map((f) => <button key={f} disabled={espera || !!fim} onClick={() => reagir(f)}>{f}</button>)}
        </div>
        <div className="emojis">
          {EMOJIS.map(([e, img]) => (
            <button key={e} disabled={espera || !!fim} onClick={() => reagir(e)} aria-label={`Reagir ${e}`}><img src={img} alt="" /></button>
          ))}
        </div>
      </div>

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
            <h3 className="text-2xl font-black text-white">{ganhei ? 'Você venceu!' : 'Você perdeu'}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'wo'
                ? (duplas ? (ganhei ? 'Um adversário saiu da mesa' : 'Seu parceiro saiu da mesa') : 'Adversário desistiu')
                : `${placar[meuTime]} × ${placar[1 - meuTime]} em 12 pontos`}
            </p>

            <div className="mt-4 min-h-[52px] flex items-center justify-center">
              {pago ? (
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
