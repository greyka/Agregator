"""LG WebOS Smart TV (2014+) — WebSocket control via SSAP protocol.

Endpoint:  ws://<ip>:3000  (plain) — falls back to wss://<ip>:3001 (TLS, self-signed)
Pairing:   first connect sends a "register" payload; TV displays an on-screen
           "Allow" prompt; on approval TV returns a `client-key` we persist.
Power on:  WoL magic packet to the TV's MAC (not over WebSocket; TV powers WS off).
Library:   aiowebostv 0.7.5+  (Apache-2.0, maintained by home-assistant-libs)
"""
from __future__ import annotations

import asyncio
import logging
import socket
from typing import Any

from aiowebostv import WebOsClient

from ..models import Device
from ..discovery.matchers import SsdpMatcher
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.lg_webos")


@register
class LgWebosIntegration(BaseIntegration):
    kind = "lg_webos"
    label = "LG WebOS TV"
    description = "LG Smart TV (webOS 2014+) — WebSocket SSAP. Pair once, then control."
    icon = "📺"
    ssdp_matchers = [
        SsdpMatcher(manufacturer="LG Electronics"),
        SsdpMatcher(server="WebOS"),
    ]
    config_schema = [
        ConfigField("host", "IP телевизора", "host", required=True),
        ConfigField("mac", "MAC (для Wake-on-LAN)", "string",
                    help="AA:BB:CC:DD:EE:FF — нужен для включения через WoL"),
        ConfigField("client_key", "Client key (заполнится после спаривания)",
                    "string", secret=True,
                    help="Оставьте пустым при первом подключении — TV покажет 'Allow'."),
        ConfigField("poll_interval", "Период опроса, сек", "int", default=30),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._client: WebOsClient | None = None
        self._ext_id = f"lg-{config.get('host', 'unknown')}"

    async def run(self) -> None:
        host = self.config["host"]
        key = self.config.get("client_key") or None
        while not self._stop.is_set():
            client = WebOsClient(host, key)
            self._client = client
            try:
                await client.connect()
                # First-time pairing returns a key — persist it.
                if client.client_key and client.client_key != key:
                    key = client.client_key
                    await self._save_client_key(key)
                await self._set_status("online")

                async def on_state(state) -> None:
                    await self.upsert_device(
                        external_id=self._ext_id,
                        friendly_name=f"LG TV {host}",
                        type="tv", vendor="LG", model="webOS",
                    )
                    await self.push_state(self._ext_id, {
                        "state": "ON" if getattr(state, "is_on", False) else "OFF",
                        "volume": getattr(state, "volume", None),
                        "muted": getattr(state, "muted", None),
                        "current_app": getattr(state, "current_app_id", None),
                    })

                await client.register_state_update_callback(on_state)
                # Keep connection alive until stop is signalled.
                while not self._stop.is_set():
                    if not client.is_connected():
                        break
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=10.0)
                    except asyncio.TimeoutError:
                        pass
            except Exception as e:
                log.warning("LG TV %s: %s — TV likely off; will retry", host, e)
                await self._set_status("offline", str(e))
                # TV is off — wait & retry. State stays OFF.
                await self.push_state(self._ext_id, {"state": "OFF"})
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=30.0)
                except asyncio.TimeoutError:
                    pass
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    pass

    async def _save_client_key(self, key: str) -> None:
        from sqlalchemy import select
        from ..db import SessionLocal
        from ..models import Integration
        async with SessionLocal() as session:
            row = await session.get(Integration, self.id)
            if row:
                row.config = {**(row.config or {}), "client_key": key}
                await session.commit()
        self.config["client_key"] = key
        log.info("LG TV: client_key saved for integration %s", self.id)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        cmd = command.get("command") or command
        client = self._client
        if isinstance(cmd, dict) and "state" in cmd and str(cmd["state"]).upper() == "ON":
            return await self._wake_on_lan()
        if not client or not client.is_connected():
            raise RuntimeError("LG TV not connected (turn it on first)")
        if "state" in cmd and str(cmd["state"]).upper() == "OFF":
            await client.power_off()
        elif "volume" in cmd:
            await client.set_volume(int(cmd["volume"]))
        elif "mute" in cmd:
            await client.set_mute(bool(cmd["mute"]))
        elif "app" in cmd:
            await client.launch_app(str(cmd["app"]))
        elif "button" in cmd:
            await client.button(str(cmd["button"]).upper())

    async def _wake_on_lan(self) -> None:
        mac = (self.config.get("mac") or "").replace(":", "").replace("-", "")
        if len(mac) != 12:
            raise RuntimeError("WoL requires a valid MAC in integration config")
        payload = bytes.fromhex("FF" * 6 + mac * 16)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.sendto(payload, ("255.255.255.255", 9))
        finally:
            sock.close()
