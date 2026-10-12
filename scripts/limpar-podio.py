# Apaga nome, pontos e prêmio de exemplo do pódio (rk-podium.jpg) pra o front
# escrever os dados reais por cima. Roda uma vez: python3 -I scripts/limpar-podio.py
# ponytail: coordenadas fixas da arte; arte nova = medir de novo.
from pathlib import Path
from PIL import Image, ImageFilter

assets = Path(__file__).resolve().parent.parent / 'src/assets'
im = Image.open(assets / 'rk-podium.jpg').convert('RGB')
assert im.size == (941, 446), f'arte inesperada: {im.size}'
px = im.load()

# (x0, y0, x1, y1): nome, estrela+pontos e valor do prêmio de cada card (2º, 1º, 3º)
caixas = [
    (112, 262, 252, 295), (100, 299, 256, 336), (118, 375, 242, 412),
    (402, 228, 566, 267), (384, 273, 566, 315), (386, 359, 562, 408),
    (710, 263, 824, 296), (690, 299, 838, 337), (704, 375, 822, 412),
]
for x0, y0, x1, y1 in caixas:
    # ponytail: preenche cada linha interpolando as bordas esquerda/direita; o fundo dos cards é liso
    for y in range(y0, y1):
        a, b = px[x0 - 3, y], px[x1 + 3, y]
        for x in range(x0, x1):
            t = (x - x0) / (x1 - x0)
            px[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
    caixa = (x0 - 2, y0 - 2, x1 + 2, y1 + 2)
    im.paste(im.crop(caixa).filter(ImageFilter.GaussianBlur(3)), caixa[:2])

im.save(assets / 'rk-podio.jpg', quality=90)
print('ok', assets / 'rk-podio.jpg')
