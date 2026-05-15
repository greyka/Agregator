from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .integration_manager import manager
from .routers import devices, integrations, scenes, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _seed_default_integration()
    await manager.start_all()
    try:
        yield
    finally:
        await manager.stop_all()


async def _seed_default_integration() -> None:
    """If no integrations configured yet, create a default zigbee2mqtt one
    pointing at the bundled Mosquitto broker."""
    from sqlalchemy import select
    from .db import SessionLocal
    from .models import Integration
    async with SessionLocal() as session:
        existing = (await session.execute(select(Integration))).first()
        if existing:
            return
        session.add(Integration(
            kind="zigbee2mqtt",
            name="Default Zigbee bridge",
            enabled=True,
            config={
                "host": settings.mqtt_host,
                "port": settings.mqtt_port,
                "base_topic": settings.mqtt_base_topic,
            },
        ))
        await session.commit()


app = FastAPI(title="Agregator Smart Home", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(integrations.router)
app.include_router(scenes.router)
app.include_router(ws.router)


@app.get("/")
async def root() -> dict:
    return {"name": "Agregator", "version": "0.2.0"}
