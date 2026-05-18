"""Real mDNS/Zeroconf scanner. Subscribes to every service type any of our
integrations declares in its `zeroconf_matchers` class attribute, plus a
generic catch-all (`_http._tcp`, `_services._dns-sd._udp`) so users see
even devices we don't yet have an adapter for.

Requires host networking (mDNS uses link-local multicast 224.0.0.251)."""
from __future__ import annotations

import asyncio
import fnmatch
import logging
import socket
from functools import lru_cache
from typing import Any

from zeroconf import IPVersion, ServiceStateChange
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

from .matchers import ZeroconfMatcher
from .registry import DiscoveredDevice, registry

log = logging.getLogger("discovery.zeroconf")


@lru_cache(maxsize=512)
def _fn(pat: str) -> str:
    """Compile fnmatch pattern once and cache (HA trick)."""
    import re
    return re.compile(fnmatch.translate(pat), re.IGNORECASE).pattern


def _fnmatch_props(props: dict, matcher_props: tuple) -> bool:
    for key, pat in matcher_props:
        v = props.get(key) or props.get(key.encode()) or ""
        if isinstance(v, bytes):
            try: v = v.decode(errors="replace")
            except Exception: v = ""
        if not fnmatch.fnmatchcase(v.lower(), pat.lower()):
            return False
    return True


class ZeroconfScanner:
    def __init__(self) -> None:
        self._azc: AsyncZeroconf | None = None
        self._browser: AsyncServiceBrowser | None = None
        self._matchers_by_type: dict[str, list[tuple[str, ZeroconfMatcher]]] = {}

    def register_integration(self, kind: str, matchers: list[ZeroconfMatcher]) -> None:
        for m in matchers:
            self._matchers_by_type.setdefault(m.type, []).append((kind, m))

    async def start(self) -> None:
        # Always include common service types for visibility
        catchall = ["_http._tcp.local.", "_services._dns-sd._udp.local."]
        types = sorted({*self._matchers_by_type.keys(), *catchall})
        log.info("mDNS subscribing to %d types", len(types))
        self._azc = AsyncZeroconf(ip_version=IPVersion.V4Only)
        self._browser = AsyncServiceBrowser(
            self._azc.zeroconf, types,
            handlers=[self._on_change],
        )

    async def stop(self) -> None:
        if self._browser:
            await self._browser.async_cancel()
            self._browser = None
        if self._azc:
            await self._azc.async_close()
            self._azc = None

    def _on_change(self, zeroconf, service_type, name, state_change):
        if state_change not in (ServiceStateChange.Added, ServiceStateChange.Updated):
            return
        asyncio.create_task(self._handle(service_type, name))

    async def _handle(self, service_type: str, name: str) -> None:
        try:
            info = AsyncServiceInfo(service_type, name)
            assert self._azc is not None
            ok = await info.async_request(self._azc.zeroconf, 3000)
            if not ok:
                return
        except Exception as e:
            log.debug("mDNS resolve %s/%s failed: %s", service_type, name, e)
            return

        addrs = info.parsed_addresses() or []
        ipv4 = next((a for a in addrs if ":" not in a), None)
        if not ipv4:
            return

        # Resolve TXT props (bytes -> str)
        props: dict[str, str] = {}
        for k, v in (info.properties or {}).items():
            try:
                ks = k.decode(errors="replace") if isinstance(k, bytes) else str(k)
                vs = v.decode(errors="replace") if isinstance(v, bytes) else (str(v) if v is not None else "")
                props[ks] = vs
            except Exception:
                continue

        # Match against integrations
        matched: list[str] = []
        for kind, m in self._matchers_by_type.get(service_type, []):
            if m.name and not fnmatch.fnmatchcase(name.lower(), m.name.lower() + "*"):
                continue
            if m.properties and not _fnmatch_props(props, m.properties):
                continue
            matched.append(kind)

        # Pretty bits
        instance = name.split(".", 1)[0]
        vendor = props.get("vendor") or props.get("manufacturer")
        model = props.get("model") or props.get("type") or props.get("md")

        dev = DiscoveredDevice(
            unique_id=f"zeroconf:{service_type}|{name}",
            source="zeroconf",
            ip=ipv4,
            hostname=info.server.removesuffix(".") if info.server else None,
            name=instance,
            vendor=vendor,
            model=model,
            matched_kinds=matched,
            hint=f"mDNS {service_type.rstrip('.')}" + (f" · {vendor}" if vendor else ""),
            extra={"service_type": service_type, "txt": props, "port": info.port},
        )
        await registry.submit(dev)


scanner = ZeroconfScanner()
