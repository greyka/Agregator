import { useEffect, useState } from "react";

export function useTicker(ms = 1500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

export function smoothLine(values: number[], w: number, h: number, padX = 0, padY = 6): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (values.length - 1);
  const pts: [number, number][] = values.map((v, i) => [
    padX + i * stepX,
    h - padY - ((v - min) / range) * (h - padY * 2),
  ]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function genSeries(n: number, base: number, amp: number, seed: number): number[] {
  const r = rnd(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = base + Math.sin(i / 3.2) * amp * 0.6 + (r() - 0.5) * amp;
    out.push(Math.round(v * 10) / 10);
  }
  return out;
}
