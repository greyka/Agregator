"""Zigbee via zigbee2mqtt bridge (MQTT)."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiomqtt

from ..models import Device
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.zigbee2mqtt")


@register
class Zigbee2MqttIntegration(BaseIntegration):
    kind = "zigbee2mqtt"
    label = "Zigbee (zigbee2mqtt)"
    description = "Zigbee-устройства через мост zigbee2mqtt + MQTT-брокер"
    icon = "📡"
    config_schema = [
        ConfigField("host", "MQTT-хост", "host", required=True, default="mosquitto"),
        ConfigField("port", "Порт", "int", required=True, default=1883),
        ConfigField("base_topic", "Базовый топик", "string", default="zigbee2mqtt"),
        ConfigField("username", "Логин", "string"),
        ConfigField("password", "Пароль", "password", secret=True),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._client: aiomqtt.Client | None = None

    async def run(self) -> None:
        base = self.config.get("base_topic") or "zigbee2mqtt"
        host = self.config.get("host", "mosquitto")
        port = int(self.config.get("port", 1883))
        username = self.config.get("username") or None
        password = self.config.get("password") or None

        while not self._stop.is_set():
            try:
                async with aiomqtt.Client(
                    hostname=host, port=port,
                    username=username, password=password,
                ) as client:
                    self._client = client
                    await self._set_status("online")
                    log.info("MQTT[%s] connected to %s:%s", self.kind, host, port)
                    await client.subscribe(f"{base}/bridge/devices")
                    await client.subscribe(f"{base}/bridge/state")
                    await client.subscribe(f"{base}/+")
                    async for msg in client.messages:
                        await self._on_message(base, msg)
            except aiomqtt.MqttError as e:
                await self._set_status("reconnecting", str(e))
                log.warning("MQTT[%s] error: %s", self.kind, e)
                await asyncio.sleep(3)

    async def _on_message(self, base: str, msg: aiomqtt.Message) -> None:
        topic = str(msg.topic)
        try:
            payload = json.loads(msg.payload.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            return

        if topic == f"{base}/bridge/devices":
            for item in payload:
                ieee = item.get("ieee_address")
                if not ieee:
                    continue
                definition = item.get("definition") or {}
                await self.upsert_device(
                    external_id=ieee,
                    friendly_name=item.get("friendly_name") or ieee,
                    type=_guess_type(definition),
                    vendor=definition.get("vendor"),
                    model=definition.get("model"),
                )
        elif topic.startswith(f"{base}/") and "/" not in topic[len(base) + 1:]:
            friendly = topic[len(base) + 1:]
            if friendly.startswith("bridge"):
                return
            # external_id is ieee_address; look up by friendly_name to find it
            from sqlalchemy import select
            from ..db import SessionLocal as _SL
            async with _SL() as session:
                stmt = select(Device).where(
                    Device.integration == self.kind,
                    Device.friendly_name == friendly,
                )
                d = (await session.execute(stmt)).scalar_one_or_none()
            if d:
                await self.push_state(d.external_id, payload)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        if not self._client:
            raise RuntimeError("zigbee2mqtt not connected")
        base = self.config.get("base_topic") or "zigbee2mqtt"
        await self._client.publish(f"{base}/{device.friendly_name}/set", json.dumps(command))


def _guess_type(definition: dict[str, Any]) -> str:
    desc = (definition.get("description") or "").lower()
    model = (definition.get("model") or "").lower()
    if "bulb" in desc or "light" in desc or "led" in model:
        return "light"
    if "switch" in desc or "button" in desc or "relay" in desc:
        return "switch"
    if "sensor" in desc or "motion" in desc or "occupancy" in desc or "temp" in desc:
        return "sensor"
    return "unknown"
