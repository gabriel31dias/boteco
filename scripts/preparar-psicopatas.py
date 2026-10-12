# Prepara Ratos Psicopatas a partir de três imagens:
#   python3 -I scripts/preparar-psicopatas.py <mutantes.png> <cartunescos.png> <esgoto.png>
#   mutantes    = "Atlas de Sprites dos Ratos Mutantes (1).png" (1536x1024): ratos, armas, gore
#   cartunescos = "Atlas de Sprites de Ratos Cartunescos.png" (1536x1024): armas brancas, pedaços
#   esgoto      = "Sewer Tóxico dos Ratos Coroados.png" (1672x941): o mapa (ver regras.js)
# As folhas têm fundo meio transparente (alfa < 215) e sprites opacos: recorte
# pela ilha opaca. Os quadros de andar vêm colados dois a dois na folha: cada
# par é separado por uma linha de corte medida à mão (`CORTE`).
# ponytail: coordenadas fixas das folhas; folha nova = medir de novo.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

OPACO = 215
raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/psicopatas'
saida.mkdir(parents=True, exist_ok=True)


class Folha:
    def __init__(self, caminho):
        self.im = Image.open(caminho).convert('RGBA')
        assert self.im.size == (1536, 1024), f'folha inesperada: {self.im.size}'
        W, H = self.im.size
        a = self.im.getchannel('A').load()
        self.rot = rot = [[0] * W for _ in range(H)]
        n = 0
        for y0 in range(H):
            for x0 in range(W):
                if rot[y0][x0] or a[x0, y0] < OPACO:
                    continue
                n += 1
                pilha = [(x0, y0)]
                rot[y0][x0] = n
                while pilha:
                    x, y = pilha.pop()
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < W and 0 <= ny < H and not rot[ny][nx] and a[nx, ny] >= OPACO:
                            rot[ny][nx] = n
                            pilha.append((nx, ny))

    def recortar(self, x0, y0, x1, y1, junto=False, dentro=None):
        """Ilha principal da caixa (ou tudo opaco, `junto`). `dentro(x, y)` filtra o pixel."""
        conta = {}
        for y in range(y0, y1):
            for x in range(x0, x1):
                r = self.rot[y][x]
                if r and (dentro is None or dentro(x, y)):
                    conta[r] = conta.get(r, 0) + 1
        principal = max(conta, key=conta.get)
        out = Image.new('RGBA', (x1 - x0, y1 - y0))
        src, dst = self.im.load(), out.load()
        for y in range(y0, y1):
            for x in range(x0, x1):
                r = self.rot[y][x]
                if r and (junto or r == principal) and (dentro is None or dentro(x, y)):
                    cr, cg, cb, _ = src[x, y]
                    dst[x - x0, y - y0] = (cr, cg, cb, 255)
        return out.crop(out.getbbox())


def corte(pontos):
    """[(y_ate, x), ...] -> x da linha de corte na altura y."""
    def f(y):
        for ate, x in pontos:
            if y < ate:
                return x
        return pontos[-1][1]
    return f


def par(a, b, linha):
    """Dois quadros colados: a = esquerda da linha, b = direita."""
    return ((*a, lambda x, y: x < linha(y)), (*b, lambda x, y: x >= linha(y)))


mut = Folha(sys.argv[1])
car = Folha(sys.argv[2])

# --- quadros de andar (pares colados): a ilha inteira, dividida na linha de corte
MAG = corte([(85, 151), (97, 162), (120, 153), (999, 146)])
GOR = corte([(120, 948), (999, 944)])
GOR2 = corte([(999, 1009)])
BAN0 = corte([(285, 103), (999, 100)])
BAN = corte([(290, 161), (300, 155), (322, 142), (999, 150)])
OCU = corte([(287, 941), (308, 951), (318, 948), (336, 926), (999, 938)])

M = {}
(m0, m1) = par((99, 40, 215, 150), (99, 40, 215, 150), MAG)
M['magrelo-anda-0'], M['magrelo-anda-1'] = m0, m1
M['gordo-anda-0'] = (870, 40, 1012, 150, lambda x, y: x >= 878 and x < GOR(y))
M['gordo-anda-1'] = (870, 40, 1012, 150, lambda x, y: x >= GOR(y) and x < GOR2(y))
M['bandana-anda-0'] = (12, 228, 225, 345, lambda x, y: x >= BAN0(y) and x < BAN(y))
M['bandana-anda-1'] = (12, 228, 225, 345, lambda x, y: x >= BAN(y))
(o0, o1) = par((883, 236, 1003, 343), (883, 236, 1003, 343), OCU)
M['oculos-anda-0'], M['oculos-anda-1'] = o0, o1
# pulo, dor e morto: ilhas soltas
M.update({
    'magrelo-pulo': (388, 15, 465, 106), 'magrelo-dor': (466, 55, 551, 151), 'magrelo-morto': (624, 72, 749, 149),
    'gordo-pulo': (1148, 8, 1248, 118), 'gordo-dor': (1205, 46, 1331, 149), 'gordo-morto': (1421, 63, 1529, 148),
    'bandana-pulo': (372, 196, 491, 316), 'bandana-dor': (443, 252, 563, 345), 'bandana-morto': (568, 261, 762, 344),
    'oculos-pulo': (1119, 203, 1240, 322), 'oculos-dor': (1243, 268, 1334, 345), 'oculos-morto': (1438, 273, 1530, 343),
    # retratos do placar (só o quadradinho da cara)
    'magrelo-cara': (24, 829, 86, 892, True), 'gordo-cara': (199, 827, 262, 895, True),
    'bandana-cara': (382, 827, 445, 894, True), 'oculos-cara': (560, 827, 623, 895, True),
    # armas de fogo (por cima do rato, giram com a mira)
    'arma-pistola': (24, 428, 93, 470), 'arma-smg': (108, 424, 173, 476), 'arma-escopeta': (191, 428, 272, 463),
    'arma-ak': (284, 421, 374, 468), 'arma-sniper': (384, 409, 511, 469),
    # efeitos e itens
    'clarao-0': (85, 487, 148, 526), 'clarao-1': (173, 483, 251, 527),
    **{f'explosao-{i}': c for i, c in enumerate([(921, 578, 977, 632), (387, 558, 455, 622), (468, 565, 539, 626),
                                                  (555, 556, 643, 630), (656, 552, 757, 633)])},
    'fumaca-0': (921, 503, 998, 563), 'fumaca-1': (1012, 479, 1066, 576),
    'kit': (985, 829, 1032, 879), 'coroa': (1096, 815, 1149, 863), 'caveira': (845, 825, 886, 874),
    'balas': (903, 821, 962, 868), 'bomba': (443, 483, 484, 539), 'mina': (687, 497, 742, 529),
    'barril': (845, 703, 899, 783), 'barril-ferrugem': (15, 703, 76, 780),
    # gore
    'cerebro-0': (1111, 910, 1153, 943), 'olho': (975, 917, 1015, 956),
    'pedaco-0': (1037, 908, 1091, 950), 'pedaco-1': (1242, 915, 1287, 964), 'pedaco-2': (706, 933, 746, 989),
    'pedaco-3': (621, 931, 687, 1003), 'pedaco-4': (1067, 947, 1117, 1008), 'pedaco-5': (1164, 931, 1201, 966),
    'pedaco-6': (812, 923, 849, 963),
    'gota-0': (1356, 431, 1429, 466), 'gota-1': (1422, 488, 1447, 549), 'gota-2': (1322, 516, 1364, 567),
    'gota-3': (1082, 499, 1116, 547), 'gota-4': (1137, 513, 1172, 560),
})
C = {
    # armas brancas
    'branca-porrete': (1017, 526, 1093, 619), 'branca-frigideira': (927, 524, 1039, 572),
    'branca-faca': (790, 10, 831, 64, True), 'branca-motosserra': (1279, 942, 1334, 1000, True),
    'corte-0': (1168, 918, 1200, 978), 'corte-1': (1287, 889, 1351, 971),
    'cerebro-1': (525, 712, 575, 753), 'queijo': (228, 653, 290, 712), 'barril-caveira': (1422, 609, 1479, 697),
    **{f'pedaco-{7 + i}': c for i, c in enumerate([(589, 703, 641, 752), (640, 701, 689, 751), (685, 700, 747, 743),
                                                    (873, 777, 915, 813), (924, 774, 967, 813), (975, 776, 1010, 815),
                                                    (1019, 778, 1057, 817), (1070, 776, 1120, 818), (1135, 777, 1172, 812),
                                                    (1188, 779, 1221, 816), (1232, 771, 1293, 817), (1311, 769, 1386, 822)])},
    **{f'jorro-{i}': c for i, c in enumerate([(751, 688, 836, 763), (844, 702, 899, 766), (909, 710, 996, 765),
                                               (1007, 701, 1084, 765), (1114, 700, 1184, 758), (1208, 701, 1265, 766),
                                               (1294, 700, 1348, 760)])},
}

sprites = {}
for nome, c in M.items():
    if len(c) == 5 and callable(c[4]):
        sprites[nome] = mut.recortar(*c[:4], dentro=c[4])
    else:
        sprites[nome] = mut.recortar(*c)
for nome, c in C.items():
    sprites[nome] = car.recortar(*c)
for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo: o esgoto, no tamanho do mundo
esgoto = Image.open(sys.argv[3]).convert('RGB')
assert esgoto.size[0] == 1672, f'esgoto inesperado: {esgoto.size}'
fundo = esgoto.resize((1280, 720), Image.LANCZOS)
fundo.save(saida / 'fundo.webp', quality=88, method=6)

# ---- capa do tile (310x272)
capa = esgoto.crop((60, 0, 1612, 941)).resize((310, 188), Image.LANCZOS)
capa = ImageEnhance.Contrast(capa).enhance(1.15)
c = Image.new('RGB', (310, 272), (18, 8, 10))
c.paste(capa, (0, 0))
rato = sprites['bandana-anda-1']
k = 150 / rato.height
rato = rato.resize((int(rato.width * k), 150), Image.LANCZOS)
c.paste(rato, (6, 66), rato)
cerebro = sprites['cerebro-1'].resize((54, 44), Image.LANCZOS)
c.paste(cerebro, (240, 120), cerebro)
d = ImageDraw.Draw(c)
d.rectangle((0, 196, 310, 272), fill=(18, 8, 10))
for i, (txt, tam, y, cor) in enumerate([('RATOS', 36, 194, (255, 255, 255)), ('PSICOPATAS', 38, 228, (225, 25, 30))]):
    f = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', tam)
    w = d.textlength(txt, font=f)
    d.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
c.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + capa em {saida}')
