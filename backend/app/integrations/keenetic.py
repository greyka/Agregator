"""Keenetic router (KeeneticOS 3.x / 4.x) — RCI JSON API over HTTP.

Endpoint:  http://<ip>/rci/...  (default port 80; KeenDNS unrelated)
Auth:      two-step challenge — GET /auth -> 401 with X-NDM-Realm / X-NDM-Challenge
           headers -> POST /auth with login + SHA256(challenge + MD5(login:realm:pass)).
           Session cookies returned and reused.
Endpoints used (stable across 3.x and 4.x):
   GET /rci/show/system           — model, firmware, uptime
   GET /rci/show/associations     — Wi-Fi clients: mac, ap, rssi, uptime, mcs, txrate
   GET /rci/show/ip/hotspot       — DHCP+ARP merged: name, hostname, ip, mac, link, registered
References:
   - https://gist.github.com/ancientGlider/e72cdaa2daf0af5f8d80f53fea4666be  (auth recipe)
   - https://help.keenetic.com/hc/en-us/articles/115000046069
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any

import httpx

from ..models import Device
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.keenetic")


@register
class KeeneticIntegration(BaseIntegration):
    kind = "keenetic"
    label = "Keenetic router"
    description = "Keenetic роутеры (KeeneticOS) — список Wi-Fi клиентов, DHCP, статус."
    icon = "📡"
    config_schema = [
        ConfigField("host", "IP роутера", "host", required=True, default="192.168.1.1"),
        ConfigField("username", "Логин", "string", required=True, default="admin"),
        ConfigField("password", "Пароль", "password", required=True, secret=True),
        ConfigField("poll_interval", "Период опроса, сек", "int", default=30),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._client: httpx.AsyncClient | None = None
        self._base = f"http://{config['host']}"
        self._authed = False

    async def run(self) -> None:
        interval = int(self.config.get("poll_interval", 30))
        async with httpx.AsyncClient(base_url=self._base, timeout=8.0) as client:
            self._client = client
            while not self._stop.is_set():
                try:
                    if not self._authed:
                        await self._auth()
                    await self._poll()
                    await self._set_status("online")
                except Exception as e:
                    log.warning("Keenetic %s: %s", self.config["host"], e)
                    await self._set_status("error", str(e))
                    self._authed = False
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass

    async def _auth(self) -> None:
        # Step 1: challenge.
        r = await self._client.get("/auth")
        if r.status_code == 200:  # already authed by sticky cookie
            self._authed = True
            return
        if r.status_code != 401:
            raise RuntimeError(f"unexpected /auth status {r.status_code}")
        realm = r.headers.get("X-NDM-Realm", "")
        challenge = r.headers.get("X-NDM-Challenge", "")
        user = self.config["username"]
        pw = self.config["password"]
        md5 = hashlib.md5(f"{user}:{realm}:{pw}".encode()).hexdigest()
        sha = hashlib.sha256(f"{challenge}{md5}".encode()).hexdigest()
        # Step 2: submit.
        r2 = await self._client.post("/auth", json={"login": user, "password": sha})
        if r2.status_code != 200:
            raise RuntimeError(f"auth failed: {r2.status_code}")
        self._authed = True

    async def _rci_get(self, path: str) -> Any:
        r = await self._client.get(f"/rci/{path.lstrip('/')}")
        if r.status_code == 401:
            self._authed = False
            raise RuntimeError("session expired")
        r.raise_for_status()
        return r.json()

    async def _poll(self) -> None:
        # System info (once per loop is fine — cheap).
        try:
            sys_info = await self._rci_get("show/system")
        except Exception:
            sys_info = {}
        # Wi-Fi associations: list of {mac, ap, uptime, txrate, rxrate, rssi, mcs, ...}
        assoc = await self._rci_get("show/associations")
        # Hotspot list: maps MAC -> {ip, hostname, name, link, registered}
        hotspot = await self._rci_get("show/ip/hotspot")
        clients = self._merge(assoc, hotspot)
        # Each Wi-Fi client becomes a "presence" device.
        for c in clients:
            ext = c["mac"].lower().replace(":", "")
            label = c.get("name") or c.get("hostname") or c["mac"]
            await self.upsert_device(
                external_id=ext, friendly_name=label, type="presence",
                vendor="(Wi-Fi client)", model=c.get("ssid") or c.get("ap"),
            )
            await self.push_state(ext, {
                "state": "ON" if c.get("link") != "down" else "OFF",
                "ip": c.get("ip"), "rssi": c.get("rssi"),
                "ssid": c.get("ssid"), "ap": c.get("ap"),
            })
        # Router itself as a single device.
        ext_router = f"keenetic-{self.config['host']}"
        model = (sys_info or {}).get("hw_id") or (sys_info or {}).get("model") or "Keenetic"
        await self.upsert_device(
            external_id=ext_router, friendly_name=f"Router {self.config['host']}",
            type="router", vendor="Keenetic", model=str(model),
            state={"firmware": (sys_info or {}).get("release"),
                   "uptime": (sys_info or {}).get("uptime")},
        )

    @staticmethod
    def _merge(assoc: Any, hotspot: Any) -> list[dict]:
        """Flatten Keenetic's per-interface assoc tree and join with hotspot by MAC."""
        # `associations` shape: {"station": [{"mac": "..", "ap": "WifiMaster0/AP0", "rssi": -55, ...}]}
        # Some firmwares wrap it under {"associations": {...}}.
        if isinstance(assoc, dict) and "associations" in assoc:
            assoc = assoc["associations"]
        stations = (assoc or {}).get("station") or []
        if isinstance(stations, dict):
            stations = [stations]
        # `hotspot` shape: {"host": [{"mac": "..", "ip": "..", "hostname": "..", "name": "..",
        #                              "link": "up", "registered": true, "ssid": "..", ...}]}
        hosts = (hotspot or {}).get("host") or []
        if isinstance(hosts, dict):
            hosts = [hosts]
        by_mac = {h.get("mac", "").lower(): h for h in hosts if isinstance(h, dict)}
        merged: list[dict] = []
        for s in stations:
            if not isinstance(s, dict):
                continue
            mac = (s.get("mac") or "").lower()
            host = by_mac.get(mac, {})
            merged.append({
                "mac": mac, "ap": s.get("ap"), "rssi": s.get("rssi"),
                "txrate": s.get("txrate"), "mcs": s.get("mcs"),
                "ip": host.get("ip"), "hostname": host.get("hostname"),
                "name": host.get("name"), "ssid": host.get("ssid"),
                "link": host.get("link", "up"),
            })
        return merged

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        # Read-only integration. Writes (port-forward toggle, schedule, etc.) could
        # be added via POST /rci/... with {"system": {"configuration": {"save": {}}}}
        # but that's out of scope here.
        raise NotImplementedError("Keenetic integration is read-only")
