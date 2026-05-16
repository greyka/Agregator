"""Local-network device discovery — sweep + HTTP fingerprint.

Returns a list of candidate devices found on the LAN with hints about
which of our integration kinds should be used to control each one.

Works on Docker bridge networking (no multicast required) by:
  1. TCP-connect sweeping the /24 of our own interface on a curated set
     of common smart-home ports.
  2. HTTP fingerprinting every host that has anything open.
  3. Attempting SSDP (Yeelight) — silently no-ops if multicast is blocked.

No raw sockets, no root, no privileges.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
from dataclasses import dataclass, asdict
from typing import Any

import aiohttp
from fastapi import APIRouter

log = logging.getLogger("discovery")
router = APIRouter(prefix="/api", tags=["discovery"])

# Ports we sweep; first hit decides which HTTP probe to run.
PROBE_PORTS = [80, 81, 8080, 8081, 8123, 1883, 55443, 9999]

# Caps so we never melt the box / network.
CONCURRENCY_PORTS = 256
CONCURRENCY_HTTP = 32

PORT_TIMEOUT = 0.5
HTTP_TIMEOUT = 1.5


@dataclass
class Candidate:
    ip: str
    open_ports: list[int]
    vendor: str | None = None
    model: str | None = None
    integration_kind: str | None = None   # one of our adapter kinds
    hint: str | None = None               # human-friendly note
    mac: str | None = None
    extra: dict[str, Any] | None = None


def _detect_subnet() -> str:
    """Best-effort: return /24 string of our primary outbound interface."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("1.1.1.1", 80))
        my_ip = s.getsockname()[0]
        s.close()
    except Exception:
        my_ip = "192.168.1.1"
    net = ipaddress.ip_network(f"{my_ip}/24", strict=False)
    return str(net)


async def _tcp_open(ip: str, port: int, sem: asyncio.Semaphore) -> bool:
    async with sem:
        try:
            fut = asyncio.open_connection(ip, port)
            _, writer = await asyncio.wait_for(fut, timeout=PORT_TIMEOUT)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            return True
        except Exception:
            return False


async def _sweep(subnet: str) -> dict[str, list[int]]:
    net = ipaddress.ip_network(subnet, strict=False)
    sem = asyncio.Semaphore(CONCURRENCY_PORTS)
    hosts: list[str] = [str(h) for h in net.hosts()]
    tasks: list[asyncio.Task] = []
    for ip in hosts:
        for port in PROBE_PORTS:
            tasks.append(asyncio.create_task(_tcp_open(ip, port, sem)))
    results = await asyncio.gather(*tasks, return_exceptions=True)
    found: dict[str, list[int]] = {}
    i = 0
    for ip in hosts:
        for port in PROBE_PORTS:
            ok = results[i]
            i += 1
            if ok is True:
                found.setdefault(ip, []).append(port)
    return found


async def _http_get(client: aiohttp.ClientSession, url: str) -> tuple[int, str, dict]:
    try:
        async with client.get(url, timeout=aiohttp.ClientTimeout(total=HTTP_TIMEOUT)) as r:
            body = await r.text(errors="replace")
            return r.status, body[:4096], dict(r.headers)
    except Exception:
        return 0, "", {}


async def _fingerprint(client: aiohttp.ClientSession, ip: str, ports: list[int]) -> Candidate:
    c = Candidate(ip=ip, open_ports=sorted(ports))

    # Shelly (Gen1 + Gen2)
    if 80 in ports:
        status, body, _ = await _http_get(client, f"http://{ip}/shelly")
        if status == 200 and "type" in body:
            try:
                d = json.loads(body)
                c.vendor = "Shelly"
                c.model = d.get("type") or d.get("model")
                c.integration_kind = "shelly"
                c.hint = f"Shelly · {d.get('app') or d.get('type')} · MAC {d.get('mac')}"
                c.mac = d.get("mac")
                c.extra = {"shelly": d}
                return c
            except json.JSONDecodeError:
                pass

        # Tasmota
        status, body, _ = await _http_get(client, f"http://{ip}/cm?cmnd=Status%200")
        if status == 200 and "Status" in body:
            try:
                d = json.loads(body)
                stat = d.get("Status") or {}
                snet = (d.get("StatusNET") or {})
                c.vendor = "Tasmota"
                c.model = stat.get("Module")
                c.integration_kind = "tasmota"
                c.hint = f"Tasmota · {stat.get('FriendlyName', [''])[0]}"
                c.mac = snet.get("Mac")
                c.extra = {"tasmota": stat}
                return c
            except json.JSONDecodeError:
                pass

        # Generic root page sniff (catches Tasmota web UI without /cm access)
        status, body, hdrs = await _http_get(client, f"http://{ip}/")
        if status == 200:
            lo = body.lower()
            if "tasmota" in lo:
                c.vendor = "Tasmota"; c.integration_kind = "tasmota"
                c.hint = "Tasmota web UI"
                return c
            if "esphome" in lo:
                c.vendor = "ESPHome"; c.hint = "ESPHome device (use HA or MQTT)"
                return c

    # Home Assistant on :8123
    if 8123 in ports:
        status, body, _ = await _http_get(client, f"http://{ip}:8123/manifest.json")
        if status == 200 and "home assistant" in body.lower():
            c.vendor = "Home Assistant"
            c.integration_kind = "home_assistant"
            c.hint = "Home Assistant — need a Long-Lived Access Token"
            return c
        status, body, _ = await _http_get(client, f"http://{ip}:8123/")
        if status == 200 and "home assistant" in body.lower():
            c.vendor = "Home Assistant"; c.integration_kind = "home_assistant"
            c.hint = "Home Assistant — need a Long-Lived Access Token"
            return c

    # zigbee2mqtt frontend on :8080
    if 8080 in ports:
        status, body, _ = await _http_get(client, f"http://{ip}:8080/")
        if status == 200 and "zigbee2mqtt" in body.lower():
            c.vendor = "zigbee2mqtt"; c.integration_kind = "zigbee2mqtt"
            c.hint = "zigbee2mqtt frontend — connect via the local MQTT broker"
            return c

    # MQTT broker on :1883 (likely mosquitto, used by Tasmota/zigbee2mqtt)
    if 1883 in ports:
        c.vendor = "MQTT broker"
        c.hint = "MQTT broker — Tasmota/Zigbee2MQTT integrations point here"
        return c

    # Yeelight talks JSON-RPC on :55443
    if 55443 in ports:
        c.vendor = "Yeelight"; c.integration_kind = "yeelight"
        c.hint = "Yeelight bulb (LAN Control enabled)"
        return c

    return c


async def _ssdp_yeelight(found: dict[str, Candidate]) -> None:
    """Multicast M-SEARCH for Yeelight on 1982. Silently no-ops on Docker bridge."""
    MSEARCH = (
        b"M-SEARCH * HTTP/1.1\r\n"
        b"HOST: 239.255.255.250:1982\r\n"
        b"MAN: \"ssdp:discover\"\r\n"
        b"ST: wifi_bulb\r\n\r\n"
    )
    loop = asyncio.get_running_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.setblocking(False)
    try:
        sock.sendto(MSEARCH, ("239.255.255.250", 1982))
        deadline = loop.time() + 1.5
        while loop.time() < deadline:
            try:
                data = await asyncio.wait_for(loop.sock_recv(sock, 4096), 0.3)
            except (asyncio.TimeoutError, BlockingIOError):
                continue
            except Exception:
                break
            txt = data.decode(errors="replace")
            location = ""
            model = ""
            for line in txt.split("\r\n"):
                if ":" in line:
                    k, _, v = line.partition(":")
                    k = k.strip().lower()
                    if k == "location": location = v.strip()
                    elif k == "model": model = v.strip()
            if location.startswith("yeelight://"):
                ip = location.replace("yeelight://", "").split(":")[0]
                cand = found.setdefault(ip, Candidate(ip=ip, open_ports=[55443]))
                cand.vendor = "Yeelight"
                cand.model = model or cand.model
                cand.integration_kind = "yeelight"
                cand.hint = f"Yeelight {model}".strip()
    finally:
        sock.close()


@router.get("/discover")
@router.post("/discover")
async def discover() -> dict[str, Any]:
    subnet = _detect_subnet()
    log.info("discovery starting on subnet %s", subnet)

    sweep_task = asyncio.create_task(_sweep(subnet))
    found_by_ip: dict[str, Candidate] = {}
    # SSDP runs in parallel; usually a no-op behind Docker bridge but harmless.
    ssdp_task = asyncio.create_task(_ssdp_yeelight(found_by_ip))

    sweep_results, _ = await asyncio.gather(sweep_task, ssdp_task)

    candidates: dict[str, Candidate] = {**found_by_ip}
    if sweep_results:
        sem = asyncio.Semaphore(CONCURRENCY_HTTP)
        async with aiohttp.ClientSession() as session:
            async def probe(ip: str, ports: list[int]):
                async with sem:
                    c = await _fingerprint(session, ip, ports)
                    existing = candidates.get(ip)
                    if existing:
                        # Merge SSDP-discovered fields with HTTP probe results
                        c.open_ports = sorted(set(existing.open_ports) | set(c.open_ports))
                        c.vendor = c.vendor or existing.vendor
                        c.model = c.model or existing.model
                        c.integration_kind = c.integration_kind or existing.integration_kind
                        c.hint = c.hint or existing.hint
                    candidates[ip] = c
            await asyncio.gather(*(probe(ip, ports) for ip, ports in sweep_results.items()))

    out = sorted(candidates.values(), key=lambda c: (
        0 if c.integration_kind else 1,  # actionable first
        c.ip,
    ))
    log.info("discovery complete: %d hosts, %d actionable",
             len(out), sum(1 for c in out if c.integration_kind))
    return {"subnet": subnet, "count": len(out), "candidates": [asdict(c) for c in out]}
