import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";
import { COUNTRIES, flag } from "./countries";
import { SavedLocation, searchCities } from "./useLocation";

export function LocationPicker({
  open, initial, onClose, onSave,
}: {
  open: boolean;
  initial?: SavedLocation | null;
  onClose: () => void;
  onSave: (loc: SavedLocation) => void;
}) {
  const [countryCode, setCountryCode] = useState(initial?.country || "RU");
  const [countryQuery, setCountryQuery] = useState("");
  const [cityQuery, setCityQuery] = useState(initial?.city || "");
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Debounced city search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (!cityQuery || cityQuery.length < 2) {
      setCityResults([]); return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true); setError(null);
      try {
        const list = await searchCities(cityQuery, countryCode, ctrl.signal);
        setCityResults(list);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e?.message || "search failed");
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [cityQuery, countryCode]);

  if (!open) return null;

  const filteredCountries = COUNTRIES.filter(c =>
    !countryQuery ||
    c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
    c.code.toLowerCase().includes(countryQuery.toLowerCase())
  );

  const pickCity = (r: any) => {
    onSave({
      country: r.country_code,
      countryName: COUNTRIES.find(c => c.code === r.country_code)?.name || r.country,
      city: r.admin1 && r.admin1 !== r.name ? `${r.name}, ${r.admin1}` : r.name,
      lat: r.lat, lon: r.lon,
    });
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: "min(640px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Выбор локации</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", marginTop: 2 }}>
              СТРАНА И ГОРОД
            </div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, overflow: "hidden", flex: 1, minHeight: 0 }}>
          {/* Country column */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <input
              className="lp-input"
              placeholder="Страна…"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
            />
            <div style={{ overflowY: "auto", flex: 1, marginTop: 8, border: "1px solid var(--hairline)", borderRadius: 12 }}>
              {filteredCountries.map((c) => (
                <div
                  key={c.code}
                  onClick={() => setCountryCode(c.code)}
                  className="lp-row"
                  data-active={countryCode === c.code}
                >
                  <span style={{ fontSize: 16 }}>{flag(c.code)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{c.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* City column */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <input
              className="lp-input"
              placeholder="Город (минимум 2 буквы)…"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              autoFocus
            />
            <div style={{ overflowY: "auto", flex: 1, marginTop: 8, border: "1px solid var(--hairline)", borderRadius: 12 }}>
              {busy && <div style={{ padding: 12, fontSize: 12, color: "var(--text-3)" }}>Ищу…</div>}
              {error && <div style={{ padding: 12, fontSize: 12, color: "var(--danger)" }}>{error}</div>}
              {!busy && !error && cityResults.length === 0 && cityQuery.length >= 2 && (
                <div style={{ padding: 12, fontSize: 12, color: "var(--text-3)" }}>Ничего не найдено</div>
              )}
              {cityResults.map((r, i) => (
                <div key={i} onClick={() => pickCity(r)} className="lp-row">
                  <span style={{ fontSize: 14 }}>{flag(r.country_code)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      {r.admin1 ? `${r.admin1.toUpperCase()} · ` : ""}{r.country}
                      {r.population ? ` · ${Math.round(r.population / 1000)}K` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          .lp-input {
            background: rgba(0,0,0,0.4); border: 1px solid var(--hairline);
            color: var(--text-1); border-radius: 10px; padding: 9px 11px;
            font-size: 13px; font-family: inherit; outline: none;
            transition: border-color 0.15s;
          }
          .lp-input:focus { border-color: rgba(34,229,255,0.5); box-shadow: 0 0 0 3px rgba(34,229,255,0.12); }
          .lp-row {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 12px; cursor: pointer;
            border-bottom: 1px dashed var(--hairline);
            transition: background 0.12s;
          }
          .lp-row:hover { background: var(--glass); }
          .lp-row[data-active="true"] { background: rgba(34,229,255,0.1); color: var(--text-1); }
          .lp-row:last-child { border-bottom: 0; }
        `}</style>
      </div>
    </div>
  );
}
