import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { UIDevice } from "./mock";
import { useWeather, conditionToInfo } from "./useWeather";
import { useLocation } from "./useLocation";
import { LocationPicker } from "./LocationPicker";
import { WeatherIcon } from "./WeatherIcon";
import { flag } from "./countries";
import { useStore } from "../store";
import { RoomIcon } from "./RoomIcon";
import { api } from "../api";

function isNightAt(sunrise: string, sunset: string): boolean {
  if (!sunrise || !sunset || sunrise === "—" || sunset === "—") return false;
  const now = new Date();
  const [srH, srM] = sunrise.split(":").map(Number);
  const [ssH, ssM] = sunset.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const sr = srH * 60 + srM;
  const ss = ssH * 60 + ssM;
  return cur < sr || cur >= ss;
}

export function WeatherHero() {
  const w = useWeather();
  const [loc, setLoc] = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const info = conditionToInfo(w.condition);
  const night = isNightAt(w.sunrise, w.sunset);

  if (w.needsLocation) {
    return (
      <>
        <div className="card glow-border" style={{padding: 22, minHeight: 220, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap: 12}}>
          <div style={{fontSize: 18, fontWeight: 600}}>Выберите локацию</div>
          <div style={{fontSize: 12, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em"}}>
            ПОГОДА И ВРЕМЯ — ПО ГОРОДУ
          </div>
          <button className="btn primary" onClick={() => setPickerOpen(true)} style={{marginTop: 10}}>
            <Icons.Plus /> Указать страну и город
          </button>
        </div>
        <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSave={setLoc} />
      </>
    );
  }

  return (
    <>
      <div className="card glow-border" style={{padding: 22}}>
        <div className="card-h" style={{marginBottom: 10}}>
          <div className="card-title" style={{cursor: "pointer"}} onClick={() => setPickerOpen(true)} title="Сменить локацию">
            {loc && <span style={{fontSize: 14, marginRight: 6}}>{flag(loc.country)}</span>}
            {w.loading ? "Locating…" : w.city}
            {w.provider && !w.loading && (
              <span style={{marginLeft: 8, fontSize: 9, color: "var(--text-3)", letterSpacing: "0.12em"}}>
                · {w.provider.toUpperCase()}
              </span>
            )}
            <span style={{marginLeft: 8, fontSize: 11, color: "var(--text-3)", textTransform:"none", letterSpacing: 0}}>✎</span>
          </div>
          <div className="card-tools">
            {w.error ? <span className="chip" style={{color:"var(--danger)"}}>OFFLINE</span>
                     : <span className="chip live">LIVE</span>}
          </div>
        </div>
        <div className="weather-hero">
          <div className="weather-left">
            <div>
              <div className="weather-temp">
                {w.loading ? "—" : w.temp}<span className="deg">°</span>
              </div>
              <div className="weather-meta" style={{marginTop: 8}}>
                {info.label} · ощущается <b>{w.feels}°</b>
                {w.uvIndex !== null && <> · УФ <b>{Math.round(w.uvIndex)}</b></>}
              </div>
              <div style={{display:"flex", gap:8, marginTop: 12, flexWrap:"wrap"}}>
                <span className="tag"><Icons.Wind /> {w.wind} км/ч {w.windDir}</span>
                <span className="tag"><Icons.Droplet /> {w.humidity}%</span>
                <span className="tag"><Icons.Sun /> Закат {w.sunset}</span>
              </div>
            </div>
            <div className="forecast" style={{marginTop: 20}}>
              {w.hourly.map((f, i) => (
                <div key={i} className={`cell ${f.now ? "now" : ""}`}>
                  <WeatherIcon condition={f.condition} isNight={night} size={28} />
                  <div className="t">{f.temp}°</div>
                  <div className="d">{f.label}</div>
                </div>
              ))}
              {w.hourly.length === 0 && Array.from({length: 5}).map((_, i) => (
                <div key={i} className="cell"><div className="t">—</div><div className="d">…</div></div>
              ))}
            </div>
          </div>
          <div style={{position:"relative", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <WeatherIcon condition={w.condition} isNight={night} size={180} style={{filter: "drop-shadow(0 8px 28px rgba(255,180,90,0.25))"}} />
          </div>
        </div>
      </div>
      <LocationPicker open={pickerOpen} initial={loc} onClose={() => setPickerOpen(false)} onSave={setLoc} />
    </>
  );
}

export function RoomsGrid({ onOpenRooms }: { onOpenRooms?: () => void }) {
  const { rooms, devices } = useStore();
  const deviceCountsByRoom = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of devices) if (d.room_id != null) m[d.room_id] = (m[d.room_id] || 0) + 1;
    return m;
  }, [devices]);
  const onCountsByRoom = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of devices) {
      if (d.room_id != null && d.state?.state === "ON") m[d.room_id] = (m[d.room_id] || 0) + 1;
    }
    return m;
  }, [devices]);

  if (rooms.length === 0) {
    return (
      <div className="card">
        <div className="card-h">
          <div className="card-title">Комнаты</div>
          <div className="card-tools">
            <span className="pill" onClick={onOpenRooms} style={{cursor: "pointer"}}>
              <Icons.Plus /> Добавить
            </span>
          </div>
        </div>
        <div className="placeholder">
          Комнаты не созданы. Открой вкладку «Rooms» и добавь первую — устройства можно будет привязать к ней через карточку устройства.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Комнаты</div>
        <div className="card-tools"><span className="chip">{rooms.length} ZONES</span></div>
      </div>
      <div style={{display:"grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12}}>
        {rooms.map((r) => {
          const count = deviceCountsByRoom[r.id] || 0;
          const on = onCountsByRoom[r.id] || 0;
          return (
            <div key={r.id} className="card hoverable" style={{padding: 14, cursor: onOpenRooms ? "pointer" : "default"}} onClick={onOpenRooms}>
              <div style={{display:"flex", alignItems:"center", gap: 10}}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  display:"grid", placeItems:"center",
                  background: `${r.color}22`, border: `1px solid ${r.color}55`, color: r.color,
                }}>
                  <RoomIcon name={r.icon} size={20} />
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontSize: 13.5, fontWeight: 600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.name}</div>
                  <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.06em", marginTop: 2}}>
                    {count} УСТР-В {on > 0 ? `· ${on} ВКЛ` : ""}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeviceTile({ d, onOpen, onToggle }: {
  d: UIDevice;
  onOpen: (d: UIDevice) => void;
  onToggle: (d: UIDevice) => void;
}) {
  const Ic = Icons[d.icon] || Icons.Power;
  return (
    <div
      className={`card hoverable device ${d.on ? "on" : ""}`}
      style={{padding: 14, borderRadius: 16, cursor:"pointer"}}
      onClick={() => onOpen(d)}
    >
      <div className="device-head">
        <div className="device-ico"><Ic /></div>
        <div
          className={`toggle ${d.on ? "on" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggle(d); }}
        />
      </div>
      <div>
        <div className="device-name">{d.name}</div>
        <div className="device-room">{d.room.toUpperCase()}</div>
      </div>
      <div className="device-state">{d.state}</div>
    </div>
  );
}

export function DeviceTilesV2({ devices, onOpen, onToggle }: {
  devices: UIDevice[];
  onOpen: (d: UIDevice) => void;
  onToggle: (d: UIDevice) => void;
}) {
  const [tab, setTab] = useState<"all"|"on"|"off">("all");
  const filtered = devices.filter((d) =>
    tab === "all" ? true : tab === "on" ? d.on : !d.on
  );
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Devices · Favorites</div>
        <div className="card-tools">
          <span className={`pill ${tab==="all" ? "active" : ""}`} onClick={() => setTab("all")}><Icons.Filter /> All</span>
          <span className={`pill ${tab==="on" ? "active" : ""}`} onClick={() => setTab("on")}>On</span>
          <span className={`pill ${tab==="off" ? "active" : ""}`} onClick={() => setTab("off")}>Off</span>
        </div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 12}}>
        {filtered.slice(0, 8).map((d) => (
          <DeviceTile key={d.id} d={d} onOpen={onOpen} onToggle={onToggle} />
        ))}
        {filtered.length === 0 && (
          <div className="placeholder" style={{gridColumn: "1 / -1"}}>
            No devices match this filter. Add an integration on the Integrations page.
          </div>
        )}
      </div>
    </div>
  );
}

export function LightingCard() {
  const { devices, refresh } = useStore();
  const lights = useMemo(() => devices.filter((d) => d.type === "light"), [devices]);
  const onCount = lights.filter((l) => l.state?.state === "ON").length;

  if (lights.length === 0) {
    return (
      <div className="card">
        <div className="card-h">
          <div className="card-title">Освещение</div>
        </div>
        <div className="placeholder">Лампы не подключены. Добавь интеграцию (Zigbee, Yeelight, Tasmota, Home Assistant) на странице «Integrations».</div>
      </div>
    );
  }

  const toggle = async (id: number, on: boolean) => {
    try {
      await api.command(id, { state: on ? "OFF" : "ON" });
      refresh();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Освещение</div>
        <div className="card-tools"><span className="chip">{onCount} / {lights.length} ON</span></div>
      </div>
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        {lights.map((d) => {
          const on = d.state?.state === "ON";
          const value = typeof d.state?.brightness === "number"
            ? Math.round((d.state.brightness / 254) * 100) : null;
          return (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 6px", borderBottom: "1px dashed var(--hairline)",
            }}>
              <div className="device-ico" style={{width:30, height:30, color: on ? "var(--accent)" : "var(--text-3)"}}>
                <Icons.Lightbulb />
              </div>
              <div style={{flex:1, minWidth: 0}}>
                <div style={{fontSize:12.5, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                  {d.friendly_name}
                </div>
                <div style={{fontSize:10, color:"var(--text-3)", fontFamily:"var(--font-mono)"}}>
                  {d.vendor || d.integration?.toUpperCase()}{value !== null ? ` · ${value}%` : ""}
                </div>
              </div>
              <div className={`toggle ${on ? "on" : ""}`} onClick={() => toggle(d.id, on)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
