import React from 'react';
import { Home, Target, Trophy, User, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'inicio',
      label: 'Início',
      icon: <Home className="w-5 h-5" />,
    },
    {
      id: 'missoes',
      label: 'Missões',
      icon: <Target className="w-5 h-5" />,
    },
    {
      id: 'ranking',
      label: 'Ranking',
      icon: <Trophy className="w-5 h-5" />,
    },
    {
      id: 'carteira',
      label: 'Carteira',
      icon: <Wallet className="w-5 h-5" />,
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User className="w-5 h-5" />,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 px-3 pb-4 pt-1">
      <nav className="relative flex items-center justify-around bg-[#120c2b]/95 backdrop-blur-xl border border-purple-500/20 rounded-3xl py-2 px-1 shadow-[0_-4px_25px_rgba(0,0,0,0.6)]">
        {navItems.map((item) => {
          const isActive =
            activeTab === item.id ||
            (item.id === 'carteira' &&
              (activeTab === 'loja' || activeTab === 'saque' || activeTab === 'pagamento' || activeTab === 'recarga'));
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 ${
                isActive ? 'text-purple-300' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {/* Active Top Glow Line / Dot */}
              {isActive && (
                <div className="absolute -top-2 w-7 h-1 bg-gradient-to-r from-purple-500 to-fuchsia-400 rounded-full shadow-[0_0_8px_#a855f7]" />
              )}

              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-transform ${
                  isActive
                    ? 'text-purple-300 scale-110 shadow-[0_0_12px_rgba(168,85,247,0.5)] bg-purple-500/15 border border-purple-400/40'
                    : 'text-gray-400'
                }`}
              >
                {item.icon}
              </div>

              <span
                className={`text-[10.5px] font-medium tracking-tight mt-0.5 transition-colors ${
                  isActive ? 'text-purple-200 font-semibold' : 'text-gray-400'
                }`}
              >
                {item.label === 'Loja / Carteira' ? (activeTab === 'carteira' ? 'Carteira' : 'Loja') : item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
