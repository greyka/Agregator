// Animated weather icon — Meteocons fill style, MIT (Bas Milius).
// SVGs live in /public/weather/ and animate via SMIL inside <img>.

import { CSSProperties } from "react";

// Maps provider-neutral condition strings (and an optional day/night hint)
// to Meteocons file names.
const COND_TO_FILE: Record<string, string> = {
  "clear-day": "clear-day",
  "clear-night": "clear-night",
  "clear": "clear-day",
  "partly-cloudy": "partly-cloudy-day",
  "partly-cloudy-day": "partly-cloudy-day",
  "partly-cloudy-night": "partly-cloudy-night",
  "cloudy": "cloudy",
  "overcast": "overcast-day",
  "overcast-day": "overcast-day",
  "overcast-night": "overcast-night",
  "drizzle": "drizzle",
  "light-rain": "drizzle",
  "rain": "rain",
  "heavy-rain": "extreme-rain",
  "showers": "partly-cloudy-day-rain",
  "light-snow": "snow",
  "snow": "snow",
  "heavy-snow": "extreme-snow",
  "snow-showers": "partly-cloudy-day-snow",
  "thunderstorm": "thunderstorms",
  "thunderstorm-with-hail": "thunderstorms-rain",
  "wet-snow": "snow",
  "fog": "fog-day",
  "fog-day": "fog-day",
  "fog-night": "fog-night",
  "hail": "hail",
  "wind": "wind",
};

export function WeatherIcon({
  condition,
  isNight,
  size = 64,
  style,
  className,
}: {
  condition: string;
  isNight?: boolean;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const c = (condition || "clear").toLowerCase();
  let key = c;
  // If condition has no day/night variant, but isNight is given, try -night variant
  if (isNight && (c === "clear" || c === "partly-cloudy" || c === "overcast" || c === "fog")) {
    key = c + "-night";
  } else if (c === "clear" || c === "partly-cloudy" || c === "overcast" || c === "fog") {
    key = c + "-day";
  }
  const file = COND_TO_FILE[key] || COND_TO_FILE[c] || "cloudy";
  return (
    <img
      src={`/weather/${file}.svg`}
      alt={condition}
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", ...style }}
      // SVG with SMIL inside <img> animates fine without further work.
    />
  );
}
