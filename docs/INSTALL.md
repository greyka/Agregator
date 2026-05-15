# Установка Agregator на одноплатник

Подходит для Raspberry Pi 4/5, Orange Pi, x86 mini-PC под управлением Debian/Ubuntu/Armbian/umbrelOS.

## Установка на umbrelOS (быстрый путь)

umbrelOS — это Debian с уже настроенным Docker. С Windows-машины:

```powershell
.\scripts\deploy.ps1 -RemoteHost 192.168.1.100 -User umbrel -RemotePath /home/umbrel/agregator
```

Пароль — тот же, что от веб-интерфейса Umbrel. После деплоя UI будет на `http://192.168.1.100:5173`.

Чтобы запускалось автоматически при перезагрузке — umbrelOS уже использует Docker, поэтому достаточно добавить `restart: unless-stopped` (уже стоит в нашем `docker-compose.yml`).

### Удалить с umbrelOS

```bash
ssh umbrel@192.168.1.100
cd /home/umbrel/agregator
docker compose down -v
rm -rf /home/umbrel/agregator
```

---

## Универсальная инструкция (RPi/Orange Pi/Armbian)

## 1. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогиниться
```

## 2. Клонирование и запуск

```bash
git clone <repo-url> agregator
cd agregator
docker compose up -d --build
```

Открой `http://<ip-одноплатника>:5173`.

## 3. Подключение реального Zigbee-стика

Замени контейнер `mock-zigbee` на настоящий `zigbee2mqtt`. Пример блока в `docker-compose.yml`:

```yaml
zigbee2mqtt:
  image: koenkk/zigbee2mqtt:latest
  container_name: zigbee2mqtt
  restart: unless-stopped
  depends_on:
    - mosquitto
  devices:
    - /dev/ttyUSB0:/dev/ttyACM0   # путь к Zigbee-стику
  volumes:
    - ./infra/zigbee2mqtt-data:/app/data
    - /run/udev:/run/udev:ro
  environment:
    TZ: Europe/Moscow
```

Конфиг `infra/zigbee2mqtt-data/configuration.yaml`:

```yaml
homeassistant: false
permit_join: true
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://mosquitto:1883
serial:
  port: /dev/ttyACM0
frontend:
  port: 8080
advanced:
  network_key: GENERATE
```

После запуска бэкенд автоматически подхватит реальные устройства из MQTT.

## 4. Автозапуск (systemd)

`/etc/systemd/system/agregator.service`:

```ini
[Unit]
Description=Agregator Smart Home
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/pi/agregator
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now agregator
```

## 5. Обновление

```bash
cd agregator
git pull
docker compose up -d --build
```

## Xiaomi Gateway: developer mode

Для шлюзов Mi Gateway v1/v2/v3 нужно один раз включить локальный API:

1. В приложении **Mi Home** открой шлюз → меню «...» → **About**.
2. Тапни 10 раз по тексту версии (внизу) — появится скрытое меню.
3. Включи **Wireless communication protocol** и запиши **token** (32 hex-символа).
4. Для Aqara Hub токен берётся через `miiocli cloud` после логина в Mi Cloud:
   ```bash
   pip install python-miio
   miiocli cloud
   # введи аккаунт Mi Home, получишь список устройств с токенами
   ```
5. В UI Agregator → «Интеграции» → «+ Добавить» → «Xiaomi / Aqara Gateway» → вбей IP и token.

## Архитектурные заметки

- Все данные хранятся в SQLite в томе `backend-data` (можно бэкапить копированием файла `agregator.db`).
- MQTT-брокер Mosquitto работает анонимно для упрощения. На продакшене добавь логин/пароль и обнови переменные `MQTT_USERNAME`/`MQTT_PASSWORD` для бэкенда.
- Образы собираются под архитектуру хоста автоматически (linux/arm64 для RPi, linux/amd64 для mini-PC).
