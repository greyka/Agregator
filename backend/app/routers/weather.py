"""Weather proxy router — Open-Meteo provider only.

We proxy through the backend (rather than calling Open-Meteo directly from the
frontend) for three reasons:
1. Lets us cache responses in-process — multiple browser tabs hit the cache,
   not Open-Meteo, so we stay polite.
2. Normalises the JSON shape so a future swap of providers is a one-file change.
3. Keeps all third-party config server-side.

Free, no API key, fair-use rate limits. https://open-meteo.com/
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("weather")
router = APIRouter(prefix="/api", tags=["weather"])

CACHE_TTL = 600.0
_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_cache_lock = asyncio.Lock()


# WMO codes → provider-neutral condition strings the frontend renders with one mapping.
WMO_TO_CONDITION = {
    0: "clear", 1: "partly-cloudy", 2: "partly-cloudy", 3: "overcast",
    45: "fog", 48: "fog",
    51: "drizzle", 53: "light-rain", 55: "rain", 56: "light-rain", 57: "rain",
    61: "light-rain", 63: "rain", 65: "heavy-rain", 66: "light-rain", 67: "rain",
    71: "light-snow", 73: "snow", 75: "snow", 77: "snow",
    80: "showers", 81: "showers", 82: "showers",
    85: "snow-showers", 86: "snow-showers",
    95: "thunderstorm", 96: "thunderstorm-with-hail", 99: "thunderstorm-with-hail",
}


@router.get("/weather")
async def get_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    key = (round(lat, 3), round(lon, 3))
    async with _cache_lock:
        cached = _cache.get(key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

    try:
        data = await _fetch_open_meteo(lat, lon)
    except httpx.HTTPError as e:
        raise HTTPException(503, f"weather upstream failed: {e}")

    async with _cache_lock:
        _cache[key] = (time.time(), data)
    return data


async def _fetch_open_meteo(lat: float, lon: float) -> dict[str, Any]:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat, "longitude": lon,
        "current": ",".join([
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "weather_code", "wind_speed_10m", "wind_direction_10m", "uv_index",
        ]),
        "hourly": "temperature_2m,weather_code",
        "daily": "sunrise,sunset",
        "forecast_hours": 5,
        "timezone": "auto",
        "wind_speed_unit": "kmh",
        "temperature_unit": "celsius",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        d = r.json()

    cur = d["current"]
    hourly_times = d.get("hourly", {}).get("time", [])
    hourly_temps = d.get("hourly", {}).get("temperature_2m", [])
    hourly_codes = d.get("hourly", {}).get("weather_code", [])
    hourly = []
    for i in range(min(5, len(hourly_times))):
        ts = hourly_times[i]
        hour_label = "NOW" if i == 0 else ts.split("T")[1][:5]
        hourly.append({
            "label": hour_label,
            "temp": round(hourly_temps[i]),
            "condition": WMO_TO_CONDITION.get(hourly_codes[i], "clear"),
            "now": i == 0,
        })

    return {
        "provider": "open-meteo",
        "temp": round(cur["temperature_2m"]),
        "feels": round(cur["apparent_temperature"]),
        "humidity": round(cur["relative_humidity_2m"]),
        "wind": round(cur["wind_speed_10m"]),
        "wind_dir_deg": cur["wind_direction_10m"],
        "wind_dir": _deg_to_compass(cur["wind_direction_10m"]),
        "condition": WMO_TO_CONDITION.get(cur["weather_code"], "clear"),
        "uv_index": cur.get("uv_index"),
        "sunrise": d["daily"]["sunrise"][0].split("T")[1][:5],
        "sunset": d["daily"]["sunset"][0].split("T")[1][:5],
        "hourly": hourly,
    }


def _deg_to_compass(deg: float | None) -> str:
    if deg is None:
        return ""
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
    return dirs[round(deg / 45)]
