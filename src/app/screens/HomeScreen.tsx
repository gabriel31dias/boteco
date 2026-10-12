import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Search,
  Gamepad2,
  Zap,
  Sparkles,
  Plus,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  X,
  Swords,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { net } from '../../net';
import { MatchInfo, Proposta, JogoInfo, Mesa } from '../types';
import { useChat } from '../context/ChatContext';
import { ConvidarAmigos } from '../components/Chat';
import { api } from '../../api.js';
import { Avatar, GoldCoinIcon } from '../components/CustomIcons';
import { StreakSection } from '../components/StreakSection';
// Capa de jogo: importada pelo Vite, que carimba hash no nome (o service worker
// é cache-first e serviria arte velha pra sempre se ela morasse em public/).
import capaSinuca from '../assets/jogo-sinuca.png';
import capaVelha from '../assets/jogo-velha.png';
import capaTruco from '../assets/jogo-truco.png';
import capaDamas from '../assets/jogo-damas.png';
import capaDomino from '../assets/jogo-domino.png';

interface GameRoom {
  id: string;
  name: string;
  subtitle: string;
  entryFee: number | 0;
  feeLabel: string;
  prize: string;
  type: 'free' | 'bronze' | 'silver' | 'gold';
  iconColor: string;
}

export const HomeScreen: React.FC<{ onOpenDeposit: () => void }> = ({ onOpenDeposit }) => {
  const { profile, walletBalance, bonusBalance, showNotification, setMatch } = useApp();
  const [roomCode, setRoomCode] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<GameRoom | null>(null);
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [start, setStart] = useState<MatchInfo | null>(null);
  const [jogos, setJogos] = useState<JogoInfo[]>([]);
  const [jogo, setJogo] = useState<string | null>(null);   // null = vitrine de jogos
  const [categoria, setCategoria] = useState('TODOS');
  const [busca, setBusca] = useState('');
  const [aposta, setAposta] = useState(0);            // valor da sala que EU crio
  const [proposta, setProposta] = useState<Proposta | null>(null);   // aposta que me ofereceram
  const [convidado, setConvidado] = useState<string | null>(null);   // quem entrou na minha sala
  const [time, setTime] = useState(0);                // duplas: time que escolho na sala privada
  const [mesa, setMesa] = useState<Mesa | null>(null); // mesa de 3+: quem já sentou e onde
  // Sala privada em que estou (código e valor confirmados pelo servidor): dá pra convidar amigos.
  const [salaPrivada, setSalaPrivada] = useState<{ code: string; stake: number } | null>(null);
  const [convidando, setConvidando] = useState(false);
  const { entrada, consumirEntrada, convidar, setProcurando } = useChat();
  // Revanche: quem chamar assim que o servidor confirmar a sala (antes disso o
  // convidado podia chegar primeiro e criar a sala com outro valor).
  const convidarAoEntrar = useRef<{ code: string; ids: number[] } | null>(null);
  // Mesa variável: contagem até abrir com quem estiver.
  const [abreEm, setAbreEm] = useState<number | null>(null);
  useEffect(() => {
    const quando = mesa?.inicioEm;
    if (!quando) { setAbreEm(null); return; }
    const tick = () => setAbreEm(Math.max(0, Math.ceil((quando - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [mesa?.inicioEm]);

  // Cada jogo com sua cara. Sem arte binária no projeto: gradiente + emoji.
  const VISUAL: Record<string, { emoji: string; fundo: string; borda: string; etiqueta: string; capa?: string }> = {
    sinuca: { emoji: '🎱', fundo: 'from-emerald-900/70 to-[#0d1f18]', borda: 'border-emerald-500/30', etiqueta: 'ESPORTES', capa: capaSinuca },
    velha: { emoji: '⭕', fundo: 'from-sky-900/70 to-[#0d1626]', borda: 'border-sky-500/30', etiqueta: 'CASUAIS', capa: capaVelha },
    domino: { emoji: '🁫', fundo: 'from-amber-900/60 to-[#1a1206]', borda: 'border-amber-500/30', etiqueta: 'ESTRATÉGIA', capa: capaDomino },
    truco: { emoji: '🃏', fundo: 'from-rose-900/60 to-[#1d0d16]', borda: 'border-rose-500/30', etiqueta: 'COMPETITIVOS', capa: capaTruco },
    'truco-duplas': { emoji: '🃏', fundo: 'from-rose-900/60 to-[#1d0d16]', borda: 'border-rose-500/30', etiqueta: 'COMPETITIVOS', capa: capaTruco },
    'domino-duplas': { emoji: '🁫', fundo: 'from-amber-900/60 to-[#1a1206]', borda: 'border-amber-500/30', etiqueta: 'ESTRATÉGIA', capa: capaDomino },
    damas: { emoji: '🔴', fundo: 'from-orange-900/60 to-[#1a0f06]', borda: 'border-orange-500/30', etiqueta: 'ESTRATÉGIA', capa: capaDamas },
  };
  const visualDe = (id: string) => VISUAL[id]
    ?? { emoji: '🎮', fundo: 'from-purple-900/60 to-[#150d2e]', borda: 'border-purple-500/30', etiqueta: 'JOGO' };
  const jogoAtual = jogos.find((j) => j.id === jogo) ?? null;
  const duplas = !!jogoAtual?.duplas;
  // Mesa de tamanho variável (dominó individual): o pote cresce com a mesa.
  const maxMesa = jogoAtual?.maxJogadores ?? jogoAtual?.jogadores ?? 2;
  const mesaVariavel = !duplas && maxMesa > 2;

  // As abas saem do próprio catálogo: categoria sem jogo não vira aba vazia,
  // e jogo novo no servidor traz a categoria dele junto.
  const categorias = ['TODOS', ...new Set(jogos.map((j) => visualDe(j.id).etiqueta))];
  const vitrine = jogos.filter((j) => {
    const naCategoria = categoria === 'TODOS' || visualDe(j.id).etiqueta === categoria;
    const t = busca.trim().toLowerCase();
    return naCategoria && (!t || j.nome.toLowerCase().includes(t) || j.subtitulo.toLowerCase().includes(t));
  });

  // Catálogo vem do servidor: jogo novo aparece sem mexer no app.
  useEffect(() => {
    api.rooms()
      .then((r: { jogos: Record<string, JogoInfo> }) => setJogos(Object.values(r.jogos ?? {})))
      .catch(() => setJogos([]));
  }, []);

  const brl = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
  const APOSTAS = [0, 2, 5, 10, 20];

  // O socket é o matchmaking: entrar na sala é `join`, achar oponente é `start`.
  useEffect(() => {
    const offStart = net.on('start', (m: MatchInfo) => setStart(m));
    const offDenied = net.on('denied', (motivo: string) => {
      showNotification(`❌ ${motivo}`);
      setIsMatchmaking(false);
      setSelectedRoom(null);
      setProposta(null);
      setConvidado(null);
      setSalaPrivada(null);
      setConvidando(false);
    });
    const offErro = net.on('erro', (msg: string) => showNotification(`❌ ${msg}`));
    // Sala privada valendo dinheiro: o convidado decide antes de qualquer débito.
    const offProposta = net.on('proposta', (p: Proposta) => {
      setProposta(p);
      setIsMatchmaking(false);   // a proposta substitui o "procurando", não empilha
    });
    const offConvidado = net.on('convidado', (c: { player: { name: string } }) => setConvidado(c.player.name));
    const offMesa = net.on('mesa', (m: Mesa) => setMesa(m));
    const offJoined = net.on('joined', (j: { code: string; room: { type: string; stake: number } }) =>
      setSalaPrivada(j.room.type === 'privada' ? { code: j.code, stake: j.room.stake } : null));
    const offRecusada = net.on('recusada', (r: { player: { name: string } }) => {
      // Nas duplas quem recebe isto continua na sala: volta a esperar a mesa encher.
      setProposta(null);
      setIsMatchmaking(true);
      setConvidado(null);
      showNotification(`${r.player.name} recusou a aposta`);
    });
    return () => { offStart(); offDenied(); offErro(); offProposta(); offConvidado(); offRecusada(); offMesa(); offJoined(); };
  }, [showNotification]);

  // Achou oponente: mostra o VS por um instante e cai na mesa.
  useEffect(() => {
    if (!start) return;
    const t = setTimeout(() => { setMatch(start); setIsMatchmaking(false); setStart(null); }, 1500);
    return () => clearTimeout(t);
  }, [start, setMatch]);

  const salas: GameRoom[] = [
    {
      id: 'r_treino',
      name: 'Sala treino',
      subtitle: 'Sem valor · vale pontos',
      entryFee: 0,
      feeLabel: 'Grátis',
      prize: '+50 Pontos',
      type: 'free',
      iconColor: 'bg-purple-600/20 text-purple-300 border-purple-400/30',
    },
    {
      id: 'r_bronze',
      name: 'Sala bronze',
      subtitle: 'Vencedor leva R$ 3,60',
      entryFee: 2.0,
      feeLabel: 'R$ 2,00',
      prize: 'R$ 3,60',
      type: 'bronze',
      iconColor: 'bg-amber-900/30 text-amber-500 border-amber-600/40',
    },
    {
      id: 'r_prata',
      name: 'Sala prata',
      subtitle: 'Vencedor leva R$ 9,00',
      entryFee: 5.0,
      feeLabel: 'R$ 5,00',
      prize: 'R$ 9,00',
      type: 'silver',
      iconColor: 'bg-slate-700/40 text-slate-300 border-slate-400/40',
    },
    {
      id: 'r_ouro',
      name: 'Sala ouro',
      subtitle: 'Vencedor leva R$ 18,00',
      entryFee: 10.0,
      feeLabel: 'R$ 10,00',
      prize: 'R$ 18,00',
      type: 'gold',
      iconColor: 'bg-amber-500/20 text-amber-400 border-amber-400/50',
    },
  ];

  // Sem duplas o vencedor leva o pote: com mesa de até 4, o prêmio é uma faixa.
  const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const rooms = salas.map((r) => {
    if (!mesaVariavel || !r.entryFee) return r;
    const min = r.entryFee * 2 * 0.9;
    const max = r.entryFee * maxMesa * 0.9;
    return { ...r, subtitle: `Vencedor leva de ${reais(min)} a ${reais(max)}`, prize: `${reais(min)} a ${reais(max)}` };
  });

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      showNotification('Digite o código da sala!');
      return;
    }
    if (aposta > walletBalance + bonusBalance) {
      showNotification(`❌ Você não tem R$ ${aposta.toFixed(2).replace('.', ',')} pra apostar`);
      return;
    }
    entrarNaSala(jogo ?? 'sinuca', roomCode.trim(), aposta);
  };

  /** Entra (ou cria) a sala privada `code`. Também é o caminho do convite de um amigo. */
  const entrarNaSala = (jogoId: string, code: string, apostaReais: number) => {
    setSelectedRoom({
      id: 'custom_' + code,
      name: `Sala privada #${code.toUpperCase()}`,
      subtitle: apostaReais ? `Valendo R$ ${apostaReais.toFixed(2).replace('.', ',')}` : 'Partida contra amigos',
      entryFee: apostaReais,
      feeLabel: apostaReais ? `R$ ${apostaReais.toFixed(2).replace('.', ',')}` : 'Privada',
      prize: apostaReais ? brl(Math.round(apostaReais * 100 * 2 * 0.9)) : 'Desafio',
      type: 'free',
      iconColor: 'bg-purple-600/20 text-purple-300 border-purple-400/30',
    });
    setIsMatchmaking(true);
    setStart(null);
    setConvidado(null);
    setMesa(null);
    setSalaPrivada(null);
    net.join({ game: jogoId, code, stake: apostaReais, ...(jogoId === jogo && duplas ? { time } : {}) });
  };

  // Convite aceito no chat: sai da fila em que estiver e entra na sala do amigo.
  // A aposta é a da sala dele — o servidor mostra a proposta antes de cobrar.
  // Revanche que eu criei: a aposta é a da partida que acabou (sou o dono).
  // Fila de um amigo: mesmo jogo e mesma sala por valor que ele escolheu.
  useEffect(() => {
    if (!entrada) return;
    consumirEntrada();
    if (isMatchmaking) net.leave();
    setJogo(entrada.jogo);
    if (entrada.roomType) {
      const sala = rooms.find((r) => r.id === `r_${entrada.roomType}`);
      if (sala) handleSelectRoom(sala, entrada.jogo);
      return;
    }
    if (!entrada.code) return;
    setRoomCode(entrada.code);
    convidarAoEntrar.current = entrada.convidar?.length ? { code: entrada.code, ids: entrada.convidar } : null;
    entrarNaSala(entrada.jogo, entrada.code, entrada.host ? entrada.stake / 100 : 0);
  }, [entrada]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A sala da revanche existe (o servidor confirmou): agora sim, chama a mesa.
  useEffect(() => {
    const p = convidarAoEntrar.current;
    if (!salaPrivada || !p || salaPrivada.code !== p.code) return;
    convidarAoEntrar.current = null;
    for (const id of p.ids) convidar(id, { jogo: jogo ?? 'sinuca', code: salaPrivada.code, stake: salaPrivada.stake, revanche: true });
  }, [salaPrivada]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Presença pros amigos: procurando partida (e onde), ou nada.
  useEffect(() => {
    if (!isMatchmaking || !selectedRoom) { setProcurando(null); return; }
    const privada = selectedRoom.id.startsWith('custom_');
    setProcurando({
      jogo: jogo ?? 'sinuca',
      sala: privada
        ? { tipo: 'privada', code: salaPrivada?.code ?? selectedRoom.id.slice(7) }
        : { tipo: 'fila', roomType: selectedRoom.id.replace(/^r_/, '') },
    });
  }, [isMatchmaking, selectedRoom, salaPrivada, jogo]);   // eslint-disable-line react-hooks/exhaustive-deps

  const aceitarAposta = () => {
    setProposta(null);
    setIsMatchmaking(true);
    net.emit('aceitar');
  };

  const recusarAposta = () => {
    net.emit('recusar');
    setProposta(null);
    setIsMatchmaking(false);
    setSelectedRoom(null);
  };

  const handleSelectRoom = (room: GameRoom, jogoId = jogo ?? 'sinuca') => {
    if (room.entryFee > walletBalance + bonusBalance) {
      showNotification(`❌ Saldo insuficiente! Faça uma recarga de pelo menos R$ ${room.entryFee.toFixed(2).replace('.', ',')}`);
      return;
    }
    setSelectedRoom(room);
    setIsMatchmaking(true);
    setStart(null);
    setMesa(null);
    setSalaPrivada(null);
    net.join({ game: jogoId, roomType: room.id });
  };

  const cancelMatchmaking = () => {
    net.leave();
    setIsMatchmaking(false);
    setSelectedRoom(null);
    setStart(null);
    setConvidado(null);
    setMesa(null);
    setSalaPrivada(null);
    setConvidando(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Top Bar with User Avatar, Name and Wallet Balance */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <Avatar url={profile.avatarUrl} size={46} alt={profile.name} />
          <div>
            <h2 className="text-[16px] font-extrabold text-white tracking-tight leading-tight">
              {profile.name}
            </h2>
            <span className="text-xs font-semibold text-purple-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Nível {profile.level}
            </span>
          </div>
        </div>

        {/* Balance Badge with + Deposit Button */}
        <button
          onClick={onOpenDeposit}
          className="flex items-center gap-2 bg-[#170e35] hover:bg-[#201449] border border-purple-500/25 rounded-full py-1.5 px-3 shadow-[0_2px_12px_rgba(0,0,0,0.5)] transition-all active:scale-95"
        >
          <GoldCoinIcon size={19} />
          <span className="text-sm font-extrabold text-[#4ade80] tracking-tight">
            R$ {walletBalance.toFixed(2).replace('.', ',')}
          </span>
          <Plus className="w-3.5 h-3.5 text-gray-400 stroke-[3]" />
        </button>
      </div>

      {/* Vitrine: escolher o jogo vem ANTES de sala, código ou aposta. */}
      {!jogo && (
        <div>
          {/* Mesmo card das Missões: sequência de dias e check-in, dado real. */}
          <div className="mb-4"><StreakSection /></div>

          {/* Título à esquerda, busca à direita — como na referência. */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-extrabold text-white tracking-wide uppercase leading-tight">
                Jogos disponíveis
              </h3>
              <p className="text-[11px] text-gray-400 font-medium leading-tight truncate">
                Escolha seu jogo e divirta-se!
              </p>
            </div>

            <div className="relative ml-auto shrink-0 w-[42%] min-w-[128px]">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar jogos..."
                className="w-full bg-[#140c2e] border border-purple-500/25 rounded-2xl py-2 pl-8 pr-3 text-[12px] text-white font-medium placeholder:text-gray-500 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* Abas de categoria: rolam na horizontal quando não cabem */}
          <div className="flex gap-1 mb-3 p-1 bg-[#120a26] rounded-2xl border border-purple-500/20 overflow-x-auto no-scrollbar">
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all ${
                  categoria === c
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.45)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {vitrine.map((j) => {
              const v = visualDe(j.id);
              return (
                <button
                  key={j.id}
                  onClick={() => setJogo(j.id)}
                  className={`text-left rounded-3xl overflow-hidden border ${v.borda} bg-[#150d2e] transition-all active:scale-[0.98] hover:brightness-110 shadow-[0_4px_20px_rgba(0,0,0,0.45)]`}
                >
                  {v.capa ? (
                    <img src={v.capa} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className={`h-24 bg-gradient-to-br ${v.fundo} flex items-center justify-center text-4xl`}>
                      {v.emoji}
                    </div>
                  )}
                  <div className="p-3">
                    <span className="block text-[13px] font-extrabold text-white leading-tight truncate">
                      {j.nome}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/25 text-[9.5px] font-bold text-purple-300 tracking-wider">
                      {v.etiqueta}
                    </span>
                    <p className="text-[10.5px] text-gray-400 font-medium leading-tight mt-1.5 line-clamp-2">
                      {j.subtitulo}
                    </p>
                    <div className="mt-2 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-center text-[11px] font-black tracking-wide">
                      JOGAR ▸
                    </div>
                  </div>
                </button>
              );
            })}
            {!vitrine.length && (
              <p className="col-span-2 text-xs text-gray-400 p-3 rounded-2xl bg-[#170e35] border border-purple-500/15">
                {jogos.length ? 'Nenhum jogo nessa busca.' : 'Carregando os jogos…'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Daqui pra baixo só faz sentido com um jogo na mão. */}
      {jogo && (
      <>
      {/* Cabeçalho do jogo escolhido, com a volta pra vitrine */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setJogo(null); setSelectedRoom(null); }}
          className="w-9 h-9 rounded-xl bg-[#170e35] border border-purple-500/25 grid place-items-center text-purple-300 active:scale-95"
          aria-label="Voltar para os jogos"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className={`flex-1 flex items-center gap-3 p-2.5 rounded-2xl border ${visualDe(jogo).borda} bg-gradient-to-r ${visualDe(jogo).fundo}`}>
          {visualDe(jogo).capa
            ? <img src={visualDe(jogo).capa} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
            : <span className="text-2xl">{visualDe(jogo).emoji}</span>}
          <div className="min-w-0">
            <span className="block text-sm font-extrabold text-white truncate">{jogoAtual?.nome ?? jogo}</span>
            <span className="block text-[11px] text-gray-300 font-medium truncate">{jogoAtual?.subtitulo}</span>
          </div>
        </div>
      </div>

      {/* Code Room Entry Card (Entrar por código) */}
      <div
        className="rounded-3xl p-4 overflow-hidden relative"
        style={{
          background: 'linear-gradient(135deg, rgba(28, 18, 56, 0.95) 0%, rgba(16, 11, 38, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.22)',
          boxShadow: '0 6px 25px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-purple-400" />
            Entrar com código
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Salas privadas</span>
        </div>

        <form onSubmit={handleJoinByCode} className="flex gap-2">
          <input
            type="text"
            placeholder="Digite o código da sala..."
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="flex-1 bg-[#120a26] border border-purple-500/30 rounded-2xl py-2.5 px-3.5 text-white font-mono text-sm uppercase placeholder-gray-500 focus:outline-none focus:border-purple-400"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-[0_0_12px_rgba(168,85,247,0.4)] active:scale-95 transition-all shrink-0"
          >
            Entrar
          </button>
        </form>

        {/* Duplas: quem entra pelo código escolhe o lado. Time cheio o servidor recusa. */}
        {duplas && (
          <div className="mt-3">
            <span className="block text-[11px] font-semibold text-gray-400 mb-1.5">Seu time</span>
            <div className="flex gap-1.5">
              {['Time A', 'Time B'].map((nome, t) => (
                <button
                  key={nome}
                  type="button"
                  aria-pressed={time === t}
                  onClick={() => setTime(t)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all active:scale-95 ${
                    time === t
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400/50'
                      : 'bg-[#120a26] text-gray-300 border-purple-500/25'}`}
                >
                  {nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Valor da aposta — vale só pra quem CRIA a sala */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-400">
              Valor da aposta <span className="text-gray-500">(ao criar a sala)</span>
            </span>
            {aposta > 0 && (
              <span className="text-[11px] font-bold text-[#4ade80]">
                vencedor leva {brl(Math.round(aposta * 100 * 2 * 0.9))}
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {APOSTAS.map((v) => {
              const podePagar = v <= walletBalance + bonusBalance;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={!podePagar}
                  onClick={() => setAposta(v)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all active:scale-95 ${
                    aposta === v
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400/50'
                      : podePagar
                      ? 'bg-[#120a26] text-gray-300 border-purple-500/25'
                      : 'bg-[#120a26] text-gray-600 border-white/5 cursor-not-allowed'
                  }`}
                >
                  {v === 0 ? 'Grátis' : `R$ ${v}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Salas por valor de entrada (100% matching screenshot) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[15px] font-bold text-white tracking-tight">
            Salas por valor de entrada
          </h3>
          <button
            onClick={() => showNotification('Mostrando todas as 4 salas disponíveis')}
            className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
          >
            Ver todas
          </button>
        </div>

        {/* Rooms List (Sala treino, Sala bronze, Sala prata, Sala ouro) */}
        <div className="flex flex-col gap-2.5">
          {rooms.map((room) => {
            return (
              <div
                key={room.id}
                onClick={() => handleSelectRoom(room)}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#170e35] border border-purple-500/15 hover:border-purple-500/35 hover:bg-[#1d1242] transition-all cursor-pointer active:scale-[0.99] shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  {/* Room Icon Squircle */}
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-sm ${room.iconColor}`}
                  >
                    <Gamepad2 className="w-5 h-5" />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {room.name}
                    </h4>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      {room.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right Entry Pill Badge */}
                <div
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-sm border transition-all ${
                    room.type === 'free'
                      ? 'bg-purple-950/60 border-purple-500/40 text-purple-200'
                      : room.type === 'bronze'
                      ? 'bg-amber-950/40 border-amber-600/50 text-amber-300'
                      : room.type === 'silver'
                      ? 'bg-slate-800/80 border-slate-400/40 text-slate-200'
                      : 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  }`}
                >
                  {room.feeLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      </>
      )}

      {/* "Acontecendo agora" (Torneio Relâmpago) escondido por enquanto: o
          torneio não existe no servidor — nem inscrição, nem prêmio, nem os
          "17 jogadores". Volta quando tiver torneio de verdade.
      {/* Acontecendo agora Section (Torneio Relâmpago) * /}
      <div>
        <h3 className="text-[15px] font-bold text-white tracking-tight mb-2.5">
          Acontecendo agora
        </h3>

        {/* Elevated Tournament Card * /}
        <div
          className="relative flex items-center justify-between p-4 rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(32, 20, 64, 0.95) 0%, rgba(18, 12, 40, 0.98) 100%)',
            border: '1.5px solid rgba(168, 85, 247, 0.25)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div className="flex items-center gap-3.5">
            {/* Lightning Icon * /}
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Zap className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-1.5 leading-tight">
                Torneio Relâmpago <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h4>
              <p className="text-[11.5px] text-gray-300 font-medium mt-0.5">
                Começa em 14 min · 128 jogadores · R$ 400
              </p>
            </div>
          </div>

          <button
            onClick={() => showNotification('Inscrição no Torneio Relâmpago confirmada! ⚡')}
            className="px-4 py-2 rounded-2xl bg-[#140a28] hover:bg-[#1f103d] border border-purple-500/40 text-white font-extrabold text-xs shadow-md transition-all active:scale-95 shrink-0"
          >
            Entrar
          </button>
        </div>
      </div>

      */}

      {/* Nível 12 & XP Progress Bar (Bottom Section matching screenshot) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-white">Nível {profile.level}</span>
          <span className="text-gray-400 font-medium">
            {profile.nextLevelXp - profile.currentXp} pts para o nível {profile.level + 1}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-[#140b2a] rounded-full overflow-hidden border border-purple-500/20">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full shadow-[0_0_8px_#a855f7]"
            style={{ width: `${(profile.currentXp / profile.nextLevelXp) * 100}%` }}
          />
        </div>
      </div>

      {/* Proposta de aposta — o convidado decide antes de qualquer débito */}
      {proposta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#140c2c] border border-amber-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(245,158,11,0.3)] text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 mb-3">
              <Swords className="w-7 h-7" />
            </div>

            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
              Sala #{proposta.code}
            </span>
            <h3 className="text-xl font-black text-white mt-1">
              {proposta.host.name} te desafiou
            </h3>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <div className="rounded-2xl bg-[#1b1238] border border-purple-500/20 py-3">
                <p className="text-[11px] text-gray-400 font-semibold">Sua entrada</p>
                <p className="text-lg font-black text-white">{brl(proposta.stake)}</p>
              </div>
              <div className="rounded-2xl bg-[#132a1f] border border-emerald-500/25 py-3">
                <p className="text-[11px] text-gray-400 font-semibold">Se vencer</p>
                <p className="text-lg font-black text-[#4ade80]">{brl(proposta.prize)}</p>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-3">
              O valor sai do seu saldo só quando você aceitar.
            </p>

            <div className="flex gap-2 mt-5">
              <button
                onClick={recusarAposta}
                className="flex-1 py-3 rounded-2xl bg-[#1b1238] border border-purple-500/20 text-gray-300 font-bold text-xs active:scale-95 transition-all"
              >
                Recusar
              </button>
              <button
                onClick={aceitarAposta}
                className="flex-[1.6] py-3 rounded-2xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-black text-sm shadow-[0_0_20px_rgba(34,197,94,0.35)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aceitar e jogar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matchmaking Lobby Modal */}
      {isMatchmaking && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#140c2c] border border-purple-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(168,85,247,0.4)] text-center relative overflow-hidden">
            {/* Close Button */}
            <button
              onClick={cancelMatchmaking}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Room Info */}
            <div className="space-y-1 mb-6">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                {selectedRoom.name}
              </span>
              <h3 className="text-xl font-black text-white">
                {start ? 'Oponente encontrado!'
                  : convidado ? `${convidado} entrou`
                  : mesa && !mesa.duplas && mesa.jogadores > 2
                    ? (abreEm !== null ? `Começa em ${abreEm}s` : 'Esperando jogadores…')
                  : mesa && mesa.jogadores > 2
                    ? `Faltam ${mesa.jogadores - mesa.players.length} jogador${mesa.jogadores - mesa.players.length === 1 ? '' : 'es'}`
                  : 'Procurando partida...'}
              </h3>
              <p className="text-xs text-gray-400">
                {convidado && !start
                  ? 'Aguardando a aposta ser aceita…'
                  : mesa && !mesa.duplas && mesa.jogadores > 2 && mesa.premio
                    ? `Prêmio com ${Math.max(mesa.players.length, mesa.minimo ?? 2)}: ${brl(mesa.premio)} · entra mais gente, sobe`
                  : `Prêmio: ${selectedRoom.prize}`}
              </p>
            </div>

            {/* Mesa individual de até 4: quem já sentou e as vagas que faltam */}
            {mesa && !mesa.duplas && mesa.jogadores > 2 && !start ? (
              <div className="grid grid-cols-2 gap-2 py-2">
                {Array.from({ length: mesa.jogadores }, (_, k) => {
                  const p = mesa.players[k];
                  return (
                    <div key={k} className="flex items-center gap-2 rounded-2xl bg-[#1b1238] border border-purple-500/20 p-2">
                      {p ? <Avatar url={p.avatar} size={28} alt="" />
                        : <span className="w-7 h-7 rounded-full border border-dashed border-purple-500/40" />}
                      <span className={`text-xs font-bold truncate ${p ? 'text-white' : 'text-gray-500'}`}>
                        {p ? p.name : 'vaga livre'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : mesa && mesa.jogadores > 2 && !start ? (
              <div className="grid grid-cols-2 gap-3 py-2">
                {[0, 1].map((t) => {
                  const nomes = mesa.players.filter((p) => p.time === t).map((p) => p.name);
                  return (
                    <div key={t} className="rounded-2xl bg-[#1b1238] border border-purple-500/20 p-3">
                      <p className="text-[11px] font-bold text-purple-300 uppercase mb-2">Time {t === 0 ? 'A' : 'B'}</p>
                      {Array.from({ length: mesa.jogadores / 2 }, (_, k) => (
                        <p key={k} className={`text-xs font-bold py-1 truncate ${nomes[k] ? 'text-white' : 'text-gray-500'}`}>
                          {nomes[k] ?? 'vaga livre'}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="flex items-center justify-around py-4">
              {/* User Side */}
              <div className="flex flex-col items-center gap-2">
                <Avatar url={profile.avatarUrl} size={60} alt="Você" />
                <span className="text-xs font-bold text-white">Você</span>
              </div>

              {/* VS Icon / Spinner */}
              <div className="flex flex-col items-center justify-center">
                {start ? (
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                    <Swords className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 animate-spin">
                    <Loader2 className="w-6 h-6" />
                  </div>
                )}
                <span className="text-xs font-black text-amber-400 mt-1">VS</span>
              </div>

              {/* Opponent Side */}
              <div className="flex flex-col items-center gap-2">
                {start?.players[(start.seat + 1) % start.players.length]?.avatar ? (
                  <Avatar url={start.players[(start.seat + 1) % start.players.length].avatar} size={60} />
                ) : (
                  <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-500 flex items-center justify-center text-xl shadow-md">
                    {start ? '⚡' : '?'}
                  </div>
                )}
                <span className="text-xs font-bold text-gray-300">
                  {start
                    ? start.players.filter((_, i) => i % 2 !== start.seat % 2).map((p) => p.name).join(' e ')
                    : convidado ?? 'Buscando...'}
                </span>
              </div>
            </div>
            )}

            {/* Bottom Status Button */}
            <div className="mt-6">
              {start ? (
                <button
                  onClick={() => { setMatch(start); setIsMatchmaking(false); setStart(null); }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-black text-sm shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Entrar no Jogo 🎮</span>
                </button>
              ) : (
                <>
                {/* Sala privada: chama os amigos daqui mesmo, sem passar o código */}
                {salaPrivada && (
                  <button
                    onClick={() => setConvidando(true)}
                    className="w-full mb-2 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    Convidar amigos
                  </button>
                )}
                <button
                  onClick={cancelMatchmaking}
                  className="w-full py-3 rounded-2xl bg-[#1b1238] border border-purple-500/20 text-gray-300 font-bold text-xs hover:bg-[#25194d]"
                >
                  Cancelar Busca
                </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {convidando && salaPrivada && (
        <ConvidarAmigos
          sala={{ jogo: jogo ?? 'sinuca', code: salaPrivada.code, stake: salaPrivada.stake }}
          onClose={() => setConvidando(false)}
        />
      )}
    </div>
  );
};
