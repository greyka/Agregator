"""Integration framework — pluggable adapters that connect external device platforms
(Zigbee, Wi-Fi MQTT, LAN protocols, vendor clouds) and normalize them into the
unified Device model used by the rest of the system.

Each adapter inherits from `BaseIntegration` and is registered via `register()`.
"""
from .base import BaseIntegration, registry  # noqa: F401
from . import zigbee2mqtt, tasmota, shelly, yeelight, xiaomi_gateway, home_assistant  # noqa: F401
