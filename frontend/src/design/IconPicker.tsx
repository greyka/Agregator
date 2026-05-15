import { useState } from "react";
import { Icons } from "./icons";
import { RoomIcon } from "./RoomIcon";
import { ROOM_PRESETS, CATEGORY_LABEL_RU, RoomIconCategory } from "./roomIcons";

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (key: string, presetName?: string, presetColor?: string) => void;
  color?: string;
}) {
  const [filter, setFilter] = useState<RoomIconCategory | "all">("all");
  const [q, setQ] = useState("");

  const filtered = ROOM_PRESETS.filter(p => {
    if (filter !== "all" && p.category !== filter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return p.ru.toLowerCase().includes(s)
        || p.en.toLowerCase().includes(s)
        || p.key.toLowerCase().includes(s);
  });

  const categories: ("all" | RoomIconCategory)[] = ["all", "living", "sleeping", "bath", "storage", "outside", "activity"];

  return (
    <div style={{display:"flex", flexDirection:"column", gap: 10}}>
      <div style={{display:"flex", gap: 6, flexWrap:"wrap"}}>
        {categories.map((c) => (
          <span
            key={c}
            className={`pill ${filter === c ? "active" : ""}`}
            onClick={() => setFilter(c)}
            style={{cursor: "pointer"}}
          >
            {c === "all" ? "Все" : CATEGORY_LABEL_RU[c as RoomIconCategory]}
          </span>
        ))}
      </div>
      <input
        className="lp-input"
        placeholder="Поиск по названию…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          background: "rgba(0,0,0,0.4)", border: "1px solid var(--hairline)",
          color: "var(--text-1)", borderRadius: 10, padding: "9px 11px",
          fontSize: 13, fontFamily: "inherit", outline: "none",
        }}
      />
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6,
        maxHeight: 320, overflowY: "auto", padding: 2,
      }}>
        {filtered.map((p) => {
          const active = p.key === value;
          return (
            <div
              key={p.key}
              onClick={() => onChange(p.key, p.ru, p.defaultColor)}
              title={p.ru}
              style={{
                aspectRatio: "1",
                borderRadius: 12,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2, cursor: "pointer",
                background: active ? "rgba(34,229,255,0.15)" : "var(--glass)",
                border: `1px solid ${active ? "rgba(34,229,255,0.5)" : "var(--hairline)"}`,
                color: active ? "var(--accent)" : "var(--text-2)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => !active && (e.currentTarget.style.borderColor = "var(--hairline-strong)")}
              onMouseLeave={(e) => !active && (e.currentTarget.style.borderColor = "var(--hairline)")}
            >
              <RoomIcon name={p.key} size={20} color={color && active ? color : undefined} />
              <span style={{
                fontSize: 8.5, lineHeight: 1, letterSpacing: "0.04em",
                fontFamily: "var(--font-mono)", color: "var(--text-3)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "95%",
              }}>{p.ru}</span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{gridColumn: "1 / -1", padding: 16, textAlign: "center", color: "var(--text-3)", fontSize: 12}}>
            Ничего не найдено
          </div>
        )}
      </div>
    </div>
  );
}

const COLORS = [
  "#22E5FF", "#9D7BFF", "#FF6BD6", "#56F1A6",
  "#FFB547", "#FF5C7A", "#6BD3FF", "#E8ECF4",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
      {COLORS.map((c) => (
        <div
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: c, cursor: "pointer",
            boxShadow: value === c ? `0 0 0 2px var(--bg-1), 0 0 0 4px ${c}` : "none",
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        />
      ))}
    </div>
  );
}
