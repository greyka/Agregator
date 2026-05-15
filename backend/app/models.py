from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, JSON, Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Floor(Base):
    __tablename__ = "floors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    level: Mapped[int] = mapped_column(Integer, default=0)  # 0 = ground, 1 = first, -1 = basement
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    icon: Mapped[str] = mapped_column(String, default="home")  # Tabler icon key
    color: Mapped[str] = mapped_column(String, default="#22E5FF")
    floor_id: Mapped[int | None] = mapped_column(ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("integration", "external_id", name="uq_device_integration_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    integration: Mapped[str] = mapped_column(String, index=True, default="zigbee2mqtt")
    external_id: Mapped[str] = mapped_column(String, index=True)
    friendly_name: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, default="unknown")
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    room: Mapped[str | None] = mapped_column(String, nullable=True)  # legacy free-text label
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True, index=True)
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Integration(Base):
    """Configured external system: Zigbee bridge, Xiaomi gateway, Tasmota fleet, etc."""
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="unknown")
    last_error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    icon: Mapped[str | None] = mapped_column(String, nullable=True)
    actions: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
