import { CSSProperties, createElement, FC } from "react";

type IconProps = { className?: string; style?: CSSProperties };
type PathSpec = string | { t: string; p: Record<string, any> };

const I = (paths: PathSpec[], vb = "0 0 24 24"): FC<IconProps> =>
  ({ className = "ico", style }) =>
    createElement(
      "svg",
      {
        className, style, viewBox: vb,
        fill: "none", stroke: "currentColor", strokeWidth: 1.6,
        strokeLinecap: "round", strokeLinejoin: "round",
      },
      paths.map((d, i) =>
        typeof d === "string"
          ? createElement("path", { d, key: i })
          : createElement(d.t as any, { ...d.p, key: i })
      )
    );

export const Icons: Record<string, FC<IconProps>> = {
  Dashboard: I(["M3 3h7v9H3z","M14 3h7v5h-7z","M14 12h7v9h-7z","M3 16h7v5H3z"]),
  Rooms: I(["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"]),
  Devices: I(["M4 4h12v10H4z","M16 8h4v8h-4z","M8 18v2","M12 18v2","M16 20h-8"]),
  Automations: I([
    "M12 2v4","M12 18v4","M4.93 4.93l2.83 2.83","M16.24 16.24l2.83 2.83","M2 12h4","M18 12h4","M4.93 19.07l2.83-2.83","M16.24 7.76l2.83-2.83",
    { t: "circle", p: { cx: 12, cy: 12, r: 3.2 } }
  ]),
  Scenes: I([
    { t: "circle", p: { cx: 12, cy: 12, r: 4 } },
    "M12 2v3","M12 19v3","M2 12h3","M19 12h3","M4.9 4.9l2 2","M17.1 17.1l2 2","M4.9 19.1l2-2","M17.1 6.9l2-2"
  ]),
  Energy: I(["M13 2L4 14h7l-1 8 9-12h-7z"]),
  Cameras: I(["M2 8h12l3-3v14l-3-3H2z","M19 10v4", { t: "circle", p: { cx: 8, cy: 12, r: 2.5 } }]),
  AI: I([
    "M12 2a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4 4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z",
    "M4 14a8 8 0 0 0 16 0","M9 22h6","M12 18v4"
  ]),
  Analytics: I(["M4 20V10","M10 20V4","M16 20v-7","M22 20H2"]),
  Integrations: I([
    { t: "rect", p: { x: 3, y: 3, width: 7, height: 7, rx: 1 } },
    { t: "rect", p: { x: 14, y: 3, width: 7, height: 7, rx: 1 } },
    { t: "rect", p: { x: 3, y: 14, width: 7, height: 7, rx: 1 } },
    "M14 17.5h7","M17.5 14v7"
  ]),
  Settings: I([
    { t: "circle", p: { cx: 12, cy: 12, r: 3 } },
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
  ]),
  Search: I([{ t: "circle", p: { cx: 11, cy: 11, r: 7 } }, "M21 21l-4.3-4.3"]),
  Bell: I(["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9","M10 21a2 2 0 0 0 4 0"]),
  Sun: I([{ t: "circle", p: { cx: 12, cy: 12, r: 4 } }, "M12 2v2","M12 20v2","M4.9 4.9l1.4 1.4","M17.7 17.7l1.4 1.4","M2 12h2","M20 12h2","M4.9 19.1l1.4-1.4","M17.7 6.3l1.4-1.4"]),
  Moon: I(["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"]),
  Cloud: I(["M17.5 19a4.5 4.5 0 1 0-.6-9 6 6 0 1 0-11.4 2.6A4 4 0 0 0 7 19z"]),
  Bolt: I(["M13 2L4 14h7l-1 8 9-12h-7z"]),
  Wifi: I(["M5 12.5a10 10 0 0 1 14 0","M8.5 16a5 5 0 0 1 7 0",{t:"circle",p:{cx:12,cy:19.5,r:1}}]),
  Lock: I([{t:"rect",p:{x:5,y:11,width:14,height:10,rx:2}},"M8 11V7a4 4 0 0 1 8 0v4"]),
  Shield: I(["M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"]),
  Plus: I(["M12 5v14","M5 12h14"]),
  Send: I(["M22 2L11 13","M22 2l-7 20-4-9-9-4z"]),
  Sparkles: I([
    "M12 3v3","M12 18v3","M3 12h3","M18 12h3","M5.6 5.6l2.1 2.1","M16.3 16.3l2.1 2.1","M5.6 18.4l2.1-2.1","M16.3 7.7l2.1-2.1",
    {t:"circle",p:{cx:12,cy:12,r:3}}
  ]),
  Mic: I([{t:"rect",p:{x:9,y:2,width:6,height:12,rx:3}},"M5 11a7 7 0 0 0 14 0","M12 18v3","M8 21h8"]),
  Mood: I([{t:"circle",p:{cx:12,cy:12,r:9}},"M9 15c1 1.3 5 1.3 6 0","M9 10h.01","M15 10h.01"]),
  Thermometer: I(["M14 14V4a2 2 0 0 0-4 0v10a4 4 0 1 0 4 0z"]),
  Droplet: I(["M12 2.5l6 8.5a6 6 0 1 1-12 0z"]),
  User: I([{t:"circle",p:{cx:12,cy:8,r:4}},"M4 21a8 8 0 0 1 16 0"]),
  Users: I([{t:"circle",p:{cx:9,cy:8,r:3.5}},"M2 21a7 7 0 0 1 14 0",{t:"circle",p:{cx:17,cy:9,r:3}},"M22 20a5 5 0 0 0-7-4.6"]),
  Eye: I(["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",{t:"circle",p:{cx:12,cy:12,r:3}}]),
  Camera: I(["M3 7h4l1.5-2h7L17 7h4v12H3z", {t:"circle",p:{cx:12,cy:13,r:3.5}}]),
  Power: I(["M12 3v10","M6.4 6.4a8 8 0 1 0 11.2 0"]),
  Tv: I([{t:"rect",p:{x:3,y:5,width:18,height:13,rx:2}},"M8 21h8","M12 18v3"]),
  Speaker: I([{t:"rect",p:{x:6,y:3,width:12,height:18,rx:2}},{t:"circle",p:{cx:12,cy:15,r:2.5}},{t:"circle",p:{cx:12,cy:8,r:0.8}}]),
  Coffee: I(["M3 8h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z","M17 9h2a2 2 0 0 1 0 4h-2","M7 2v3","M11 2v3","M15 2v3"]),
  Fan: I([{t:"circle",p:{cx:12,cy:12,r:1.5}},"M12 4a4 4 0 0 1 4 4c0 2-4 4-4 4","M20 12a4 4 0 0 1-4 4c-2 0-4-4-4-4","M12 20a4 4 0 0 1-4-4c0-2 4-4 4-4","M4 12a4 4 0 0 1 4-4c2 0 4 4 4 4"]),
  Lamp: I(["M9 2h6l2 6H7z","M12 8v8","M9 16h6v4H9z"]),
  Outlet: I([{t:"rect",p:{x:3,y:3,width:18,height:18,rx:3}},{t:"circle",p:{cx:9,cy:10,r:1}},{t:"circle",p:{cx:15,cy:10,r:1}},"M8 16h8"]),
  Door: I(["M5 21V4a1 1 0 0 1 1-1h12v18","M14 13v.01","M5 21h17"]),
  Window: I([{t:"rect",p:{x:4,y:4,width:16,height:16,rx:1}},"M12 4v16","M4 12h16"]),
  Lightbulb: I(["M9 18h6","M10 22h4","M12 2a6 6 0 0 0-3.5 11l1 1.5h5l1-1.5A6 6 0 0 0 12 2z"]),
  Activity: I(["M2 12h4l3-9 6 18 3-9h4"]),
  Cpu: I([{t:"rect",p:{x:5,y:5,width:14,height:14,rx:2}},{t:"rect",p:{x:9,y:9,width:6,height:6,rx:1}},"M9 1v3","M15 1v3","M9 20v3","M15 20v3","M1 9h3","M1 15h3","M20 9h3","M20 15h3"]),
  Drive: I([{t:"rect",p:{x:3,y:14,width:18,height:7,rx:2}},"M5 14l3-9h8l3 9",{t:"circle",p:{cx:7,cy:17.5,r:0.8}},{t:"circle",p:{cx:10,cy:17.5,r:0.8}}]),
  Chevron: I(["M9 6l6 6-6 6"]),
  X: I(["M5 5l14 14","M19 5L5 19"]),
  Maximize: I(["M3 9V3h6","M21 9V3h-6","M21 15v6h-6","M3 15v6h6"]),
  Refresh: I(["M3 12a9 9 0 0 1 15-6.7L21 8","M21 3v5h-5","M21 12a9 9 0 0 1-15 6.7L3 16","M3 21v-5h5"]),
  Filter: I(["M3 4h18l-7 9v6l-4 2v-8z"]),
  Play: I(["M6 4l14 8-14 8z"]),
  Pause: I([{t:"rect",p:{x:7,y:4,width:3,height:16}},{t:"rect",p:{x:14,y:4,width:3,height:16}}]),
  ArrowRight: I(["M5 12h14","M13 5l7 7-7 7"]),
  Wind: I(["M3 9h13a3 3 0 1 0-3-3","M3 14h17a3 3 0 1 1-3 3","M3 19h7"]),
  Compass: I([{t:"circle",p:{cx:12,cy:12,r:9}},"M15.5 8.5L13 13l-4.5 2.5L11 11z"]),
  Calendar: I([{t:"rect",p:{x:3,y:5,width:18,height:16,rx:2}},"M8 3v4","M16 3v4","M3 10h18"]),
  Map: I(["M9 3l-6 3v15l6-3 6 3 6-3V3l-6 3z","M9 3v15","M15 6v15"]),
  Globe: I([{t:"circle",p:{cx:12,cy:12,r:9}},"M3 12h18","M12 3a14 14 0 0 1 0 18","M12 3a14 14 0 0 0 0 18"]),
  Clock: I([{t:"circle",p:{cx:12,cy:12,r:9}},"M12 7v5l3 2"]),
  Trash: I(["M3 6h18","M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2","M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14"]),
};
