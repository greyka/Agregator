from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..integration_manager import manager
from ..models import Device
from ..schemas import DeviceCommand, DeviceOut, DeviceUpdate, Status

router = APIRouter(prefix="/api", tags=["devices"])


@router.get("/status", response_model=Status)
async def status(session: AsyncSession = Depends(get_session)) -> Status:
    count = (await session.execute(select(func.count(Device.id)))).scalar_one()
    active = manager.list_active()
    online = sum(1 for s in active.values() if s == "online")
    return Status(
        devices=count,
        integrations_active=len(active),
        integrations_online=online,
    )


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Device).order_by(Device.friendly_name))
    return list(result.scalars())


@router.get("/devices/{device_id}", response_model=DeviceOut)
async def get_device(device_id: int, session: AsyncSession = Depends(get_session)):
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Device not found")
    return device


@router.patch("/devices/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: int,
    patch: DeviceUpdate,
    session: AsyncSession = Depends(get_session),
):
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Device not found")
    if patch.friendly_name is not None:
        device.friendly_name = patch.friendly_name
    if patch.room is not None:
        device.room = patch.room
    await session.commit()
    await session.refresh(device)
    return device


@router.post("/devices/{device_id}/command", response_model=DeviceOut)
async def command(
    device_id: int,
    cmd: DeviceCommand,
    session: AsyncSession = Depends(get_session),
):
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Device not found")
    try:
        await manager.send_command(device, cmd.model_dump(exclude_unset=False))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return device
