"""Home Assistant integration — pulls every controllable entity from a running
HA instance via REST + WebSocket and forwards commands back to HA services.

Setup steps for the user (on Home Assistant):
  1. Click profile (bottom left) → scroll to "Long-Lived Access Tokens"
  2. "Create Token" → name it "Agregator" → copy the value (shown once)
  3. In Agregator UI → Integrations → Add → Home Assistant → paste host + token
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiohttp

from ..models import Device
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.home_assistant")

# Domains we surface in our UI. Everything else is filtered out.
SUPPORTED_DOMAINS = {
    "light": "light",
    "switch": "switch",
    "input_boolean": "switch",
    "sensor": "sensor",
    "binary_sensor": "sensor",
    "climate": "climate",
    "cover": "cover",
    "lock": "lock",
    "fan": "fan",
    "media_player": "media_player",
    "vacuum": "vacuum",
    "humidifier": "humidifier",
    "water_heater": "water_heater",
    "alarm_control_panel": "alarm",
    "siren": "siren",
    "remote": "remote",
}

# Domains we explicitly hide (helpers / not real devices)
SKIP_DOMAINS = {
    "automation", "script", "scene", "zone", "sun", "weather",
    "persistent_notification", "tts", "stt", "update", "tag",
    "device_tracker", "person", "group", "input_number", "input_text",
    "input_datetime", "input_select", "input_button", "counter", "timer",
    "schedule", "calendar", "todo", "image_processing", "conversation",
}


@register
class HomeAssistantIntegration(BaseIntegration):
    kind = "home_assistant"
    label = "Home Assistant"
    description = "Импорт устройств и сущностей из работающего Home Assistant через REST + WebSocket"
    icon = "🏠"
    config_schema = [
        ConfigField("host", "Хост (IP или DNS)", "host", required=True, default="192.168.1.100",
                    help="Адрес HA, например 192.168.1.100 (без http://)"),
        ConfigField("port", "Порт", "int", default=8123),
        ConfigField("use_ssl", "HTTPS", "bool", default=False),
        ConfigField("token", "Long-Lived Access Token", "password", required=True, secret=True,
                    help="Создай токен в HA: Профиль → Long-Lived Access Tokens → Create Token"),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._session: aiohttp.ClientSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._cmd_id = 0
        self._last_sensor_push: dict[str, float] = {}

    @property
    def _base_url(self) -> str:
        scheme = "https" if self.config.get("use_ssl") else "http"
        host = self.config.get("host", "localhost")
        port = int(self.config.get("port", 8123))
        return f"{scheme}://{host}:{port}"

    @property
    def _ws_url(self) -> str:
        scheme = "wss" if self.config.get("use_ssl") else "ws"
        host = self.config.get("host", "localhost")
        port = int(self.config.get("port", 8123))
        return f"{scheme}://{host}:{port}/api/websocket"

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.config.get('token', '')}",
                "Content-Type": "application/json"}

    async def run(self) -> None:
        token = self.config.get("token")
        if not token:
            await self._set_status("error", "token required")
            return

        while not self._stop.is_set():
            try:
                async with aiohttp.ClientSession() as session:
                    self._session = session
                    await self._initial_sync()
                    await self._websocket_loop()
            except Exception as e:
                log.warning("HA integration error: %s", e)
                await self._set_status("reconnecting", str(e))
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
            finally:
                self._session = None
                self._ws = None

    async def _initial_sync(self) -> None:
        """One-shot GET /api/states to backfill our device registry."""
        assert self._session
        url = f"{self._base_url}/api/states"
        async with self._session.get(url, headers=self._headers, timeout=aiohttp.ClientTimeout(total=15)) as r:
            r.raise_for_status()
            states = await r.json()

        synced = 0
        for st in states:
            await self._upsert_entity(st)
            synced += 1
        log.info("HA initial sync: %d entities", synced)
        await self._set_status("online")

    async def _websocket_loop(self) -> None:
        """Authenticate + subscribe to state_changed events."""
        assert self._session
        async with self._session.ws_connect(self._ws_url, heartbeat=30) as ws:
            self._ws = ws

            # Auth handshake
            msg = await ws.receive_json()
            if msg.get("type") != "auth_required":
                raise RuntimeError(f"unexpected first frame: {msg}")
            await ws.send_json({"type": "auth", "access_token": self.config.get("token")})
            msg = await ws.receive_json()
            if msg.get("type") != "auth_ok":
                raise RuntimeError(f"auth failed: {msg}")

            # Subscribe
            self._cmd_id += 1
            await ws.send_json({"id": self._cmd_id, "type": "subscribe_events", "event_type": "state_changed"})
            msg = await ws.receive_json()
            if not msg.get("success"):
                raise RuntimeError(f"subscribe failed: {msg}")

            log.info("HA WebSocket subscribed, receiving state_changed events")
            async for raw in ws:
                if raw.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(raw.data)
                    if data.get("type") == "event":
                        ev = data.get("event", {})
                        new_state = ev.get("data", {}).get("new_state")
                        if new_state:
                            await self._on_state_event(new_state)
                elif raw.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break

    async def _upsert_entity(self, st: dict[str, Any]) -> Device | None:
        entity_id: str = st.get("entity_id", "")
        domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
        if not domain or domain in SKIP_DOMAINS or domain not in SUPPORTED_DOMAINS:
            return None
        attrs = st.get("attributes", {}) or {}
        if attrs.get("restored"):
            return None
        friendly = attrs.get("friendly_name") or entity_id
        device_type = SUPPORTED_DOMAINS[domain]
        state = _normalize_state(domain, st)
        return await self.upsert_device(
            external_id=entity_id,
            friendly_name=friendly,
            type=device_type,
            vendor="Home Assistant",
            model=attrs.get("device_class") or domain,
            state=state,
        )

    async def _on_state_event(self, new_state: dict[str, Any]) -> None:
        entity_id: str = new_state.get("entity_id", "")
        domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
        if domain not in SUPPORTED_DOMAINS or domain in SKIP_DOMAINS:
            return

        # Throttle noisy sensors (>2s between writes)
        if domain in ("sensor", "binary_sensor"):
            import time
            last = self._last_sensor_push.get(entity_id, 0.0)
            now = time.monotonic()
            if now - last < 2.0:
                return
            self._last_sensor_push[entity_id] = now

        state = _normalize_state(domain, new_state)
        # Make sure the device exists (newly added entities create state events too)
        await self._upsert_entity(new_state)
        await self.push_state(entity_id, state)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        if not self._session:
            raise RuntimeError("Home Assistant not connected")

        entity_id = device.external_id
        domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
        service, payload = _build_service_call(domain, entity_id, command)
        if not service:
            raise RuntimeError(f"Unsupported command for domain {domain}: {command}")

        url = f"{self._base_url}/api/services/{domain}/{service}"
        async with self._session.post(url, headers=self._headers, json=payload,
                                       timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status >= 400:
                text = await r.text()
                raise RuntimeError(f"HA service {domain}.{service} failed: {r.status} {text}")


def _normalize_state(domain: str, st: dict[str, Any]) -> dict[str, Any]:
    """Translate HA's per-domain state shape into our flat dict."""
    raw_state = st.get("state", "")
    attrs = st.get("attributes", {}) or {}
    out: dict[str, Any] = {}

    if raw_state in ("unavailable", "unknown"):
        out["online"] = False
        return out
    out["online"] = True

    if domain in ("light", "switch", "input_boolean", "fan"):
        out["state"] = "ON" if raw_state == "on" else "OFF"
    if domain == "light":
        if "brightness" in attrs and attrs["brightness"] is not None:
            out["brightness"] = int(attrs["brightness"])
        if "color_temp_kelvin" in attrs:
            out["color_temp_kelvin"] = attrs["color_temp_kelvin"]
        if "rgb_color" in attrs:
            out["rgb_color"] = attrs["rgb_color"]
    elif domain == "fan":
        if "percentage" in attrs:
            out["percentage"] = attrs["percentage"]
    elif domain == "sensor":
        try:
            out["value"] = float(raw_state)
        except (TypeError, ValueError):
            out["value"] = raw_state
        dc = attrs.get("device_class")
        unit = attrs.get("unit_of_measurement")
        if dc == "temperature": out["temperature"] = out.get("value")
        elif dc == "humidity": out["humidity"] = out.get("value")
        elif dc == "battery": out["battery"] = out.get("value")
        elif dc == "illuminance": out["illuminance"] = out.get("value")
        elif dc == "power": out["power"] = out.get("value")
        elif dc == "energy": out["energy"] = out.get("value")
        if unit: out["unit"] = unit
    elif domain == "binary_sensor":
        on = raw_state == "on"
        dc = attrs.get("device_class")
        if dc == "motion" or dc == "occupancy": out["occupancy"] = on
        elif dc == "door" or dc == "window" or dc == "opening": out["opening"] = on
        else: out["state"] = "ON" if on else "OFF"
    elif domain == "climate":
        out["hvac_mode"] = raw_state
        if "current_temperature" in attrs: out["temperature"] = attrs["current_temperature"]
        if "temperature" in attrs: out["setpoint"] = attrs["temperature"]
    elif domain == "cover":
        out["state"] = raw_state  # open / closed / opening / closing
        if "current_position" in attrs: out["position"] = attrs["current_position"]
    elif domain == "lock":
        out["state"] = "ON" if raw_state == "locked" else "OFF"
        out["lock_state"] = raw_state
    elif domain == "media_player":
        out["state"] = raw_state
        if "media_title" in attrs: out["title"] = attrs["media_title"]
        if "volume_level" in attrs: out["volume"] = attrs["volume_level"]
    elif domain == "vacuum":
        out["state"] = raw_state
        if "battery_level" in attrs: out["battery"] = attrs["battery_level"]

    return out


def _build_service_call(domain: str, entity_id: str, cmd: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    """Return (service_name, payload) for a normalized command, or (None, {}) if unsupported."""
    state = str(cmd.get("state", "")).upper() if "state" in cmd else None

    if domain in ("light", "switch", "input_boolean", "fan"):
        if state == "ON":
            payload: dict[str, Any] = {"entity_id": entity_id}
            if domain == "light":
                if "brightness" in cmd:
                    payload["brightness"] = int(cmd["brightness"])
                if "color_temp_kelvin" in cmd:
                    payload["color_temp_kelvin"] = cmd["color_temp_kelvin"]
                if "rgb_color" in cmd:
                    payload["rgb_color"] = cmd["rgb_color"]
            elif domain == "fan" and "percentage" in cmd:
                payload["percentage"] = cmd["percentage"]
            return "turn_on", payload
        if state == "OFF":
            return "turn_off", {"entity_id": entity_id}
        if domain == "light" and ("brightness" in cmd or "rgb_color" in cmd):
            payload = {"entity_id": entity_id}
            if "brightness" in cmd: payload["brightness"] = int(cmd["brightness"])
            if "rgb_color" in cmd: payload["rgb_color"] = cmd["rgb_color"]
            return "turn_on", payload

    if domain == "cover":
        c = str(cmd.get("state", "")).lower()
        if c in ("open", "on"): return "open_cover", {"entity_id": entity_id}
        if c in ("close", "off"): return "close_cover", {"entity_id": entity_id}
        if "position" in cmd:
            return "set_cover_position", {"entity_id": entity_id, "position": int(cmd["position"])}

    if domain == "lock":
        if state == "ON" or str(cmd.get("state", "")).lower() == "lock":
            return "lock", {"entity_id": entity_id}
        if state == "OFF" or str(cmd.get("state", "")).lower() == "unlock":
            return "unlock", {"entity_id": entity_id}

    if domain == "climate":
        payload = {"entity_id": entity_id}
        if "setpoint" in cmd: payload["temperature"] = cmd["setpoint"]
        if "hvac_mode" in cmd: payload["hvac_mode"] = cmd["hvac_mode"]
        if "temperature" in payload or "hvac_mode" in payload:
            return "set_temperature", payload

    if domain == "media_player":
        c = str(cmd.get("state", "")).lower()
        if c in ("play", "playing", "on"): return "media_play", {"entity_id": entity_id}
        if c in ("pause", "paused"): return "media_pause", {"entity_id": entity_id}
        if c in ("stop", "off"): return "media_stop", {"entity_id": entity_id}

    if domain == "vacuum":
        c = str(cmd.get("state", "")).lower()
        if c in ("start", "on", "cleaning"): return "start", {"entity_id": entity_id}
        if c in ("stop",): return "stop", {"entity_id": entity_id}
        if c in ("return", "dock"): return "return_to_base", {"entity_id": entity_id}

    return None, {}
