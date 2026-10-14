# Prepara Bazuca x Helicópteros a partir da folha de sprites:
#   python3 scripts/preparar-bazuca.py "<Atlas de Sprites de Ação Cartunesca.png>"
#   folha 1536x1024 com alfa: soldados azul e vermelho, foguetes, 2 helicópteros (inteiro, fumaça, fogo,
#   explosão, destroço), explosões, fumaça, chão, cenário e o panorama do deserto.
# Precisa de numpy e opencv (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless
# ponytail: caixas medidas nesta imagem; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/bazuca'
saida.mkdir(parents=True, exist_ok=True)
folha = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
assert folha.shape[:2] == (1024, 1536) and folha.shape[2] == 4, f'folha inesperada: {folha.shape}'
ROTULOS = {}


def pedacos(limiar):
    if limiar not in ROTULOS:
        m = (folha[..., 3] >= limiar).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        ROTULOS[limiar] = cv2.connectedComponentsWithStats(m)
    return ROTULOS[limiar]


def corte(x0, y0, x1, y1, limiar=120, folga=9, margem=24):
    """Todos os pedaços cujo centro cai na caixa, com a borda macia do alfa original em volta."""
    _, lab, st, cen = pedacos(limiar)
    manter = [i for i in range(1, len(st)) if st[i, 4] > 40 and x0 <= cen[i][0] < x1 and y0 <= cen[i][1] < y1]
    assert manter, f'nada em {(x0, y0, x1, y1)}'
    X0, Y0 = max(0, x0 - margem), max(0, y0 - margem)
    X1, Y1 = min(folha.shape[1], x1 + margem), min(folha.shape[0], y1 + margem)
    p = folha[Y0:Y1, X0:X1].copy()
    mask = cv2.dilate(np.isin(lab[Y0:Y1, X0:X1], manter).astype(np.uint8), np.ones((folga, folga), np.uint8))
    p[..., 3] = (p[..., 3] * cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)).astype(np.uint8)
    ys, xs = np.where(p[..., 3] > 8)
    return p[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def salvar(im, nome):
    cv2.imwrite(str(saida / f'{nome}.webp'), im, [cv2.IMWRITE_WEBP_QUALITY, 90])


def caixa(x, y, w, h, nome, **kw):
    im = corte(x, y, x + w, y + h, **kw)
    salvar(im, nome)
    return im


# ---- soldados (de frente pra direita): mira-0, mira-1, tiro, ajoelha, pulo, corre, cai, caido
QUADROS = ['mira-0', 'mira-1', 'tiro', 'ajoelha', 'pulo', 'corre', 'cai', 'caido']
AZUL = [(20, 16, 138, 112), (166, 16, 124, 111), (293, 21, 147, 107), (422, 34, 121, 94), (717, 17, 89, 115), (810, 16, 75, 98),
        (1070, 23, 61, 94), (985, 57, 80, 60)]
VERMELHO = [(15, 140, 140, 109), (156, 143, 126, 108), (290, 147, 144, 104), (418, 153, 115, 95), (719, 149, 93, 103), (812, 136, 60, 100),
            (1070, 160, 78, 84), (891, 155, 85, 66)]
# cor nova = o azul com o matiz trocado (só o macacão: pixels azuis bem saturados)
TINTAS = {'amarelo': (25, 1.25), 'roxo': (140, 1.0), 'verde': (62, 1.1)}
for q, ca, cv in zip(QUADROS, AZUL, VERMELHO):
    azul = caixa(*ca, f'soldado-azul-{q}')
    caixa(*cv, f'soldado-vermelho-{q}')
    hsv = cv2.cvtColor(azul[..., :3], cv2.COLOR_BGR2HSV)
    alvo = (hsv[..., 0] >= 95) & (hsv[..., 0] <= 135) & (hsv[..., 1] > 70)
    for cor, (h, luz) in TINTAS.items():
        n = hsv.copy()
        n[..., 0][alvo] = h
        n[..., 2][alvo] = np.clip(n[..., 2][alvo] * luz, 0, 255).astype(np.uint8)
        im = azul.copy()
        im[..., :3] = cv2.cvtColor(n, cv2.COLOR_HSV2BGR)
        salvar(im, f'soldado-{cor}-{q}')

# ---- foguetes e rastro
for nome, c, kw in [('foguete', (1166, 69, 90, 27), {}), ('foguete-2', (1181, 114, 85, 28), {}), ('chama', (1273, 23, 67, 26), dict(limiar=60)),
                    ('rastro', (1307, 137, 197, 81), dict(limiar=40)), ('rastro-2', (1399, 200, 106, 33), dict(limiar=40))]:
    caixa(*c, nome, **kw)
# ---- helicópteros (de frente pra direita); hélice é fraca no alfa: limiar baixo
for tipo, quadros in {'verde': [(18, 262, 236, 133), (307, 262, 231, 129), (585, 258, 262, 131), (868, 258, 232, 129), (1089, 250, 205, 150), (1317, 238, 207, 158)],
                      'bege': [(17, 405, 264, 125), (304, 410, 258, 121), (584, 388, 273, 144), (888, 410, 231, 144), (1145, 428, 129, 138), (1281, 405, 226, 152)]}.items():
    for nome, c in zip(['0', '1', 'fumaca', 'fogo', 'boom', 'destroco'], quadros):
        caixa(*c, f'heli-{tipo}-{nome}', limiar=40, folga=5)
# ---- explosão e fumaça (do maior pro menor)
for k, c in enumerate([(15, 551, 94, 91), (128, 556, 96, 88), (240, 546, 94, 99), (351, 576, 79, 67), (453, 585, 67, 58)]):
    caixa(*c, f'explosao-{k}', limiar=60)
for k, c in enumerate([(552, 550, 77, 93), (729, 559, 82, 89), (831, 559, 79, 74), (931, 570, 72, 56), (1025, 580, 57, 50), (1107, 587, 49, 43)]):
    caixa(*c, f'fumaca-{k}', limiar=40)
# ---- cenário
for nome, c in [('chao', (140, 757, 277, 91)), ('chao-2', (16, 657, 229, 91)), ('sacos', (1307, 938, 117, 67)), ('sacos-2', (986, 852, 95, 52)),
                ('barreira', (1428, 930, 97, 74)), ('barril', (895, 774, 47, 65)), ('barril-2', (951, 774, 46, 66)), ('barril-cinza', (1067, 784, 49, 51)),
                ('caixas', (676, 791, 98, 53)), ('torre', (1413, 638, 110, 208)), ('torre-aco', (1130, 652, 67, 183)), ('palmeira', (1221, 735, 115, 171)),
                ('bandeira', (1329, 853, 52, 75)), ('moita', (1093, 850, 64, 54)), ('moita-2', (1168, 854, 59, 51))]:
    caixa(*c, nome)
# panorama do deserto: recorte direto (o pedaço junta com a pedra do lado); começa abaixo da fileira de chão
# e o céu dele some aos poucos em cima, pra emendar no céu do jogo
pan = folha[852:1011, 14:872].copy()
rampa = np.clip(np.arange(pan.shape[0]) / (pan.shape[0] * 0.45), 0, 1) ** 1.5
pan[..., 3] = (pan[..., 3] * rampa[:, None]).astype(np.uint8)
salvar(pan, 'panorama')

# capa da vitrine: panorama, dois helicópteros, explosão e o soldado mirando
W, H = 620, 544
y = np.arange(H)[:, None] / H
capa = np.repeat((np.array([235, 170, 90]) * (1 - y) + np.array([245, 225, 190]) * y)[:, None, :], W, axis=1).astype(np.float32)


def colar(im, x, y, alt, espelho=False):
    if espelho:
        im = im[:, ::-1]
    im = cv2.resize(im, (int(im.shape[1] * alt / im.shape[0]), alt), interpolation=cv2.INTER_AREA)
    h, w = im.shape[:2]
    x0, y0 = int(x - w / 2), int(y - h)
    a, b = max(0, -x0), max(0, -y0)
    w2, h2 = min(w, W - x0) - a, min(h, H - y0) - b
    k = im[b:b + h2, a:a + w2, 3:4] / 255.0
    capa[y0 + b:y0 + b + h2, x0 + a:x0 + a + w2] = capa[y0 + b:y0 + b + h2, x0 + a:x0 + a + w2] * (1 - k) + im[b:b + h2, a:a + w2, :3] * k


ler = lambda n: cv2.imread(str(saida / f'{n}.webp'), cv2.IMREAD_UNCHANGED)
pan4 = np.dstack([pan[..., :3], pan[..., 3]])
colar(pan4, 310, 544, 300)
colar(ler('heli-verde-fogo'), 420, 200, 150, True)
colar(ler('explosao-0'), 470, 160, 120)
colar(ler('heli-bege-0'), 160, 150, 110)
colar(ler('rastro'), 330, 330, 90, True)
colar(ler('foguete'), 400, 250, 34)
colar(ler('sacos'), 150, 544, 80)
colar(ler('soldado-azul-tiro'), 200, 520, 190)
cv2.imwrite(str(saida / 'capa.webp'), cv2.resize(capa.astype(np.uint8), (310, 272), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.webp'))), 'sprites')
