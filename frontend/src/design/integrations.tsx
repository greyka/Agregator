import { useEffect, useState } from "react";
import { api, Integration, IntegrationKind, IntegrationField } from "../api";
import { useStore } from "../store";
import { Icons } from "./icons";

const KIND_ICON: Record<string, keyof typeof Icons> = {
  zigbee2mqtt: "Wifi",
  tasmota: "Wifi",
  shelly: "Lightbulb",
  yeelight: "Lightbulb",
  xiaomi_gateway: "Shield",
  xiaomi_cloud: "Globe",
  home_assistant: "Dashboard",
  lg_webos: "Tv",
  keenetic: "Wifi",
};

const STATUS_COLOR: Record<string, string> = {
  online: "var(--ok)",
  reconnecting: "var(--warn)",
  error: "var(--danger)",
  pending: "var(--text-3)",
  stopped: "var(--text-3)",
  starting: "var(--text-3)",
  unknown: "var(--text-3)",
};

export function IntegrationsScreen() {
  const { integrations, refreshIntegrations } = useStore();
  const [kinds, setKinds] = useState<IntegrationKind[]>([]);
  const [adding, setAdding] = useState<IntegrationKind | null>(null);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<Awaited<ReturnType<typeof api.discover>> | null>(null);

  useEffect(() => {
    api.integrationKinds().then(setKinds).catch(console.error);
    refreshIntegrations();
  }, []);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await api.discover();
      setScanResult(result);
    } catch (e) {
      console.error(e);
      alert("Сканирование не удалось: " + (e as any)?.message);
    } finally {
      setScanning(false);
    }
  };

  const onScanPick = (cand: { ip: string; integration_kind: string | null }) => {
    if (!cand.integration_kind) return;
    const meta = kinds.find((k) => k.kind === cand.integration_kind);
    if (!meta) return;
    setScanResult(null);
    setAdding(meta);
    // Stash the IP so the editor can pre-fill — done via a side channel below.
    (window as any).__prefillHost = cand.ip;
  };

  return (
    <>
      <div className="col-12">
        <div className="card">
          <div className="card-h">
            <div className="card-title">Connected Systems</div>
            <div className="card-tools" style={{display:"flex", gap: 6}}>
              <button className="btn" style={{padding:"6px 12px", fontSize:12}} onClick={scan} disabled={scanning}>
                <Icons.Search /> {scanning ? "Сканирую…" : "Найти в сети"}
              </button>
              <button className="btn primary" style={{padding:"6px 12px", fontSize:12}} onClick={() => setPicking(true)}>
                <Icons.Plus /> Add
              </button>
            </div>
          </div>
          {integrations.length === 0 ? (
            <div className="placeholder">No integrations yet. Add Zigbee bridge, Xiaomi gateway, Wi-Fi devices…</div>
          ) : (
            <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 12}}>
              {integrations.map(it => {
                const meta = kinds.find(k => k.kind === it.kind);
                const Ic = Icons[KIND_ICON[it.kind] || "Wifi"];
                return (
                  <div key={it.id} className="card hoverable" style={{padding: 16}}>
                    <div style={{display:"flex", alignItems:"flex-start", gap: 10}}>
                      <div className="device-ico" style={{width: 36, height: 36}}><Ic /></div>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{fontSize: 13.5, fontWeight: 600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{it.name}</div>
                        <div style={{fontSize: 10.5, color:"var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em", marginTop: 2}}>
                          {(meta?.label || it.kind).toUpperCase()}
                        </div>
                      </div>
                      <div className={`toggle ${it.enabled ? "on" : ""}`} onClick={async () => {
                        await api.updateIntegration(it.id, { enabled: !it.enabled });
                        refreshIntegrations();
                      }} />
                    </div>
                    <div style={{marginTop: 12, display:"flex", alignItems:"center", gap: 8}}>
                      <span className="status" style={{color: STATUS_COLOR[it.status] || "var(--text-3)"}}>
                        <span className="d" style={{background: STATUS_COLOR[it.status] || "var(--text-3)"}} />
                        {it.status.toUpperCase()}
                      </span>
                    </div>
                    {it.last_error && (
                      <div className="tag danger" style={{marginTop: 8, padding:"4px 8px", display:"block"}}>
                        {it.last_error}
                      </div>
                    )}
                    <div style={{display:"flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--hairline)"}}>
                      <button className="btn" style={{padding:"6px 10px", fontSize: 11.5, flex: 1}} onClick={() => setEditing(it)}>Configure</button>
                      <button className="btn" style={{padding:"6px 10px", fontSize: 11.5}} onClick={async () => {
                        await api.restartIntegration(it.id);
                        refreshIntegrations();
                      }} title="Restart"><Icons.Refresh /></button>
                      <button className="btn" style={{padding:"6px 10px", fontSize: 11.5, color: "var(--danger)"}} onClick={async () => {
                        if (!confirm(`Delete "${it.name}"?`)) return;
                        await api.deleteIntegration(it.id);
                        refreshIntegrations();
                      }} title="Delete"><Icons.Trash /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {picking && (
        <Picker
          kinds={kinds}
          onClose={() => setPicking(false)}
          onPick={(k) => { setPicking(false); setAdding(k); }}
        />
      )}

      {scanResult && (
        <DiscoverResults
          result={scanResult}
          onClose={() => setScanResult(null)}
          onPick={onScanPick}
        />
      )}

      {adding && (
        <Editor
          kind={adding}
          onClose={() => setAdding(null)}
          onSave={async (name, config) => {
            await api.createIntegration({ kind: adding.kind, name, config, enabled: true });
            setAdding(null);
            refreshIntegrations();
          }}
        />
      )}

      {editing && (() => {
        const meta = kinds.find(k => k.kind === editing.kind);
        if (!meta) return null;
        return (
          <Editor
            kind={meta}
            initialName={editing.name}
            initialConfig={editing.config}
            onClose={() => setEditing(null)}
            onSave={async (name, config) => {
              await api.updateIntegration(editing.id, { name, config });
              setEditing(null);
              refreshIntegrations();
            }}
          />
        );
      })()}
    </>
  );
}

function Picker({ kinds, onClose, onPick }: {
  kinds: IntegrationKind[];
  onClose: () => void;
  onPick: (k: IntegrationKind) => void;
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize: 17, fontWeight: 600}}>Add Integration</div>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em", marginTop: 2}}>SELECT PROTOCOL OR GATEWAY</div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>
        <div style={{display:"grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18}}>
          {kinds.map((k) => {
            const Ic = Icons[KIND_ICON[k.kind] || "Wifi"];
            return (
              <div key={k.kind} className="card hoverable" style={{padding: 14, cursor: "pointer"}} onClick={() => onPick(k)}>
                <div style={{display:"flex", alignItems:"center", gap: 10}}>
                  <div className="device-ico" style={{width: 36, height: 36, color: "var(--accent)", background: "rgba(34,229,255,0.12)", borderColor: "rgba(34,229,255,0.3)"}}><Ic /></div>
                  <div>
                    <div style={{fontSize: 13.5, fontWeight: 600}}>{k.label}</div>
                    <div style={{fontSize: 11, color: "var(--text-3)", lineHeight: 1.35, marginTop: 2}}>{k.description}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Editor({ kind, initialName, initialConfig, onClose, onSave }: {
  kind: IntegrationKind;
  initialName?: string;
  initialConfig?: Record<string, any>;
  onClose: () => void;
  onSave: (name: string, config: Record<string, any>) => Promise<void>;
}) {
  const [name, setName] = useState(initialName ?? kind.label);
  const [config, setConfig] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    const prefillHost = !initialConfig && (window as any).__prefillHost as string | undefined;
    if (prefillHost) delete (window as any).__prefillHost;
    for (const f of kind.config_schema) {
      let v = initialConfig?.[f.key] ?? f.default ?? "";
      if (prefillHost && f.key === "host") v = prefillHost;
      init[f.key] = v;
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const cleaned: Record<string, any> = {};
      for (const f of kind.config_schema) {
        const v = config[f.key];
        if (f.type === "int") cleaned[f.key] = v === "" ? null : Number(v);
        else if (f.type === "bool") cleaned[f.key] = Boolean(v);
        else cleaned[f.key] = v;
      }
      await onSave(name, cleaned);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize: 17, fontWeight: 600}}>{initialName ? "Configure" : "Add"} {kind.label}</div>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.08em", marginTop: 2}}>{kind.description}</div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        <div style={{marginTop: 18, display:"flex", flexDirection:"column", gap: 14}}>
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {kind.config_schema.map((f) => (
            <ConfigInput
              key={f.key}
              field={f}
              value={config[f.key]}
              onChange={(v) => setConfig({ ...config, [f.key]: v })}
            />
          ))}
          {error && <div className="tag danger" style={{padding: "6px 10px", fontSize: 12, fontFamily: "inherit"}}>{error}</div>}
          <button className="btn primary" disabled={busy} onClick={submit} style={{marginTop: 6}}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <style>{`
          .input {
            width: 100%; background: rgba(0,0,0,0.4);
            border: 1px solid var(--hairline); color: var(--text-1);
            border-radius: 12px; padding: 10px 12px; font-size: 13px;
            font-family: inherit; outline: none; transition: border-color 0.15s;
          }
          .input:focus { border-color: rgba(34,229,255,0.5); box-shadow: 0 0 0 3px rgba(34,229,255,0.12); }
        `}</style>
      </div>
    </div>
  );
}

function ConfigInput({ field, value, onChange }: {
  field: IntegrationField;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <Field label={field.label + (field.required ? " *" : "")} help={field.help}>
      {field.type === "bool" ? (
        <div className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} />
      ) : (
        <input
          className="input"
          type={field.type === "password" ? "password" : field.type === "int" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function Field({ label, help, children }: { label: string; help?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6}}>
        {label}
      </div>
      {children}
      {help && <div style={{fontSize: 11, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4}}>{help}</div>}
    </div>
  );
}

function DiscoverResults({
  result, onClose, onPick,
}: {
  result: { subnet: string; count: number; candidates: any[] };
  onClose: () => void;
  onPick: (cand: any) => void;
}) {
  const actionable = result.candidates.filter((c) => c.integration_kind);
  const other = result.candidates.filter((c) => !c.integration_kind);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width: "min(640px, 96vw)", maxHeight: "92vh", overflowY: "auto"}} onClick={(e) => e.stopPropagation()}>
        <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between"}}>
          <div>
            <div style={{fontSize: 17, fontWeight: 600}}>Найдено в сети</div>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", marginTop: 2}}>
              SUBNET {result.subnet.toUpperCase()} · {actionable.length}/{result.count} ПОДДЕРЖИВАЕМЫХ
            </div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        {actionable.length === 0 && other.length === 0 && (
          <div className="placeholder" style={{marginTop: 18}}>
            Ничего не нашлось. Если устройства точно в сети — возможно, Docker bridge блокирует широковещание. Попробуй добавить вручную через «+ Add».
          </div>
        )}

        {actionable.length > 0 && (
          <div style={{marginTop: 18}}>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginBottom: 8}}>
              ПОДДЕРЖИВАЕМЫЕ
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: 8}}>
              {actionable.map((c, i) => (
                <CandidateRow key={i} c={c} onPick={() => onPick(c)} primary />
              ))}
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div style={{marginTop: 18}}>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", marginBottom: 8}}>
              ПРОЧИЕ ХОСТЫ (нет известного протокола)
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: 6}}>
              {other.map((c, i) => (
                <CandidateRow key={i} c={c} onPick={() => {}} primary={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateRow({ c, onPick, primary }: {
  c: any; onPick: () => void; primary: boolean;
}) {
  const Ic = c.integration_kind ? Icons[KIND_ICON[c.integration_kind] || "Wifi"] : Icons.Wifi;
  return (
    <div className="card hoverable" style={{padding: 12, display: "flex", alignItems: "center", gap: 12}}>
      <div className="device-ico" style={{
        width: 32, height: 32, flexShrink: 0,
        color: primary ? "var(--accent)" : "var(--text-3)",
        background: primary ? "rgba(34,229,255,0.12)" : "var(--glass)",
        borderColor: primary ? "rgba(34,229,255,0.3)" : "var(--hairline)",
      }}>
        <Ic />
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: 13, fontWeight: 600, display: "flex", alignItems: "baseline", gap: 8}}>
          <span style={{fontFamily: "var(--font-mono)"}}>{c.ip}</span>
          {c.vendor && <span style={{color: "var(--text-2)", fontWeight: 500}}>· {c.vendor}</span>}
        </div>
        <div style={{fontSize: 11, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3}}>
          {c.hint || `Открытые порты: ${c.open_ports?.join(", ")}`}
        </div>
      </div>
      {primary && (
        <button className="btn primary" style={{padding: "6px 12px", fontSize: 11.5}} onClick={onPick}>
          Подключить
        </button>
      )}
    </div>
  );
}
