import { create } from "zustand";
import { api, Device, Integration, Status } from "./api";

type State = {
  devices: Device[];
  integrations: Integration[];
  status: Status | null;
  wsConnected: boolean;
  refresh: () => Promise<void>;
  refreshIntegrations: () => Promise<void>;
  connectWs: () => void;
  applyStatePatch: (deviceId: number, friendly: string, state: Record<string, any>) => void;
};

export const useStore = create<State>((set, get) => ({
  devices: [],
  integrations: [],
  status: null,
  wsConnected: false,

  refresh: async () => {
    const [devices, status, integrations] = await Promise.all([
      api.devices(), api.status(), api.integrations(),
    ]);
    set({ devices, status, integrations });
  },

  refreshIntegrations: async () => {
    const integrations = await api.integrations();
    set({ integrations });
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
        }
      } catch {}
    };
  },
}));
