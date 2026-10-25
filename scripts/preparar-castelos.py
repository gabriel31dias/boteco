# Prepara os heróis de Castelos em Guerra a partir da cartela gerada:
#   python3 scripts/preparar-castelos.py "<Cartela de Monstros Fantásticos em Ação.png>"
#   folha 1536x1024 com alfa: 4 linhas (canhoneiro, metralha, bombardeiro, cavador) x 5 colunas
#   (parado, mira, tiro, dano, caido), todos olhando pra direita.
# Precisa de numpy e opencv (só aqui): python3 -m venv /tmp/venv && /tmp/venv/bin/pip install numpy opencv-python-headless
# ponytail: grade fixa de 5x4 desta folha; folha nova com outra grade = mudar COLS/LINHAS.
import json
import sys
from pathlib import Path
import cv2
import numpy as np

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/castelos'
saida.mkdir(parents=True, exist_ok=True)
folha = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
assert folha.shape[:2] == (1024, 1536) and folha.shape[2] == 4, f'folha inesperada: {folha.shape}'

HEROIS = ['canhoneiro', 'metralha', 'bombardeiro', 'cavador']
POSES = ['parado', 'mira', 'tiro', 'dano', 'caido']
COLS, LINHAS = len(POSES), len(HEROIS)
cw, ch = folha.shape[1] / COLS, folha.shape[0] / LINHAS


def componentes(folha):
    m = cv2.morphologyEx((folha[..., 3] >= 120).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    _, lab, st, cen = cv2.connectedComponentsWithStats(m)
    return lab, st, cen


def recortar(folha, cw, ch, celulas):
    """Uma pose por célula (col, lin): mesmo enquadramento pra todas (o pé não pula quando troca de pose).
    Pedaços cujo centro cai na célula (estrelas, bomba voando, lascas) vão junto da pose."""
    lab, st, cen = componentes(folha)
    ids = [[i for i in range(1, len(st)) if st[i, 4] > 300 and int(cen[i][0] // cw) == c and int(cen[i][1] // ch) == l] for c, l in celulas]
    assert all(ids), f'pose vazia em {celulas}'
    rel = []
    for (c, l), cel in zip(celulas, ids):
        x0 = min(st[i, 0] for i in cel); y0 = min(st[i, 1] for i in cel)
        x1 = max(st[i, 0] + st[i, 2] for i in cel); y1 = max(st[i, 1] + st[i, 3] for i in cel)
        rel.append((x0 - c * cw, y0 - l * ch, x1 - c * cw, y1 - l * ch))
    X0, Y0 = max(0, min(r[0] for r in rel) - 6), max(0, min(r[1] for r in rel) - 6)
    X1, Y1 = min(cw, max(r[2] for r in rel) + 6), min(ch, max(r[3] for r in rel) + 6)
    poses = []
    for (c, l), cel in zip(celulas, ids):
        ox, oy = int(c * cw + X0), int(l * ch + Y0)
        p = folha[oy:int(l * ch + Y1), ox:int(c * cw + X1)].copy()
        # só o que é desta pose: borda macia do alfa original, sem vizinho invadindo
        mask = cv2.dilate(np.isin(lab[oy:oy + p.shape[0], ox:ox + p.shape[1]], cel).astype(np.uint8), np.ones((9, 9), np.uint8))
        p[..., 3] = (p[..., 3] * cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)).astype(np.uint8)
        poses.append(p)
    # âncora: meio e pé da primeira pose (parado), dentro do recorte
    px0, py0, px1, py1 = rel[0]
    return poses, {'w': int(X1 - X0), 'h': int(Y1 - Y0), 'pe': [round((px0 + px1) / 2 - X0), round(py1 - Y0)], 'alt': round(py1 - py0)}


def gravar(heroi, poses):
    for pose, p in zip(POSES, poses):
        cv2.imwrite(str(saida / f'{heroi}-{pose}.webp'), p, [cv2.IMWRITE_WEBP_QUALITY, 90])


meta = {}
for lin, heroi in enumerate(HEROIS):
    poses, meta[heroi] = recortar(folha, cw, ch, [(col, lin) for col in range(COLS)])
    gravar(heroi, poses)

(raiz / 'src/games/castelos/sprites.json').write_text(json.dumps(meta, indent=1) + '\n')

# capa da vitrine: o castelo desenhado de antes (capa-base) com o Canhoneiro atirando na frente
base = saida / 'capa-base.webp'
if not base.exists():
    (saida / 'capa.webp').rename(base)
capa = cv2.imread(str(base), cv2.IMREAD_UNCHANGED)[..., :3].astype(np.float32)
capa = cv2.resize(capa, (620, 544), interpolation=cv2.INTER_CUBIC)
tiro = cv2.imread(str(saida / 'canhoneiro-tiro.webp'), cv2.IMREAD_UNCHANGED)
alt = 230
tiro = cv2.resize(tiro, (int(tiro.shape[1] * alt / tiro.shape[0]), alt), interpolation=cv2.INTER_AREA)
h, w = tiro.shape[:2]
x0, y0 = 30, 544 - h - 6
k = tiro[..., 3:4] / 255.0
capa[y0:y0 + h, x0:x0 + w] = capa[y0:y0 + h, x0:x0 + w] * (1 - k) + tiro[..., :3] * k
cv2.imwrite(str(saida / 'capa.webp'), cv2.resize(capa.astype(np.uint8), (310, 272), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 88])
print('ok:', len(HEROIS) * len(POSES), 'poses +', 'capa')
