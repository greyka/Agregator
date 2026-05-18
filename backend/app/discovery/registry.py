"""Central registry of discovered-but-not-yet-configured devices."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from ..events import event_bus

log = logging.getLogger("discovery")


@dataclass(slots=True)
class DiscoveredDevice:
    """Normalised shape across all transports — same shape goes to the UI."""
    unique_id: str                                       # "{source}:{mac|hostname|udn}"
    source: str                                          # zeroconf / ssdp / dhcp / miio / tcp
    ip: str
    mac: str | None = None
    hostname: str | None = None
    name: str | None = None                              # human-friendly
    vendor: str | None = None
    model: str | None = None
    matched_kinds: list[str] = field(default_factory=list)  # which of our integration adapters claim it
    hint: str | None = None
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    extra: dict[str, Any] = field(default_factory=dict)


class DiscoveryRegistry:
    def __init__(self) -> None:
        self._seen: dict[str, DiscoveredDevice] = {}
        self._lock = asyncio.Lock()

    async def submit(self, dev: DiscoveredDevice) -> bool:
        """Returns True if this is a new device (or it changed materially)."""
        async with self._lock:
            prev = self._seen.get(dev.unique_id)
            if prev:
                # Merge new info into the existing record
                changed = False
                for fld in ("mac", "hostname", "name", "vendor", "model", "hint"):
                    pv = getattr(prev, fld)
                    nv = getattr(dev, fld)
                    if nv and nv != pv:
                        setattr(prev, fld, nv); changed = True
                # Union matched kinds
                merged = list({*prev.matched_kinds, *dev.matched_kinds})
                if set(merged) != set(prev.matched_kinds):
                    prev.matched_kinds = merged; changed = True
                # Update extra
                for k, v in (dev.extra or {}).items():
                    if prev.extra.get(k) != v:
                        prev.extra[k] = v; changed = True
                prev.last_seen = time.time()
                if changed:
                    await self._announce(prev)
                return changed
            else:
                self._seen[dev.unique_id] = dev
                await self._announce(dev)
                return True

    async def _announce(self, dev: DiscoveredDevice) -> None:
        log.info("discovered %s via %s -> %s (kinds=%s)",
                 dev.ip, dev.source, dev.name or dev.hostname or "?",
                 dev.matched_kinds)
        await event_bus.publish({"type": "discovery.found", "device": asdict(dev)})

    def list_all(self) -> list[DiscoveredDevice]:
        return list(self._seen.values())

    def get(self, unique_id: str) -> DiscoveredDevice | None:
        return self._seen.get(unique_id)

    async def forget(self, unique_id: str) -> bool:
        async with self._lock:
            return self._seen.pop(unique_id, None) is not None

    def stats(self) -> dict[str, int]:
        by_source: dict[str, int] = {}
        for d in self._seen.values():
            by_source[d.source] = by_source.get(d.source, 0) + 1
        return {"total": len(self._seen), "by_source": by_source}


registry = DiscoveryRegistry()
