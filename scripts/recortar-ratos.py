# Recorta os sprites do "Sprite Sheet de Ratos Guerreiros e Tiles.png" para
# src/assets/ratos e monta o fundo e a capa a partir da "Arena de Ratos em
# Combate Caótico.png". Roda uma vez:
#   python3 -I scripts/recortar-ratos.py <folha.png> <arena.png>
# ponytail: coordenadas fixas da folha; folha nova = medir de novo.
#
# A folha tem o fundo meio transparente (alfa 30–160) e os sprites opacos
# (alfa ~250): o recorte é pelo alfa. Cada sprite é a "ilha" opaca que contém
# o centro da caixa — assim o rato vizinho encostado não vem junto. Caixa com
# `junto=True` pega tudo opaco dentro dela (quadros que a folha colou).
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

folha = Image.open(sys.argv[1]).convert('RGBA')
arena = Image.open(sys.argv[2]).convert('RGB')
assert folha.size == (1536, 1024), f'folha inesperada: {folha.size}'
assert arena.size == (1672, 940), f'arena inesperada: {arena.size}'
saida = Path(__file__).resolve().parent.parent / 'src/assets/ratos'
saida.mkdir(parents=True, exist_ok=True)

OPACO = 215

# nome: (x0, y0, x1, y1[, junto])
S = {
    # Zé Boné (azul, fuzil)
    'azul-parado': (20, 7, 137, 134), 'azul-mira': (153, 7, 285, 132), 'azul-tiro': (476, 6, 638, 133),
    'azul-corre-0': (939, 7, 1049, 131), 'azul-corre-1': (1072, 5, 1186, 130), 'azul-corre-2': (911, 133, 1033, 272),
    'azul-pulo': (1190, 131, 1297, 274), 'azul-dor': (1308, 4, 1411, 116), 'azul-morto': (1435, 10, 1521, 130),
    # Bolota (vermelho, escopeta) — os 4 primeiros quadros estão colados na folha
    'vermelho-parado': (7, 136, 150, 281, True), 'vermelho-mira': (152, 136, 301, 281, True),
    'vermelho-tiro': (470, 133, 630, 284, True), 'vermelho-dor': (1038, 140, 1173, 271),
    'vermelho-morto': (1295, 140, 1518, 266, True),
    # Sargento (verde, sniper)
    'verde-parado': (14, 282, 142, 427), 'verde-mira': (150, 282, 289, 424), 'verde-tiro': (466, 284, 650, 429),
    'verde-corre-0': (292, 286, 467, 426), 'verde-corre-1': (777, 283, 912, 425),
    # Punk (roxo, metralhadora)
    'roxo-parado': (927, 288, 1046, 430), 'roxo-tiro': (1052, 282, 1185, 430), 'roxo-corre-0': (1191, 286, 1297, 424),
    'roxo-corre-1': (1309, 279, 1418, 425), 'roxo-morto': (1417, 290, 1527, 421),
    # balas
    'bala-azul': (335, 594, 435, 626), 'bala-vermelho': (781, 447, 815, 474), 'bala-verde': (1292, 496, 1407, 529),
    'bala-roxo': (1265, 448, 1313, 466),
    # clarões do cano e explosão
    **{f'clarao-{i}': c for i, c in enumerate([(829, 446, 858, 474), (878, 443, 918, 476), (940, 441, 978, 478),
                                                (1006, 441, 1073, 480), (1099, 435, 1169, 482)])},
    **{f'explosao-{i}': c for i, c in enumerate([(774, 557, 849, 625), (879, 552, 975, 637), (989, 553, 1071, 635),
                                                  (1085, 558, 1150, 631), (1165, 555, 1234, 633), (1248, 554, 1304, 633)])},
    **{f'poeira-{i}': c for i, c in enumerate([(758, 646, 820, 689), (832, 648, 905, 689), (920, 649, 991, 689)])},
    # itens e cenário
    'queijo': (150, 637, 208, 686), 'queijao': (662, 625, 743, 691), 'kit': (74, 636, 128, 688),
    'barril': (526, 635, 573, 698), 'granada': (17, 562, 63, 620), 'bomba': (153, 556, 202, 631),
    'caixa': (95, 697, 182, 754), 'caixa-alta': (15, 705, 81, 791), 'caixa-p': (195, 696, 253, 753),
    'plataforma': (451, 708, 626, 767), 'plataforma-2': (637, 705, 785, 768),
    'bloco': (324, 908, 424, 1008), 'pneus': (15, 797, 86, 871), 'bandeirinhas': (1019, 841, 1077, 871),
}

# ---- ilhas opacas (componentes conexos), uma vez
W, H = folha.size
alfa = folha.getchannel('A').load()
rotulo = [[0] * W for _ in range(H)]
n = 0
for y0 in range(H):
    for x0 in range(W):
        if rotulo[y0][x0] or alfa[x0, y0] < OPACO:
            continue
        n += 1
        pilha = [(x0, y0)]
        rotulo[y0][x0] = n
        while pilha:
            x, y = pilha.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and not rotulo[ny][nx] and alfa[nx, ny] >= OPACO:
                    rotulo[ny][nx] = n
                    pilha.append((nx, ny))


def recortar(x0, y0, x1, y1, junto=False):
    # a ilha que mais aparece na caixa é o sprite (o vizinho encostado entra só de raspão)
    conta = {}
    for y in range(y0, y1):
        for x in range(x0, x1):
            r = rotulo[y][x]
            if r:
                conta[r] = conta.get(r, 0) + 1
    principal = max(conta, key=conta.get)
    out = Image.new('RGBA', (x1 - x0, y1 - y0))
    src, dst = folha.load(), out.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r = rotulo[y][x]
            if r and (junto or r == principal):
                cr, cg, cb, _ = src[x, y]
                dst[x - x0, y - y0] = (cr, cg, cb, 255)
    # borda: 1px meio transparente, sem serrilhado
    return out.crop(out.getbbox())


sprites = {nome: recortar(*c) for nome, c in S.items()}
for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo: o céu e as torres da arena (sem rato nem placar), esticado e suave
ceu = arena.crop((690, 140, 1040, 348)).resize((1280, 761), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
fundo = Image.new('RGB', (1280, 720), (24, 18, 30))
fundo.paste(ceu, (0, 0))
escuro = Image.new('RGBA', (1280, 720))
d = ImageDraw.Draw(escuro)
for y in range(720):
    k = max(0.0, (y - 260) / 460)
    d.line([(0, y), (1280, y)], fill=(20, 12, 24, int(40 + 190 * min(1, k))))
fundo = Image.alpha_composite(fundo.convert('RGBA'), escuro).convert('RGB')
fundo.save(saida / 'fundo.webp', quality=86, method=6)

# ---- capa do tile (310x272): pedaço da arena com os ratos, e o nome
capa = arena.crop((150, 105, 1550, 935)).resize((310, 214), Image.LANCZOS)
c = Image.new('RGB', (310, 272), (20, 12, 24))
c.paste(capa, (0, 0))
dc = ImageDraw.Draw(c)
txt = 'Ratos em Guerra'
fonte = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', 34)
tw = dc.textlength(txt, font=fonte)
dc.rectangle((0, 214, 310, 272), fill=(20, 12, 24))
dc.text(((310 - tw) / 2, 220), txt, font=fonte, fill=(255, 214, 60), stroke_width=3, stroke_fill=(40, 10, 10))
c.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + capa em {saida}')
