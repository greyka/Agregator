export type Device = {
  id: number;
  integration: string;
  external_id: string;
  friendly_name: string;
  type: string;
  vendor: string | null;
  model: string | null;
  room: string | null;
  room_id: number | null;
  state: Record<string, any>;
  last_seen: string | null;
};

export type Floor = {
  id: number;
  name: string;
  level: number;
  position: number;
};

export type Room = {
  id: number;
  name: string;
  icon: string;
  color: string;
  floor_id: number | null;
  position: number;
  device_count: number;
};

export type Status = {
  devices: number;
  integrations_active: number;
  integrations_online: number;
};

export type IntegrationField = {
  key: string;
  label: string;
  type: "string" | "int" | "bool" | "password" | "host";
  required: boolean;
  default: any;
  secret: boolean;
  help: string | null;
};

export type IntegrationKind = {
  kind: string;
  label: string;
  description: string;
  icon: string;
  config_schema: IntegrationField[];
};

export type Integration = {
  id: number;
  kind: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  status: string;
  last_error: string | null;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  status: () => req<Status>("/api/status"),
  devices: () => req<Device[]>("/api/devices"),
  patchDevice: (id: number, patch: Partial<Pick<Device, "friendly_name" | "room" | "room_id">>) =>
    req<Device>(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  command: (id: number, cmd: Record<string, any>) =>
    req<Device>(`/api/devices/${id}/command`, { method: "POST", body: JSON.stringify(cmd) }),

  integrationKinds: () => req<IntegrationKind[]>("/api/integrations/kinds"),
  integrations: () => req<Integration[]>("/api/integrations"),
  createIntegration: (body: { kind: string; name: string; enabled?: boolean; config: Record<string, any> }) =>
    req<Integration>("/api/integrations", { method: "POST", body: JSON.stringify(body) }),
  updateIntegration: (id: number, body: Partial<Pick<Integration, "name" | "enabled" | "config">>) =>
    req<Integration>(`/api/integrations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteIntegration: (id: number) =>
    req<void>(`/api/integrations/${id}`, { method: "DELETE" }),
  restartIntegration: (id: number) =>
    req<Integration>(`/api/integrations/${id}/restart`, { method: "POST" }),

  floors: () => req<Floor[]>("/api/floors"),
  createFloor: (body: { name: string; level?: number; position?: number }) =>
    req<Floor>("/api/floors", { method: "POST", body: JSON.stringify(body) }),
  updateFloor: (id: number, body: Partial<Floor>) =>
    req<Floor>(`/api/floors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFloor: (id: number) => req<void>(`/api/floors/${id}`, { method: "DELETE" }),

  discover: () => req<{
    subnet: string;
    count: number;
    candidates: Array<{
      ip: string;
      open_ports: number[];
      vendor: string | null;
      model: string | null;
      integration_kind: string | null;
      hint: string | null;
      mac: string | null;
      extra: any | null;
    }>;
  }>("/api/discover", { method: "POST" }),

  rooms: () => req<Room[]>("/api/rooms"),
  createRoom: (body: { name: string; icon?: string; color?: string; floor_id?: number | null; position?: number }) =>
    req<Room>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  updateRoom: (id: number, body: Partial<Room>) =>
    req<Room>(`/api/rooms/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRoom: (id: number) => req<void>(`/api/rooms/${id}`, { method: "DELETE" }),
};
