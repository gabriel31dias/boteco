# Prepara o fundo da batalha de tanques a partir de "Batalha de Tanques no
# Deserto.png" (1672x941). A arte é um quadro de jogo pronto: tanques, balas,
# explosões, placar, joystick e botões vêm desenhados. Aqui eles somem:
#  - o que está sobre a areia (tanques, balas, explosões) é preenchido com a cor
#    das bordas espalhada pra dentro, mais o grão de um trecho de areia limpo;
#  - joystick e botões, nos cantos de baixo, levam os cantos de cima espelhados
#    (o mapa é quase simétrico de cima pra baixo);
#  - placar de cima e borda de baixo viram faixas escuras: moldura da arena,
#    e é ali que o placar do jogo mora.
# Sai em src/assets/tanque/fundo.webp, 1280x720 (o tamanho do mundo do jogo).
#   python3 -I scripts/limpar-fundo-tanque.py <arte.png>
# ponytail: coordenadas fixas da arte; arte nova = medir de novo.
import random
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

arte = Image.open(sys.argv[1]).convert('RGB')
assert arte.size == (1672, 941), f'arte inesperada: {arte.size}'
saida = Path(__file__).resolve().parent.parent / 'src/assets/tanque/fundo.webp'
random.seed(7)

AMOSTRA = arte.crop((430, 435, 500, 480))   # areia lisa, sem pedra nem sombra
CINZA = (128, 128, 128)


def mascara(w, h, borda):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rectangle((borda, borda, w - borda, h - borda), fill=255)
    return m.filter(ImageFilter.GaussianBlur(borda / 2))


def grao(w, h):
    """O detalhe fino da amostra (ela menos o próprio desfoque, em torno do cinza),
    ladrilhado com viradas ao acaso pra não formar padrão."""
    det = Image.new('RGB', (w, h), CINZA)
    fino = ImageChops.subtract(AMOSTRA, AMOSTRA.filter(ImageFilter.GaussianBlur(6)), scale=1, offset=128)
    aw, ah = fino.size
    for ty in range(-random.randint(0, ah), h, ah):
        for tx in range(-random.randint(0, aw), w, aw):
            t = fino
            if random.random() < 0.5: t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if random.random() < 0.5: t = t.transpose(Image.FLIP_TOP_BOTTOM)
            det.paste(t, (tx, ty))
    return Image.blend(Image.new('RGB', (w, h), CINZA), det, 0.5)   # meio grão: forte vira calçamento


def areia(caixa, borda=10):
    x0, y0, x1, y1 = caixa
    m = 24
    X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(arte.width, x1 + m), min(arte.height, y1 + m)
    reg = arte.crop((X0, Y0, X1, Y1))
    buraco = Image.new('L', reg.size, 0)
    ImageDraw.Draw(buraco).rectangle((x0 - X0, y0 - Y0, x1 - X0, y1 - Y0), fill=255)
    # desfoque repetido que devolve o que está fora do buraco: a cor da borda
    # escorre pra dentro (difusão), do raio grande pro pequeno
    img = reg.copy()
    for r in [40, 32, 24, 16, 12, 8, 6, 4, 3, 2]:
        for _ in range(3):
            img = Image.composite(img.filter(ImageFilter.GaussianBlur(r)), reg, buraco)
    img = ImageChops.add(img, grao(*reg.size), scale=1, offset=-128)
    arte.paste(img.crop((x0 - X0 - borda, y0 - Y0 - borda, x1 - X0 + borda, y1 - Y0 + borda)),
               (x0 - borda, y0 - borda), mascara(x1 - x0 + 2 * borda, y1 - y0 + 2 * borda, borda))


def espelho(destino, borda=10):
    """Cobre `destino` (canto de baixo) com o mesmo trecho de cima, virado na vertical."""
    x0, y0, x1, y1 = destino
    H = arte.height
    src = arte.crop((x0, H - y1, x1, H - y0)).transpose(Image.FLIP_TOP_BOTTOM)
    arte.paste(src, (x0, y0), mascara(x1 - x0, y1 - y0, borda))


# tanques (com barra de vida e setinha), balas com clarão, explosões
for caixa in [(340, 215, 520, 436), (500, 316, 760, 384),
              (1185, 336, 1370, 562), (982, 404, 1230, 492),
              (985, 220, 1220, 390), (480, 540, 662, 672)]:
    areia(caixa)

# joystick e botões (só até onde a moldura de baixo não cobre)
espelho((22, 562, 358, 845))
espelho((1266, 536, 1662, 845))

# moldura: placar de cima e borda de baixo
faixa = Image.new('RGBA', arte.size, (0, 0, 0, 0))
d = ImageDraw.Draw(faixa)
H = arte.height
for y in range(0, 140):
    a = 255 if y < 100 else int(255 * (1 - (y - 100) / 40))
    d.line([(0, y), (arte.width, y)], fill=(18, 12, 6, a))
for y in range(H - 141, H):
    k = (y - (H - 141)) / 40
    d.line([(0, y), (arte.width, y)], fill=(18, 12, 6, 255 if k >= 1 else int(255 * k)))
arte = Image.alpha_composite(arte.convert('RGBA'), faixa).convert('RGB')

arte.resize((1280, 720), Image.LANCZOS).save(saida, quality=88, method=6)
print('fundo em', saida)
