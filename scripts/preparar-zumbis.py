# Prepara o Zombie Rush a partir da folha de sprites:
#   python3 scripts/preparar-zumbis.py "<Atlas de Sprites para Tiroteio Zumbi (2).png>"
#   folha 1536x1024 com alfa: soldados azul e vermelho (corrida, mira, tiro, dano, morte), 5 zumbis
#   (comum, capacete, gordo, cachorro, gigante) com morte, armas e itens, plataformas, barris, caixas,
#   cenário, explosões, fumaça, clarões de tiro e rastros.
# Precisa de numpy e opencv (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless
# ponytail: caixas medidas nesta imagem; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/zumbis'
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


def corte(x, y, w, h, junto=True, limiar=120, folga=7, margem=20):
    """Pedaços cujo centro cai na caixa (ou só o maior), com a borda macia do alfa original."""
    x0, y0, x1, y1 = x, y, x + w, y + h
    _, lab, st, cen = pedacos(limiar)
    dentro = [i for i in range(1, len(st)) if st[i, 4] > 20 and x0 <= cen[i][0] < x1 and y0 <= cen[i][1] < y1]
    assert dentro, f'nada em {(x, y, w, h)}'
    manter = dentro if junto else [max(dentro, key=lambda i: st[i, 4])]
    X0, Y0 = max(0, x0 - margem), max(0, y0 - margem)
    X1, Y1 = min(folha.shape[1], x1 + margem), min(folha.shape[0], y1 + margem)
    p = folha[Y0:Y1, X0:X1].copy()
    mask = cv2.dilate(np.isin(lab[Y0:Y1, X0:X1], manter).astype(np.uint8), np.ones((folga, folga), np.uint8))
    p[..., 3] = (p[..., 3] * cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)).astype(np.uint8)
    ys, xs = np.where(p[..., 3] > 8)
    return p[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def salvar(im, nome):
    cv2.imwrite(str(saida / f'{nome}.webp'), im, [cv2.IMWRITE_WEBP_QUALITY, 90])


def caixa(c, nome, **kw):
    im = corte(*c, **kw)
    salvar(im, nome)
    return im


# ---- soldados (de frente pra direita). Os clarões ficam de fora: o jogo desenha o próprio.
AZUL = {'corre-0': (14, 9, 62, 82), 'corre-1': (84, 9, 67, 82), 'corre-2': (159, 9, 66, 83), 'corre-3': (231, 9, 64, 82),
        'corre-4': (296, 8, 66, 82), 'corre-5': (364, 9, 70, 81), 'mira': (806, 10, 73, 80), 'mira-1': (727, 9, 75, 80),
        'dano': (884, 9, 58, 81), 'morto': (1014, 49, 111, 39)}
VERMELHO = {'corre-0': (11, 111, 67, 84), 'corre-1': (83, 111, 68, 84), 'corre-2': (156, 111, 69, 84), 'corre-3': (228, 111, 67, 84),
            'corre-4': (299, 112, 66, 82), 'corre-5': (362, 112, 71, 82), 'mira': (548, 112, 81, 82), 'mira-1': (743, 113, 56, 81),
            'dano': (814, 115, 64, 69), 'morto': (1020, 148, 102, 48)}
TINTAS = {'amarelo': (25, 1.25), 'verde': (62, 1.1)}   # o azul com o matiz trocado (só o corpo: azul bem saturado)
for q, c in AZUL.items():
    azul = caixa(c, f'soldado-azul-{q}', junto=False)
    caixa(VERMELHO[q], f'soldado-vermelho-{q}', junto=False)
    hsv = cv2.cvtColor(azul[..., :3], cv2.COLOR_BGR2HSV)
    alvo = (hsv[..., 0] >= 95) & (hsv[..., 0] <= 135) & (hsv[..., 1] > 70)
    for cor, (h, luz) in TINTAS.items():
        n = hsv.copy()
        n[..., 0][alvo] = h
        n[..., 2][alvo] = np.clip(n[..., 2][alvo] * luz, 0, 255).astype(np.uint8)
        im = azul.copy()
        im[..., :3] = cv2.cvtColor(n, cv2.COLOR_HSV2BGR)
        salvar(im, f'soldado-{cor}-{q}')

# ---- zumbis (de frente pra direita): anda-N, morre (caindo), morto (no chão)
ZUMBIS = {
    'comum': ([(13, 206, 66, 90), (84, 205, 70, 90), (158, 204, 72, 92), (239, 204, 75, 93), (326, 205, 89, 89), (418, 206, 82, 89),
               (508, 207, 71, 88), (588, 208, 72, 86), (670, 205, 68, 89), (752, 205, 79, 89)], (841, 245, 91, 47), (938, 247, 96, 48)),
    'capacete': ([(14, 304, 77, 102), (98, 303, 78, 104), (185, 304, 70, 101), (264, 308, 76, 99), (341, 307, 85, 100), (441, 312, 81, 93),
                  (523, 302, 83, 102), (610, 304, 72, 100), (690, 303, 77, 101), (781, 303, 76, 101)], (865, 328, 123, 76), (865, 328, 123, 76)),
    'gordo': ([(7, 414, 95, 113), (118, 413, 107, 114), (240, 415, 101, 112), (357, 409, 116, 118), (481, 409, 140, 118), (626, 412, 80, 115),
               (713, 408, 127, 119)], (960, 450, 77, 76), (960, 450, 77, 76)),
    'cachorro': ([(7, 537, 123, 57), (144, 537, 120, 59), (275, 539, 121, 56), (418, 537, 124, 58), (559, 538, 122, 58), (701, 538, 119, 55)],
                 (828, 548, 123, 41), (828, 548, 123, 41)),
}
for nome, (anda, morre, morto) in ZUMBIS.items():
    for k, c in enumerate(anda):
        caixa(c, f'zumbi-{nome}-anda-{k}', junto=False)
    caixa(morre, f'zumbi-{nome}-morre', limiar=60)
    caixa(morto, f'zumbi-{nome}-morto', limiar=60)
caixa((1136, 298, 253, 230), 'zumbi-gigante-anda-0', junto=False, limiar=60)
caixa((1351, 322, 183, 204), 'zumbi-gigante-bate', junto=False, limiar=60)
caixa((857, 428, 88, 98), 'zumbi-magro', junto=False)
caixa((1049, 253, 55, 43), 'pedacos', limiar=40)
caixa((1002, 377, 78, 25), 'pedacos-2', limiar=40)

# ---- armas e itens
for nome, c, kw in [('arma-metralhadora', (1168, 5, 93, 38), {}), ('arma-fuzil', (1284, 5, 113, 38), {}), ('arma-escopeta', (1166, 47, 125, 41), {}),
                    ('arma-pistola', (1307, 47, 96, 39), {}), ('arma-bazuca', (1167, 97, 144, 42), {}), ('foguete', (1419, 45, 105, 26), {}),
                    ('foguete-rastro', (1344, 128, 180, 35), dict(limiar=40)), ('municao', (1164, 140, 32, 52), {}), ('granada', (1211, 147, 36, 46), {}),
                    ('bala', (1264, 151, 55, 13), {}), ('kit', (1441, 179, 47, 47), {}), ('gasolina', (1498, 178, 26, 49), {}), ('capsula', (1168, 212, 28, 23), {})]:
    caixa(c, nome, **kw)
# ---- plataformas e cenário
for nome, c in [('chao-0', (15, 604, 74, 54)), ('chao-1', (97, 604, 97, 54)), ('chao-2', (203, 604, 161, 58)), ('bloco-0', (14, 668, 85, 71)),
                ('bloco-1', (105, 668, 88, 71)), ('bloco-2', (198, 668, 151, 75)), ('ilha-0', (374, 604, 125, 101)), ('ilha-1', (502, 677, 68, 73)),
                ('barril-explosivo', (15, 747, 52, 69)), ('barril-vermelho', (82, 747, 50, 69)), ('barril-azul', (146, 747, 58, 70)),
                ('barril-verde', (219, 746, 47, 70)), ('barril-cinza', (362, 752, 42, 60)), ('caixa-0', (286, 754, 61, 57)), ('caixa-1', (925, 606, 54, 56)),
                ('caixa-2', (853, 650, 59, 56)), ('sacos', (413, 759, 95, 48)), ('sacos-2', (1101, 824, 78, 48)), ('caminhao', (525, 760, 203, 108)),
                ('van', (1175, 770, 187, 75)), ('pneus', (1377, 794, 59, 48)), ('pneu', (1312, 764, 69, 38)), ('barreira', (1417, 710, 100, 53)),
                ('poste', (1258, 570, 48, 110)), ('poste-2', (1428, 568, 37, 136)), ('torre', (1332, 546, 82, 216)), ('escada', (922, 668, 39, 132)),
                ('cerca', (970, 672, 106, 65)), ('grade', (1193, 689, 86, 72)), ('palmeira', (977, 728, 116, 139)), ('moita', (859, 774, 66, 48)),
                ('moita-2', (1070, 760, 93, 58)), ('concreto', (1451, 818, 75, 63)), ('laje', (1191, 852, 55, 23)), ('mesa', (85, 826, 108, 51))]:
    caixa(c, nome)
# ---- explosão (do maior pro menor), fogo, fumaça, clarões, rastros
for k, c in enumerate([(13, 887, 76, 75), (100, 891, 77, 71), (186, 892, 69, 69)]):
    caixa(c, f'explosao-{k}', limiar=60)
for k, c in enumerate([(266, 967, 34, 44), (316, 969, 30, 41), (363, 971, 26, 39), (405, 970, 38, 42)]):
    caixa(c, f'fogo-{k}', limiar=40)
for k, c in enumerate([(21, 968, 47, 41), (87, 968, 45, 40), (149, 969, 44, 43), (208, 968, 42, 41), (602, 890, 41, 52)]):
    caixa(c, f'fumaca-{k}', limiar=40)
for k, c in enumerate([(1162, 885, 66, 43), (1248, 888, 49, 36), (1369, 889, 42, 35), (1012, 891, 40, 31)]):
    caixa(c, f'clarao-{k}', limiar=40)
for nome, c in [('rastro', (879, 936, 118, 26)), ('rastro-2', (1353, 935, 131, 32)), ('chama', (1035, 965, 98, 47)), ('poeira', (1146, 975, 72, 37)),
                ('poeira-2', (1259, 978, 75, 33))]:
    caixa(c, nome, limiar=40)

# capa da vitrine: noite, lua, prédios, um soldado atirando e zumbis vindo
W, H = 620, 544
y = np.arange(H)[:, None] / H
capa = np.repeat((np.array([60, 25, 20]) * (1 - y) + np.array([40, 60, 110]) * y)[:, None, :], W, axis=1).astype(np.float32)
cv2.circle(capa, (470, 120), 80, (190, 235, 250), -1)
cv2.circle(capa, (450, 105), 18, (170, 215, 235), -1)
rng = np.random.default_rng(3)
for x in range(0, W, 46):
    h = int(rng.integers(120, 260))
    cv2.rectangle(capa, (x, H - 120 - h), (x + 40, H), (35, 28, 30), -1)
    for wy in range(H - 110 - h, H - 130, 22):
        for wx in (x + 8, x + 24):
            if rng.random() < 0.35:
                cv2.rectangle(capa, (wx, wy), (wx + 7, wy + 10), (80, 200, 255), -1)


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
for x in range(-20, W + 80, 150):
    colar(ler('chao-2'), x, H, 70)
colar(ler('zumbi-gigante-anda-0'), 470, 490, 260, True)
colar(ler('zumbi-comum-anda-3'), 360, 490, 130, True)
colar(ler('zumbi-cachorro-anda-2'), 560, 495, 70, True)
colar(ler('explosao-0'), 300, 300, 110)
colar(ler('soldado-azul-mira'), 140, 490, 170)
colar(ler('clarao-0'), 255, 400, 50)
cv2.imwrite(str(saida / 'capa.webp'), cv2.resize(capa.astype(np.uint8), (310, 272), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.webp'))), 'sprites')
