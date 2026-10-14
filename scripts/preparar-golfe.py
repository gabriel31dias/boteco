# Prepara o Mini-golfe Tropical a partir de duas imagens:
#   python3 scripts/preparar-golfe.py <maquete.png> <folha.png>
#   maquete = "Mini-golfe tropical multiplayer ....png" (1536x1024): o campo
#   folha   = "Cartela de Sprites de Golfe Cartunesco.png" (1536x1024)
# Precisa de numpy e opencv (só aqui; o jogo não usa):
#   python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless pillow
#
# 1) o campo sem os jogadores, bolas, bandeiras e o HUD pintado (inpaint; os
#    cantos de baixo ganham arbustos da folha por cima do borrão);
# 2) o terreno (src/games/golfe/terreno.json): grade de 4px com g (grama),
#    a (areia) e # (tabela) — o servidor simula a bola nela;
# 3) os golfistas (menino azul, menina rosa e as versões vermelha e roxa),
#    bola, rastros, bandeira, buraco, torrão, marcadores, capa.
# ponytail: caixas e cores medidas nestas imagens; imagem nova = medir de novo.
import json
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/golfe'
saida.mkdir(parents=True, exist_ok=True)
maq = cv2.imread(sys.argv[1])
assert maq.shape[:2] == (1024, 1536), f'maquete inesperada: {maq.shape}'
folha = cv2.imread(sys.argv[2], cv2.IMREAD_UNCHANGED)
assert folha.shape[:2] == (1024, 1536), f'folha inesperada: {folha.shape}'
H, W = maq.shape[:2]

# ---- 1) campo limpo
tirar = np.zeros((H, W), np.uint8)
for (x0, y0, x1, y1) in [
    (772, 150, 840, 282), (828, 246, 860, 280),            # Lucas e a bola
    (655, 392, 765, 525),                                   # Mariana
    (325, 722, 425, 862), (395, 695, 550, 835),             # Gabriel e a seta
    (1190, 592, 1282, 728),                                 # Rafael
    (1070, 132, 1122, 210), (1330, 640, 1378, 716),         # bandeiras
    (1025, 185, 1085, 232), (630, 495, 705, 545), (1285, 685, 1345, 730), (318, 835, 392, 880),   # sombras
    (8, 8, 282, 112), (1238, 8, 1526, 228), (1450, 440, 1526, 585),   # HUD de cima e chat
    (20, 795, 220, 995), (535, 895, 1035, 1000), (1318, 795, 1515, 995),   # joystick, barra, botão
]:
    tirar[y0:y1, x0:x1] = 255
campo = cv2.inpaint(maq, tirar, 9, cv2.INPAINT_TELEA)

# ---- 2) terreno
hsv = cv2.cvtColor(campo, cv2.COLOR_BGR2HSV)
h, s, v = (hsv[..., k].astype(int) for k in range(3))
grama = (h >= 33) & (h <= 52) & (s > 110) & (v > 150)
areia = (h >= 10) & (h <= 24) & (s > 40) & (s < 140) & (v > 170)


def limpa(m, k):
    m = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8)) > 0


g, a = limpa(grama, 15), limpa(areia, 9)
n, lab, st, _ = cv2.connectedComponentsWithStats((g | a).astype(np.uint8))
dois = np.argsort(-st[1:, cv2.CC_STAT_AREA])[:2] + 1          # o fairway e a ilha
jogavel = np.isin(lab, dois).astype(np.uint8) * 255
# os bunkers da beirada do fairway (e a bordinha de grama em volta) também são campo
na, la, sa, _ = cv2.connectedComponentsWithStats(a.astype(np.uint8))
perto = cv2.dilate(jogavel, np.ones((41, 41), np.uint8)) > 0
for k in range(1, na):
    bunker = la == k
    if sa[k, cv2.CC_STAT_AREA] > 800 and (bunker & perto).any():
        jogavel[cv2.dilate(bunker.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0] = 255
jogavel = cv2.morphologyEx(jogavel, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
cont, _ = cv2.findContours(jogavel, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
jogavel = cv2.drawContours(np.zeros_like(jogavel), cont, -1, 255, -1) > 0   # tapa os furos (jogadores, sombras)
CEL = 4
gw, gh = W // CEL, H // CEL
linhas = []
for gy in range(gh):
    lin = []
    for gx in range(gw):
        bx, by = gx * CEL + CEL // 2, gy * CEL + CEL // 2
        lin.append('#' if not jogavel[by, bx] else 'a' if a[by, bx] else 'g')
    linhas.append(''.join(lin))
(raiz / 'src/games/golfe').mkdir(parents=True, exist_ok=True)
json.dump({'cel': CEL, 'w': gw, 'h': gh, 'mapa': linhas}, open(raiz / 'src/games/golfe/terreno.json', 'w'))

# ---- sprites
def cortar(x0, y0, x1, y1, nome, matiz=None, so_maior=False):
    p = folha[y0:y1, x0:x1].copy()
    if p.shape[2] == 3:
        p = cv2.cvtColor(p, cv2.COLOR_BGR2BGRA)
    al = p[..., 3]
    m = (al >= 90).astype(np.uint8)
    nn, lb, stt, _ = cv2.connectedComponentsWithStats(m)
    manter = [i for i in range(1, nn) if stt[i, cv2.CC_STAT_AREA] > 25]
    if so_maior:   # só o desenho principal (a caixa pega pedaço do vizinho)
        manter = [1 + int(np.argmax(stt[1:, cv2.CC_STAT_AREA]))]
    p[..., 3] = np.where(np.isin(lb, manter), al, 0)
    if matiz:
        de, para = matiz
        hs = cv2.cvtColor(p[..., :3], cv2.COLOR_BGR2HSV)
        hh = hs[..., 0].astype(int)
        sel = (hh >= de[0]) & (hh <= de[1]) & (hs[..., 1] > 70)
        hs[..., 0] = np.where(sel, (hh - (de[0] + de[1]) // 2 + para) % 180, hh).astype(np.uint8)
        p[..., :3] = cv2.cvtColor(hs, cv2.COLOR_HSV2BGR)
    ys, xs = np.where(p[..., 3] > 0)
    p = p[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    cv2.imwrite(str(saida / f'{nome}.png'), p)
    return p


MENINO = {'frente': (8, 5, 80, 160), 'costas': (98, 5, 162, 160), 'anda-0': (262, 5, 348, 160), 'anda-1': (347, 5, 436, 160),
          'anda-2': (429, 5, 517, 160), 'anda-3': (512, 5, 597, 160), 'mira': (603, 5, 675, 160), 'sobe': (683, 5, 765, 160),
          'topo': (784, 5, 855, 160), 'desce': (877, 5, 960, 160), 'segue': (969, 5, 1063, 160), 'festa': (1067, 5, 1180, 166),
          'rosto': (1188, 100, 1264, 178)}
MENINA = {'frente': (10, 165, 110, 352), 'costas': (122, 165, 190, 352), 'anda-0': (205, 165, 305, 352), 'anda-1': (302, 165, 406, 352),
          'anda-2': (401, 165, 503, 352), 'anda-3': (502, 165, 601, 352), 'mira': (502, 165, 601, 352), 'sobe': (597, 165, 704, 352),
          'topo': (712, 165, 802, 352), 'desce': (800, 165, 905, 352), 'segue': (903, 165, 1043, 352), 'festa': (1040, 165, 1152, 352),
          'rosto': (1153, 187, 1251, 276)}
# matiz no OpenCV (0-180): azul ~100-125 -> vermelho 2; rosa ~150-178 -> roxo 135
for cor, quadros, matiz in [('azul', MENINO, None), ('vermelho', MENINO, ((96, 128), 2)), ('rosa', MENINA, None), ('roxo', MENINA, ((145, 179), 135))]:
    for nome, cx in quadros.items():
        cortar(*cx, f'{cor}-{nome}', matiz)

EFEITOS = {'bola': (688, 355, 734, 402), 'rastro-ouro': (735, 372, 835, 420), 'rastro-azul': (853, 366, 937, 412), 'rastro-rosa': (941, 374, 1072, 420),
           'bola-grama': (667, 432, 741, 479), 'rastro-lilas': (781, 431, 943, 480), 'torrao': (1100, 398, 1204, 492), 'fogo': (1209, 375, 1302, 519),
           'risco': (1289, 376, 1354, 483), 'buraco': (1359, 455, 1434, 491),
           'seta-azul': (1285, 837, 1333, 882), 'seta-vermelho': (1340, 837, 1388, 881), 'seta-amarelo': (1408, 837, 1457, 881), 'seta-verde': (1470, 837, 1519, 882),
           'arbusto-0': (840, 660, 935, 745), 'arbusto-1': (1130, 607, 1238, 660), 'palmeira': (130, 485, 265, 703), 'palmeira-2': (5, 485, 132, 703)}
fx = {n: cortar(*c, n) for n, c in EFEITOS.items()}
# a bandeira com o buraco dela na base (a caixa encosta no buraco avulso do lado: só o maior pedaço);
# a âncora (centro do buraco, em fração do sprite) vai pro jogo posicionar certo
band = cortar(1380, 356, 1496, 538, 'bandeira', so_maior=True)
escuro = (band[..., 3] > 200) & (band[..., :3].max(axis=2) < 60)
escuro[: band.shape[0] * 2 // 3] = False
ys, xs = np.where(escuro)
json.dump({'ax': round(float(xs.mean()) / band.shape[1], 3), 'ay': round(float(ys.mean()) / band.shape[0], 3), 'larguraBuraco': round(float(xs.max() - xs.min()) / band.shape[1], 3)},
          open(saida / 'bandeira.json', 'w'))

# cantos de baixo (onde o joystick e o botão foram apagados): arbustos e palmeiras por cima do borrão
def colar(img, nome, cx, base, larg):
    p = fx[nome]
    alt = int(p.shape[0] * larg / p.shape[1])
    p = cv2.resize(p, (larg, alt), interpolation=cv2.INTER_AREA)
    x0, y0 = int(cx - larg / 2), int(base - alt)
    x1, y1 = min(W, x0 + larg), min(H, y0 + alt)
    cx0, cy0 = max(0, -x0), max(0, -y0)          # corta o que passa da borda
    p = p[cy0: y1 - y0, cx0: x1 - x0]
    x0, y0 = max(0, x0), max(0, y0)
    a = p[..., 3:4] / 255.0
    img[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - a) + p[..., :3] * a).astype(np.uint8)


for nome, cx, base, larg in [('arbusto-0', 70, 960, 150), ('arbusto-1', 170, 1010, 170), ('palmeira-2', 60, 1024, 120), ('arbusto-0', 210, 900, 120),
                             ('arbusto-0', 1400, 970, 170), ('arbusto-1', 1480, 1015, 160), ('palmeira', 1450, 930, 150), ('arbusto-1', 1350, 905, 140),
                             # a faixa de baixo, onde a barra de força estava pintada
                             ('arbusto-1', 560, 985, 150), ('arbusto-0', 660, 1010, 140), ('palmeira-2', 745, 1000, 110), ('arbusto-1', 830, 990, 160),
                             ('arbusto-0', 930, 1015, 150), ('arbusto-1', 1010, 985, 120), ('arbusto-0', 600, 935, 110), ('arbusto-0', 980, 940, 100),
                             # canto de cima à direita (o placar pintado) e de cima à esquerda (o menu)
                             ('palmeira', 1300, 150, 150), ('arbusto-0', 1420, 120, 170), ('palmeira-2', 1500, 200, 120), ('arbusto-1', 1330, 235, 150),
                             ('arbusto-0', 1470, 250, 140), ('arbusto-1', 1260, 90, 130), ('palmeira', 1400, 60, 120),
                             ('arbusto-1', 120, 100, 170), ('arbusto-0', 240, 115, 120),
                             # o canto do joystick
                             ('arbusto-1', 110, 880, 150), ('arbusto-0', 40, 850, 110), ('palmeira', 180, 960, 120)]:
    colar(campo, nome, cx, base, larg)
cv2.imwrite(str(saida / 'campo.webp'), campo, [cv2.IMWRITE_WEBP_QUALITY, 86])

# ---- capa (310x272): o campo, os golfistas e o título
capa = cv2.resize(maq[60:1000, 180:1250], (310, 272), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(saida / 'capa.webp'), capa, [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.png'))), 'sprites, campo, capa e terreno', f'{gw}x{gh}')
