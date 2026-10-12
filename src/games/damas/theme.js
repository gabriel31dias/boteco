// Cada tema muda material do tabuleiro, moldura, pecas, cenario, luz e HUD.
// mat: 'marble' | 'wood' | 'stone'  -> algoritmo de textura em art.js

export const THEMES = {
  blackMarble: {
    id: 'blackMarble', label: 'MARMORE NEGRO',
    board: { mat: 'marble', light: ['#a3a09a', '#c2bfb8', '#7c7a75'], dark: ['#1b1c1f', '#2c2e33', '#0c0d0f'], vein: '#e8e4dc', veinDark: '#5a5d64', grid: '#000000' },
    frame: { a: '#a9adb4', b: '#42464c', c: '#e6e9ec', inlay: '#8d6b3f' },
    player: { body: '#e9dfcc', top: '#f6efe1', edge: '#b9aa8d', rim: '#fffaf0', groove: '#a9997c', accent: '#c8ab73', crown: '#d8bd86' },
    cpu: { body: '#191a1d', top: '#2a2c31', edge: '#0a0a0c', rim: '#8d919a', groove: '#000000', accent: '#6e1526', crown: '#a8324a' },
    env: { top: '#0b0c0f', bottom: '#1c1712', table: '#241c15', glow: '#ffcf94', glowAlpha: 0.30, dust: '#ffe0b0', warm: 0.55 },
    hud: { text: '#e6e3dc', dim: '#7e7c78', accent: '#c8ab73', bad: '#a8324a' },
  },
  classicWood: {
    id: 'classicWood', label: 'MADEIRA CLASSICA',
    board: { mat: 'wood', light: ['#d3b787', '#e7d0a4', '#b39a6e'], dark: ['#4a2f1c', '#63412a', '#2e1c10'], vein: '#f0dcb4', veinDark: '#22140b', grid: '#1a0f07' },
    frame: { a: '#9c7b3d', b: '#4a3418', c: '#e2c47c', inlay: '#2a1a0c' },
    player: { body: '#eadfc6', top: '#f7eeda', edge: '#b8a887', rim: '#fffbf1', groove: '#a08d68', accent: '#9c7b3d', crown: '#d9b45f' },
    cpu: { body: '#221a12', top: '#37291c', edge: '#0f0a06', rim: '#a08050', groove: '#0a0603', accent: '#9c7b3d', crown: '#d9b45f' },
    env: { top: '#120d08', bottom: '#241811', table: '#2e2015', glow: '#ffc27a', glowAlpha: 0.34, dust: '#ffd9a0', warm: 0.72 },
    hud: { text: '#efe3ca', dim: '#8a7a60', accent: '#d9b45f', bad: '#b4573a' },
  },
  royal: {
    id: 'royal', label: 'REAL',
    board: { mat: 'stone', light: ['#26406b', '#3a5a8c', '#1b2f52'], dark: ['#0b1424', '#152238', '#050a13'], vein: '#7fa3d6', veinDark: '#040810', grid: '#020509' },
    frame: { a: '#c9a227', b: '#6d5210', c: '#f4dc8e', inlay: '#1b2f52' },
    player: { body: '#efe6cf', top: '#fbf5e6', edge: '#bdb08f', rim: '#fffdf6', groove: '#a99a72', accent: '#c9a227', crown: '#f4dc8e' },
    cpu: { body: '#111d33', top: '#1e2f4d', edge: '#050a14', rim: '#8ba7d0', groove: '#020509', accent: '#c9a227', crown: '#f4dc8e' },
    env: { top: '#05080f', bottom: '#101a2c', table: '#141d30', glow: '#ffd98a', glowAlpha: 0.26, dust: '#ffeab8', warm: 0.40 },
    hud: { text: '#e8eefb', dim: '#6d7d97', accent: '#e0bf50', bad: '#b3556a' },
  },
  modern: {
    id: 'modern', label: 'MODERNO',
    board: { mat: 'stone', light: ['#c3c7ca', '#dee1e4', '#a5a9ad'], dark: ['#2a2d32', '#3b3f45', '#17191c'], vein: '#ffffff', veinDark: '#0d0e10', grid: '#0d0e10' },
    frame: { a: '#8e949b', b: '#33373c', c: '#dfe3e7', inlay: '#5d646c' },
    player: { body: '#f0f1f2', top: '#ffffff', edge: '#bcc0c4', rim: '#ffffff', groove: '#a4a9ae', accent: '#7d858e', crown: '#c9d0d7' },
    cpu: { body: '#25282c', top: '#383c42', edge: '#101215', rim: '#9aa1a9', groove: '#08090b', accent: '#4d5a68', crown: '#93a3b4' },
    env: { top: '#0e1013', bottom: '#1b1e22', table: '#202429', glow: '#cfe2ff', glowAlpha: 0.20, dust: '#dbe8fa', warm: 0.12 },
    hud: { text: '#eef0f2', dim: '#7c8288', accent: '#b9c2cb', bad: '#c26a6a' },
  },
  emerald: {
    id: 'emerald', label: 'ESMERALDA',
    board: { mat: 'marble', light: ['#b3bcaf', '#cdd5c8', '#939b90'], dark: ['#0f2a21', '#1a3d31', '#071812'], vein: '#dff0e4', veinDark: '#04100c', grid: '#04100c' },
    frame: { a: '#9a7b45', b: '#3d3018', c: '#e0c07f', inlay: '#0f2a21' },
    player: { body: '#ece5d3', top: '#f8f3e6', edge: '#bab08f', rim: '#fffdf4', groove: '#a2977a', accent: '#9a7b45', crown: '#e0c07f' },
    cpu: { body: '#0e2419', top: '#193728', edge: '#04100a', rim: '#7fae90', groove: '#020805', accent: '#9a7b45', crown: '#e0c07f' },
    env: { top: '#060d0a', bottom: '#12211a', table: '#16261d', glow: '#ffdca0', glowAlpha: 0.26, dust: '#e8f5d8', warm: 0.48 },
    hud: { text: '#e4ece2', dim: '#748076', accent: '#cfae72', bad: '#b06060' },
  },
};

export const THEME_ORDER = ['blackMarble', 'classicWood', 'royal', 'modern', 'emerald'];
