import React from 'react';
import { useApp } from '../context/AppContext';
import chestEpicImg from '../assets/chest-epic.png';

// O servidor conta dias seguidos e paga 50 moedas por check-in — não existe
// escada de prêmio nem cofre. A trilha abaixo é só a semana corrente da
// sequência, pra dar noção de progresso.
const MOEDAS_POR_DIA = 50;

export const StreakSection: React.FC = () => {
  const { streakDays, hasClaimedStreakToday, checkInStreak } = useApp();

  const inicioSemana = Math.floor(Math.max(0, streakDays - (hasClaimedStreakToday ? 1 : 0)) / 7) * 7;
  const daysList = Array.from({ length: 7 }, (_, i) => inicioSemana + i + 1);
  const feitos = Math.min(7, Math.max(0, streakDays - inicioSemana));

  return (
    <div
      onClick={() => { if (!hasClaimedStreakToday) checkInStreak(); }}
      className="relative rounded-3xl p-4 sm:p-5 overflow-hidden transition-all active:scale-[0.99] cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, rgba(38, 26, 64, 0.95) 0%, rgba(20, 14, 38, 0.98) 100%)',
        border: '1.5px solid rgba(245, 158, 11, 0.28)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(251, 191, 36, 0.2)',
      }}
    >
      {/* Background ambient warm/purple light */}
      <div className="absolute -top-10 -left-10 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-36 h-36 bg-purple-600/15 rounded-full blur-2xl pointer-events-none" />

      {/* Top Content Row */}
      <div className="relative flex items-center justify-between gap-2 z-10">
        {/* Left: Flame Icon + Streak Count */}
        <div className="flex items-center gap-3">
          {/* Flame Icon Container */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: 'radial-gradient(circle at 40% 35%, #451a03 0%, #1f1305 70%, #0f0a02 100%)',
              border: '2px solid rgba(245, 158, 11, 0.6)',
              boxShadow: '0 0 18px rgba(245, 158, 11, 0.45), inset 0 0 10px rgba(251, 191, 36, 0.3)',
            }}
          >
            <span className="text-2xl animate-bounce" style={{ animationDuration: '2s' }}>
              🔥
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {streakDays}
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#fbbf24] leading-tight">
                  DIAS
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#fbbf24] leading-tight">
                  SEGUIDOS
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-300 font-medium mt-0.5">
              {hasClaimedStreakToday ? 'Check-in de hoje feito 🔥' : 'Toque pra confirmar o dia de hoje'}
            </p>
          </div>
        </div>

        {/* Right: Next Reward Preview */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="relative shrink-0">
            <img
              src={chestEpicImg}
              alt="Cofre Épico"
              className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)] transform hover:scale-110 transition-transform"
            />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#f59e0b] block leading-none mb-1">
              CADA CHECK-IN
            </span>
            <span className="text-sm font-extrabold text-white block leading-tight">
              +{MOEDAS_POR_DIA} moedas
            </span>
            <span className="text-xs font-semibold text-purple-400 block leading-tight">
              Perdeu um dia, zera
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Timeline Stepper */}
      <div className="relative mt-5 pt-2 z-10">
        {/* Connecting Track Line */}
        <div className="absolute top-[17px] left-3 right-3 h-[3px] bg-[#271f42] rounded-full">
          {/* Active Highlight Line */}
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full shadow-[0_0_8px_#f59e0b]"
            style={{ width: `${(Math.max(0, feitos - 1) / 6) * 100}%` }}
          />
        </div>

        {/* Stepper Dots & Numbers */}
        <div className="relative flex justify-between items-center px-1">
          {daysList.map((day) => {
            const isCompleted = streakDays >= day;
            const isCurrent = streakDays + 1 === day && !hasClaimedStreakToday;

            return (
              <div key={day} className="flex flex-col items-center gap-1.5 z-10">
                {/* Step Circle */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isCompleted
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_10px_rgba(245,158,11,0.6)] border border-amber-200'
                      : isCurrent
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white ring-2 ring-amber-300 ring-offset-2 ring-offset-[#140e26]'
                      : 'bg-[#150f2e] border border-gray-600/60 text-gray-500'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  )}
                </div>

                {/* Day Label */}
                <span
                  className={`text-[11px] font-semibold ${
                    isCompleted ? 'text-white font-bold' : 'text-gray-500'
                  }`}
                >
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
