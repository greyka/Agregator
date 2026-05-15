import { useEffect, useState } from "react";

export type WeatherHour = { d: string; t: number; code: number; now?: boolean };

export type Weather = {
  loading: boolean;
  error: string | null;
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;       // km/h
  windDir: string;    // N/NE/...
  sunrise: string;    // HH:MM
  sunset: string;     // HH:MM
  code: number;       // WMO weather code
  uvIndex: number | null;
  hourly: WeatherHour[];
};

const DEFAULT: Weather = {
  loading: true, error: null, city: "—", temp: 0, feels: 0,
  humidity: 0, wind: 0, windDir: "—", sunrise: "—", sunset: "—",
  code: 0, uvIndex: null, hourly: [],
};

function compassDir(deg: number): string {
  const dirs = ["N","NE","E","SE","S","SW","W","NW","N"];
  return dirs[Math.round(deg / 45)];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

function fmtHour(iso: string): string {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0") + ":00";
}

async function getLocation(): Promise<{ lat: number; lon: number; city: string }> {
  // Try browser geolocation first
  if (navigator.geolocation) {
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          (e) => reject(e),
          { timeout: 4000, maximumAge: 3600_000 }
        );
      });
      const city = await reverseGeocode(coords.latitude, coords.longitude);
      return { lat: coords.latitude, lon: coords.longitude, city };
    } catch { /* fall through */ }
  }
  // IP-based fallback — ipinfo.io is CORS-friendly and has no captcha for casual use.
  // Returns { city, region, country, loc: "lat,lon" }
  const r = await fetch("https://ipinfo.io/json");
  if (!r.ok) throw new Error(`ipinfo ${r.status}`);
  const d = await r.json();
  const [lat, lon] = String(d.loc || "0,0").split(",").map(Number);
  return { lat, lon, city: d.city || d.region || "Local" };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&count=1`
    );
    if (!r.ok) return "Local";
    const d = await r.json();
    return d.results?.[0]?.name || "Local";
  } catch { return "Local"; }
}

async function fetchWeather(lat: number, lon: number): Promise<Omit<Weather, "loading" | "error" | "city">> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
    "weather_code", "wind_speed_10m", "wind_direction_10m", "uv_index",
  ].join(","));
  url.searchParams.set("hourly", "temperature_2m,weather_code");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("forecast_hours", "5");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("temperature_unit", "celsius");

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const d = await r.json();
  const c = d.current;
  const times: string[] = d.hourly?.time || [];
  const temps: number[] = d.hourly?.temperature_2m || [];
  const codes: number[] = d.hourly?.weather_code || [];

  const hourly: WeatherHour[] = [];
  for (let i = 0; i < Math.min(5, times.length); i++) {
    hourly.push({
      d: i === 0 ? "NOW" : fmtHour(times[i]),
      t: Math.round(temps[i]),
      code: codes[i],
      now: i === 0,
    });
  }

  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    windDir: compassDir(c.wind_direction_10m),
    sunrise: fmtTime(d.daily.sunrise[0]),
    sunset: fmtTime(d.daily.sunset[0]),
    code: c.weather_code,
    uvIndex: c.uv_index ?? null,
    hourly,
  };
}

export function useWeather(): Weather {
  const [data, setData] = useState<Weather>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { lat, lon, city } = await getLocation();
        const wx = await fetchWeather(lat, lon);
        if (!cancelled) {
          setData({ loading: false, error: null, city, ...wx });
        }
      } catch (e: any) {
        if (!cancelled) {
          setData({ ...DEFAULT, loading: false, error: e?.message || "weather failed" });
        }
      }
    })();
    // Refresh every 10 minutes
    const id = setInterval(async () => {
      try {
        const { lat, lon, city } = await getLocation();
        const wx = await fetchWeather(lat, lon);
        if (!cancelled) setData({ loading: false, error: null, city, ...wx });
      } catch { /* keep previous */ }
    }, 600_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return data;
}

// WMO weather code → label + icon name (one of our Icons keys)
export function codeToInfo(code: number): { label: string; icon: "Sun" | "Cloud" | "Moon" | "Wind" } {
  if (code === 0) return { label: "Clear sky", icon: "Sun" };
  if (code <= 2) return { label: "Mostly clear", icon: "Sun" };
  if (code === 3) return { label: "Overcast", icon: "Cloud" };
  if (code >= 45 && code <= 48) return { label: "Foggy", icon: "Cloud" };
  if (code >= 51 && code <= 67) return { label: "Rainy", icon: "Cloud" };
  if (code >= 71 && code <= 77) return { label: "Snowy", icon: "Cloud" };
  if (code >= 80 && code <= 86) return { label: "Showers", icon: "Cloud" };
  if (code >= 95) return { label: "Thunderstorm", icon: "Wind" };
  return { label: "—", icon: "Cloud" };
}
