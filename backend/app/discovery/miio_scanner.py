"""Xiaomi miIO broadcast scanner. Sends the 32-byte hello packet to
255.255.255.255:54321 and collects responding devices (Mi gateways,
Yeelights, vacuums, air purifiers, etc.)."""
from __future__ import annotations

import asyncio
import logging
import socket
import struct

from .registry import DiscoveredDevice, registry

log = logging.getLogger("discovery.miio")

# miIO hello: 0x21310020 + 0xFFFFFFFF*4
MIIO_HELLO = bytes.fromhex("21310020ffffffffffffffffffffffffffffffff")


class MiIOScanner:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try: await self._task
            except (asyncio.CancelledError, Exception): pass

    async def _run(self) -> None:
        while not self._stop.is_set():
            await self._broadcast_once()
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    async def _broadcast_once(self) -> None:
        loop = asyncio.get_running_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setblocking(False)
        try:
            sock.sendto(MIIO_HELLO, ("255.255.255.255", 54321))
            deadline = loop.time() + 2.5
            while loop.time() < deadline:
                try:
                    data, addr = await asyncio.wait_for(loop.sock_recvfrom(sock, 4096), 0.4)
                except (asyncio.TimeoutError, BlockingIOError):
                    continue
                except Exception:
                    break
                if len(data) >= 32 and data[:4] == b"\x21\x31\x00\x20":
                    device_id = struct.unpack(">I", data[8:12])[0]
                    dev = DiscoveredDevice(
                        unique_id=f"miio:{device_id}",
                        source="miio",
                        ip=addr[0],
                        vendor="Xiaomi",
                        matched_kinds=["xiaomi_gateway"],
                        hint=f"Xiaomi miIO · device_id={device_id}",
                        extra={"device_id": device_id},
                    )
                    await registry.submit(dev)
        except Exception as e:
            log.debug("miIO broadcast error: %s", e)
        finally:
            sock.close()


scanner = MiIOScanner()
