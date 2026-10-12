import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida } from '../components/Chat';
import { net } from '../../net';
import { Carta } from '../../games/poker/Carta';
import { brl, fichasDe, lugarDe, presets, rotulo } from '../../games/poker/ui.js';
import { sound } from '../../games/poker/sound.js';
import { entrarTelaCheia, sairTelaCheia } from '../telaCheia';
import '../../games/poker/poker.css';

const sprites = import.meta.glob('../../assets/poker/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const sp = (n: string) => sprites[`../../assets/poker/${n}.webp`];

type Legais = { check: boolean; call: number; minRaise: number | null; maxRaise: number | null };
type Ultima = { tipo: string; assento?: number; acao?: string; valor?: number };
type Estado = {
  assento: number; jogadores: number; maoNum: number; fase: string;
  fichas: number[]; apostas: number[]; investido: number[]; pote: number;
  potes: { valor: number; elegiveis?: number[]; vencedores?: number[]; devolvido?: boolean }[];
  board: string[]; minhas: string[] | null; minhaMao: string | null;
  cartas: Record<number, string[]> | null; maos: Record<number, { nome: string; melhores: string[] }> | null;
  ganhos: number[] | null; ativos: boolean[]; foldou: boolean[]; saiu: boolean[];
  botao: number; posSb: number; posBb: number; sb: number; bb: number;
  nivel: number; proximoNivel: [number, number] | null; proximoNivelEm: number;
  vez: number | null; legais: Legais | null; prazo: number; tempo: number; colocacao: number[];
  fim: { vencedor: number; motivo: string } | null;
  ultima?: Ultima;
};
type Pago = { prize?: number; winners?: number[]; desistiu?: boolean; eliminado?: boolean };

const POTE = { x: 50, y: 62 };
const SOM: Record<string, () => void> = {
  fold: () => sound.fold(), check: () => sound.check(), call: () => sound.ficha(),
  bet: () => sound.ficha(4), raise: () => sound.ficha(5), allin: () => sound.allin(),
};

/** Relógio da tela: re-renderiza a cada `ms` (anel de tempo e contagem do nível). */
function useAgora(ms = 200) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return agora;
}

/** Número que corre até o valor novo (fichas do vencedor subindo). */
function Contador({ valor }: { valor: number }) {
  const [mostra, setMostra] = useState(valor);
  const de = useRef(valor);
  useEffect(() => {
    const inicio = performance.now(), a = de.current;
    let id = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / 600);
      setMostra(Math.round(a + (valor - a) * k));
      if (k < 1) id = requestAnimationFrame(passo); else de.current = valor;
    };
    id = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(id); de.current = valor; };
  }, [valor]);
  return <>{mostra.toLocaleString('pt-BR')}</>;
}

const Pilha: React.FC<{ valor: number }> = ({ valor }) => (
  <div className="pk-pilha">
    {fichasDe(valor).map((cor, i) => (
      <img key={i} src={sp(`ficha-${cor}`)} style={{ bottom: `calc(${i * 4} * var(--p))` }} alt="" />
    ))}
  </div>
);

const pct = ({ x, y }: { x: number; y: number }) => ({ left: `${x}%`, top: `${y}%` });
/** Onde fica a aposta de quem senta em `l`: na frente dele, antes do board (em cima) e do pote (embaixo). */
const lugarAposta = (l: { x: number; y: number }) => ({
  x: l.x + (50 - l.x) * 0.33,
  y: l.y < 35 ? l.y + 10 : l.y > 70 ? l.y - 11 : l.y + (50 - l.y) * 0.3,
});

/**
 * Mesa de pôquer. O servidor manda o estado já filtrado pro meu assento (as
 * cartas dos outros só chegam no showdown); aqui é só desenho e animação.
 * `ultima` diz o que acabou de acontecer — é dela que saem som e balão.
 */
export const PokerScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const [e, setE] = useState<Estado | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [badges, setBadges] = useState<Record<number, { texto: string; acao: string; id: number }>>({});
  const [aumento, setAumento] = useState<number | null>(null);
  const [som, setSom] = useState(true);
  const [flash, setFlash] = useState(0);
  const [suspense, setSuspense] = useState(false);
  const [sairArmado, setSairArmado] = useState(false);
  const anterior = useRef<Estado | null>(null);
  const agora = useAgora();

  useEffect(() => {
    if (!match) return;
    const offEstado = net.on('estado', (novo: Estado) => {
      const velho = anterior.current;
      anterior.current = novo;
      // Board que pulou de uma vez (all-in): turn e river entram com suspense.
      setSuspense(!!velho && velho.maoNum === novo.maoNum && novo.board.length - velho.board.length >= 2);
      setE(novo);
      // Painel de aumento só fecha quando a vez sai de mim (alguém saindo da mesa não mexe nele).
      const L = novo.vez === novo.assento ? novo.legais : null;
      setAumento((a) => (a == null || L?.minRaise == null ? null : Math.min(Math.max(a, L.minRaise), L.maxRaise!)));
      const u = novo.ultima;
      if (u?.assento != null && u.acao) {
        setBadges((b) => ({ ...b, [u.assento!]: { texto: rotulo(u), acao: u.acao!, id: Date.now() } }));
        SOM[u.acao]?.();
        if (u.acao === 'allin') setFlash(Date.now());
      }
      if (u?.tipo === 'novaMao') {
        setBadges({});
        for (let i = 0; i < novo.jogadores * 2; i++) sound.carta(i * 0.09);
      }
      if (novo.vez === novo.assento && novo.legais) sound.suaVez();
      // Vitória de verdade: pote disputado (devolução de aposta não conta), uma vez por mão.
      const ganhei = novo.fase === 'fim' && novo.potes.some((p) => !p.devolvido && p.vencedores?.includes(novo.assento));
      if (ganhei && (u?.tipo === 'acao' || u?.tipo === 'tempo')) sound.vitoria();
    });
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if (s.state) applyServerState(s.state);
      setPago(s);
      if (s.desistiu) setMatch(null);              // eu saí: volta pro lobby
    });
    const offLeft = net.on('left', () => showNotification('Um jogador saiu da mesa'));
    return () => { offEstado(); offSettled(); offLeft(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  // Tela cheia no celular, como na sinuca: tenta ao entrar e de novo no primeiro toque.
  useEffect(() => {
    entrarTelaCheia();
    addEventListener('pointerdown', entrarTelaCheia);
    return () => { removeEventListener('pointerdown', entrarTelaCheia); sairTelaCheia(); };
  }, []);

  useEffect(() => { sound.enabled = som; }, [som]);

  const eu = match?.seat ?? 0;
  const n = e?.jogadores ?? match?.players.length ?? 2;
  const minhaVez = !!e && e.vez === eu && !!e.legais;
  const segundos = e ? Math.max(0, Math.ceil((e.prazo - agora) / 1000)) : 0;
  const ps = useMemo(() => (e?.legais ? presets(e.legais, e.pote, e.apostas[eu]) : []), [e, eu]);

  // Últimos 5s da minha vez: tique por segundo.
  useEffect(() => { if (minhaVez && segundos > 0 && segundos <= 5) sound.tick(); }, [minhaVez, segundos]);

  // Fim do torneio: confete se eu levei.
  const ganhei = !!e?.fim && e.fim.vencedor === eu;
  useEffect(() => {
    if (!ganhei) return;
    confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 }, colors: ['#ffd34d', '#ffb300', '#ffffff', '#33e27a'], zIndex: 60 });
  }, [ganhei]);

  if (!match) return null;
  const jogar = (acao: Record<string, unknown>) => { net.jogada(acao); setAumento(null); };
  const sair = () => { net.leave(); setMatch(null); };
  // Sair no meio é perder a entrada: o primeiro toque só arma (igual às damas).
  const pedirSaida = () => {
    if (sairArmado || !e || e.fim || e.colocacao.includes(eu)) return sair();
    setSairArmado(true);
    showNotification('Toque de novo pra sair — você perde a entrada');
    setTimeout(() => setSairArmado(false), 3000);
  };

  const fimDaMao = e?.fase === 'fim';
  const vencedoresMao = new Set(fimDaMao ? e!.potes.filter((p) => !p.devolvido).flatMap((p) => p.vencedores ?? []) : []);
  const melhores = new Set(Object.entries(e?.maos ?? {}).filter(([s]) => vencedoresMao.has(+s)).flatMap(([, m]) => m.melhores));
  const eliminado = !!e && !e.fim && e.colocacao.includes(eu);
  // Aposta que ninguém pagou ainda vira um "pote" de um elegível só: não é side pot.
  const disputados = (e?.potes ?? []).filter((p) => (p.elegiveis?.length ?? 2) > 1);
  const nivelEm = e ? Math.max(0, Math.ceil((e.proximoNivelEm - agora) / 1000)) : 0;
  const lugar = (s: number) => lugarDe(s, eu, n);
  // Onde ficam as cartas de cada um: ao lado do avatar, voltadas pro centro; as minhas, maiores, à esquerda.
  const lugarCartas = (s: number) => {
    const l = lugar(s);
    return s === eu ? { x: l.x - 9, y: l.y - 2 } : { x: l.x + (l.x <= 50 ? 6.5 : -6.5), y: l.y - 4 };
  };
  const principal = fimDaMao ? e!.potes[0]?.vencedores?.[0] : undefined;
  const nomeDe = (s: number) => (s === eu ? 'Você' : match.players[s]?.name.split(' ')[0] ?? '');

  return (
    <div className="pk">
      <div className="pk-palco">
        <div key={flash} className={`pk-feltro ${flash ? 'flash' : ''}`} />

        <div className="pk-topo">
          <button onClick={pedirSaida} aria-label="Sair da mesa" className={sairArmado ? 'armado' : ''}><LogOut /></button>
          <button onClick={() => setSom((v) => !v)} aria-label={som ? 'Desligar som' : 'Ligar som'}>{som ? <Volume2 /> : <VolumeX />}</button>
          {e && (
            <span className="pk-valor">
              Nível {e.nivel} · Blinds {e.sb}/{e.bb}
              {e.proximoNivel ? ` · sobe em ${Math.floor(nivelEm / 60)}:${String(nivelEm % 60).padStart(2, '0')}` : ''}
            </span>
          )}
        </div>

        {!e && <div className="pk-aviso">Embaralhando…</div>}

        {/* board */}
        <div className="pk-board">
          {e?.board.map((c, i) => (
            <Carta key={`${e.maoNum}-${c}`} carta={c} className="grande"
              atraso={suspense && i >= 3 ? (i - 2) * 0.8 : (i < 3 ? i : 0) * 0.12}
              destaque={melhores.has(c)} apagada={fimDaMao && melhores.size > 0 && !melhores.has(c)} />
          ))}
        </div>

        {/* pote */}
        {e && e.pote > 0 && !fimDaMao && (
          <div className="pk-pote">
            <Pilha valor={e.pote} />
            <span className="pk-valor">Pote {e.pote.toLocaleString('pt-BR')}</span>
            {disputados.length > 1 && <small>{disputados.map((p, i) => `${i ? 'Lateral' : 'Principal'} ${p.valor}`).join(' · ')}</small>}
          </div>
        )}

        {/* apostas da rua: vão do jogador pro pote quando a rua fecha */}
        <AnimatePresence>
          {!fimDaMao && e?.apostas.map((v, s) => v > 0 && (
            <motion.div key={`${e.maoNum}-${e.board.length}-${s}`} className="pk-aposta"
              initial={{ ...pct(lugar(s)), opacity: 0 }}
              animate={{ ...pct(lugarAposta(lugar(s))), opacity: 1 }}
              exit={{ ...pct(POTE), opacity: 0, transition: { duration: 0.45 } }}
              transition={{ duration: 0.35 }}>
              <Pilha valor={v} />
              <span className="pk-valor" style={{ fontSize: 'calc(18 * var(--p))' }}>{v}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* pote voando pro vencedor */}
        <AnimatePresence>
          {fimDaMao && e!.ganhos?.map((g, s) => g > 0 && (
            <motion.div key={`ganho-${e!.maoNum}-${s}`} className="pk-aposta"
              initial={{ ...pct(POTE), opacity: 1, scale: 1.2 }}
              animate={{ ...pct(lugar(s)), opacity: [1, 1, 0], scale: 1 }}
              transition={{ duration: 1.1, delay: 0.5, ease: 'easeInOut' }}>
              <Pilha valor={g} />
              <span className="pk-valor" style={{ fontSize: 'calc(18 * var(--p))', color: '#4ade80' }}>+{g}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* cartas de cada um: saem do centro (o dealer) e viram na mão */}
        {e && match.players.map((_, s) => {
          const minhas = s === eu;
          const cartas = minhas ? e.minhas : e.cartas?.[s] ?? (e.ativos[s] && !e.foldou[s] ? [null, null] : null);
          if (!cartas) return null;
          const ordem = (s - e.botao - 1 + n) % n;      // distribuição começa à esquerda do botão
          return (
            <motion.div key={`${e.maoNum}-c${s}`} className={`pk-maos ${minhas ? 'minhas' : ''}`}
              initial={{ left: '50%', top: '30%', opacity: 0, scale: 0.5 }}
              animate={{ ...pct(lugarCartas(s)), opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.09 * ordem }}>
              {cartas.map((c, i) => (
                <Carta key={i} carta={c} className={minhas ? 'grande' : 'mini'} atraso={0.09 * ordem + 0.35 + i * 0.1}
                  apagada={e.foldou[s]} destaque={!!c && melhores.has(c)} />
              ))}
            </motion.div>
          );
        })}

        {/* assentos */}
        {match.players.map((jog, s) => {
          const l = lugar(s);
          const fora = !!e && (e.saiu[s] || e.colocacao.includes(s)) && !e.fim;
          const daVez = e?.vez === s;
          const fracao = daVez && e ? Math.max(0, Math.min(1, (e.prazo - agora) / e.tempo)) : 0;
          const badge = badges[s];
          return (
            <React.Fragment key={jog.id}>
              <div className="pk-assento" style={pct(l)}>
                <div className={`pk-avatar ${daVez ? 'vez' : ''} ${fora ? 'fora' : ''} ${fimDaMao && vencedoresMao.has(s) ? 'ganhou' : ''}`}>
                  <img src={jog.avatar || sp(`avatar-${s % 6}`)} alt={jog.name} />
                  {daVez && (
                    <svg className="pk-anel" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="47" fill="none" stroke={fracao < 0.25 ? '#ff4040' : '#33e27a'} strokeWidth="5"
                        strokeDasharray={`${295.3 * fracao} 295.3`} strokeLinecap="round" />
                    </svg>
                  )}
                  {e?.botao === s && <img className="pk-marca" src={sp('dealer')} alt="Dealer" />}
                  {e && !fimDaMao && e.posSb === s && e.posBb !== s && <span className="pk-sb">SB</span>}
                  {e && !fimDaMao && e.posBb === s && <span className="pk-sb bb">BB</span>}
                </div>
                <span className="pk-valor" style={{ fontSize: 'calc(20 * var(--p))', marginTop: 'calc(-12 * var(--p))' }}>
                  {fora ? 'Fora' : <Contador valor={e?.fichas[s] ?? 0} />}
                </span>
                <small>{nomeDe(s)}</small>
              </div>
              <AnimatePresence>
                {badge && (
                  <motion.span key={badge.id} className={`pk-badge ${badge.acao}`} style={pct({ x: l.x, y: l.y - 12 })}
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                    {badge.texto}
                  </motion.span>
                )}
              </AnimatePresence>
            </React.Fragment>
          );
        })}

        {/* banner do fim da mão */}
        <AnimatePresence>
          {fimDaMao && principal != null && !e!.fim && (
            <motion.div key={`banner-${e!.maoNum}`} className="pk-banner"
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: suspense ? 1.8 : 0.3 }}>
              <img src={sp('coroa')} alt="" />
              {e!.maos?.[principal]?.nome ?? `${nomeDe(principal)} leva`}
              <small>{principal === eu ? 'Você ganhou' : nomeDe(principal) + ' ganhou'} {e!.ganhos?.[principal]?.toLocaleString('pt-BR')} fichas</small>
            </motion.div>
          )}
        </AnimatePresence>

        {e?.minhaMao && !e.foldou[eu] && <span className="pk-minha-mao">{e.minhaMao}</span>}

        {/* ações */}
        {minhaVez && (
          <span className={`pk-valor pk-vez ${segundos <= 5 ? 'urgente' : ''}`}>Sua vez · {segundos}s</span>
        )}
        {minhaVez && e?.legais && (
          <div className="pk-acoes">
            <button className="pk-btn" onClick={() => jogar({ tipo: 'fold' })}><img src={sp('btn-fold')} alt="" />Largar</button>
            <button className="pk-btn" onClick={() => jogar({ tipo: e.legais!.check ? 'check' : 'call' })}>
              <img src={sp('btn-ok')} alt="" />{e.legais.check ? 'Check' : e.legais.call >= e.fichas[eu] ? 'All-in' : `Pagar ${e.legais.call}`}
            </button>
            {e.legais.minRaise != null && (
              <button className="pk-btn" onClick={() => setAumento((v) => (v == null ? e.legais!.minRaise : null))}>
                <img src={sp(e.apostas.some((a) => a > 0) ? 'btn-raise' : 'btn-apostar')} alt="" />
                {e.apostas.some((a) => a > 0) ? 'Aumentar' : 'Apostar'}
              </button>
            )}
          </div>
        )}
        {minhaVez && aumento != null && e?.legais?.minRaise != null && (() => {
          const L = e.legais!;
          const min = L.minRaise!, max = L.maxRaise!;
          const passo = Math.max(1, e.bb);
          const muda = (v: number) => setAumento(Math.max(min, Math.min(max, v)));
          const allin = aumento >= max;
          return (
            <div className="pk-raise">
              <div className="presets">
                {ps.map((p) => <button key={p.rotulo} onClick={() => setAumento(p.valor)}>{p.rotulo}</button>)}
              </div>
              {/* −/+ além do slider: no celular girado o arrasto pode não seguir o dedo */}
              <div className="linha">
                <button className="passo" onClick={() => muda(aumento - passo)} aria-label="Menos">−</button>
                <input type="range" min={min} max={max} step={1} value={aumento}
                  onChange={(ev) => muda(Number(ev.target.value))} aria-label="Valor do aumento" />
                <button className="passo" onClick={() => muda(aumento + passo)} aria-label="Mais">+</button>
              </div>
              <button className="confirmar" onClick={() => jogar(allin ? { tipo: 'allin' } : { tipo: 'raise', valor: aumento })}>
                {allin ? `ALL-IN ${max}` : `${e.apostas.some((a) => a > 0) ? 'Aumentar para' : 'Apostar'} ${aumento}`}
              </button>
            </div>
          );
        })()}

        {eliminado && (
          <div className="pk-aviso">
            Você foi eliminado em {n - e!.colocacao.indexOf(eu)}º
            <button onClick={sair}>Sair da mesa</button>
          </div>
        )}
      </div>

      {e?.fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2 }}
            className="w-full max-w-sm bg-[#140c08] border border-amber-500/40 rounded-3xl p-6 text-center text-white shadow-[0_0_60px_rgba(255,179,0,0.35)]">
            <img src={sp(ganhei ? 'trofeu' : 'coroa')} className="w-20 mx-auto mb-2" alt="" />
            <h3 className="text-2xl font-black">{ganhei ? 'Você levou a mesa!' : `${match.players[e.fim.vencedor]?.name} venceu`}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {e.fim.motivo === 'fichas' ? 'Ficou com todas as fichas' : e.fim.motivo === 'tempo' ? 'Um jogador deixou o tempo estourar 3 vezes seguidas' : 'Os outros saíram da mesa'}
            </p>
            <div className="mt-4 min-h-[40px] flex items-center justify-center">
              {!pago ? <p className="text-xs text-gray-500">Confirmando o resultado com o servidor…</p>
                : ganhei && match.room.stake > 0 ? <p className="text-lg font-black text-[#4ade80]">+ {brl(pago.prize ?? 0)}</p>
                : <p className="text-xs text-gray-400">{match.room.stake > 0 ? 'O pote ficou com o vencedor.' : 'Partida sem valor de entrada.'}</p>}
            </div>
            <BotaoRevanche match={match} />
            <JogadoresDaPartida players={match.players} eu={match.players[eu]?.id} />
            <button onClick={() => setMatch(null)} className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-700 font-black text-sm">
              Voltar ao início
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
