import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { api, setToken, token as tokenSalvo } from '../../api';
import { net } from '../../net';
import { TabType, UserProfile, Mission, Transaction, MatchHistoryItem, Achievement, MatchInfo, ServerState } from '../types';

interface AppContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  loading: boolean;
  profile: UserProfile;
  walletBalance: number;
  bonusBalance: number;
  inDisputeBalance: number;
  points: number;
  coins: number;
  streakDays: number;
  hasClaimedStreakToday: boolean;
  missions: Mission[];
  completedUnclaimedCount: number;
  claimableCoins: number;
  transactions: Transaction[];
  matchHistory: MatchHistoryItem[];
  achievements: Achievement[];
  claimRewards: () => void;
  criarPix: (amount: number) => Promise<CobrancaPix>;
  conferirPix: (externalId?: string) => Promise<boolean>;
  withdrawBalance: (amount: number, pixKey: string) => Promise<boolean>;
  convertPoints: (pointsToConvert: number) => void;
  checkInStreak: () => void;
  updateProfile: (name: string, username: string) => Promise<boolean>;
  setAvatar: (image: string | null) => Promise<boolean>;
  notification: string | null;
  showNotification: (msg: string) => void;
  isAuthenticated: boolean;
  loginUser: (email: string, pass: string) => Promise<boolean | 'pendente'>;
  registerUser: (name: string, email: string, pass: string) => Promise<boolean | 'pendente'>;
  verifyEmail: (email: string, code: string) => Promise<boolean>;
  resendCode: (email: string) => Promise<void>;
  logoutUser: () => void;
  /** Conta recém-confirmada: o app pede a foto de perfil uma vez. */
  pedirFoto: boolean;
  setPedirFoto: (v: boolean) => void;
  match: MatchInfo | null;
  setMatch: (m: MatchInfo | null) => void;
  applyServerState: (s: ServerState) => void;
}

export interface CobrancaPix {
  externalId: string;
  brcode: string;
  amount: number;
  expiresAt: number;
}

const perfilVazio: UserProfile = {
  name: '', username: '', level: 1, currentXp: 0, nextLevelXp: 500, isVerified: false,
  league: 'Liga Bronze', leagueRank: 0, totalGames: 0, wins: 0, winRate: 0,
};

const ICONE: Record<string, Transaction['icon']> = {
  deposit: 'pix', reward: 'trophy', tournament_entry: 'arrow_down', withdrawal: 'saque_pix',
};

/** "Hoje, 09:14" / "Ontem, 21:02" / "02 ago, 18:30" — como o layout espera. */
function quando(at: number, comHora = true): string {
  const d = new Date(at);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = (x: Date) => x.toISOString().slice(0, 10);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (dia(d) === dia(hoje)) return comHora ? `Hoje, ${hora}` : 'Hoje';
  if (dia(d) === dia(ontem)) return comHora ? `Ontem, ${hora}` : 'Ontem';
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return comHora ? `${data}, ${hora}` : data;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('auth');
  const [estado, setEstado] = useState<ServerState | null>(null);
  const [loading, setLoading] = useState<boolean>(!!tokenSalvo);
  const [notification, setNotification] = useState<string | null>(null);
  const [pedirFoto, setPedirFoto] = useState(false);
  const [match, setMatch] = useState<MatchInfo | null>(null);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification((prev) => (prev === msg ? null : prev)), 3500);
  }, []);

  const triggerConfetti = () => {
    try {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 },
        colors: ['#a855f7', '#fbbf24', '#22c55e', '#3b82f6', '#ec4899'] });
    } catch { /* sem canvas */ }
  };

  /** Pagou e fechou o app antes de cair? Ao voltar, o servidor reconfere. */
  const retomarPix = () => api.pixConferir()
    .then((s: ServerState & { pago: boolean }) => {
      if (!s.pago) return;
      setEstado(s);
      triggerConfetti();
      showNotification('✅ Pix confirmado! Saldo atualizado.');
    })
    .catch(() => {});

  // Token guardado: tenta retomar a sessão sem passar pelo login.
  useEffect(() => {
    if (!tokenSalvo) return;
    api.me()
      .then((s) => { setEstado(s); setActiveTab('inicio'); retomarPix(); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Primeiro acesso de conta sem foto (confirmou o e-mail ou entrou pela 1ª vez
  // neste aparelho): pede a foto uma vez. Depois, só em Perfil → Editar.
  const semFotoId = estado && !estado.profile.avatarUrl ? estado.profile.id : null;
  useEffect(() => {
    if (semFotoId == null || localStorage.getItem(`foto-pedida-${semFotoId}`)) return;
    localStorage.setItem(`foto-pedida-${semFotoId}`, '1');
    setPedirFoto(true);
  }, [semFotoId]);

  /** Toda rota do servidor devolve o estado inteiro: uma fonte de verdade só. */
  const applyServerState = useCallback((s: ServerState) => setEstado(s), []);

  // O fim da partida mexe no saldo, e ele é da conta — não da mesa. Escutar
  // aqui em cima faz a carteira acertar mesmo quando a GameScreen já desmontou
  // (é o caso de quem desiste: sai da tela antes do resultado chegar).
  useEffect(() => net.on('settled', (s: { state?: ServerState }) => {
    if (s?.state) setEstado(s.state);
  }), []);

  // O `start` debita a entrada; o `settled` acerta as contas. Os dois trazem o
  // estado novo pra carteira nunca ficar atrás do servidor.
  // Adversário foi pra outro app: avisa quem ficou pra não desistir da mesa.
  useEffect(() => net.on('ausente', (a: { segundos?: number; voltou?: boolean }) => {
    showNotification(a.voltou ? 'O adversário voltou pra partida'
      : `O adversário saiu do app. Se não voltar em ${a.segundos}s, a vitória é sua`);
  }), [showNotification]);

  useEffect(() => net.on('start', (s: { state?: ServerState }) => {
    if (s?.state) setEstado(s.state);
  }), []);

  // Devolve se deu certo: quem abriu um formulário precisa saber se pode fechar.
  const acao = (fn: () => Promise<ServerState>, ok?: string, festa = false) =>
    fn().then((s) => { setEstado(s); if (festa) triggerConfetti(); if (ok) showNotification(ok); return true; })
      .catch((e: Error) => { showNotification(`❌ ${e.message}`); return false; });

  const entrar = async (p: Promise<ServerState & { token: string }>, msg: (s: ServerState) => string,
    avisaErro = true) => {
    try {
      const s = await p;
      setToken(s.token);
      setEstado(s);
      setActiveTab('inicio');
      // Sem conectar aqui: cada jogo tem seu servidor, e o `join` conecta no
      // certo. Conectar antes de escolher seria abrir socket no jogo errado.
      retomarPix();
      triggerConfetti();
      showNotification(msg(s));
      return true;
    } catch (e) {
      if (!avisaErro) throw e;    // quem chamou trata (ex.: e-mail por confirmar)
      showNotification(`❌ ${(e as Error).message}`);
      return false;
    }
  };

  const valor = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  const missions: Mission[] = estado?.missions ?? [];
  const naoResgatadas = missions.filter((m) => m.completed && !m.claimed);

  const ctx: AppContextType = {
    activeTab, setActiveTab, loading,
    profile: estado?.profile ?? perfilVazio,
    walletBalance: estado?.walletBalance ?? 0,
    bonusBalance: estado?.bonusBalance ?? 0,
    inDisputeBalance: estado?.inDisputeBalance ?? 0,
    points: estado?.points ?? 0,
    coins: estado?.coins ?? 0,
    streakDays: estado?.streakDays ?? 0,
    hasClaimedStreakToday: estado?.hasClaimedStreakToday ?? false,
    missions,
    completedUnclaimedCount: naoResgatadas.length,
    claimableCoins: naoResgatadas.reduce((t, m) => t + m.rewardCoins, 0),
    transactions: (estado?.transactions ?? []).map((t) => ({
      ...t, date: quando(t.at), icon: ICONE[t.type] ?? 'trophy',
    })),
    matchHistory: (estado?.matchHistory ?? []).map((m) => ({ ...m, date: quando(m.at, false) })),
    achievements: estado?.achievements ?? [],

    claimRewards: () => acao(
      () => api.claimMissions().then((r) => { showNotification(`🎉 +${r.coins} moedas!`); return r.state; }),
      undefined, true),
    criarPix: (amount) => api.pixCriar(amount),
    conferirPix: async (externalId) => {
      try {
        const s: ServerState & { pago: boolean } = await api.pixConferir(externalId);
        if (!s.pago) return false;
        setEstado(s);
        triggerConfetti();
        showNotification('✅ Pix confirmado! Saldo atualizado.');
        return true;
      } catch { return false; }
    },
    withdrawBalance: async (amount, pixKey) => {
      try {
        setEstado(await api.withdraw(amount, pixKey));
        showNotification(`💸 Saque de ${valor(amount)} solicitado!`);
        return true;
      } catch (e) { showNotification(`❌ ${(e as Error).message}`); return false; }
    },
    convertPoints: (pts) => acao(() => api.convert(pts),
      `✨ ${pts.toLocaleString('pt-BR')} pontos convertidos!`, true),
    checkInStreak: () => acao(
      () => api.claimStreak().then((r) => { showNotification('🔥 Sequência confirmada! +50 moedas'); return r.state; }),
      undefined, true),
    updateProfile: (name, username) => acao(
      () => api.updateProfile(name, username), 'Perfil atualizado com sucesso!'),
    setAvatar: (image) => acao(() => api.setAvatar(image), image ? 'Foto atualizada!' : 'Foto removida'),

    notification, showNotification,
    isAuthenticated: !!estado,
    loginUser: async (email, pass) => {
      try {
        return await entrar(api.login({ email, password: pass }) as never,
          (s) => `🎮 Bem-vindo de volta, ${s.profile.name}!`, false);
      } catch (e) {
        const erro = e as Error & { status?: number };
        showNotification(`❌ ${erro.message}`);
        return erro.status === 403 ? 'pendente' : false;   // 403 = falta confirmar o e-mail
      }
    },
    registerUser: async (name, email, pass) => {
      try {
        await api.register({ name, email, password: pass });
        showNotification('📧 Enviamos um código pro seu e-mail');
        return 'pendente';
      } catch (e) {
        showNotification(`❌ ${(e as Error).message}`);
        return false;
      }
    },
    verifyEmail: (email, code) => entrar(api.verify(email, code) as never,
      () => '🎉 E-mail confirmado! +R$ 5,00 de bônus de boas-vindas!'),
    pedirFoto, setPedirFoto,
    resendCode: async (email) => {
      try {
        await api.resendCode(email);
        showNotification('📧 Código reenviado');
      } catch (e) {
        showNotification(`❌ ${(e as Error).message}`);
      }
    },
    logoutUser: () => {
      api.logout().catch(() => {});
      net.disconnect();
      setToken(null);
      setEstado(null);
      setMatch(null);
      setPedirFoto(false);
      setActiveTab('auth');
      showNotification('Você saiu da sua conta.');
    },
    match, setMatch, applyServerState,
  };

  // __estado / __sair: ganchos de console e do e2e — o app não lê isso.
  (window as any).__estado = () => estado;
  (window as any).__sair = () => setMatch(null);

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
