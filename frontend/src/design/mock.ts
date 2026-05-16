// Mock data from original design — used for widgets we haven't wired to real API yet
// (weather, rooms, cameras, energy, presence, etc.)
// Real device list comes from our backend via store.

export const ROOMS = [
  { id: "living", name: "Living Room", devices: 12, temp: 22.4, humid: 47, color: "#22E5FF" },
  { id: "kitchen", name: "Kitchen", devices: 8, temp: 21.1, humid: 51, color: "#9D7BFF" },
  { id: "bed", name: "Bedroom", devices: 6, temp: 19.8, humid: 44, color: "#FF6BD6" },
  { id: "studio", name: "Studio", devices: 14, temp: 23.2, humid: 39, color: "#56F1A6" },
  { id: "garage", name: "Garage", devices: 5, temp: 17.2, humid: 60, color: "#FFB547" },
  { id: "garden", name: "Garden", devices: 4, temp: 14.8, humid: 72, color: "#FF5C7A" },
];

export const SCENES_MOCK = [
  { id: "s1", name: "Morning Rise", meta: "07:00 · Auto", bg: "bg-morning", active: false, icon: "Sun" },
  { id: "s2", name: "Cinema Mode", meta: "Vibe · 12 devices", bg: "bg-cinema", active: true, icon: "Tv" },
  { id: "s3", name: "Deep Focus", meta: "Studio · Lights", bg: "bg-focus", active: false, icon: "Sparkles" },
  { id: "s4", name: "Goodnight", meta: "23:30 · Auto", bg: "bg-night", active: false, icon: "Moon" },
  { id: "s5", name: "Away", meta: "Geofence", bg: "bg-away", active: false, icon: "Shield" },
  { id: "s6", name: "Soirée", meta: "Party preset", bg: "bg-party", active: false, icon: "Mic" },
];

export const CAMERAS = [
  { id: "c1", name: "Front Porch", status: "REC", time: "14:32:08" },
  { id: "c2", name: "Backyard", status: "REC", time: "14:32:08" },
  { id: "c3", name: "Driveway", status: "REC", time: "14:32:08" },
  { id: "c4", name: "Garage", status: "REC", time: "14:32:08" },
];

export const FEED = [
  { id: "f1", who: "Front Door", text: "Maya unlocked", time: "2m ago", icon: "Lock", tag: "ok" },
  { id: "f2", who: "Automation", text: "Cinema Mode activated", time: "8m ago", icon: "Tv", tag: "cyan" },
  { id: "f3", who: "Garage", text: "Motion detected — 14:24", time: "11m ago", icon: "Eye", tag: "warn" },
  { id: "f4", who: "AI Assistant", text: "Suggested lowering thermostat by 1.5°", time: "23m ago", icon: "Sparkles", tag: "violet" },
  { id: "f5", who: "Energy", text: "Solar export peaked 4.8kW", time: "1h ago", icon: "Bolt", tag: "ok" },
  { id: "f6", who: "Studio GPU", text: "Render queue complete", time: "1h ago", icon: "Cpu", tag: "cyan" },
];

export const ALERTS = [
  { id: "a1", level: "warn", title: "Backyard motion — unknown person", time: "12:48", body: "AI flagged silhouette near east fence." },
  { id: "a2", level: "ok", title: "Network restored", time: "12:21", body: "Mesh node 02 back online." },
  { id: "a3", level: "danger", title: "Smoke sensor — Kitchen", time: "Yesterday", body: "Auto-cleared after 14s · steam." },
];

export const FORECAST = [
  { d: "NOW", t: 21, ic: "Cloud", now: true },
  { d: "15:00", t: 22, ic: "Sun" },
  { d: "16:00", t: 22, ic: "Sun" },
  { d: "17:00", t: 21, ic: "Cloud" },
  { d: "18:00", t: 19, ic: "Cloud" },
];

export type UIDevice = {
  id: string;
  name: string;
  room: string;
  type: string;
  icon: string;
  on: boolean;
  value?: number;
  state: string;
};

const TYPE_ICON: Record<string, string> = {
  light: "Lightbulb",
  switch: "Outlet",
  sensor: "Thermometer",
  climate: "Thermometer",
  cover: "Window",
  lock: "Lock",
  fan: "Fan",
  media_player: "Tv",
  vacuum: "Power",
  hub: "Wifi",
  unknown: "Power",
};

function inferType(d: any): string {
  if (d.type && d.type !== "unknown") return d.type;
  // Infer from state fields when backend didn't classify it
  const s = d.state || {};
  if ("temperature" in s || "humidity" in s) return "sensor";
  if ("occupancy" in s || "motion" in s) return "sensor";
  if (typeof s.brightness === "number") return "light";
  if ("state" in s && (s.state === "ON" || s.state === "OFF")) return "switch";
  if ("battery" in s) return "sensor";
  return "unknown";
}

function inferIcon(type: string, state: any): string {
  if (type === "light") return "Lightbulb";
  if (type === "switch") return "Outlet";
  if (type === "sensor") {
    if ("temperature" in state) return "Thermometer";
    if ("occupancy" in state || "motion" in state) return "Eye";
    if ("humidity" in state) return "Droplet";
    return "Activity";
  }
  return TYPE_ICON[type] || "Power";
}

function summarizeState(type: string, state: any, value: number | undefined): string {
  if (type === "sensor") {
    const parts: string[] = [];
    if (typeof state.temperature === "number") parts.push(`${state.temperature}°C`);
    if (typeof state.humidity === "number") parts.push(`${state.humidity}%`);
    if (typeof state.occupancy === "boolean") parts.push(state.occupancy ? "движение" : "тихо");
    if (typeof state.illuminance === "number") parts.push(`${state.illuminance}lx`);
    if (parts.length) {
      if (typeof state.battery === "number") parts.push(`🔋${state.battery}%`);
      return parts.join(" · ");
    }
    if (typeof state.battery === "number") return `🔋 ${state.battery}%`;
    return state.state || "—";
  }
  if (value !== undefined) return `${value}%`;
  const on = (state?.state || "").toString().toUpperCase() === "ON";
  return on ? "Включено" : "Выключено";
}

export function backendToUI(d: any, rooms: { id: number; name: string }[] = []): UIDevice {
  const on = (d.state?.state || "").toString().toUpperCase() === "ON";
  const value = typeof d.state?.brightness === "number"
    ? Math.round((d.state.brightness / 254) * 100)
    : undefined;
  const type = inferType(d);
  const stateLabel = summarizeState(type, d.state || {}, value);
  const roomById = d.room_id != null ? rooms.find((r) => r.id === d.room_id)?.name : null;
  return {
    id: String(d.id),
    name: d.friendly_name,
    room: roomById || d.room || (d.vendor || "Unassigned"),
    type,
    icon: inferIcon(type, d.state || {}),
    on,
    value,
    state: stateLabel,
  };
}
