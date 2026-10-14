# Prepara o Futebol de Botão a partir de duas imagens:
#   python3 scripts/preparar-botao.py <maquete.png> <cartela.png>
#   maquete = "Jogo de Botão Flamengo e Vasco.png" (941x1672): a mesa (campo, madeira, gols)
#   cartela = "Cartela de Sprites para Futebol de Botão (1).png" (1536x1024, com alfa)
# Precisa de numpy e opencv (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-contrib-python-headless
# ponytail: caixas e linhas medidas nestas imagens; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/botao'
saida.mkdir(parents=True, exist_ok=True)
maq = cv2.imread(sys.argv[1])
assert maq.shape[:2] == (1672, 941), f'maquete inesperada: {maq.shape}'
atlas = cv2.imread(sys.argv[2], cv2.IMREAD_UNCHANGED)
assert atlas.shape[:2] == (1024, 1536), f'cartela inesperada: {atlas.shape}'


def corte(x0, y0, x1, y1, nome, junto=False, corte_alfa=225):
    """A cartela tem um fundo falso meio transparente: o desenho é o que tem alfa alto."""
    p = atlas[y0:y1, x0:x1].copy()
    m = (p[..., 3] >= corte_alfa).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    manter = [i for i in range(1, n) if st[i, 4] > 20] if junto else [1 + int(np.argmax(st[1:, 4]))]
    alfa = np.where(np.isin(lab, manter), 255, 0).astype(np.uint8)
    p[..., 3] = cv2.GaussianBlur(alfa, (3, 3), 0)
    ys, xs = np.where(p[..., 3] > 0)
    cv2.imwrite(str(saida / f'{nome}.png'), p[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


# botões: de frente (0) até de lado (7) — o giro da comemoração
for time, caixas in [('fla', [(14, 11, 161, 156), (177, 18, 304, 145), (317, 19, 429, 142), (440, 22, 541, 141), (550, 25, 650, 141), (645, 43, 743, 141), (741, 49, 815, 139), (814, 69, 898, 138)]),
                     ('vas', [(15, 166, 162, 311), (179, 175, 307, 302), (322, 172, 430, 293), (441, 172, 542, 293), (553, 174, 649, 293), (649, 190, 743, 292), (742, 200, 816, 292), (811, 219, 894, 293)])]:
    for k, c in enumerate(caixas):
        corte(c[0] - 2, c[1] - 2, c[2] + 2, c[3] + 2, f'{time}-{k}')
# bola girando (4 quadros), borrada de rápida, e o chutaço com explosão
for k, c in enumerate([(933, 99, 1001, 166), (1027, 103, 1093, 168), (934, 183, 1008, 256), (1040, 189, 1108, 255)]):
    corte(c[0] - 2, c[1] - 2, c[2] + 2, c[3] + 2, f'bola-{k}')
corte(1119, 104, 1186, 171, 'bola-rapida')
corte(1425, 199, 1521, 274, 'bola-fogo')
# rastros e faíscas
for nome, c in [('risco-vermelho', (1190, 440, 1335, 497)), ('risco-azul', (1210, 498, 1380, 547)), ('faisca', (1436, 438, 1532, 497)),
                ('faisca-azul', (1388, 498, 1528, 547)), ('faisca-laranja', (1330, 440, 1432, 497))]:
    corte(*c, nome, junto=nome.startswith('faisca-azul'), corte_alfa=120)
# poeira (pequena e nuvens)
for k, c in enumerate([(936, 270, 1012, 315), (1038, 276, 1113, 322), (993, 552, 1087, 642), (1093, 566, 1193, 636), (1197, 562, 1307, 641)]):
    corte(*c, f'poeira-{k}', junto=True, corte_alfa=150)
# rede balançando com a bola (gol)
for k, c in enumerate([(20, 663, 214, 782), (229, 663, 401, 782), (408, 663, 584, 782), (590, 663, 765, 782)]):
    corte(*c, f'gol-{k}', junto=True)

# ---- a mesa: maquete sem os botões e a bola (o resto é a arte dele)
mesa = maq.astype(np.float32)
hsv = cv2.cvtColor(maq, cv2.COLOR_BGR2HSV)
grama = (hsv[..., 0] > 35) & (hsv[..., 0] < 85) & (hsv[..., 1] > 100) & (hsv[..., 2] > 60)
m = (~grama).astype(np.uint8)
m[:205] = 0; m[1330:] = 0; m[:, :45] = 0; m[:, 900:] = 0       # só dentro do campo (os gols ficam)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))   # tira as linhas, ficam os botões
# a sombra cai pra baixo e pra direita
buraco = cv2.dilate(m, np.ones((17, 17), np.uint8))
buraco = buraco | np.roll(np.roll(cv2.dilate(m, np.ones((19, 19), np.uint8)), 14, 0), 9, 1)
buraco[:203] = 0; buraco[1331:] = 0
b = buraco > 0
linha = (hsv[..., 1] < 90) & (hsv[..., 2] > 170)      # fonte ruim: não copia linha branca pra dentro do buraco
ruim = b | cv2.dilate(linha.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
# as listras da grama são em pé: cada buraco vira o espelho do que está acima misturado com o de baixo
for x in range(941):
    col, bur = mesa[:, x], b[:, x]
    y = 0
    while y < 1672:
        if not bur[y]:
            y += 1; continue
        s0 = y
        while y < 1672 and bur[y]:
            y += 1
        e0, n = y, y - s0
        idx = np.arange(n)
        cima = np.clip(s0 - 1 - idx, 0, 1671)
        baixo = np.clip(e0 + (n - 1 - idx), 0, 1671)
        t = (idx + 0.5) / n
        pc = (1 - t) * ~ruim[cima, x] * (s0 >= 262)     # o goleiro de cima: em cima é o gol, só o lado de baixo
        pb = t * ~ruim[baixo, x] * (e0 <= 1300)          # o de baixo: só o de cima
        ok = ~ruim[max(0, s0 - 60):min(1672, e0 + 60), x]
        media = col[max(0, s0 - 60):min(1672, e0 + 60)][ok].mean(0) if ok.any() else col[s0 - 1]
        soma = pc + pb
        col[s0:e0] = np.where((soma > 0)[:, None], (col[cima] * pc[:, None] + col[baixo] * pb[:, None]) / np.maximum(soma, 1e-6)[:, None], media)
liso = cv2.GaussianBlur(mesa, (0, 0), sigmaX=4, sigmaY=2)
mb = cv2.GaussianBlur(b.astype(np.float32), (0, 0), 3)[..., None]
mesa = mesa * (1 - mb) + liso * mb
# as linhas que estavam debaixo dos botões, redesenhadas (só dentro do buraco)
lin = np.zeros(maq.shape[:2], np.uint8)
for (x0, y0, x1, y1) in [(332, 302, 609, 302), (244, 375, 700, 375), (64, 757, 872, 757), (322, 1227, 616, 1227)]:
    cv2.line(lin, (x0, y0), (x1, y1), 255, 6, cv2.LINE_AA)
cv2.circle(lin, (470, 757), 6, 255, -1, cv2.LINE_AA)
cv2.ellipse(lin, (470, 1185), (120, 88), 0, 215, 325, 255, 6, cv2.LINE_AA)
cv2.ellipse(lin, (470, 757), (137, 131), 0, 0, 360, 255, 6, cv2.LINE_AA)
la = (cv2.GaussianBlur(lin, (3, 3), 0).astype(np.float32) / 255 * np.clip(mb[..., 0] * 1.5, 0, 1))[..., None]
mesa = mesa * (1 - la) + np.array([209, 244, 213], np.float32) * la
mesa += np.random.default_rng(5).normal(0, 2, mesa.shape).astype(np.float32) * mb
mesa = np.clip(mesa, 0, 255).astype(np.uint8)
Y0, Y1 = 112, 1440      # sem o placar de cima e o banco de baixo
cv2.imwrite(str(saida / 'mesa.webp'), mesa[Y0:Y1], [cv2.IMWRITE_WEBP_QUALITY, 88])
# os gols viram sprites (a tela do VAS gira a mesa e desenha os gols de pé): o fundo opaco vai
# debaixo da bola e a malha branca por cima, aí a bola aparece dentro da rede
for nome, (x0, y0, x1, y1) in [('gol-cima', (348, 128, 596, 213)), ('gol-baixo', (338, 1319, 603, 1413))]:
    p = mesa[y0:y1, x0:x1]
    h = cv2.cvtColor(p, cv2.COLOR_BGR2HSV)
    canto = np.zeros(p.shape[:2], np.uint8)
    cv2.rectangle(canto, (0, 0), (p.shape[1] - 1, p.shape[0] - 1), 255, -1)
    canto = cv2.GaussianBlur(cv2.erode(canto, np.ones((3, 3), np.uint8)), (3, 3), 0)
    cv2.imwrite(str(saida / f'{nome}-fundo.png'), np.dstack([p, canto]))
    a = ((h[..., 1] < 80) & (h[..., 2] > 150)).astype(np.uint8) * 255
    a = cv2.GaussianBlur(cv2.dilate(a, np.ones((2, 2), np.uint8)), (3, 3), 0)
    cv2.imwrite(str(saida / f'{nome}-frente.png'), np.dstack([p, np.minimum(a, canto)]))
    print(nome, 'em', (x0, y0 - Y0))
# capa: a mesinha 3D da cartela
capa = atlas[728:1024, 1100:1536]
fundo = np.full(capa.shape[:2] + (3,), (30, 60, 110), np.float32)
al = capa[..., 3:4].astype(np.float32) / 255
capa = (capa[..., :3] * al + fundo * (1 - al)).astype(np.uint8)
cv2.imwrite(str(saida / 'capa.webp'), cv2.resize(capa, (310, 272), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.png'))), 'sprites')
