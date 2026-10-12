import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ArrowRight,
  CreditCard,
  Plus,
  CheckCircle2,
  Copy,
  QrCode,
  ShieldCheck,
  Delete,
} from 'lucide-react';
import { CobrancaPix, useApp } from '../context/AppContext';
import { Wallet3DIllustration } from '../components/CustomIcons';

// Stylized Pix Icon Glyph
const PixLogoIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
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

// 3D Gift Box with Ribbon
const GiftBox3DIcon: React.FC<{ size?: number }> = ({ size = 42 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="shrink-0"
  >
    <defs>
      <linearGradient id="giftBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9333ea" />
        <stop offset="50%" stopColor="#7e22ce" />
        <stop offset="100%" stopColor="#581c87" />
      </linearGradient>
      <linearGradient id="giftGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <rect x="8" y="18" width="32" height="24" rx="4" fill="url(#giftBody)" stroke="#c084fc" strokeWidth="1" />
    <rect x="6" y="12" width="36" height="8" rx="2" fill="#a855f7" stroke="#e9d5ff" strokeWidth="1" />
    <rect x="21" y="12" width="6" height="30" fill="url(#giftGold)" />
    {/* Ribbon Bow */}
    <path
      d="M24 12C20 6 12 7 14 12C16 16 23 13 24 12Z"
      fill="url(#giftGold)"
      stroke="#fef08a"
      strokeWidth="0.8"
    />
    <path
      d="M24 12C28 6 36 7 34 12C32 16 25 13 24 12Z"
      fill="url(#giftGold)"
      stroke="#fef08a"
      strokeWidth="0.8"
    />
    <circle cx="24" cy="12" r="2.5" fill="#fef08a" />
  </svg>
);

interface AddBalanceScreenProps {
  onBack: () => void;
}

export const AddBalanceScreen: React.FC<AddBalanceScreenProps> = ({ onBack }) => {
  const { criarPix, conferirPix, showNotification } = useApp();

  // Current Step: 1 (valor), 2 (pagamento), 3 (pix/cartão confirmação)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(50);
  const [amountString, setAmountString] = useState<string>('50,00');
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card_4471' | 'new_card'>('pix');
  const [copied, setCopied] = useState(false);
  const [pix, setPix] = useState<CobrancaPix | null>(null);
  const [gerando, setGerando] = useState(false);

  // New card inputs
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('Camila Andrade');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Amount calculation
  const numericAmount =
    selectedPreset === 'custom'
      ? parseFloat(amountString.replace('.', '').replace(',', '.')) || 0
      : Number(selectedPreset);


  // Handle Preset Clicks
  const handleSelectPreset = (val: number) => {
    setSelectedPreset(val);
    setAmountString(val.toFixed(2).replace('.', ','));
  };

  const handleSelectCustom = () => {
    setSelectedPreset('custom');
    if (amountString === '50,00') {
      setAmountString('0,00');
    }
  };

  // Keypad click handler for "Outro"
  const handleKeypadPress = (key: string) => {
    setSelectedPreset('custom');

    let currentDigits = amountString.replace(/\D/g, ''); // get digits only

    if (key === 'backspace') {
      currentDigits = currentDigits.slice(0, -1);
    } else if (/^\d$/.test(key)) {
      if (currentDigits.length < 7) {
        currentDigits += key;
      }
    }

    const cents = parseInt(currentDigits || '0', 10);
    const formatted = (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setAmountString(formatted);
  };

  // Proceed from Step 1 to Step 2
  const handleGoToStep2 = () => {
    if (numericAmount < 10.0) {
      showNotification('❌ O valor mínimo de recarga é R$ 10,00');
      return;
    }
    if (numericAmount > 2000.0) {
      showNotification('❌ O valor máximo de recarga é R$ 2.000,00');
      return;
    }
    setCurrentStep(2);
  };

  // Step 2 -> 3: a cobrança nasce no servidor, que é quem fala com o banco.
  const handleProceedPayment = async () => {
    if (selectedMethod !== 'pix') {
      showNotification('💳 Cartão em breve — por enquanto, use o Pix.');
      return;
    }
    setGerando(true);
    try {
      setPix(await criarPix(numericAmount));
      setCurrentStep(3);
    } catch (e) {
      showNotification(`❌ ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  const handleCopiarPix = async () => {
    if (!pix) return;
    try { await navigator.clipboard.writeText(pix.brcode); } catch { /* sem permissão */ }
    setCopied(true);
    showNotification('Código Pix copiado!');
    setTimeout(() => setCopied(false), 2500);
  };

  // Enquanto o QR está na tela, o servidor pergunta ao provedor se caiu.
  useEffect(() => {
    if (currentStep !== 3 || !pix) return;
    let vivo = true;
    const bate = async () => {
      if (await conferirPix(pix.externalId) && vivo) onBack();
    };
    const t = setInterval(bate, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [currentStep, pix]);

  return (
    <div className="min-h-full flex flex-col justify-between p-4 sm:p-5 pb-28 max-w-md mx-auto select-none bg-[#070414] text-white">
      {/* Top Header & Step Stepper */}
      <div className="space-y-3.5">
        {/* Top Header Row with Back Button and Title */}
        <div className="flex items-center gap-3.5 pt-1">
          <button
            onClick={() => {
              if (currentStep === 3) setCurrentStep(2);
              else if (currentStep === 2) setCurrentStep(1);
              else onBack();
            }}
            className="w-10 h-10 rounded-2xl bg-[#140c2c] border border-purple-500/30 text-white flex items-center justify-center hover:bg-[#201445] active:scale-95 transition-all shadow-[0_0_12px_rgba(168,85,247,0.2)]"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <h1 className="text-xl font-bold tracking-tight text-white">
            {currentStep === 1 && 'Adicionar saldo'}
            {currentStep === 2 && 'Forma de pagamento'}
            {currentStep === 3 && (selectedMethod === 'pix' ? 'Pagar com Pix' : 'Novo Cartão')}
          </h1>
        </div>

        {/* 3-Step Stepper Progress Header matching screenshot */}
        <div className="relative flex items-center justify-between px-1 pt-1">
          {/* Connecting Line behind steps */}
          <div className="absolute top-1/2 left-4 right-4 h-[1.5px] bg-[#1e143c] -translate-y-1/2 -z-0" />

          {/* Step 1: Valor */}
          <div className="relative z-10 flex items-center gap-1.5 bg-[#070414] pr-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                currentStep >= 1
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_#a855f7] border border-purple-300'
                  : 'bg-[#181135] text-gray-500 border border-purple-500/20'
              }`}
            >
              1
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 1 ? 'text-white font-bold' : 'text-gray-400'
              }`}
            >
              Valor
            </span>
          </div>

          {/* Step 2: Pagamento */}
          <div className="relative z-10 flex items-center gap-1.5 bg-[#070414] px-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                currentStep >= 2
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_#a855f7] border border-purple-300'
                  : 'bg-[#181135] text-gray-500 border border-purple-500/20'
              }`}
            >
              2
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 2 ? 'text-white font-bold' : 'text-gray-400'
              }`}
            >
              Pagamento
            </span>
          </div>

          {/* Step 3: Confirmação */}
          <div className="relative z-10 flex items-center gap-1.5 bg-[#070414] pl-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                currentStep >= 3
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_#a855f7] border border-purple-300'
                  : 'bg-[#181135] text-gray-500 border border-purple-500/20'
              }`}
            >
              3
            </div>
            <span
              className={`text-xs font-semibold ${
                currentStep === 3 ? 'text-white font-bold' : 'text-gray-400'
              }`}
            >
              Confirmação
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: VALOR (100% Identical to uploaded_media_1787789936233.png)         */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div className="space-y-3.5 pt-1">
            {/* Main Dark Glowing Card */}
            <div
              className="relative rounded-3xl p-4 sm:p-5 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(28, 17, 56, 0.95) 0%, rgba(16, 10, 36, 0.98) 100%)',
                border: '1.5px solid rgba(168, 85, 247, 0.25)',
                boxShadow: '0 10px 35px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              {/* Top Section: Amount Text on Left & 3D Wallet on Right */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-1">
                  <span className="text-xs font-medium text-gray-300 block mb-1">
                    Quanto você quer adicionar?
                  </span>

                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight my-1">
                    R$ {selectedPreset === 'custom' ? amountString : Number(selectedPreset).toFixed(2).replace('.', ',')}
                  </h2>

                  <p className="text-[11px] text-gray-400 font-medium">
                    Mínimo R$ 10,00 <span className="text-purple-400">•</span> Máximo R$ 2.000,00
                  </p>
                </div>

                {/* 3D Purple Wallet with Gold Coins on Top Right */}
                <div className="relative -mt-3 -mr-2 shrink-0">
                  <Wallet3DIllustration size={110} />
                </div>
              </div>

              {/* Middle Section: 6 Preset Buttons Grid (2 rows x 3 columns) */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[20, 50, 100, 200, 500].map((val) => {
                  const isSelected = selectedPreset === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleSelectPreset(val)}
                      className={`py-3 rounded-2xl font-extrabold text-sm transition-all duration-150 active:scale-95 ${
                        isSelected
                          ? 'bg-[#27154d] border-2 border-purple-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] scale-[1.02]'
                          : 'bg-[#181035] border border-purple-500/20 text-white hover:border-purple-400/40'
                      }`}
                    >
                      R$ {val}
                    </button>
                  );
                })}

                {/* "Outro" Custom Amount Button */}
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className={`py-3 rounded-2xl font-extrabold text-sm transition-all duration-150 active:scale-95 ${
                    selectedPreset === 'custom'
                      ? 'bg-[#27154d] border-2 border-purple-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] scale-[1.02]'
                      : 'bg-[#181035] border border-purple-500/20 text-white hover:border-purple-400/40'
                  }`}
                >
                  Outro
                </button>
              </div>
            </div>

            {/* Dark Sleek Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 select-none pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'backspace'].map(
                (key) => {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleKeypadPress(key)}
                      className="h-13 sm:h-14 rounded-2xl bg-[#150d30] hover:bg-[#201445] active:bg-[#2c1d60] border border-purple-500/15 text-white font-bold text-xl transition-all duration-100 active:scale-95 flex items-center justify-center shadow-sm"
                    >
                      {key === 'backspace' ? (
                        <Delete className="w-5 h-5 text-gray-300" />
                      ) : (
                        key
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: FORMA DE PAGAMENTO (Dark Theme Matching)                          */}
        {/* ========================================================================= */}
        {currentStep === 2 && (
          <div className="space-y-5 pt-2">
            {/* Section 1: Recomendado */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold tracking-wide uppercase text-gray-400">
                Recomendado
              </span>

              {/* Pix Card */}
              <div
                onClick={() => setSelectedMethod('pix')}
                className="relative flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all duration-200 bg-[#170e35] border border-purple-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-purple-400/50"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-purple-600/20 border border-purple-400/40 text-purple-300">
                    <PixLogoIcon className="text-purple-300" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold leading-tight text-white">
                      Pix
                    </h3>
                    <p className="text-xs font-medium mt-0.5 text-gray-400">
                      Cai na hora · sem taxa
                    </p>
                  </div>
                </div>

                {/* Selected Radio Circle Indicator */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    selectedMethod === 'pix'
                      ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                      : 'border-2 border-gray-600'
                  }`}
                >
                  {selectedMethod === 'pix' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Outras formas */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold tracking-wide uppercase text-gray-400">
                Outras formas
              </span>

              {/* Saved Card */}
              <div
                onClick={() => setSelectedMethod('card_4471')}
                className="relative flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all duration-200 bg-[#150d30] border border-purple-500/15 hover:border-purple-500/30"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-purple-950/70 border border-purple-500/25 text-purple-400">
                    <CreditCard className="w-5 h-5" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold leading-tight text-white">
                      Cartão de crédito •••• 4471
                    </h3>
                    <p className="text-xs font-medium mt-0.5 text-gray-400">
                      Camila Andrade · 08/29
                    </p>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    selectedMethod === 'card_4471'
                      ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                      : 'border-2 border-gray-600'
                  }`}
                >
                  {selectedMethod === 'card_4471' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              {/* Add New Card Option */}
              <div
                onClick={() => setSelectedMethod('new_card')}
                className={`relative flex items-center justify-between p-4 rounded-3xl cursor-pointer transition-all duration-200 ${
                  selectedMethod === 'new_card'
                    ? 'bg-[#1e1445] border border-purple-400'
                    : 'bg-[#150d30] border border-purple-500/15 hover:border-purple-500/30'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-purple-950/70 border border-purple-500/25 text-purple-400">
                    <Plus className="w-5 h-5" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold leading-tight text-white">
                      Adicionar novo cartão
                    </h3>
                    <p className="text-xs font-medium mt-0.5 text-gray-400">
                      Crédito ou débito
                    </p>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    selectedMethod === 'new_card'
                      ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                      : 'border-2 border-gray-600'
                  }`}
                >
                  {selectedMethod === 'new_card' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: QR CODE PIX / NOVO CARTÃO                                         */}
        {/* ========================================================================= */}
        {currentStep === 3 && selectedMethod === 'pix' && pix && (
          <div className="space-y-4 pt-2 text-center">
            <div>
              <span className="text-xs text-gray-400">Valor a pagar:</span>
              <h3 className="text-3xl font-black text-[#4ade80] mt-0.5">
                R$ {pix.amount.toFixed(2).replace('.', ',')}
              </h3>
            </div>

            <div className="p-4 rounded-3xl border bg-[#160e33] border-purple-500/20 space-y-3">
              <div className="flex items-center justify-center gap-2 text-purple-300">
                <QrCode className="w-5 h-5" />
                <span className="text-xs font-bold">Pix copia e cola</span>
              </div>
              <p className="text-[10px] font-mono break-all text-gray-400 leading-relaxed max-h-24 overflow-y-auto">
                {pix.brcode}
              </p>
              <button
                onClick={handleCopiarPix}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-bold transition-colors bg-purple-600 hover:bg-purple-500 text-white"
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar código Pix'}
              </button>
            </div>

            <p className="text-xs text-gray-400 px-2">
              Cole no app do seu banco. O saldo cai sozinho assim que o pagamento
              for confirmado — pode deixar esta tela aberta.
            </p>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* BOTTOM ACTION BUTTONS FOR EACH STEP                                       */}
      {/* ========================================================================= */}

      {/* Step 1 Bottom Button: "Escolher forma de pagamento ->" */}
      {currentStep === 1 && (
        <div className="pt-4 sticky bottom-[88px] z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2 bg-[#070414]/95 backdrop-blur-sm">
          <button
            onClick={handleGoToStep2}
            className="w-full py-4 px-6 rounded-2xl font-extrabold text-[15px] tracking-wide text-white transition-all duration-150 active:scale-[0.98] bg-gradient-to-r from-[#5b21b6] via-[#6d28d9] to-[#4c1d95] border border-purple-400/40 flex items-center justify-between shadow-[0_0_25px_rgba(124,58,237,0.4)] hover:brightness-110"
          >
            <span className="flex-1 text-center font-black">Escolher forma de pagamento</span>
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white stroke-[2.5]" />
            </div>
          </button>
        </div>
      )}

      {/* Step 2 Bottom Button: Summary + "Gerar Pix de R$ ..." */}
      {currentStep === 2 && (
        <div className="space-y-4 pt-4 sticky bottom-[88px] z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2 bg-[#070414]/95 backdrop-blur-sm">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-medium">Valor da recarga</span>
              <span className="font-black text-base text-white">
                R$ {numericAmount.toFixed(2).replace('.', ',')}
              </span>
            </div>

          </div>

          <button
            onClick={handleProceedPayment}
            disabled={gerando}
            className="w-full py-4 rounded-2xl font-black text-[15px] tracking-wide text-white transition-all duration-150 active:scale-[0.98] bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:brightness-110 shadow-[0_4px_20px_rgba(168,85,247,0.4)] border border-purple-400/40 disabled:opacity-60"
          >
            {gerando ? 'Gerando cobrança...' : `Gerar Pix de R$ ${numericAmount.toFixed(2).replace('.', ',')}`}
          </button>
        </div>
      )}

      {/* Step 3: conferir pagamento */}
      {currentStep === 3 && selectedMethod === 'pix' && pix && (
        <div className="pt-4 space-y-2 sticky bottom-[88px] z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2 bg-[#070414]/95 backdrop-blur-sm">
          <button
            onClick={() => conferirPix(pix.externalId).then((ok) => ok ? onBack() : showNotification('Ainda não caiu — assim que o banco confirmar, o saldo entra sozinho.'))}
            className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] bg-gradient-to-r from-emerald-600 to-green-600 hover:brightness-110 shadow-[0_4px_20px_rgba(34,197,94,0.4)] border border-emerald-400/40"
          >
            Já paguei, conferir agora
          </button>
          <button
            onClick={() => { setPix(null); setCurrentStep(2); }}
            className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-white"
          >
            Voltar e alterar o valor
          </button>
        </div>
      )}
    </div>
  );
};
