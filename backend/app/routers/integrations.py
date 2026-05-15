from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..integration_manager import manager
from ..integrations import registry
from ..models import Integration
from ..schemas import (
    IntegrationKindOut, IntegrationOut, IntegrationIn, IntegrationUpdate,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


def _to_out(row: Integration) -> IntegrationOut:
    return IntegrationOut(
        id=row.id, kind=row.kind, name=row.name, enabled=row.enabled,
        config=_mask_secrets(row.kind, dict(row.config or {})),
        status=row.status, last_error=row.last_error,
    )


def _mask_secrets(kind: str, config: dict) -> dict:
    cls = registry.get(kind)
    if not cls:
        return config
    for field in cls.config_schema:
        if field.secret and config.get(field.key):
            config[field.key] = "***"
    return config


@router.get("/kinds", response_model=list[IntegrationKindOut])
async def list_kinds():
    return [
        IntegrationKindOut(
            kind=cls.kind, label=cls.label, description=cls.description,
            icon=cls.icon, config_schema=[f.to_dict() for f in cls.config_schema],
        )
        for cls in registry.all()
    ]


@router.get("", response_model=list[IntegrationOut])
async def list_integrations(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Integration).order_by(Integration.id))).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=IntegrationOut)
async def create_integration(payload: IntegrationIn, session: AsyncSession = Depends(get_session)):
    cls = registry.get(payload.kind)
    if not cls:
        raise HTTPException(400, f"Unknown integration kind: {payload.kind}")
    row = Integration(
        kind=payload.kind, name=payload.name,
        enabled=payload.enabled, config=payload.config or {},
        status="pending",
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    if row.enabled:
        await manager.start(row.id, row.kind, dict(row.config))
    return _to_out(row)


@router.patch("/{integration_id}", response_model=IntegrationOut)
async def update_integration(
    integration_id: int,
    patch: IntegrationUpdate,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(Integration, integration_id)
    if not row:
        raise HTTPException(404)
    if patch.name is not None:
        row.name = patch.name
    if patch.enabled is not None:
        row.enabled = patch.enabled
    if patch.config is not None:
        # Merge so masked secrets are preserved unless explicitly overwritten
        merged = dict(row.config or {})
        for k, v in patch.config.items():
            if v == "***":
                continue
            merged[k] = v
        row.config = merged
    await session.commit()
    await session.refresh(row)

    await manager.stop(integration_id)
    if row.enabled:
        await manager.start(row.id, row.kind, dict(row.config))
    return _to_out(row)


@router.delete("/{integration_id}", status_code=204)
async def delete_integration(integration_id: int, session: AsyncSession = Depends(get_session)):
    row = await session.get(Integration, integration_id)
    if not row:
        raise HTTPException(404)
    await manager.stop(integration_id)
    await session.delete(row)
    await session.commit()


@router.post("/{integration_id}/restart", response_model=IntegrationOut)
async def restart_integration(integration_id: int, session: AsyncSession = Depends(get_session)):
    row = await session.get(Integration, integration_id)
    if not row:
        raise HTTPException(404)
    await manager.stop(integration_id)
    if row.enabled:
        await manager.start(row.id, row.kind, dict(row.config))
    await session.refresh(row)
    return _to_out(row)
