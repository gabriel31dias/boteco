import React from 'react';

// 3D Golden Coin Icon
export const GoldCoinIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block shrink-0 ${className}`}
  >
    <defs>
      <radialGradient id="coinGrad" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#f59e0b" />
        <stop offset="85%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#78350f" />
      </radialGradient>
      <linearGradient id="coinBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef9c3" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <filter id="coinGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="16" cy="16" r="14.5" fill="url(#coinBorder)" />
    <circle cx="16" cy="16" r="12.5" fill="url(#coinGrad)" />
    <circle cx="16" cy="16" r="9.5" stroke="#fde047" strokeWidth="1" strokeDasharray="1.5 1.5" opacity="0.6" />
    <text
      x="16"
      y="20.5"
      textAnchor="middle"
      fontSize="13"
      fontWeight="900"
      fontFamily="sans-serif"
      fill="#78350f"
      opacity="0.9"
    >
      $
    </text>
    <path
      d="M10 8 C12 6, 16 6, 19 8"
      stroke="#ffffff"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.8"
    />
  </svg>
);

// 3D Avatar Crown with Glowing Purple Border
export const CrownAvatar: React.FC<{ size?: number; className?: string }> = ({ size = 48, className = '' }) => (
  <div
    className={`relative rounded-full flex items-center justify-center shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      background: 'radial-gradient(circle at 40% 35%, #b80a12 0%, #5a0a0e 70%, #1a0507 100%)',
      boxShadow: '0 0 16px 2px rgba(242, 20, 30, 0.4), inset 0 0 10px rgba(255, 58, 64, 0.35)',
      border: '2px solid rgba(255, 58, 64, 0.6)',
    }}
  >
    <svg
      width={size * 0.58}
      height={size * 0.58}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="crownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="85%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <path
        d="M2.5 7.5L6.5 17.5H17.5L21.5 7.5L14.5 12L12 4.5L9.5 12L2.5 7.5Z"
        fill="url(#crownGrad)"
        stroke="#fef08a"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="2.5" cy="7.5" r="1" fill="#fef08a" />
      <circle cx="12" cy="4.5" r="1.2" fill="#fef08a" />
      <circle cx="21.5" cy="7.5" r="1" fill="#fef08a" />
      <rect x="6.5" y="17.5" width="11" height="2" rx="0.5" fill="#d97706" />
    </svg>
  </div>
);

// 3D Epic Chest Illustration (Cofre Épico)
export const EpicChestIllustration: React.FC<{ size?: number; className?: string }> = ({ size = 64, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    <defs>
      <linearGradient id="chestBody" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="40%" stopColor="#4338ca" />
        <stop offset="100%" stopColor="#312e81" />
      </linearGradient>
      <linearGradient id="chestGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <radialGradient id="chestGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="gemGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#67e8f9" />
        <stop offset="60%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0e7490" />
      </radialGradient>
    </defs>
    
    {/* Glow behind */}
    <circle cx="40" cy="40" r="36" fill="url(#chestGlow)" />
    
    {/* Chest base */}
    <rect x="12" y="32" width="56" height="34" rx="6" fill="url(#chestBody)" stroke="url(#chestGold)" strokeWidth="2.5" />
    
    {/* Lid curved top */}
    <path
      d="M10 32C10 21 23 15 40 15C57 15 70 21 70 32H10Z"
      fill="url(#chestBody)"
      stroke="url(#chestGold)"
      strokeWidth="2.5"
    />
    
    {/* Gold vertical straps */}
    <rect x="22" y="15.5" width="7" height="50" rx="1.5" fill="url(#chestGold)" />
    <rect x="51" y="15.5" width="7" height="50" rx="1.5" fill="url(#chestGold)" />
    
    {/* Gold horizontal center band */}
    <rect x="11" y="30" width="58" height="5" fill="url(#chestGold)" />
    
    {/* Center Lock / Emblem */}
    <circle cx="40" cy="36" r="6" fill="url(#chestGold)" stroke="#78350f" strokeWidth="1" />
    <polygon points="40,32 44,36 40,40 36,36" fill="url(#gemGrad)" />
    
    {/* Keyhole */}
    <circle cx="40" cy="45" r="2.5" fill="#1e1b4b" />
    <polygon points="38.5,45 41.5,45 41,50 39,50" fill="#1e1b4b" />
    
    {/* Corner studs */}
    <circle cx="16" cy="38" r="1.5" fill="#fef08a" />
    <circle cx="16" cy="58" r="1.5" fill="#fef08a" />
    <circle cx="64" cy="38" r="1.5" fill="#fef08a" />
    <circle cx="64" cy="58" r="1.5" fill="#fef08a" />
  </svg>
);

// Large Chest with Overflowing Coins (Banner Bottom)
export const BigOverflowingChest: React.FC<{ size?: number; className?: string }> = ({ size = 110, className = '' }) => (
  <svg
    width={size}
    height={size * 0.75}
    viewBox="0 0 140 105"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    <defs>
      <linearGradient id="bigChestBody" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="50%" stopColor="#3730a3" />
        <stop offset="100%" stopColor="#1e1b4b" />
      </linearGradient>
      <linearGradient id="bigChestGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#f59e0b" />
        <stop offset="90%" stopColor="#b45309" />
      </linearGradient>
      <radialGradient id="goldGlow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.8" />
        <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="coinFill" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    
    {/* Ambient Glow */}
    <ellipse cx="65" cy="45" rx="55" ry="35" fill="url(#goldGlow)" />
    
    {/* Open Lid in Perspective */}
    <path
      d="M18 36L42 12C45 9 95 9 98 12L122 36L102 38L38 38L18 36Z"
      fill="url(#bigChestBody)"
      stroke="url(#bigChestGold)"
      strokeWidth="3"
    />
    
    {/* Chest Body Base */}
    <path
      d="M20 38H120L112 88C111 92 108 95 104 95H36C32 95 29 92 28 88L20 38Z"
      fill="url(#bigChestBody)"
      stroke="url(#bigChestGold)"
      strokeWidth="3.5"
    />
    
    {/* Gold Vertical Straps Body */}
    <path d="M38 38L42 95H52L48 38H38Z" fill="url(#bigChestGold)" />
    <path d="M92 38L88 95H98L102 38H92Z" fill="url(#bigChestGold)" />
    
    {/* Overflowing Gold Coins Pile */}
    <ellipse cx="70" cy="40" rx="42" ry="14" fill="#d97706" />
    
    {/* Individual glowing coins in the chest */}
    <ellipse cx="65" cy="38" rx="9" ry="5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="50" cy="36" rx="8" ry="4.5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="82" cy="37" rx="8.5" ry="5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="38" cy="41" rx="8" ry="4" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="94" cy="42" rx="7.5" ry="4" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="58" cy="44" rx="9" ry="5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    <ellipse cx="74" cy="45" rx="8.5" ry="4.5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="1" />
    
    {/* Spilling coins outside base */}
    <circle cx="24" cy="85" r="5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="34" cy="94" r="4.5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="108" cy="88" r="5.5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="118" cy="80" r="4" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="15" cy="74" r="3.5" fill="url(#coinFill)" stroke="#fef08a" strokeWidth="0.8" />
    
    {/* Front Lock */}
    <rect x="63" y="48" width="14" height="18" rx="3" fill="url(#bigChestGold)" stroke="#78350f" strokeWidth="1" />
    <circle cx="70" cy="55" r="3" fill="#1e1b4b" />
    <polygon points="68.5,55 71.5,55 71,61 69,61" fill="#1e1b4b" />
    
    {/* Sparkles */}
    <polygon points="35,22 37,27 42,29 37,31 35,36 33,31 28,29 33,27" fill="#ffffff" />
    <polygon points="105,25 106.5,29 110,30 106.5,31 105,35 103.5,31 100,30 103.5,29" fill="#ffffff" />
  </svg>
);

// 3D Glowing Purple Wallet Illustration with Stack of Gold Coins
export const Wallet3DIllustration: React.FC<{ size?: number; className?: string }> = ({ size = 110, className = '' }) => (
  <svg
    width={size}
    height={size * 0.75}
    viewBox="0 0 140 105"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    <defs>
      <linearGradient id="walletBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="50%" stopColor="#5b21b6" />
        <stop offset="100%" stopColor="#3b0764" />
      </linearGradient>
      <linearGradient id="walletBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="100%" stopColor="#6b21a8" />
      </linearGradient>
      <linearGradient id="goldCoins" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <radialGradient id="walletGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
        <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
    </defs>
    
    {/* Glow */}
    <circle cx="70" cy="50" r="50" fill="url(#walletGlow)" />
    
    {/* Gold Coins Stack Behind / Beside Wallet */}
    {/* Coin 1 Top Right */}
    <ellipse cx="98" cy="30" rx="14" ry="7" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="1" />
    <path d="M84 30V35C84 39 112 39 112 35V30" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="0.8" />
    
    {/* Coin 2 Stack */}
    <ellipse cx="108" cy="45" rx="16" ry="8" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="1" />
    <path d="M92 45V52C92 56 124 56 124 52V45" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="0.8" />
    
    {/* Coin 3 Stack Lower */}
    <ellipse cx="108" cy="54" rx="16" ry="8" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="1" />
    
    {/* Front Wallet Body */}
    <rect
      x="35"
      y="32"
      width="68"
      height="48"
      rx="10"
      fill="url(#walletBody)"
      stroke="url(#walletBorder)"
      strokeWidth="2"
      transform="rotate(-5 69 56)"
    />
    
    {/* Wallet Flap */}
    <path
      d="M36 34C36 34 70 42 103 36C103 36 102 52 101 54C69 58 35 48 35 48L36 34Z"
      fill="#6d28d9"
      opacity="0.9"
    />
    
    {/* Gold Crown Emblem on Wallet */}
    <g transform="translate(60, 48) scale(0.9)">
      <path
        d="M2 5L5 13H15L18 5L13 9L10 3L7 9L2 5Z"
        fill="url(#goldCoins)"
        stroke="#fef08a"
        strokeWidth="0.8"
      />
    </g>
    
    {/* Spilled coins in front */}
    <circle cx="28" cy="68" r="7" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="120" cy="74" r="6" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="0.8" />
    <circle cx="18" cy="62" r="4.5" fill="url(#goldCoins)" stroke="#fef08a" strokeWidth="0.8" />
    
    {/* Magical sparkles */}
    <polygon points="12,38 13.5,42 17,43.5 13.5,45 12,49 10.5,45 7,43.5 10.5,42" fill="#fef08a" />
    <polygon points="125,22 126.5,25 129,26 126.5,27 125,30 123.5,27 121,26 123.5,25" fill="#fef08a" />
  </svg>
);

// 3D Gold Stack of Coins with Crown Emboss (Profile Screen)
export const CoinStackIllustration: React.FC<{ size?: number; className?: string }> = ({ size = 90, className = '' }) => (
  <svg
    width={size}
    height={size * 0.8}
    viewBox="0 0 110 88"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    <defs>
      <linearGradient id="stackGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="40%" stopColor="#f59e0b" />
        <stop offset="85%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      <radialGradient id="stackGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
    </defs>
    
    <circle cx="55" cy="44" r="40" fill="url(#stackGlow)" />
    
    {/* Back coin stack */}
    <g transform="translate(48, 12)">
      <ellipse cx="22" cy="12" rx="18" ry="9" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1" />
      <path d="M4 12V24C4 29 40 29 40 24V12" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="0.8" />
      <ellipse cx="22" cy="24" rx="18" ry="9" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1" />
      <path d="M4 24V36C4 41 40 41 40 36V24" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="0.8" />
      <ellipse cx="22" cy="36" rx="18" ry="9" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1" />
    </g>
    
    {/* Front big coin tilted */}
    <g transform="translate(8, 22)">
      <circle cx="28" cy="28" r="24" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1.5" />
      <circle cx="28" cy="28" r="19" stroke="#fef9c3" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      {/* Crown on Coin */}
      <path
        d="M17 33L19 25L23 29L28 21L33 29L37 25L39 33H17Z"
        fill="#92400e"
        opacity="0.8"
      />
    </g>
    
    {/* Right coin tilted */}
    <g transform="translate(56, 36)">
      <ellipse cx="20" cy="20" rx="18" ry="10" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1.2" />
      <path d="M2 20V27C2 33 38 33 38 27V20" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="0.8" />
      <ellipse cx="20" cy="27" rx="18" ry="10" fill="url(#stackGold)" stroke="#fef08a" strokeWidth="1.2" />
    </g>
    
    {/* Sparkles */}
    <polygon points="95,12 96.5,15 99,16 96.5,17 95,20 93.5,17 91,16 93.5,15" fill="#fef08a" />
    <polygon points="12,18 13.5,21 16,22 13.5,23 12,26 10.5,23 8,22 10.5,21" fill="#fef08a" />
  </svg>
);

// Hexagonal & Shield Badges for Achievements
export const AchievementBadge: React.FC<{
  type: 'trophy_streak' | 'first_withdraw' | 'top10' | 'locked';
  size?: number;
}> = ({ type, size = 68 }) => {
  if (type === 'trophy_streak') {
    // Purple Glowing Shield with Trophy
    return (
      <div
        className="relative flex flex-col items-center justify-center rounded-2xl p-2.5 transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle at 50% 30%, #6d28d9 0%, #3b0764 80%, #1e1b4b 100%)',
          border: '1.5px solid rgba(192, 132, 252, 0.6)',
          boxShadow: '0 0 16px rgba(168, 85, 247, 0.4)',
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 9V3H18V9C18 12.3 15.3 15 12 15C8.7 15 6 12.3 6 9Z"
            fill="url(#trophyGrad)"
            stroke="#fef08a"
            strokeWidth="1"
          />
          <path d="M6 5H3C2.4 5 2 5.4 2 6C2 8.2 3.8 10 6 10V5Z" fill="url(#trophyGrad)" />
          <path d="M18 5H21C21.6 5 22 5.4 22 6C22 8.2 20.2 10 18 10V5Z" fill="url(#trophyGrad)" />
          <path d="M10 15V18H14V15" stroke="#fef08a" strokeWidth="1.5" />
          <path d="M8 21H16" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <defs>
            <linearGradient id="trophyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="60%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  if (type === 'first_withdraw') {
    // Blue Glowing Shield with Rocket
    return (
      <div
        className="relative flex flex-col items-center justify-center rounded-2xl p-2.5 transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle at 50% 30%, #2563eb 0%, #1e3a8a 80%, #0f172a 100%)',
          border: '1.5px solid rgba(96, 165, 250, 0.6)',
          boxShadow: '0 0 16px rgba(59, 130, 246, 0.4)',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" fill="#3b82f6" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" fill="#60a5fa" stroke="#ffffff" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      </div>
    );
  }

  if (type === 'top10') {
    // Gold Glowing Shield with Star and Laurel
    return (
      <div
        className="relative flex flex-col items-center justify-center rounded-2xl p-2.5 transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle at 50% 30%, #d97706 0%, #78350f 80%, #451a03 100%)',
          border: '1.5px solid rgba(251, 191, 36, 0.7)',
          boxShadow: '0 0 16px rgba(245, 158, 11, 0.45)',
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <polygon
            points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
            fill="url(#starGoldGrad)"
            stroke="#fef08a"
            strokeWidth="1"
          />
          <defs>
            <linearGradient id="starGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  // Locked Achievement
  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-2xl p-2.5 opacity-60"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        border: '1.5px solid rgba(100, 116, 139, 0.4)',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  );
};

/** Foto de perfil quando há; senão a coroa padrão. Mesma moldura vermelha nos dois. */
export const Avatar: React.FC<{ url?: string | null; size?: number; className?: string; alt?: string }> = ({
  url, size = 48, className = '', alt = '',
}) => (url ? (
  <img
    src={url}
    alt={alt}
    width={size}
    height={size}
    className={`rounded-full object-cover shrink-0 ${className}`}
    style={{
      width: size,
      height: size,
      boxShadow: '0 0 16px 2px rgba(242, 20, 30, 0.4)',
      border: '2px solid rgba(255, 58, 64, 0.6)',
    }}
  />
) : <CrownAvatar size={size} className={className} />);
