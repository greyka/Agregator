import { useEffect, useMemo, useState } from "react";
import { api, Floor, Room } from "../api";
import { useStore } from "../store";
import { Icons } from "./icons";
import { RoomIcon } from "./RoomIcon";
import { IconPicker, ColorPicker } from "./IconPicker";
import { getPresetByKey } from "./roomIcons";

export function RoomsScreen() {
  const { floors, rooms, devices, refreshRooms, refresh } = useStore();
  const [editingRoom, setEditingRoom] = useState<Room | "new" | null>(null);
  const [editingFloor, setEditingFloor] = useState<Floor | "new" | null>(null);
  const [defaultFloor, setDefaultFloor] = useState<number | null>(null);

  useEffect(() => { refreshRooms(); }, []);

  // Group rooms by floor, sorted by level desc (top floor first)
  const grouped = useMemo(() => {
    const byFloor = new Map<number | null, Room[]>();
    for (const r of rooms) {
      const k = r.floor_id;
      if (!byFloor.has(k)) byFloor.set(k, []);
      byFloor.get(k)!.push(r);
    }
    const ordered = [...floors].sort((a, b) => b.level - a.level || a.position - b.position);
    return { ordered, byFloor };
  }, [rooms, floors]);

  const orphan = rooms.filter(r => r.floor_id == null);

  return (
    <>
      <div className="col-12">
        <div className="card">
          <div className="card-h">
            <div className="card-title">Этажи и комнаты</div>
            <div className="card-tools" style={{display:"flex", gap: 6}}>
              <button className="btn" onClick={() => setEditingFloor("new")} style={{padding: "6px 10px", fontSize: 12}}>
                <Icons.Plus /> Этаж
              </button>
              <button className="btn primary" onClick={() => setEditingRoom("new")} style={{padding: "6px 10px", fontSize: 12}}>
                <Icons.Plus /> Комната
              </button>
            </div>
          </div>

          {floors.length === 0 && rooms.length === 0 && (
            <div className="placeholder">
              Этажей и комнат пока нет. Добавь этаж, затем комнаты на него.
            </div>
          )}

          {grouped.ordered.map((f) => (
            <FloorBlock
              key={f.id}
              floor={f}
              rooms={grouped.byFloor.get(f.id) || []}
              deviceCounts={devices}
              onEditFloor={() => setEditingFloor(f)}
              onAddRoom={() => { setDefaultFloor(f.id); setEditingRoom("new"); }}
              onEditRoom={(r) => setEditingRoom(r)}
            />
          ))}

          {orphan.length > 0 && (
            <FloorBlock
              floor={null}
              rooms={orphan}
              deviceCounts={devices}
              onAddRoom={() => { setDefaultFloor(null); setEditingRoom("new"); }}
              onEditRoom={(r) => setEditingRoom(r)}
            />
          )}
        </div>
      </div>

      <FloorEditor
        open={!!editingFloor}
        initial={editingFloor === "new" ? null : (editingFloor as Floor | null)}
        onClose={() => setEditingFloor(null)}
        onSaved={() => { setEditingFloor(null); refreshRooms(); }}
      />

      <RoomEditor
        open={!!editingRoom}
        initial={editingRoom === "new" ? null : (editingRoom as Room | null)}
        defaultFloorId={editingRoom === "new" ? defaultFloor : null}
        floors={floors}
        onClose={() => { setEditingRoom(null); setDefaultFloor(null); }}
        onSaved={() => { setEditingRoom(null); setDefaultFloor(null); refreshRooms(); refresh(); }}
      />
    </>
  );
}

function FloorBlock({
  floor, rooms, deviceCounts, onEditFloor, onAddRoom, onEditRoom,
}: {
  floor: Floor | null;
  rooms: Room[];
  deviceCounts: any[];
  onEditFloor?: () => void;
  onAddRoom: () => void;
  onEditRoom: (r: Room) => void;
}) {
  return (
    <div style={{marginTop: 14}}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        padding: "8px 4px", borderBottom: "1px dashed var(--hairline)",
        marginBottom: 12,
      }}>
        <div style={{display:"flex", alignItems:"baseline", gap: 10}}>
          <div style={{fontSize: 14, fontWeight: 600}}>
            {floor ? floor.name : "Без этажа"}
          </div>
          {floor && (
            <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em"}}>
              УРОВЕНЬ {floor.level} · {rooms.length} КОМНАТ
            </div>
          )}
        </div>
        <div style={{display:"flex", gap: 6}}>
          {floor && onEditFloor && (
            <span className="pill" onClick={onEditFloor} style={{cursor:"pointer", fontSize: 11}}>✎ Этаж</span>
          )}
          <span className="pill" onClick={onAddRoom} style={{cursor:"pointer", fontSize: 11}}>
            <Icons.Plus /> Комната
          </span>
        </div>
      </div>

      <div style={{
        display:"grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}>
        {rooms.map((r) => (
          <div
            key={r.id}
            className="card hoverable"
            style={{padding: 14, cursor: "pointer"}}
            onClick={() => onEditRoom(r)}
          >
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                display:"grid", placeItems:"center",
                background: `${r.color}22`,
                border: `1px solid ${r.color}55`,
                color: r.color,
              }}>
                <RoomIcon name={r.icon} size={20} />
              </div>
              <div style={{flex:1, minWidth: 0}}>
                <div style={{fontSize: 13.5, fontWeight: 600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                  {r.name}
                </div>
                <div style={{fontSize: 10.5, color: "var(--text-3)", fontFamily:"var(--font-mono)", letterSpacing:"0.06em", marginTop: 2}}>
                  {r.device_count} УСТР-В
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FloorEditor({
  open, initial, onClose, onSaved,
}: {
  open: boolean;
  initial: Floor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) { setName(initial.name); setLevel(initial.level); }
    else { setName(""); setLevel(0); }
  }, [initial, open]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    try {
      if (initial) await api.updateFloor(initial.id, { name, level });
      else await api.createFloor({ name: name || "Этаж", level });
      onSaved();
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!initial) return;
    if (!confirm(`Удалить этаж "${initial.name}"? Комнаты не удалятся, но потеряют привязку.`)) return;
    setBusy(true);
    try { await api.deleteFloor(initial.id); onSaved(); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width: "min(440px, 96vw)"}} onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize: 17, fontWeight: 600}}>{initial ? "Этаж" : "Новый этаж"}</div>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", marginTop: 2}}>
              FLOOR
            </div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        <div style={{marginTop: 18, display:"flex", flexDirection:"column", gap: 12}}>
          <Label text="Название">
            <input className="rp-input" autoFocus placeholder="Первый этаж" value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label text="Уровень (0=первый, 1=второй, -1=подвал)">
            <input className="rp-input" type="number" value={level} onChange={(e) => setLevel(parseInt(e.target.value) || 0)} />
          </Label>
        </div>

        <div style={{display:"flex", gap: 8, marginTop: 20, justifyContent: "flex-end"}}>
          {initial && (
            <button className="btn" style={{color: "var(--danger)"}} onClick={del} disabled={busy}>
              Удалить
            </button>
          )}
          <button className="btn primary" disabled={busy || !name} onClick={save}>
            {busy ? "Сохраняю…" : (initial ? "Сохранить" : "Создать")}
          </button>
        </div>

        <style>{`
          .rp-input {
            width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--hairline);
            color: var(--text-1); border-radius: 10px; padding: 9px 11px;
            font-size: 13px; font-family: inherit; outline: none;
          }
          .rp-input:focus { border-color: rgba(34,229,255,0.5); box-shadow: 0 0 0 3px rgba(34,229,255,0.12); }
        `}</style>
      </div>
    </div>
  );
}

function RoomEditor({
  open, initial, defaultFloorId, floors, onClose, onSaved,
}: {
  open: boolean;
  initial: Room | null;
  defaultFloorId: number | null;
  floors: Floor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("home");
  const [color, setColor] = useState("#22E5FF");
  const [floorId, setFloorId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name); setIcon(initial.icon);
      setColor(initial.color); setFloorId(initial.floor_id);
    } else {
      setName(""); setIcon("home"); setColor("#22E5FF");
      setFloorId(defaultFloorId);
    }
  }, [initial, defaultFloorId, open]);

  if (!open) return null;

  const save = async () => {
    setBusy(true);
    try {
      if (initial) await api.updateRoom(initial.id, { name, icon, color, floor_id: floorId });
      else await api.createRoom({ name: name || "Комната", icon, color, floor_id: floorId });
      onSaved();
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!initial) return;
    if (!confirm(`Удалить комнату "${initial.name}"?`)) return;
    setBusy(true);
    try { await api.deleteRoom(initial.id); onSaved(); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width: "min(560px, 96vw)", maxHeight: "92vh", overflowY: "auto"}} onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize: 17, fontWeight: 600}}>{initial ? "Комната" : "Новая комната"}</div>
            <div style={{fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", marginTop: 2}}>
              ROOM
            </div>
          </div>
          <div className="icon-btn" onClick={onClose}><Icons.X /></div>
        </div>

        <div style={{marginTop: 18, display:"flex", flexDirection:"column", gap: 14}}>
          <Label text="Название">
            <input
              className="rp-input"
              autoFocus
              placeholder="Гостиная"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Label>

          <Label text="Этаж">
            <select
              className="rp-input"
              value={floorId == null ? "" : floorId}
              onChange={(e) => setFloorId(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">Без этажа</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Label>

          <Label text="Цвет">
            <ColorPicker value={color} onChange={setColor} />
          </Label>

          <Label text="Иконка">
            <IconPicker
              value={icon}
              color={color}
              onChange={(key, presetName, presetColor) => {
                setIcon(key);
                if (!name && presetName) setName(presetName);
                if (presetColor && color === "#22E5FF") setColor(presetColor);
              }}
            />
          </Label>
        </div>

        <div style={{display:"flex", gap: 8, marginTop: 20, justifyContent: "flex-end"}}>
          {initial && (
            <button className="btn" style={{color: "var(--danger)"}} onClick={del} disabled={busy}>
              Удалить
            </button>
          )}
          <button className="btn primary" disabled={busy || !name} onClick={save}>
            {busy ? "Сохраняю…" : (initial ? "Сохранить" : "Создать")}
          </button>
        </div>

        <style>{`
          .rp-input {
            width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--hairline);
            color: var(--text-1); border-radius: 10px; padding: 9px 11px;
            font-size: 13px; font-family: inherit; outline: none;
          }
          .rp-input:focus { border-color: rgba(34,229,255,0.5); box-shadow: 0 0 0 3px rgba(34,229,255,0.12); }
          .lp-input { background: rgba(0,0,0,0.4); border: 1px solid var(--hairline);
                       color: var(--text-1); border-radius: 10px; padding: 9px 11px;
                       font-size: 13px; font-family: inherit; outline: none; width: 100%; }
        `}</style>
      </div>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)",
        letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
      }}>{text}</div>
      {children}
    </div>
  );
}
