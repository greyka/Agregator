"""Xiaomi Mi Home Cloud — fetch device inventory (with miIO tokens) for the account.

Why this exists: miIO LAN protocol requires a per-device 32-hex token that's
provisioned by Mi Home when the device is paired and only exposed via the
account's cloud. This integration logs into the Xiaomi account once, fetches
the device list (name, model, MAC, LAN IP, token, did, parent_did for Zigbee
children behind a hub), and upserts each row as a Device. Other integrations
(yeelight, xiaomi_gateway, miio_generic) can then look up tokens by MAC/IP.

Protocol cribbed from `Squachen/micloud` (MIT, v0.6),
`PiotrMachowski/Xiaomi-cloud-tokens-extractor`, and `python-miio/miio` —
all three implement the same documented three-step login + HMAC-SHA256
signed device_list call. No code copied verbatim; this is a clean
async re-implementation in ~200 lines using only httpx + stdlib.

Login sequence (Xiaomi account.xiaomi.com):
  1. GET  /pass/serviceLogin?sid=xiaomiio&_json=true        -> `_sign`
  2. POST /pass/serviceLoginAuth2 {user, hash=MD5(password), _sign, sid,
        callback=https://sts.api.io.mi.com/sts, _json=true}
     -> ssecurity, userId, passToken, location, code (0=ok, 70016=bad creds,
        81003=phone-verify needed, 87001=captcha needed)
  3. GET  <location>&clientSign=<sha1(...)> -> cookie `serviceToken`

Device list call (region-routed):
  POST  https://{region}.api.io.mi.com/app/home/device_list
  body  signed_nonce + signature (HMAC-SHA256), payload {"getVirtualModel":
        false, "getHuamiDevices": 0}
  headers carry serviceToken + userId cookies
  response.result.list[] each has: did, name, mac, model, localip, token,
        isOnline, parent_id, parent_model, ssid, bssid, ...

2FA: if step 2 returns notificationUrl, the account requires phone/email
verification — we surface the URL via status so the user can confirm in a
browser, then retry. Captcha (87001) is treated identically.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import random
import string
import time
from typing import Any

import httpx
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Device, Integration
from .base import BaseIntegration, ConfigField, register

log = logging.getLogger("integration.xiaomi_cloud")

# All valid Mi Cloud regions. CN has no host prefix; others prepend "{code}.".
REGIONS = ["cn", "de", "us", "ru", "tw", "sg", "in", "i2"]
AGENT = "Android-7.1.1-1.0.0-ONEPLUS A3010-136-{aid} APP/xiaomi.smarthome APPV/62830"
UA_TEMPLATE = AGENT  # same string used as User-Agent

LOGIN_URL_1 = "https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true"
LOGIN_URL_2 = "https://account.xiaomi.com/pass/serviceLoginAuth2"
CALLBACK = "https://sts.api.io.mi.com/sts"


# ---------- crypto helpers (HMAC-SHA256 signing for /home/* calls) ----------

def _rand_agent_id() -> str:
    return "".join(random.choices("ABCDEF", k=13))


def _gen_nonce() -> str:
    """8 random bytes + (epoch_minute / 60), base64-encoded."""
    nonce_bytes = os.urandom(8) + (int(time.time() / 60)).to_bytes(4, "big")
    return base64.b64encode(nonce_bytes).decode()


def _signed_nonce(ssecurity: str, nonce: str) -> str:
    """SHA256(b64decode(ssecurity) || b64decode(nonce)), b64-encoded."""
    h = hashlib.sha256()
    h.update(base64.b64decode(ssecurity))
    h.update(base64.b64decode(nonce))
    return base64.b64encode(h.digest()).decode()


def _gen_signature(uri: str, signed_nonce: str, nonce: str, data: str) -> str:
    """HMAC-SHA256 over '{uri}&{signed_nonce}&{nonce}&data={data}', b64-encoded."""
    msg = "&".join([uri, signed_nonce, nonce, f"data={data}"])
    digest = hmac.new(base64.b64decode(signed_nonce), msg.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _api_host(region: str) -> str:
    region = (region or "cn").lower()
    if region == "cn":
        return "https://api.io.mi.com/app"
    return f"https://{region}.api.io.mi.com/app"


# ---------- the integration ----------

@register
class XiaomiCloudIntegration(BaseIntegration):
    kind = "xiaomi_cloud"
    label = "Xiaomi Mi Home Cloud"
    description = (
        "Учётка Xiaomi: тянет список устройств (имя, модель, MAC, локальный IP, "
        "miIO-токен, did, parent_did для Zigbee-дочек под шлюзом). Логинится раз — "
        "serviceToken кэшируется, далее раз в 30 мин синхронизирует инвентарь."
    )
    icon = "☁️"
    config_schema = [
        ConfigField("username", "Mi-аккаунт (email или ID)", "string", required=True),
        ConfigField("password", "Пароль", "password", required=True, secret=True),
        ConfigField("region", "Регион сервера", "string", default="ru",
                    help=f"Один из: {', '.join(REGIONS)} (cn=Китай, de=ЕС, us=США, ru=Россия)"),
        ConfigField("poll_interval", "Синхронизация каждые N сек", "int", default=1800),
    ]

    def __init__(self, integration_id: int, config: dict[str, Any]):
        super().__init__(integration_id, config)
        # cached session credentials (re-used across polls; refreshed on 401)
        self._ssecurity: str | None = None
        self._user_id: str | None = None
        self._service_token: str | None = None
        self._client = httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=False,
            headers={"User-Agent": AGENT.format(aid=_rand_agent_id())},
        )

    async def run(self) -> None:
        region = (self.config.get("region") or "ru").lower()
        if region not in REGIONS:
            await self._set_status("error", f"region must be one of {REGIONS}")
            return
        interval = max(60, int(self.config.get("poll_interval", 1800)))

        # Try to restore cached serviceToken from integration.config so we don't
        # re-auth on every restart. The token is good for ~24h in practice.
        self._restore_cached_session()

        while not self._stop.is_set():
            try:
                if not self._service_token:
                    await self._login()
                    await self._persist_cached_session()
                await self._sync_devices(region)
                await self._set_status("online")
            except _AuthExpired:
                log.info("xiaomi_cloud: serviceToken expired, re-authenticating")
                self._service_token = None  # force fresh login next loop
            except _NeedsVerification as e:
                await self._set_status("verification_required", str(e))
                # back off — user must confirm in browser; retry every 5 min
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=300)
                except asyncio.TimeoutError:
                    pass
                continue
            except Exception as e:
                log.warning("xiaomi_cloud poll failed: %s", e)
                await self._set_status("reconnecting", str(e))
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass

        await self._client.aclose()

    async def send_command(self, device: Device, command: dict[str, Any]) -> None:
        # Cloud-only integration is read-only inventory; control happens through
        # the LAN integrations (yeelight, xiaomi_gateway, etc.) using the tokens
        # this one provides.
        raise NotImplementedError("xiaomi_cloud is inventory-only; use LAN integrations to control")

    # ---------- login flow ----------

    async def _login(self) -> None:
        username = self.config.get("username")
        password = self.config.get("password")
        if not username or not password:
            raise RuntimeError("username/password required")

        # step 1: pick up _sign
        r1 = await self._client.get(LOGIN_URL_1, cookies={"userId": username, "sdkVersion": "3.9", "deviceId": _rand_agent_id()})
        body = r1.text
        if body.startswith("&&&START&&&"):
            body = body[len("&&&START&&&"):]
        j1 = json.loads(body)
        sign = j1.get("_sign") or ""

        # step 2: post hashed password
        pw_md5 = hashlib.md5(password.encode()).hexdigest().upper()
        r2 = await self._client.post(LOGIN_URL_2, data={
            "sid": "xiaomiio", "hash": pw_md5, "callback": CALLBACK,
            "qs": "%3Fsid%3Dxiaomiio%26_json%3Dtrue", "user": username,
            "_sign": sign, "_json": "true",
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        body = r2.text
        if body.startswith("&&&START&&&"):
            body = body[len("&&&START&&&"):]
        j2 = json.loads(body)
        code = j2.get("code")
        if code == 70016:
            raise RuntimeError("bad username or password")
        if code == 87001:
            raise _NeedsVerification(f"captcha required, open in browser: {j2.get('captchaUrl')}")
        if j2.get("notificationUrl"):
            # phone/email confirmation needed from a new IP
            raise _NeedsVerification(f"open URL in browser and confirm: {j2['notificationUrl']}")
        if code != 0:
            raise RuntimeError(f"loginAuth2 failed code={code}: {j2.get('description')}")

        self._ssecurity = j2["ssecurity"]
        self._user_id = str(j2["userId"])
        location = j2["location"]
        nonce_val = j2.get("nonce") or ""
        # clientSign = SHA1("nonce=<nonce>&<ssecurity>")
        client_sign = base64.b64encode(
            hashlib.sha1(f"nonce={nonce_val}&{self._ssecurity}".encode()).digest()
        ).decode()

        # step 3: follow location, harvest serviceToken cookie
        r3 = await self._client.get(f"{location}&clientSign={client_sign}")
        st = r3.cookies.get("serviceToken")
        if not st:
            # some regions set the cookie on the redirect chain — try once more
            if r3.status_code in (301, 302) and "Location" in r3.headers:
                r3b = await self._client.get(r3.headers["Location"])
                st = r3b.cookies.get("serviceToken")
        if not st:
            raise RuntimeError("serviceToken cookie not returned by step 3")
        self._service_token = st
        log.info("xiaomi_cloud: logged in as userId=%s", self._user_id)

    # ---------- device list ----------

    async def _sync_devices(self, region: str) -> None:
        result = await self._call_api(region, "/home/device_list",
                                      {"getVirtualModel": False, "getHuamiDevices": 0})
        items = result.get("list") or []
        log.info("xiaomi_cloud: %d devices in account (region=%s)", len(items), region)
        for it in items:
            await self._upsert(it)

    async def _upsert(self, it: dict[str, Any]) -> None:
        did = str(it.get("did") or "")
        name = it.get("name") or did
        model = it.get("model") or "unknown"
        parent_did = it.get("parent_id") or it.get("parentId") or None
        normalized = {
            "did": did,
            "model": model,
            "mac": (it.get("mac") or "").upper() or None,
            "ip": it.get("localip") or None,
            "token": it.get("token") or None,
            "parent_did": str(parent_did) if parent_did else None,
            "online": bool(it.get("isOnline")),
            "ssid": it.get("ssid"),
        }
        await self.upsert_device(
            external_id=f"micloud:{did}",
            friendly_name=name,
            type=_classify(model),
            vendor="Xiaomi",
            model=model,
            state=normalized,  # token, ip, parent_did stored in device.state
        )
        # also push state on subsequent runs so last_seen ticks
        await self.push_state(f"micloud:{did}", normalized)

    # ---------- signed cloud RPC ----------

    async def _call_api(self, region: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not (self._ssecurity and self._user_id and self._service_token):
            raise _AuthExpired("no session")
        url = _api_host(region) + path
        data_str = json.dumps(payload, separators=(",", ":"))
        nonce = _gen_nonce()
        sn = _signed_nonce(self._ssecurity, nonce)
        signature = _gen_signature(path, sn, nonce, data_str)
        form = {"signature": signature, "_nonce": nonce, "data": data_str}
        cookies = {
            "userId": self._user_id, "serviceToken": self._service_token,
            "locale": "en_GB", "timezone": "GMT+02:00", "is_daylight": "1",
            "dst_offset": "3600000", "channel": "MI_APP_STORE",
        }
        r = await self._client.post(url, data=form, cookies=cookies, headers={
            "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        if r.status_code == 401 or r.status_code == 403:
            raise _AuthExpired(f"status {r.status_code}")
        if r.status_code != 200:
            raise RuntimeError(f"{path} -> HTTP {r.status_code}: {r.text[:200]}")
        j = r.json()
        if j.get("code") not in (0, None):
            if j.get("code") == 2:
                raise _AuthExpired(f"api code 2: {j.get('message')}")
            raise RuntimeError(f"{path} -> api code {j.get('code')}: {j.get('message')}")
        return j.get("result") or {}

    # ---------- session cache (db-backed) ----------

    def _restore_cached_session(self) -> None:
        cached = self.config.get("_session") or {}
        self._ssecurity = cached.get("ssecurity")
        self._user_id = cached.get("user_id")
        self._service_token = cached.get("service_token")

    async def _persist_cached_session(self) -> None:
        async with SessionLocal() as session:
            integration = await session.get(Integration, self.id)
            if not integration:
                return
            cfg = dict(integration.config or {})
            cfg["_session"] = {
                "ssecurity": self._ssecurity,
                "user_id": self._user_id,
                "service_token": self._service_token,
                "stamp": int(time.time()),
            }
            integration.config = cfg
            await session.commit()


class _AuthExpired(Exception):
    pass


class _NeedsVerification(Exception):
    pass


def _classify(model: str) -> str:
    m = (model or "").lower()
    if "gateway" in m or "hub" in m:
        return "hub"
    if "plug" in m or "switch" in m or "ctrl_ln" in m or "ctrl_neutral" in m:
        return "switch"
    if "light" in m or "bulb" in m or "yeelink" in m or "lamp" in m:
        return "light"
    if "vacuum" in m or "roborock" in m or "viomi" in m:
        return "vacuum"
    if "airpurifier" in m or "humidifier" in m or "fan" in m or "airrtc" in m:
        return "appliance"
    if "sensor" in m or "magnet" in m or "motion" in m or "weather" in m or "smoke" in m:
        return "sensor"
    return "unknown"
