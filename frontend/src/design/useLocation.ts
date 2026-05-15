import { useEffect, useState } from "react";

export type SavedLocation = {
  country: string;       // ISO2, e.g. "RU"
  countryName: string;
  city: string;
  lat: number;
  lon: number;
};

const KEY = "agregator.location.v1";

export function loadLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.lat === "number" && typeof v.lon === "number" && v.city) return v;
    return null;
  } catch { return null; }
}

export function saveLocation(loc: SavedLocation): void {
  localStorage.setItem(KEY, JSON.stringify(loc));
  window.dispatchEvent(new CustomEvent("agregator:location", { detail: loc }));
}

export function clearLocation(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("agregator:location", { detail: null }));
}

export function useLocation(): [SavedLocation | null, (loc: SavedLocation | null) => void] {
  const [loc, setLoc] = useState<SavedLocation | null>(() => loadLocation());

  useEffect(() => {
    const h = (e: Event) => setLoc((e as CustomEvent).detail);
    window.addEventListener("agregator:location", h);
    return () => window.removeEventListener("agregator:location", h);
  }, []);

  const setter = (l: SavedLocation | null) => {
    if (l) saveLocation(l); else clearLocation();
  };
  return [loc, setter];
}

// ===== Geocoding helpers =====

export async function searchCities(
  query: string,
  countryCode?: string,
  signal?: AbortSignal
): Promise<Array<{ name: string; admin1?: string; country: string; country_code: string; lat: number; lon: number; population?: number }>> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", navigator.language?.startsWith("ru") ? "ru" : "en");
  if (countryCode) url.searchParams.set("countryCode", countryCode);
  const r = await fetch(url.toString(), { signal });
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const d = await r.json();
  return (d.results || []).map((it: any) => ({
    name: it.name,
    admin1: it.admin1,
    country: it.country,
    country_code: it.country_code,
    lat: it.latitude,
    lon: it.longitude,
    population: it.population,
  }));
}
