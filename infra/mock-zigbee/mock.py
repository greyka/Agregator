"""
Mock zigbee2mqtt publisher.

Publishes realistic device messages to the same MQTT topics as zigbee2mqtt would,
so the backend can be developed/tested without a real Zigbee coordinator.

Topics:
  zigbee2mqtt/bridge/devices       — device list (retained)
  zigbee2mqtt/<friendly_name>      — device state
  zigbee2mqtt/<friendly_name>/set  — commands (subscribed)
"""
from __future__ import annotations

import json
import os
import random
import threading
import time
from dataclasses import dataclass, field

import paho.mqtt.client as mqtt

MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
BASE = "zigbee2mqtt"


@dataclass
class Device:
    friendly_name: str
    ieee_address: str
    model: str
    vendor: str
    type: str  # "light", "switch", "sensor"
    state: dict = field(default_factory=dict)

    def descriptor(self) -> dict:
        return {
            "friendly_name": self.friendly_name,
            "ieee_address": self.ieee_address,
            "definition": {
                "model": self.model,
                "vendor": self.vendor,
                "description": f"{self.vendor} {self.model}",
            },
            "type": "Router" if self.type == "light" else "EndDevice",
            "supported": True,
            "interview_completed": True,
        }


DEVICES: list[Device] = [
    Device("living_room_light", "0x00158d0001a1b2c3", "TRADFRI bulb E27", "IKEA", "light",
           {"state": "OFF", "brightness": 200, "color_temp": 250}),
    Device("kitchen_light", "0x00158d0001a1b2c4", "LED1623G12", "IKEA", "light",
           {"state": "ON", "brightness": 255}),
    Device("bedroom_switch", "0x00158d0001a1b2c5", "WXKG01LM", "Xiaomi", "switch",
           {"state": "OFF"}),
    Device("bathroom_sensor", "0x00158d0001a1b2c6", "WSDCGQ11LM", "Xiaomi", "sensor",
           {"temperature": 22.5, "humidity": 55, "battery": 87}),
    Device("hallway_motion", "0x00158d0001a1b2c7", "RTCGQ11LM", "Xiaomi", "sensor",
           {"occupancy": False, "battery": 92}),
]


def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"[mock-zigbee] connected: {reason_code}")
    bridge_devices = [d.descriptor() for d in DEVICES]
    client.publish(f"{BASE}/bridge/devices", json.dumps(bridge_devices), retain=True)
    client.publish(f"{BASE}/bridge/state", json.dumps({"state": "online"}), retain=True)
    for d in DEVICES:
        client.publish(f"{BASE}/{d.friendly_name}", json.dumps(d.state), retain=True)
        client.subscribe(f"{BASE}/{d.friendly_name}/set")


def on_message(client, userdata, msg):
    parts = msg.topic.split("/")
    if len(parts) != 3 or parts[2] != "set":
        return
    name = parts[1]
    device = next((d for d in DEVICES if d.friendly_name == name), None)
    if not device:
        return
    try:
        payload = json.loads(msg.payload.decode())
    except json.JSONDecodeError:
        return
    device.state.update(payload)
    client.publish(f"{BASE}/{device.friendly_name}", json.dumps(device.state), retain=True)
    print(f"[mock-zigbee] {name} <- {payload}")


def sensor_loop(client: mqtt.Client) -> None:
    while True:
        time.sleep(10)
        for d in DEVICES:
            if d.type != "sensor":
                continue
            if "temperature" in d.state:
                d.state["temperature"] = round(20 + random.uniform(-2, 5), 1)
                d.state["humidity"] = random.randint(40, 70)
            if "occupancy" in d.state:
                d.state["occupancy"] = random.random() < 0.2
            client.publish(f"{BASE}/{d.friendly_name}", json.dumps(d.state), retain=True)


def main() -> None:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="mock-zigbee2mqtt")
    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            break
        except OSError as e:
            print(f"[mock-zigbee] waiting for broker: {e}")
            time.sleep(2)

    threading.Thread(target=sensor_loop, args=(client,), daemon=True).start()
    client.loop_forever()


if __name__ == "__main__":
    main()
