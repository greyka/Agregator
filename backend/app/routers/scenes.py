from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..integration_manager import manager
from ..models import Device, Scene
from ..schemas import SceneIn, SceneOut

router = APIRouter(prefix="/api/scenes", tags=["scenes"])


def _to_out(scene: Scene) -> SceneOut:
    return SceneOut(id=scene.id, name=scene.name, icon=scene.icon, actions=scene.actions or [])


@router.get("", response_model=list[SceneOut])
async def list_scenes(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Scene).order_by(Scene.name))).scalars()
    return [_to_out(s) for s in rows]


@router.post("", response_model=SceneOut)
async def create_scene(payload: SceneIn, session: AsyncSession = Depends(get_session)):
    scene = Scene(
        name=payload.name,
        icon=payload.icon,
        actions=[a.model_dump() for a in payload.actions],
    )
    session.add(scene)
    await session.commit()
    await session.refresh(scene)
    return _to_out(scene)


@router.delete("/{scene_id}", status_code=204)
async def delete_scene(scene_id: int, session: AsyncSession = Depends(get_session)):
    scene = await session.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(404)
    await session.delete(scene)
    await session.commit()


@router.post("/{scene_id}/run", status_code=202)
async def run_scene(scene_id: int, session: AsyncSession = Depends(get_session)):
    scene = await session.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(404)
    for action in scene.actions or []:
        stmt = select(Device).where(Device.friendly_name == action["device"])
        device = (await session.execute(stmt)).scalar_one_or_none()
        if device:
            await manager.send_command(device, action["command"])
    return {"ok": True, "actions": len(scene.actions or [])}
