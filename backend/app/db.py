from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    from sqlalchemy import text
    from . import models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight inline migrations (SQLite-only, idempotent).
        # Add columns introduced after the initial schema if they don't exist yet.
        cols = await conn.execute(text("PRAGMA table_info(devices)"))
        existing = {row[1] for row in cols.fetchall()}
        if "room_id" not in existing:
            await conn.execute(text(
                "ALTER TABLE devices ADD COLUMN room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL"
            ))


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
