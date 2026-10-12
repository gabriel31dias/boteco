import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { BottomNav } from './components/BottomNav';
import { NotificationToast } from './components/NotificationToast';
import { AuthScreen } from './screens/AuthScreen';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MissionsScreen } from './screens/MissionsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { WalletScreen } from './screens/WalletScreen';
// import { RewardsScreen } from './screens/RewardsScreen';
import { RankingScreen } from './screens/RankingScreen';
import { ModeracaoScreen } from './screens/ModeracaoScreen';
import { WithdrawScreen } from './screens/WithdrawScreen';
import { AddBalanceScreen } from './screens/AddBalanceScreen';
import { DepositModal } from './components/DepositModal';
import { WithdrawModal } from './components/WithdrawModal';
import { ConvertModal } from './components/ConvertModal';
import { EditProfileModal } from './components/EditProfileModal';
import { FotoPerfilModal } from './components/FotoPerfilModal';
import { ChatAvisos, ChatBotao, ChatPainel, ConviteModal, PedidoAmizadeModal } from './components/Chat';
import { Reacoes } from './components/Reacoes';
import { VelhaScreen } from './screens/VelhaScreen';
import { DominoScreen } from './screens/DominoScreen';
import { TrucoScreen } from './screens/TrucoScreen';
import { DamasScreen } from './screens/DamasScreen';

export const AppContent: React.FC = () => {
  const { activeTab, setActiveTab, isAuthenticated, loading, match, pedirFoto, setPedirFoto } = useApp();

  // Modals state
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const renderCurrentScreen = () => {
    if (loading) {
      return <div className="h-screen grid place-items-center text-sm text-gray-400">Carregando…</div>;
    }
    if (!isAuthenticated || activeTab === 'auth') {
      return <AuthScreen />;
    }

    switch (activeTab) {
      case 'inicio':
        return <HomeScreen onOpenDeposit={() => setActiveTab('recarga')} />;
      case 'missoes':
        return <MissionsScreen onOpenDeposit={() => setActiveTab('recarga')} />;
      case 'perfil':
        return (
          <ProfileScreen
            onOpenEdit={() => setIsEditProfileOpen(true)}
            onOpenDeposit={() => setActiveTab('recarga')}
            onOpenWithdraw={() => setActiveTab('saque')}
            onOpenConvert={() => setIsConvertOpen(true)}
          />
        );
      case 'carteira':
      case 'loja':
        return (
          <WalletScreen
            onOpenDeposit={() => setActiveTab('recarga')}
            onOpenWithdraw={() => setActiveTab('saque')}
            onOpenConvert={() => setIsConvertOpen(true)}
          />
        );
      case 'saque':
        return <WithdrawScreen onBack={() => setActiveTab('carteira')} />;
      case 'recarga':
      case 'pagamento':
        return <AddBalanceScreen onBack={() => setActiveTab('carteira')} />;
      /*
      case 'recompensas':
        return <RewardsScreen />;
      */
      case 'ranking':
        return <RankingScreen />;
      case 'moderacao':
        return <ModeracaoScreen />;
      default:
        return <HomeScreen onOpenDeposit={() => setActiveTab('recarga')} />;
    }
  };

  const isAuthView = !isAuthenticated || activeTab === 'auth' || loading;

  // Na partida o app sai do caminho. Cada jogo tem sua tela; o servidor diz qual.
  // Dentro da partida o chat não abre (atenção no jogo, valendo dinheiro):
  // só os avisos discretos. O modal de amizade espera a partida acabar.
  if (match) {
    const tela = match.game === 'velha' ? <VelhaScreen />
      : match.game === 'domino' || match.game === 'domino-duplas' ? <DominoScreen />
      : match.game === 'truco' || match.game === 'truco-duplas' ? <TrucoScreen />
      : match.game === 'damas' ? <DamasScreen />
      : <GameScreen />;
    return <>{tela}<Reacoes key={match.matchId} match={match} /><ChatAvisos /></>;
  }

  return (
    <div
      className="h-[100dvh] w-full max-w-md mx-auto bg-[#0a0618] text-white flex flex-col relative selection:bg-purple-600 selection:text-white"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #1a0f3d 0%, #0c081e 50%, #070510 100%)',
      }}
    >
      {/* Ambient Top Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Dynamic Toast Notifications */}
      <NotificationToast />

      {/* Scrollable Screen Content */}
      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar relative z-10">
        {renderCurrentScreen()}
      </main>

      {/* Fixed Bottom Navigation Bar (Hidden when on Auth Screen) */}
      {!isAuthView && <BottomNav />}

      {/* Interactive Modals */}
      <DepositModal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} />
      <WithdrawModal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} />
      <ConvertModal isOpen={isConvertOpen} onClose={() => setIsConvertOpen(false)} />
      <EditProfileModal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} />
      <FotoPerfilModal isOpen={pedirFoto && isAuthenticated} onClose={() => setPedirFoto(false)} />

      {/* Chat e amizades */}
      {!isAuthView && <ChatBotao />}
      <ChatPainel />
      {!isAuthView && !pedirFoto && <PedidoAmizadeModal />}
      {!isAuthView && <ConviteModal onEntrar={() => setActiveTab('inicio')} />}
      <ChatAvisos />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

export default App;
