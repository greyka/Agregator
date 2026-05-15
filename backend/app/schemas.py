from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    integration: str
    external_id: str
    friendly_name: str
    type: str
    vendor: str | None
    model: str | None
    room: str | None
    state: dict[str, Any]
    last_seen: datetime | None


class DeviceUpdate(BaseModel):
    friendly_name: str | None = None
    room: str | None = None


class DeviceCommand(BaseModel):
    model_config = ConfigDict(extra="allow")


class SceneAction(BaseModel):
    device: str
    command: dict[str, Any]


class SceneIn(BaseModel):
    name: str
    icon: str | None = None
    actions: list[SceneAction]


class SceneOut(SceneIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class Status(BaseModel):
    devices: int
    integrations_active: int
    integrations_online: int


class IntegrationKindOut(BaseModel):
    kind: str
    label: str
    description: str
    icon: str
    config_schema: list[dict[str, Any]]


class IntegrationIn(BaseModel):
    kind: str
    name: str
    enabled: bool = True
    config: dict[str, Any] = {}


class IntegrationUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None


class IntegrationOut(BaseModel):
    id: int
    kind: str
    name: str
    enabled: bool
    config: dict[str, Any]
    status: str
    last_error: str | None
