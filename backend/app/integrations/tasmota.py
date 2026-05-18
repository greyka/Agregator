"""Tasmota (Wi-Fi) — open-source firmware for Sonoff/generic ESP devices via MQTT.

Topics (default Tasmota layout):
  tele/<topic>/LWT       — online/offline
  tele/<topic>/STATE     — periodic state JSON
  stat/<topic>/RESULT    — command result
  cmnd/<topic>/Power     — set power ON/OFF/TOGGLE
  cmnd/<topic>/Dimmer    — set dimmer 0..100
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiomqtt

from ..models import Device
from ..discovery.matchers import ZeroconfMatcher, DhcpMatcher
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.tasmota")


@register
class TasmotaIntegration(BaseIntegration):
    kind = "tasmota"
    label = "Tasmota (Wi-Fi)"
    description = "Sonoff / ESP-устройства с прошивкой Tasmota через MQTT"
    icon = "📶"
    zeroconf_matchers = [
        ZeroconfMatcher(type="_http._tcp.local.", name="tasmota"),
    ]
    dhcp_matchers = [
        DhcpMatcher(hostname="tasmota*"),
    ]
    config_schema = [
        ConfigField("host", "MQTT-хост", "host", required=True, default="mosquitto"),
        ConfigField("port", "Порт", "int", default=1883),
        ConfigField("username", "Логин", "string"),
        ConfigField("password", "Пароль", "password", secret=True),
        ConfigField("prefix_tele", "Префикс tele", "string", default="tele"),
        ConfigField("prefix_stat", "Префикс stat", "string", default="stat"),
        ConfigField("prefix_cmnd", "Префикс cmnd", "string", default="cmnd"),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._client: aiomqtt.Client | None = None

    async def run(self) -> None:
        tele = self.config.get("prefix_tele", "tele")
        stat = self.config.get("prefix_stat", "stat")
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
                    log.info("Tasmota MQTT connected to %s:%s", host, port)
                    await client.subscribe(f"{tele}/+/LWT")
                    await client.subscribe(f"{tele}/+/STATE")
                    await client.subscribe(f"{tele}/+/SENSOR")
                    await client.subscribe(f"{stat}/+/RESULT")
                    async for msg in client.messages:
                        await self._on_message(msg, tele, stat)
            except aiomqtt.MqttError as e:
                await self._set_status("reconnecting", str(e))
                await asyncio.sleep(3)

    async def _on_message(self, msg: aiomqtt.Message, tele: str, stat: str) -> None:
        parts = str(msg.topic).split("/")
        if len(parts) < 3:
            return
        prefix, topic_name, kind = parts[0], parts[1], parts[2]
        raw = msg.payload.decode(errors="replace")

        if prefix == tele and kind == "LWT":
            online = raw.strip().lower() == "online"
            if online:
                await self.upsert_device(
                    external_id=topic_name,
                    friendly_name=topic_name,
                    type="switch",
                    vendor="Tasmota",
                )
            await self.push_state(topic_name, {"online": online})
            return

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return

        if "POWER" in payload:
            await self.upsert_device(
                external_id=topic_name, friendly_name=topic_name,
                type="light" if "Dimmer" in payload else "switch",
                vendor="Tasmota",
            )
            await self.push_state(topic_name, {"state": payload["POWER"]})

        if "Dimmer" in payload:
            await self.push_state(topic_name, {
                "brightness": int(int(payload["Dimmer"]) * 254 / 100)
            })

        # Sensor data (DS18B20, BME280, etc.)
        for sensor_key, data in payload.items():
            if isinstance(data, dict):
                state_patch = {}
                if "Temperature" in data:
                    state_patch["temperature"] = data["Temperature"]
                if "Humidity" in data:
                    state_patch["humidity"] = data["Humidity"]
                if state_patch:
                    await self.upsert_device(
                        external_id=topic_name, friendly_name=topic_name,
                        type="sensor", vendor="Tasmota",
                    )
                    await self.push_state(topic_name, state_patch)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        if not self._client:
            raise RuntimeError("Tasmota MQTT not connected")
        cmnd = self.config.get("prefix_cmnd", "cmnd")
        topic_name = device.external_id
        if "state" in command:
            await self._client.publish(f"{cmnd}/{topic_name}/Power", str(command["state"]))
        if "brightness" in command:
            pct = max(0, min(100, int(int(command["brightness"]) * 100 / 254)))
            await self._client.publish(f"{cmnd}/{topic_name}/Dimmer", str(pct))
