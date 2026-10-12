import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, ArrowLeft, Send, UserPlus, Check, Clock, Ban, UserMinus, Users, Flag, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat, Amigo, Msg, Recente, Relacao, Aba, Presenca } from '../context/ChatContext';
import { Avatar } from './CustomIcons';

const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const NOME_JOGO: Record<string, string> = {
  sinuca: 'Sinuca', velha: 'Velha', domino: 'Dominó', 'domino-duplas': 'Dominó em duplas',
  truco: 'Truco', 'truco-duplas': 'Truco em duplas', damas: 'Damas',
  poker: 'Pôquer', buraco: 'Buraco', 'buraco-duplas': 'Buraco em duplas', cacheta: 'Cacheta',
};

/** Ícone flutuante do lobby, com o total de mensagens não lidas e pedidos. */
export const ChatBotao: React.FC = () => {
  const { abrir, totalAvisos } = useChat();
  return (
    <button
      onClick={() => abrir()}
      aria-label={totalAvisos ? `Chat, ${totalAvisos} novidades` : 'Chat'}
      style={{ right: 'max(1rem, calc(50vw - 235px + 1rem))' }}
      className="fixed bottom-28 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 border border-purple-300/40 text-white grid place-items-center shadow-[0_6px_24px_rgba(124,58,237,0.55)] active:scale-95 transition-all"
    >
      <MessageCircle className="w-6 h-6" />
      {totalAvisos > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-rose-500 border-2 border-[#0a0618] text-[11px] font-black grid place-items-center">
          {totalAvisos > 99 ? '99+' : totalAvisos}
        </span>
      )}
    </button>
  );
};

/**
 * Linha de mensagem. As minhas ficam à direita, sem foto. `onPerfil`: no geral,
 * foto e nome de quem escreveu abrem o cartão dele (dá pra adicionar dali).
 */
const Balao: React.FC<{ m: Msg; minha: boolean; comNome?: boolean; onPerfil?: (p: Msg['de']) => void }> = ({
  m, minha, comNome, onPerfil,
}) => (
  <div className={`flex gap-2 ${minha ? 'justify-end' : 'justify-start'}`}>
    {!minha && (onPerfil ? (
      <button onClick={() => onPerfil(m.de)} aria-label={`Ver perfil de ${m.de.name}`} className="self-start rounded-full active:scale-95">
        <Avatar url={m.de.avatar} size={30} alt="" />
      </button>
    ) : <Avatar url={m.de.avatar} size={30} alt="" />)}
    <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${minha ? 'bg-purple-600 rounded-br-md' : 'bg-[#1f1640] rounded-bl-md'}`}>
      {comNome && !minha && (onPerfil ? (
        <button onClick={() => onPerfil(m.de)} className="block text-[11px] font-bold text-purple-300 mb-0.5 hover:underline">{m.de.name}</button>
      ) : <p className="text-[11px] font-bold text-purple-300 mb-0.5">{m.de.name}</p>)}
      <p className="text-sm text-white whitespace-pre-wrap break-words">{m.texto}</p>
      <p className={`text-[10px] mt-0.5 text-right ${minha ? 'text-purple-200' : 'text-gray-500'}`}>{hora(m.em)}</p>
    </div>
  </div>
);

/** Caixa de digitar: Enter envia, Shift+Enter quebra linha. */
const Digitar: React.FC<{ enviar: (t: string) => Promise<boolean>; placeholder: string }> = ({ enviar, placeholder }) => {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mandar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    if (await enviar(t)) setTexto('');
    setEnviando(false);
  };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mandar(); }}
      className="flex items-end gap-2 p-3 border-t border-purple-500/20 bg-[#110b26]"
    >
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, 300))}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); } }}
        placeholder={placeholder}
        rows={1}
        aria-label={placeholder}
        className="flex-1 resize-none max-h-24 bg-[#1b1238] border border-purple-500/30 rounded-2xl py-2.5 px-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
      />
      <button
        type="submit"
        disabled={!texto.trim() || enviando}
        aria-label="Enviar"
        className="w-11 h-11 shrink-0 rounded-full bg-purple-600 text-white grid place-items-center disabled:opacity-40 active:scale-95"
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
};

/** Lista que rola sozinha pro fim quando chega mensagem. */
const Mensagens: React.FC<{ msgs: Msg[]; eu?: number; comNome?: boolean; vazio: string; onPerfil?: (p: Msg['de'], msg: number) => void }> = ({
  msgs, eu, comNome, vazio, onPerfil,
}) => {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {msgs.length === 0 && <p className="text-center text-sm text-gray-500 mt-10">{vazio}</p>}
      {msgs.map((m) => <Balao key={m.id} m={m} minha={m.de.id === eu} comNome={comNome}
        onPerfil={onPerfil && ((de) => onPerfil(de, m.id))} />)}
      <div ref={fim} />
    </div>
  );
};

/** Botão de amizade que muda com a relação. */
export const BotaoAmizade: React.FC<{ id: number; relacao: Relacao; onMudou?: (r: Relacao) => void; compacto?: boolean }> = ({
  id, relacao, onMudou, compacto,
}) => {
  const { pedirAmizade, responder } = useChat();
  const [ocupado, setOcupado] = useState(false);
  const base = `shrink-0 inline-flex items-center gap-1.5 rounded-xl font-bold ${compacto ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2.5 text-sm'}`;
  if (relacao === 'amigos') return <span className={`${base} bg-emerald-500/15 text-emerald-300`}><Check className="w-3.5 h-3.5" />Amigos</span>;
  if (relacao === 'enviado') return <span className={`${base} bg-white/5 text-gray-400`}><Clock className="w-3.5 h-3.5" />Pedido enviado</span>;
  if (relacao === 'bloqueei') return <span className={`${base} bg-white/5 text-gray-500`}><Ban className="w-3.5 h-3.5" />Bloqueado</span>;
  const recebido = relacao === 'recebido';
  return (
    <button
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        if (recebido) { await responder(id, true); onMudou?.('amigos'); } else {
          const r = await pedirAmizade(id);
          if (r) onMudou?.(r);
        }
        setOcupado(false);
      }}
      className={`${base} bg-purple-600 text-white active:scale-95 disabled:opacity-50`}
    >
      <UserPlus className="w-3.5 h-3.5" />{recebido ? 'Aceitar amizade' : 'Adicionar amigo'}
    </button>
  );
};

const AbaGeral: React.FC = () => {
  const { geral, enviarGeral } = useChat();
  const { profile } = useApp();
  const [perfil, setPerfil] = useState<{ de: Msg['de']; msg: number } | null>(null);
  return (
    <>
      <Mensagens msgs={geral} eu={profile.id} comNome vazio="Ninguém falou nada ainda. Diga oi pra mesa!"
        onPerfil={(de, msg) => setPerfil({ de, msg })} />
      <Digitar enviar={enviarGeral} placeholder="Mensagem pra todos" />
      <JogadorCard jogador={perfil?.de ?? null} mensagemId={perfil?.msg} onClose={() => setPerfil(null)} />
    </>
  );
};

/** Onde o amigo está, em palavras. */
const ondeEsta = (a: Amigo) => {
  const p = a.presenca;
  if (!a.online || !p) return 'offline';
  if (p.estado === 'jogando') return `jogando ${p.nomeJogo ?? ''}`.trim();
  if (p.estado === 'procurando' && p.sala?.tipo === 'privada') return `numa sala privada de ${p.nomeJogo}`;
  if (p.estado === 'procurando') return `procurando partida de ${p.nomeJogo}`;
  return 'no lobby';
};

/** Dá pra ir onde o amigo está: entrar na sala privada dele ou na mesma fila. */
const IrJunto: React.FC<{ p?: Presenca | null }> = ({ p }) => {
  const { entrarEm } = useChat();
  const { setActiveTab } = useApp();
  if (p?.estado !== 'procurando' || !p.jogo || !p.sala) return null;
  const ir = () => {
    setActiveTab('inicio');
    entrarEm(p.sala!.tipo === 'privada'
      ? { jogo: p.jogo!, code: p.sala!.code, stake: 0 }
      : { jogo: p.jogo!, roomType: p.sala!.roomType, stake: 0 });
  };
  return (
    <button onClick={ir} className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold active:scale-95">
      {p.sala.tipo === 'privada' ? 'Entrar' : 'Jogar junto'}
    </button>
  );
};

const AbaAmigos: React.FC = () => {
  const { amigos, pedidos, naoLidas, abrirConversa, responder } = useChat();
  const ordem = [...amigos].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {pedidos.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-purple-300 mb-2">Pedidos de amizade</h4>
          <div className="space-y-2">
            {pedidos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-[#1b1238] border border-purple-500/25 p-2.5">
                <Avatar url={p.avatar} size={38} alt="" />
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}</span>
                <button onClick={() => responder(p.id, false)} className="px-3 py-1.5 rounded-xl bg-white/5 text-xs font-bold text-gray-300">Recusar</button>
                <button onClick={() => responder(p.id, true)} className="px-3 py-1.5 rounded-xl bg-purple-600 text-xs font-bold text-white">Aceitar</button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        {ordem.length === 0 ? (
          <div className="text-center mt-10 px-6">
            <Users className="w-10 h-10 mx-auto text-purple-400/60" />
            <p className="text-sm text-gray-400 mt-3">Você ainda não tem amigos aqui. Adicione quem jogou com você na aba Recentes.</p>
          </div>
        ) : ordem.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-2xl pr-2 hover:bg-white/5">
            <button
              onClick={() => abrirConversa(a)}
              aria-label={`Conversar com ${a.name}`}
              className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left"
            >
              <span className="relative">
                <Avatar url={a.avatar} size={42} alt="" />
                <i className={`absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#130d2c] ${a.online ? 'bg-emerald-400' : 'bg-gray-600'}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white truncate">{a.name}</span>
                <span className={`block text-xs truncate ${a.online ? 'text-emerald-300' : 'text-gray-500'}`}>{ondeEsta(a)}</span>
              </span>
              {naoLidas[a.id] > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-[11px] font-black text-white grid place-items-center">{naoLidas[a.id]}</span>
              )}
            </button>
            <IrJunto p={a.online ? a.presenca : null} />
          </div>
        ))}
      </section>
    </div>
  );
};

const AbaRecentes: React.FC = () => {
  const { recentes } = useChat();
  const [lista, setLista] = useState<Recente[] | null>(null);
  useEffect(() => { recentes().then(setLista); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista) return <p className="flex-1 text-center text-sm text-gray-500 mt-10">Carregando…</p>;
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {lista.length === 0 && <p className="text-center text-sm text-gray-500 mt-10">Jogue uma partida pra encontrar gente aqui.</p>}
      {lista.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-[#1b1238] border border-purple-500/20 p-2.5">
          <Avatar url={p.avatar} size={40} alt="" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-white truncate">{p.name}</span>
            <span className="block text-xs text-gray-500 truncate">{NOME_JOGO[p.jogo] ?? p.jogo} · {new Date(p.em).toLocaleDateString('pt-BR')}</span>
          </span>
          <BotaoAmizade id={p.id} relacao={p.relacao} compacto
            onMudou={(r) => setLista((l) => l && l.map((x) => (x.id === p.id ? { ...x, relacao: r } : x)))} />
        </div>
      ))}
    </div>
  );
};

/** Conversa privada com um amigo. O menu tem desfazer e bloquear. */
const Conversa: React.FC<{ a: Amigo }> = ({ a: aberta }) => {
  const { conversa, enviarDM, fecharConversa, desfazer, bloquear, amigos } = useChat();
  // da lista viva: o "onde está" muda enquanto a conversa está aberta
  const a = amigos.find((x) => x.id === aberta.id) ?? aberta;
  const { profile } = useApp();
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-purple-500/20">
        <button onClick={fecharConversa} aria-label="Voltar para os amigos" className="w-9 h-9 rounded-full grid place-items-center hover:bg-white/10">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <Avatar url={a.avatar} size={36} alt="" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white truncate">{a.name}</span>
          <span className={`block text-xs truncate ${a.online ? 'text-emerald-300' : 'text-gray-500'}`}>{ondeEsta(a)}</span>
        </span>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-label="Mais opções" className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-300 bg-white/5">Opções</button>
          {menu && (
            <div className="absolute right-0 top-10 z-10 w-48 rounded-2xl bg-[#1f1640] border border-purple-500/30 p-1.5 shadow-xl">
              <button onClick={() => desfazer(a.id)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gray-200 hover:bg-white/5">
                <UserMinus className="w-4 h-4" />Desfazer amizade
              </button>
              <button onClick={() => bloquear(a.id)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-rose-300 hover:bg-white/5">
                <Ban className="w-4 h-4" />Bloquear
              </button>
            </div>
          )}
        </div>
      </div>
      <Mensagens msgs={conversa} eu={profile.id} vazio={`Mande a primeira mensagem pra ${a.name.split(' ')[0]}.`} />
      <Digitar enviar={enviarDM} placeholder={`Mensagem pra ${a.name.split(' ')[0]}`} />
    </>
  );
};

/** Painel do chat: ocupa a tela no celular, vira coluna na lateral no desktop. */
export const ChatPainel: React.FC = () => {
  const { aberto, fechar, aba, setAba, conversaCom, pedidos, naoLidas } = useChat();
  if (!aberto) return null;
  const naoLidasTotal = Object.values(naoLidas).reduce((s, n) => s + n, 0);
  const abas: { id: Aba; nome: string; conta?: number }[] = [
    { id: 'geral', nome: 'Geral' },
    { id: 'amigos', nome: 'Amigos', conta: naoLidasTotal + pedidos.length },
    { id: 'recentes', nome: 'Recentes' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full flex flex-col bg-[#130d2c] border-l border-purple-500/30 animate-fade-in"
      >
        {conversaCom ? <Conversa a={conversaCom} /> : (
          <>
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h3 className="text-lg font-black text-white">Chat</h3>
              <button onClick={fechar} aria-label="Fechar o chat" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-1.5 px-3 pb-3 border-b border-purple-500/20" role="tablist">
              {abas.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={aba === t.id}
                  onClick={() => setAba(t.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all ${
                    aba === t.id ? 'bg-purple-600 text-white' : 'bg-[#1b1238] text-gray-400'}`}
                >
                  {t.nome}{t.conta ? <span className="ml-1.5 px-1.5 rounded-full bg-rose-500 text-white">{t.conta}</span> : null}
                </button>
              ))}
            </div>
            {aba === 'geral' && <AbaGeral />}
            {aba === 'amigos' && <AbaAmigos />}
            {aba === 'recentes' && <AbaRecentes />}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Pedido de amizade que chegou nesta sessão. No lobby vira modal; dentro da
 * partida não aparece (lá só o aviso discreto), e abre quando a partida acaba.
 */
export const PedidoAmizadeModal: React.FC = () => {
  const { pedidoNovo, adiarPedido, responder } = useChat();
  if (!pedidoNovo) return null;
  const p = pedidoNovo;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="pedido-titulo"
        className="w-full max-w-sm bg-[#130d2c] border border-purple-500/30 rounded-3xl p-6 text-center shadow-[0_0_40px_rgba(124,58,237,0.35)]">
        <div className="flex justify-center"><Avatar url={p.avatar} size={80} alt={p.name} /></div>
        <h3 id="pedido-titulo" className="text-xl font-black text-white mt-4">{p.name} quer ser seu amigo</h3>
        <p className="text-sm text-gray-400 mt-1.5">Amigos podem trocar mensagens privadas no chat.</p>
        <div className="flex gap-2 mt-5">
          <button onClick={() => responder(p.id, false)} className="flex-1 py-3 rounded-2xl bg-[#1b1238] border border-purple-500/20 text-gray-300 font-bold text-sm">Recusar</button>
          <button onClick={() => responder(p.id, true)} className="flex-[1.5] py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm">Aceitar</button>
        </div>
        <button onClick={adiarPedido} className="mt-3 text-xs text-gray-500 underline">Decidir depois</button>
      </div>
    </div>
  );
};

/** Avisos curtos no alto da tela: dentro das partidas é o único sinal do chat. */
export const ChatAvisos: React.FC = () => {
  const { avisos } = useChat();
  if (!avisos.length) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-1.5 pointer-events-none w-[min(92vw,420px)]" role="status">
      {avisos.map((a) => (
        <div key={a.id} className="max-w-full px-4 py-2 rounded-2xl bg-[#1b1238]/95 border border-purple-400/40 text-sm font-bold text-white shadow-lg truncate animate-fade-in">
          {a.texto}
        </div>
      ))}
    </div>
  );
};

/**
 * Cartão de um jogador (fim da partida, toque na foto dentro do jogo): quem é
 * e o botão de amizade conforme a relação, que o servidor informa.
 */
const MOTIVOS: [string, string][] = [['ofensa', 'Ofensa'], ['spam', 'Spam'], ['golpe', 'Golpe'], ['outro', 'Outro']];

export const JogadorCard: React.FC<{
  jogador: { id: number; name: string; avatar?: string | null; level?: number } | null;
  onClose: () => void;
  /** Aberto a partir de uma mensagem do geral: a denúncia leva a mensagem junto. */
  mensagemId?: number;
}> = ({ jogador, onClose, mensagemId }) => {
  const { relacaoCom, historico, denunciar, bloquear } = useChat();
  const [rel, setRel] = useState<{ relacao: Relacao } | null>(null);
  const [hist, setHist] = useState<{ partidas: number; vitorias: number } | null>(null);
  const [denunciando, setDenunciando] = useState(false);
  useEffect(() => {
    setRel(null);
    setHist(null);
    setDenunciando(false);
    if (jogador) {
      relacaoCom(jogador.id).then(setRel);
      historico(jogador.id).then(setHist);
    }
  }, [jogador?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!jogador) return null;
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Perfil de ${jogador.name}`} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-[#130d2c] border border-purple-500/30 rounded-3xl p-5 text-center relative">
        <button onClick={onClose} aria-label="Fechar" className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 grid place-items-center text-gray-300">
          <X className="w-4 h-4" />
        </button>
        <div className="flex justify-center"><Avatar url={jogador.avatar} size={72} alt={jogador.name} /></div>
        <h3 className="text-lg font-black text-white mt-3">{jogador.name}</h3>
        {jogador.level != null && <p className="text-xs text-purple-300 font-semibold">Nível {jogador.level}</p>}
        {hist && (
          <p className="text-sm text-gray-300 mt-2">
            {hist.partidas
              ? <>Vocês jogaram <b className="text-white">{hist.partidas} {hist.partidas === 1 ? 'vez' : 'vezes'}</b> · você ganhou <b className="text-white">{hist.vitorias}</b></>
              : 'Vocês ainda não jogaram juntos'}
          </p>
        )}
        <div className="mt-4 flex justify-center min-h-[44px]">
          {!rel ? <span className="text-xs text-gray-500">…</span>
            : <BotaoAmizade id={jogador.id} relacao={rel.relacao} onMudou={(r) => setRel({ relacao: r })} />}
        </div>
        {denunciando ? (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">Por que você quer denunciar?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTIVOS.map(([m, nome]) => (
                <button key={m} onClick={async () => { if (await denunciar(jogador.id, m, mensagemId)) onClose(); }}
                  className="py-2 rounded-xl bg-[#1b1238] border border-rose-500/30 text-rose-200 text-xs font-bold">{nome}</button>
              ))}
            </div>
          </div>
        ) : rel && (
          <div className="mt-4 flex justify-center gap-4 text-xs">
            <button onClick={() => setDenunciando(true)} className="inline-flex items-center gap-1 text-gray-400 hover:text-rose-300">
              <Flag className="w-3.5 h-3.5" />Denunciar
            </button>
            {rel.relacao !== 'bloqueei' && (
              <button onClick={async () => { await bloquear(jogador.id); onClose(); }} className="inline-flex items-center gap-1 text-gray-400 hover:text-rose-300">
                <Ban className="w-3.5 h-3.5" />Bloquear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Fim da partida: quem jogou com você, cada um com o botão de amizade. É o
 * momento mais natural pra adicionar alguém (e o servidor já sabe que jogaram).
 */
export const JogadoresDaPartida: React.FC<{ players: { id: number; name: string; avatar?: string | null }[]; eu: number }> = ({
  players, eu,
}) => {
  const { relacaoCom } = useChat();
  const outros = players.filter((p) => p.id !== eu);
  const [rels, setRels] = useState<Record<number, Relacao>>({});
  useEffect(() => {
    for (const p of outros) relacaoCom(p.id).then((r) => r && setRels((x) => ({ ...x, [p.id]: r.relacao })));
  }, [outros.map((p) => p.id).join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!outros.length) return null;
  return (
    <div className="mt-4 text-left space-y-2">
      <p className="text-[11px] font-bold text-purple-300">Jogaram com você</p>
      {outros.map((p) => (
        <div key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-[#1b1238] border border-purple-500/20 p-2">
          <Avatar url={p.avatar} size={34} alt="" />
          <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{p.name}</span>
          {rels[p.id] && <BotaoAmizade id={p.id} relacao={rels[p.id]} compacto
            onMudou={(r) => setRels((x) => ({ ...x, [p.id]: r }))} />}
        </div>
      ))}
    </div>
  );
};

const reaisDe = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

/**
 * Convite de um amigo pra sala privada dele. Entrar leva direto pra sala (o
 * lobby cuida do resto, inclusive da aposta, que o servidor mostra de novo).
 */
export const ConviteModal: React.FC<{ onEntrar: () => void }> = ({ onEntrar }) => {
  const { conviteAtual: c, recusarConvite, aceitarConvite } = useChat();
  if (!c) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="convite-titulo"
        className="w-full max-w-sm bg-[#130d2c] border border-purple-500/30 rounded-3xl p-6 text-center shadow-[0_0_40px_rgba(124,58,237,0.35)]">
        <div className="flex justify-center"><Avatar url={c.de.avatar} size={76} alt={c.de.name} /></div>
        <h3 id="convite-titulo" className="text-xl font-black text-white mt-4">
          {c.revanche ? `${c.de.name} quer revanche!` : `${c.de.name} te convidou`}
        </h3>
        <p className="text-sm text-gray-300 mt-1.5">
          Uma partida de <b className="text-white">{c.nomeJogo}</b> na sala <b className="text-white">#{c.code}</b>
        </p>
        <p className={`text-sm font-bold mt-2 ${c.stake ? 'text-amber-300' : 'text-gray-400'}`}>
          {c.stake ? `Valendo ${reaisDe(c.stake)} de entrada` : 'Sem valor de entrada'}
        </p>
        <div className="flex gap-2 mt-5">
          <button onClick={recusarConvite} className="flex-1 py-3 rounded-2xl bg-[#1b1238] border border-purple-500/20 text-gray-300 font-bold text-sm">Agora não</button>
          <button onClick={() => { aceitarConvite(); onEntrar(); }}
            className="flex-[1.5] py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm">
            Entrar na sala
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Lista de amigos pra convidar pra sala privada em que estou esperando.
 * Online primeiro. Convite não fica guardado: offline não recebe, e a lista diz.
 * Vai direto pro <body>: aberta de dentro do lobby, ela herdaria a camada do
 * <main> e ficaria atrás da barra de navegação.
 */
export const ConvidarAmigos: React.FC<{ sala: { jogo: string; code: string; stake: number }; onClose: () => void }> = ({
  sala, onClose,
}) => {
  const { amigos, convidar } = useChat();
  const [enviados, setEnviados] = useState<Record<number, 'online' | 'offline'>>({});
  const ordem = [...amigos].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return createPortal(
    <div className="fixed inset-0 z-[62] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Convidar amigos" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[75vh] flex flex-col bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-lg font-black text-white">Convidar amigos</h3>
            <p className="text-xs text-gray-400">Sala #{sala.code}{sala.stake ? ` · valendo ${reaisDe(sala.stake)}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {ordem.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8 px-6">Você ainda não tem amigos. Adicione pelo chat e convide daqui.</p>
          )}
          {ordem.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl p-2.5 bg-[#1b1238] border border-purple-500/15">
              <span className="relative">
                <Avatar url={a.avatar} size={40} alt="" />
                <i className={`absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#1b1238] ${a.online ? 'bg-emerald-400' : 'bg-gray-600'}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white truncate">{a.name}</span>
                <span className={`block text-xs ${a.online ? 'text-emerald-300' : 'text-gray-500'}`}>
                  {enviados[a.id] === 'offline' ? 'estava offline e não recebeu' : a.online ? 'online' : 'offline'}
                </span>
              </span>
              {enviados[a.id] ? (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                  <Check className="w-3.5 h-3.5" />Convidado
                </span>
              ) : (
                <button
                  onClick={async () => {
                    const online = await convidar(a.id, sala);
                    if (online !== null) setEnviados((e) => ({ ...e, [a.id]: online ? 'online' : 'offline' }));
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold active:scale-95"
                >
                  Convidar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Revanche no fim da partida: cria uma sala privada com o mesmo jogo e o mesmo
 * valor e chama quem estava na mesa (o convite sai quando a sala existir).
 */
export const BotaoRevanche: React.FC<{ match: { game: string; room: { stake: number }; players: { id: number }[]; seat: number } }> = ({ match }) => {
  const { revanche } = useChat();
  const { setMatch, setActiveTab } = useApp();
  return (
    <button
      onClick={() => { revanche(match); setActiveTab('inicio'); setMatch(null); }}
      className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
    >
      <RotateCcw className="w-4 h-4" />
      Revanche{match.room.stake ? ` · ${reaisDe(match.room.stake)}` : ''}
    </button>
  );
};
