import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Gift,
  Gamepad2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CrownAvatar } from '../components/CustomIcons';

export const AuthScreen: React.FC = () => {
  const { loginUser, registerUser, verifyEmail, resendCode, showNotification } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'codigo'>('login');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      if (mode === 'codigo') {
        await verifyEmail(email, codigo);
        return;
      }
      if (mode === 'login') {
        // 'pendente': a conta existe mas o e-mail nunca foi confirmado.
        if (await loginUser(email, password) === 'pendente') { setCodigo(''); setMode('codigo'); }
        return;
      }
      if (!acceptedTerms) {
        showNotification('Você deve aceitar os Termos de Uso.');
        return;
      }
      if (await registerUser(name, email, password) === 'pendente') { setCodigo(''); setMode('codigo'); }
    } finally {
      setEnviando(false);
    }
  };

  const handleGuestLogin = () => {
    loginUser('jogador.convidado@game.com', '123456');
  };

  return (
    <div className="min-h-full flex flex-col justify-between p-4 sm:p-5 pb-8 max-w-md mx-auto select-none bg-[#070414] text-white">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center pt-3 space-y-2">
        {/* Glowing Crown Avatar */}
        <div className="relative">
          <CrownAvatar size={68} />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#070414] flex items-center justify-center text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            Game Rewards <span className="text-amber-400 text-base">👑</span>
          </h1>
          <p className="text-xs text-gray-400 font-medium max-w-xs mt-0.5">
            Dispute torneios, vença partidas e saque via Pix na hora.
          </p>
        </div>
      </div>

      {/* Main Card Container */}
      <div
        className="rounded-3xl p-5 my-4 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(28, 18, 56, 0.95) 0%, rgba(16, 11, 38, 0.98) 100%)',
          border: '1.5px solid rgba(168, 85, 247, 0.25)',
          boxShadow: '0 10px 35px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Toggle Mode Tabs (Entrar / Criar Conta) */}
        {mode !== 'codigo' && (
        <div className="flex p-1 bg-[#120a26] rounded-2xl border border-purple-500/20 mb-5">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 ${
              mode === 'login'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.45)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 ${
              mode === 'register'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.45)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Criar Conta
          </button>
        </div>
        )}

        {mode === 'codigo' ? (
          <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">Confirme seu e-mail</h4>
                <p className="text-[10.5px] text-gray-300 truncate">
                  Mandamos um código de 6 dígitos para <span className="text-purple-300 font-semibold">{email}</span>
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">Código:</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-[#140c2e] border border-purple-500/30 rounded-2xl py-3.5 px-4 text-center text-2xl font-extrabold tracking-[0.5em] text-amber-300 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40"
                required
              />
              <p className="text-[11px] text-gray-400 mt-1.5">O código vale por 15 minutos.</p>
            </div>

            <button
              type="submit"
              disabled={codigo.length < 6 || enviando}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 text-white font-extrabold text-[15px] tracking-wide shadow-[0_0_25px_rgba(124,58,237,0.45)] border border-purple-400/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              <span>{enviando ? 'Confirmando...' : 'Confirmar E-mail'}</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>

            <div className="flex items-center justify-between text-[11px] font-semibold">
              <button type="button" onClick={() => setMode('login')} className="text-gray-400 hover:text-white">
                Voltar
              </button>
              <button type="button" onClick={() => resendCode(email)} className="text-purple-400 hover:text-purple-300">
                Reenviar código
              </button>
            </div>
          </form>
        ) : (
        <>
        {/* Bonus Badge on Register */}
        {mode === 'register' && (
          <div className="flex items-center gap-3 p-3 mb-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 animate-fade-in">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-300">
                Bônus de Boas-vindas!
              </h4>
              <p className="text-[10.5px] text-amber-200/90 font-medium">
                Ganhe <span className="font-extrabold text-[#4ade80]">R$ 5,00</span> grátis ao criar sua conta hoje.
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Name Field (Register only) */}
          {mode === 'register' && (
            <div>
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                Nome Completo:
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Seu nome ou apelido"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#140c2e] border border-purple-500/30 rounded-2xl py-3 pl-10 pr-4 text-white text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40"
                  required
                />
              </div>
            </div>
          )}

          {/* Email Field */}
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1">
              E-mail:
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#140c2e] border border-purple-500/30 rounded-2xl py-3 pl-10 pr-4 text-white text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-gray-300">
                Senha:
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => showNotification('Link de recuperação enviado para seu e-mail!')}
                  className="text-[11px] font-semibold text-purple-400 hover:text-purple-300"
                >
                  Esqueci a senha
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#140c2e] border border-purple-500/30 rounded-2xl py-3 pl-10 pr-11 text-white text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Terms Checkbox (Register only) */}
          {mode === 'register' && (
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-500 bg-purple-950 border-purple-500/30"
              />
              <span className="text-[11px] text-gray-400">
                Concordo com os <span className="text-purple-300 font-semibold">Termos de Uso</span> e sou maior de 18 anos.
              </span>
            </label>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 text-white font-extrabold text-[15px] tracking-wide shadow-[0_0_25px_rgba(124,58,237,0.45)] border border-purple-400/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>{mode === 'login' ? 'Entrar na Conta' : 'Criar Conta e Resgatar Bônus'}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-purple-500/15" />
          </div>
          <span className="relative bg-[#1a1138] px-3 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
            Ou continue com
          </span>
        </div>

        {/* Social / Guest Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Google Button */}
          <button
            type="button"
            onClick={handleGuestLogin}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-[#140c2e] hover:bg-[#1d1240] border border-purple-500/20 text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Google</span>
          </button>

          {/* Quick Demo Guest Button */}
          <button
            type="button"
            onClick={handleGuestLogin}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#140c2e] hover:bg-[#1d1240] border border-purple-500/20 text-xs font-bold text-purple-300 transition-all active:scale-95 shadow-sm"
          >
            <Gamepad2 className="w-4 h-4 text-purple-400" />
            <span>Jogar Demo</span>
          </button>
        </div>
        </>
        )}
      </div>

      {/* Security Footer Note */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>Ambiente seguro e transações protegidas via Banco Central (Pix)</span>
      </div>
    </div>
  );
};
