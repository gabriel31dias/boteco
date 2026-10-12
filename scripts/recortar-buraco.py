# Recorta os sprites do "Pacote de Assets do Buraco Online.png" para
# src/assets/buraco e pinta de vermelho o feltro da mesa do kit do pôquer
# (o pacote do buraco não traz mesa limpa: a arte da mesa já vem com cartas).
# Roda uma vez: python3 -I scripts/recortar-buraco.py <pacote.png>
# ponytail: coordenadas fixas do pacote; pacote novo = medir de novo.
import colorsys
import sys
from pathlib import Path
from PIL import Image

raiz = Path(__file__).resolve().parent.parent
kit = Image.open(sys.argv[1]).convert('RGBA')
assert kit.size == (1536, 1024), f'pacote inesperado: {kit.size}'
saida = raiz / 'src/assets/buraco'
saida.mkdir(parents=True, exist_ok=True)

caixas = {'logo': (1035, 0, 1530, 335),
          'btn-pega': (15, 642, 308, 748), 'btn-descarta': (315, 642, 612, 748), 'btn-auto': (625, 642, 868, 748),
          'moedas': (888, 636, 1075, 752), 'coroa': (1255, 640, 1345, 725), 'faixa': (1175, 828, 1508, 928),
          'brilho': (1150, 940, 1530, 1015), 'seta': (1210, 725, 1360, 815)}
for i, x in enumerate([60, 302, 545, 782]):
    caixas[f'avatar-{i}'] = (x, 40, x + 200, 215)
for nome, caixa in caixas.items():
    kit.crop(caixa).save(saida / f'{nome}.webp', quality=90, method=6)

# Monte: a pilha encosta no 10♦ da esquerda. Recorta inteira e apaga o vizinho
# (x < 1036 acima da base da pilha, onde a pilha ainda não chegou).
x0, y0 = 1016, 324
monte = kit.crop((x0, y0, 1206, 521))
mp = monte.load()
for y in range(monte.height):
    for x in range(monte.width):
        if (x0 + x < 1036 and y0 + y < 470) or (x0 + x > 1140 and y0 + y < 333):   # 10♦ e a ponta do sprite de cima
            mp[x, y] = (0, 0, 0, 0)
monte.save(saida / 'monte.webp', quality=90, method=6)

# Mesa: feltro verde do kit do pôquer vira vermelho-vinho (mesma luz e textura).
mesa = Image.open(raiz / 'src/assets/poker/mesa.webp').convert('RGBA')
px = mesa.load()
for y in range(mesa.height):
    for x in range(mesa.width):
        r, g, b, a = px[x, y]
        if g > r + 12 and g > b:                       # verde do feltro; dourado e couro ficam
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            r2, g2, b2 = colorsys.hls_to_rgb(0.985, l * 0.95, min(1, s * 1.05))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
mesa.save(saida / 'mesa.webp', quality=88, method=6)
print(f'{len(caixas) + 1} sprites em {saida}')
