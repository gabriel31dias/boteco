/**
 * Paleta e "material" de cada mesa. Tudo que é cor mora aqui: adicionar um tema
 * novo é acrescentar um objeto, sem tocar em render nem em cena.
 */

export const THEMES = {
  royalGreen: {
    id: 'royalGreen',
    name: 'Royal Green',
    felt: ['#2A7D5E', '#12503C', '#062018'],   // centro → borda
    feltNoise: 0.05,
    woodStops: ['#7A4A24', '#3E2210', '#5C3418'],
    gold: 0xd4af57,
    goldCss: '#D4AF57',
    goldSoft: '#8C6F32',
    tile: { top: '#FFFEF8', mid: '#F7F0DF', bot: '#DCCFB4', edge: '#A4906C', groove: '#C6B392' },
    pip: ['#33333A', '#101014'],
    back: ['#1A1A20', '#08080B'],
    backGold: '#A9873C',
    text: '#F2E9D2',
    textDim: 'rgba(242,233,210,0.55)',
    glow: 0xffe9a8,
    material: 'felt',
  },
  blackGold: {
    id: 'blackGold',
    name: 'Black Gold',
    felt: ['#26262C', '#141418', '#050506'],
    feltNoise: 0.04,
    woodStops: ['#2B2B31', '#0E0E11', '#3A3A42'],
    gold: 0xe0bd6a,
    goldCss: '#E0BD6A',
    goldSoft: '#8C6F32',
    tile: { top: '#FFFDF6', mid: '#F2EADA', bot: '#D6C9B0', edge: '#9C8A68', groove: '#BFAD8C' },
    pip: ['#2E2E34', '#0B0B0E'],
    back: ['#241D0E', '#0A0906'],
    backGold: '#C9A24E',
    text: '#F5EBD4',
    textDim: 'rgba(245,235,212,0.55)',
    glow: 0xffe9a8,
    material: 'wood',
  },
};

export let theme = THEMES.royalGreen;
export function setTheme(id) {
  theme = THEMES[id] || THEMES.royalGreen;
  return theme;
}
