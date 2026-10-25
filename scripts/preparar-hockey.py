# Prepara o Air Hockey Neon a partir da prancha:
#   python3 scripts/preparar-hockey.py "<Prancha de Sprites Neon de Air Hockey.png>"
# Prancha 1182x1330 com alfa de verdade (o brilho neon é meio transparente: fica).
# ponytail: caixas medidas nesta prancha; prancha nova = medir de novo.
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/hockey'
saida.mkdir(parents=True, exist_ok=True)
a = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
assert a.shape == (1330, 1182, 4), f'prancha inesperada: {a.shape}'
Q = [cv2.IMWRITE_WEBP_QUALITY, 92]


def apara(p):
    ys, xs = np.where(p[..., 3] > 6)
    return p[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def corte(nome, x0, y0, x1, y1, esc=1.0, aparar=True):
    p = a[y0:y1, x0:x1].copy()
    if aparar:
        p = apara(p)
    if esc != 1.0:
        p = cv2.resize(p, None, fx=esc, fy=esc, interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(str(saida / f'{nome}.webp'), p, Q)
    return p


# mesa vazia, ampliada 2x (o brilho neon disfarça a ampliação). Campo (medido na 2x): x 100..610, y 108..828.
# A linha do meio da arte fica em 452 (a borda de baixo tem perspectiva): estica a metade de cima e encolhe a
# de baixo pra ela cair em 468, o meio exato do campo — senão um lado teria campo maior que o outro.
mesa = cv2.resize(a[0:495, 0:355], None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
ys = np.arange(mesa.shape[0], dtype=np.float32)
fonte = np.where(ys < 108, ys, np.where(ys < 468, 108 + (ys - 108) * (452 - 108) / (468 - 108),
                 np.where(ys < 828, 452 + (ys - 468) * (828 - 452) / (828 - 468), ys)))
mx, my = np.meshgrid(np.arange(mesa.shape[1], dtype=np.float32), fonte.astype(np.float32))
mesa = cv2.remap(mesa, mx, my, cv2.INTER_LINEAR)
cv2.imwrite(str(saida / 'mesa.webp'), mesa, Q)

# os tacos (vistos de 3/4): o aro de baixo é o que bate no disco
CORES = ['vermelho', 'azul', 'verde', 'amarelo']
for cor, x in zip(CORES, [8, 168, 330, 493]):
    corte(f'taco-{cor}', x, 492, x + 152, 626, esc=1.4)

# disco visto de cima: a cabeça do disco com rastro, sem o rastro (círculo com brilho que some)
x0, y0, x1, y1 = 1078, 736, 1150, 808
p = a[y0:y1, x0:x1].astype(np.float32)
cx, cy = 1114 - x0, 776 - y0
yy, xx = np.mgrid[0:p.shape[0], 0:p.shape[1]]
d = np.hypot(xx - cx, yy - cy)
p[..., 3] *= np.clip((33 - d) / 9, 0, 1)
disco = cv2.resize(apara(p.astype(np.uint8)), None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
cv2.imwrite(str(saida / 'disco.webp'), disco, Q)
# disco em pé (rolando de lado): pro saque e o placar
corte('disco-lado', 18, 745, 125, 835, esc=1.2)

# explosões (gol e batida) e anéis
for nome, c in [('explode-azul', (0, 838, 165, 985)), ('explode-vermelho', (166, 838, 334, 985)), ('explode-verde', (336, 838, 502, 985)),
                ('explode-amarelo', (503, 838, 672, 985)), ('anel-vermelho', (685, 845, 810, 975)), ('faisca-azul', (815, 850, 910, 970)),
                ('faisca-verde', (910, 850, 1025, 970)), ('explode-vermelho-2', (1028, 838, 1182, 985)),
                ('aro-azul', (5, 975, 165, 1185)), ('aro-vermelho', (170, 975, 325, 1185))]:
    corte(nome, *c, esc=1.4)

# placares: tira o "0" pintado (o número é desenhado no jogo)
for cor, x in zip(CORES, [462, 594, 719, 843]):
    p = a[1182:1322, x:x + 132].copy()
    p[:7, :, 3] = 0   # o rastro amarelo de cima vaza aqui
    m = np.zeros(p.shape[:2], np.uint8)
    cv2.rectangle(m, (44, 34), (88, 104), 255, -1)
    p[..., :3] = cv2.inpaint(p[..., :3], m, 9, cv2.INPAINT_TELEA)
    fundo = p[60:80, 26:36, :3].reshape(-1, 3).mean(0)
    k = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 4)[..., None]
    p[..., :3] = (p[..., :3] * (1 - k) + fundo * k).astype(np.uint8)
    cv2.imwrite(str(saida / f'placar-{cor}.webp'), apara(p), Q)

# gols (barras de cima da prancha): acendem quando sai gol
corte('gol-vermelho', 718, 0, 1162, 98)
corte('gol-azul', 718, 100, 1162, 200)

# capa do lobby: a mesa com jogada, deitada, sobre o escuro com brilho
jog = apara(a[0:495, 360:712].copy())
jog = cv2.rotate(jog, cv2.ROTATE_90_CLOCKWISE)
W, H = 310, 272
esc = min((W - 16) / jog.shape[1], (H - 16) / jog.shape[0])
jog = cv2.resize(jog, None, fx=esc, fy=esc, interpolation=cv2.INTER_AREA).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
brilho = np.exp(-(((xx - W / 2) / 170) ** 2 + ((yy - H / 2) / 120) ** 2))[..., None]
capa = np.zeros((H, W, 3), np.float32) + [30, 10, 18] + brilho * [120, 40, 90]
ox, oy = (W - jog.shape[1]) // 2, (H - jog.shape[0]) // 2
al = jog[..., 3:] / 255
capa[oy:oy + jog.shape[0], ox:ox + jog.shape[1]] = capa[oy:oy + jog.shape[0], ox:ox + jog.shape[1]] * (1 - al) + jog[..., :3] * al
cv2.imwrite(str(saida / 'capa.webp'), np.clip(capa, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(list(saida.glob('*.webp'))), 'imagens')
