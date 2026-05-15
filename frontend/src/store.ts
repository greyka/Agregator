import { create } from "zustand";
import { api, Device, Floor, Integration, Room, Status } from "./api";

type State = {
  devices: Device[];
  integrations: Integration[];
  floors: Floor[];
  rooms: Room[];
  status: Status | null;
  wsConnected: boolean;
  refresh: () => Promise<void>;
  refreshIntegrations: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  connectWs: () => void;
  applyStatePatch: (deviceId: number, friendly: string, state: Record<string, any>) => void;
};

export const useStore = create<State>((set, get) => ({
  devices: [],
  integrations: [],
  floors: [],
  rooms: [],
  status: null,
  wsConnected: false,

  refresh: async () => {
    const [devices, status, integrations, floors, rooms] = await Promise.all([
      api.devices(), api.status(), api.integrations(), api.floors(), api.rooms(),
    ]);
    set({ devices, status, integrations, floors, rooms });
  },

  refreshIntegrations: async () => {
    const integrations = await api.integrations();
    set({ integrations });
  },

  refreshRooms: async () => {
    const [floors, rooms] = await Promise.all([api.floors(), api.rooms()]);
    set({ floors, rooms });
  },

  applyStatePatch: (deviceId, friendly, state) => {
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === deviceId || d.friendly_name === friendly
          ? { ...d, state: { ...d.state, ...state } }
          : d
      ),
    }));
  },

  connectWs: () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => set({ wsConnected: true });
    ws.onclose = () => {
      set({ wsConnected: false });
      setTimeout(() => get().connectWs(), 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "device.state") {
          get().applyStatePatch(msg.device.id, msg.device.friendly_name, msg.device.state);
        } else if (msg.type === "devices.refresh") {
          get().refresh();
        } else if (msg.type === "integration.status") {
          get().refreshIntegrations();
        } else if (msg.type === "floors.refresh" || msg.type === "rooms.refresh") {
          get().refreshRooms();
        }
      } catch {}
    };
  },
}));
