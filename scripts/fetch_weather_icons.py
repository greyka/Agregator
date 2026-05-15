"""Download Meteocons fill-style animated SVGs into frontend/public/weather/.

Run once after cloning the repo. Icons are MIT-licensed (Bas Milius).
https://github.com/basmilius/weather-icons
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/basmilius/weather-icons/dev/production/fill/svg/"
ICONS = [
    "clear-day", "clear-night",
    "partly-cloudy-day", "partly-cloudy-night",
    "cloudy", "overcast-day", "overcast-night",
    "rain", "drizzle", "extreme-rain",
    "snow", "extreme-snow",
    "thunderstorms", "thunderstorms-rain",
    "fog-day", "fog-night",
    "partly-cloudy-day-rain", "partly-cloudy-night-rain",
    "partly-cloudy-day-snow", "partly-cloudy-night-snow",
    "wind", "hail",
]

dst = Path(__file__).parent.parent / "frontend" / "public" / "weather"
dst.mkdir(parents=True, exist_ok=True)

print(f"Downloading {len(ICONS)} icons → {dst}")
for name in ICONS:
    url = BASE + name + ".svg"
    out = dst / (name + ".svg")
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = r.read()
        out.write_bytes(data)
        print(f"  {name}.svg  ({len(data)} bytes)")
    except Exception as e:
        print(f"  ! {name}: {e}")

print(f"Done. Total size: {sum(p.stat().st_size for p in dst.glob('*.svg')) // 1024} KiB")
