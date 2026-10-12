import React, { useState, useEffect } from 'react';

export const StatusBar: React.FC = () => {
  const [time, setTime] = useState('9:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-7 pt-3 pb-1 text-white text-xs font-semibold select-none z-30">
      {/* Left Time */}
      <span className="text-[13px] font-bold tracking-tight">{time}</span>

      {/* Dynamic Island Pill (Simulated) */}
      <div className="w-24 h-5 bg-black rounded-full mx-auto shadow-inner" />

      {/* Right Icons: Signal, Wifi, Battery */}
      <div className="flex items-center gap-1.5 text-[11px]">
        {/* Cellular Signal 4 bars */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="16" width="3" height="6" rx="1" />
          <rect x="8" y="12" width="3" height="10" rx="1" />
          <rect x="14" y="8" width="3" height="14" rx="1" />
          <rect x="20" y="4" width="3" height="18" rx="1" />
        </svg>

        {/* Wifi Icon */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z" />
        </svg>

        {/* Battery Icon */}
        <div className="flex items-center">
          <div className="w-5 h-2.5 rounded-[3px] border border-white/80 p-0.5 flex items-center">
            <div className="h-full w-3.5 bg-white rounded-[1.5px]" />
          </div>
          <div className="w-0.5 h-1 bg-white/80 rounded-r-sm" />
        </div>
      </div>
    </div>
  );
};
