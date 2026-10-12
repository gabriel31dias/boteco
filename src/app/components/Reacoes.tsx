import React, { useEffect, useState } from 'react';
import { net } from '../../net';
import { MatchInfo } from '../types';
import { Avatar } from './CustomIcons';
import { JogadorCard } from './Chat';
import iconePessoas from '../../assets/sinuca/pessoas.webp';
import iconeChat from '../../assets/sinuca/chat.webp';

/** A mesma lista do servidor (server/index.js REACOES): o resto ele descarta. */
const REACOES = ['👏', '😂', '😱', '🔥', '😎', '🙏'];

type Chegada = { id: number; assento: number; emoji: string };

/**
 * Os dois ícones da lateral da sinuca, em todos os jogos: pessoas (perfil de
 * quem está na mesa: adicionar amigo, denunciar) e balão (reações rápidas; o
 * que chega sobe na lateral com a foto de quem mandou). Nada de texto livre
 * durante a partida. A sinuca, o truco e as damas têm os próprios ícones na arte.
 */
export const Reacoes: React.FC<{ match: MatchInfo }> = ({ match }) => {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState(false);   // mesa com 3+: escolher de quem ver o perfil
  const [perfil, setPerfil] = useState<MatchInfo['players'][number] | null>(null);
  const [chegadas, setChegadas] = useState<Chegada[]>([]);
  const [espera, setEspera] = useState(false);
  // Partida paga (fim ou W.O.): o servidor já não aceita reação, e o botão
  // ficaria por cima do resultado.
  const [acabou, setAcabou] = useState(false);

  useEffect(() => {
    const offReacao = net.on('reacao', (r: { assento: number; emoji: string }) => {
      const id = Date.now() + Math.random();
      setChegadas((c) => [...c.slice(-3), { id, ...r }]);
      setTimeout(() => setChegadas((c) => c.filter((x) => x.id !== id)), 2600);
    });
    const offFim = net.on('settled', () => setAcabou(true));
    return () => { offReacao(); offFim(); };
  }, []);
  if (acabou) return null;

  const outros = match.players.filter((_, s) => s !== match.seat);
  const pessoas = () => {
    setAberto(false);
    if (outros.length === 1) setPerfil(outros[0]);
    else setLista((l) => !l);
  };

  const mandar = (emoji: string) => {
    net.emit('reacao', { emoji });
    setAberto(false);
    // o servidor ignora mais de uma a cada 1,5s: o botão espera junto
    setEspera(true);
    setTimeout(() => setEspera(false), 1500);
  };

  return (
    <>
      <div className="reacoes-chegadas fixed left-3 bottom-44 z-[45] flex flex-col-reverse gap-2 pointer-events-none" aria-live="polite">
        {chegadas.map((c) => {
          const p = match.players[c.assento];
          return (
            <div key={c.id} className="reacao-sobe reacao-balao flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-black/70 border border-white/15">
              <Avatar url={p?.avatar} size={26} alt="" />
              <span className="text-2xl leading-none" role="img" aria-label={`${p?.name ?? 'Alguém'} reagiu`}>{c.emoji}</span>
            </div>
          );
        })}
      </div>

      <div className="reacoes-caixa fixed left-3 bottom-16 z-[45] flex flex-col gap-2">
        {lista && (
          <div className="reacoes-lista absolute bottom-0 left-12 flex flex-col gap-1 p-1.5 rounded-2xl bg-black/85 border border-white/15" role="menu">
            {outros.map((p) => (
              <button key={p.id} role="menuitem" onClick={() => { setLista(false); setPerfil(p); }}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl hover:bg-white/10 active:scale-95 text-left">
                <Avatar url={p.avatar} size={28} alt="" />
                <span className="text-xs font-bold text-white whitespace-nowrap">{p.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
        {aberto && (
          <div className="reacoes-menu absolute bottom-0 left-12 flex gap-1 p-1.5 rounded-2xl bg-black/85 border border-white/15" role="menu">
            {REACOES.map((e) => (
              <button key={e} role="menuitem" onClick={() => mandar(e)} className="w-10 h-10 text-2xl rounded-xl hover:bg-white/10 active:scale-90">
                {e}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={pessoas}
          aria-label={outros.length === 1 ? 'Ver perfil do adversário' : 'Ver quem está na mesa'}
          aria-expanded={outros.length === 1 ? undefined : lista}
          className="reacoes-pessoas w-10 active:scale-95 drop-shadow-[0_3px_6px_rgba(0,0,0,.6)]"
        >
          <img src={iconePessoas} alt="" className="w-full" />
        </button>
        <button
          onClick={() => { setLista(false); setAberto((a) => !a); }}
          disabled={espera}
          aria-label="Mandar uma reação"
          aria-expanded={aberto}
          className="reacoes-botao w-10 disabled:opacity-40 active:scale-95 drop-shadow-[0_3px_6px_rgba(0,0,0,.6)]"
        >
          <img src={iconeChat} alt="" className="w-full" />
        </button>
      </div>
      <JogadorCard jogador={perfil} onClose={() => setPerfil(null)} />
    </>
  );
};
