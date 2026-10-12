import React, { useState } from 'react';
import { X, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { walletBalance, withdrawBalance } = useApp();
  const [amount, setAmount] = useState<string>('50');
  const [pixType, setPixType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf');
  const [pixKey, setPixKey] = useState<string>('123.456.789-00');

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    if (await withdrawBalance(numAmount, pixKey)) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Sacar Saldo</h3>
              <p className="text-xs text-gray-400">Transferência Pix instantânea</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleWithdraw} className="mt-5 space-y-4">
          {/* Available balance indicator */}
          <div className="p-3 bg-[#1c123d] rounded-2xl border border-purple-500/20 flex justify-between items-center">
            <span className="text-xs text-gray-400">Saldo disponível:</span>
            <span className="text-base font-extrabold text-white">
              R$ {walletBalance.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
              Valor do saque (R$):
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                max={walletBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full bg-[#181138] border border-purple-500/30 rounded-2xl py-3 pl-12 pr-20 text-white font-bold placeholder-gray-500 focus:outline-none focus:border-purple-400"
                required
              />
              <button
                type="button"
                onClick={() => setAmount(walletBalance.toFixed(2))}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/40"
              >
                MÁX
              </button>
            </div>
          </div>

          {/* Pix Key Type */}
          <div>
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
              Tipo de chave Pix:
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['cpf', 'email', 'phone', 'random'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPixType(type)}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    pixType === type
                      ? 'bg-purple-600 border-purple-300 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                      : 'bg-[#181138] border-purple-500/20 text-gray-400 hover:text-white'
                  }`}
                >
                  {type === 'cpf' && 'CPF'}
                  {type === 'email' && 'E-mail'}
                  {type === 'phone' && 'Celular'}
                  {type === 'random' && 'Aleatória'}
                </button>
              ))}
            </div>
          </div>

          {/* Pix Key Input */}
          <div>
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-1.5">
              Chave Pix de destino:
            </label>
            <input
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="Digite sua chave Pix"
              className="w-full bg-[#181138] border border-purple-500/30 rounded-2xl py-3 px-4 text-white font-medium placeholder-gray-500 focus:outline-none focus:border-purple-400"
              required
            />
          </div>

          <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-200/90">
              O CPF da conta Pix deve ser o mesmo cadastrado no perfil.
            </p>
          </div>

          <button
            type="submit"
            disabled={numAmount <= 0 || numAmount > walletBalance}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-base shadow-[0_4px_20px_rgba(168,85,247,0.4)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar Saque 💸
          </button>
        </form>
      </div>
    </div>
  );
};
