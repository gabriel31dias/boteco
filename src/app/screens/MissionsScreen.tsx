import React from 'react';
import { Target, Gift, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CrownAvatar, GoldCoinIcon } from '../components/CustomIcons';
import { StreakSection } from '../components/StreakSection';
import { MissionCard } from '../components/MissionCard';
import chestOpenImg from '../assets/chest-open.png';

export const MissionsScreen: React.FC<{ onOpenDeposit: () => void }> = ({ onOpenDeposit }) => {
  const { coins, profile, missions, completedUnclaimedCount, claimableCoins, claimRewards } = useApp();

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        {/* User Info */}
        <div className="flex items-center gap-3">
          <CrownAvatar size={50} />
          <div>
            <h2 className="text-[17px] font-extrabold text-white tracking-tight leading-tight">
              {profile.name}
            </h2>
            <span className="text-xs font-semibold text-purple-400">
              Nível {profile.level}
            </span>
          </div>
        </div>

        {/* Coins Pill */}
        <button
          onClick={onOpenDeposit}
          className="flex items-center gap-2 bg-[#170e35] hover:bg-[#201449] border border-purple-500/25 rounded-full py-1.5 px-3 shadow-[0_2px_12px_rgba(0,0,0,0.5)] transition-all active:scale-95"
        >
          <GoldCoinIcon size={21} />
          <span className="text-[15px] font-extrabold text-white tracking-tight">
            {coins.toLocaleString('pt-BR')}
          </span>
          <Plus className="w-3.5 h-3.5 text-gray-400 stroke-[3]" />
        </button>
      </div>

      {/* Streak Section */}
      <StreakSection />

      {/* Cabeçalho das missões. Sem contador de tempo: o servidor não zera as
          missões todo dia — o progresso é acumulado até resgatar. */}
      <div className="flex items-center mt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.25)]">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white tracking-wide uppercase flex items-center gap-1.5">
              MISSÕES <span className="text-amber-400 text-sm">✨</span>
            </h3>
            <p className="text-[11.5px] text-gray-400 font-medium">
              Complete missões e ganhe moedas!
            </p>
          </div>
        </div>
      </div>

      {/* Missions List */}
      <div className="flex flex-col gap-3">
        {missions.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
      </div>

      {/* Claim Rewards Banner Bottom Card */}
      <div
        className="relative flex items-center justify-between p-4 rounded-3xl overflow-hidden mt-1"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 20, 56, 0.95) 0%, rgba(18, 12, 38, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.22)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Ambient Glow */}
        <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Left: 3D Chest with coins */}
        <div className="relative shrink-0 pr-1">
          <img
            src={chestOpenImg}
            alt="Baú de Recompensas"
            className="w-20 h-20 sm:w-22 sm:h-22 object-contain drop-shadow-[0_4px_16px_rgba(245,158,11,0.5)] transform hover:scale-105 transition-transform"
          />
        </div>

        {/* Center: Text message */}
        <div className="flex-1 min-w-0 pr-2 pl-1 z-10">
          <h4 className="text-[14.5px] font-extrabold text-white tracking-tight leading-snug">
            Resgate suas recompensas!
          </h4>
          <p className="text-xs text-gray-300 font-medium mt-0.5">
            {completedUnclaimedCount
              ? <>Você tem <span className="text-[#4ade80] font-bold">
                  {completedUnclaimedCount} {completedUnclaimedCount === 1 ? 'missão' : 'missões'}
                </span> pra resgatar</>
              : 'Complete uma missão pra resgatar moedas'}
          </p>
        </div>

        {/* Right: Golden Claim CTA Button */}
        <div className="relative z-10 shrink-0">
          <button
            onClick={claimRewards}
            disabled={!completedUnclaimedCount}
            className="flex flex-col items-center justify-center px-4 py-2.5 rounded-2xl bg-gradient-to-b from-[#fbbf24] via-[#f59e0b] to-[#d97706] text-amber-950 font-black tracking-wide shadow-[0_4px_20px_rgba(245,158,11,0.5)] border border-amber-200/60 hover:brightness-110 active:scale-95 transition-all disabled:opacity-45 disabled:active:scale-100"
          >
            <div className="flex items-center gap-1.5 text-xs font-black uppercase">
              <Gift className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>RESGATAR</span>
            </div>
            <div className="flex items-center gap-1 mt-1 bg-amber-950/20 px-2 py-0.5 rounded-full">
              <GoldCoinIcon size={14} />
              <span className="text-xs font-black text-amber-950">{claimableCoins}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
