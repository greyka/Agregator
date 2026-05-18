import { useEffect, useMemo, useState } from "react";
import { useStore, DiscoveredDevice } from "../store";
import { api } from "../api";
import { Icons } from "./icons";

const SOURCE_COLOR: Record<string, string> = {
  zeroconf: "#22E5FF",
  ssdp: "#9D7BFF",
  miio: "#FF6BD6",
  dhcp: "#56F1A6",
  tcp: "#FFB547",
};

const SOURCE_LABEL: Record<string, string> = {
  zeroconf: "mDNS",
  ssdp: "SSDP",
  miio: "miIO",
  dhcp: "DHCP",
  tcp: "TCP",
};

export function DiscoveredScreen() {
  const { discoveries, refreshDiscoveries, forgetDiscovery } = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [busyScan, setBusyScan] = useState(false);

  useEffect(() => { refreshDiscoveries(); }, []);

  const filtered = useMemo(() => {
    if (!source) return discoveries;
    return discoveries.filter((d) => d.source === source);
  }, [discoveries, source]);

  const bySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of discoveries) m[d.source] = (m[d.source] || 0) + 1;
    return m;
  }, [discoveries]);

  const actionable = filtered.filter((d) => d.matched_kinds.length > 0);
  const unknown = filtered.filter((d) => d.matched_kinds.length === 0);

  const rescan = async () => {
    setBusyScan(true);
    try { await api.discover(); refreshDiscoveries(); }
    finally { setBusyScan(false); }
  };

  return (
    <div className="col-12">
      <div className="card">
        <div className="card-h">
          <div className="card-title">Найдено в сети — live</div>
          <div className="card-tools" style={{display: "flex", gap: 6}}>
            <button className="btn" style={{padding:"6px 12px", fontSize:12}} onClick={rescan} disabled={busyScan}>
              <Icons.Refresh /> {busyScan ? "Сканирую…" : "Пересканировать TCP"}
            </button>
          </div>
        </div>

        <div style={{display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14}}>
          <span className={`pill ${source === null ? "active" : ""}`} onClick={() => setSource(null)} style={{cursor:"pointer"}}>
            Все · {discoveries.length}
          </span>
          {Object.entries(bySource).map(([s, n]) => (
            <span
              key={s}
              className={`pill ${source === s ? "active" : ""}`}
              onClick={() => setSource(s === source ? null : s)}
              style={{cursor:"pointer", color: source === s ? SOURCE_COLOR[s] : undefined}}
            >
              {SOURCE_LABEL[s] || s} · {n}
            </span>
          ))}
        </div>

        {discoveries.length === 0 && (
          <div className="placeholder">
            Пока ничего. Сканеры mDNS/SSDP/miIO/DHCP работают в фоне — устройства появятся здесь автоматически как только объявят себя в сети. Для активного поиска жми «Пересканировать TCP».
          </div>
        )}

        {actionable.length > 0 && (
          <Section title={`Поддерживаемые · ${actionable.length}`}>
            <Grid>
              {actionable.map((d) => (
                <DeviceRow key={d.unique_id} d={d} onForget={() => forgetDiscovery(d.unique_id)} />
              ))}
            </Grid>
          </Section>
        )}

        {unknown.length > 0 && (
          <Section title={`Неопознанные · ${unknown.length}`}>
            <Grid>
              {unknown.map((d) => (
                <DeviceRow key={d.unique_id} d={d} onForget={() => forgetDiscovery(d.unique_id)} />
              ))}
            </Grid>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{marginTop: 12}}>
      <div style={{
        fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)",
        letterSpacing: "0.1em", textTransform: "uppercase",
        marginBottom: 8, padding: "0 4px",
      }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      gap: 10,
    }}>{children}</div>
  );
}

function DeviceRow({ d, onForget }: { d: DiscoveredDevice; onForget: () => void }) {
  const sourceColor = SOURCE_COLOR[d.source] || "#22E5FF";
  return (
    <div className="card hoverable" style={{padding: 12, display: "flex", flexDirection: "column", gap: 8}}>
      <div style={{display: "flex", alignItems: "flex-start", gap: 10}}>
        <div className="device-ico" style={{
          width: 32, height: 32, flexShrink: 0,
          color: sourceColor, background: `${sourceColor}22`, borderColor: `${sourceColor}55`,
        }}>
          <Icons.Wifi />
        </div>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 13, fontWeight: 600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
            {d.name || d.hostname || d.ip}
          </div>
          <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", marginTop: 2}}>
            {d.ip}{d.mac ? ` · ${d.mac}` : ""} · {SOURCE_LABEL[d.source] || d.source}
          </div>
          {(d.vendor || d.model) && (
            <div style={{fontSize: 11, color: "var(--text-2)", marginTop: 4}}>
              {d.vendor} {d.model}
            </div>
          )}
          {d.hint && (
            <div style={{fontSize: 11, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3}}>
              {d.hint}
            </div>
          )}
        </div>
      </div>
      <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8}}>
        <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
          {d.matched_kinds.length > 0 ? d.matched_kinds.map((k) => (
            <span key={k} className="tag cyan" style={{padding: "2px 6px"}}>{k}</span>
          )) : (
            <span className="tag" style={{padding: "2px 6px"}}>—</span>
          )}
        </div>
        <div style={{display: "flex", gap: 4}}>
          {d.matched_kinds.length > 0 && (
            <button className="btn primary" style={{padding: "4px 10px", fontSize: 11}}
                    onClick={() => {
                      (window as any).__prefillHost = d.ip;
                      window.dispatchEvent(new CustomEvent("agregator:goto", { detail: "integrations" }));
                    }}>
              Подключить
            </button>
          )}
          <button className="btn" style={{padding: "4px 8px", fontSize: 11, color: "var(--text-3)"}}
                  onClick={onForget} title="Forget">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
