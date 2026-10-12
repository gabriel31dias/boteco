# Prepara Galinhas Psicopatas a partir de duas imagens:
#   python3 -I scripts/preparar-galinhas.py <sprites.png> <arena.png>
#   sprites = "Sprite Sheet de Galinhas Caóticas e Gore Cartunesco (1).png" (1536x1024)
#   arena   = "Arena da Fazenda ao Pôr do Sol.png" (1672x941): o mapa (ver regras.js)
# A folha tem fundo meio transparente (alfa < 215) e sprites opacos: recorte
# pela ilha opaca (mesmo esquema de scripts/preparar-psicopatas.py).
# O cérebro e as explosões vêm de src/assets/psicopatas (o jogo importa de lá).
# ponytail: coordenadas fixas da folha; folha nova = medir de novo.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

OPACO = 215
raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/galinhas'
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


folha = Folha(sys.argv[1])

# cada galinha: quadros de andar (o 0 é o parado), 6 cabeças (a decepada voa com uma delas), o corpo e pedaços
GALINHAS = {
    'branco': {'anda': [(14, 5, 122, 139), (109, 11, 215, 139), (203, 10, 305, 138), (295, 10, 395, 138), (387, 10, 481, 140)],
               'cabeca': [(1130, 3, 1197, 90), (1206, 2, 1261, 81), (1267, 1, 1319, 80), (1324, 1, 1380, 81), (1386, 1, 1445, 81), (1457, 2, 1522, 83)],
               'corpo': (1095, 109, 1203, 159), 'resto': (1230, 105, 1346, 157)},
    'preto': {'anda': [(9, 158, 120, 289), (111, 164, 213, 292), (207, 169, 305, 292), (305, 162, 398, 295), (396, 170, 491, 297)],
              'cabeca': [(1128, 173, 1196, 263), (1205, 169, 1258, 248), (1264, 168, 1317, 251), (1323, 168, 1379, 250), (1384, 167, 1444, 252), (1450, 172, 1518, 257)],
              'corpo': (1087, 285, 1209, 321), 'resto': (1087, 285, 1209, 321)},
    'amarelo': {'anda': [(10, 317, 112, 463), (110, 324, 198, 464), (305, 330, 393, 470), (385, 331, 481, 468)],
                'cabeca': [(1127, 339, 1197, 423), (1206, 331, 1261, 413), (1269, 330, 1319, 410), (1323, 327, 1380, 413), (1386, 321, 1454, 410), (1457, 319, 1528, 414)],
                'corpo': (1110, 433, 1211, 501), 'resto': (1110, 433, 1211, 501)},
    'vermelho': {'anda': [(109, 501, 211, 630), (200, 503, 301, 630)],
                 'cabeca': [(1120, 513, 1195, 616), (1200, 501, 1251, 585), (1257, 498, 1310, 583), (1313, 496, 1374, 583), (1375, 503, 1442, 596), (1446, 503, 1517, 595)],
                 'corpo': (1075, 625, 1197, 680), 'resto': (1075, 625, 1197, 680)},
}
S = {}
for cor, g in GALINHAS.items():
    for i, c in enumerate(g['anda']):
        S[f'{cor}-anda-{i}'] = c
    for i, c in enumerate(g['cabeca']):
        S[f'{cor}-cabeca-{i}'] = c
    S[f'{cor}-corpo'] = g['corpo']
S.update({
    # pedaços (coxinha, osso, carne, olho): servem pra qualquer galinha
    **{f'pedaco-{i}': c for i, c in enumerate([
        (1400, 91, 1420, 118), (1408, 113, 1448, 154), (1369, 127, 1402, 154), (1234, 272, 1277, 317), (1359, 275, 1405, 315),
        (1416, 274, 1482, 308), (1493, 274, 1516, 306), (1298, 293, 1342, 316), (1222, 432, 1279, 481), (1282, 439, 1339, 471),
        (1349, 419, 1388, 449), (1360, 460, 1394, 483), (1233, 612, 1290, 668), (1294, 624, 1324, 671), (1328, 621, 1375, 670),
        (1377, 631, 1463, 668)])},
    'olho-0': (1481, 128, 1505, 153), 'olho-1': (1490, 639, 1516, 665),
    'coxa-grande': (1422, 417, 1469, 496),
    **{f'pena-{i}': c for i, c in enumerate([(1083, 404, 1106, 430), (1201, 426, 1224, 450), (1396, 443, 1418, 469), (1072, 473, 1088, 500)])},
    'estouro': (921, 677, 1042, 761), 'carcaca': (789, 694, 902, 759),
    # arcos de corte e sangue
    'corte-0': (25, 773, 105, 867), 'corte-1': (112, 775, 199, 868), 'corte-2': (215, 777, 318, 864), 'giro': (344, 783, 549, 857),
    **{f'jorro-{i}': c for i, c in enumerate([(587, 794, 680, 863), (707, 779, 803, 878), (821, 791, 886, 867), (1210, 684, 1255, 767),
                                               (1313, 683, 1358, 765), (1387, 704, 1423, 760), (1454, 684, 1495, 765)])},
    **{f'poca-{i}': c for i, c in enumerate([(1106, 779, 1190, 815), (1209, 783, 1340, 824), (1365, 775, 1465, 819), (1459, 801, 1521, 831),
                                              (1147, 834, 1248, 854), (1281, 821, 1375, 869), (1395, 836, 1510, 857), (1105, 879, 1183, 916), (1079, 715, 1192, 758)])},
    **{f'gota-{i}': c for i, c in enumerate([(1010, 780, 1027, 805), (1051, 784, 1068, 812), (1017, 805, 1039, 855), (1058, 827, 1087, 865)])},
    # armas
    'arma-cutelo': (13, 882, 78, 999), 'arma-facao': (71, 886, 121, 1011), 'arma-machete': (126, 876, 189, 1006),
    'arma-porrete': (192, 876, 259, 1002), 'arma-foice': (260, 905, 312, 1007), 'arma-forcado': (318, 863, 378, 1007),
    'arma-clava': (367, 880, 443, 1014), 'arma-frigideira': (435, 883, 515, 1008), 'arma-faca': (515, 870, 566, 1008),
    'arma-machado': (579, 895, 630, 1002), 'arma-machadinha': (632, 895, 695, 1005), 'arma-ossada': (705, 895, 765, 1005),
    'arma-adaga': (770, 896, 807, 1003), 'arma-marreta': (819, 895, 877, 1006), 'arma-osso': (868, 926, 913, 1007),
    # itens e cenário
    'ovo': (926, 879, 966, 929), 'ovo-rachado': (989, 878, 1033, 929), 'gema': (1051, 888, 1088, 927),
    'feno': (1199, 873, 1280, 923), 'caixa': (1352, 873, 1417, 947), 'barril': (1447, 867, 1505, 947),
    'feno-bloco': (924, 950, 994, 1009), 'cerca': (1353, 954, 1509, 1015),
})

sprites = {}
for nome, c in S.items():
    sprites[nome] = folha.recortar(*c)
sprites['espinhos'] = folha.recortar(1178, 931, 1323, 1008, dentro=lambda x, y: x >= 1178)
for nome, im in sprites.items():
    im.save(saida / f'{nome}.webp', quality=90, method=6)

# ---- fundo: a arena, no tamanho do mundo
arena = Image.open(sys.argv[2]).convert('RGB')
assert arena.size[0] == 1672, f'arena inesperada: {arena.size}'
arena.resize((1280, 720), Image.LANCZOS).save(saida / 'fundo.webp', quality=88, method=6)

# ---- capa do tile (310x272)
capa = ImageEnhance.Contrast(arena.crop((200, 0, 1472, 772)).resize((310, 188), Image.LANCZOS)).enhance(1.1)
c = Image.new('RGB', (310, 272), (24, 6, 4))
c.paste(capa, (0, 0))
gal = sprites['branco-anda-0']
gal = gal.resize((int(gal.width * 140 / gal.height), 140), Image.LANCZOS)
c.paste(gal, (4, 60), gal)
arma = sprites['arma-cutelo'].resize((50, 90), Image.LANCZOS).rotate(-20, expand=True)
c.paste(arma, (100, 70), arma)
cab = sprites['preto-cabeca-5']
cab = cab.resize((int(cab.width * 70 / cab.height), 70), Image.LANCZOS).rotate(25, expand=True)
c.paste(cab, (220, 80), cab)
d = ImageDraw.Draw(c)
d.rectangle((0, 196, 310, 272), fill=(24, 6, 4))
for txt, tam, y, cor in [('GALINHAS', 34, 194, (255, 255, 255)), ('PSICOPATAS', 38, 228, (225, 25, 30))]:
    f = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf', tam)
    w = d.textlength(txt, font=f)
    d.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
c.save(saida / 'capa.webp', quality=88, method=6)
print(f'{len(sprites)} sprites + fundo + capa em {saida}')
