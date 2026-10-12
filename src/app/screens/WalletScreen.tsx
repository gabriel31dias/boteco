import React from 'react';
import {
  HelpCircle,
  Plus,
  ArrowUp,
  Gift,
  Trophy,
  ArrowLeftRight,
  ArrowDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Wallet3DIllustration, GoldCoinIcon } from '../components/CustomIcons';

interface WalletScreenProps {
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenConvert: () => void;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({
  onOpenDeposit,
  onOpenWithdraw,
  onOpenConvert,
}) => {
  const {
    walletBalance,
    bonusBalance,
    inDisputeBalance,
    points,
    transactions,
    showNotification,
  } = useApp();

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Carteira</h1>
        <button
          onClick={() => showNotification('Dúvidas sobre pagamentos e saques? Fale com suporte.')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1b1238] border border-purple-500/30 text-purple-200 text-xs font-bold hover:bg-[#25194d] transition-all active:scale-95 shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
        >
          <HelpCircle className="w-3.5 h-3.5 text-purple-300" />
          <span>Ajuda</span>
        </button>
      </div>

      {/* Main Available Balance Card */}
      <div
        className="relative rounded-3xl p-5 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(32, 19, 65, 0.95) 0%, rgba(18, 12, 40, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.25)',
          boxShadow: '0 10px 35px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header inside Card */}
        <div className="relative flex items-start justify-between z-10">
          <div>
            <span className="text-xs text-gray-300 font-medium block mb-1">
              Disponível para saque
            </span>
            <h3 className="text-3xl font-black text-white tracking-tight">
              R$ {walletBalance.toFixed(2).replace('.', ',')}
            </h3>
          </div>

          {/* 3D Purple Wallet Illustration */}
          <div className="relative -mt-2 -mr-3">
            <Wallet3DIllustration size={96} />
          </div>
        </div>

        {/* 2 Mini Balance Cards: Bônus & Em disputa */}
        <div className="relative z-10 grid grid-cols-2 gap-2.5 mt-3">
          {/* Bônus */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#231548] border border-purple-500/25">
            <div>
              <span className="text-[11px] text-gray-400 font-medium block">Bônus</span>
              <span className="text-sm font-extrabold text-white">
                R$ {bonusBalance.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-purple-600/25 border border-purple-400/30 flex items-center justify-center text-purple-300">
              <Gift className="w-4 h-4" />
            </div>
          </div>

          {/* Em disputa */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#231548] border border-purple-500/25">
            <div>
              <span className="text-[11px] text-gray-400 font-medium block">Em disputa</span>
              <span className="text-sm font-extrabold text-white">
                R$ {inDisputeBalance.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-600/25 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Main CTA Buttons */}
        <div className="relative z-10 grid grid-cols-2 gap-2.5 mt-3.5">
          <button
            onClick={onOpenDeposit}
            className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-[#24164b] hover:bg-[#2f1c62] border border-purple-400/40 text-purple-100 font-bold text-xs shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Adicionar saldo</span>
          </button>

          <button
            onClick={onOpenWithdraw}
            className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-[#201340] hover:bg-[#2a1a54] border border-purple-500/30 text-white font-bold text-xs shadow-[0_0_12px_rgba(168,85,247,0.15)] transition-all active:scale-95"
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            <span>Sacar</span>
          </button>
        </div>
      </div>

      {/* Points Converter Card */}
      <div
        className="flex items-center justify-between p-4 rounded-3xl"
        style={{
          background: 'linear-gradient(180deg, rgba(25, 17, 50, 0.95) 0%, rgba(16, 11, 35, 0.98) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Gold Star Badge */}
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.25)] shrink-0">
            <GoldCoinIcon size={24} />
          </div>

          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-extrabold text-white">
                {points.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs text-gray-400 font-medium">pontos</span>
            </div>
            <p className="text-[11.5px] text-gray-400 font-medium">
              1.000 pontos = R$ 5,00
            </p>
          </div>
        </div>

        <button
          onClick={onOpenConvert}
          className="px-4 py-2 rounded-2xl bg-[#24174c] hover:bg-[#301f66] border border-purple-400/40 text-purple-200 text-xs font-extrabold tracking-wide shadow-[0_0_10px_rgba(168,85,247,0.2)] transition-all active:scale-95"
        >
          Converter
        </button>
      </div>

      {/* Movimentações Recentes (Transactions History) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold text-white">Movimentações recentes</h3>
          <button
            onClick={() => showNotification('Extrato completo exportado!')}
            className="flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300"
          >
            <span>Ver extrato</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Transactions List */}
        <div className="flex flex-col gap-2">
          {transactions.map((tx) => {
            const isPositive = tx.amount > 0;

            const renderIcon = () => {
              if (tx.icon === 'pix') {
                return (
                  <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>
                );
              }
              if (tx.icon === 'trophy') {
                return (
                  <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <Trophy className="w-4 h-4 text-purple-400" />
                  </div>
                );
              }
              if (tx.icon === 'arrow_down') {
                return (
                  <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                );
              }
              // saque_pix
              return (
                <div className="w-9 h-9 rounded-full bg-purple-950/70 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
              );
            };

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#170e35] border border-purple-500/15 hover:border-purple-500/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  {renderIcon()}
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {tx.title}
                    </h4>
                    <p className="text-[11px] text-gray-400 font-medium">
                      {tx.date}
                    </p>
                  </div>
                </div>

                <div
                  className={`text-sm font-extrabold ${
                    isPositive ? 'text-[#4ade80]' : 'text-[#f87171]'
                  }`}
                >
                  {isPositive ? '+ ' : '- '}R${' '}
                  {Math.abs(tx.amount).toFixed(2).replace('.', ',')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
