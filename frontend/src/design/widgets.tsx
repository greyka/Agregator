import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { useTicker, smoothLine, genSeries } from "./utils";
import { ROOMS, FEED, ALERTS, CAMERAS as CAMS_MOCK, UIDevice } from "./mock";
import { useWeather, conditionToInfo } from "./useWeather";

export function WeatherHero() {
  const w = useWeather();
  const info = conditionToInfo(w.condition);
  return (
    <div className="card glow-border" style={{padding: 22}}>
      <div className="card-h" style={{marginBottom: 10}}>
        <div className="card-title">
          Local · {w.loading ? "Locating…" : w.city}
          {w.provider && !w.loading && (
            <span style={{marginLeft: 8, fontSize: 9, color: "var(--text-3)", letterSpacing: "0.12em"}}>
              · {w.provider.toUpperCase()}
            </span>
          )}
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
              {info.label} · feels like <b>{w.feels}°</b>
              {w.uvIndex !== null && <> · UV <b>{Math.round(w.uvIndex)}</b></>}
            </div>
            <div style={{display:"flex", gap:8, marginTop: 12, flexWrap:"wrap"}}>
              <span className="tag"><Icons.Wind /> {w.wind} km/h {w.windDir}</span>
              <span className="tag"><Icons.Droplet /> {w.humidity}%</span>
              <span className="tag"><Icons.Sun /> Sunset {w.sunset}</span>
            </div>
          </div>
          <div className="forecast" style={{marginTop: 20}}>
            {w.hourly.map((f, i) => {
              const Ic = Icons[conditionToInfo(f.condition).icon];
              return (
                <div key={i} className={`cell ${f.now ? "now" : ""}`}>
                  <Ic style={{width:16, height:16, color: f.now ? "var(--accent)" : "var(--text-2)"} as any} />
                  <div className="t">{f.temp}°</div>
                  <div className="d">{f.label}</div>
                </div>
              );
            })}
            {w.hourly.length === 0 && Array.from({length: 5}).map((_, i) => (
              <div key={i} className="cell"><div className="t">—</div><div className="d">…</div></div>
            ))}
          </div>
        </div>
        <div style={{position:"relative", display:"flex", alignItems:"center", justifyContent:"center"}}>
          <WeatherGlyph />
        </div>
      </div>
    </div>
  );
}

function WeatherGlyph() {
  return (
    <svg viewBox="0 0 220 200" style={{width:"100%", height:"100%", maxHeight: 220}}>
      <defs>
        <radialGradient id="sunG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD27A" />
          <stop offset="60%" stopColor="rgba(255,180,90,0.45)" />
          <stop offset="100%" stopColor="rgba(255,180,90,0)" />
        </radialGradient>
        <linearGradient id="cloudG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)"/>
        </linearGradient>
      </defs>
      <circle cx="130" cy="86" r="80" fill="url(#sunG)">
        <animate attributeName="r" values="78;86;78" dur="6s" repeatCount="indefinite" />
      </circle>
      <circle cx="130" cy="86" r="32" fill="rgba(255,209,140,0.95)" />
      <g opacity="0.9">
        <ellipse cx="78" cy="120" rx="58" ry="22" fill="url(#cloudG)" />
        <ellipse cx="148" cy="138" rx="70" ry="24" fill="url(#cloudG)" />
        <ellipse cx="60" cy="148" rx="44" ry="16" fill="url(#cloudG)" />
      </g>
    </svg>
  );
}

export function QuickStats() {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:14}}>
      <StatCard title="Energy Use" value="3.42" unit="kWh" delta="-12% vs avg" icon="Bolt" tone="cyan" series={genSeries(20, 3.4, 1.2, 7)} />
      <StatCard title="Solar Export" value="4.81" unit="kW" delta="+2.1 last hr" icon="Sun" tone="violet" series={genSeries(20, 4.0, 1.0, 13)} />
      <StatCard title="Air Quality" value="18" unit="AQI" delta="Excellent" icon="Wind" tone="ok" series={genSeries(20, 22, 6, 21)} />
    </div>
  );
}

function StatCard({ title, value, unit, delta, icon, tone, series }: {
  title: string; value: string; unit?: string; delta: string;
  icon: keyof typeof Icons; tone: "cyan"|"violet"|"ok"; series: number[];
}) {
  const Ic = Icons[icon];
  const tones = {
    cyan: { c: "#22E5FF", grad: "url(#sparkCyan)" },
    violet: { c: "#9D7BFF", grad: "url(#sparkViolet)" },
    ok: { c: "#56F1A6", grad: "url(#sparkOk)" },
  };
  const t = tones[tone];
  const path = smoothLine(series, 180, 50, 2, 4);
  return (
    <div className="card hoverable" style={{padding: 16, paddingBottom: 6}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div className="device-ico" style={{width:30, height:30, background: `${t.c}22`, borderColor: `${t.c}55`, color: t.c}}><Ic /></div>
          <div>
            <div style={{fontSize:12, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em"}}>{title}</div>
            <div style={{fontSize:22, fontWeight:600, letterSpacing:"-0.02em", lineHeight:1.1}}>{value}<span style={{fontSize:12, color:"var(--text-3)", marginLeft:4}}>{unit}</span></div>
          </div>
        </div>
        <div className="tag" style={{color: t.c, borderColor: `${t.c}40`, background: `${t.c}14`}}>{delta}</div>
      </div>
      <svg width="100%" height="50" style={{marginTop: 6, display:"block"}} viewBox="0 0 180 50" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkCyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(34,229,255,0.4)"/><stop offset="100%" stopColor="rgba(34,229,255,0)"/></linearGradient>
          <linearGradient id="sparkViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(157,123,255,0.4)"/><stop offset="100%" stopColor="rgba(157,123,255,0)"/></linearGradient>
          <linearGradient id="sparkOk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(86,241,166,0.4)"/><stop offset="100%" stopColor="rgba(86,241,166,0)"/></linearGradient>
        </defs>
        <path d={`${path} L 180 50 L 0 50 Z`} fill={t.grad} />
        <path d={path} stroke={t.c} strokeWidth="1.6" fill="none" style={{filter:`drop-shadow(0 0 4px ${t.c})`}} />
      </svg>
    </div>
  );
}

export function RoomsGrid() {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Rooms</div>
        <div className="card-tools"><span className="chip">{ROOMS.length} ZONES</span></div>
      </div>
      <div style={{display:"grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12}}>
        {ROOMS.map((r) => (
          <div key={r.id} className="card hoverable room" style={{padding: 12, borderRadius: 16}}>
            <div className="room-thumb">
              <svg viewBox="0 0 100 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`g${r.id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={r.color} stopOpacity="0.55"/>
                    <stop offset="100%" stopColor={r.color} stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <rect width="100" height="60" fill={`url(#g${r.id})`} />
                <g stroke={r.color} strokeOpacity="0.5" fill="none" strokeWidth="0.5">
                  <path d="M0 50 L20 35 L40 42 L60 25 L80 30 L100 18" />
                </g>
                <g stroke={r.color} strokeOpacity="0.7" fill="none" strokeWidth="0.8">
                  <rect x="10" y="10" width="80" height="40" rx="3" />
                  <line x1="10" y1="30" x2="35" y2="30"/>
                  <line x1="55" y1="30" x2="90" y2="30"/>
                </g>
              </svg>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginTop: 4}}>
              <div className="room-name">{r.name}</div>
              <div className="room-meta">{r.devices}D</div>
            </div>
            <div className="room-stats">
              <div className="room-stat"><Icons.Thermometer /> {r.temp}°</div>
              <div className="room-stat"><Icons.Droplet /> {r.humid}%</div>
            </div>
          </div>
        ))}
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

export function CameraGrid() {
  const tick = useTicker(1000);
  const time = useMemo(() => new Date().toLocaleTimeString("en-GB", { hour12: false }), [tick]);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Cameras · Live</div>
        <div className="card-tools"><span className="chip live">{CAMS_MOCK.length} STREAMS</span></div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap: 10}}>
        {CAMS_MOCK.map((c) => (
          <div key={c.id} className="cam">
            <div className="cam-feed" />
            <svg viewBox="0 0 200 140" style={{position:"absolute", inset:0, width:"100%", height:"100%"}} preserveAspectRatio="none">
              <g stroke="rgba(34,229,255,0.6)" strokeDasharray="3 3" fill="none">
                <rect x="60" y="40" width="50" height="60" rx="2">
                  <animate attributeName="x" values="60;62;60" dur="2.4s" repeatCount="indefinite" />
                </rect>
              </g>
              <text x="62" y="38" fill="#22E5FF" fontSize="6" fontFamily="JetBrains Mono">person · 0.94</text>
            </svg>
            <div className="cam-tag">{c.name}</div>
            <div className="cam-rec"><span className="d" />REC</div>
            <div className="cam-foot">
              <span>{time}</span>
              <span>4K · 30fps</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EnergyChart() {
  const tick = useTicker(2200);
  const series = useMemo(() => genSeries(48, 3.2, 1.6, 100 + tick), [tick]);
  const exp = useMemo(() => genSeries(48, 2.8, 1.4, 200 + tick), [tick]);
  const W = 600, H = 200, P = 18;
  const path1 = smoothLine(series, W, H, P, P);
  const path2 = smoothLine(exp, W, H, P, P);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Energy Flow · 24h</div>
        <div className="card-tools">
          <span className="pill"><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#22E5FF", marginRight:6, boxShadow:"0 0 6px #22E5FF"}} />Consumption</span>
          <span className="pill"><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#9D7BFF", marginRight:6, boxShadow:"0 0 6px #9D7BFF"}} />Solar</span>
        </div>
      </div>
      <div style={{position:"relative", marginTop: 4}}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="eg1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,229,255,0.35)" />
              <stop offset="100%" stopColor="rgba(34,229,255,0)" />
            </linearGradient>
            <linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(157,123,255,0.3)" />
              <stop offset="100%" stopColor="rgba(157,123,255,0)" />
            </linearGradient>
          </defs>
          {Array.from({length:5}).map((_,i)=>(
            <line key={i} x1={P} x2={W-P} y1={P + i*((H-2*P)/4)} y2={P + i*((H-2*P)/4)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4"/>
          ))}
          <path d={`${path2} L ${W-P} ${H-P} L ${P} ${H-P} Z`} fill="url(#eg2)" />
          <path d={`${path1} L ${W-P} ${H-P} L ${P} ${H-P} Z`} fill="url(#eg1)" />
          <path d={path2} stroke="#9D7BFF" strokeWidth="1.8" fill="none" style={{filter:"drop-shadow(0 0 6px rgba(157,123,255,0.6))"}} />
          <path d={path1} stroke="#22E5FF" strokeWidth="2" fill="none" style={{filter:"drop-shadow(0 0 6px rgba(34,229,255,0.6))"}} />
          {["00","06","12","18","24"].map((t,i)=>(
            <text key={t} x={P + i*((W-2*P)/4)} y={H-3} fontSize="9" fill="#5B6377" fontFamily="JetBrains Mono" textAnchor="middle">{t}h</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function ClimateCard() {
  const tick = useTicker(2500);
  const tempSeries = useMemo(()=> genSeries(28, 22, 1.6, 300 + tick), [tick]);
  const humSeries = useMemo(()=> genSeries(28, 47, 6, 400 + tick), [tick]);
  const W = 280, H = 110, P = 10;
  const p1 = smoothLine(tempSeries, W, H, P, P);
  const p2 = smoothLine(humSeries, W, H, P, P);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Climate · Living Room</div>
        <div className="card-tools"><span className="chip live">LIVE</span></div>
      </div>
      <div style={{display:"flex", gap:18, alignItems:"flex-end"}}>
        <div className="metric">
          <div className="num">22.4<span className="unit">°C</span></div>
          <div className="delta">▲ 0.4°  last hr</div>
        </div>
        <div className="metric" style={{marginLeft:"auto"}}>
          <div className="num" style={{fontSize:28, color:"var(--text-2)"}}>47<span className="unit">%RH</span></div>
          <div className="delta">comfortable</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{marginTop: 10}} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cl1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,229,255,0.3)"/><stop offset="100%" stopColor="rgba(34,229,255,0)"/>
          </linearGradient>
        </defs>
        <path d={`${p1} L ${W-P} ${H-P} L ${P} ${H-P} Z`} fill="url(#cl1)" />
        <path d={p1} stroke="#22E5FF" strokeWidth="1.6" fill="none" style={{filter:"drop-shadow(0 0 4px #22E5FF)"}} />
        <path d={p2} stroke="#9D7BFF" strokeWidth="1.3" strokeDasharray="3 3" fill="none" opacity="0.8"/>
      </svg>
    </div>
  );
}

export function PresenceCard() {
  const people = [
    { name: "Greyka", room: "Studio", away: false, since: "1h 24m" },
    { name: "Aura", room: "Core", away: false, since: "always" },
  ];
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Presence</div>
        <div className="card-tools"><span className="chip">{people.filter(p=>!p.away).length} HOME</span></div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap: 10}}>
        {people.map((p, i) => (
          <div key={p.name} style={{display:"flex", alignItems:"center", gap: 10}}>
            <div className="avatar" style={{background: `linear-gradient(135deg, ${["#22E5FF","#9D7BFF"][i%2]}, #0E1118)`}}>
              {p.name[0]}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize: 13, fontWeight:500}}>{p.name}</div>
              <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.06em"}}>{p.room.toUpperCase()}</div>
            </div>
            <div className="status"><span className="d" />{p.since}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScenesCard({ scenes, onActivate }: {
  scenes: { id: string; name: string; meta: string; bg: string; active: boolean; icon: string }[];
  onActivate: (id: string) => void;
}) {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Scenes</div>
        <div className="card-tools"><span className="pill"><Icons.Plus /> New</span></div>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 10}}>
        {scenes.map((s) => {
          const Ic = Icons[s.icon] || Icons.Sparkles;
          return (
            <div key={s.id} className={`scene ${s.bg} ${s.active ? "active" : ""}`} onClick={() => onActivate(s.id)}>
              <div>
                <div className="name">{s.name}</div>
                <div className="meta">{s.meta}</div>
              </div>
              <div className="icn"><Ic /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AIPanel({ compact = false }: { compact?: boolean }) {
  const [msgs, setMsgs] = useState([
    { who: "ai", text: "Good evening, Greyka. Local LLM connected — agent ready.", ts: "now" },
  ]);
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { who: "user", text, ts: "now" }]);
    setText("");
    setTimeout(() => {
      setMsgs((m) => [...m, { who: "ai", text: "AI module is a stub — wire to your model when ready.", ts: "now" }]);
    }, 600);
  };
  return (
    <div className="card glow-border" style={{display:"flex", flexDirection:"column"}}>
      <div className="card-h">
        <div className="card-title">Aura · AI Assistant</div>
        <div className="card-tools"><span className="chip live">LOCAL LLM</span></div>
      </div>
      <div style={{flex:1, maxHeight: compact ? 180 : 240, overflowY:"auto"}}>
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.who}`}>
            <div className="av">{m.who === "ai" ? "A" : "G"}</div>
            <div className="body">{m.text}<span className="ts">{m.ts}</span></div>
          </div>
        ))}
      </div>
      <div className="suggest">
        {["Set Cinema Mode", "Dim hallway 20%", "Show energy report", "Lock all doors"].map(s => (
          <span key={s} className="pill" onClick={() => setText(s)}>{s}</span>
        ))}
      </div>
      <div className="ai-input" style={{marginTop: 10}}>
        <Icons.Sparkles style={{color:"var(--accent)"} as any} />
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask Aura to do anything…" />
        <div className="icon-btn" style={{width:30, height:30}}><Icons.Mic /></div>
        <div className="icon-btn" style={{width:30, height:30, background:"var(--accent)", color:"#04141a", borderColor:"transparent"}} onClick={send}><Icons.Send /></div>
      </div>
    </div>
  );
}

export function ServerCard() {
  const tick = useTicker(1500);
  const cpu = useMemo(() => 42 + Math.round(Math.sin(tick/3)*8 + (Math.random()-0.5)*6), [tick]);
  const gpu = useMemo(() => 78 + Math.round(Math.sin(tick/2.4)*6 + (Math.random()-0.5)*5), [tick]);
  const mem = useMemo(() => 64 + Math.round(Math.sin(tick/3.8)*4 + (Math.random()-0.5)*3), [tick]);
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Compute · umbrelOS</div>
        <div className="card-tools"><span className="chip live">192.168.1.100</span></div>
      </div>
      <div style={{display:"flex", justifyContent:"space-around", gap: 10}}>
        <Ring v={cpu} c="#22E5FF" label="CPU" sub="x86" />
        <Ring v={gpu} c="#9D7BFF" label="GPU" sub="N/A" />
        <Ring v={mem} c="#FF6BD6" label="MEM" sub="DDR4" />
      </div>
    </div>
  );
}

function Ring({ v, c, label, sub }: { v: number; c: string; label: string; sub: string }) {
  const r = 26;
  const C = 2 * Math.PI * r;
  const off = C - (v/100) * C;
  return (
    <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:6}}>
      <div className="ring" style={{color: c}}>
        <svg>
          <circle cx="35" cy="35" r={r} className="track" />
          <circle cx="35" cy="35" r={r} className="prog" stroke={c} strokeDasharray={C} strokeDashoffset={off}/>
        </svg>
        <div className="lbl">{v}%</div>
      </div>
      <div style={{fontSize:11, fontFamily:"var(--font-mono)", letterSpacing:"0.1em", color:"var(--text-2)"}}>{label}</div>
      <div style={{fontSize:9.5, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.06em"}}>{sub}</div>
    </div>
  );
}

export function ActivityFeed() {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Live Activity</div>
        <div className="card-tools"><span className="chip live">STREAMING</span></div>
      </div>
      <div>
        {FEED.map((f) => {
          const Ic = Icons[f.icon] || Icons.Activity;
          return (
            <div key={f.id} className="feed-item">
              <div className="feed-ico"><Ic /></div>
              <div className="feed-text">
                <div>{f.text}</div>
                <div className="src">{f.who.toUpperCase()}</div>
              </div>
              <div className="feed-time">{f.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SecurityCard() {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Security</div>
        <div className="card-tools"><span className="chip" style={{color: "var(--ok)"}}>● ARMED · HOME</span></div>
      </div>
      <div style={{display:"flex", alignItems:"center", gap: 14, padding:"10px 0 16px"}}>
        <div style={{width:54, height:54, borderRadius:14, display:"grid", placeItems:"center", background:"rgba(86,241,166,0.12)", border:"1px solid rgba(86,241,166,0.3)", color:"var(--ok)"}}>
          <Icons.Shield style={{width:22, height:22} as any} />
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:14, fontWeight:600}}>All systems nominal</div>
          <div style={{fontSize:11.5, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.06em"}}>SENSORS · CAMERAS · LOCKS</div>
        </div>
        <button className="btn">Disarm</button>
      </div>
      <div>
        {ALERTS.map(a => (
          <div key={a.id} className="feed-item">
            <div className="feed-ico" style={{background: a.level === "warn" ? "rgba(255,181,71,0.12)" : a.level === "danger" ? "rgba(255,92,122,0.12)" : "rgba(86,241,166,0.12)"}}>
              <span className={`tag ${a.level === "warn" ? "warn" : a.level === "danger" ? "danger" : "ok"}`} style={{padding:0, background:"transparent", border:0}}>●</span>
            </div>
            <div className="feed-text">
              <div>{a.title}</div>
              <div className="src">{a.body}</div>
            </div>
            <div className="feed-time">{a.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LightingCard() {
  const [bright, setBright] = useState(64);
  const [color, setColor] = useState(2);
  const swatches = ["#FFD27A", "#FFF6E5", "#22E5FF", "#9D7BFF", "#FF6BD6", "#56F1A6"];
  const groups = [
    { id: "g1", name: "Living Room", count: 4, on: true },
    { id: "g2", name: "Kitchen", count: 6, on: true },
    { id: "g3", name: "Bedroom", count: 3, on: false },
    { id: "g4", name: "Studio", count: 8, on: true },
  ];
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-title">Smart Lighting</div>
        <div className="card-tools"><span className="chip">{groups.reduce((s,g)=>s+(g.on?g.count:0),0)} ON</span></div>
      </div>
      <div style={{display:"flex", alignItems:"center", gap: 18, padding: "8px 0 14px"}}>
        <div style={{width: 90, height: 90, borderRadius:"50%", background: `radial-gradient(circle, ${swatches[color]}, ${swatches[color]}33 60%, transparent 75%)`, boxShadow:`0 0 36px ${swatches[color]}80`, position:"relative"}}>
          <div style={{position:"absolute", inset: 14, borderRadius:"50%", background: swatches[color], opacity: bright/100, transition:"all 0.25s"}} />
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em", marginBottom:6}}>BRIGHTNESS</div>
          <input type="range" min={0} max={100} value={bright} onChange={e => setBright(+e.target.value)} className="range"/>
          <div style={{fontSize:11, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.1em", margin:"12px 0 6px"}}>COLOR</div>
          <div style={{display:"flex", gap: 6}}>
            {swatches.map((s, i) => (
              <div key={i} className={`swatch ${color===i ? "sel" : ""}`} style={{background: s}} onClick={() => setColor(i)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
