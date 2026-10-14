# Capas (310x272) das variantes da sinuca: pano verde, as bolas do modo, o nome.
#   python3 -I scripts/capas-sinuca.py
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

raiz = Path(__file__).resolve().parent.parent
saida = raiz / 'src/assets/sinuca/capas'
saida.mkdir(parents=True, exist_ok=True)
FONTE = '/usr/share/fonts/truetype/noto/NotoSans-BlackItalic.ttf'
CORES = ['#ffb319', '#0b3fd0', '#e3161b', '#6c1ca0', '#ff6408', '#078a3c', '#951616', '#141414', '#ffb319', '#0b3fd0']
SNOOK = {'v': '#c8102e', 2: '#ffd200', 3: '#0a8a3c', 4: '#6b3a1e', 5: '#1046c9', 6: '#ff6fb0', 7: '#141414'}


def bola(img, cx, cy, r, cor, n=None, listra=False):
    s = 4
    b = Image.new('RGBA', (r * 2 * s, r * 2 * s))
    d = ImageDraw.Draw(b)
    R = r * s
    d.ellipse((0, 0, 2 * R - 1, 2 * R - 1), fill=cor)
    if listra:
        d.rectangle((0, 0, 2 * R, R * 0.55), fill='#f6f4ee'); d.rectangle((0, R * 1.45, 2 * R, 2 * R), fill='#f6f4ee')
        m = Image.new('L', b.size, 0); ImageDraw.Draw(m).ellipse((0, 0, 2 * R - 1, 2 * R - 1), fill=255); b.putalpha(m)
        d = ImageDraw.Draw(b)
    if n is not None:
        d.ellipse((R * 0.5, R * 0.5, R * 1.5, R * 1.5), fill='#f6f4ee')
        f = ImageFont.truetype(FONTE, int(R * (0.62 if n < 10 else 0.5)))
        w = d.textlength(str(n), font=f)
        d.text((R - w / 2, R * 0.6), str(n), font=f, fill='#111')
    brilho = Image.new('RGBA', b.size)
    ImageDraw.Draw(brilho).ellipse((R * 0.45, R * 0.3, R * 0.95, R * 0.75), fill=(255, 255, 255, 150))
    b.alpha_composite(brilho.filter(ImageFilter.GaussianBlur(R * 0.12)))
    b = b.resize((r * 2, r * 2), Image.LANCZOS)
    sombra = Image.new('RGBA', img.size)
    ImageDraw.Draw(sombra).ellipse((cx - r + 3, cy - r + 6, cx + r + 3, cy + r + 6), fill=(0, 0, 0, 110))
    img.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(4)))
    img.alpha_composite(b, (cx - r, cy - r))


def capa(nome, linha1, linha2, desenhar, cor2=(255, 210, 60)):
    img = Image.new('RGBA', (310, 272))
    d = ImageDraw.Draw(img)
    for y in range(272):
        t = y / 272
        d.line((0, y, 310, y), fill=(int(10 + 20 * (1 - t)), int(90 + 50 * (1 - abs(t - 0.4))), int(45 + 20 * (1 - t)), 255))
    v = Image.new('L', img.size, 0); ImageDraw.Draw(v).ellipse((-80, -60, 390, 300), fill=255)
    escuro = Image.new('RGBA', img.size, (5, 30, 15, 255))
    img = Image.composite(img, escuro, v.filter(ImageFilter.GaussianBlur(50)))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 309, 271), outline=(120, 70, 30, 255), width=8)
    desenhar(img)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 196, 310, 272), fill=(8, 22, 12, 235))
    for txt, tam, y, cor in [(linha1, 36, 192, (255, 255, 255)), (linha2, 30, 232, cor2)]:
        f = ImageFont.truetype(FONTE, tam)
        w = d.textlength(txt, font=f)
        d.text(((310 - w) / 2, y), txt, font=f, fill=cor, stroke_width=3, stroke_fill=(0, 0, 0))
    img.convert('RGB').save(saida / f'{nome}.webp', quality=90)


def losango9(img):
    linhas, k = [1, 2, 3, 2, 1], 0
    ordem = [1, 2, 3, 4, 9, 5, 6, 7, 8]
    for r, q in enumerate(linhas):
        for i in range(q):
            n = ordem[k]; k += 1
            bola(img, int(110 + r * 30), int(95 + (i - (q - 1) / 2) * 34), 17, CORES[n - 1], n)
    bola(img, 40, 95, 17, '#f6f3ea')


def triangulo10(img):
    k, ordem = 0, [1, 2, 3, 4, 10, 5, 6, 7, 8, 9]
    for r, q in enumerate([1, 2, 3, 4]):
        for i in range(q):
            n = ordem[k]; k += 1
            bola(img, int(120 + r * 32), int(95 + (i - (q - 1) / 2) * 35), 17, CORES[(n - 1) % 10] if n < 10 else '#0b3fd0', n, listra=n == 10)
    bola(img, 45, 95, 17, '#f6f3ea')


def brasileira(img):
    for k, n in enumerate([1, 2, 3, 4, 5, 6, 7]):
        a = -math.pi * 0.9 + k * math.pi * 0.3
        bola(img, int(155 + math.cos(a) * 105), int(120 + math.sin(a) * 75), 19, SNOOK['v'] if n == 1 else SNOOK[n])
    bola(img, 155, 110, 19, '#f6f3ea')
    f = ImageFont.truetype(FONTE, 18)
    ImageDraw.Draw(img).text((118, 140), '1 a 7', font=f, fill=(255, 230, 120), stroke_width=2, stroke_fill=(0, 0, 0))


def snooker(img):
    for r, q in enumerate([1, 2, 3]):
        for i in range(q):
            bola(img, int(170 + r * 28), int(95 + (i - (q - 1) / 2) * 31), 15, SNOOK['v'])
    for n, (x, y) in {2: (45, 60), 3: (45, 130), 4: (45, 95), 5: (100, 95), 6: (148, 95), 7: (262, 95)}.items():
        bola(img, x, y, 15, SNOOK[n])


capa('sinuca9', 'BOLA 9', 'PARTIDA RÁPIDA', losango9)
capa('sinuca10', 'BOLA 10', 'PARA EXPERIENTES', triangulo10)
capa('sinucabr', 'SINUCA', 'BRASILEIRA', brasileira, (90, 220, 120))
capa('snooker', 'SNOOKER', '6 VERMELHAS', snooker, (255, 90, 90))
print('capas em', saida)
