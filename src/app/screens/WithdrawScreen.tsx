import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Percent,
  Calendar,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Wallet3DIllustration } from '../components/CustomIcons';

// Stylized Pix Rhombus Icon matching screenshot
const PixIconGlyph: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`w-6 h-6 ${className}`}
  >
    <path
      d="M10.2 6.5L16 12.3L21.8 6.5C22.6 5.7 23.9 5.7 24.7 6.5L25.5 7.3C26.3 8.1 26.3 9.4 25.5 10.2L19.7 16L25.5 21.8C26.3 22.6 26.3 23.9 25.5 24.7L24.7 25.5C23.9 26.3 22.6 26.3 21.8 25.5L16 19.7L10.2 25.5C9.4 26.3 8.1 26.3 7.3 25.5L6.5 24.7C5.7 23.9 5.7 22.6 6.5 21.8L12.3 16L6.5 10.2C5.7 9.4 5.7 8.1 6.5 7.3L7.3 6.5C8.1 5.7 9.4 5.7 10.2 6.5Z"
      fill="currentColor"
    />
  </svg>
);

interface WithdrawScreenProps {
  onBack: () => void;
}

export const WithdrawScreen: React.FC<WithdrawScreenProps> = ({ onBack }) => {
  const { walletBalance, withdrawBalance, showNotification } = useApp();
  const [selectedAmount, setSelectedAmount] = useState<number>(100.0);
  const [pixKey, setPixKey] = useState<string>('***.456.789-**');
  const pixBank = 'Banco 260';
  const [pixType, setPixType] = useState<string>('CPF');
  const [isChangingPix, setIsChangingPix] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('123.456.789-00');

  const handleSelectAmount = (val: number) => {
    setSelectedAmount(val);
  };

  const handleSelectAll = () => {
    setSelectedAmount(walletBalance);
  };

  const handleConfirmWithdraw = async () => {
    if (selectedAmount < 20.0) {
      showNotification('❌ O valor mínimo de saque é R$ 20,00');
      return;
    }
    if (selectedAmount > walletBalance) {
      showNotification('❌ Saldo insuficiente para realizar este saque!');
      return;
    }
    if (await withdrawBalance(selectedAmount, pixKey)) setTimeout(onBack, 1200);
  };

  const handleSavePix = (e: React.FormEvent) => {
    e.preventDefault();
    setPixKey(tempKey.length > 8 ? `***.${tempKey.slice(4, 7)}.${tempKey.slice(7, 10)}-**` : tempKey);
    setIsChangingPix(false);
    showNotification('Chave Pix atualizada com sucesso!');
  };

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in select-none">
      {/* Top Header Row with Back Button, Title, Balance and 3D Wallet */}
      <div className="relative flex items-start justify-between pt-1">
        <div className="flex flex-col z-10">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-[#170e35] border border-purple-500/20 text-white flex items-center justify-center hover:bg-[#231548] active:scale-95 transition-all mb-3 shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Title */}
          <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
            Sacar dinheiro
          </h1>

          {/* Available Balance */}
          <p className="text-sm text-gray-300 font-medium mt-1">
            Disponível:{' '}
            <span className="text-[#a855f7] font-bold">
              R$ {walletBalance.toFixed(2).replace('.', ',')}
            </span>
          </p>
        </div>

        {/* 3D Wallet with Stack of Coins on Top Right */}
        <div className="absolute -top-3 -right-2 pointer-events-none">
          <Wallet3DIllustration size={135} />
        </div>
      </div>

      {/* Main Withdraw Amount Box */}
      <div
        className="rounded-3xl p-5 overflow-hidden text-center mt-1"
        style={{
          background: 'linear-gradient(180deg, rgba(24, 15, 48, 0.92) 0%, rgba(15, 10, 32, 0.96) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Label */}
        <span className="text-xs font-semibold text-gray-400 tracking-wide block mb-1">
          Valor do saque
        </span>

        {/* Big Amount Display */}
        <h2 className="text-4xl sm:text-[42px] font-black text-white tracking-tight my-1">
          R$ {selectedAmount.toFixed(2).replace('.', ',')}
        </h2>

        {/* Minimum Info */}
        <span className="text-xs text-gray-400 font-medium block mb-5">
          Mínimo R$ 20,00
        </span>

        {/* 3 Preset Option Buttons */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* R$ 50 */}
          <button
            type="button"
            onClick={() => handleSelectAmount(50.0)}
            className={`py-3.5 rounded-2xl font-extrabold text-sm transition-all ${
              selectedAmount === 50.0
                ? 'bg-[#27154d] border-2 border-purple-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] scale-[1.02]'
                : 'bg-[#181035] border border-purple-500/20 text-white hover:border-purple-400/40 active:scale-95'
            }`}
          >
            R$ 50
          </button>

          {/* R$ 100 */}
          <button
            type="button"
            onClick={() => handleSelectAmount(100.0)}
            className={`py-3.5 rounded-2xl font-extrabold text-sm transition-all ${
              selectedAmount === 100.0
                ? 'bg-[#27154d] border-2 border-purple-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] scale-[1.02]'
                : 'bg-[#181035] border border-purple-500/20 text-white hover:border-purple-400/40 active:scale-95'
            }`}
          >
            R$ 100
          </button>

          {/* Tudo */}
          <button
            type="button"
            onClick={handleSelectAll}
            className={`py-3.5 rounded-2xl font-extrabold text-sm transition-all ${
              selectedAmount === walletBalance
                ? 'bg-[#27154d] border-2 border-purple-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] scale-[1.02]'
                : 'bg-[#181035] border border-purple-500/20 text-white hover:border-purple-400/40 active:scale-95'
            }`}
          >
            Tudo
          </button>
        </div>
      </div>

      {/* Pix Key Destination Card */}
      <div
        className="flex items-center justify-between p-4 rounded-3xl"
        style={{
          background: 'linear-gradient(180deg, rgba(24, 15, 48, 0.92) 0%, rgba(15, 10, 32, 0.96) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div className="flex items-center gap-3.5">
          {/* Pix Icon Squircle */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #9333ea 0%, #581c87 70%, #3b0764 100%)',
              border: '1.5px solid rgba(192, 132, 252, 0.5)',
              boxShadow: '0 0 14px rgba(168, 85, 247, 0.35)',
            }}
          >
            <PixIconGlyph className="text-purple-200" />
          </div>

          <div>
            <h4 className="text-sm font-extrabold text-white leading-tight">
              Chave Pix • {pixType}
            </h4>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {pixKey} • {pixBank.split(' ')[0]} {pixBank.split(' ')[1] || ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsChangingPix(true)}
          className="flex items-center gap-0.5 text-xs font-bold text-[#c084fc] hover:text-purple-200 transition-colors py-1 pl-2"
        >
          <span>Trocar</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Withdraw Terms & Limits Card */}
      <div
        className="rounded-3xl p-4 divide-y divide-purple-500/10"
        style={{
          background: 'linear-gradient(180deg, rgba(22, 14, 44, 0.9) 0%, rgba(14, 9, 30, 0.95) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.18)',
        }}
      >
        {/* Row 1: Prazo de recebimento */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-xs text-gray-300 font-medium">Prazo de recebimento</span>
          </div>
          <span className="text-xs font-bold text-white">Até 30 minutos</span>
        </div>

        {/* Row 2: Taxa */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
              <Percent className="w-4 h-4" />
            </div>
            <span className="text-xs text-gray-300 font-medium">Taxa</span>
          </div>
          <span className="text-xs font-bold text-white">Sem taxa</span>
        </div>

        {/* Row 3: Limite diário restante */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-xs text-gray-300 font-medium">Limite diário restante</span>
          </div>
          <span className="text-xs font-bold text-white">R$ 900,00</span>
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-1 flex flex-col items-center gap-2.5">
        <button
          onClick={handleConfirmWithdraw}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#6d28d9] via-[#7c3aed] to-[#5b21b6] text-white font-extrabold text-[15px] flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(124,58,237,0.45)] border border-purple-400/40 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white stroke-[3]" />
          </div>
          <span>
            Confirmar saque de R$ {selectedAmount.toFixed(2).replace('.', ',')}
          </span>
        </button>

        {/* Verified Account Notice */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
          <Lock className="w-3.5 h-3.5 text-gray-500" />
          <span>Saques são liberados apenas para contas verificadas.</span>
        </div>
      </div>

      {/* Modal to Change Pix Key */}
      {isChangingPix && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#140e2d] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
            <div className="flex justify-between items-center pb-3 border-b border-purple-500/20">
              <h3 className="text-base font-bold text-white">Alterar Chave Pix</h3>
              <button
                onClick={() => setIsChangingPix(false)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSavePix} className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tipo de chave:</label>
                <div className="grid grid-cols-3 gap-2">
                  {['CPF', 'E-mail', 'Celular'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPixType(t)}
                      className={`py-2 text-xs font-bold rounded-xl border ${
                        pixType === t
                          ? 'bg-purple-600 border-purple-300 text-white'
                          : 'bg-[#1b1238] border-purple-500/20 text-gray-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Chave Pix:</label>
                <input
                  type="text"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  className="w-full bg-[#1b1238] border border-purple-500/30 rounded-2xl py-3 px-4 text-white font-medium focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-purple-600 text-white font-bold text-sm shadow-md"
              >
                Salvar Chave Pix
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
