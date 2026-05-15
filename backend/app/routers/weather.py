"""Weather proxy router.

Exposes a unified /api/weather?lat=...&lon=... endpoint that returns a normalized
JSON shape regardless of provider. Provider is chosen at runtime:

- If settings.yandex_weather_key is set → query api.weather.yandex.ru (~50 req/day on the free tier)
- Otherwise → fall back to api.open-meteo.com (free, no key)

Responses are cached in-memory for 10 minutes per (provider, lat, lon) tuple to
stay within Yandex's free-tier quota with multiple browser refreshes.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..config import settings

log = logging.getLogger("weather")

router = APIRouter(prefix="/api", tags=["weather"])

CACHE_TTL = 600.0
_cache: dict[tuple[str, float, float], tuple[float, dict]] = {}
_cache_lock = asyncio.Lock()


# WMO codes → Yandex-style condition strings, so the frontend can render one mapping table.
WMO_TO_CONDITION = {
    0: "clear", 1: "partly-cloudy", 2: "partly-cloudy", 3: "overcast",
    45: "cloudy", 48: "cloudy",
    51: "light-rain", 53: "light-rain", 55: "rain", 56: "light-rain", 57: "rain",
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
    provider = "yandex" if settings.yandex_weather_key else "open-meteo"
    key = (provider, round(lat, 3), round(lon, 3))

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

    try:
        if provider == "yandex":
            data = await _fetch_yandex(lat, lon)
        else:
            data = await _fetch_open_meteo(lat, lon)
    except httpx.HTTPError as e:
        log.warning("Weather fetch via %s failed: %s — trying fallback", provider, e)
        if provider == "yandex":
            try:
                data = await _fetch_open_meteo(lat, lon)
                data["provider"] = "open-meteo (yandex failed)"
            except httpx.HTTPError as e2:
                raise HTTPException(503, f"Both providers failed: {e2}")
        else:
            raise HTTPException(503, str(e))

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


async def _fetch_yandex(lat: float, lon: float) -> dict[str, Any]:
    url = "https://api.weather.yandex.ru/v2/forecast"
    headers = {"X-Yandex-Weather-Key": settings.yandex_weather_key or ""}
    params = {"lat": lat, "lon": lon, "lang": "ru_RU", "hours": "true", "limit": 1}
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
        d = r.json()

    fact = d.get("fact", {})
    forecast = (d.get("forecasts") or [{}])[0]
    hours = forecast.get("hours") or []
    sunrise = forecast.get("sunrise") or "—"
    sunset = forecast.get("sunset") or "—"

    hourly = []
    for i, h in enumerate(hours[:5]):
        hourly.append({
            "label": "NOW" if i == 0 else f"{int(h['hour']):02d}:00",
            "temp": h.get("temp"),
            "condition": h.get("condition", "clear"),
            "now": i == 0,
        })

    return {
        "provider": "yandex",
        "temp": fact.get("temp"),
        "feels": fact.get("feels_like"),
        "humidity": fact.get("humidity"),
        "wind": round(float(fact.get("wind_speed") or 0) * 3.6),  # m/s → km/h
        "wind_dir_deg": None,
        "wind_dir": (fact.get("wind_dir") or "").upper(),
        "condition": fact.get("condition", "clear"),
        "uv_index": fact.get("uv_index"),
        "sunrise": sunrise,
        "sunset": sunset,
        "hourly": hourly,
    }


def _deg_to_compass(deg: float | None) -> str:
    if deg is None:
        return ""
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
    return dirs[round(deg / 45)]
