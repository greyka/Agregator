"""Pulls matchers from every registered integration class and starts/stops
the scanner tasks at FastAPI lifespan boundaries."""
from __future__ import annotations

import asyncio
import logging

from ..integrations.base import BaseIntegration, registry as integration_registry
from .miio_scanner import scanner as miio_scanner
from .ssdp_scanner import scanner as ssdp_scanner
from .zeroconf_scanner import scanner as zeroconf_scanner

log = logging.getLogger("discovery.manager")


class DiscoveryManager:
    def __init__(self) -> None:
        self._started = False

    def _wire_matchers(self) -> None:
        """Walk all known IntegrationBase subclasses and register their matchers."""
        for cls in integration_registry.all():
            kind = cls.kind
            zc = list(getattr(cls, "zeroconf_matchers", []) or [])
            if zc:
                zeroconf_scanner.register_integration(kind, zc)
            sd = list(getattr(cls, "ssdp_matchers", []) or [])
            if sd:
                ssdp_scanner.register_integration(kind, sd)

    async def start(self) -> None:
        if self._started:
            return
        self._wire_matchers()
        # Run all scanners concurrently — they fail soft if multicast is blocked
        results = await asyncio.gather(
            self._safe("zeroconf", zeroconf_scanner.start()),
            self._safe("ssdp",     ssdp_scanner.start()),
            self._safe("miio",     miio_scanner.start()),
            return_exceptions=False,
        )
        self._started = True
        log.info("discovery manager started (%d scanners)", len(results))

    async def stop(self) -> None:
        if not self._started:
            return
        await asyncio.gather(
            self._safe("zeroconf", zeroconf_scanner.stop()),
            self._safe("ssdp",     ssdp_scanner.stop()),
            self._safe("miio",     miio_scanner.stop()),
            return_exceptions=False,
        )
        self._started = False

    async def _safe(self, name: str, coro) -> None:
        try:
            await coro
        except Exception as e:
            log.warning("scanner %s failed: %s", name, e)


discovery_manager = DiscoveryManager()
