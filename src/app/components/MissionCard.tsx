import React from 'react';
import { Gamepad2, Users, Crosshair, LogIn, Check } from 'lucide-react';
import { Mission } from '../types';
import { GoldCoinIcon } from './CustomIcons';

interface MissionCardProps {
  mission: Mission;
}

export const MissionCard: React.FC<MissionCardProps> = ({ mission }) => {
  const getIcon = () => {
    switch (mission.type) {
      case 'game':
        return <Gamepad2 className="w-6 h-6 text-purple-300" />;
      case 'friends':
        return <Users className="w-6 h-6 text-blue-300" />;
      case 'eliminations':
        return <Crosshair className="w-6 h-6 text-green-400" />;
      case 'login':
        return <LogIn className="w-6 h-6 text-amber-400" />;
    }
  };

  const getThemeStyles = () => {
    switch (mission.color) {
      case 'purple':
        return {
          iconBg: 'bg-purple-900/30 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]',
          barFill: 'bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-[0_0_8px_#a855f7]',
          textColor: 'text-purple-400',
        };
      case 'blue':
        return {
          iconBg: 'bg-blue-900/30 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.25)]',
          barFill: 'bg-gradient-to-r from-blue-500 to-sky-400 shadow-[0_0_8px_#3b82f6]',
          textColor: 'text-blue-400',
        };
      case 'green':
        return {
          iconBg: 'bg-green-900/30 border-green-500/40 shadow-[0_0_12px_rgba(34,197,94,0.25)]',
          barFill: 'bg-gradient-to-r from-green-500 to-emerald-400 shadow-[0_0_8px_#22c55e]',
          textColor: 'text-green-400',
        };
      case 'orange':
        return {
          iconBg: 'bg-amber-900/30 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
          barFill: 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_#f59e0b]',
          textColor: 'text-amber-400',
        };
    }
  };

  const theme = getThemeStyles();
  const percentage = Math.min(100, (mission.current / mission.total) * 100);

  return (
    <div
      className="relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(180deg, rgba(24, 17, 50, 0.92) 0%, rgba(15, 10, 34, 0.96) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.16)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Left Icon Container */}
      <div
        className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border shrink-0 mr-3.5 ${theme.iconBg}`}
      >
        {getIcon()}
      </div>

      {/* Center Details */}
      <div className="flex-1 min-w-0 pr-2">
        <h4 className="text-[15px] font-bold text-white tracking-tight truncate leading-snug">
          {mission.title}
        </h4>
        <p className="text-xs text-gray-400 font-medium truncate mb-2">
          {mission.subtitle}
        </p>

        {/* Progress Bar & Counter */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-2 bg-[#120a26] rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${theme.barFill}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className={`text-xs font-bold shrink-0 ${theme.textColor}`}>
            {mission.current} / {mission.total}
          </span>
        </div>
      </div>

      {/* Right Side: Reward Coins + Action Button */}
      <div className="flex flex-col items-end justify-between self-stretch shrink-0 min-w-[84px] pl-1">
        {/* Coin Amount */}
        <div className="flex items-center gap-1.5 mb-2">
          <GoldCoinIcon size={19} />
          <span className="text-sm font-extrabold text-white">
            {mission.rewardCoins}
          </span>
        </div>

        {/* Action Button */}
        {mission.completed ? (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/50 text-[#4ade80] text-[11px] font-bold shadow-[0_0_10px_rgba(34,197,94,0.2)]">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>CONCLUÍDA</span>
          </div>
        ) : (
          <span className={`text-[11px] font-bold ${theme.textColor}`}>
            {mission.total - mission.current} restantes
          </span>
        )}
      </div>
    </div>
  );
};
