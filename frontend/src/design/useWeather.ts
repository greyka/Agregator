import { useEffect, useState } from "react";
import { useLocation, SavedLocation } from "./useLocation";

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
  needsLocation: boolean;
};

const DEFAULT: Weather = {
  loading: true, error: null, provider: "", city: "—",
  temp: 0, feels: 0, humidity: 0, wind: 0, windDir: "—",
  sunrise: "—", sunset: "—", condition: "clear", uvIndex: null, hourly: [],
  needsLocation: false,
};

async function fetchWeather(lat: number, lon: number) {
  const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  return r.json();
}

export function useWeather(): Weather {
  const [loc] = useLocation();
  const [data, setData] = useState<Weather>(DEFAULT);

  useEffect(() => {
    if (!loc) {
      setData({ ...DEFAULT, loading: false, needsLocation: true });
      return;
    }
    let cancelled = false;
    const load = async (l: SavedLocation) => {
      try {
        const wx = await fetchWeather(l.lat, l.lon);
        if (!cancelled) {
          setData({
            loading: false, error: null, needsLocation: false,
            provider: wx.provider, city: l.city,
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
        if (!cancelled) {
          setData({ ...DEFAULT, loading: false, error: e?.message || "weather failed" });
        }
      }
    };
    load(loc);
    const id = setInterval(() => load(loc), 600_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [loc?.lat, loc?.lon]);

  return data;
}

export function conditionToInfo(condition: string): { label: string } {
  const c = (condition || "").toLowerCase();
  const labels: Record<string, string> = {
    "clear": "Ясно",
    "partly-cloudy": "Малооблачно",
    "cloudy": "Облачно",
    "overcast": "Пасмурно",
    "drizzle": "Морось",
    "light-rain": "Лёгкий дождь",
    "rain": "Дождь",
    "heavy-rain": "Сильный дождь",
    "showers": "Ливни",
    "light-snow": "Лёгкий снег",
    "snow": "Снег",
    "heavy-snow": "Сильный снег",
    "snow-showers": "Снегопад",
    "thunderstorm": "Гроза",
    "thunderstorm-with-hail": "Гроза с градом",
    "wet-snow": "Мокрый снег",
    "fog": "Туман",
    "hail": "Град",
    "wind": "Ветрено",
  };
  return { label: labels[c] || condition || "—" };
}
