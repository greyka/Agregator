"""Yeelight (Xiaomi) Wi-Fi bulbs — LAN JSON-RPC on TCP port 55443.

LAN Control must be enabled on each bulb via the Mi Home app once.
Discovery uses SSDP multicast on UDP 1982.
"""
from __future__ import annotations

import asyncio
import json
import logging
import socket
import struct
from typing import Any

from ..models import Device
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.yeelight")

SSDP_ADDR = "239.255.255.250"
SSDP_PORT = 1982
SEARCH_MSG = (
    "M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1982\r\n"
    'MAN: "ssdp:discover"\r\n'
    "ST: wifi_bulb\r\n\r\n"
).encode()


@register
class YeelightIntegration(BaseIntegration):
    kind = "yeelight"
    label = "Yeelight (LAN)"
    description = "Yeelight Wi-Fi лампы по локальному JSON-RPC (LAN Control must be enabled)"
    icon = "💡"
    config_schema = [
        ConfigField("scan_interval", "Сканировать каждые N сек", "int", default=60),
        ConfigField("static_hosts", "Список IP через запятую (опц.)", "string", default=""),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        self._bulbs: dict[str, str] = {}  # bulb_id -> ip
        self._cmd_id = 0

    async def run(self) -> None:
        await self._set_status("online")
        interval = int(self.config.get("scan_interval", 60))
        for ip in [s.strip() for s in (self.config.get("static_hosts") or "").split(",") if s.strip()]:
            await self._probe(ip)
        while not self._stop.is_set():
            try:
                await self._discover()
                for bulb_id, ip in list(self._bulbs.items()):
                    await self._poll(bulb_id, ip)
            except Exception:
                log.exception("Yeelight scan failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass

    async def _discover(self) -> None:
        loop = asyncio.get_event_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.setblocking(False)
        try:
            sock.sendto(SEARCH_MSG, (SSDP_ADDR, SSDP_PORT))
            deadline = loop.time() + 2.0
            while loop.time() < deadline:
                try:
                    data = await asyncio.wait_for(loop.sock_recv(sock, 4096), 0.5)
                except (asyncio.TimeoutError, BlockingIOError):
                    continue
                except Exception:
                    break
                self._parse_ssdp(data.decode(errors="replace"))
        finally:
            sock.close()

    def _parse_ssdp(self, response: str) -> None:
        headers = {}
        for line in response.split("\r\n"):
            if ":" in line:
                k, _, v = line.partition(":")
                headers[k.strip().lower()] = v.strip()
        location = headers.get("location", "")
        bulb_id = headers.get("id")
        if not (location.startswith("yeelight://") and bulb_id):
            return
        ip_port = location.replace("yeelight://", "")
        ip = ip_port.split(":")[0]
        self._bulbs[bulb_id] = ip

    async def _probe(self, ip: str) -> None:
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, 55443), 2.0)
            writer.close()
            await writer.wait_closed()
            self._bulbs[ip] = ip
        except Exception:
            pass

    async def _poll(self, bulb_id: str, ip: str) -> None:
        result = await self._rpc(ip, "get_prop", ["power", "bright", "ct", "rgb"])
        if not result:
            return
        state = {
            "state": "ON" if result[0] == "on" else "OFF",
            "brightness": int(int(result[1]) * 254 / 100) if result[1] else 0,
        }
        await self.upsert_device(
            external_id=bulb_id, friendly_name=f"yeelight-{bulb_id[-6:]}",
            type="light", vendor="Yeelight", model="Wi-Fi Bulb",
        )
        await self.push_state(bulb_id, state)

    async def _rpc(self, ip: str, method: str, params: list) -> list | None:
        self._cmd_id += 1
        msg = json.dumps({"id": self._cmd_id, "method": method, "params": params}) + "\r\n"
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, 55443), 2.0)
            writer.write(msg.encode())
            await writer.drain()
            data = await asyncio.wait_for(reader.readline(), 2.0)
            writer.close()
            await writer.wait_closed()
            return json.loads(data.decode()).get("result")
        except Exception as e:
            log.debug("Yeelight RPC %s@%s failed: %s", method, ip, e)
            return None

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        ip = self._bulbs.get(device.external_id)
        if not ip:
            raise RuntimeError(f"Yeelight {device.external_id} not discovered")
        if "state" in command:
            await self._rpc(ip, "set_power",
                            ["on" if str(command["state"]).upper() == "ON" else "off", "smooth", 300])
        if "brightness" in command:
            pct = max(1, min(100, int(int(command["brightness"]) * 100 / 254)))
            await self._rpc(ip, "set_bright", [pct, "smooth", 300])
