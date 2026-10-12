import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { BotaoRevanche, JogadoresDaPartida } from '../components/Chat';
import { net } from '../../net';
import { Carta } from '../../games/poker/Carta';
import { sound } from '../../games/poker/sound.js';
import { montarJogo } from '../../games/buraco/regras.js';
import { lugarDe, ordenar } from '../../games/buraco/ui.js';
import '../../games/poker/poker.css';
import '../../games/buraco/buraco.css';

const sprites = import.meta.glob('../../assets/buraco/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
const sp = (n: string) => sprites[`../../assets/buraco/${n}.webp`];
const verso = (import.meta.glob('../../assets/poker/verso.webp', { eager: true, import: 'default' }) as Record<string, string>)['../../assets/poker/verso.webp'];

type Jogo = { cartas: string[]; curinga: string | null; limpa: boolean };
type Times = { mesa: number; canastras: number; batida: number; morto: number; mao: number; total: number };
type Resultado = { bateu: number | null; times: Times[]; rodada: number };
type Ultima = { tipo: string; assento?: number; cartas?: string[]; jogo?: number; carta?: string | null; qtd?: number; morto?: number; rodadaFim?: Resultado };
type Estado = {
  assento: number; jogadores: number; time: number; mao: string[]; naMao: number[]; jogos: Jogo[][];
  lixo: string[]; monte: number; mortos: number; pegouMorto: boolean[]; vez: number | null; fase: string;
  comprada: string | null; placar: number[]; alvo: number; rodada: number; resultado: Resultado | null;
  prazo: number; tempo: number; fim: { vencedor: number; motivo: string } | null; ultima?: Ultima;
};
type Pago = { prize?: number; winners?: number[]; desistiu?: boolean; wo?: boolean; timeVencedor?: number };

const canastras = (js: Jogo[]) => js.filter((j) => j.cartas.length >= 7);

function useAgora(ms = 250) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return agora;
}

/**
 * Mesa de buraco. O servidor manda só a minha mão; os jogos e o lixo são
 * públicos. As cartas têm layoutId = id da carta, então a mesma carta voa
 * sozinha da mão pro jogo, da mão pro lixo e do lixo pra mão.
 */
export const BuracoScreen: React.FC = () => {
  const { match, setMatch, applyServerState, showNotification } = useApp();
  const [e, setE] = useState<Estado | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [fimWO, setFimWO] = useState<{ vencedor: number } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [modo, setModo] = useState<'naipe' | 'valor'>('naipe');
  const [banner, setBanner] = useState<{ texto: string; id: number; coroa?: boolean } | null>(null);
  const [som, setSom] = useState(true);
  const [sairArmado, setSairArmado] = useState(false);
  const anterior = useRef<Estado | null>(null);
  const agora = useAgora();

  const anunciar = (texto: string, coroa = false) => {
    const id = Date.now() + Math.random();
    setBanner({ texto, id, coroa });
    setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 2200);
  };

  useEffect(() => {
    if (!match) return;
    const nomeDe = (s: number) => (s === match.seat ? 'Você' : match.players[s]?.name.split(' ')[0] ?? '');
    const offEstado = net.on('estado', (novo: Estado) => {
      const velho = anterior.current;
      anterior.current = novo;
      setE(novo);
      setSel((s) => s.filter((c) => novo.mao.includes(c)));
      const u = novo.ultima;
      if (!u) return;
      if (u.tipo === 'comprar' || u.tipo === 'descartar' || u.tipo === 'tempo') sound.carta();
      if (u.tipo === 'lixo') { sound.ficha(4); for (let i = 0; i < Math.min(u.qtd ?? 1, 6); i++) sound.carta(i * 0.05); }
      if (u.tipo === 'baixar' || u.tipo === 'adicionar') sound.ficha(3);
      if (u.tipo === 'novaRodada') { setSel([]); for (let i = 0; i < 12; i++) sound.carta(i * 0.06); }
      if (u.tipo === 'tempo' && u.assento === novo.assento) showNotification('Tempo esgotado: o jogo comprou e descartou por você');
      // Canastra nova em algum time: anuncia (limpa vale 200, suja 100).
      if (velho && velho.rodada === novo.rodada) {
        for (const t of [0, 1]) {
          const antes = canastras(velho.jogos[t]).length;
          const agoraC = canastras(novo.jogos[t]);
          if (agoraC.length > antes) {
            const limpa = agoraC.some((j) => j.limpa && !canastras(velho.jogos[t]).some((v) => v.cartas[0] === j.cartas[0] && v.limpa));
            anunciar(`CANASTRA ${limpa ? 'LIMPA' : 'SUJA'}!`);
            sound.vitoria();
          }
        }
      }
      if (u.morto != null) { anunciar(`${nomeDe(u.morto).toUpperCase()} PEGOU O MORTO!`); sound.allin(); }
      if (u.rodadaFim?.bateu != null) {
        anunciar(u.rodadaFim.bateu === novo.time ? 'BATEMOS!' : 'ELES BATERAM!', true);
        if (u.rodadaFim.bateu === novo.time) sound.vitoria();
      }
      if (novo.vez === novo.assento && novo.fase === 'comprar' && velho?.vez !== novo.assento) sound.suaVez();
    });
    const offSettled = net.on('settled', (s: Pago & { state?: never }) => {
      if (s.state) applyServerState(s.state);
      setPago(s);
      if (s.desistiu) setMatch(null);
      else if (s.wo) setFimWO({ vencedor: s.timeVencedor ?? 0 });
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

  const fim = e?.fim ?? (fimWO ? { vencedor: fimWO.vencedor, motivo: 'wo' } : null);
  const ganhei = !!fim && !!e && fim.vencedor === e.time;
  useEffect(() => {
    if (ganhei) confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 }, colors: ['#ffd34d', '#ffb300', '#fff', '#ff3b3b'], zIndex: 60 });
  }, [ganhei]);

  const mao = useMemo(() => (e ? ordenar(e.mao, modo) : []), [e, modo]);
  if (!match) return null;

  const jogar = (acao: Record<string, unknown>) => { net.jogada(acao); };
  const sair = () => { net.leave(); setMatch(null); };
  const pedirSaida = () => {
    if (sairArmado || !e || fim) return sair();
    setSairArmado(true);
    showNotification('Toque de novo pra sair — você perde a entrada');
    setTimeout(() => setSairArmado(false), 3000);
  };

  const t = e?.time ?? eu % 2;
  const comprar = minhaVez && e!.fase === 'comprar';
  const jogando = minhaVez && e!.fase === 'jogar';
  // Mesma regra do servidor: só esvazia (ou fica com 1 pra descartar) quem tem morto ou pode bater.
  const podeEsvaziar = !!e && ((!e.pegouMorto[t] && e.mortos > 0) || (e.pegouMorto[t] && e.jogos[t].some((j) => j.cartas.length >= 7 && j.limpa)));
  const sobra = (k: number) => !!e && (e.mao.length - k >= 2 || podeEsvaziar);
  const jogoNovo = sel.length >= 3 ? montarJogo(sel) : null;
  const podeBaixar = jogando && !!jogoNovo && sobra(sel.length);
  const podeDescartar = jogando && sel.length === 1 && (e!.mao.length > 1 || podeEsvaziar);
  const podeEstender = (j: Jogo) => jogando && sel.length > 0 && !!montarJogo([...j.cartas, ...sel]) && sobra(sel.length);

  // Dá pra ir separando as cartas antes da sua vez; os botões é que só valem na hora.
  const alternar = (c: string) => { if (e && !e.resultado && !fim) setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c])); };
  const baixar = () => { if (podeBaixar) { jogar({ tipo: 'baixar', cartas: sel }); setSel([]); } };
  const descartar = () => { if (podeDescartar) { jogar({ tipo: 'descartar', carta: sel[0] }); setSel([]); } };
  const estender = (i: number, j: Jogo) => { if (podeEstender(j)) { jogar({ tipo: 'adicionar', jogo: i, cartas: sel }); setSel([]); } };

  const nomeDe = (s: number) => (s === eu ? 'Você' : match.players[s]?.name.split(' ')[0] ?? '');
  // De onde nasce a carta que outro jogador pôs na mesa: na direção do assento dele.
  const origem = (s?: number) => {
    if (s == null || s === eu) return undefined;
    const l = lugarDe(s, eu, n);
    return { x: `${(l.x - 50) * 14}%`, y: `${(l.y - 45) * 12}%` };
  };
  const u = e?.ultima;
  // A mão usa a largura toda entre o avatar e os botões (~1040p): com até ~12 cartas quase não sobrepõe.
  const passo = Math.min(98, (1040 - 92) / Math.max(1, mao.length - 1));
  const passoLixo = Math.min(34, 440 / Math.max(1, e?.lixo.length ?? 1));

  const dica = !e ? 'Embaralhando…'
    : e.resultado ? '' : !minhaVez ? `Vez de ${nomeDe(e.vez ?? 0)}`
    : comprar ? 'Compre do monte (PEGA) ou toque no lixo pra levar tudo'
    : sel.length === 0 ? 'Toque nas cartas pra baixar um jogo, ou escolha uma pra descartar'
    : sel.length >= 3 && !jogoNovo ? 'Essas cartas não formam sequência do mesmo naipe'
    : sel.length >= 3 && !sobra(sel.length) ? 'Só esvazia a mão quem pode bater (morto e canastra limpa)'
    : podeBaixar ? 'BAIXAR, ou toque num jogo seu pra juntar'
    : sel.length === 1 ? 'DESCARTA essa, ou toque num jogo seu pra juntar' : 'Toque num jogo seu pra juntar';

  // Função e não componente: componente criado no render remontaria os jogos a cada estado (e mataria a animação).
  const jogos = (time: number, lado: 'nos' | 'eles') => (
    <div className={`bc-jogos ${lado}`}>
      <AnimatePresence>
        {e?.jogos[time].map((j, i) => {
          const canastra = j.cartas.length >= 7;
          const alvo = lado === 'nos' && podeEstender(j);
          return (
            <motion.div key={`${e.rodada}-${time}-${i}`} layout
              className={`bc-jogo ${canastra ? 'canastra' : ''} ${j.limpa ? 'limpa' : 'suja'} ${alvo ? 'alvo' : ''}`}
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              onClick={() => lado === 'nos' && estender(i, j)}>
              {j.cartas.map((c) => (
                <Carta key={c} layoutId={c} carta={c.slice(0, 2)} className={c === j.curinga ? 'curinga' : ''}
                  de={u?.assento !== eu ? origem(u?.assento) : undefined} />
              ))}
              {canastra && <span className="selo">CANASTRA {j.limpa ? 'LIMPA' : 'SUJA'}</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="bc">
      <div className="bc-palco">
        <img className="bc-logo" src={sp('logo')} alt="" draggable={false} />

        <div className="bc-topo">
          <button onClick={pedirSaida} aria-label="Sair da mesa" className={sairArmado ? 'armado' : ''}><LogOut /></button>
          <button onClick={() => setSom((v) => !v)} aria-label={som ? 'Desligar som' : 'Ligar som'}>{som ? <Volume2 /> : <VolumeX />}</button>
          {e && (
            <div className="bc-placar">
              <span>Nós <b>{e.placar[t]}</b></span>
              <span className="eles">Eles <b>{e.placar[1 - t]}</b></span>
              <small>até {e.alvo} · rodada {e.rodada}</small>
            </div>
          )}
        </div>
        {minhaVez && <span className={`bc-vez ${segundos <= 5 ? 'urgente' : ''}`}>Sua vez · {segundos}s</span>}

        {e && jogos(1 - t, 'eles')}
        {e && jogos(t, 'nos')}

        {/* centro: mortos, monte, lixo */}
        {e && (
          <div className="bc-centro">
            <div className="bc-pilha morto" title="Mortos">
              {e.mortos > 0 ? <img src={verso} alt="" style={{ rotate: '90deg' }} /> : <div style={{ width: 'calc(70 * var(--p))' }} />}
              <span className="bc-rotulo">MORTO<b>{e.mortos}</b></span>
            </div>
            <motion.div className={`bc-pilha ${comprar ? 'clica' : ''}`} onClick={() => comprar && jogar({ tipo: 'comprar' })}
              whileTap={comprar ? { scale: 0.94 } : undefined}>
              <img src={sp('monte')} alt="Monte" />
              <span className="bc-rotulo">MONTE<b>{e.monte}</b></span>
            </motion.div>
            <div className={`bc-pilha ${comprar && e.lixo.length ? 'clica' : ''}`} onClick={() => comprar && e.lixo.length && jogar({ tipo: 'lixo' })}>
              <div className="bc-lixo" style={{ '--passo-lixo': `calc(${passoLixo - 66} * var(--p))` } as React.CSSProperties}>
                <AnimatePresence>
                  {e.lixo.map((c) => (
                    <motion.div key={c} className="bc-slot" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                      <Carta layoutId={c} carta={c.slice(0, 2)} de={u?.tipo !== 'descartar' || u.assento === eu ? undefined : origem(u.assento)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <span className="bc-rotulo">LIXO<b>{e.lixo.length}</b></span>
            </div>
          </div>
        )}

        {/* assentos */}
        {match.players.map((jog, s) => {
          const l = lugarDe(s, eu, n);
          const daVez = e?.vez === s && !e?.resultado;
          const fracao = daVez && e ? Math.max(0, Math.min(1, (e.prazo - agora) / e.tempo)) : 0;
          const qtd = e?.naMao[s] ?? 0;
          return (
            <div key={jog.id} className="bc-assento" style={{ left: `${l.x}%`, top: `${l.y}%` }}>
              <div className={`bc-avatar ${daVez ? 'vez' : ''}`}>
                <img src={jog.avatar || sp(`avatar-${s % 4}`)} alt={jog.name} />
                {daVez && (
                  <svg className="bc-anel" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="47" fill="none" stroke={fracao < 0.2 ? '#ff4040' : '#33e27a'} strokeWidth="5"
                      strokeDasharray={`${295.3 * fracao} 295.3`} strokeLinecap="round" />
                  </svg>
                )}
                {s !== eu && <span className="bc-qtd">{qtd}</span>}
              </div>
              <small>{nomeDe(s)}{n === 4 && s % 2 === t && s !== eu ? ' · parceiro' : ''}</small>
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
            <Carta key={c} layoutId={c} carta={c.slice(0, 2)} className={`mao ${c === e?.comprada ? 'nova' : ''}`}
              destaque={sel.includes(c)} onClick={() => alternar(c)} de={{ x: 0, y: -260 }} />
          ))}
        </div>

        {dica && <span className="bc-dica">{dica}</span>}

        <div className="bc-acoes">
          {jogando && <button className="bc-baixar" disabled={!podeBaixar} onClick={baixar}>BAIXAR</button>}
          {jogando && <button disabled={!podeDescartar} onClick={descartar} aria-label="Descartar"><img src={sp('btn-descarta')} alt="" /></button>}
          {comprar && <button onClick={() => jogar({ tipo: 'comprar' })} aria-label="Comprar do monte"><img src={sp('btn-pega')} alt="" /></button>}
          <button onClick={() => setModo((m) => (m === 'naipe' ? 'valor' : 'naipe'))} aria-label="Organizar a mão" title={modo === 'naipe' ? 'Ordenar por valor' : 'Ordenar por naipe'}>
            <img src={sp('btn-auto')} alt="" />
          </button>
        </div>

        {/* banners: canastra, morto, batida */}
        <AnimatePresence>
          {banner && (
            <motion.div key={banner.id} className="bc-banner"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.15, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 16 }}>
              {banner.coroa && <img className="coroa" src={sp('coroa')} alt="" />}
              <div className="faixa"><img src={sp('faixa')} alt="" /><span>{banner.texto}</span></div>
              <img className="brilho" src={sp('brilho')} alt="" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* placar da rodada */}
        <AnimatePresence>
          {e?.resultado && !fim && (
            <motion.div className="bc-painel" key={`r${e.resultado.rodada}`}
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 1.2 }}>
              <h3>{e.resultado.bateu == null ? 'Acabou o monte' : e.resultado.bateu === t ? 'Vocês bateram!' : 'Eles bateram'}</h3>
              <table>
                <thead><tr><th /><th>Nós</th><th>Eles</th></tr></thead>
                <tbody>
                  {([['Na mesa', 'mesa', 1], ['Canastras', 'canastras', 1], ['Batida', 'batida', 1], ['Morto', 'morto', 1], ['Na mão', 'mao', -1]] as const).map(([rot, k, sinal]) => (
                    <tr key={k}>
                      <td>{rot}</td>
                      {[t, 1 - t].map((tm) => {
                        const v = e.resultado!.times[tm][k] * sinal;
                        return <td key={tm} className={v < 0 ? 'neg' : v > 0 ? 'pos' : ''}>{v > 0 ? `+${v}` : v}</td>;
                      })}
                    </tr>
                  ))}
                  <tr className="total"><td>Rodada</td><td>{e.resultado.times[t].total}</td><td>{e.resultado.times[1 - t].total}</td></tr>
                  <tr className="total"><td>Placar</td><td>{e.placar[t]}</td><td>{e.placar[1 - t]}</td></tr>
                </tbody>
              </table>
              <small>Próxima rodada em {segundos}s · até {e.alvo} pontos</small>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {fim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2 }}
            className="w-full max-w-sm bg-[#1a0808] border border-amber-500/40 rounded-3xl p-6 text-center text-white shadow-[0_0_60px_rgba(255,60,60,0.35)]">
            <img src={sp(ganhei ? 'moedas' : 'coroa')} className="w-24 mx-auto mb-2" alt="" />
            <h3 className="text-2xl font-black">{ganhei ? (n === 4 ? 'Vocês venceram!' : 'Você venceu!') : (n === 4 ? 'Vocês perderam' : 'Você perdeu')}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {fim.motivo === 'pontos' && e ? `Placar final ${e.placar[t]} × ${e.placar[1 - t]}`
                : fim.motivo === 'tempo' ? 'Alguém deixou o tempo estourar 3 vezes seguidas' : ganhei ? 'O adversário saiu da mesa' : 'Você saiu da mesa'}
            </p>
            <div className="mt-4 min-h-[40px] flex items-center justify-center">
              {!pago ? <p className="text-xs text-gray-500">Confirmando o resultado com o servidor…</p>
                : ganhei && match.room.stake > 0 ? <p className="text-lg font-black text-[#4ade80]">+ R$ {((pago.prize ?? 0) / 100).toFixed(2).replace('.', ',')}</p>
                : <p className="text-xs text-gray-400">{match.room.stake > 0 ? 'A entrada ficou com quem venceu.' : 'Partida sem valor de entrada.'}</p>}
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
