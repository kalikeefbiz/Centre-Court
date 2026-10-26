"""Assemble actual Blender renders into review sheets (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
POSES = ROOT / 'artifacts/kira-midres/poses'
OUT = ROOT / 'public/verification/kira-midres'
groups = {
    'locomotion': ['Idle', 'Walk', 'Run'],
    'groundstrokes': ['Forehand', 'Backhand', 'Slice', 'Lob'],
    'overheads-volleys': ['Serve', 'Smash', 'ForehandVolley', 'BackhandVolley'],
    'lateral': ['ShuffleLeft', 'ShuffleRight'],
}
for name, states in groups.items():
    sheet = Image.new('RGB', (1440, 530 * len(states)), '#20282e')
    draw = ImageDraw.Draw(sheet)
    for row, state in enumerate(states):
        for col in range(4):
            image = Image.open(POSES / f'{state}-{col}.png').convert('RGB')
            sheet.paste(image, (360 * col, 530 * row + 30))
            draw.text((360 * col + 10, 530 * row + 8), f'{state} / sample {col}', fill='white')
    sheet.save(OUT / f'{name}.jpg', quality=92)
