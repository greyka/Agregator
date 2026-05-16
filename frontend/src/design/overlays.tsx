import { useEffect, useMemo, useState } from "react";
import { Icons } from "./icons";
import { smoothLine, genSeries, useTicker } from "./utils";
import { UIDevice } from "./mock";
import type { Route } from "./shell";
import { api } from "../api";
import { useStore } from "../store";
import { RoomIcon } from "./RoomIcon";

export function DeviceModal({ device, onClose, onToggle, onBrightness }: {
  device: UIDevice | null;
  onClose: () => void;
  onToggle: (d: UIDevice) => void;
  onBrightness: (d: UIDevice, v: number) => void;
}) {
  if (!device) return null;
  return <DeviceModalInner device={device} onClose={onClose} onToggle={onToggle} onBrightness={onBrightness} />;
}

function DeviceModalInner({ device, onClose, onToggle, onBrightness }: {
  device: UIDevice;
  onClose: () => void;
  onToggle: (d: UIDevice) => void;
  onBrightness: (d: UIDevice, v: number) => void;
}) {
  const Ic = Icons[device.icon] || Icons.Power;
  const [bright, setBright] = useState(device.value ?? 50);
  const tick = useTicker(2000);
  const series = useMemo(
    () => genSeries(40, 50, 22, device.id.charCodeAt(0) + tick),
    [device.id, tick]
  );
  const path = smoothLine(series, 480, 80, 4, 6);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"flex-start", gap: 14}}>
          <div className={`device-ico ${device.on ? "on" : ""}`} style={{
            width:52, height:52, borderRadius: 14,
            background: device.on ? "rgba(34,229,255,0.18)" : "rgba(255,255,255,0.06)",
            color: device.on ? "var(--accent)" : "var(--text-2)",
            border: device.on ? "1px solid rgba(34,229,255,0.5)" : "1px solid var(--hairline)",
            boxShadow: device.on ? "0 0 24px rgba(34,229,255,0.4)" : "none",
          }}>
            <Ic style={{width: 26, height: 26} as any} />
          </div>
          <div style={{flex: 1}}>
            <div style={{fontSize: 19, fontWeight: 600, letterSpacing:"-0.02em"}}>{device.name}</div>
            <div style={{fontSize: 11.5, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em", marginTop: 2}}>
              {device.room.toUpperCase()} · {device.type.toUpperCase()}
            </div>
            <div style={{display:"flex", gap:6, marginTop: 10}}>
              <span className={`tag ${device.on ? "ok" : ""}`}>{device.on ? "● ONLINE" : "● OFF"}</span>
            </div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        <div style={{display:"flex", gap:14, alignItems:"center", marginTop: 22, padding: "14px 0", borderTop:"1px dashed var(--hairline)", borderBottom:"1px dashed var(--hairline)"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em"}}>POWER</div>
            <div style={{fontSize: 14, fontWeight: 500, marginTop: 4}}>{device.on ? "Active" : "Standby"}</div>
          </div>
          <div className={`toggle ${device.on ? "on" : ""}`} onClick={() => onToggle(device)} style={{transform:"scale(1.2)"}} />
        </div>

        {device.type === "light" && (
          <div style={{padding: "16px 0"}}>
            <div style={{display:"flex", justifyContent:"space-between"}}>
              <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em"}}>BRIGHTNESS</div>
              <div style={{fontSize:13, fontFamily:"var(--font-mono)"}}>{bright}%</div>
            </div>
            <input
              type="range" min={0} max={100} value={bright}
              onChange={(e) => setBright(+e.target.value)}
              onMouseUp={() => onBrightness(device, Math.round((bright / 100) * 254))}
              onTouchEnd={() => onBrightness(device, Math.round((bright / 100) * 254))}
              className="range" style={{marginTop: 10}}
            />
          </div>
        )}

        <DeviceRoomAssign deviceId={Number(device.id)} />

        <div style={{paddingTop: 8}}>
          <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em", marginBottom: 8}}>ACTIVITY · LAST 24H</div>
          <svg width="100%" height="80" viewBox="0 0 480 80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="dmg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(34,229,255,0.4)" />
                <stop offset="100%" stopColor="rgba(34,229,255,0)" />
              </linearGradient>
            </defs>
            <path d={`${path} L 480 80 L 0 80 Z`} fill="url(#dmg)" />
            <path d={path} stroke="#22E5FF" strokeWidth="1.6" fill="none" style={{filter:"drop-shadow(0 0 4px #22E5FF)"}} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function DeviceRoomAssign({ deviceId }: { deviceId: number }) {
  const { rooms, devices, refresh } = useStore();
  const dev = devices.find((d) => d.id === deviceId);
  const [busy, setBusy] = useState(false);
  if (!dev) return null;
  const onChange = async (v: string) => {
    setBusy(true);
    try {
      const room_id = v === "" ? 0 : Number(v); // 0 means "unassign" on the backend
      await api.patchDevice(deviceId, { room_id });
      await refresh();
    } finally { setBusy(false); }
  };
  const current = rooms.find((r) => r.id === dev.room_id);
  return (
    <div style={{padding: "14px 0 4px", display:"flex", alignItems:"center", gap: 12}}>
      <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em"}}>КОМНАТА</div>
      {current && (
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: `${current.color}22`, border: `1px solid ${current.color}55`,
          color: current.color, display: "grid", placeItems: "center",
        }}>
          <RoomIcon name={current.icon} size={14} />
        </div>
      )}
      <select
        className="lp-input"
        value={dev.room_id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        style={{
          flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid var(--hairline)",
          color: "var(--text-1)", borderRadius: 10, padding: "8px 11px",
          fontSize: 13, fontFamily: "inherit", outline: "none",
        }}
      >
        <option value="">— не привязано —</option>
        {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div style={{position:"fixed", inset:0, zIndex: 149}} onClick={onClose} />
      <div className="notif-panel">
        <div style={{padding: "14px 16px", borderBottom: "1px solid var(--hairline)", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize: 14, fontWeight: 600}}>Уведомления</div>
            <div style={{fontSize: 11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em"}}>0 NEW</div>
          </div>
        </div>
        <div style={{padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: 12}}>
          Пока нет уведомлений.
        </div>
      </div>
    </>
  );
}

export function CommandPalette({ open, onClose, onNav }: {
  open: boolean; onClose: () => void; onNav: (r: Route) => void;
}) {
  if (!open) return null;
  const items: { ic: keyof typeof Icons; t: string; k: Route }[] = [
    { ic: "Dashboard", t: "Go to Dashboard", k: "dashboard" },
    { ic: "Devices", t: "Open Devices", k: "devices" },
    { ic: "Integrations", t: "Manage Integrations", k: "integrations" },
    { ic: "Cameras", t: "Open Cameras", k: "cameras" },
    { ic: "Scenes", t: "Activate Scene", k: "scenes" },
    { ic: "AI", t: "Ask Aura…", k: "ai" },
    { ic: "Energy", t: "Energy report", k: "energy" },
    { ic: "Settings", t: "Settings", k: "settings" },
  ];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{padding: 0, maxWidth: 520, width: "min(520px, 92vw)"}} onClick={e => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--hairline)"}}>
          <Icons.Search style={{color:"var(--text-3)"} as any} />
          <input autoFocus placeholder="Search anything, ask anything…" style={{flex:1, background:"transparent", border:0, outline:0, color:"var(--text-1)", fontSize: 14, fontFamily:"inherit"}} />
          <span className="kbd">ESC</span>
        </div>
        <div style={{padding: "8px"}}>
          {items.map((it, i) => {
            const Ic = Icons[it.ic];
            return (
              <div key={i} onClick={() => { onNav(it.k); onClose(); }} className="nav-item" style={{display:"flex", alignItems:"center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: "pointer"}}>
                <Ic style={{color:"var(--text-2)"} as any} />
                <span style={{fontSize: 13.5}}>{it.t}</span>
                <span style={{marginLeft:"auto", fontSize: 10, color:"var(--text-3)", fontFamily:"var(--font-mono)"}}>↵</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
