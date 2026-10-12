# Recorta os sprites do "Atlas de Sprites para Batalha de Tanques.png" para
# src/assets/tanque e monta a capa do tile. Roda uma vez:
#   python3 -I scripts/recortar-tanque.py <atlas.png>
# ponytail: coordenadas fixas do atlas; atlas novo = medir de novo.
#
# O atlas não tem fundo transparente: os sprites estão sobre um degradê
# desfocado. A "varinha" entra pelas bordas de cada caixa e vai comendo pixel
# enquanto a cor muda pouco de um vizinho pro outro (fundo liso); o contorno
# escuro dos sprites segura. Tanque tem esteira cinza parecida com o fundo:
# tolerância menor.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

atlas = Image.open(sys.argv[1]).convert('RGBA')
assert atlas.size == (1536, 1024), f'atlas inesperado: {atlas.size}'
saida = Path(__file__).resolve().parent.parent / 'src/assets/tanque'
saida.mkdir(parents=True, exist_ok=True)

FINO = (8, 45)      # (passo, teto) pra tanque: a esteira cinza some com a padrão
PADRAO = (14, 70)

SPRITES = {
    'destrocos-azul': ((1338, 2, 1512, 122), FINO),
    'destrocos-vermelho': ((1338, 118, 1512, 248), FINO),
    'destrocos-verde': ((1376, 236, 1502, 342), FINO),
    'destrocos-amarelo': ((1376, 340, 1502, 447), FINO),
    'bala-verde': ((1324, 251, 1376, 294), FINO),
    'bala-amarela': ((1321, 358, 1366, 399), FINO),
    'bala-azul': ((195, 498, 292, 540), PADRAO),
    'bala-vermelha': ((200, 445, 272, 488), PADRAO),
    'caixa': ((16, 598, 94, 670), PADRAO),
    'caixa-rachada': ((193, 598, 270, 670), PADRAO),
    'caixa-quebrada': ((353, 598, 437, 672), PADRAO),
    'barril': ((590, 600, 647, 670), PADRAO),
    'pedra': ((786, 598, 860, 672), FINO),
    'conteiner-azul': ((18, 678, 157, 752), PADRAO),
    'conteiner-vermelho': ((168, 678, 307, 752), PADRAO),
    'sacos': ((16, 762, 102, 822), PADRAO),
    'cratera': ((216, 766, 297, 818), PADRAO),
    'arbusto': ((1208, 598, 1292, 682), PADRAO),
    'arbusto-grande': ((1253, 663, 1347, 752), PADRAO),
    'pinheiro': ((1438, 598, 1527, 738), PADRAO),
    'palmeira': ((1353, 598, 1442, 752), PADRAO),
    'moita': ((958, 752, 1032, 818), PADRAO),
    'soldado-azul': ((22, 946, 104, 1014), PADRAO),
    'soldado-vermelho': ((126, 946, 210, 1014), PADRAO),
    'joystick': ((670, 895, 778, 1003), PADRAO),
    'botao-tiro': ((782, 893, 891, 1004), PADRAO),
}
# A explosão crescendo, 6 quadros (linha das balas).
for i, c in enumerate([(618, 494, 692, 562), (712, 492, 802, 570), (798, 466, 892, 582),
                       (896, 452, 1002, 592), (1018, 447, 1152, 597), (1158, 443, 1318, 600)]):
    SPRITES[f'explosao-{i}'] = (c, PADRAO)


def varinha(caixa, passo, teto, im=None):
    im = im or atlas.crop(caixa)
    w, h = im.size
    px = im.load()
    fundo = [[False] * w for _ in range(h)]
    borda = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    pilha = []
    for x, y in borda:
        fundo[y][x] = True
        pilha.append((x, y, px[x, y][:3]))   # a cor da semente segura o degradê (teto)
    while pilha:
        x, y, ref = pilha.pop()
        c = px[x, y][:3]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not fundo[ny][nx]:
                n = px[nx, ny][:3]
                if (max(abs(n[i] - c[i]) for i in range(3)) <= passo
                        and max(abs(n[i] - ref[i]) for i in range(3)) <= teto):
                    fundo[ny][nx] = True
                    pilha.append((nx, ny, ref))

    # Pedaços de sprite vizinho que entraram na caixa: pequenos e na borda. Saem.
    visto = [[False] * w for _ in range(h)]
    pedacos = []
    for y0 in range(h):
        for x0 in range(w):
            if fundo[y0][x0] or visto[y0][x0]:
                continue
            p, pilha = [], [(x0, y0)]
            visto[y0][x0] = True
            while pilha:
                x, y = pilha.pop()
                p.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not fundo[ny][nx] and not visto[ny][nx]:
                        visto[ny][nx] = True
                        pilha.append((nx, ny))
            pedacos.append(p)
    maior = max(len(p) for p in pedacos)
    for p in pedacos:
        if len(p) < maior * 0.04 and any(x in (0, w - 1) or y in (0, h - 1) for x, y in p):
            for x, y in p:
                fundo[y][x] = True

    out = Image.new('RGBA', (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            if fundo[y][x]:
                continue
            r, g, b, _ = px[x, y]
            # borda meio transparente: sem serrilhado contra o chão do jogo
            viz = sum(fundo[ny][nx] for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                      if 0 <= nx < w and 0 <= ny < h)
            o[x, y] = (r, g, b, 255 if viz == 0 else 150)
    return out.crop(out.getbbox())




# Tanque de lado: caixa, onde acaba o cano (x), a faixa de altura do cano e o
# canto de cima à esquerda que é fundo colado na torre (x, y relativos à caixa).
TANQUES = {
    'tanque-azul': ((712, 4, 818, 116), 805, (35, 70), (28, 34)),
    'tanque-vermelho': ((712, 116, 818, 228), 805, (145, 180), (28, 34)),
    'tanque-verde': ((712, 226, 830, 338), 813, (250, 288), (28, 30), True),
    'tanque-amarelo': ((712, 338, 830, 448), 813, (356, 394), (20, 22), True),
}


def tanque(caixa, ponta, faixa, canto, respingo=False):
    """A ponta do cano encosta no clarão do tiro: a caixa vai até depois da ponta,
    e o clarão (amarelo/laranja, pouco azul) sai pela cor — só na faixa do cano e
    à direita dele, senão levava junto o casco do tanque amarelo."""
    x0, y0, _, _ = caixa
    im = atlas.crop(caixa)
    px = im.load()
    for y in range(im.height):
        no_cano = faixa[0] <= y0 + y <= faixa[1]
        for x in range(im.width):
            r, g, b, a = px[x, y]
            ax = x0 + x
            if no_cano and ax >= ponta - 2 and r > 170 and g > 110 and b < 150:
                px[x, y] = (0, 0, 0, 0)
            elif no_cano and ax >= ponta + 2 and r > 140 and b < 120:   # a borda laranja que sobra na boca
                px[x, y] = (0, 0, 0, 0)
            elif ax > ponta + 6 and no_cano:                             # depois da boca é tudo clarão
                px[x, y] = (0, 0, 0, 0)
            elif (respingo and faixa[0] <= y0 + y <= faixa[1] + 16 and ax >= ponta - 8
                  and r > 160 and g < 150 and b < 100):                 # respingo laranja no casco (não serve pro vermelho)
                px[x, y] = (0, 0, 0, 0)
            elif x < canto[0] and y < canto[1]:
                px[x, y] = (0, 0, 0, 0)
    return varinha(caixa, *FINO, im=im)


sprites = {n: varinha(c, *t) for n, (c, t) in SPRITES.items()}
sprites.update({n: tanque(*a) for n, a in TANQUES.items()})
for n, im in sprites.items():
    im.save(saida / f'{n}.webp', quality=90, method=6)

# Capa do tile (310x272, como as outras): chão de terra, os dois tanques se
# encarando e a explosão no meio.
W, H = 310, 272
capa = Image.new('RGBA', (W, H))
d = ImageDraw.Draw(capa)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(120 - 50 * t), int(84 - 40 * t), int(48 - 26 * t), 255))
cr = sprites['cratera'].resize((90, 58))
capa.alpha_composite(cr, (110, 180))
ex = sprites['explosao-5'].resize((150, 145))
capa.alpha_composite(ex, (80, 40))
az = sprites['tanque-azul'].resize((118, 136))
capa.alpha_composite(az, (4, 120))
vm = sprites['tanque-vermelho'].resize((118, 136)).transpose(Image.FLIP_LEFT_RIGHT)
capa.alpha_composite(vm, (W - 122, 120))
fonte = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', 46)
txt = 'Tanques'
tw = d.textlength(txt, font=fonte)
sombra = Image.new('RGBA', (W, H))
ImageDraw.Draw(sombra).text(((W - tw) / 2, H - 70), txt, font=fonte, fill=(0, 0, 0, 230))
capa.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(3)))
ImageDraw.Draw(capa).text(((W - tw) / 2, H - 72), txt, font=fonte, fill=(255, 255, 255, 255),
                          stroke_width=2, stroke_fill=(30, 20, 10, 255))
capa.convert('RGB').save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + capa em {saida}')
