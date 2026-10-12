export type TabType = 'inicio' | 'missoes' | 'recompensas' | 'ranking' | 'loja' | 'carteira' | 'perfil' | 'saque' | 'pagamento' | 'recarga' | 'auth' | 'moderacao';

export interface UserProfile {
  id?: number;
  name: string;
  username: string;
  email?: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  isVerified: boolean;
  avatarUrl?: string;
  isAdmin?: boolean;   // está em ADMIN_EMAILS: vê a tela de moderação
  league: string;
  leagueRank: number;
  totalGames: number;
  wins: number;
  winRate: number;
}

export interface JogoInfo {
  id: string;
  nome: string;
  subtitulo: string;
  arbitro: 'consenso' | 'servidor';
  jogadores?: number;     // mesa fixa; omitido = 2
  minJogadores?: number;  // mesa variável: abre com o mínimo depois da espera
  maxJogadores?: number;
  duplas?: boolean;       // 0 e 2 contra 1 e 3
}

/** Quem já está na sala esperando, e em que time (0 = A, 1 = B). */
export interface Mesa {
  code: string;
  jogadores: number;           // máximo da mesa
  minimo?: number;
  duplas?: boolean;
  inicioEm?: number | null;    // mesa variável: quando abre, se ninguém mais chegar
  premio?: number;             // centavos, com quem está sentado agora
  players: { id: number; name: string; time: number | null; avatar?: string | null }[];
}

export interface RankingRow {
  id: number;
  name: string;
  username: string;
  points: number;
  wins: number;
  rank: number;
  league: string;
}

export interface Mission {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  type: 'game' | 'friends' | 'eliminations' | 'login';
  current: number;
  total: number;
  rewardCoins: number;
  completed: boolean;
  claimed: boolean;
  color: 'purple' | 'blue' | 'green' | 'orange';
}

export interface Transaction {
  id: string;
  title: string;
  at: number;
  date: string;          // derivado de `at` no AppContext
  amount: number;
  type: 'deposit' | 'reward' | 'tournament_entry' | 'withdrawal';
  icon: 'pix' | 'trophy' | 'arrow_down' | 'saque_pix';
}

export interface MatchHistoryItem {
  id: string;
  opponent: string;
  isWin: boolean;
  pts: number;
  prizeMoney?: number;
  at: number;
  date: string;
}

export interface Achievement {
  id: string;
  title: string;
  unlocked: boolean;
  type: 'trophy_streak' | 'first_withdraw' | 'top10' | 'locked';
}

/** Sala em que a partida acontece, como o servidor descreve. */
export interface RoomInfo {
  type: string;
  name: string;
  stake: number;   // centavos
  prize: number;   // centavos
}

/** Aposta que o dono da sala privada propôs — valores em centavos. */
export interface Proposta {
  code: string;
  stake: number;
  prize: number;
  host: { id: number; name: string; username: string; level: number };
}

/** Payload do `start`: tudo que a mesa precisa pra começar. */
export interface MatchInfo {
  game: string;          // qual jogo — cada um roda no seu servidor
  seed: number;
  seat: number;         // nas duplas vai de 0 a 3; time = seat % 2
  matchId: number;
  players: { id: number; name: string; username: string; level: number; avatar?: string | null }[];
  room: RoomInfo;
  state?: ServerState;   // saldo já com a entrada debitada
}

/** O que /api/me (e todas as outras rotas) devolvem. */
export interface ServerState {
  profile: UserProfile;
  walletBalance: number;
  bonusBalance: number;
  inDisputeBalance: number;
  points: number;
  coins: number;
  streakDays: number;
  hasClaimedStreakToday: boolean;
  missions: Mission[];
  transactions: Omit<Transaction, 'date' | 'icon'>[];
  matchHistory: Omit<MatchHistoryItem, 'date'>[];
  achievements: Achievement[];
}
