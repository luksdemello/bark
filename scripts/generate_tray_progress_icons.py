#!/usr/bin/env python3
"""
Gera tray_progress_10.png … tray_progress_100.png a partir de tray_normal.png.
Cada arquivo tem um arco de progresso azul (#0a84ff) sobreposto.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path(__file__).parent.parent / "src-tauri" / "icons" / "tray_normal.png"
OUT = Path(__file__).parent.parent / "src-tauri" / "icons"

RING_COLOR = (10, 132, 255, 220)   # #0a84ff com leve transparência
RING_WIDTH = 3
# bounding box do arco dentro dos 44×44 px
MARGIN = 1
BOX = [MARGIN, MARGIN, 44 - MARGIN, 44 - MARGIN]


def arc_end(progress: int) -> float:
    """Converte progresso (0-100) para ângulo final (partindo de -90°)."""
    return -90 + 360 * progress / 100


for step in range(10, 110, 10):
    base = Image.open(SRC).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    draw.arc(
        BOX,
        start=-90,
        end=arc_end(step),
        fill=RING_COLOR,
        width=RING_WIDTH,
    )

    result = Image.alpha_composite(base, overlay)
    out_path = OUT / f"tray_progress_{step}.png"
    result.save(out_path)
    print(f"  {out_path.name}")

print("Done.")
