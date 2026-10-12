import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownUp, Hand, Layers, LogOut, Trophy, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida } from '../components/Chat';
import { net } from '../../net';
import { Carta } from '../../games/poker/Carta';
import { sound } from '../../games/poker/sound.js';
import { batida, curingaDe, ehCuringa } from '../../games/cacheta/regras.js';
import { lugarDe, ordenar } from '../../games/cacheta/ui.js';
import '../../games/poker/poker.css';
import '../../games/buraco/buraco.css';
import '../../games/cacheta/cacheta.css';

const sprites = import.meta.glob(['../../assets/cacheta/*.webp', '../../assets/buraco/*.webp'], { eager: true, import: 'default' }) as Record<string, string>;
const sp = (n: string) => sprites[`../../assets/cacheta/${n}.webp`] ?? sprites[`../../assets/buraco/${n}.webp`];
const verso = (import.meta.glob('../../assets/poker/verso.webp', { eager: true, import: 'default' }) as Record<string, string>)['../../assets/poker/verso.webp'];

type Jogo = { tipo: string; cartas: string[]; curinga: string | null };
type Resultado = {
  vencedor: number | null; perda: number; cartas?: number; jogos?: Jogo[]; descarte?: string | null; motivo: string;
  rodada: number; perdas: number[]; pontos: number[];
};
type Ultima = { tipo: string; assento?: number; carta?: string | null; rodadaFim?: Resultado };
type Estado = {
  assento: number; jogadores: number; mao: string[]; naMao: number[]; vira: string; lixo: string | null; lixoQtd: number;
  monte: number; vez: number | null; fase: string; comprada: string | null; doLixo: string | null;
  pontos: number[]; inicial: number; saiu: boolean[]; colocacao: number[]; naRodada: number[]; carteador: number;
  rodada: number; resultado: Resultado | null; prazo: number; tempo: number;
  fim: { vencedor: number | null; motivo: string } | null; ultima?: Ultima;
};
type Pago = { prize?: number; desistiu?: boolean; eliminado?: boolean };

const NAIPES_DA_COR = { true: '♥♦', false: '♠♣' } as const;
const VALOR: Record<string, string> = { T: '10' };

function useAgora(ms = 250) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return agora;
}

/**
 * Mesa de cacheta. O servidor manda só a minha mão; o lixo (a de cima), a
 * vira e a contagem das outras mãos são públicos. Na batida, a mão de quem
 * bateu aparece no painel. Cartas com layoutId = id, então voam sozinhas
 * entre mão, lixo e monte.
 */
export const CachetaScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const [e, setE] = useState<Estado | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [modo, setModo] = useState<'naipe' | 'valor'>('naipe');
  const [banner, setBanner] = useState<{ texto: string; id: number } | null>(null);
  const [som, setSom] = useState(true);
  const [sairArmado, setSairArmado] = useState(false);
  const [assistir, setAssistir] = useState(false);
  const anterior = useRef<Estado | null>(null);
  const agora = useAgora();

  useEffect(() => {
    if (!match) return;
    const nomeDe = (s: number) => (s === match.seat ? 'VOCÊ' : (match.players[s]?.name.split(' ')[0] ?? '').toUpperCase());
    const anunciar = (texto: string) => {
      const id = Date.now() + Math.random();
      setBanner({ texto, id });
      setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 2400);
    };
    const offEstado = net.on('estado', (novo: Estado) => {
      const velho = anterior.current;
      anterior.current = novo;
      setE(novo);
      setSel((s) => (s && novo.mao.includes(s) ? s : null));
      const u = novo.ultima;
      if (!u) return;
      if (u.tipo === 'comprar' || u.tipo === 'descartar' || u.tipo === 'lixo' || u.tipo === 'tempo') sound.carta();
      if (u.tipo === 'novaRodada') for (let i = 0; i < 9; i++) sound.carta(i * 0.06);
      if (u.tipo === 'tempo' && u.assento === novo.assento && !novo.saiu[novo.assento]) showNotification('Tempo esgotado: o jogo comprou e descartou por você');
      const r = u.rodadaFim;
      if (r?.vencedor != null) {
        anunciar(`${nomeDe(r.vencedor)} BATEU${r.cartas === 10 ? ' COM 10!' : '!'}`);
        if (r.vencedor === novo.assento) sound.vitoria(); else sound.allin();
      }
      if (velho && novo.pontos[novo.assento] === 0 && velho.pontos[novo.assento] > 0) showNotification('Seus pontos acabaram');
      if (novo.vez === novo.assento && novo.fase === 'comprar' && velho?.vez !== novo.assento) sound.suaVez();
    });
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if (s.state) applyServerState(s.state);
      setPago(s);
      if (s.desistiu) setMatch(null);
    });
    const offLeft = net.on('left', () => showNotification('Um jogador saiu da mesa'));
    return () => { offEstado(); offSettled(); offLeft(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  useEffect(() => { sound.enabled = som; }, [som]);

  const eu = match?.seat ?? 0;
  const n = e?.jogadores ?? match?.players.length ?? 2;
  const minhaVez = !!e && e.vez === eu && !e.resultado && !e.fim;
  const segundos = e ? Math.max(0, Math.ceil((e.prazo - agora) / 1000)) : 0;
  useEffect(() => { if (minhaVez && segundos > 0 && segundos <= 5) sound.tick(); }, [minhaVez, segundos]);

  const fim = e?.fim ?? null;
  const ganhei = !!fim && fim.vencedor === eu;
  const eliminado = !!e && !fim && (e.pontos[eu] === 0 || e.saiu[eu]);
  useEffect(() => {
    if (ganhei) confetti({ particleCount: 200, spread: 110, origin: { y: 0.6 }, colors: ['#ffd34d', '#ffb300', '#fff', '#ff3b3b'], zIndex: 60 });
  }, [ganhei]);

  const mao = useMemo(() => (e ? ordenar(e.mao, e.vira, modo) : []), [e, modo]);
  if (!match) return null;

  const jogar = (acao: Record<string, unknown>) => { net.jogada(acao); };
  const sair = () => { net.leave(); setMatch(null); };
  const pedirSaida = () => {
    if (sairArmado || !e || fim || eliminado) return sair();
    setSairArmado(true);
    showNotification('Toque de novo pra sair — você perde a entrada');
    setTimeout(() => setSairArmado(false), 3000);
  };

  const comprando = minhaVez && e!.fase === 'comprar';
  const descartando = minhaVez && e!.fase === 'descartar';
  // Mesma conta do servidor: bate com a selecionada (9) ou do melhor jeito (10, ou 9 com a mais solta).
  const bAlguma = descartando ? batida(e!.mao, e!.vira, { proibida: e!.doLixo ?? undefined }) : null;
  const bSel = descartando && sel ? batida(e!.mao, e!.vira, { descarte: sel, proibida: e!.doLixo ?? undefined }) : null;
  const podeDescartar = descartando && !!sel && sel !== e!.doLixo;
  const descartar = () => { if (podeDescartar) { jogar({ tipo: 'descartar', carta: sel }); setSel(null); } };
  const bater = () => { const b = bSel ?? bAlguma; if (b) { jogar({ tipo: 'bater', carta: b.descarte ?? undefined }); setSel(null); } };
  // Toque seleciona; tocar de novo na selecionada (na hora de descartar) descarta.
  const tocar = (c: string) => {
    if (!e || e.resultado || fim) return;
    if (sel === c && podeDescartar) return descartar();
    setSel((s) => (s === c ? null : c));
  };

  const nomeDe = (s: number) => (s === eu ? 'Você' : match.players[s]?.name.split(' ')[0] ?? '');
  // De onde nasce a carta que outro jogador pôs na mesa: na direção do assento dele.
  const origem = (s?: number) => {
    if (s == null || s === eu) return undefined;
    const l = lugarDe(s, eu, n);
    return { x: `${(l.x - 50) * 14}%`, y: `${(l.y - 55) * 12}%` };
  };
  const u = e?.ultima;
  const k = e ? curingaDe(e.vira) : null;
  const passo = Math.min(98, (980 - 92) / Math.max(1, mao.length - 1));

  const dica = !e ? 'Embaralhando…'
    : e.resultado || eliminado ? '' : !minhaVez ? `Vez de ${nomeDe(e.vez ?? 0)}`
    : comprando ? 'Compre do monte ou pegue a carta do lixo'
    : bAlguma ? (bSel || !sel ? 'Você pode BATER!' : 'Batendo com essa você não fecha — toque em BATER')
    : sel ? 'DESCARTAR essa (ou toque nela de novo)'
    : 'Escolha uma carta pra descartar';

  const res = e?.resultado;
  return (
    <div className="bc ct">
      <div className="bc-palco">
        <img className="bc-logo" src={sp('logo')} alt="" draggable={false} />
        <img className="ct-marca" src={sp('logo')} alt="Cacheta" draggable={false} />

        <div className="bc-topo">
          <button onClick={pedirSaida} aria-label="Sair da mesa" className={sairArmado ? 'armado' : ''}><LogOut /></button>
          <button onClick={() => setSom((v) => !v)} aria-label={som ? 'Desligar som' : 'Ligar som'}>{som ? <Volume2 /> : <VolumeX />}</button>
          {e && (
            <div className="bc-placar">
              <span>Mão <b>{e.rodada}</b></span>
              <small>{e.inicial} pontos · bater tira 1 (com 10, tira 2)</small>
            </div>
          )}
        </div>
        {minhaVez && <span className={`bc-vez ${segundos <= 5 ? 'urgente' : ''}`}>Sua vez · {segundos}s</span>}

        {/* centro: monte (com a vira embaixo) e lixo */}
        {e && (
          <div className="bc-centro">
            <motion.div className={`bc-pilha ${comprando ? 'clica' : ''}`} onClick={() => comprando && jogar({ tipo: 'comprar' })}
              whileTap={comprando ? { scale: 0.94 } : undefined}>
              <div className="ct-monte">
                <div className="vira"><Carta key={`v${e.rodada}`} carta={e.vira.slice(0, 2)} /></div>
                <img src={sp('monte')} alt="Monte" />
              </div>
              <span className="bc-rotulo">MONTE<b>{e.monte}</b></span>
            </motion.div>
            <div className="bc-pilha">
              <span className="bc-rotulo">
                VIRA {VALOR[e.vira[0]] ?? e.vira[0]}{{ s: '♠', h: '♥', d: '♦', c: '♣' }[e.vira[1]]}
                <span className="ct-curinga">CURINGA <em>{VALOR[k!.valor] ?? k!.valor} {NAIPES_DA_COR[`${k!.vermelho}`]}</em></span>
              </span>
            </div>
            <div className={`bc-pilha ${comprando && e.lixo ? 'clica' : ''}`} onClick={() => comprando && e.lixo && jogar({ tipo: 'lixo' })}>
              <div className="bc-lixo">
                <AnimatePresence>
                  {e.lixo && (
                    <motion.div key={e.lixo} className="bc-slot" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                      <Carta layoutId={e.lixo} carta={e.lixo.slice(0, 2)} className={ehCuringa(e.lixo, e.vira) ? 'curinga' : ''}
                        de={u?.tipo === 'descartar' && u.assento !== eu ? origem(u.assento) : undefined} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span className="bc-rotulo">LIXO<b>{e.lixoQtd}</b></span>
            </div>
          </div>
        )}

        {/* assentos */}
        {match.players.map((jog, s) => {
          const l = lugarDe(s, eu, n);
          const daVez = e?.vez === s && !e?.resultado;
          const fracao = daVez && e ? Math.max(0, Math.min(1, (e.prazo - agora) / e.tempo)) : 0;
          const qtd = e?.naMao[s] ?? 0;
          const fora = !!e && (e.saiu[s] || e.pontos[s] === 0);
          const perdeu = !!res && res.perdas[s] > 0;
          return (
            <div key={jog.id} className={`bc-assento ${fora ? 'fora' : ''}`} style={{ left: `${l.x}%`, top: `${l.y}%` }}>
              <div className={`bc-avatar ${daVez ? 'vez' : ''}`}>
                <img src={jog.avatar || sp(`avatar-${s % 4}`)} alt={jog.name} />
                {daVez && (
                  <svg className="bc-anel" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="47" fill="none" stroke={fracao < 0.2 ? '#ff4040' : '#33e27a'} strokeWidth="5"
                      strokeDasharray={`${295.3 * fracao} 295.3`} strokeLinecap="round" />
                  </svg>
                )}
                {s !== eu && !fora && <span className="bc-qtd">{qtd}</span>}
                {e?.carteador === s && <span className="ct-carteador" title="Carteador">D</span>}
              </div>
              <small>{nomeDe(s)}</small>
              {e && (
                <span key={`${e.rodada}-${perdeu}`} className={`ct-pontos ${perdeu ? 'perdeu' : ''}`}>
                  <img src={sp('fichas')} alt="" />{e.pontos[s]}{perdeu ? ` (−${res!.perdas[s]})` : ''}
                </span>
              )}
              {s !== eu && qtd > 0 && (
                <div className="bc-leque" style={l.x < 50 ? { left: '110%' } : l.x > 50 ? { right: '110%' } : { left: '120%' }}>
                  {Array.from({ length: Math.min(qtd, 6) }, (_, i) => <img key={i} src={verso} alt="" />)}
                </div>
              )}
            </div>
          );
        })}

        {/* minha mão */}
        <div className="bc-mao" style={{ '--passo': `calc(${passo - 92} * var(--p))` } as React.CSSProperties}>
          {mao.map((c) => (
            <Carta key={c} layoutId={c} carta={c.slice(0, 2)}
              className={`mao ${c === e?.comprada || c === e?.doLixo ? 'nova' : ''} ${e && ehCuringa(c, e.vira) ? 'curinga' : ''}`}
              destaque={sel === c} onClick={() => tocar(c)} de={{ x: 0, y: -260 }} />
          ))}
        </div>

        {dica && <span className="bc-dica">{dica}</span>}

        <div className="bc-acoes">
          {comprando && <button className="ct-btn verde" onClick={() => jogar({ tipo: 'comprar' })}><Layers /> COMPRAR</button>}
          {comprando && <button className="ct-btn roxo" disabled={!e!.lixo} onClick={() => jogar({ tipo: 'lixo' })}><Hand /> PEGAR LIXO</button>}
          {descartando && <button className={`ct-btn dourado ${bAlguma ? 'pode' : ''}`} disabled={!bAlguma} onClick={bater}><Trophy /> BATER</button>}
          {descartando && <button className="ct-btn vermelho" disabled={!podeDescartar} onClick={descartar}>DESCARTAR</button>}
          <button className="ct-btn cinza" onClick={() => setModo((m) => (m === 'naipe' ? 'valor' : 'naipe'))} aria-label="Organizar a mão">
            <ArrowDownUp /> {modo === 'naipe' ? 'POR VALOR' : 'POR NAIPE'}
          </button>
        </div>

        <AnimatePresence>
          {banner && (
            <motion.div key={banner.id} className="bc-banner"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.15, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 16 }}>
              <img className="coroa" src={sp('coroa')} alt="" />
              <div className="faixa"><img src={sp('faixa')} alt="" /><span>{banner.texto}</span></div>
              <img className="brilho" src={sp('brilho')} alt="" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* fim da mão: a batida na mesa e quem perdeu quanto */}
        <AnimatePresence>
          {res && !fim && (
            <motion.div className="bc-painel" key={`r${res.rodada}`}
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 1.4 }}>
              <h3>{res.vencedor == null ? (res.motivo === 'monte' ? 'Acabou o monte — mão anulada' : 'Mão anulada')
                : `${nomeDe(res.vencedor)} bateu com ${res.cartas}!`}</h3>
              {res.jogos && (
                <div className="ct-mostra">
                  {res.jogos.map((j, i) => (
                    <div key={i} className="bc-jogo">
                      {j.cartas.map((c) => <Carta key={c} carta={c.slice(0, 2)} className={c === j.curinga ? 'curinga' : ''} />)}
                    </div>
                  ))}
                </div>
              )}
              <table>
                <thead><tr><th /><th>Perdeu</th><th>Pontos</th></tr></thead>
                <tbody>
                  {match.players.map((_, s) => (e!.saiu[s] && !res.perdas[s] ? null : (
                    <tr key={s}>
                      <td>{nomeDe(s)}{res.vencedor === s ? ' 🏆' : ''}</td>
                      <td className={res.perdas[s] ? 'neg' : ''}>{res.perdas[s] ? `−${res.perdas[s]}` : '—'}</td>
                      <td>{res.pontos[s] || (res.perdas[s] ? 'fora' : 0)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
              <small>Próxima mão em {segundos}s</small>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {eliminado && !assistir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1a0808] border border-amber-500/40 rounded-3xl p-6 text-center text-white">
            <h3 className="text-2xl font-black">Você está fora</h3>
            <p className="text-xs text-gray-400 mt-1">Seus pontos acabaram. A mesa segue até sobrar um — a entrada ficou no pote.</p>
            <button onClick={() => setAssistir(true)} className="w-full mt-4 py-3 rounded-2xl bg-white/10 font-bold text-sm">Assistir o resto</button>
            <button onClick={sair} className="w-full mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-red-700 to-amber-700 font-black text-sm">Voltar ao início</button>
          </div>
        </div>
      )}

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2 }}
            className="w-full max-w-sm bg-[#1a0808] border border-amber-500/40 rounded-3xl p-6 text-center text-white shadow-[0_0_60px_rgba(255,60,60,0.35)]">
            <img src={sp(ganhei ? 'vitoria' : 'logo')} className="w-40 mx-auto mb-2" alt="" />
            <h3 className="text-2xl font-black">{ganhei ? 'Você venceu!' : fim.vencedor != null ? `${nomeDe(fim.vencedor)} venceu` : 'Mesa encerrada'}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'pontos' ? 'Último na mesa com pontos'
                : fim.motivo === 'tempo' ? 'Os outros deixaram o tempo estourar' : 'Os outros saíram da mesa'}
            </p>
            <div className="mt-4 min-h-[40px] flex items-center justify-center">
              {!pago ? <p className="text-xs text-gray-500">Confirmando o resultado com o servidor…</p>
                : ganhei && match.room.stake > 0 ? <p className="text-lg font-black text-[#4ade80]">+ R$ {((pago.prize ?? 0) / 100).toFixed(2).replace('.', ',')}</p>
                : <p className="text-xs text-gray-400">{match.room.stake > 0 ? 'O pote ficou com quem venceu.' : 'Partida sem valor de entrada.'}</p>}
            </div>
            <BotaoRevanche match={match} />
            <JogadoresDaPartida players={match.players} eu={match.players[eu]?.id} />
            <button onClick={() => setMatch(null)} className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-red-700 to-amber-700 font-black text-sm">
              Voltar ao início
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
