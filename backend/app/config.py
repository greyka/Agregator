from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_base_topic: str = "zigbee2mqtt"
    mqtt_username: str | None = None
    mqtt_password: str | None = None

    database_url: str = "sqlite+aiosqlite:///./agregator.db"

    cors_origins: list[str] = ["*"]

    # Weather provider — if set, uses Yandex Weather API; otherwise falls back to Open-Meteo.
    # Get a free "Weather on your site" key (50 req/day): https://yandex.ru/dev/weather/
    yandex_weather_key: str | None = None


settings = Settings()
