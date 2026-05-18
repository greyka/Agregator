from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import select

from ..db import SessionLocal
from ..events import event_bus
from ..models import Device, Integration

log = logging.getLogger("integration")


class ConfigField:
    """Declarative config field for an integration kind — used by UI to render forms."""
    def __init__(self, key: str, label: str, type: str = "string",
                 required: bool = False, default: Any = None, secret: bool = False,
                 help: str | None = None):
        self.key = key
        self.label = label
        self.type = type  # string, int, bool, password, host
        self.required = required
        self.default = default
        self.secret = secret
        self.help = help

    def to_dict(self) -> dict:
        return {
            "key": self.key, "label": self.label, "type": self.type,
            "required": self.required, "default": self.default,
            "secret": self.secret, "help": self.help,
        }


class BaseIntegration(ABC):
    kind: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str] = ""
    icon: ClassVar[str] = "🔌"
    config_schema: ClassVar[list[ConfigField]] = []
    # Discovery matchers (HA-style manifest): subclasses override these as
    # class attributes. The discovery manager wires them into the scanners at
    # startup. Empty lists mean "no auto-discovery for this integration".
    zeroconf_matchers: ClassVar[list] = []  # list[ZeroconfMatcher]
    ssdp_matchers: ClassVar[list] = []      # list[SsdpMatcher]
    dhcp_matchers: ClassVar[list] = []      # list[DhcpMatcher]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        self.id = integration_id
        self.config = config
        self.status = "starting"
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._task = asyncio.create_task(self._wrap_run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        await self._set_status("stopped")

    async def _wrap_run(self) -> None:
        try:
            await self.run()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("Integration %s/%s crashed", self.kind, self.id)
            await self._set_status("error", str(e))

    @abstractmethod
    async def run(self) -> None: ...

    @abstractmethod
    async def send_command(self, device: Device, command: dict[str, Any]) -> None: ...

    async def upsert_device(
        self, external_id: str, friendly_name: str, type: str,
        vendor: str | None = None, model: str | None = None,
        state: dict | None = None,
    ) -> Device:
        async with SessionLocal() as session:
            stmt = select(Device).where(
                Device.integration == self.kind,
                Device.external_id == external_id,
            )
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if existing is None:
                existing = Device(
                    integration=self.kind, external_id=external_id,
                    friendly_name=friendly_name, type=type,
                    vendor=vendor, model=model, state=state or {},
                )
                session.add(existing)
            else:
                existing.friendly_name = friendly_name or existing.friendly_name
                existing.vendor = vendor or existing.vendor
                existing.model = model or existing.model
                existing.type = type or existing.type
            await session.commit()
            await session.refresh(existing)
            device_id = existing.id
        await event_bus.publish({"type": "devices.refresh"})
        async with SessionLocal() as s:
            return await s.get(Device, device_id)

    async def push_state(self, external_id: str, state: dict[str, Any]) -> None:
        async with SessionLocal() as session:
            stmt = select(Device).where(
                Device.integration == self.kind,
                Device.external_id == external_id,
            )
            device = (await session.execute(stmt)).scalar_one_or_none()
            if device is None:
                return
            device.state = {**(device.state or {}), **state}
            device.last_seen = datetime.utcnow()
            await session.commit()
            payload = {
                "type": "device.state",
                "device": {
                    "id": device.id,
                    "friendly_name": device.friendly_name,
                    "state": device.state,
                    "last_seen": device.last_seen.isoformat(),
                },
            }
        await event_bus.publish(payload)

    async def _set_status(self, status: str, error: str | None = None) -> None:
        self.status = status
        async with SessionLocal() as session:
            integration = await session.get(Integration, self.id)
            if integration:
                integration.status = status
                integration.last_error = error
                await session.commit()
        await event_bus.publish({"type": "integration.status",
                                 "integration_id": self.id,
                                 "status": status, "error": error})


class Registry:
    def __init__(self) -> None:
        self._kinds: dict[str, type[BaseIntegration]] = {}

    def register(self, cls: type[BaseIntegration]) -> type[BaseIntegration]:
        self._kinds[cls.kind] = cls
        return cls

    def get(self, kind: str) -> type[BaseIntegration] | None:
        return self._kinds.get(kind)

    def all(self) -> list[type[BaseIntegration]]:
        return list(self._kinds.values())


registry = Registry()


def register(cls: type[BaseIntegration]) -> type[BaseIntegration]:
    return registry.register(cls)
