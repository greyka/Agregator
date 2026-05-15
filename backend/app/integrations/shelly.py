"""Shelly Wi-Fi devices (Gen1/Gen2) via MQTT.

Gen1: shellies/<id>/relay/0    payload: on/off
      shellies/<id>/relay/0/command  on|off|toggle
Gen2: <id>/status/switch:0     JSON with {output: bool}
      <id>/rpc                JSON-RPC requests
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiomqtt

from ..models import Device
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.shelly")


@register
class ShellyIntegration(BaseIntegration):
    kind = "shelly"
    label = "Shelly (Wi-Fi)"
    description = "Shelly Plug/Plus/Pro и другие Wi-Fi устройства Allterco через MQTT"
    icon = "💡"
    config_schema = [
        ConfigField("host", "MQTT-хост", "host", required=True, default="mosquitto"),
        ConfigField("port", "Порт", "int", default=1883),
        ConfigField("username", "Логин", "string"),
        ConfigField("password", "Пароль", "password", secret=True),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._client: aiomqtt.Client | None = None

    async def run(self) -> None:
        host = self.config.get("host", "mosquitto")
        port = int(self.config.get("port", 1883))
        while not self._stop.is_set():
            try:
                async with aiomqtt.Client(
                    hostname=host, port=port,
                    username=self.config.get("username") or None,
                    password=self.config.get("password") or None,
                ) as client:
                    self._client = client
                    await self._set_status("online")
                    log.info("Shelly MQTT connected to %s:%s", host, port)
                    await client.subscribe("shellies/#")
                    await client.subscribe("+/status/+")
                    async for msg in client.messages:
                        await self._on_message(msg)
            except aiomqtt.MqttError as e:
                await self._set_status("reconnecting", str(e))
                await asyncio.sleep(3)

    async def _on_message(self, msg: aiomqtt.Message) -> None:
        topic = str(msg.topic)
        raw = msg.payload.decode(errors="replace")

        # Gen1: shellies/<id>/relay/<ch>
        if topic.startswith("shellies/"):
            parts = topic.split("/")
            if len(parts) >= 4 and parts[2] == "relay" and len(parts) == 4:
                shelly_id = parts[1]
                state = "ON" if raw.lower() == "on" else "OFF"
                await self.upsert_device(
                    external_id=shelly_id, friendly_name=shelly_id,
                    type="switch", vendor="Shelly",
                )
                await self.push_state(shelly_id, {"state": state, "_gen": 1})
                return
            if len(parts) >= 4 and parts[2] == "light":
                shelly_id = parts[1]
                try:
                    payload = json.loads(raw)
                    state = "ON" if payload.get("ison") else "OFF"
                    patch = {"state": state, "_gen": 1}
                    if "brightness" in payload:
                        patch["brightness"] = int(int(payload["brightness"]) * 254 / 100)
                    await self.upsert_device(
                        external_id=shelly_id, friendly_name=shelly_id,
                        type="light", vendor="Shelly",
                    )
                    await self.push_state(shelly_id, patch)
                except json.JSONDecodeError:
                    pass
                return

        # Gen2: <id>/status/switch:0  with JSON {"output": true, ...}
        parts = topic.split("/")
        if len(parts) == 3 and parts[1] == "status" and parts[2].startswith("switch:"):
            shelly_id = parts[0]
            try:
                payload = json.loads(raw)
                state = "ON" if payload.get("output") else "OFF"
                await self.upsert_device(
                    external_id=shelly_id, friendly_name=shelly_id,
                    type="switch", vendor="Shelly",
                )
                await self.push_state(shelly_id, {"state": state, "_gen": 2})
            except json.JSONDecodeError:
                pass

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        if not self._client:
            raise RuntimeError("Shelly MQTT not connected")
        gen = (device.state or {}).get("_gen", 1)
        shelly_id = device.external_id
        if gen == 1:
            if "state" in command:
                v = "on" if str(command["state"]).upper() == "ON" else "off"
                await self._client.publish(f"shellies/{shelly_id}/relay/0/command", v)
        else:
            if "state" in command:
                rpc = {
                    "id": 1, "src": "agregator", "method": "Switch.Set",
                    "params": {"id": 0, "on": str(command["state"]).upper() == "ON"},
                }
                await self._client.publish(f"{shelly_id}/rpc", json.dumps(rpc))
