# Prepara Arqueiros a partir de uma imagem:
#   python3 -I scripts/preparar-arqueiros.py <folha.png>
#   folha = "Sprite Sheet do Arqueiro Elemental.png" (1536x1024)
# A folha tem o arqueiro azul e o vermelho (quadros de puxar, soltar, correr,
# agachar e morrer), flechas, fogo, gelo, bomba, explosões, aljavas, elmos e o
# cenário (ilhas flutuantes, caixas, barris, paliçadas, alvo, estandartes,
# tochas, árvores). Verde e roxo saem do azul trocando o matiz só do que é azul.
# O fundo (céu, nuvens, ilhas distantes e as ilhas do mapa com a decoração) é
# montado aqui, com as ilhas exatamente onde regras.js põe as plataformas.
# ponytail: caixas fixas na folha; folha nova = medir de novo.
import colorsys
import math
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/arqueiros'
saida.mkdir(parents=True, exist_ok=True)
folha = Image.open(sys.argv[1]).convert('RGBA')
assert folha.size == (1536, 1024), f'folha inesperada: {folha.size}'
A = folha.getchannel('A').load()


def recortar(x0, y0, x1, y1, junto=False, dentro=None):
    """Maior ilha (alfa >= 90) da caixa, ou tudo (`junto`), com o alfa original e borda macia."""
    w, h = x1 - x0, y1 - y0
    vis = bytearray(w * h)
    ilhas = []
    for sy in range(h):
        for sx in range(w):
            if vis[sy * w + sx] or A[x0 + sx, y0 + sy] < 90 or (dentro and not dentro(x0 + sx, y0 + sy)):
                continue
            ilha, pilha = [], [(sx, sy)]
            vis[sy * w + sx] = 1
            while pilha:
                x, y = pilha.pop()
                ilha.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not vis[ny * w + nx] and A[x0 + nx, y0 + ny] >= 90 and (not dentro or dentro(x0 + nx, y0 + ny)):
                        vis[ny * w + nx] = 1
                        pilha.append((nx, ny))
            ilhas.append(ilha)
    ilhas.sort(key=len, reverse=True)
    usar = [p for il in ilhas if junto and len(il) > 15 for p in il] if junto else ilhas[0]
    out = Image.new('RGBA', (w, h))
    src, dst = folha.load(), out.load()
    dentro_set = set(usar)
    for x, y in usar:
        dst[x, y] = src[x0 + x, y0 + y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dentro_set and dst[nx, ny][3] == 0:
                dst[nx, ny] = src[x0 + nx, y0 + ny]
    return out.crop(out.getbbox())


def matiz(im, de=(0.53, 0.72), para=0.33, sat=1.0):
    """Troca o matiz dos pixels azuis (pluma, capa, olhos, flecha) e deixa o resto (elmo dourado, corpo preto)."""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if de[0] <= h <= de[1] and s > 0.25:
                r2, g2, b2 = colorsys.hls_to_rgb(para, l, min(1, s * sat))
                px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return im


# ---- arqueiros: quadros na ordem da folha (o mapa de animação fica no jogo.js)
AZUL = [(18, 8, 166, 182), (168, 8, 292, 182), (292, 8, 418, 182), (410, 8, 522, 182), (520, 8, 650, 182), (626, 8, 752, 182),
        (750, 8, 873, 182), (872, 8, 1020, 182), (1022, 8, 1137, 182), (1138, 8, 1253, 182), (1255, 8, 1378, 182), (1358, 8, 1515, 182)]
AZUL_MORTE = [(1222, 163, 1340, 216), (1368, 163, 1508, 220)]
VERM = [(10, 192, 148, 375), (148, 192, 265, 372), (265, 192, 395, 372), (366, 192, 486, 372), (470, 192, 578, 372), (575, 192, 657, 372),
        (655, 192, 757, 372), (755, 192, 875, 360), (858, 192, 980, 378), (962, 192, 1090, 385), (1092, 192, 1203, 385), (1213, 192, 1297, 338),
        (1300, 192, 1414, 356), (1412, 192, 1525, 356)]
VERM_MORTE = [(1150, 328, 1287, 390), (1288, 350, 1405, 400), (1413, 356, 1526, 400)]

sprites = {}
for k, c in enumerate(AZUL):
    sprites[f'azul-{k}'] = recortar(*c)
for k, c in enumerate(AZUL_MORTE):
    sprites[f'azul-morto-{k}'] = recortar(*c)
for k, c in enumerate(VERM):
    sprites[f'vermelho-{k}'] = recortar(*c)
for k, c in enumerate(VERM_MORTE):
    sprites[f'vermelho-morto-{k}'] = recortar(*c)
for cor, h in (('verde', 0.32), ('roxo', 0.78)):
    for nome in [n for n in list(sprites) if n.startswith('azul-')]:
        sprites[nome.replace('azul', cor, 1)] = matiz(sprites[nome], para=h)

# ---- flechas, poderes e efeitos
S = {
    'flecha-azul': (18, 386, 130, 416), 'flecha-vermelho': (136, 424, 250, 454), 'flecha-verde': (258, 386, 372, 416),
    'flecha-roxo': (136, 386, 250, 416), 'flecha-fogo': (388, 460, 518, 494), 'flecha-gelo': (533, 460, 655, 494),
    'bola-fogo': (802, 386, 888, 437), 'bomba': (862, 438, 928, 502),
    'aljava-fogo': (786, 512, 848, 642), 'aljava-gelo': (888, 512, 958, 642),
    'elmo-azul': (6, 644, 90, 742), 'elmo-vermelho': (89, 644, 174, 742),
    'barril': (924, 646, 982, 734), 'caixa': (988, 646, 1060, 738), 'caixas': (1064, 648, 1137, 740),
    'palicada': (1143, 638, 1234, 744), 'cerca': (1243, 638, 1347, 738), 'alvo': (808, 648, 910, 778),
    'estandarte-azul': (6, 743, 148, 895), 'estandarte-vermelho': (148, 743, 294, 890), 'estandarte-vermelho2': (300, 743, 442, 888),
    'tocha': (448, 753, 502, 884), 'arvore': (1158, 768, 1238, 904), 'pinheiro': (1474, 810, 1532, 902),
    'arbusto': (832, 866, 878, 900), 'arbustos': (928, 846, 1082, 900), 'arbusto2': (1222, 850, 1302, 902), 'pedras': (1306, 822, 1480, 902),
    'placa': (854, 782, 943, 902), 'ilha-1': (717, 765, 854, 895), 'ilha-2': (944, 738, 1090, 855), 'ilha-3': (1217, 735, 1383, 861),
    'ilha-4': (1389, 739, 1526, 852),
    'mira-azul': (88, 903, 167, 1012), 'mira-vermelho': (162, 903, 232, 975),
    'faisca': (518, 932, 567, 977), 'brilho': (698, 908, 738, 946), 'poeira-0': (1163, 963, 1297, 1020), 'poeira-1': (1295, 965, 1377, 1020),
}
for nome, c in S.items():
    sprites[nome] = recortar(*c)
# explosões (de fogo e de gelo) e fumaça: vários pedaços, recorta junto
for k, c in enumerate([(1148, 448, 1252, 532), (1250, 448, 1338, 532), (1334, 448, 1406, 532), (1404, 448, 1528, 532)]):
    sprites[f'explosao-{k}'] = recortar(*c, junto=True)
for k, c in enumerate([(1082, 532, 1167, 634), (1163, 532, 1242, 634), (1238, 532, 1322, 634)]):
    sprites[f'gelo-{k}'] = recortar(*c, junto=True)
for k, c in enumerate([(1318, 532, 1402, 634), (1398, 532, 1462, 634), (1458, 532, 1532, 634)]):
    sprites[f'fumaca-{k}'] = recortar(*c, junto=True)
for nome in ('elmo-azul',):
    for cor, h in (('verde', 0.32), ('roxo', 0.78)):
        sprites[nome.replace('azul', cor)] = matiz(sprites[nome], para=h)
sprites['flecha-verde'] = matiz(sprites['flecha-azul'], para=0.32)
sprites['flecha-roxo'] = matiz(sprites['flecha-azul'], para=0.78)

for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo 1280x720: céu do entardecer, nuvens, ilhas longe, e as ilhas do mapa (regras.js PLATAFORMAS)
W, H = 1280, 720
rnd = random.Random(11)
fundo = Image.new('RGBA', (W, H))
d = ImageDraw.Draw(fundo)
for y in range(H):
    t = y / H
    c1, c2, c3 = (32, 46, 104), (226, 120, 92), (255, 196, 120)
    c = [int(c1[i] + (c2[i] - c1[i]) * min(1, t / 0.62)) for i in range(3)] if t < 0.62 else [int(c2[i] + (c3[i] - c2[i]) * (t - 0.62) / 0.38) for i in range(3)]
    d.line((0, y, W, y), fill=(*c, 255))
sol = Image.new('RGBA', (W, H))
ImageDraw.Draw(sol).ellipse((560, 430, 720, 590), fill=(255, 226, 150, 255))
fundo.alpha_composite(sol.filter(ImageFilter.GaussianBlur(40)))
fundo.alpha_composite(sol.filter(ImageFilter.GaussianBlur(4)))
# montanhas longe
mont = Image.new('RGBA', (W, H))
md = ImageDraw.Draw(mont)
for camada, (cor, base, amp) in enumerate([((120, 70, 110, 255), 560, 90), ((80, 46, 84, 255), 620, 70)]):
    pts = [(0, H)]
    for x in range(0, W + 40, 40):
        pts.append((x, base - amp * (0.5 + 0.5 * math.sin(x / 130 + camada * 2)) * (0.6 + 0.4 * math.sin(x / 47 + camada))))
    pts.append((W, H))
    md.polygon(pts, fill=cor)
fundo.alpha_composite(mont.filter(ImageFilter.GaussianBlur(2)))
# nuvens
for _ in range(14):
    n = Image.new('RGBA', (W, H))
    nd = ImageDraw.Draw(n)
    cx, cy, s = rnd.randint(-50, W + 50), rnd.randint(40, 420), rnd.uniform(0.6, 1.4)
    for _ in range(7):
        r = rnd.randint(25, 55) * s
        ox, oy = rnd.uniform(-80, 80) * s, rnd.uniform(-15, 15) * s
        nd.ellipse((cx + ox - r, cy + oy - r * 0.6, cx + ox + r, cy + oy + r * 0.6), fill=(255, 220, 210, 70))
    fundo.alpha_composite(n.filter(ImageFilter.GaussianBlur(6)))


def colar(im, x, y, alvo):
    alvo.alpha_composite(im, (int(x), int(y)))


def escalar(im, w):
    return im.resize((int(w), int(im.height * w / im.width)), Image.LANCZOS)


def topo_grama(im):
    """Primeira linha em que a ilha ocupa boa parte da largura (o chão de grama)."""
    a = im.getchannel('A').load()
    for y in range(im.height):
        if sum(1 for x in range(im.width) if a[x, y] > 128) > im.width * 0.62:
            return y
    return 0


# ilhas distantes (escuras, pequenas, borradas)
for nome, x, y, w in [('ilha-4', 40, 200, 90), ('ilha-2', 1120, 150, 110), ('ilha-1', 300, 90, 70), ('ilha-3', 980, 60, 80), ('ilha-4', 760, 380, 60)]:
    im = escalar(sprites[nome], w)
    im = ImageEnhance.Brightness(im).enhance(0.55)
    im = im.filter(ImageFilter.GaussianBlur(1.4))
    im.putalpha(im.getchannel('A').point(lambda v: int(v * 0.7)))
    colar(im, x, y, fundo)

# ilhas do mapa: (sprite, centro x, topo y, largura, espelha) — iguais a PLATAFORMAS em regras.js
ILHAS = [('ilha-3', 200, 470, 340, False), ('ilha-3', 1080, 470, 340, True), ('ilha-2', 640, 560, 310, False),
         ('ilha-4', 420, 300, 240, False), ('ilha-4', 860, 300, 240, True), ('ilha-1', 640, 170, 200, False)]
for nome, cx, top, w, esp in ILHAS:
    im = escalar(sprites[nome], w)
    if esp:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    t = topo_grama(im)
    print(f'{nome}: plataforma [{cx - w * 0.43:.0f}, {cx + w * 0.43:.0f}, {top}]  (grama a {t}px do topo)')
    colar(im, cx - w / 2, top - t, fundo)
# decoração em cima das ilhas (sem colisão)
DECOR = [('pinheiro', 70, 470, 70), ('arvore', 1215, 470, 90), ('estandarte-azul', 150, 470, 90), ('estandarte-vermelho', 1130, 470, 90),
         ('arbustos', 230, 470, 110), ('arbusto2', 1010, 470, 80), ('pedras', 640, 560, 120), ('tocha', 325, 300, 30), ('tocha', 955, 300, 30),
         ('arbusto', 700, 170, 40), ('placa', 560, 560, 50), ('arbusto', 470, 300, 40)]
for nome, cx, chao, w in DECOR:
    im = escalar(sprites[nome], w)
    colar(im, cx - im.width / 2, chao - im.height + 4, fundo)
fundo.convert('RGB').save(saida / 'fundo.webp', quality=88, method=6)

# ---- capa do tile (310x272)
c = fundo.convert('RGB').resize((310, 174), Image.LANCZOS).crop((0, 0, 310, 174))
capa = Image.new('RGB', (310, 272), (14, 10, 24))
capa.paste(ImageEnhance.Contrast(c).enhance(1.1), (0, 10))
for nome, x, esp in (('azul-2', 10, False), ('vermelho-1', 168, True)):
    im = escalar(sprites[nome], 130)
    if esp:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    capa.paste(im, (x, 196 - im.height), im)
fl = escalar(sprites['flecha-fogo'], 90)
capa.paste(fl, (110, 70), fl)
dd = ImageDraw.Draw(capa)
dd.rectangle((0, 200, 310, 272), fill=(14, 10, 24))
for txt, tam, y, cor in [('ARQUEIROS', 40, 198, (255, 255, 255)), ('DO CÉU', 30, 236, (255, 120, 60))]:
    f = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', tam)
    w = dd.textlength(txt, font=f)
    dd.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
capa.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + capa em {saida}')
