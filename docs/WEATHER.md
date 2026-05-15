# Weather

The dashboard fetches weather via the backend endpoint `GET /api/weather?lat=...&lon=...`.

Provider: **[Open-Meteo](https://open-meteo.com/)** — free, no API key required, CORS-enabled, fair-use rate limits, ECMWF / GFS models with hourly resolution worldwide.

The backend proxies requests so:
- Responses are cached in-process for 10 minutes per coordinate.
- Multiple browser tabs / refreshes share a single upstream hit.
- A future swap of providers is a one-file change in `backend/app/routers/weather.py`.

## Location

The user picks a country + city through the UI ("Выберите локацию" button on the weather card, or click the city name in the header). The picked location is stored in browser `localStorage`.

City autocomplete uses the **Open-Meteo Geocoding API** (`geocoding-api.open-meteo.com/v1/search`) — same family, free, supports Russian language.

## Normalised response shape

```json
{
  "provider": "open-meteo",
  "temp": 9, "feels": 6, "humidity": 77,
  "wind": 12, "wind_dir_deg": 297, "wind_dir": "NW",
  "condition": "light-rain",
  "uv_index": 0.0,
  "sunrise": "05:44", "sunset": "21:28",
  "hourly": [
    { "label": "NOW", "temp": 9, "condition": "light-rain", "now": true },
    { "label": "23:00", "temp": 9, "condition": "partly-cloudy" },
    ...
  ]
}
```

`condition` strings are provider-neutral (`clear`, `partly-cloudy`, `cloudy`, `overcast`, `drizzle`, `light-rain`, `rain`, `heavy-rain`, `showers`, `light-snow`, `snow`, `heavy-snow`, `snow-showers`, `thunderstorm`, `thunderstorm-with-hail`, `fog`, `hail`, `wind`) so the frontend maps them to icons once.
