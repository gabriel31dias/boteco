# Prepara a Batalha Naval a partir de duas imagens:
#   python3 -I scripts/preparar-naval.py <folha.png> <maquete.png>
#   folha   = "Sprite Sheet de Batalha Naval (1).png" (1536x1024): navios (inteiro,
#             atirando, pegando fogo, afundando), submarinos, aviões, balas,
#             explosões, esguichos, ilhas, farol, cais e ondas
#   maquete = "Batalha Naval_ Duelo em Alto-Mar.png" (1024x1536): a tela de
#             referência; daqui sai a capa e o emblema do VS
# O fundo (oceano com ilhas) é montado aqui com pedaços da folha.
# ponytail: caixas fixas na folha; folha nova = medir de novo.
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/naval'
saida.mkdir(parents=True, exist_ok=True)
folha = Image.open(sys.argv[1]).convert('RGBA')
assert folha.size == (1536, 1024), f'folha inesperada: {folha.size}'
A = folha.getchannel('A').load()


def recortar(x0, y0, x1, y1, junto=False, corte=90):
    """Maior ilha (alfa >= corte) da caixa, ou tudo (`junto`), com o alfa original e a borda macia."""
    w, h = x1 - x0, y1 - y0
    vis = bytearray(w * h)
    ilhas = []
    for sy in range(h):
        for sx in range(w):
            if vis[sy * w + sx] or A[x0 + sx, y0 + sy] < corte:
                continue
            ilha, pilha = [], [(sx, sy)]
            vis[sy * w + sx] = 1
            while pilha:
                x, y = pilha.pop()
                ilha.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not vis[ny * w + nx] and A[x0 + nx, y0 + ny] >= corte:
                        vis[ny * w + nx] = 1
                        pilha.append((nx, ny))
            ilhas.append(ilha)
    ilhas.sort(key=len, reverse=True)
    usar = [p for il in ilhas if len(il) > 20 for p in il] if junto else ilhas[0]
    out = Image.new('RGBA', (w, h))
    src, dst = folha.load(), out.load()
    marcados = set(usar)
    for x, y in usar:
        dst[x, y] = src[x0 + x, y0 + y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in marcados and dst[nx, ny][3] == 0:
                dst[nx, ny] = src[x0 + nx, y0 + ny]
    return out.crop(out.getbbox())


S = {
    # navios de cima, proa pra cima: o grande (porta-aviões) e os menores (fileira de baixo)
    'grande': (14, 8, 122, 298), 'grande-fogo': (536, 28, 620, 298),
    'grande-afunda-0': (630, 32, 727, 302), 'grande-afunda-1': (727, 36, 815, 304), 'grande-afunda-2': (812, 62, 932, 306), 'grande-afunda-3': (912, 172, 1056, 310),
    'medio': (16, 298, 98, 508), 'cruzador': (296, 300, 377, 503), 'contra': (470, 298, 546, 497), 'medio-fogo': (552, 298, 636, 496),
    'medio-afunda-0': (638, 302, 732, 492), 'medio-afunda-1': (727, 312, 822, 488), 'medio-afunda-2': (818, 316, 898, 488), 'medio-afunda-3': (893, 340, 988, 490),
    'submarino': (902, 598, 1078, 671), 'submarino-dano': (1050, 748, 1200, 815),
    'lancha-0': (12, 497, 106, 620), 'lancha-1': (546, 492, 650, 594),
    'aviao-0': (924, 20, 1055, 115), 'aviao-1': (1056, 18, 1155, 103),
    'bala': (1238, 110, 1343, 140), 'bomba': (1375, 110, 1504, 141), 'torpedo': (996, 307, 1172, 335),
    'fogo-0': (1306, 531, 1359, 590), 'fogo-1': (1368, 514, 1418, 590), 'chama-0': (871, 887, 926, 952), 'chama-1': (941, 904, 998, 949),
    'agua-0': (978, 527, 1025, 591), 'agua-1': (1032, 515, 1093, 593), 'agua-2': (1101, 510, 1175, 593), 'agua-3': (1429, 517, 1488, 593),
    'agua-grande': (777, 881, 850, 964), 'pedra': (820, 624, 883, 681),
    'onda-0': (12, 895, 134, 949), 'onda-1': (141, 895, 262, 949), 'onda-2': (276, 895, 389, 949), 'onda-longa': (406, 886, 754, 948),
    'cais-0': (476, 774, 589, 845), 'cais-1': (536, 822, 695, 896),
}
JUNTOS = {
    'explosao-0': (1447, 141, 1516, 206), 'explosao-1': (1350, 203, 1442, 273), 'explosao-2': (1262, 198, 1344, 274), 'explosao-3': (1219, 432, 1327, 501),
    'fumaca': (1435, 417, 1522, 582), 'submarino-explode-0': (1322, 700, 1416, 820), 'submarino-explode-1': (1418, 672, 1528, 820),
    'ilha-0': (130, 606, 298, 758), 'ilha-1': (301, 605, 434, 709), 'ilha-farol': (479, 585, 816, 829),
}
# ilhas avulsas: só a maior ilha da caixa (sem os pedacinhos do lado)
S.update({'ilha-2': (11, 641, 138, 765), 'ilha-3': (812, 690, 930, 760), 'ilha-4': (720, 800, 818, 880)})
sprites = {n: recortar(*c) for n, c in S.items()}
sprites.update({n: recortar(*c, junto=True) for n, c in JUNTOS.items()})
for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo em pé (1080x1920): oceano fundo, ondas da folha, ilhas e cais nos cantos
W, H = 1080, 1920
rnd = random.Random(5)
fundo = Image.new('RGBA', (W, H))
d = ImageDraw.Draw(fundo)
for y in range(H):
    t = y / H
    d.line((0, y, W, y), fill=(int(8 + 14 * t), int(52 + 40 * (1 - abs(t - 0.5) * 2)), int(110 + 40 * t), 255))
ondas = [sprites[n] for n in ('onda-0', 'onda-1', 'onda-2', 'onda-longa')]
for _ in range(170):
    o = rnd.choice(ondas)
    s = rnd.uniform(0.5, 1.3)
    o = o.resize((int(o.width * s), int(o.height * s)), Image.LANCZOS)
    o.putalpha(o.getchannel('A').point(lambda v: int(v * 0.38)))
    fundo.alpha_composite(o, (rnd.randint(-120, W), rnd.randint(-40, H)))
fundo = fundo.filter(ImageFilter.GaussianBlur(0.6))


def colar(nome, x, y, w, espelha=False):
    im = sprites[nome]
    im = im.resize((int(w), int(im.height * w / im.width)), Image.LANCZOS)
    if espelha:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    fundo.alpha_composite(im, (int(x), int(y)))


colar('ilha-0', -60, -40, 330)
colar('ilha-farol', 760, -30, 420, True)
colar('ilha-2', -50, 1560, 300)
colar('ilha-1', 830, 1600, 300, True)
colar('cais-1', 120, 1800, 260)
colar('pedra', 960, 980, 90)
colar('pedra', 10, 900, 70)
colar('ilha-3', 900, 1480, 160)
colar('ilha-4', 30, 1380, 140)
# vinheta
v = Image.new('L', (W, H), 0)
ImageDraw.Draw(v).ellipse((-260, -200, W + 260, H + 200), fill=255)
v = v.filter(ImageFilter.GaussianBlur(160))
escuro = Image.new('RGBA', (W, H), (2, 12, 30, 255))
fundo = Image.composite(fundo, escuro, v)
fundo.convert('RGB').save(saida / 'fundo.webp', quality=86, method=6)

# ---- da maquete: emblema do VS e a capa
maq = Image.open(sys.argv[2]).convert('RGBA')
assert maq.size == (1024, 1536), f'maquete inesperada: {maq.size}'
vs = maq.crop((388, 8, 640, 190))
borda = Image.new('L', vs.size, 0)
ImageDraw.Draw(borda).ellipse((8, 0, vs.width - 8, vs.height), fill=255)   # sem o quadrado do mar da maquete
vs.putalpha(borda.filter(ImageFilter.GaussianBlur(10)))
vs.save(saida / 'vs.webp', quality=90, method=6)
capa = Image.new('RGB', (310, 272), (4, 18, 40))
cena = ImageEnhance.Contrast(maq.convert('RGB').crop((0, 860, 1024, 1480)).resize((310, 188), Image.LANCZOS)).enhance(1.1)
capa.paste(cena, (0, 6))
dd = ImageDraw.Draw(capa)
dd.rectangle((0, 196, 310, 272), fill=(4, 18, 40))
for txt, tam, y, cor in [('BATALHA', 38, 194, (255, 255, 255)), ('NAVAL', 36, 232, (255, 196, 40))]:
    f = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', tam)
    w = dd.textlength(txt, font=f)
    dd.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
capa.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + vs + capa em {saida}')
