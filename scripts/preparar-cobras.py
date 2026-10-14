# Prepara Cobras do Templo a partir de duas imagens:
#   python3 -I scripts/preparar-cobras.py <folha.png> <templo.png>
#   folha  = "Folha de sprites de cobras coloridas.png" (1536x1024, 10 linhas de cor, vista de cima)
#   templo = "Serpente Neon no Templo da Selva.png" (941x1672): o mapa (ver regras.js)
# Por linha da folha: a cabeça (com e sem língua, as duas viradas pra cima) e um gomo do corpo.
# O templo vem com maçã, moeda e uma cobra pintados: os ladrilhos deles são
# trocados por ladrilhos vazios do próprio templo. As pedras ficam (são obstáculo).
# ponytail: cortes por vale de transparência numa janela fixa; folha nova = medir de novo.
import random
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/cobras'
saida.mkdir(parents=True, exist_ok=True)

folha = Image.open(sys.argv[1]).convert('RGBA')
assert folha.size == (1536, 1024), f'folha inesperada: {folha.size}'
A = folha.getchannel('A').load()
LINHAS = ['verde', 'vermelho', 'azul', 'amarelo', 'rosa', 'roxo', 'preto', 'branco', 'laranja', 'arcoiris']
CORES = ['verde', 'vermelho', 'azul', 'amarelo', 'rosa', 'roxo', 'preto', 'arcoiris']   # as do lobby (server/jogos.js)
# faixa (y) de cada linha: as cabeças da 1ª coluna se encostam pela língua, então corta fixo
FAIXAS = [(12, 108), (106, 202), (196, 296), (294, 394), (390, 490), (488, 592), (588, 692), (688, 788), (784, 886), (884, 1002)]


def coluna(x, y0, y1):
    return sum(1 for y in range(y0, y1) if A[x, y] >= 128)


def vale(a, b, y0, y1):
    return min(range(a, b), key=lambda x: coluna(x, y0, y1))


def recortar(x0, y0, x1, y1):
    """Maior ilha (alfa >= 100) da caixa, com o alfa original."""
    w, h = x1 - x0, y1 - y0
    vis = [[0] * w for _ in range(h)]
    melhor = []
    for sy in range(h):
        for sx in range(w):
            if vis[sy][sx] or A[x0 + sx, y0 + sy] < 100:
                continue
            ilha, pilha = [], [(sx, sy)]
            vis[sy][sx] = 1
            while pilha:
                x, y = pilha.pop()
                ilha.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not vis[ny][nx] and A[x0 + nx, y0 + ny] >= 100:
                        vis[ny][nx] = 1
                        pilha.append((nx, ny))
            if len(ilha) > len(melhor):
                melhor = ilha
    out = Image.new('RGBA', (w, h))
    src, dst = folha.load(), out.load()
    dentro = set(melhor)
    for x, y in melhor:
        dst[x, y] = src[x0 + x, y0 + y]
    # borda macia: vizinhos de alfa baixo da ilha também entram
    for x, y in melhor:
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dentro:
                dst[nx, ny] = src[x0 + nx, y0 + ny]
    return out.crop(out.getbbox())


sprites = {}
for r, cor in enumerate(LINHAS):
    if cor not in CORES:
        continue
    y0, y1 = FAIXAS[r]
    # cabeça 0: de cima, olhando pra cima, com a língua; cabeça 1: sem língua (na folha olha pra baixo)
    sprites[f'{cor}-cabeca-0'] = recortar(28, y0, 118, y1)
    corte = vale(186, 216, y0 + 10, y1 - 10)
    sprites[f'{cor}-cabeca-1'] = recortar(132, y0, corte + 1, y1).rotate(180, expand=True)
    ini = corte + 1
    while coluna(ini, y0, y1) <= 3:
        ini += 1
    # o gomo encosta no vizinho: recorta oval pela altura dele
    meio = ini + 24
    ys = [(y0 + y1) // 2] * 2                     # trecho opaco contínuo do meio da linha
    while A[meio, ys[0] - 1] >= 128:
        ys[0] -= 1
    while A[meio, ys[1] + 1] >= 128:
        ys[1] += 1
    ry = (ys[-1] - ys[0]) / 2
    cy, cx, rx = (ys[0] + ys[-1]) / 2, ini + min(ry, 26), min(ry, 26)
    g = Image.new('RGBA', (int(rx * 2) + 2, int(ry * 2) + 2))
    g.paste(folha.crop((int(cx - rx), int(cy - ry), int(cx - rx) + g.width, int(cy - ry) + g.height)))
    m = Image.new('L', g.size)
    ImageDraw.Draw(m).ellipse((0, 0, g.width - 1, g.height - 1), fill=255)
    g.putalpha(ImageChops.darker(g.getchannel('A'), m.filter(ImageFilter.GaussianBlur(1.2))))
    sprites[f'{cor}-gomo'] = g

for velho in saida.glob('*-cabeca-*.webp'):
    velho.unlink()
for velho in saida.glob('*-rosca.webp'):
    velho.unlink()
for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo: o templo em 720x1280, sem os itens pintados
templo = Image.open(sys.argv[2]).convert('RGB')
assert templo.size == (941, 1672), f'templo inesperado: {templo.size}'
GX = [85, 182, 279, 376, 473, 570, 667, 764, 861]          # linhas do piso (px do templo)
GY = [272, 369, 466, 563, 660, 757, 854, 951, 1048, 1145, 1242, 1339, 1436]
SUJOS = [(1, 1), (6, 1), (4, 2), (2, 4), (7, 5), (2, 6), (3, 6), (4, 6), (5, 6), (6, 6), (2, 7), (6, 7),
         (1, 9), (6, 9), (7, 10), (1, 11), (3, 11)]
LIMPOS = [(0, 0), (2, 1), (3, 2), (5, 3), (1, 5), (4, 4), (5, 8), (3, 9), (4, 10), (6, 11), (0, 7)]
rnd = random.Random(7)
for cx, cy in SUJOS:
    sx, sy = rnd.choice(LIMPOS)
    t = templo.crop((GX[sx], GY[sy], GX[sx + 1], GY[sy + 1]))
    if rnd.random() < 0.5:
        t = t.transpose(Image.FLIP_LEFT_RIGHT)
    t = t.resize((GX[cx + 1] - GX[cx], GY[cy + 1] - GY[cy]))
    templo.paste(t, (GX[cx], GY[cy]))
fundo = templo.resize((720, 1280), Image.LANCZOS)
fundo.save(saida / 'fundo.webp', quality=88, method=6)

# ---- capa do tile (310x272)
c = Image.new('RGB', (310, 272), (6, 14, 8))
topo = ImageEnhance.Contrast(templo.crop((0, 0, 941, 826)).resize((310, 272), Image.LANCZOS)).enhance(1.1)
c.paste(topo, (0, 0))
import math
for k, cor in enumerate(['verde', 'vermelho', 'azul', 'amarelo']):
    # de cima: cobra subindo, corpo ondulando pra baixo
    x0, y0 = 48 + k * 72, 92 + (k % 2) * 16
    gg = sprites[f'{cor}-gomo'].resize((26, 26), Image.LANCZOS)
    for s_ in range(9, 0, -1):
        c.paste(gg, (int(x0 - 13 + math.sin(s_ * 0.8 + k) * 9), y0 + s_ * 11), gg)
    h = sprites[f'{cor}-cabeca-0']
    h = h.resize((int(h.width * 50 / h.height), 50), Image.LANCZOS)
    c.paste(h, (x0 - h.width // 2, y0 - 34), h)
d = ImageDraw.Draw(c)
d.rectangle((0, 196, 310, 272), fill=(6, 14, 8))
for txt, tam, y, cor in [('COBRAS', 36, 192, (255, 255, 255)), ('DO TEMPLO', 34, 228, (255, 196, 40))]:
    f = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', tam)
    w = d.textlength(txt, font=f)
    d.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
c.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + capa em {saida}')
