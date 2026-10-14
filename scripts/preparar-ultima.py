# Prepara a Última Carta a partir de três imagens:
#   python3 scripts/preparar-ultima.py <grade.png> <cartela.png> <maquete.png>
#   grade   = "Cartas coloridas estilo UNO em grade.png" (1536x1024): as 54 faces
#   cartela = "Cartela de assets para jogo UNO multijogador (1).png" (1536x1024):
#             os 4 personagens com expressões, monte, emojis, troféus, brilhos
#   maquete = "Duelo UNO na Sala Tropical (2).png" (941x1672): a sala (fundo)
# Precisa de numpy e opencv (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless
#
# A grade não tem transparência (o xadrez é desenhado): cada carta é achada
# pela cor dentro da célula e recortada com cantos arredondados. As cartas com
# o logo "UNO" (verso e leque) NÃO são usadas: o verso é desenhado no jogo.
# ponytail: células medidas nestas imagens; imagem nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/ultima'
saida.mkdir(parents=True, exist_ok=True)
grade = cv2.imread(sys.argv[1])
assert grade.shape[:2] == (1024, 1536), f'grade inesperada: {grade.shape}'
cartela = cv2.imread(sys.argv[2], cv2.IMREAD_UNCHANGED)
maq = cv2.imread(sys.argv[3])
assert maq.shape[:2] == (1672, 941), f'maquete inesperada: {maq.shape}'

LARG, ALT = 120, 168     # tamanho final de cada carta (proporção da folha)


def carta(x0, y0, x1, y1, nome):
    cel = grade[y0:y1, x0:x1]
    hsv = cv2.cvtColor(cel, cv2.COLOR_BGR2HSV)
    m = (((hsv[..., 1] > 90) & (hsv[..., 2] > 80)) | (hsv[..., 2] < 70)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    # a oval branca parte a cor em pedaços: junta todos os pedaços grandes
    area = st[1:, cv2.CC_STAT_AREA]
    ks = 1 + np.nonzero(area > area.max() * 0.15)[0]
    bx, by = st[ks, 0].min(), st[ks, 1].min()
    bw, bh = (st[ks, 0] + st[ks, 2]).max() - bx, (st[ks, 1] + st[ks, 3]).max() - by
    pad = 4                                   # a bordinha branca em volta da cor
    bx, by = max(0, bx - pad), max(0, by - pad)
    bw, bh = min(cel.shape[1] - bx, bw + 2 * pad), min(cel.shape[0] - by, bh + 2 * pad)
    face = cv2.resize(cel[by:by + bh, bx:bx + bw], (LARG, ALT), interpolation=cv2.INTER_AREA)
    alfa = np.zeros((ALT, LARG), np.uint8)
    r = 13
    cv2.rectangle(alfa, (r, 0), (LARG - 1 - r, ALT - 1), 255, -1)
    cv2.rectangle(alfa, (0, r), (LARG - 1, ALT - 1 - r), 255, -1)
    for cx, cy in [(r, r), (LARG - 1 - r, r), (r, ALT - 1 - r), (LARG - 1 - r, ALT - 1 - r)]:
        cv2.circle(alfa, (cx, cy), r, 255, -1)
    alfa = cv2.GaussianBlur(alfa, (3, 3), 0)
    out = cv2.cvtColor(face, cv2.COLOR_BGR2BGRA)
    out[..., 3] = alfa
    cv2.imwrite(str(saida / f'{nome}.png'), out)


COLS = [75, 206, 337, 469, 601, 732, 864, 995, 1127, 1258]
LINHAS = [('r', 5, 162), ('y', 160, 318), ('g', 316, 474), ('b', 472, 632)]
for cor, y0, y1 in LINHAS:
    for v, x in enumerate(COLS):
        carta(x - 8, y0, x + 126, y1, f'{cor}{v}')
# ações: 3 blocos de 4 (pula, inverte, +2), cada bloco nas cores r y g b
for v, (x0, x1) in zip(['s', 'r', '+2'], [(58, 530), (543, 1006), (1024, 1478)]):
    passo = (x1 - x0) / 4
    for k, cor in enumerate('rygb'):
        carta(int(x0 + k * passo), 632, int(x0 + (k + 1) * passo), 802, f'{cor}{v}')
carta(65, 804, 207, 992, 'ww')
carta(210, 804, 338, 992, 'w+4')

# ---- da cartela: personagens (expressões), monte, emojis, troféu, coroa, brilhos, anéis
def corte(x0, y0, x1, y1, nome, so_maior=False):
    p = cartela[y0:y1, x0:x1].copy()
    if p.shape[2] == 3:
        p = cv2.cvtColor(p, cv2.COLOR_BGR2BGRA)
    al = p[..., 3]
    m = (al >= 215).astype(np.uint8)        # a cartela tem um fundo falso meio transparente (alfa < 215)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    manter = [1 + int(np.argmax(st[1:, 4]))] if so_maior else [i for i in range(1, n) if st[i, 4] > 30]
    p[..., 3] = np.where(np.isin(lab, manter), 255, 0).astype(np.uint8)
    p[..., 3] = cv2.GaussianBlur(p[..., 3], (3, 3), 0)
    ys, xs = np.where(p[..., 3] > 0)
    cv2.imwrite(str(saida / f'{nome}.png'), p[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


# expressões: normal, piscada, riso, joinha, festa, bravo, susto
PERSONAGENS = {
    'lucas': (15, [(15, 150), (155, 290), (293, 410), (420, 545), (545, 700), (700, 815), (825, 945)], 148),
    'mariana': (148, [(5, 150), (152, 285), (282, 410), (412, 545), (540, 690), (690, 822), (822, 955)], 285),
    'gabriel': (283, [(8, 140), (142, 270), (272, 400), (400, 532), (532, 664), (664, 795), (795, 920)], 420),
    'rafael': (420, [(10, 140), (140, 270), (270, 400), (525, 660)], 550),
}
EXPR = ['normal', 'pisca', 'riso', 'joia', 'festa', 'bravo', 'susto']
for nome, (y0, xs, y1) in PERSONAGENS.items():
    for k, (x0, x1) in enumerate(xs):
        e = EXPR[k] if nome != 'rafael' else ['normal', 'joia', 'riso', 'susto'][k]
        corte(x0, y0, x1, y1, f'{nome}-{e}', so_maior=True)
for nome, cx in {'monte': (968, 8, 1090, 232), 'trofeu': (1010, 750, 1090, 835), 'coroa': (1262, 760, 1345, 820), 'estrela': (1352, 752, 1430, 822),
                 'brilho-0': (1035, 840, 1110, 910), 'brilho-1': (1118, 835, 1205, 912), 'rastro-0': (700, 830, 870, 905),
                 'rastro-1': (850, 830, 965, 910), 'rastro-2': (920, 835, 1030, 915), 'moeda': (1210, 828, 1290, 908),
                 'emoji-riso': (102, 905, 172, 975), 'emoji-uau': (185, 905, 250, 975), 'emoji-bravo': (260, 905, 330, 975), 'emoji-choro': (340, 900, 410, 975),
                 'anel-verde': (452, 905, 535, 990), 'anel-amarelo': (538, 905, 622, 990), 'anel-vermelho': (640, 905, 725, 990),
                 'mesa-b': (15, 545, 272, 748), 'mesa-r': (272, 545, 522, 748), 'mesa-g': (520, 545, 762, 748), 'mesa-y': (755, 545, 1008, 748)}.items():
    corte(*cx, nome, so_maior=not nome.startswith(('rastro', 'brilho')))

# ---- fundo: a sala da maquete bem desfocada e escurecida (a mesa colorida é desenhada no jogo,
# na cor que estiver valendo; a mesa roxa da cartela faz o papel do amarelo)
fundo = cv2.GaussianBlur(maq, (0, 0), 18)
fundo = cv2.convertScaleAbs(fundo, alpha=0.55, beta=0)
cv2.imwrite(str(saida / 'fundo.webp'), fundo, [cv2.IMWRITE_WEBP_QUALITY, 80])
capa = cv2.resize(maq[560:1500, 30:911], (310, 272), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(saida / 'capa.webp'), capa, [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.png'))), 'imagens')
