import { useEffect, useMemo, useState } from "react";
import "./design/styles.css";
import { Sidebar, Topbar, Route } from "./design/shell";
import { WeatherHero, RoomsGrid, DeviceTilesV2, DeviceTile, LightingCard } from "./design/widgets";
import { DeviceModal, NotificationCenter, CommandPalette } from "./design/overlays";
import { IntegrationsScreen } from "./design/integrations";
import { RoomsScreen } from "./design/rooms";
import { backendToUI, UIDevice } from "./design/mock";
import { useStore } from "./store";
import { api, Device } from "./api";

export function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  const [openDevice, setOpenDevice] = useState<UIDevice | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const { devices: backendDevices, status, integrations, rooms, refresh, connectWs } = useStore();

  useEffect(() => {
    refresh().catch(console.error);
    connectWs();
    const t = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(c => !c);
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const uiDevices: UIDevice[] = useMemo(
    () => backendDevices.map((d) => backendToUI(d, rooms)),
    [backendDevices, rooms]
  );

  const findBackend = (id: string): Device | undefined =>
    backendDevices.find((d) => String(d.id) === id);

  const toggleDevice = async (d: UIDevice) => {
    const backend = findBackend(d.id);
    if (!backend) return;
    const next = d.on ? "OFF" : "ON";
    try { await api.command(backend.id, { state: next }); } catch (e) { console.error(e); }
  };

  const setBrightness = async (d: UIDevice, value0to254: number) => {
    const backend = findBackend(d.id);
    if (!backend) return;
    try { await api.command(backend.id, { brightness: value0to254, state: "ON" }); }
    catch (e) { console.error(e); }
  };

  const integrationsActive = status?.integrations_active ?? 0;
  const integrationsOnline = status?.integrations_online ?? 0;
  const alertsCount = 0;

  return (
    <>
      <div className="ambient" />
      <div className="noise" />
      <div className="app">
        <Sidebar
          active={route}
          onNav={setRoute}
          deviceCount={uiDevices.length}
          integrationsActive={integrationsActive}
          integrationsOnline={integrationsOnline}
          roomCount={rooms.length}
        />
        <main className="main">
          <Topbar
            active={route}
            onAlerts={() => setAlertsOpen(o => !o)}
            alertsCount={alertsCount}
            onCommand={() => setCmdOpen(true)}
            deviceCount={uiDevices.length}
            onAddDevice={() => setRoute("integrations")}
          />
          <div className="content">
            {route === "dashboard" && (
              <Dashboard
                devices={uiDevices}
                onOpen={setOpenDevice}
                onToggle={toggleDevice}
                onOpenRooms={() => setRoute("rooms")}
              />
            )}
            {route === "devices" && (
              <AllDevices devices={uiDevices} onOpen={setOpenDevice} onToggle={toggleDevice} />
            )}
            {route === "integrations" && <IntegrationsScreen />}
            {route === "rooms" && <RoomsScreen />}
            {route !== "dashboard" && route !== "devices" && route !== "integrations" && route !== "rooms" && (
              <Placeholder route={route} />
            )}
          </div>
        </main>
      </div>

      <DeviceModal
        device={openDevice}
        onClose={() => setOpenDevice(null)}
        onToggle={toggleDevice}
        onBrightness={setBrightness}
      />
      <NotificationCenter open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onNav={setRoute} />
    </>
  );
}

function Dashboard({
  devices, onOpen, onToggle, onOpenRooms,
}: {
  devices: UIDevice[];
  onOpen: (d: UIDevice) => void;
  onToggle: (d: UIDevice) => void;
  onOpenRooms: () => void;
}) {
  return (
    <>
      <div className="col-12"><WeatherHero /></div>

      <div className="col-7"><RoomsGrid onOpenRooms={onOpenRooms} /></div>
      <div className="col-5"><LightingCard /></div>

      <div className="col-12">
        <DeviceTilesV2 devices={devices} onOpen={onOpen} onToggle={onToggle} />
      </div>
    </>
  );
}

function AllDevices({ devices, onOpen, onToggle }: {
  devices: UIDevice[];
  onOpen: (d: UIDevice) => void;
  onToggle: (d: UIDevice) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<string, UIDevice[]> = {};
    for (const d of devices) {
      (m[d.room] ||= []).push(d);
    }
    return m;
  }, [devices]);

  return (
    <div className="col-12" style={{display:"flex", flexDirection:"column", gap: 14}}>
      {Object.entries(grouped).map(([room, list]) => (
        <div key={room} className="card">
          <div className="card-h">
            <div className="card-title">{room}</div>
            <div className="card-tools"><span className="chip">{list.length} DEVICES</span></div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 12}}>
            {list.map(d => (
              <DeviceTile key={d.id} d={d} onOpen={onOpen} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <div className="card"><div className="placeholder">No devices yet. Add an integration on the Integrations page.</div></div>
      )}
    </div>
  );
}

function Placeholder({ route }: { route: Route }) {
  return (
    <div className="col-12">
      <div className="card" style={{padding: 60, textAlign:"center"}}>
        <div style={{fontSize: 24, fontWeight: 600, letterSpacing:"-0.02em"}}>{route}</div>
        <div style={{fontSize: 13, color: "var(--text-3)", marginTop: 8, fontFamily: "var(--font-mono)", letterSpacing: "0.08em"}}>COMING SOON</div>
      </div>
    </div>
  );
}
