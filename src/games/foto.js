/**
 * Foto de perfil pros jogos em Phaser: vira uma textura redonda, com aro, que a
 * cena usa como qualquer imagem. Sem foto (ou se ela falhar) sai um disco roxo
 * com a inicial do nome — assim o HUD tem o mesmo desenho com ou sem foto.
 *
 * Canvas recortado em vez de máscara do Phaser: máscara segue a câmera e cada
 * cena daqui tem a sua; textura pronta funciona igual em todas.
 */
const LADO = 128;

/** Chave da textura: quem monta o HUD síncrono confere se ela já existe. */
export const chaveFoto = ({ url, nome = '?', aro = '#c084fc' } = {}) => `foto:${url ?? `sem:${nome}`}:${aro}`;

/** @returns {Promise<string>} chave da textura, já registrada no TextureManager */
export async function fotoRedonda(scene, { url, nome = '?', aro = '#c084fc' } = {}) {
  const key = chaveFoto({ url, nome, aro });
  if (scene.textures.exists(key)) return key;

  let img = null;
  if (url) {
    img = new Image();
    img.src = url;
    try { await img.decode(); } catch { img = null; }
  }
  // A cena pode ter morrido enquanto a foto baixava (saiu da partida).
  if (!scene.sys?.textures || scene.textures.exists(key)) return key;

  const cv = document.createElement('canvas');
  cv.width = LADO;
  cv.height = LADO;
  const g = cv.getContext('2d');
  const r = LADO / 2;
  const borda = LADO * 0.06;

  g.save();
  g.beginPath();
  g.arc(r, r, r - borda / 2, 0, Math.PI * 2);
  g.clip();
  if (img) {
    // cobre o círculo recortando o centro, como object-fit: cover
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  } else {
    const fundo = g.createRadialGradient(r * 0.8, r * 0.7, 4, r, r, r);
    fundo.addColorStop(0, '#5b21b6');
    fundo.addColorStop(1, '#1e1b4b');
    g.fillStyle = fundo;
    g.fillRect(0, 0, LADO, LADO);
    g.fillStyle = '#e9d5ff';
    g.font = `800 ${LADO * 0.46}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((nome.trim()[0] ?? '?').toUpperCase(), r, r + LADO * 0.03);
  }
  g.restore();

  g.beginPath();
  g.arc(r, r, r - borda / 2, 0, Math.PI * 2);
  g.lineWidth = borda;
  g.strokeStyle = aro;
  g.stroke();

  scene.textures.addCanvas(key, cv);
  return key;
}
