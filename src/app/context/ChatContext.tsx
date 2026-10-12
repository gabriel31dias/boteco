import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { chat } from '../../chat.js';
import { useApp } from './AppContext';

export type Perfil = { id: number; name: string; username: string; level: number; avatar: string | null };
export type Amigo = Perfil & { online: boolean; presenca?: Presenca | null };
export type Msg = { id: number; canal: 'geral' | 'dm'; de: Perfil; para: number | null; texto: string; em: number; lida: boolean };
export type Relacao = 'nenhuma' | 'amigos' | 'enviado' | 'recebido' | 'bloqueei';
export type Recente = Perfil & { jogo: string; em: number; relacao: Relacao };
/** Convite pra sala privada de um amigo. `stake` em centavos (0 = sem valor). */
export type Convite = { de: Perfil; jogo: string; nomeJogo: string; code: string; stake: number; revanche?: boolean };
/**
 * O que o lobby tem de fazer ao voltar pra ele: entrar numa sala privada
 * (convite aceito, ou a revanche que eu criei), ou na fila de um amigo.
 * `host`: sou eu quem cria a sala (com o valor `stake`); `convidar`: quem chamar
 * assim que o servidor confirmar a sala.
 */
export type Entrada = {
  jogo: string; code?: string; roomType?: string; stake: number;
  host?: boolean; convidar?: number[]; revanche?: boolean;
};
/** Onde o amigo está agora (o app dele conta). */
export type Presenca = {
  estado: 'lobby' | 'procurando' | 'jogando'; jogo?: string | null; nomeJogo?: string | null;
  sala?: { tipo: 'privada'; code: string } | { tipo: 'fila'; roomType: string };
};
/** Aviso curto (dentro da partida o chat não abre: só avisa). */
export type Aviso = { id: number; texto: string };

type Inicio = { geral: Msg[]; amigos: Amigo[]; pedidos: Perfil[]; naoLidas: Record<number, number>; bloqueados: number[] };

interface ChatContextType {
  aberto: boolean;
  abrir: (aba?: Aba) => void;
  fechar: () => void;
  aba: Aba;
  setAba: (a: Aba) => void;
  geral: Msg[];
  amigos: Amigo[];
  pedidos: Perfil[];
  naoLidas: Record<number, number>;
  bloqueados: number[];
  totalAvisos: number;
  conversaCom: Amigo | null;
  conversa: Msg[];
  abrirConversa: (a: Amigo) => void;
  fecharConversa: () => void;
  enviarGeral: (texto: string) => Promise<boolean>;
  enviarDM: (texto: string) => Promise<boolean>;
  pedirAmizade: (id: number) => Promise<Relacao | null>;
  responder: (id: number, aceitar: boolean) => Promise<void>;
  desfazer: (id: number) => Promise<void>;
  bloquear: (id: number) => Promise<void>;
  recentes: () => Promise<Recente[]>;
  relacaoCom: (id: number) => Promise<{ relacao: Relacao } | null>;
  /** Pedido que chegou nesta sessão e ainda não foi visto: vira modal no lobby. */
  pedidoNovo: Perfil | null;
  adiarPedido: () => void;
  avisos: Aviso[];
  /** Convida um amigo pra sala privada em que estou. @returns se ele estava online */
  convidar: (para: number, sala: { jogo: string; code: string; stake: number; revanche?: boolean }) => Promise<boolean | null>;
  conviteAtual: Convite | null;
  recusarConvite: () => void;
  aceitarConvite: () => void;
  /** Pra onde o lobby tem de ir (convite aceito, revanche, fila do amigo). */
  entrada: Entrada | null;
  entrarEm: (e: Entrada) => void;
  consumirEntrada: () => void;
  /** Cria a sala da revanche e chama quem estava na mesa, com o mesmo valor. */
  revanche: (m: { game: string; room: { stake: number }; players: { id: number }[]; seat: number }) => void;
  /** O lobby conta se estou procurando partida (sala privada ou fila). */
  setProcurando: (p: { jogo: string; sala: Presenca['sala'] } | null) => void;
  historico: (com: number) => Promise<{ partidas: number; vitorias: number; derrotas: number } | null>;
  denunciar: (id: number, motivo: string, mensagemId?: number) => Promise<boolean>;
}

export type Aba = 'geral' | 'amigos' | 'recentes';

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, profile, match, showNotification } = useApp();
  const eu = profile.id;
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>('geral');
  const [geral, setGeral] = useState<Msg[]>([]);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [pedidos, setPedidos] = useState<Perfil[]>([]);
  const [naoLidas, setNaoLidas] = useState<Record<number, number>>({});
  const [bloqueados, setBloqueados] = useState<number[]>([]);
  const [conversaCom, setConversaCom] = useState<Amigo | null>(null);
  const [conversas, setConversas] = useState<Record<number, Msg[]>>({});
  const [pedidosNovos, setPedidosNovos] = useState<Perfil[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [procurando, setProcurando] = useState<{ jogo: string; sala: Presenca['sala'] } | null>(null);

  // Os ouvintes do socket leem o valor atual por ref: sem isso eles veriam o
  // estado de quando foram inscritos (a conversa aberta, se estou em partida).
  const agora = useRef({ aberto, conversaCom, match, eu });
  agora.current = { aberto, conversaCom, match, eu };

  const avisar = useCallback((texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-2), { id, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  // Liga no login, desliga no logout.
  useEffect(() => {
    if (!isAuthenticated) { chat.desconectar(); return; }
    chat.conectar();
    const offs = [
      chat.on('chat:inicio', (i: Inicio) => {
        setGeral(i.geral); setAmigos(i.amigos); setPedidos(i.pedidos);
        setNaoLidas(i.naoLidas); setBloqueados(i.bloqueados);
      }),
      chat.on('geral:msg', (m: Msg) => setGeral((g) => [...g.slice(-99), m])),
      chat.on('dm:msg', (m: Msg) => {
        const { aberto: ab, conversaCom: cc, eu: me } = agora.current;
        const outro = m.de.id === me ? m.para! : m.de.id;
        setConversas((c) => (c[outro] ? { ...c, [outro]: [...c[outro], m] } : c));
        if (m.de.id === me) return;
        if (ab && cc?.id === outro) { chat.pedir('dm:lida', { de: outro }).catch(() => {}); return; }
        setNaoLidas((n) => ({ ...n, [outro]: (n[outro] ?? 0) + 1 }));
        avisar(`💬 ${m.de.name}: ${m.texto.slice(0, 60)}`);
      }),
      chat.on('amizade:pedido', (p: Perfil) => {
        setPedidos((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]));
        setPedidosNovos((ps) => [...ps, p]);
        if (agora.current.match) avisar(`👋 ${p.name} quer ser seu amigo`);
      }),
      chat.on('amizade:aceita', (a: Amigo) => {
        setAmigos((as) => (as.some((x) => x.id === a.id) ? as : [...as, a]));
        setPedidos((ps) => ps.filter((x) => x.id !== a.id));
        avisar(`🤝 ${a.name} agora é seu amigo`);
      }),
      chat.on('amizade:desfeita', ({ id }: { id: number }) => {
        setAmigos((as) => as.filter((x) => x.id !== id));
        if (agora.current.conversaCom?.id === id) setConversaCom(null);
      }),
      chat.on('amigo:online', ({ id, online, presenca }: { id: number; online: boolean; presenca?: Presenca | null }) =>
        setAmigos((as) => as.map((x) => (x.id === id ? { ...x, online, presenca: presenca ?? null } : x)))),
      chat.on('convite', (c: Convite) => {
        // O mesmo amigo convidando de novo pra mesma sala não empilha.
        setConvites((cs) => [...cs.filter((x) => !(x.de.id === c.de.id && x.code === c.code)), c]);
        if (agora.current.match) avisar(`🎮 ${c.de.name} te convidou pra ${c.nomeJogo}`);
      }),
    ];
    return () => { offs.forEach((off) => off()); };
  }, [isAuthenticated, avisar]);

  // Presença: jogando (tem partida), procurando (o lobby avisou) ou no lobby.
  // Reenvia quando o chat (re)conecta, senão os amigos veriam "lobby" pra sempre.
  const presencaAgora = match
    ? { estado: 'jogando', jogo: match.game }
    : procurando ? { estado: 'procurando', jogo: procurando.jogo, sala: procurando.sala } : { estado: 'lobby' };
  const presencaJson = JSON.stringify(presencaAgora);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const enviar = () => chat.pedir('presenca', JSON.parse(presencaJson)).catch(() => {});
    enviar();
    return chat.on('chat:inicio', enviar);
  }, [isAuthenticated, presencaJson]);

  const erro = useCallback((e: unknown) => showNotification(`❌ ${(e as Error).message}`), [showNotification]);

  const abrirConversa = useCallback((a: Amigo) => {
    setConversaCom(a);
    setNaoLidas((n) => { const c = { ...n }; delete c[a.id]; return c; });
    chat.pedir('dm:conversa', { com: a.id })
      .then((r: { msgs: Msg[] }) => setConversas((c) => ({ ...c, [a.id]: r.msgs })))
      .catch(erro);
  }, [erro]);

  const ctx: ChatContextType = {
    aberto,
    abrir: (a) => { if (a) setAba(a); setAberto(true); },
    fechar: () => { setAberto(false); setConversaCom(null); },
    aba, setAba,
    geral: geral.filter((m) => !bloqueados.includes(m.de.id)),
    amigos, pedidos, naoLidas, bloqueados,
    totalAvisos: pedidos.length + Object.values(naoLidas).reduce((s, n) => s + n, 0),
    conversaCom,
    conversa: conversaCom ? conversas[conversaCom.id] ?? [] : [],
    abrirConversa,
    fecharConversa: () => setConversaCom(null),
    enviarGeral: (texto) => chat.pedir('geral:enviar', { texto }).then(() => true, (e) => { erro(e); return false; }),
    enviarDM: (texto) => (conversaCom
      ? chat.pedir('dm:enviar', { para: conversaCom.id, texto }).then(() => true, (e) => { erro(e); return false; })
      : Promise.resolve(false)),
    pedirAmizade: (id) => chat.pedir('amizade:pedir', { id }).then((r: { relacao: Relacao; amigo?: Amigo }) => {
      if (r.amigo) setAmigos((as) => [...as.filter((x) => x.id !== r.amigo!.id), r.amigo!]);
      setPedidos((ps) => ps.filter((x) => x.id !== id));
      showNotification(r.relacao === 'amigos' ? '🤝 Agora vocês são amigos' : '👋 Pedido de amizade enviado');
      return r.relacao;
    }, (e) => { erro(e); return null; }),
    responder: (id, aceitar) => chat.pedir('amizade:responder', { id, aceitar }).then((r: { amigo?: Amigo }) => {
      setPedidos((ps) => ps.filter((x) => x.id !== id));
      setPedidosNovos((ps) => ps.filter((x) => x.id !== id));
      if (r.amigo) setAmigos((as) => [...as.filter((x) => x.id !== r.amigo!.id), r.amigo!]);
    }, erro),
    desfazer: (id) => chat.pedir('amizade:desfazer', { id }).then(() => {
      setAmigos((as) => as.filter((x) => x.id !== id));
      setConversaCom(null);
    }, erro),
    bloquear: (id) => chat.pedir('bloquear', { id }).then((r: { bloqueados: number[] }) => {
      setBloqueados(r.bloqueados);
      setAmigos((as) => as.filter((x) => x.id !== id));
      setPedidos((ps) => ps.filter((x) => x.id !== id));
      setConversaCom(null);
      showNotification('Jogador bloqueado');
    }, erro),
    recentes: () => chat.pedir('recentes').then((r: { jogadores: Recente[] }) => r.jogadores, (e) => { erro(e); return []; }),
    relacaoCom: (id) => chat.pedir('relacao', { com: id }).catch(() => null),
    pedidoNovo: pedidosNovos[0] ?? null,
    adiarPedido: () => setPedidosNovos((ps) => ps.slice(1)),
    avisos,
    convidar: (para, s) => chat.pedir('convite:enviar', { para, ...s })
      .then((r: { online: boolean }) => r.online, (e) => { erro(e); return null; }),
    conviteAtual: convites[0] ?? null,
    recusarConvite: () => setConvites((cs) => cs.slice(1)),
    aceitarConvite: () => {
      const c = convites[0];
      if (c) setEntrada({ jogo: c.jogo, code: c.code, stake: c.stake });
      setConvites([]);                 // entrou numa sala: os outros convites perdem o sentido
      setAberto(false);
    },
    entrada,
    entrarEm: (e) => { setEntrada(e); setAberto(false); setConversaCom(null); },
    consumirEntrada: () => setEntrada(null),
    revanche: (m) => {
      const code = `R${Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, '0')}`;
      setEntrada({
        jogo: m.game, code, stake: m.room.stake, host: true, revanche: true,
        convidar: m.players.filter((_, i) => i !== m.seat).map((p) => p.id),
      });
    },
    setProcurando,
    historico: (com) => chat.pedir('historico', { com }).catch(() => null),
    denunciar: (id, motivo, mensagemId) => chat.pedir('denunciar', { id, motivo, mensagemId })
      .then(() => { showNotification('Denúncia enviada. Obrigado por avisar.'); return true; },
        (e) => { erro(e); return false; }),
  };

  return <ChatContext.Provider value={ctx}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const c = useContext(ChatContext);
  if (!c) throw new Error('useChat fora do ChatProvider');
  return c;
};
