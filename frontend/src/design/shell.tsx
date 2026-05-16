import { Icons } from "./icons";

export type Route =
  | "dashboard" | "rooms" | "devices" | "integrations"
  | "automations" | "scenes" | "energy" | "cameras"
  | "ai" | "analytics" | "settings";

const NAV_ITEMS: { id: Route; label: string; icon: keyof typeof Icons; badge?: string; dot?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: "Dashboard" },
  { id: "rooms", label: "Rooms", icon: "Rooms" },
  { id: "devices", label: "Devices", icon: "Devices" },
  { id: "integrations", label: "Integrations", icon: "Integrations" },
  { id: "scenes", label: "Scenes", icon: "Scenes" },
  { id: "automations", label: "Automations", icon: "Automations" },
  { id: "energy", label: "Energy", icon: "Energy" },
  { id: "cameras", label: "Cameras", icon: "Cameras" },
  { id: "analytics", label: "Analytics", icon: "Analytics" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

export function Sidebar({
  active, onNav, deviceCount, integrationsOnline, integrationsActive, roomCount,
}: {
  active: Route;
  onNav: (r: Route) => void;
  deviceCount: number;
  integrationsOnline: number;
  integrationsActive: number;
  roomCount: number;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">Agregator OS</div>
          <div className="brand-sub">v 0.2 · CORE</div>
        </div>
      </div>

      <div>
        <div className="nav-section-label">Workspace</div>
        <div className="nav">
          {NAV_ITEMS.map((n) => {
            const Ic = Icons[n.icon];
            const badge = n.id === "devices" ? String(deviceCount) :
                          n.id === "rooms" && roomCount > 0 ? String(roomCount) :
                          n.id === "integrations" ? `${integrationsOnline}/${integrationsActive}` :
                          n.badge;
            return (
              <div
                key={n.id}
                className={`nav-item ${active === n.id ? "active" : ""}`}
                onClick={() => onNav(n.id)}
              >
                <Ic />
                <span>{n.label}</span>
                {badge && <span className="badge">{badge}</span>}
                {n.dot && <span className="dot" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-foot">
        <div className="home-status">
          <div className="row">
            <span className="label">Home</span>
            <span className="status"><span className="d" />SECURE</span>
          </div>
          <div className="row">
            <span className="label">Mesh</span>
            <span className="val">{integrationsActive} integrations</span>
          </div>
          <div className="row">
            <span className="label">Core</span>
            <span className="val"><span className="pulse-dot" style={{display:"inline-block", marginRight:6}} />Online</span>
          </div>
        </div>

        <div className="user-chip">
          <div className="avatar">GA</div>
          <div style={{lineHeight: 1.25}}>
            <div className="user-name">Greyka</div>
            <div className="user-role">ADMIN · LOCAL</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({
  active, onAlerts, alertsCount, onCommand, deviceCount, onAddDevice,
}: {
  active: Route;
  onAlerts: () => void;
  alertsCount: number;
  onCommand: () => void;
  deviceCount: number;
  onAddDevice?: () => void;
}) {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  const time = now.toLocaleTimeString("en-GB", { hour12: false }).slice(0, 5);
  const labels: Record<Route, [string, string]> = {
    dashboard: ["Overview", `Today · ${date} · ${time}`],
    rooms: ["Rooms", "Zones overview"],
    devices: ["Devices", `${deviceCount} connected`],
    integrations: ["Integrations", "Connected systems"],
    automations: ["Automations", "Routines & flows"],
    scenes: ["Scenes", "Presets"],
    energy: ["Energy", "Live consumption · Solar"],
    cameras: ["Cameras", "Live feeds"],
    ai: ["AI Assistant", "Personalized · Local LLM"],
    analytics: ["Analytics", "30-day window"],
    settings: ["Settings", "System · Preferences"],
  };
  const [h, sub] = labels[active] || labels.dashboard;

  return (
    <div className="topbar">
      <div className="crumbs">
        <div className="h">{h}</div>
        <div className="sub">{sub}</div>
      </div>

      <div className="search" onClick={onCommand} style={{cursor:"pointer"}}>
        <Icons.Search />
        <input placeholder="Ask Aura or jump to anywhere…" readOnly />
        <span className="kbd">⌘K</span>
      </div>

      <div style={{display:"flex", gap:8}}>
        <div className="icon-btn" title="Theme"><Icons.Moon /></div>
        <div className="icon-btn" onClick={onAlerts} title="Alerts">
          <Icons.Bell />
          {alertsCount > 0 && <span className="bdg">{alertsCount}</span>}
        </div>
        <button className="btn primary" onClick={onAddDevice}>
          <Icons.Plus /> Add Device
        </button>
      </div>
    </div>
  );
}
