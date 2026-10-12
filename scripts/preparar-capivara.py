# Prepara a Capivara Pistola a partir do "Pacote de Sprites Tropicais do
# Capivara.png" (1536x1024): sprites com fundo meio transparente (alfa < 215)
# — recorte pelo alfa, ilha por ilha. O mapa NÃO vem de imagem: é montado no
# jogo com estes sprites (ver src/games/capivara/regras.js, MAPA).
#   python3 -I scripts/preparar-capivara.py <sprites.png>
# ponytail: coordenadas fixas da folha; folha nova = medir de novo.
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

folha = Image.open(sys.argv[1]).convert('RGBA')
assert folha.size == (1536, 1024)
raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/capivara'
saida.mkdir(parents=True, exist_ok=True)
random.seed(3)

# ------------------------------------------------------------ sprites

OPACO = 215
FW, FH = folha.size
alfa = folha.getchannel('A').load()
rotulo = [[0] * FW for _ in range(FH)]
k = 0
for y0 in range(FH):
    for x0 in range(FW):
        if rotulo[y0][x0] or alfa[x0, y0] < OPACO:
            continue
        k += 1
        pilha = [(x0, y0)]
        rotulo[y0][x0] = k
        while pilha:
            x, y = pilha.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < FW and 0 <= ny < FH and not rotulo[ny][nx] and alfa[nx, ny] >= OPACO:
                    rotulo[ny][nx] = k
                    pilha.append((nx, ny))


def recortar(x0, y0, x1, y1, junto=False):
    conta = {}
    for y in range(y0, y1):
        for x in range(x0, x1):
            r = rotulo[y][x]
            if r: conta[r] = conta.get(r, 0) + 1
    principal = max(conta, key=conta.get)
    out = Image.new('RGBA', (x1 - x0, y1 - y0))
    src, dst = folha.load(), out.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r = rotulo[y][x]
            if r and (junto or r == principal):
                cr, cg, cb, _ = src[x, y]
                dst[x - x0, y - y0] = (cr, cg, cb, 255)
    return out.crop(out.getbbox())


S = {
    # bandana / frigideira (vermelho)
    **{f'vermelho-anda-{i}': c for i, c in enumerate([(10, 4, 148, 121), (159, 7, 294, 119), (301, 7, 431, 118), (447, 8, 571, 120), (579, 9, 698, 119)])},
    'vermelho-ataque': (885, 4, 1010, 122), 'vermelho-morto': (1156, 15, 1300, 125), 'vermelho-festa': (1424, 14, 1533, 123),
    # óculos / pistola d'água (azul)
    **{f'azul-anda-{i}': c for i, c in enumerate([(8, 138, 151, 255), (158, 132, 310, 247), (314, 127, 479, 242), (1050, 130, 1154, 249), (1174, 131, 1293, 247)])},
    'azul-ataque': (720, 129, 860, 248), 'azul-morto': (1289, 176, 1422, 246), 'azul-festa': (1413, 135, 1532, 247),
    # capacete / coco (verde)
    **{f'verde-anda-{i}': c for i, c in enumerate([(19, 256, 153, 376), (335, 256, 481, 375), (720, 256, 836, 374), (887, 256, 1053, 376), (160, 256, 330, 377)])},
    'verde-ataque': (493, 255, 710, 374), 'verde-morto': (1288, 303, 1422, 375), 'verde-festa': (1408, 261, 1533, 376),
    # tutu / melancia (rosa)
    **{f'rosa-anda-{i}': c for i, c in enumerate([(17, 384, 157, 507), (342, 382, 481, 508), (884, 386, 1016, 504), (1028, 382, 1180, 508), (173, 383, 336, 508)])},
    'rosa-ataque': (716, 381, 872, 508), 'rosa-dor': (1182, 387, 1311, 503), 'rosa-morto': (1312, 436, 1424, 503), 'rosa-festa': (1415, 387, 1531, 501),
    # projéteis e itens
    'frigideira': (23, 518, 111, 604), 'coco': (136, 517, 214, 598), 'melancia': (242, 513, 322, 593),
    'fatia': (326, 518, 425, 592), 'banana': (432, 525, 519, 591), 'pimenta': (518, 518, 577, 591),
    'peixe': (592, 515, 683, 594), 'galinha': (687, 512, 787, 601), 'bomba': (801, 501, 876, 591),
    'caixa': (1290, 519, 1362, 596), 'barril': (1375, 512, 1439, 601), 'cone': (1103, 510, 1182, 604),
    'jato': (600, 150, 735, 220), 'respingo-0': (27, 609, 123, 684), 'respingo-1': (168, 619, 292, 686),
    'poeira': (309, 608, 393, 687),
    **{f'explosao-{i}': c for i, c in enumerate([(405, 606, 527, 691), (540, 607, 652, 690), (671, 608, 770, 689)])},
    'estrela': (790, 609, 841, 658), 'fogo': (927, 606, 1030, 670),
    # cenário (o mapa é montado com eles)
    'palmeira': (1085, 686, 1190, 884), 'palmeira-2': (275, 760, 400, 900),
    'arbusto': (872, 698, 929, 751), 'moita': (1280, 768, 1340, 840), 'moita-2': (1340, 768, 1400, 840),
    'moitinha': (530, 969, 616, 1014), 'arbusto-alto': (1243, 897, 1294, 970),
    'pedra': (300, 950, 400, 1016), 'pedra-bloco': (1115, 886, 1174, 965),
    'muro': (1308, 845, 1396, 893), 'caixa-alta': (400, 770, 506, 882),
    'cabana': (1408, 760, 1532, 840), 'cabana-grande': (795, 768, 962, 906),
    'guarda-sol': (1138, 768, 1268, 960), 'guarda-sol-p': (1230, 826, 1292, 856),
    'bandeira-v': (1198, 688, 1266, 762), 'bandeira-a': (1268, 688, 1340, 762),
    'lagoa': (626, 966, 822, 1018), 'pneu': (1198, 518, 1274, 596),
}
JUNTO = {'jato', 'respingo-0', 'respingo-1', 'cabana-grande', 'lagoa', 'muro', 'caixa-alta'}
for nome, c in S.items():
    recortar(*c, junto=nome in JUNTO).save(saida / f'{nome}.webp', quality=90, method=6)

def tirar(nome, fora):
    """Apaga do sprite os pixels que são do vizinho grudado (pela cor/posição)
    e depois fica só com o maior pedaço inteiro (some o que sobrou solto)."""
    im = Image.open(saida / f'{nome}.webp').convert('RGBA')
    px = im.load()
    W, H = im.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a and fora(x / W, y / H, r, g, b): px[x, y] = (0, 0, 0, 0)
    visto, maior = set(), set()
    for y0 in range(H):
        for x0 in range(W):
            if px[x0, y0][3] < 40 or (x0, y0) in visto: continue
            comp, pilha = set(), [(x0, y0)]
            visto.add((x0, y0))
            while pilha:
                x, y = pilha.pop(); comp.add((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in visto and px[nx, ny][3] >= 40:
                        visto.add((nx, ny)); pilha.append((nx, ny))
            if len(comp) > len(maior): maior = comp
    for y in range(H):
        for x in range(W):
            if (x, y) not in maior: px[x, y] = (0, 0, 0, 0)
    im.crop(im.getbbox()).save(saida / f'{nome}.webp', quality=90, method=6)


vermelho_branco = lambda r, g, b: (r > 160 and g < 130 and b < 130 and r > g + 50) or (r > 200 and g > 170 and b > 170)
# palmeira: some o guarda-sol (lado direito, vermelho/branco) e o poste de madeira da esquerda
tirar('palmeira', lambda fx, fy, r, g, b: (fx > 0.5 and vermelho_branco(r, g, b)) or (fx < 0.14 and fy < 0.85) or (fx > 0.55 and 0.42 < fy < 0.75))
tirar('palmeira-2', lambda fx, fy, r, g, b: fy > 0.78 and fx < 0.75 and not (g > r and g > b))
# guarda-sol: some a palmeira (esquerda) e a moita/pedra de baixo, fica só copa + haste
tirar('guarda-sol', lambda fx, fy, r, g, b: fx < 0.1 or fy > 0.52)   # o cabo o jogo desenha

# capa (310x272): praia desenhada (água, areia) com as capivaras e o nome
W, H = 310, 272
c = Image.new('RGBA', (W, H), (30, 140, 200, 255))
d = ImageDraw.Draw(c)
for y in range(H):
    d.line([(0, y), (W, y)], fill=(40 + y // 8, 150 + y // 10, 210, 255))
d.rounded_rectangle((18, 22, W - 18, 205), radius=50, fill=(232, 190, 120, 255), outline=(255, 255, 255, 200), width=4)
for _ in range(260):
    x, y = random.uniform(30, W - 30), random.uniform(32, 195)
    d.point((x, y), fill=(200, 150, 90, 255))
for nome, x, y in (('palmeira', 4, 0), ('palmeira', 250, 10)):
    sp = Image.open(saida / f'{nome}.webp').convert('RGBA'); sp.thumbnail((70, 110)); c.alpha_composite(sp, (x, y))
for nome, x, y in (('vermelho-anda-1', 30, 70), ('azul-ataque', 180, 40), ('verde-ataque', 70, 115), ('rosa-anda-0', 190, 110)):
    sp = Image.open(saida / f'{nome}.webp').convert('RGBA'); sp.thumbnail((92, 92)); c.alpha_composite(sp, (x, y))
c = c.convert('RGB')
d = ImageDraw.Draw(c)
d.rectangle((0, 210, W, H), fill=(14, 60, 40))
fonte = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', 32)
txt = 'Capivara Pistola'
tw = d.textlength(txt, font=fonte)
d.text(((W - tw) / 2, 218), txt, font=fonte, fill=(255, 214, 60), stroke_width=3, stroke_fill=(20, 60, 30))
c.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(S)} sprites e capa em {saida}')
