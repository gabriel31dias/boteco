# Prepara a Caçada de Patos a partir de duas imagens:
#   python3 scripts/preparar-patos.py <maquete.png> <atlas.png>
#   maquete = "Caçada de Patos_ Batalha Multiplayer.png" (1227x1282): o cenário
#   atlas   = "Atlas de Sprites para Caça aos Patos.png" (1536x1024)
# Precisa de numpy e opencv-contrib (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-contrib-python-headless
# O atlas tem um fundo falso meio transparente: o desenho é o que tem alfa alto.
# ponytail: caixas medidas nestas imagens; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/patos'
saida.mkdir(parents=True, exist_ok=True)
maq = cv2.imread(sys.argv[1])
assert maq.shape[:2] == (1282, 1227), f'maquete inesperada: {maq.shape}'
atlas = cv2.imread(sys.argv[2], cv2.IMREAD_UNCHANGED)
assert atlas.shape[:2] == (1024, 1536), f'atlas inesperado: {atlas.shape}'


def corte(x0, y0, x1, y1, nome, junto=False, corte_alfa=225):
    p = atlas[y0:y1, x0:x1].copy()
    al = p[..., 3]
    m = (al >= corte_alfa).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    manter = [i for i in range(1, n) if st[i, 4] > 20] if junto else [1 + int(np.argmax(st[1:, 4]))]
    alfa = np.where(np.isin(lab, manter), 255, 0).astype(np.uint8)
    p[..., 3] = cv2.GaussianBlur(alfa, (3, 3), 0)
    ys, xs = np.where(p[..., 3] > 0)
    cv2.imwrite(str(saida / f'{nome}.png'), p[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


# patos voando (olham pra direita): verde (marreco), marrom (fêmea), branco (ganso), colorido (raro)
VOOS = {
    'verde': [(14, 8, 203, 140), (206, 8, 377, 140), (378, 8, 557, 140), (561, 8, 740, 140), (745, 8, 900, 140), (900, 8, 1066, 140), (1066, 8, 1256, 140)],
    'marrom': [(9, 135, 192, 268), (196, 133, 373, 268), (372, 138, 560, 268), (558, 138, 748, 268), (743, 130, 930, 268), (920, 138, 1099, 268), (1096, 140, 1304, 268)],
    'branco': [(10, 256, 192, 390), (200, 263, 370, 390), (374, 263, 554, 390), (570, 263, 758, 390), (770, 263, 960, 390)],
    'colorido': [(961, 265, 1137, 392), (1143, 265, 1322, 392), (1327, 250, 1526, 392)],
}
for tipo, cx in VOOS.items():
    for k, c in enumerate(cx):
        corte(*c, f'{tipo}-{k}')
# atingido e caindo (com penas em volta)
for k, c in enumerate([(20, 392, 178, 541), (360, 388, 590, 540), (695, 388, 870, 540), (900, 390, 1052, 540)]):
    corte(*c, f'cai-{k}', junto=k > 0)
for k, c in enumerate([(1078, 400, 1112, 470), (1124, 400, 1157, 472), (1175, 400, 1204, 468), (1220, 393, 1262, 452), (1275, 386, 1309, 454),
                       (1357, 389, 1398, 455), (1413, 389, 1444, 453), (1452, 397, 1480, 454), (1484, 393, 1520, 455), (1373, 448, 1413, 518)]):
    corte(*c, f'pena-{k}')
for k, c in enumerate([(329, 548, 400, 612), (429, 548, 494, 612), (520, 545, 621, 612), (642, 545, 729, 612), (750, 545, 861, 612), (888, 548, 965, 612)]):
    corte(*c, f'agua-{k}', junto=True, corte_alfa=150)
for nome, c in [('mira-vermelho', (12, 612, 134, 735)), ('mira-verde', (148, 612, 270, 735)), ('mira-laranja', (274, 612, 397, 735)), ('mira-azul', (393, 612, 503, 735))]:
    corte(*c, nome, junto=True, corte_alfa=170)
for nome, c in [('clarao', (522, 632, 626, 704)), ('clarao-2', (650, 640, 716, 702)), ('fumaca-0', (1020, 625, 1098, 708)), ('fumaca-1', (1099, 637, 1154, 696)),
                ('fumaca-2', (1160, 630, 1225, 696)), ('cartucho-0', (1360, 712, 1413, 785)), ('cartucho-1', (1437, 702, 1472, 765)), ('cartucho-2', (1483, 705, 1532, 770)),
                ('cachorro', (2, 868, 138, 1013)), ('patinho', (128, 946, 195, 1016)), ('mais-1', (424, 962, 472, 1006)), ('mais-2', (492, 962, 546, 1006)),
                ('mais-3', (565, 962, 619, 1006)), ('mais-5', (637, 962, 692, 1006)), ('mais-10', (709, 962, 780, 1006)), ('placa', (160, 868, 318, 948)),
                ('municao', (323, 868, 510, 950)), ('cerca', (1225, 880, 1395, 1016)), ('torre', (1405, 770, 1532, 1016)), ('lampiao', (1325, 812, 1375, 935)),
                ('capim-0', (795, 960, 885, 1016)), ('capim-1', (940, 860, 1080, 1016)), ('pedra', (1000, 925, 1110, 1016)), ('ninho', (822, 872, 940, 954))]:
    corte(*c, nome, junto=nome.startswith(('fumaca', 'cerca', 'capim')))
# armas (de baixo, com a mão): as cores do jogo
for nome, c in [('arma-vermelho', (530, 715, 745, 866)), ('arma-verde', (700, 715, 900, 866)), ('arma-amarelo', (335, 715, 562, 866))]:
    corte(*c, nome)
# a azul do atlas está noutro ângulo (fica torta ao lado das outras): pinta a vermelha de azul
ver = cv2.imread(str(saida / 'arma-vermelho.png'), cv2.IMREAD_UNCHANGED)
hsv = cv2.cvtColor(ver[..., :3], cv2.COLOR_BGR2HSV).astype(np.float32)
dh = np.minimum(hsv[..., 0], 180 - hsv[..., 0])            # só o vermelho do metal; pele é laranja
k = cv2.GaussianBlur(np.clip((7 - dh) / 3, 0, 1) * np.clip((hsv[..., 1] - 50) / 40, 0, 1), (3, 3), 0)[..., None]
hsv[..., 0] = 106
azul = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
ver[..., :3] = (ver[..., :3] * (1 - k) + azul * k).astype(np.uint8)
cv2.imwrite(str(saida / 'arma-azul.png'), ver)

# ---- cenário: céu, montanhas e lago da maquete, sem patos, miras e armas
x0, y0, x1, y1 = 60, 204, 1160, 862   # sem a moldura de madeira (lampião, postes, placa)
tirar = np.zeros(maq.shape[:2], np.uint8)
for (a, b, c, d) in [(228, 195, 385, 340), (418, 262, 595, 395), (608, 225, 745, 350), (808, 190, 985, 340), (200, 398, 400, 560), (712, 393, 875, 525),
                     (905, 485, 1062, 600), (728, 632, 915, 765), (292, 612, 415, 695), (460, 515, 660, 728), (920, 250, 1160, 505),
                     (170, 680, 270, 862), (425, 735, 515, 862), (690, 680, 775, 862), (970, 735, 1060, 862), (1135, 610, 1206, 790)]:
    tirar[b:d, a:c] = 255
# preenche linha por linha: a paisagem é em faixas horizontais (céu, montanha, mata, lago), então
# cada buraco vira o espelho do que está à esquerda misturado com o espelho do que está à direita
borda = cv2.dilate(tirar, np.ones((7, 7), np.uint8)) > 0
img = maq.astype(np.float32)
for y in range(y0, y1):
    linha, buraco = img[y], borda[y]
    x = x0
    while x < x1:
        if not buraco[x]:
            x += 1; continue
        s0 = x
        while x < x1 and buraco[x]:
            x += 1
        e0, n = x, x - s0
        idx = np.arange(n)
        esq = np.clip(s0 - 1 - idx, x0, x1 - 1)          # espelho à esquerda
        dir_ = np.clip(e0 + (n - 1 - idx), x0, x1 - 1)    # espelho à direita
        esq = np.where(buraco[esq], s0 - 1, esq)
        dir_ = np.where(buraco[dir_], min(e0, x1 - 1), dir_)
        t = ((idx + 0.5) / n)[:, None]
        if e0 + n > x1:
            t = t * 0      # perto da borda direita: só o lado esquerdo
        elif s0 - n < x0:
            t = t * 0 + 1  # perto da borda esquerda: só o direito
        linha[s0:e0] = linha[esq] * (1 - t) + linha[dir_] * t
# tira as listras: desfoque vertical só dentro do buraco
liso = cv2.GaussianBlur(img, (0, 0), sigmaX=2, sigmaY=5)
m = cv2.GaussianBlur(borda.astype(np.float32), (0, 0), 3)[..., None]
img = img * (1 - m) + liso * m
# borda dos remendos esfumada (some o degrau entre o remendo e o resto)
fora = cv2.GaussianBlur(maq.astype(np.float32), (0, 0), 1)
mb = cv2.GaussianBlur(borda.astype(np.float32), (0, 0), 9)[..., None]
mb = np.where(borda[..., None], 1.0, mb)
img = fora * (1 - mb) + img * mb
img += np.random.default_rng(3).normal(0, 1.8, img.shape).astype(np.float32) * m
cena = np.clip(img, 0, 255).astype(np.uint8)[y0:y1, x0:x1]
cena = cv2.resize(cena, (1280, 766), interpolation=cv2.INTER_AREA)
# profundidade: o fundo levemente desfocado (os patos, nítidos, saltam na frente) e o céu um pouco mais
desfoque = np.clip((np.arange(766) - 200) / 300, 0, 1)[:, None, None]   # 0 no céu, 1 no lago
ceu = cv2.GaussianBlur(cena, (0, 0), 6)
chao = cv2.GaussianBlur(cena, (0, 0), 2.2)
cena = (ceu * (1 - desfoque) + chao * desfoque).astype(np.uint8)
cv2.imwrite(str(saida / 'cena.webp'), cena, [cv2.IMWRITE_WEBP_QUALITY, 86])
capa = cv2.resize(maq[150:1080, 0:1227], (310, 272), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(saida / 'capa.webp'), capa, [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.png'))), 'sprites')
