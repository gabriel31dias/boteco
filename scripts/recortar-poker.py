# Recorta os sprites do "Kit de Assets para Poker e Cassino.png" para
# src/assets/poker. Roda uma vez: python3 -I scripts/recortar-poker.py <kit.png>
# ponytail: coordenadas fixas do kit; kit novo = medir de novo.
import sys
from pathlib import Path
from PIL import Image

kit = Image.open(sys.argv[1]).convert('RGBA')
assert kit.size == (1536, 1024), f'kit inesperado: {kit.size}'
saida = Path(__file__).resolve().parent.parent / 'src/assets/poker'
saida.mkdir(parents=True, exist_ok=True)

caixas = {'verso': (1030, 16, 1116, 140), 'dealer': (990, 512, 1054, 572),
          'coroa': (608, 904, 694, 1000), 'trofeu': (772, 904, 860, 1004)}
for i, cor in enumerate(['vermelha', 'azul', 'verde', 'preta', 'branca', 'dourada']):
    caixas[f'ficha-{cor}'] = (540 + i * 76, 110, 608 + i * 76, 176)
for i in range(6):
    x, y = 28 + (i % 3) * 151, 282 if i < 3 else 432
    caixas[f'avatar-{i}'] = (x, y, x + 138, y + 138)
for i, nome in enumerate(['ok', 'fold', 'raise', 'apostar']):
    caixas[f'btn-{nome}'] = (492 + i * 111, 412, 582 + i * 111, 502)

for nome, caixa in caixas.items():
    kit.crop(caixa).save(saida / f'{nome}.webp', quality=90, method=6)
# A mesa ocupa a tela toda: sai ampliada 3x (Lanczos) pra não depender do
# redimensionamento do navegador.
mesa = kit.crop((14, 18, 530, 272))
mesa.resize((mesa.width * 3, mesa.height * 3), Image.LANCZOS).save(saida / 'mesa.webp', quality=88, method=6)
print(f'{len(caixas) + 1} sprites em {saida}')
