"""GET the live discovery registry built by the mDNS/SSDP/miIO/TCP scanners."""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException

from ..discovery.registry import registry

router = APIRouter(prefix="/api", tags=["discoveries"])


@router.get("/discoveries")
async def list_discoveries() -> dict[str, Any]:
    devices = registry.list_all()
    return {
        "stats": registry.stats(),
        "devices": [asdict(d) for d in devices],
    }


@router.delete("/discoveries/{unique_id:path}", status_code=204)
async def forget_discovery(unique_id: str):
    """Drop a device from the live registry (e.g. after the user configured it)."""
    ok = await registry.forget(unique_id)
    if not ok:
        raise HTTPException(404)
