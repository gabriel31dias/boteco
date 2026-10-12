import React, { useEffect, useState } from 'react';
import { Flame, ChevronUp } from 'lucide-react';
import { GoldCoinIcon } from '../components/CustomIcons';
import { useApp } from '../context/AppContext';
import { RankingRow } from '../types';
import { api } from '../../api.js';

const MEDALHA = ['👑 1º', '2º', '3º'];

export const RankingScreen: React.FC = () => {
  const { profile } = useApp();
  const [lista, setLista] = useState<RankingRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Busca ao abrir a aba: o ranking muda a cada partida de qualquer jogador,
  // não faz sentido guardar no estado global do app.
  useEffect(() => {
    let vivo = true;
    api.ranking()
      .then((r: { ranking: RankingRow[] }) => vivo && setLista(r.ranking))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, []);

  const podio = (lista ?? []).slice(0, 3);
  const ordemPodio = [1, 0, 2];   // 2º no meio à esquerda, 1º no centro, 3º à direita

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Ranking</h1>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
          <Flame className="w-3.5 h-3.5" />
          <span>{profile.league}</span>
        </div>
      </div>

      {erro && (
        <p className="text-xs text-red-300 p-3 rounded-2xl bg-red-500/10 border border-red-500/25">
          Não deu pra carregar o ranking: {erro}
        </p>
      )}

      {!lista && !erro && (
        <p className="text-xs text-gray-400 p-3 rounded-2xl bg-[#170e35] border border-purple-500/15">
          Carregando…
        </p>
      )}

      {lista && lista.length === 0 && (
        <p className="text-xs text-gray-400 p-3 rounded-2xl bg-[#170e35] border border-purple-500/15">
          Ninguém pontuou ainda. Vença uma partida e o primeiro lugar é seu.
        </p>
      )}

      {/* Pódio */}
      {podio.length === 3 && (
        <div className="grid grid-cols-3 gap-2 items-end pt-4 pb-2">
          {ordemPodio.map((i) => {
            const p = podio[i];
            const primeiro = i === 0;
            return (
              <div
                key={p.id}
                className={
                  primeiro
                    ? 'flex flex-col items-center p-4 rounded-2xl bg-gradient-to-b from-[#2e1858] to-[#1a0e38] border-2 border-amber-400/60 text-center shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                    : `flex flex-col items-center p-3 rounded-2xl bg-[#181035] border text-center ${
                        i === 1 ? 'border-slate-400/30' : 'border-amber-700/40'
                      }`
                }
              >
                <div
                  className={
                    primeiro
                      ? 'w-10 h-10 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 font-black text-sm flex items-center justify-center -mt-8 mb-1 shadow-lg border border-amber-200'
                      : `w-8 h-8 rounded-full font-black text-xs flex items-center justify-center -mt-6 mb-1 shadow-md ${
                          i === 1 ? 'bg-slate-300 text-slate-900' : 'bg-amber-700 text-amber-100'
                        }`
                  }
                >
                  {MEDALHA[i]}
                </div>
                <span className={`font-bold text-white truncate max-w-full ${primeiro ? 'text-sm font-extrabold' : 'text-xs'}`}>
                  {p.name}
                </span>
                <span className={`font-black text-amber-300 ${primeiro ? 'text-xs' : 'text-[11px]'}`}>
                  {p.points.toLocaleString('pt-BR')} pts
                </span>
                <span className={`text-[#4ade80] font-bold mt-1 ${primeiro ? 'text-xs font-black' : 'text-[10px]'}`}>
                  {p.wins} {p.wins === 1 ? 'vitória' : 'vitórias'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista completa */}
      {!!lista?.length && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400 font-semibold px-2">
            <span>Posição & Jogador</span>
            <span>Vitórias</span>
          </div>

          {lista.map((p) => {
            const euMesmo = p.id === profile.id;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  euMesmo
                    ? 'bg-purple-900/30 border-purple-400/60 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                    : 'bg-[#170e35] border-purple-500/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-5 font-extrabold text-sm ${p.rank <= 3 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {p.rank}º
                  </span>
                  <div>
                    <h4 className={`text-xs font-bold ${euMesmo ? 'text-purple-200' : 'text-white'}`}>
                      {p.name}{euMesmo ? ' (Você)' : ''}
                    </h4>
                    <div className="flex items-center gap-1 text-[11px] text-gray-400">
                      <GoldCoinIcon size={12} />
                      <span>{p.points.toLocaleString('pt-BR')} pts</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-[#4ade80] block">{p.wins}</span>
                  <span className="text-[10px] text-purple-400 font-medium flex items-center justify-end gap-0.5">
                    {p.rank <= 3 && <ChevronUp className="w-3 h-3 text-emerald-400" />}
                    {p.league}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
