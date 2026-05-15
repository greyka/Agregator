import { useEffect, useState } from "react";

export type WeatherHour = { label: string; temp: number; condition: string; now?: boolean };

export type Weather = {
  loading: boolean;
  error: string | null;
  provider: string;
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  windDir: string;
  sunrise: string;
  sunset: string;
  condition: string;
  uvIndex: number | null;
  hourly: WeatherHour[];
};

const DEFAULT: Weather = {
  loading: true, error: null, provider: "", city: "—",
  temp: 0, feels: 0, humidity: 0, wind: 0, windDir: "—",
  sunrise: "—", sunset: "—", condition: "clear", uvIndex: null, hourly: [],
};

async function getLocation(): Promise<{ lat: number; lon: number; city: string }> {
  // Browser geolocation (HTTPS or localhost only — otherwise this rejects fast)
  if (navigator.geolocation && (location.protocol === "https:" || location.hostname === "localhost")) {
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          (e) => reject(e),
          { timeout: 4000, maximumAge: 3_600_000 }
        );
      });
      const city = await reverseGeocode(coords.latitude, coords.longitude);
      return { lat: coords.latitude, lon: coords.longitude, city };
    } catch { /* fall through */ }
  }
  // IP-based fallback via ipinfo.io
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

async function fetchWeather(lat: number, lon: number) {
  const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  return r.json();
}

export function useWeather(): Weather {
  const [data, setData] = useState<Weather>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { lat, lon, city } = await getLocation();
        const wx = await fetchWeather(lat, lon);
        if (!cancelled) {
          setData({
            loading: false, error: null,
            provider: wx.provider, city,
            temp: wx.temp, feels: wx.feels,
            humidity: wx.humidity, wind: wx.wind, windDir: wx.wind_dir,
            sunrise: wx.sunrise, sunset: wx.sunset,
            condition: wx.condition, uvIndex: wx.uv_index ?? null,
            hourly: (wx.hourly || []).map((h: any) => ({
              label: h.label, temp: h.temp, condition: h.condition, now: h.now,
            })),
          });
        }
      } catch (e: any) {
        if (!cancelled) setData({ ...DEFAULT, loading: false, error: e?.message || "weather failed" });
      }
    };
    load();
    const id = setInterval(load, 600_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return data;
}

// Map provider-neutral condition string → label + icon name (key from Icons).
export function conditionToInfo(condition: string): { label: string; icon: "Sun" | "Cloud" | "Moon" | "Wind" } {
  const c = (condition || "").toLowerCase();
  if (c === "clear") return { label: "Clear sky", icon: "Sun" };
  if (c.startsWith("partly")) return { label: "Partly cloudy", icon: "Sun" };
  if (c === "cloudy") return { label: "Cloudy", icon: "Cloud" };
  if (c === "overcast") return { label: "Overcast", icon: "Cloud" };
  if (c.includes("snow")) return { label: "Snow", icon: "Cloud" };
  if (c.includes("rain")) return { label: "Rain", icon: "Cloud" };
  if (c.includes("shower")) return { label: "Showers", icon: "Cloud" };
  if (c.includes("thunder")) return { label: "Thunderstorm", icon: "Wind" };
  if (c.includes("fog")) return { label: "Foggy", icon: "Cloud" };
  return { label: condition || "—", icon: "Cloud" };
}
