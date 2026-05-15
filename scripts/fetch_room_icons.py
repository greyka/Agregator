"""Download Tabler outline SVG icons for room types into frontend/public/rooms/.

Run once after cloning. Icons are MIT (Tabler).
https://github.com/tabler/tabler-icons
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/"

ICONS = [
    # Living areas
    "sofa", "armchair", "tools-kitchen-2", "chair-director", "books", "books-off",
    "desk", "stairs", "stairs-up", "stairs-down", "door", "door-enter", "door-exit",
    # Sleeping
    "bed", "bed-flat", "baby-carriage", "moon", "zzz",
    # Bath / utility
    "bath", "droplet", "toilet-paper", "wash-machine", "pool", "swimming",
    "tools", "tool", "flame", "tools-kitchen-3", "fridge", "microwave",
    # Storage
    "garage", "building-warehouse", "building-cottage", "building", "dresser",
    "server", "router", "wifi",
    # Outside
    "tree", "trees", "plant", "plant-2", "fence", "umbrella", "picnic-table",
    "parking", "car", "bike",
    # Activity
    "barbell", "treadmill", "device-gamepad-2", "movie", "vinyl", "piano",
    "palette", "ball-basketball", "music",
    # Generic
    "home", "home-2", "building-skyscraper", "circle", "circles",
]

dst = Path(__file__).parent.parent / "frontend" / "public" / "rooms"
dst.mkdir(parents=True, exist_ok=True)

print(f"Downloading {len(ICONS)} Tabler icons -> {dst}")
ok = 0
for name in ICONS:
    url = BASE + name + ".svg"
    out = dst / (name + ".svg")
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = r.read()
        out.write_bytes(data)
        ok += 1
        print(f"  + {name}.svg ({len(data)} bytes)")
    except Exception as e:
        print(f"  ! {name}: {e}")

print(f"Done: {ok}/{len(ICONS)} icons, total {sum(p.stat().st_size for p in dst.glob('*.svg')) // 1024} KiB")
