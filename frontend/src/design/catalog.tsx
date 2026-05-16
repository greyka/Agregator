import { useEffect, useMemo, useRef, useState } from "react";
import { api, IntegrationKind } from "../api";
import { Icons } from "./icons";

const KIND_LABEL: Record<string, string> = {
  zigbee2mqtt: "Zigbee",
  tasmota: "Tasmota",
  shelly: "Shelly",
  yeelight: "Yeelight",
  xiaomi_gateway: "Xiaomi Gateway",
  xiaomi_miio: "Xiaomi miIO",
  home_assistant: "Home Assistant",
};

const KIND_COLOR: Record<string, string> = {
  zigbee2mqtt: "#22E5FF",
  tasmota: "#56F1A6",
  shelly: "#FFB547",
  yeelight: "#9D7BFF",
  xiaomi_gateway: "#FF6BD6",
  xiaomi_miio: "#FF6BD6",
  home_assistant: "#56F1A6",
};

type CatalogItem = {
  vendor: string; model: string; description: string;
  integration_kind: string; image_url?: string | null;
};

export function CatalogScreen() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; by_kind: Record<string, number> } | null>(null);
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    api.catalogStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const r = await api.catalogSearch({
          q: q || undefined,
          kind: kind || undefined,
          limit: 100,
        });
        setResults(r.results);
        setTotal(r.total);
      } catch (e: any) {
        setError(e?.message || "search failed");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [q, kind]);

  const kindsList = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_kind).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const onPick = async (item: CatalogItem) => {
    // Look up the matching IntegrationKind metadata so we open the right editor
    try {
      const kinds = await api.integrationKinds();
      const meta = kinds.find((k: IntegrationKind) => k.kind === item.integration_kind);
      if (!meta) {
        alert(`Интеграция ${item.integration_kind} не зарегистрирована — обновись.`);
        return;
      }
      // Side-channel hint that integrations page already understands
      (window as any).__prefillHost = "";
      // Navigate to Integrations and let user finish there
      window.dispatchEvent(new CustomEvent("agregator:goto", { detail: "integrations" }));
      alert(`Открой вкладку «Integrations» — добавь интеграцию ${meta.label}, твоё устройство будет работать через неё. (${item.vendor} ${item.model})`);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="col-12">
      <div className="card">
        <div className="card-h">
          <div className="card-title">Каталог устройств</div>
          <div className="card-tools">
            {stats && <span className="chip live">{stats.total.toLocaleString("ru")} моделей</span>}
          </div>
        </div>

        {/* Search bar */}
        <div style={{display:"flex", gap: 10, alignItems: "center", marginBottom: 12}}>
          <div className="search" style={{flex: 1, maxWidth: "none", marginLeft: 0}}>
            <Icons.Search />
            <input
              placeholder="Поиск по бренду или модели — ‘sonoff’, ‘aqara’, ‘shelly plus’…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <span className="kbd">{loading ? "…" : `${total}`}</span>
          </div>
        </div>

        {/* Kind filter chips */}
        <div style={{display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14}}>
          <span className={`pill ${kind === null ? "active" : ""}`} onClick={() => setKind(null)} style={{cursor:"pointer"}}>
            Все · {stats?.total ?? "…"}
          </span>
          {kindsList.map(([k, n]) => (
            <span
              key={k}
              className={`pill ${kind === k ? "active" : ""}`}
              onClick={() => setKind(k === kind ? null : k)}
              style={{cursor:"pointer", color: kind === k ? KIND_COLOR[k] : undefined}}
            >
              {KIND_LABEL[k] || k} · {n}
            </span>
          ))}
        </div>

        {error && (
          <div className="tag danger" style={{padding: "8px 12px", display: "block", marginBottom: 12}}>{error}</div>
        )}

        {/* Results grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 10,
        }}>
          {results.map((it, i) => (
            <CatalogCard key={`${it.integration_kind}:${it.model}:${i}`} item={it} onPick={() => onPick(it)} />
          ))}
        </div>

        {!loading && results.length === 0 && (
          <div className="placeholder" style={{marginTop: 16}}>
            Ничего не нашлось. Попробуй другой запрос или сними фильтр протокола.
          </div>
        )}

        {total > results.length && (
          <div style={{padding: 14, textAlign: "center", color: "var(--text-3)", fontSize: 12}}>
            Показано {results.length} из {total}. Уточни запрос чтобы сузить.
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogCard({ item, onPick }: { item: CatalogItem; onPick: () => void }) {
  const color = KIND_COLOR[item.integration_kind] || "#22E5FF";
  const label = KIND_LABEL[item.integration_kind] || item.integration_kind;
  return (
    <div className="card hoverable" style={{padding: 12, display: "flex", flexDirection: "column", gap: 8}}>
      <div style={{display: "flex", alignItems: "flex-start", gap: 10, minHeight: 56}}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            style={{
              width: 48, height: 48, borderRadius: 10, objectFit: "contain",
              background: "rgba(255,255,255,0.05)", flexShrink: 0, padding: 4,
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="device-ico" style={{
            width: 48, height: 48, flexShrink: 0,
            background: `${color}22`, borderColor: `${color}55`, color,
          }}>
            <Icons.Devices />
          </div>
        )}
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 12, fontWeight: 600, lineHeight: 1.25, overflow:"hidden", textOverflow:"ellipsis"}}>
            {item.vendor && <span style={{color: "var(--text-2)"}}>{item.vendor} </span>}
            <span>{item.model}</span>
          </div>
          <div style={{fontSize: 10.5, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3, maxHeight: 32, overflow: "hidden"}}>
            {item.description}
          </div>
        </div>
      </div>
      <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8}}>
        <span className="tag" style={{color, borderColor: `${color}55`, background: `${color}14`}}>
          {label}
        </span>
        <button className="btn primary" style={{padding: "5px 10px", fontSize: 11.5}} onClick={onPick}>
          Добавить
        </button>
      </div>
    </div>
  );
}
