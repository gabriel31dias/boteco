import React, { useState } from 'react';
import { X, Sparkles, ArrowRightLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GoldCoinIcon } from './CustomIcons';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConvertModal: React.FC<ConvertModalProps> = ({ isOpen, onClose }) => {
  const { points, convertPoints } = useApp();
  const [pointsToConvert, setPointsToConvert] = useState<number>(Math.min(points, 5000));

  if (!isOpen) return null;

  const moneyEquivalent = (pointsToConvert * 5) / 1000;

  const handleConvert = () => {
    if (pointsToConvert <= 0) return;
    convertPoints(pointsToConvert);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Converter Pontos</h3>
              <p className="text-xs text-gray-400">1.000 pontos = R$ 5,00</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Conversion Visual Preview */}
          <div className="p-4 bg-[#1b123d] rounded-2xl border border-purple-500/20 flex items-center justify-between">
            <div className="text-center flex-1">
              <span className="text-xs text-gray-400 block mb-1">Pontos</span>
              <div className="flex items-center justify-center gap-1">
                <GoldCoinIcon size={20} />
                <span className="text-lg font-black text-amber-400">
                  {pointsToConvert.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300">
              <ArrowRightLeft className="w-4 h-4" />
            </div>

            <div className="text-center flex-1">
              <span className="text-xs text-gray-400 block mb-1">Saldo em R$</span>
              <span className="text-lg font-black text-[#4ade80]">
                R$ {moneyEquivalent.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>0 pts</span>
              <span>Disponível: {points.toLocaleString('pt-BR')} pts</span>
            </div>
            <input
              type="range"
              min="0"
              max={points}
              step="500"
              value={pointsToConvert}
              onChange={(e) => setPointsToConvert(Number(e.target.value))}
              className="w-full h-2 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {[1000, 2000, 5000, points].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setPointsToConvert(Math.min(points, val))}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  pointsToConvert === val
                    ? 'bg-purple-600 border-purple-300 text-white'
                    : 'bg-[#181138] border-purple-500/20 text-gray-400 hover:text-white'
                }`}
              >
                {val === points ? 'TUDO' : `${val.toLocaleString('pt-BR')}`}
              </button>
            ))}
          </div>

          <button
            onClick={handleConvert}
            disabled={pointsToConvert < 1000 || pointsToConvert > points}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-base shadow-[0_4px_20px_rgba(168,85,247,0.4)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Converter para Saldo Real ✨
          </button>
        </div>
      </div>
    </div>
  );
};
