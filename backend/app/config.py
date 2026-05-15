from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # extra="ignore" — чтобы внешние ключи в .env (ANTHROPIC_API_KEY и подобные,
    # которые читаются напрямую через os.environ) не валили старт API.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://voltpos:voltpos@localhost/voltpos_db"
    secret_key: str = "change-me-to-32-char-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    upload_dir: str = "/opt/voltpos/uploads"
    base_url: str = "http://localhost:8000"
    store_name: str = "VoltPos"
    store_contacts: str = "+996 000 000 000"
    store_logo_path: Optional[str] = None
    vapid_public_key: Optional[str] = None
    vapid_private_key: Optional[str] = None
    vapid_subject: str = "mailto:support@voltpos.online"
    # Платная фича распознавания накладных через Claude Vision.
    anthropic_api_key: Optional[str] = None


settings = Settings()
