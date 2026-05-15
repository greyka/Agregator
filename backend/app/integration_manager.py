from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select

from .db import SessionLocal
from .integrations import registry
from .integrations.base import BaseIntegration
from .models import Device, Integration

log = logging.getLogger("manager")


class IntegrationManager:
    def __init__(self) -> None:
        self._active: dict[int, BaseIntegration] = {}
        self._lock = asyncio.Lock()

    async def start_all(self) -> None:
        async with SessionLocal() as session:
            rows = (await session.execute(select(Integration).where(Integration.enabled == True))).scalars().all()  # noqa: E712
            integrations = [(i.id, i.kind, dict(i.config or {})) for i in rows]
        for iid, kind, config in integrations:
            await self.start(iid, kind, config)

    async def start(self, integration_id: int, kind: str, config: dict[str, Any]) -> BaseIntegration | None:
        async with self._lock:
            cls = registry.get(kind)
            if not cls:
                log.warning("Unknown integration kind: %s", kind)
                return None
            existing = self._active.get(integration_id)
            if existing:
                await existing.stop()
            inst = cls(integration_id, config)
            self._active[integration_id] = inst
            await inst.start()
            log.info("Started integration %s (%s)", kind, integration_id)
            return inst

    async def stop(self, integration_id: int) -> None:
        async with self._lock:
            inst = self._active.pop(integration_id, None)
            if inst:
                await inst.stop()

    async def stop_all(self) -> None:
        async with self._lock:
            for inst in list(self._active.values()):
                await inst.stop()
            self._active.clear()

    def get(self, integration_id: int) -> BaseIntegration | None:
        return self._active.get(integration_id)

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        for inst in self._active.values():
            if inst.kind == device.integration:
                await inst.send_command(device, command)
                return
        raise RuntimeError(f"No active integration for {device.integration}")

    def list_active(self) -> dict[int, str]:
        return {iid: inst.status for iid, inst in self._active.items()}


manager = IntegrationManager()
