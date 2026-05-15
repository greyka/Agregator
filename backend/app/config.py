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


settings = Settings()
