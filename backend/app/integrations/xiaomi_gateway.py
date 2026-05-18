"""Xiaomi Mi Home / Aqara Gateway via miIO LAN protocol.

Supported: Mi Gateway v1/v2/v3, Aqara Hub (lumi.gateway.*).
To get the token: use Mi Home app or `miiocli cloud` (cloud-stored tokens).
Once paired in developer mode (telnet, see README), the gateway exposes
child Zigbee devices via miIO method `get_device_prop_exp`.

This adapter polls gateway state every N seconds and pushes updates.
Commands are forwarded as miIO method calls.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..models import Device
from ..discovery.matchers import ZeroconfMatcher, DhcpMatcher
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.xiaomi_gateway")

try:
    from miio import Gateway
    from miio.gateway.gateway import GatewayException
    HAS_MIIO = True
except ImportError:
    HAS_MIIO = False


@register
class XiaomiGatewayIntegration(BaseIntegration):
    kind = "xiaomi_gateway"
    label = "Xiaomi / Aqara Gateway"
    description = "Шлюз Xiaomi Mi Home или Aqara Hub по локальному miIO-протоколу"
    icon = "🏯"
    zeroconf_matchers = [
        # Xiaomi / Aqara / Yeelink advertise themselves as lumi-gateway-v* / yeelink-* on _miio._udp
        ZeroconfMatcher(type="_miio._udp.local.", name="lumi"),
        ZeroconfMatcher(type="_miio._udp.local.", name="yeelink"),
    ]
    dhcp_matchers = [
        DhcpMatcher(hostname="lumi-gateway-*"),
        DhcpMatcher(mac_oui="04CF8C"),  # Xiaomi OUI
        DhcpMatcher(mac_oui="78110F"),  # Xiaomi OUI
    ]
    config_schema = [
        ConfigField("host", "IP-адрес шлюза", "host", required=True,
                    help="Локальный IP, например 192.168.1.50"),
        ConfigField("token", "miIO-токен (32 hex)", "password", required=True, secret=True,
                    help="Получи токен через Mi Home app (раздел 'About') или miiocli cloud"),
        ConfigField("name", "Имя шлюза", "string", default="Xiaomi Gateway"),
        ConfigField("poll_interval", "Опрос каждые N сек", "int", default=30),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._gateway: Any = None

    async def run(self) -> None:
        if not HAS_MIIO:
            await self._set_status("error", "python-miio not installed")
            return
        host = self.config.get("host")
        token = self.config.get("token")
        if not host or not token:
            await self._set_status("error", "host/token required")
            return

        interval = int(self.config.get("poll_interval", 30))
        loop = asyncio.get_event_loop()

        try:
            self._gateway = await loop.run_in_executor(None, lambda: Gateway(host, token))
            info = await loop.run_in_executor(None, self._gateway.info)
            log.info("Xiaomi Gateway connected: %s (%s)", info.model, info.hardware_version)
        except Exception as e:
            await self._set_status("error", f"connect failed: {e}")
            return

        await self.upsert_device(
            external_id=f"gateway:{host}",
            friendly_name=self.config.get("name") or "Xiaomi Gateway",
            type="hub", vendor="Xiaomi", model="Gateway",
        )
        await self._set_status("online")

        while not self._stop.is_set():
            try:
                await self._poll()
            except Exception as e:
                log.warning("Xiaomi gateway poll failed: %s", e)
                await self._set_status("reconnecting", str(e))
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass

    async def _poll(self) -> None:
        loop = asyncio.get_event_loop()
        try:
            devices = await loop.run_in_executor(None, lambda: self._gateway.devices)
        except Exception as e:
            raise
        for sid, dev in (devices or {}).items():
            try:
                model = getattr(dev, "model", "unknown") or "unknown"
                device_type = _classify(model)
                friendly = getattr(dev, "name", None) or f"{model}-{sid[-4:]}"
                await self.upsert_device(
                    external_id=sid, friendly_name=friendly,
                    type=device_type, vendor="Xiaomi/Aqara", model=model,
                )
                state = await loop.run_in_executor(None, lambda d=dev: _read_state(d))
                if state:
                    await self.push_state(sid, state)
            except Exception as e:
                log.debug("Read %s failed: %s", sid, e)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        if not self._gateway:
            raise RuntimeError("Xiaomi gateway not connected")
        loop = asyncio.get_event_loop()
        sid = device.external_id
        if sid.startswith("gateway:"):
            # Direct gateway commands (e.g. radio, illumination LED)
            if "state" in command:
                await loop.run_in_executor(None, lambda: self._gateway.send(
                    "toggle_light", ["on" if str(command["state"]).upper() == "ON" else "off"]))
            return
        # Child device — find and call
        devices = await loop.run_in_executor(None, lambda: self._gateway.devices)
        dev = (devices or {}).get(sid)
        if not dev:
            raise RuntimeError(f"Device {sid} not found on gateway")
        if "state" in command and hasattr(dev, "on") and hasattr(dev, "off"):
            await loop.run_in_executor(
                None, dev.on if str(command["state"]).upper() == "ON" else dev.off)
        if "brightness" in command and hasattr(dev, "set_brightness"):
            pct = max(1, min(100, int(int(command["brightness"]) * 100 / 254)))
            await loop.run_in_executor(None, lambda: dev.set_brightness(pct))


def _classify(model: str) -> str:
    m = (model or "").lower()
    if "switch" in m or "plug" in m or "ctrl_ln" in m or "ctrl_neutral" in m:
        return "switch"
    if "light" in m or "bulb" in m:
        return "light"
    if "sensor_ht" in m or "weather" in m or "magnet" in m or "motion" in m or "smoke" in m:
        return "sensor"
    if "gateway" in m:
        return "hub"
    return "unknown"


def _read_state(dev: Any) -> dict[str, Any]:
    state: dict[str, Any] = {}
    for attr, key in [
        ("status", "state"), ("temperature", "temperature"),
        ("humidity", "humidity"), ("illumination", "illuminance"),
        ("battery", "battery"), ("brightness", "brightness"),
    ]:
        try:
            val = getattr(dev, attr, None)
            if val is not None:
                state[key] = val
        except Exception:
            pass
    if "state" in state and isinstance(state["state"], str):
        state["state"] = "ON" if state["state"].lower() in ("on", "open") else "OFF"
    return state
