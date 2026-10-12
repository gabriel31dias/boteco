# Recorta os sprites do kit da cacheta para src/assets/cacheta e pinta de
# vermelho o feltro da sala do pôquer (o kit só traz a mesa em miniatura).
# Roda uma vez: python3 -I scripts/recortar-cacheta.py <kit.png>
# ponytail: coordenadas fixas do kit (1672x940); kit novo = medir de novo.
import colorsys
import sys
from pathlib import Path
from PIL import Image, ImageDraw

raiz = Path(__file__).resolve().parent.parent
kit = Image.open(sys.argv[1]).convert('RGBA')
assert kit.size == (1672, 940), f'kit inesperado: {kit.size}'
saida = raiz / 'src/assets/cacheta'
saida.mkdir(parents=True, exist_ok=True)


def sem_fundo(im):
    """O kit vem sobre preto: apaga o preto ligado às bordas (o brilho do sprite fica)."""
    mascara = Image.new('L', (im.width + 2, im.height + 2), 0)
    escuro = im.convert('L').point(lambda v: 0 if v < 28 else 255)
    mascara.paste(escuro, (1, 1))
    ImageDraw.floodfill(mascara, (0, 0), 128)
    fundo = mascara.crop((1, 1, im.width + 1, im.height + 1)).point(lambda v: 255 if v == 128 else 0)
    alfa = Image.eval(fundo, lambda v: 255 - v)
    im.putalpha(Image.composite(alfa, im.getchannel('A'), fundo))
    return im


caixas = {'logo': (8, 2, 390, 238), 'monte': (1560, 200, 1665, 290), 'coroa': (1285, 672, 1385, 770),
          'fichas': (350, 300, 415, 385), 'vitoria': (905, 770, 1110, 920)}
for nome, caixa in caixas.items():
    sem_fundo(kit.crop(caixa)).save(saida / f'{nome}.webp', quality=90, method=6)

# Mesa: a sala do pôquer com o feltro verde virando o vermelho do kit. Só dentro
# da elipse do feltro (as plantas e os dados verdes da sala ficam como estão).
sala = Image.open(raiz / 'src/assets/poker/fundo.webp').convert('RGB')
px = sala.load()
cx, cy, rx, ry = 902, 516, 640, 200
for y in range(cy - ry, cy + ry):
    for x in range(cx - rx, cx + rx):
        if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1:
            continue
        r, g, b = px[x, y]
        if g > r + 8 and g > b:
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hls_to_rgb(0.99, l * 0.92, min(1, s * 1.1))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255))
sala.save(saida / 'fundo.webp', quality=82, method=6)

# Capa da vitrine (o card de 154x136 da home, em 2x): feltro vermelho + logo.
capa = sala.crop((700, 380, 1104, 736)).resize((308, 272)).convert('RGBA')
logo = Image.open(saida / 'logo.webp').convert('RGBA')
logo.thumbnail((290, 200))
capa.alpha_composite(logo, ((308 - logo.width) // 2, (272 - logo.height) // 2 + 6))
capa.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(caixas) + 2} sprites em {saida}')
