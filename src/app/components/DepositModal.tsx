import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { CobrancaPix, useApp } from '../context/AppContext';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  const { criarPix, conferirPix, showNotification } = useApp();
  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [step, setStep] = useState<'select' | 'pix'>('select');
  const [copied, setCopied] = useState<boolean>(false);
  const [pix, setPix] = useState<CobrancaPix | null>(null);
  const [gerando, setGerando] = useState(false);

  // Com o código na tela, o servidor pergunta ao provedor se o Pix caiu.
  useEffect(() => {
    if (!isOpen || step !== 'pix' || !pix) return;
    let vivo = true;
    const t = setInterval(async () => {
      if (await conferirPix(pix.externalId) && vivo) { setPix(null); setStep('select'); onClose(); }
    }, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [isOpen, step, pix]);

  if (!isOpen) return null;

  const amounts = [10, 20, 50, 100, 200];
  const finalAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;

  const handleProceedToPix = async () => {
    if (finalAmount < 5) {
      showNotification('O valor mínimo de depósito é R$ 5,00');
      return;
    }
    setGerando(true);
    try {
      setPix(await criarPix(finalAmount));
      setStep('pix');
    } catch (e) {
      showNotification(`❌ ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pix) return;
    try { await navigator.clipboard.writeText(pix.brcode); } catch { /* sem permissão */ }
    setCopied(true);
    showNotification('Código Pix copiado com sucesso!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-[#130d2c] border border-purple-500/30 rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] overflow-y-auto"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Adicionar Saldo</h3>
              <p className="text-xs text-gray-400">Depósito instantâneo via Pix</p>
            </div>
          </div>
          <button
            onClick={() => {
              setStep('select');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'select' ? (
          <div className="mt-5 space-y-5">
            <div>
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-2">
                Selecione o valor:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {amounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(amt);
                      setCustomAmount('');
                    }}
                    className={`py-3 px-2 rounded-2xl font-bold text-sm transition-all border ${
                      selectedAmount === amt && !customAmount
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)] scale-105'
                        : 'bg-[#1a123a] text-gray-300 border-purple-500/20 hover:border-purple-400/40'
                    }`}
                  >
                    R$ {amt},00
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-2">
                Ou digite outro valor:
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                  R$
                </span>
                <input
                  type="number"
                  placeholder="0,00"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(0);
                  }}
                  className="w-full bg-[#181138] border border-purple-500/30 rounded-2xl py-3 pl-12 pr-4 text-white font-bold placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-xs text-gray-300">
                Pagamentos seguros e processamento automático em segundos.
              </p>
            </div>

            <button
              onClick={handleProceedToPix}
              disabled={gerando}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 font-extrabold text-base shadow-[0_4px_20px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {gerando ? 'Gerando cobrança...' : `Gerar Pix de R$ ${finalAmount.toFixed(2).replace('.', ',')}`}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4 text-center">
            <div className="space-y-1">
              <span className="text-xs text-gray-400">Valor a pagar:</span>
              <p className="text-2xl font-black text-[#4ade80]">
                R$ {(pix?.amount ?? finalAmount).toFixed(2).replace('.', ',')}
              </p>
            </div>

            <div className="p-4 bg-[#170f36] rounded-2xl border border-purple-500/20 space-y-3">
              <div className="flex items-center justify-center gap-2 text-purple-300">
                <QrCode className="w-5 h-5" />
                <span className="text-xs font-bold">Pix copia e cola</span>
              </div>
              <p className="text-[10px] font-mono break-all text-gray-400 leading-relaxed max-h-24 overflow-y-auto text-left">
                {pix?.brcode}
              </p>
              <button
                onClick={handleCopyPix}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors"
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar código Pix'}
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Pague no app do seu banco. O saldo entra sozinho assim que o
              pagamento for confirmado.
            </p>

            <div className="pt-1 space-y-2">
              <button
                onClick={() => pix && conferirPix(pix.externalId).then((ok) => {
                  if (ok) { setPix(null); setStep('select'); onClose(); }
                  else showNotification('Ainda não caiu — assim que o banco confirmar, o saldo entra sozinho.');
                })}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white font-extrabold text-base shadow-[0_4px_20px_rgba(34,197,94,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Já paguei, conferir agora
              </button>
              <button
                onClick={() => { setPix(null); setStep('select'); }}
                className="text-xs text-gray-400 hover:text-white py-1"
              >
                Voltar e alterar valor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
