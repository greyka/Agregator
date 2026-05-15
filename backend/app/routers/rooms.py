"""Floor + Room CRUD."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..events import event_bus
from ..models import Device, Floor, Room
from ..schemas import (
    FloorIn, FloorOut, FloorUpdate, RoomIn, RoomOut, RoomUpdate,
)

router = APIRouter(prefix="/api", tags=["rooms"])


# ===== Floors =====

@router.get("/floors", response_model=list[FloorOut])
async def list_floors(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Floor).order_by(Floor.level, Floor.position))).scalars().all()
    return list(rows)


@router.post("/floors", response_model=FloorOut)
async def create_floor(payload: FloorIn, session: AsyncSession = Depends(get_session)):
    row = Floor(name=payload.name, level=payload.level, position=payload.position)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    await event_bus.publish({"type": "floors.refresh"})
    return row


@router.patch("/floors/{floor_id}", response_model=FloorOut)
async def update_floor(floor_id: int, patch: FloorUpdate, session: AsyncSession = Depends(get_session)):
    row = await session.get(Floor, floor_id)
    if not row:
        raise HTTPException(404)
    if patch.name is not None: row.name = patch.name
    if patch.level is not None: row.level = patch.level
    if patch.position is not None: row.position = patch.position
    await session.commit()
    await session.refresh(row)
    await event_bus.publish({"type": "floors.refresh"})
    return row


@router.delete("/floors/{floor_id}", status_code=204)
async def delete_floor(floor_id: int, session: AsyncSession = Depends(get_session)):
    row = await session.get(Floor, floor_id)
    if not row:
        raise HTTPException(404)
    await session.delete(row)
    await session.commit()
    await event_bus.publish({"type": "floors.refresh"})


# ===== Rooms =====

async def _room_to_out(session: AsyncSession, r: Room) -> RoomOut:
    count = (await session.execute(
        select(func.count(Device.id)).where(Device.room_id == r.id)
    )).scalar_one()
    return RoomOut(
        id=r.id, name=r.name, icon=r.icon, color=r.color,
        floor_id=r.floor_id, position=r.position, device_count=count,
    )


@router.get("/rooms", response_model=list[RoomOut])
async def list_rooms(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Room).order_by(Room.position, Room.name))).scalars().all()
    return [await _room_to_out(session, r) for r in rows]


@router.post("/rooms", response_model=RoomOut)
async def create_room(payload: RoomIn, session: AsyncSession = Depends(get_session)):
    row = Room(
        name=payload.name, icon=payload.icon, color=payload.color,
        floor_id=payload.floor_id, position=payload.position,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    await event_bus.publish({"type": "rooms.refresh"})
    return await _room_to_out(session, row)


@router.patch("/rooms/{room_id}", response_model=RoomOut)
async def update_room(room_id: int, patch: RoomUpdate, session: AsyncSession = Depends(get_session)):
    row = await session.get(Room, room_id)
    if not row:
        raise HTTPException(404)
    for field in ("name", "icon", "color", "floor_id", "position"):
        v = getattr(patch, field)
        if v is not None:
            setattr(row, field, v)
    await session.commit()
    await session.refresh(row)
    await event_bus.publish({"type": "rooms.refresh"})
    return await _room_to_out(session, row)


@router.delete("/rooms/{room_id}", status_code=204)
async def delete_room(room_id: int, session: AsyncSession = Depends(get_session)):
    row = await session.get(Room, room_id)
    if not row:
        raise HTTPException(404)
    await session.delete(row)
    await session.commit()
    await event_bus.publish({"type": "rooms.refresh"})
