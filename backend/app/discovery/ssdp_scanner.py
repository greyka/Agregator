"""SSDP / UPnP scanner. Listens on 239.255.255.250:1900 for NOTIFY packets and
periodically sends M-SEARCH probes. Requires host networking."""
from __future__ import annotations

import asyncio
import fnmatch
import logging
from typing import Any

from async_upnp_client.search import async_search

from .matchers import SsdpMatcher
from .registry import DiscoveredDevice, registry

log = logging.getLogger("discovery.ssdp")


class SsdpScanner:
    def __init__(self) -> None:
        self._matchers: list[tuple[str, SsdpMatcher]] = []
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def register_integration(self, kind: str, matchers: list[SsdpMatcher]) -> None:
        for m in matchers:
            self._matchers.append((kind, m))

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try: await self._task
            except (asyncio.CancelledError, Exception): pass

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await async_search(self._on_response, timeout=4)
            except Exception as e:
                log.debug("ssdp search error: %s", e)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=30)
            except asyncio.TimeoutError:
                pass

    async def _on_response(self, headers: dict, *_args: Any) -> None:
        try:
            st = headers.get("ST", "")
            location = headers.get("LOCATION", "")
            server = headers.get("SERVER", "")
            usn = headers.get("USN", "")
            if not location:
                return
            from urllib.parse import urlparse
            host = urlparse(location).hostname
            if not host:
                return

            matched: list[str] = []
            for kind, m in self._matchers:
                if m.st and not (m.st == st or m.st == headers.get("NT", "")):
                    continue
                if m.server and not fnmatch.fnmatchcase(server.lower(), m.server.lower()):
                    continue
                matched.append(kind)

            dev = DiscoveredDevice(
                unique_id=f"ssdp:{usn or st}|{host}",
                source="ssdp",
                ip=host,
                name=server or st.rsplit(":", 1)[-1] if st else None,
                matched_kinds=matched,
                hint=f"SSDP · {st or 'upnp'}",
                extra={"st": st, "usn": usn, "server": server, "location": location},
            )
            await registry.submit(dev)
        except Exception as e:
            log.debug("ssdp handler error: %s", e)


scanner = SsdpScanner()
