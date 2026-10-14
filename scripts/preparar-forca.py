# Prepara a Forca a partir da maquete "Forca Online no Velho Oeste (1).png" (1024x1536):
#   python3 scripts/preparar-forca.py <maquete.png>
# Precisa de numpy e opencv (só aqui, pra preparar as imagens; o jogo não usa):
#   python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless pillow
#   /tmp/venv/bin/python scripts/preparar-forca.py <maquete.png>
#
# 1) recorta o caubói do cenário (GrabCut com dicas de frente/fundo) e o
#    separa em 7 pedaços — chapéu, cabeça, tronco, braços e pernas — cada um
#    com a junta de onde ele se solta (pecas.json, coordenadas da maquete);
# 2) tapa o buraco do caubói no cenário (inpaint) e apaga o que o jogo
#    redesenha: tema, tempo, corações, saldo, engrenagem;
# 3) a lousa da palavra sem as letras.
# ponytail: polígonos medidos nesta maquete; maquete nova = medir de novo.
import json
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/forca'
saida.mkdir(parents=True, exist_ok=True)
im = cv2.imread(sys.argv[1])
assert im.shape[:2] == (1536, 1024), f'maquete inesperada: {im.shape}'
H, W = im.shape[:2]

# ---- 1) o caubói
mask = np.full((H, W), cv2.GC_BGD, np.uint8)
mask[246:752, 480:714] = cv2.GC_PR_FGD
for (a, b, c, d) in [(575, 330, 655, 430), (570, 460, 670, 540), (560, 560, 640, 640), (620, 600, 660, 650), (540, 260, 690, 300)]:
    mask[b:d, a:c] = cv2.GC_FGD           # miolo: certamente caubói
mask[246:262, 612:648] = cv2.GC_BGD        # a corda acima do chapéu fica no cenário
mask[748:752, :] = cv2.GC_BGD
for (a, b, c, d) in [(480, 410, 542, 640), (480, 640, 537, 752), (480, 714, 592, 752), (690, 372, 714, 752), (646, 694, 714, 752), (480, 246, 500, 300), (684, 352, 714, 430), (526, 560, 545, 640), (598, 606, 610, 648)]:
    mask[b:d, a:c] = cv2.GC_BGD            # as luzes do fundo têm a cor do caubói
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(im, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
fg = np.where(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
# da cintura pra baixo: o roxo-lilás pouco saturado é o céu entre as pernas, não a calça (azul e saturada)
hsv_im = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
ceu = (hsv_im[..., 0] >= 125) & (hsv_im[..., 0] <= 168) & (hsv_im[..., 1] < 150) & (hsv_im[..., 2] > 45)
ceu[:553] = False
ceu = cv2.morphologyEx(ceu.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
fg[ceu] = 0
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
fg = np.where(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
# fecha furinhos dentro do caubói (sem colar de volta o vão entre as pernas)
furos = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
fg = np.where(ceu, fg, furos).astype(np.uint8)
alfa = cv2.GaussianBlur(fg, (3, 3), 0)

# pedaços: o primeiro polígono que pega o pixel leva (ordem importa); o resto é o tronco.
# Os cortes seguem o corpo: braço pela costura do ombro e o suspensório, perna pela
# virilha e o contorno da coxa (sem pegar a bota da outra), pescoço pela barba.
POLI = {
    'chapeu': [(482, 246), (714, 246), (714, 345), (690, 352), (668, 345), (655, 330), (600, 326), (565, 330), (548, 345), (540, 372), (538, 400), (482, 410)],
    'cabeca': [(538, 372), (548, 345), (565, 330), (600, 326), (655, 330), (668, 345), (690, 352), (684, 410), (672, 432), (652, 444), (628, 450), (600, 450), (580, 444), (560, 432), (536, 405)],
    'braco-e': [(534, 452), (544, 440), (556, 434), (570, 436), (578, 446), (580, 470), (578, 500), (580, 528), (584, 550), (534, 550)],
    'braco-d': [(700, 452), (690, 440), (678, 434), (664, 436), (656, 446), (654, 470), (656, 500), (654, 528), (650, 550), (700, 550)],
    'perna-e': [(528, 554), (560, 558), (590, 557), (607, 554), (604, 580), (603, 606), (598, 640), (604, 664), (611, 684), (606, 703), (592, 718), (528, 722)],
    # tudo abaixo do quadril que não é da esquerda (senão sobra um fiapo do tronco entre as pernas)
    'perna-d': [(596, 553), (714, 553), (714, 752), (528, 752), (528, 612), (596, 612)],
    'tronco': [(482, 246), (714, 246), (714, 752), (482, 752)],
}
# junta: de onde o pedaço se solta (e gira ao cair); 'cabeca' fica na corda
JUNTA = {'chapeu': (600, 300), 'cabeca': (612, 440), 'braco-e': (562, 448), 'braco-d': (672, 448),
         'perna-e': (580, 558), 'perna-d': (640, 558), 'tronco': (612, 444)}
rnd = np.random.default_rng(7)


def rasgar(pts, passo=5, amp=3.2):
    """Corte rasgado: subdivide as arestas e empurra cada ponto pro lado com ruído suave."""
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(np.hypot(x1 - x0, y1 - y0) / passo))
        nx, ny = -(y1 - y0), x1 - x0
        nn = np.hypot(nx, ny) or 1
        ruido = np.convolve(rnd.normal(0, 1, n + 4), np.ones(3) / 3, 'same')[2:n + 2]
        for k in range(n):
            t = k / n
            out.append((x0 + (x1 - x0) * t + nx / nn * ruido[k] * amp, y0 + (y1 - y0) * t + ny / nn * ruido[k] * amp))
    return out


dono = np.zeros((H, W), np.uint8)
ordem = list(POLI)
for k, nome in enumerate(ordem):
    m = np.zeros((H, W), np.uint8)
    pts = POLI[nome] if nome in ('chapeu', 'tronco') else rasgar(POLI[nome])   # chapéu sai inteiro
    cv2.fillPoly(m, [np.round(np.array(pts)).astype(np.int32)], 255)
    dono[(m > 0) & (dono == 0)] = k + 1
fgm = fg > 0
rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
pecas, tocos = {}, {}


def salvar(nome, img, sel):
    ys, xs = np.where(sel)
    x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
    cv2.imwrite(str(saida / f'{nome}.png'), img[y0:y1, x0:x1])
    return {'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)}


for k, nome in enumerate(ordem):
    sel = (dono == k + 1) & fgm
    p = rgba.copy()
    p[..., 3] = np.where(sel, alfa, 0)
    pecas[nome] = {**salvar(nome, p, sel), 'jx': JUNTA[nome][0], 'jy': JUNTA[nome][1]}

# ---- feridas: só nas juntas de verdade (onde as pernas só se encostam no desenho não é corte)
OMBRO = 468   # abaixo disso o braço só encosta no corpo
CORTES = [('braco-e', 'tronco'), ('braco-d', 'tronco'), ('perna-e', 'tronco'), ('perna-d', 'tronco'), ('tronco', 'cabeca')]
largura = cv2.resize(rnd.uniform(7, 13, (H // 10 + 1, W // 10 + 1)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
fibra = cv2.resize(rnd.uniform(0, 1, (H // 2 + 1, W // 2 + 1)).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
coagulo = cv2.resize(rnd.uniform(0, 1, (H // 6 + 1, W // 6 + 1)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)


def ferida(lado, borda, osso=True, escorre=True):
    """Carne viva no `lado` ao longo da `borda` do corte: borda escura, vermelho vivo, fibra rosada,
    coágulos, o osso no meio e uns escorridos descendo. Devolve RGBA (H, W)."""
    dist = cv2.distanceTransform((~borda).astype(np.uint8), cv2.DIST_L2, 3)
    faixa = lado & (dist < largura)
    t = np.clip(dist / largura, 0, 1)[..., None]
    escuro, vivo, carne, clot = np.array([14, 8, 70]), np.array([30, 24, 205]), np.array([110, 120, 240]), np.array([10, 6, 95])
    cor = vivo * (1 - t * 0.55) + escuro * t * 0.55        # vermelho vivo no corte, escurecendo pra dentro
    cor = np.where((fibra[..., None] > 0.62) & (t < 0.55), carne, cor)   # fibras de músculo
    cor = np.where((coagulo[..., None] > 0.7), clot, cor)    # coágulos
    cor = np.where(dist[..., None] < 1.3, escuro, cor)       # contorno do talho
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = np.clip(cor, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(faixa, np.clip((largura - dist) * 90, 0, 255), 0).astype(np.uint8)
    ys, xs = np.where(borda)
    if escorre:   # escorridos: descem do corte por dentro do corpo
        for _ in range(max(2, len(xs) // 40)):
            i = rnd.integers(len(xs)); x, y = int(xs[i]), int(ys[i])
            comp = int(rnd.uniform(10, 34))
            for d in range(comp):
                yy, xx = y + d, x + int(np.sin(d / 6) * 1.5)
                if 0 <= yy < H and lado[yy, xx]:
                    w = 2 if d < comp - 4 else 3
                    out[yy, xx - w // 2:xx + w // 2 + 1] = (14, 10, 130 - min(60, d * 2), 255)
    if osso:
        cx, cy = xs.mean(), ys.mean()
        i = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
        cx, cy = int(xs[i]), int(ys[i])
        o = np.zeros((H, W), np.uint8)
        cv2.ellipse(o, (cx, cy), (8, 6), 0, 0, 360, 255, -1)
        o = (o > 0) & lado
        out[o] = (196, 220, 236, 255)
        miolo = np.zeros((H, W), np.uint8)
        cv2.ellipse(miolo, (cx, cy), (3, 2), 0, 0, 360, 255, -1)
        out[(miolo > 0) & o] = (60, 60, 150, 255)
        contorno = (cv2.dilate(o.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~o & lado
        out[contorno] = (30, 30, 80, 255)
    return out


vizinho = lambda m: cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
mascara = lambda nome: (dono == ordem.index(nome) + 1) & fgm
bordas_de = {n: np.zeros((H, W), bool) for n in ordem}
for a, b in CORTES:
    ma, mb = mascara(a), mascara(b)
    ba, bb = ma & vizinho(mb), mb & vizinho(ma)
    if a.startswith('braco'):   # o braço encosta no corpo até a cintura; arrancado, a ferida é só no ombro
        ba[OMBRO:], bb[OMBRO:] = False, False
    assert ba.sum() > 6, f'{a} não encosta em {b}'
    bordas_de[a] |= ba
    # o toco que fica em `b` quando `a` sai
    t = ferida(mb, bb, osso=True, escorre=b != 'cabeca')
    tocos[f'{a}>{b}'] = salvar(f'toco-{a}-{b}', t, t[..., 3] > 0)
for nome in ('braco-e', 'braco-d', 'perna-e', 'perna-d', 'tronco'):
    if nome == 'tronco':   # o tronco caído mostra o pescoço e os ombros/quadris (os membros já foram)
        for a, b in CORTES:
            if b == 'tronco':
                m = mascara('tronco') & vizinho(mascara(a))
                if a.startswith('braco'):
                    m[OMBRO:] = False
                bordas_de['tronco'] |= m
    f = ferida(mascara(nome), bordas_de[nome], osso=True, escorre=False)
    v = pecas[nome]
    cv2.imwrite(str(saida / f'ferida-{nome}.png'), f[v['y']:v['y'] + v['h'], v['x']:v['x'] + v['w']])

# ---- cabelo no topo da cabeça (o chapéu cobria): tufos e fios, aparece quando ele voa
cab = np.zeros((H, W, 4), np.uint8)
mc = np.zeros((H, W), np.uint8)
contorno_cab = [(548, 360), (552, 344), (566, 330), (584, 322), (600, 318), (612, 322), (626, 316), (642, 322), (656, 330), (668, 344), (674, 360), (660, 352), (640, 344), (612, 340), (584, 344), (562, 352)]
cv2.fillPoly(mc, [np.array(rasgar(contorno_cab, passo=4, amp=2.5)).round().astype(np.int32)], 255)
cab[mc > 0] = (30, 44, 66, 255)
for k in range(70):   # fios, alguns mais claros
    x = int(rnd.uniform(556, 668)); y0 = int(rnd.uniform(318, 336))
    cor = (48, 70, 100, 255) if k % 3 == 0 else (16, 22, 36, 255)
    cv2.line(cab, (x, y0), (x + int(rnd.uniform(-10, 10)), y0 + int(rnd.uniform(10, 24))), cor, 1)
cab[..., 3] = np.where(mc > 0, 255, 0)
borda_c = (cv2.dilate(mc, np.ones((3, 3), np.uint8)) > 0) & (mc == 0)
cab[borda_c] = (10, 10, 16, 255)
cab[..., 3] = np.where((mc > 0) | borda_c, 255, 0)
pecas['cabelo'] = {**salvar('cabelo', cab, cab[..., 3] > 0), 'jx': 612, 'jy': 340}

# ---- 2) o cenário sem o caubói e sem o que o jogo redesenha
buraco = cv2.dilate(fg, np.ones((9, 9), np.uint8))
for (a, b, c, d) in [(64, 342, 360, 400), (68, 462, 244, 534), (62, 530, 362, 564), (60, 624, 366, 698), (540, 10, 906, 92), (910, 2, 1014, 94)]:
    buraco[b:d, a:c] = 255
fundo = cv2.inpaint(im, buraco, 11, cv2.INPAINT_TELEA)
cau = cv2.dilate(fg, np.ones((15, 15), np.uint8)) > 0
valido = (~cau).astype(np.float32)
soma = cv2.GaussianBlur(im.astype(np.float32) * valido[..., None], (0, 0), 28)
peso = cv2.GaussianBlur(valido, (0, 0), 28)[..., None]
liso = soma / np.maximum(peso, 1e-3)
suave = cv2.GaussianBlur(cau.astype(np.float32), (0, 0), 6)[..., None]
grao = rnd.normal(0, 3, im.shape).astype(np.float32)   # um pouco de grão pra não parecer liso demais
fundo = np.clip(fundo * (1 - suave) + (liso + grao) * suave, 0, 255).astype(np.uint8)

# ---- 3) a lousa: apaga as letras e os tracinhos (tudo claro dentro da moldura)
hsv = cv2.cvtColor(fundo, cv2.COLOR_BGR2HSV)
letras = np.zeros((H, W), np.uint8)
regiao = hsv[832:972, 108:922, 2] > 120
letras[832:972, 108:922][regiao] = 255
fundo = cv2.inpaint(fundo, cv2.dilate(letras, np.ones((7, 7), np.uint8)), 7, cv2.INPAINT_TELEA)
cv2.imwrite(str(saida / 'fundo.webp'), fundo, [cv2.IMWRITE_WEBP_QUALITY, 86])

# ---- capa do tile (310x272): o logo e o caubói da maquete
capa = cv2.resize(im[20:860, 0:1024], (310, 254), interpolation=cv2.INTER_AREA)
capa = cv2.copyMakeBorder(capa, 9, 9, 0, 0, cv2.BORDER_CONSTANT, value=(20, 12, 8))
cv2.imwrite(str(saida / 'capa.webp'), capa, [cv2.IMWRITE_WEBP_QUALITY, 88])
json.dump({'pecas': pecas, 'tocos': tocos}, open(saida / 'pecas.json', 'w'), indent=1)
print('pedaços:', ', '.join(pecas), '| tocos:', ', '.join(tocos))
