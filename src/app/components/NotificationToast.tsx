import React from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles } from 'lucide-react';

export const NotificationToast: React.FC = () => {
  const { notification } = useApp();

  if (!notification) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none animate-bounce-short">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#241549]/95 backdrop-blur-md border border-purple-400/50 text-white font-bold text-xs shadow-[0_8px_30px_rgba(168,85,247,0.5)]">
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
        <span>{notification}</span>
      </div>
    </div>
  );
};
