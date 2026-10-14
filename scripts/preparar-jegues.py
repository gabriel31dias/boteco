# Prepara a Corrida de Jegues a partir da folha de sprites:
#   python3 scripts/preparar-jegues.py "<Imagem do ChatGPT 30 de set. de 2026, 09_15_26.png>"
#   folha 1536x1024 com alfa: 5 jegues (correndo, tombo, parado, caras), efeitos, cenário, público, UI.
# Precisa de numpy e opencv-contrib (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-contrib-python-headless
# ponytail: caixas medidas nesta imagem; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/jegues'
saida.mkdir(parents=True, exist_ok=True)
folha = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
assert folha.shape[:2] == (1024, 1536) and folha.shape[2] == 4, f'folha inesperada: {folha.shape}'


# pedaços do desenho na folha inteira (alfa alto): um recorte fica com os pedaços cujo centro cai
# dentro da caixa, então caixas que se sobrepõem (quadros de corrida colados) não puxam o vizinho
ROTULOS = {}


def pedacos(limiar):
    if limiar not in ROTULOS:
        m = (folha[..., 3] >= limiar).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        ROTULOS[limiar] = cv2.connectedComponentsWithStats(m)
    return ROTULOS[limiar]


def corte(x0, y0, x1, y1, nome, junto=False, limiar=200, folga=7, margem=24):
    """Recorta o desenho principal (o maior pedaço) ou todos os pedaços (junto) da caixa,
    com a borda macia do alfa original em volta (poeira, pelo)."""
    _, lab, st, cen = pedacos(limiar)
    dentro = [i for i in range(1, len(st)) if st[i, 4] > 25 and x0 <= cen[i][0] < x1 and y0 <= cen[i][1] < y1]
    if not dentro:
        raise SystemExit(f'{nome}: nada na caixa')
    manter = dentro if junto else [max(dentro, key=lambda i: st[i, 4])]
    X0, Y0 = max(0, x0 - margem), max(0, y0 - margem)
    X1, Y1 = min(folha.shape[1], x1 + margem), min(folha.shape[0], y1 + margem)
    p = folha[Y0:Y1, X0:X1].copy()
    mask = np.isin(lab[Y0:Y1, X0:X1], manter).astype(np.uint8)
    mask = cv2.dilate(mask, np.ones((folga, folga), np.uint8))
    mask = cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)
    p[..., 3] = (p[..., 3] * mask).astype(np.uint8)
    ys, xs = np.where(p[..., 3] > 8)
    cv2.imwrite(str(saida / f'{nome}.webp'), p[ys.min():ys.max() + 1, xs.min():xs.max() + 1], [cv2.IMWRITE_WEBP_QUALITY, 92])


# ---- os 5 jegues: [correndo...], tombo, [parado...], [caras: língua, normal, cansado, tonto]
JEGUES = {
    'pepano': dict(y=(0, 146), corre=[140, 243, 336, 431, 509, 584, 689], tombo=(667, 900), parado=[(911, 990), (1039, 1124)],
                   caras=[(1137, 1250), (1265, 1340), (1352, 1432), (1434, 1520)]),
    'costelinha': dict(y=(138, 268), corre=[159, 256, 367, 450, 577, 698], tombo=(678, 917), parado=[(920, 1013), (1032, 1130)],
                       caras=[(1146, 1236), (1258, 1354), (1358, 1448), (1449, 1528)]),
    'misere': dict(y=(262, 394), corre=[159, 256, 359, 444, 548, 657], tombo=(656, 918), parado=[(922, 1016), (1040, 1128)],
                   caras=[(1160, 1250), (1258, 1346), (1354, 1432), (1436, 1526)]),
    'relampago': dict(y=(384, 540), corre=[148, 260, 366, 491, 607, 713], tombo=(697, 929), parado=[(927, 1026), (1033, 1130)],
                      caras=[(1146, 1238), (1254, 1342), (1346, 1442), (1437, 1526)]),
    'jerimum': dict(y=(533, 668), corre=[150, 269, 388, 491, 642], tombo=(632, 910), parado=[(903, 1019), (1021, 1122)],
                    caras=[(1132, 1254), (1253, 1350), (1356, 1448), (1436, 1528)]),
}
for nome, j in JEGUES.items():
    y0, y1 = j['y']
    c = j['corre']
    for k in range(len(c) - 1):
        corte(c[k], y0, c[k + 1], y1, f'{nome}-corre-{k}', margem=40)
    corte(j['tombo'][0], y0, j['tombo'][1], y1, f'{nome}-tombo', junto=True, limiar=60, folga=3, margem=0)
    for k, (a, b) in enumerate(j['parado']):
        corte(a, y0, b, y1, f'{nome}-parado-{k}')
    for k, (a, b) in enumerate(j['caras']):
        corte(a, y0, b, y1, f'{nome}-cara-{k}', junto=k == 3)

# ---- efeitos de corrida
for k, c in enumerate([(165, 700, 240, 758), (240, 692, 325, 758), (325, 682, 420, 758), (418, 680, 536, 758), (536, 668, 650, 756)]):
    corte(*c, f'poeira-{k}', junto=True, limiar=60, folga=3)
for k, c in enumerate([(196, 762, 240, 798), (243, 762, 287, 798), (289, 762, 336, 798), (340, 762, 390, 798), (400, 762, 442, 798), (450, 762, 498, 798)]):
    corte(*c, f'terra-{k}', junto=True, limiar=120, folga=3)
# ---- efeitos especiais
for nome, c, kw in [('confete', (880, 690, 1040, 806), dict(junto=True, limiar=120)), ('estouro', (1040, 688, 1140, 800), dict(junto=True, limiar=60, folga=3)),
                    ('estrelas', (1140, 696, 1248, 792), dict(junto=True)), ('anel', (1248, 702, 1345, 795), dict(junto=True, limiar=90)),
                    ('giro', (1345, 696, 1430, 762), dict(junto=True, limiar=120)), ('raio', (1436, 690, 1528, 752), dict(junto=True, limiar=120)),
                    ('raio-azul', (1430, 754, 1528, 800), dict(junto=True, limiar=120)), ('raio-curto', (1355, 762, 1425, 800), dict(junto=True, limiar=120))]:
    corte(*c, nome, **kw)
# ---- UI
for k, x in enumerate([24, 87, 151, 216, 281]):
    corte(x - 2, 836, x + 60, 888, f'num-{k + 1}')
for nome, c, kw in [('largada', (14, 889, 204, 954), dict(junto=True)), ('chegada', (206, 889, 380, 955), dict(junto=True)),
                    ('trofeu', (24, 952, 94, 1024), {}), ('bandeira', (98, 952, 174, 1024), {}), ('faixa', (174, 958, 266, 1012), {}),
                    ('podio', (264, 958, 380, 1020), dict(junto=True))]:
    corte(*c, nome, **kw)
# ---- cenário
for nome, c, kw in [('cacto', (376, 812, 442, 975), {}), ('cerca', (444, 840, 642, 922), {}), ('feno', (432, 918, 508, 968), {}),
                    ('feno-2', (510, 918, 576, 968), {}), ('placa', (574, 928, 634, 1012), {}), ('cacto-2', (640, 836, 694, 952), {}),
                    ('cacto-3', (692, 818, 744, 944), {}), ('torre', (742, 812, 824, 946), {}), ('bandeirolas', (824, 846, 935, 896), dict(junto=True, limiar=150)),
                    ('caixotes', (818, 894, 884, 946), {}), ('cerca-baixa', (904, 890, 996, 938), {}), ('portal', (930, 810, 1016, 906), {}),
                    ('portal-2', (1010, 832, 1112, 906), {}), ('caveira', (697, 948, 760, 1010), {}), ('mato', (754, 960, 806, 1008), {}),
                    ('mato-2', (414, 972, 472, 1012), {}), ('cerca-curta', (804, 944, 936, 1010), {}), ('pedras', (470, 962, 586, 1014), dict(junto=True)),
                    ('carroca', (938, 938, 1104, 1018), {}), ('pedras-2', (998, 902, 1100, 942), dict(junto=True)), ('publico', (1110, 834, 1358, 1012), dict(junto=True))]:
    corte(*c, nome, **kw)
# ---- acessórios
for nome, c in [('chapeu', (1342, 844, 1410, 892)), ('bandana', (1412, 848, 1462, 894)), ('cenoura', (1462, 840, 1516, 898)), ('coroa', (1364, 894, 1414, 942)),
                ('medalha', (1418, 896, 1456, 948)), ('oculos', (1458, 908, 1508, 938)), ('espiral', (1372, 950, 1416, 994)), ('estrela', (1420, 950, 1464, 994))]:
    corte(*c, nome)

# capa da vitrine: céu de sertão, chão de terra e três jegues na disparada (montada com os próprios recortes)
W, H = 620, 544
y = np.arange(H)[:, None, None] / H
capa = np.where(y < 0.62, (1 - y / 0.62) * np.array([235, 190, 120]) + (y / 0.62) * np.array([150, 200, 250]),
                np.array([70, 130, 190]) * (1 - (y - 0.62)) + np.array([40, 80, 130]) * (y - 0.62)).astype(np.float32)
capa = np.broadcast_to(capa, (H, W, 3)).copy()


def colar(nome, x, y, alt):
    im = cv2.imread(str(saida / f'{nome}.webp'), cv2.IMREAD_UNCHANGED)
    im = cv2.resize(im, (int(im.shape[1] * alt / im.shape[0]), alt), interpolation=cv2.INTER_AREA)
    h, w = im.shape[:2]
    x0, y0 = int(x - w / 2), int(y - h)
    a, b = max(0, -x0), max(0, -y0)
    w2, h2 = min(w, W - x0) - a, min(h, H - y0) - b
    k = im[b:b + h2, a:a + w2, 3:4] / 255.0
    capa[y0 + b:y0 + b + h2, x0 + a:x0 + a + w2] = capa[y0 + b:y0 + b + h2, x0 + a:x0 + a + w2] * (1 - k) + im[b:b + h2, a:a + w2, :3] * k


colar('cacto', 70, 360, 200); colar('cacto-3', 560, 330, 150); colar('chegada', 470, 120, 90)
colar('poeira-4', 120, 470, 120); colar('relampago-corre-2', 170, 400, 210)
colar('poeira-3', 330, 540, 120); colar('jerimum-corre-1', 420, 520, 230)
colar('pepano-corre-4', 250, 530, 250)
cv2.imwrite(str(saida / 'capa.webp'), cv2.resize(capa.astype(np.uint8), (310, 272), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.webp'))), 'sprites')
