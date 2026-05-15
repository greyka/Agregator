# Agregator — Smart Home Hub

Своя система управления умными устройствами на базе Linux. Целевая платформа — одноплатные компьютеры (Raspberry Pi, Orange Pi, x86 mini-PC). Для разработки и тестов запускается в Docker.

## Поддерживаемые экосистемы

Каждый протокол реализован как отдельная **интеграция-адаптер** — добавляется через UI на странице «Интеграции».

| Интеграция | Транспорт | Что подключает |
|---|---|---|
| **Zigbee (zigbee2mqtt)** | MQTT | Любые Zigbee-устройства через USB-стик (Xiaomi, Aqara, IKEA, Sonoff и т.д.) |
| **Xiaomi / Aqara Gateway** | miIO (LAN) | Шлюз Mi Home / Aqara Hub и его дочерние устройства |
| **Tasmota** | MQTT | Wi-Fi устройства на прошивке Tasmota (Sonoff и др.) |
| **Shelly** | MQTT (Gen1 + Gen2) | Shelly Plug / Plus / Pro Wi-Fi |
| **Yeelight** | LAN JSON-RPC | Yeelight Wi-Fi лампы (с включённым LAN Control) |

Архитектура расширяемая: добавить новый протокол = создать класс `BaseIntegration` в [backend/app/integrations](backend/app/integrations) и зарегистрировать через `@register`. UI автоматически подхватит его и сгенерирует форму настройки.

## Стек

- **Бэкенд**: Python 3.12 + FastAPI + asyncio + aiomqtt + python-miio + SQLAlchemy/SQLite
- **Фронтенд**: React 18 + Vite + TailwindCSS + Zustand
- **Брокер**: Mosquitto (для MQTT-интеграций)

## Архитектура

```
                    ┌──────────────────────────────────────┐
                    │           Frontend (React)           │
                    │  Dashboard · Devices · Integrations  │
                    └──────────────┬───────────────────────┘
                                   │ HTTP + WebSocket
                    ┌──────────────▼───────────────────────┐
                    │     FastAPI Backend                  │
                    │  ┌────────────────────────────────┐  │
                    │  │  IntegrationManager (asyncio)  │  │
                    │  └─┬──────┬──────┬──────┬──────┬──┘  │
                    │    │      │      │      │      │     │
                    │  zigbee tasmota shelly yeelight xiao │
                    │    │      │      │      │      │     │
                    │    ▼      ▼      ▼      ▼      ▼     │
                    │  SQLite (devices, integrations)      │
                    └──┬───────┬─────────┬───────────┬─────┘
                       │ MQTT  │ MQTT    │ LAN TCP   │ miIO LAN
                       ▼       ▼         ▼           ▼
                  Mosquitto              Yeelight    Xiaomi
                    │   │                bulbs       Gateway
                  Zigbee Wi-Fi
                  stick  devices
```

## Быстрый старт (Docker)

```bash
docker compose up --build
```

- **GUI**: http://localhost:5173
- **API**: http://localhost:8000/docs
- **MQTT-брокер**: localhost:1883

При первом запуске автоматически создаётся одна интеграция — `zigbee2mqtt`, которая подключается к встроенному mock-эмулятору Zigbee-устройств. Через UI «Интеграции» добавь любые другие.

## Установка на одноплатник

См. [docs/INSTALL.md](docs/INSTALL.md).

## Добавление шлюза Xiaomi

1. На странице **Интеграции** жми «+ Добавить» → выбери «Xiaomi / Aqara Gateway».
2. Введи **IP шлюза** (виден в роутере) и **miIO-токен**.
   - Токен получи через приложение Mi Home (раздел «About») или через [miiocli cloud](https://python-miio.readthedocs.io/en/latest/discovery.html).
   - Для старых шлюзов также нужен developer mode (см. [docs/INSTALL.md](docs/INSTALL.md#xiaomi-gateway-developer-mode)).
3. После сохранения шлюз и все его дочерние устройства появятся в системе автоматически.
