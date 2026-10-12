const LADO = 256;   // px da foto salva: sobra pra tela retina e cabe em ~20 KB

/**
 * Recorta o centro em quadrado, reduz e reencoda em JPEG. Reencodar também
 * descarta o EXIF (GPS da foto do celular não vai pro servidor).
 */
export async function reduzirFoto(arquivo: File): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const lado = Math.min(img.width, img.height);
  const cv = document.createElement('canvas');
  cv.width = LADO;
  cv.height = LADO;
  cv.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  img.close();
  return cv.toDataURL('image/jpeg', 0.85);
}
