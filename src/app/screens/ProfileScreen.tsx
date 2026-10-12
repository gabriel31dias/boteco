import React from 'react';
import {
  Pencil,
  ShieldCheck,
  ChevronRight,
  Plus,
  ArrowUp,
  Gamepad2,
  Trophy,
  TrendingUp,
  X as CloseIcon,
  Gift,
  Users,
  Settings,
  Headphones,
  LogOut,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar, CoinStackIllustration, AchievementBadge, GoldCoinIcon } from '../components/CustomIcons';

interface ProfileScreenProps {
  onOpenEdit: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenConvert: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  onOpenEdit,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenConvert,
}) => {
  const { profile, walletBalance, points, matchHistory, achievements,
    setActiveTab, showNotification, logoutUser } = useApp();
  const desbloqueadas = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Perfil</h1>
        {profile.isAdmin && (
          <button
            onClick={() => setActiveTab('moderacao')}
            className="ml-auto mr-2 px-3 py-1.5 rounded-full bg-rose-600/20 border border-rose-400/40 text-rose-200 text-xs font-bold"
          >
            Moderação
          </button>
        )}
        <button
          onClick={onOpenEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1b1238] border border-purple-500/30 text-purple-200 text-xs font-bold hover:bg-[#25194d] transition-all active:scale-95 shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        >
          <Pencil className="w-3.5 h-3.5 text-purple-300" />
          <span>Editar</span>
        </button>
      </div>

      {/* User Info Section */}
      <div className="flex items-center gap-3.5">
        <Avatar url={profile.avatarUrl} size={62} alt={profile.name} />
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight leading-tight">
            {profile.name}
          </h2>
          <p className="text-sm text-gray-400 font-medium">{profile.username}</p>
          <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-lg bg-[#271549] border border-purple-500/40 text-purple-300 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Conta verificada</span>
          </div>
        </div>
      </div>

      {/* Level & League Card */}
      <div
        className="rounded-3xl p-4 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(28, 19, 58, 0.95) 0%, rgba(17, 11, 38, 0.98) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.22)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Top Level Row */}
        <div className="flex items-center gap-3 pb-3 border-b border-purple-500/15">
          {/* Level Hexagon Badge */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-800 border border-purple-400/50 flex items-center justify-center font-black text-white text-base shadow-[0_0_12px_rgba(168,85,247,0.4)] shrink-0">
            {profile.level}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-extrabold text-white">Nível {profile.level}</span>
              <span className="text-xs font-semibold text-purple-400">
                {profile.nextLevelXp - profile.currentXp} pts para o nível {profile.level + 1}
              </span>
            </div>

            {/* XP Bar */}
            <div className="h-2 bg-[#120a26] rounded-full overflow-hidden border border-purple-500/20">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full shadow-[0_0_8px_#a855f7]"
                style={{ width: `${(profile.currentXp / profile.nextLevelXp) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom League Row */}
        <div className="flex items-center justify-between pt-3">
          <div className="flex items-center gap-2.5">
            {/* Silver Shield Icon */}
            <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-400/40 flex items-center justify-center shadow-[0_0_10px_rgba(203,213,225,0.2)]">
              <Trophy className="w-4 h-4 text-slate-300" />
            </div>
            <div>
              <span className="text-sm font-extrabold text-white block leading-tight">
                {profile.league} • {profile.leagueRank}º lugar
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                Top 10 sobe de liga
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('ranking')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1a123a] border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-[#251a52] transition-all active:scale-95"
          >
            <span>Ver ranking</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Saldo Disponível Card */}
      <div
        className="relative rounded-3xl p-4 sm:p-5 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(32, 19, 65, 0.95) 0%, rgba(18, 12, 40, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.25)',
          boxShadow: '0 10px 35px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Glow */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-start justify-between z-10">
          <div>
            <span className="text-xs text-gray-300 font-medium block mb-1">
              Saldo disponível
            </span>
            <h3 className="text-3xl font-black text-white tracking-tight">
              R$ {walletBalance.toFixed(2).replace('.', ',')}
            </h3>
          </div>

          {/* 3D Stack of Gold Coins */}
          <div className="relative -mt-2 -mr-2">
            <CoinStackIllustration size={88} />
          </div>
        </div>

        {/* Points Badge */}
        <div className="relative z-10 mt-1 flex items-center gap-2">
          <button
            onClick={onOpenConvert}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#271a4d] border border-amber-500/30 hover:border-amber-400/60 transition-all active:scale-95"
          >
            <GoldCoinIcon size={16} />
            <span className="text-xs font-bold text-amber-300">
              {points.toLocaleString('pt-BR')} pts
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="relative z-10 grid grid-cols-2 gap-2.5 mt-4">
          <button
            onClick={onOpenDeposit}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#231548] hover:bg-[#2e1d5c] border border-amber-500/40 text-[#fcd34d] font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Adicionar saldo</span>
          </button>

          <button
            onClick={onOpenWithdraw}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#201542] hover:bg-[#2b1d55] border border-purple-500/30 text-white font-bold text-xs shadow-[0_0_12px_rgba(168,85,247,0.15)] transition-all active:scale-95"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            <span>Sacar</span>
          </button>
        </div>
      </div>

      {/* 3 Stats Grid (Partidas, Vitórias, Aproveitamento) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Partidas */}
        <div
          className="flex flex-col items-center justify-center p-3 rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(25, 17, 50, 0.9) 0%, rgba(16, 11, 35, 0.95) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.16)',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-1.5 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <span className="text-lg font-black text-white leading-tight">
            {profile.totalGames}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Partidas</span>
        </div>

        {/* Vitórias */}
        <div
          className="flex flex-col items-center justify-center p-3 rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(25, 17, 50, 0.9) 0%, rgba(16, 11, 35, 0.95) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.16)',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-1.5 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
            <Trophy className="w-4 h-4" />
          </div>
          <span className="text-lg font-black text-white leading-tight">
            {profile.wins}
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Vitórias</span>
        </div>

        {/* Aproveitamento */}
        <div
          className="flex flex-col items-center justify-center p-3 rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(25, 17, 50, 0.9) 0%, rgba(16, 11, 35, 0.95) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.16)',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400 mb-1.5 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="text-lg font-black text-white leading-tight">
            {profile.winRate}%
          </span>
          <span className="text-[10px] text-gray-400 font-medium text-center truncate">
            Aproveitamento
          </span>
        </div>
      </div>

      {/* Conquistas Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
            Conquistas <span>🏆</span>
          </h3>
          <button
            onClick={() => showNotification(
              `Você desbloqueou ${desbloqueadas} de ${achievements.length} conquistas!`)}
            className="flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300"
          >
            <span>Ver todas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* A lista vem do servidor: cada uma sabe se já foi desbloqueada. */}
        <div className="grid grid-cols-4 gap-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`flex flex-col items-center text-center ${a.unlocked ? '' : 'opacity-45 grayscale'}`}
            >
              <AchievementBadge type={a.type} size={60} />
              <span className={`text-[10px] font-semibold leading-tight mt-1.5 ${
                a.unlocked ? 'text-gray-300' : 'text-gray-400'
              }`}>
                {a.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Últimas Partidas Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold text-white">Últimas partidas</h3>
          <button
            onClick={() => showNotification('Histórico completo carregado!')}
            className="flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300"
          >
            <span>Ver histórico</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {matchHistory.length === 0 && (
            <p className="text-xs text-gray-400 font-medium p-3 rounded-2xl bg-[#170e35] border border-purple-500/15">
              Nenhuma partida ainda. Entre numa sala pra começar.
            </p>
          )}
          {matchHistory.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-[#170e35] border border-purple-500/15 hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    m.isWin
                      ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                      : 'bg-red-500/15 border border-red-500/30 text-red-400'
                  }`}
                >
                  {m.isWin ? <Trophy className="w-4 h-4" /> : <CloseIcon className="w-4 h-4 stroke-[3]" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    {m.isWin ? 'Vitória contra' : 'Derrota para'} {m.opponent}
                  </h4>
                  <p className="text-[11px] text-gray-400 font-medium">
                    <span className={`font-semibold ${m.isWin ? 'text-green-400' : 'text-red-400'}`}>
                      {m.pts > 0 ? `+${m.pts}` : m.pts} pts
                    </span>
                    {m.prizeMoney ? ` • R$ ${m.prizeMoney.toFixed(2).replace('.', ',')}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs font-medium text-gray-400">
                <span>{m.date}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu Options List */}
      <div className="flex flex-col rounded-2xl bg-[#170e35] border border-purple-500/15 divide-y divide-purple-500/10 overflow-hidden">
        {/* Meus prêmios */}
        <button
          onClick={() => showNotification('Seus prêmios e conquistas da temporada!')}
          className="flex items-center justify-between p-3.5 hover:bg-purple-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Gift className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-white">Meus prêmios</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>

        {/* Convidar amigos */}
        <button
          onClick={() => showNotification('Link de convite copiado! Compartilhe com amigos.')}
          className="flex items-center justify-between p-3.5 hover:bg-purple-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-white">Convidar amigos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10.5px] font-bold border border-purple-500/30">
              Ganhe 200 pts
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </button>

        {/* Configurações */}
        <button
          onClick={() => showNotification('Configurações do aplicativo')}
          className="flex items-center justify-between p-3.5 hover:bg-purple-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-white">Configurações</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>

        {/* Ajuda e suporte */}
        <button
          onClick={() => showNotification('Suporte 24/7 ativo via chat.')}
          className="flex items-center justify-between p-3.5 hover:bg-purple-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Headphones className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-white">Ajuda e suporte</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>

        {/* Sair da Conta */}
        <button
          onClick={logoutUser}
          className="flex items-center justify-between p-3.5 hover:bg-red-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-red-300">Sair da conta</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
};
