"""Supported-devices catalog — searchable list of every device we know how
to talk to via one of our integrations.

Catalog data is bundled at `backend/app/data/catalog.json.gz`, built by
`backend/scripts/fetch_catalog.py` from public registries (Tasmota templates,
Shelly product list, Yeelight LAN spec, etc.). Re-run that script to refresh.
"""
from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("catalog")
router = APIRouter(prefix="/api/catalog", tags=["catalog"])

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "catalog.json.gz"

_catalog: list[dict] | None = None


def _load() -> list[dict]:
    global _catalog
    if _catalog is not None:
        return _catalog
    if not DATA_FILE.exists():
        log.warning("catalog file not found: %s", DATA_FILE)
        _catalog = []
        return _catalog
    with gzip.open(DATA_FILE, "rt", encoding="utf-8") as f:
        _catalog = json.load(f)
    log.info("catalog loaded: %d devices from %s", len(_catalog), DATA_FILE.name)
    return _catalog


@router.get("/stats")
async def stats() -> dict[str, Any]:
    cat = _load()
    by_kind: dict[str, int] = {}
    for d in cat:
        k = d.get("integration_kind") or "unknown"
        by_kind[k] = by_kind.get(k, 0) + 1
    return {"total": len(cat), "by_kind": by_kind}


@router.get("/search")
async def search(
    q: str | None = Query(None),
    kind: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Substring search across vendor/model/description, optional kind filter."""
    cat = _load()
    needle = (q or "").lower().strip()
    out: list[dict] = []
    for d in cat:
        if kind and d.get("integration_kind") != kind:
            continue
        if needle:
            hay = " ".join(str(d.get(k, "")) for k in ("vendor", "model", "description")).lower()
            if needle not in hay:
                continue
        out.append(d)
    total = len(out)
    page = out[offset : offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "results": page}
