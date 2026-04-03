#!/usr/bin/env python3
"""Generate tray icons from dog_colored.svg with ear position variants."""

import subprocess
import tempfile
import os

BASE_SVG = '''<svg
  width="48"
  height="48"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path d="{left_ear}" fill="#8B4513" />
  <path d="{right_ear}" fill="#8B4513" />
  <ellipse cx="12" cy="11" rx="7" ry="6" fill="#A0522D" />
  <ellipse cx="12" cy="14" rx="4" ry="3.5" fill="#DEB887" />
  <ellipse cx="12" cy="14" rx="1.5" ry="1.2" fill="#333333" />
  <circle cx="9.5" cy="10" r="1" fill="#000000" />
  <circle cx="14.5" cy="10" r="1" fill="#000000" />
  <path d="M8 15C7 15 6 16 6 18C6 20 7 21 8 21H16C17 21 18 20 18 18C18 16 17 15 16 15H8Z" fill="#A0522D" />
  <rect x="8" y="20" width="2" height="3" rx="1" fill="#8B4513" />
  <rect x="14" y="20" width="2" height="3" rx="1" fill="#8B4513" />
</svg>'''

# Normal ears (y: 4 to 9)
EAR_LEFT_NORMAL  = "M6 4C5.5 4 5 5 5 6.5C5 8 5.5 9 6 9C6.5 9 7 8 7 6.5C7 5 6.5 4 6 4Z"
EAR_RIGHT_NORMAL = "M18 4C17.5 4 17 5 17 6.5C17 8 17.5 9 18 9C18.5 9 19 8 19 6.5C19 5 18.5 4 18 4Z"

# Ears up: shifted up 2 units (y: 2 to 7)
EAR_LEFT_UP  = "M6 2C5.5 2 5 3 5 4.5C5 6 5.5 7 6 7C6.5 7 7 6 7 4.5C7 3 6.5 2 6 2Z"
EAR_RIGHT_UP = "M18 2C17.5 2 17 3 17 4.5C17 6 17.5 7 18 7C18.5 7 19 6 19 4.5C19 3 18.5 2 18 2Z"

# Ears down: shifted down 2 units (y: 6 to 11)
EAR_LEFT_DOWN  = "M6 6C5.5 6 5 7 5 8.5C5 10 5.5 11 6 11C6.5 11 7 10 7 8.5C7 7 6.5 6 6 6Z"
EAR_RIGHT_DOWN = "M18 6C17.5 6 17 7 17 8.5C17 10 17.5 11 18 11C18.5 11 19 10 19 8.5C19 7 18.5 6 18 6Z"

variants = {
    "src-tauri/icons/tray_normal.png":    (EAR_LEFT_NORMAL, EAR_RIGHT_NORMAL),
    "src-tauri/icons/tray_ears_up.png":   (EAR_LEFT_UP,     EAR_RIGHT_UP),
    "src-tauri/icons/tray_ears_down.png": (EAR_LEFT_DOWN,   EAR_RIGHT_DOWN),
}

for out_path, (left, right) in variants.items():
    svg_content = BASE_SVG.format(left_ear=left, right_ear=right)
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as f:
        f.write(svg_content)
        tmp_svg = f.name
    try:
        subprocess.run(
            ["rsvg-convert", "-w", "44", "-h", "44", "-o", out_path, tmp_svg],
            check=True,
        )
        print(f"Generated {out_path}")
    finally:
        os.unlink(tmp_svg)

print("Done.")
