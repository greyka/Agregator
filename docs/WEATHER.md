# Weather provider

Endpoint `/api/weather?lat=...&lon=...` returns a normalized JSON shape. Internally the backend picks one of two providers:

| Provider | When used | Cost | CORS | Quota |
|---|---|---|---|---|
| **Yandex.Pogoda** | `YANDEX_WEATHER_KEY` is set | Free "Weather on your site" tier | Server-only (we proxy) | 50 requests/day |
| **Open-Meteo** | Default fallback | Free, no key | Open | Unlimited (fair use) |

Both responses are cached in-process for 10 minutes per coordinate, so a single household easily fits into the 50 req/day Yandex quota.

## Getting a Yandex Weather key

1. Open https://yandex.ru/dev/weather/ — Кабинет разработчика
2. Sign in with a Yandex account, create a new "Weather on your site" key (free tier, 50 req/day)
3. Copy the key

## Wiring the key

Edit `docker-compose.yml` (or set in your deployment env) and add to the `backend` service:

```yaml
  backend:
    environment:
      ...
      YANDEX_WEATHER_KEY: "your-key-here"
```

Restart the backend container:

```bash
docker compose up -d backend
```

Open the dashboard. The WeatherHero card title now shows `· YANDEX` next to the city name. If the key is invalid or rate-limited, the backend transparently falls back to Open-Meteo and the badge shows `OPEN-METEO (YANDEX FAILED)`.

## Why proxy instead of direct browser calls?

- Yandex's API does not send CORS headers, so the browser cannot call it directly.
- Even if it did, the API key would be exposed in client code.
- Routing through the backend lets us cache + transparently fall back.
