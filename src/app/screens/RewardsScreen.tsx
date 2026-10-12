import React from 'react';
import { Gift, Sparkles, CheckCircle2, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EpicChestIllustration, GoldCoinIcon } from '../components/CustomIcons';

export const RewardsScreen: React.FC = () => {
  const { streakDays, showNotification } = useApp();

  const chests = [
    {
      id: 'c1',
      title: 'Cofre Diário',
      requirement: 'Login diário',
      reward: '50 Moedas',
      unlocked: true,
      claimed: true,
    },
    {
      id: 'c2',
      title: 'Cofre Semanal',
      requirement: '7 dias seguidos',
      reward: '500 Moedas + 1 Ticket',
      unlocked: streakDays >= 7,
      claimed: true,
    },
    {
      id: 'c3',
      title: 'Cofre Épico',
      requirement: '20 dias seguidos',
      reward: '2.500 Moedas + R$ 10',
      unlocked: streakDays >= 20,
      claimed: false,
    },
    {
      id: 'c4',
      title: 'Cofre Lendário',
      requirement: '30 dias seguidos',
      reward: '10.000 Moedas + R$ 50',
      unlocked: streakDays >= 30,
      claimed: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Recompensas</h1>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Temporada 4</span>
        </div>
      </div>

      {/* Featured Banner */}
      <div
        className="relative rounded-3xl p-5 overflow-hidden flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(46, 26, 88, 0.95) 0%, rgba(20, 14, 46, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.3)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="relative z-10">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
            Recompensa Especial
          </span>
          <h3 className="text-xl font-extrabold text-white leading-tight">
            Passe de Temporada
          </h3>
          <p className="text-xs text-gray-300 mt-1 max-w-[190px]">
            Conclua missões para liberar até R$ 500 em prêmios!
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          <EpicChestIllustration size={72} />
        </div>
      </div>

      {/* Chests List */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-white">Cofres e Conquistas</h3>

        {chests.map((chest) => (
          <div
            key={chest.id}
            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
              chest.unlocked
                ? 'bg-[#170e35] border-purple-500/20'
                : 'bg-[#120b29] border-gray-800/60 opacity-70'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
                <Gift className={`w-6 h-6 ${chest.unlocked ? 'text-amber-400' : 'text-gray-500'}`} />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white">{chest.title}</h4>
                <p className="text-xs text-gray-400 font-medium">{chest.requirement}</p>
                <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-amber-300">
                  <GoldCoinIcon size={14} />
                  <span>{chest.reward}</span>
                </div>
              </div>
            </div>

            <div>
              {chest.claimed ? (
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Coletado</span>
                </div>
              ) : chest.unlocked ? (
                <button
                  onClick={() => showNotification(`🎉 Você abriu o ${chest.title}!`)}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 font-bold text-xs shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                >
                  Abrir
                </button>
              ) : (
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-800/40 px-2.5 py-1 rounded-xl border border-gray-700">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Bloqueado</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
