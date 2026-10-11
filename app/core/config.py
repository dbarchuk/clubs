from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    supabase_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "SUPABASE_URL",
            "VITE_SUPABASE_URL",
            "supabase_url",
        ),
    )
    supabase_publishable_key: SecretStr | None = None
    supabase_secret_key: SecretStr | None = None
    supabase_jwks_url: str | None = None
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "INFO"
    debug: bool = False
    port: int = Field(default=8000, ge=1, le=65535)

    @model_validator(mode="after")
    def set_default_supabase_jwks_url(self) -> "Settings":
        if self.supabase_url and not self.supabase_jwks_url:
            self.supabase_jwks_url = (
                f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            )
        return self

    @property
    def sqlalchemy_database_url(self) -> URL:
        return _to_psycopg_url(self.database_url)

    @property
    def migration_database_url(self) -> URL:
        return self.sqlalchemy_database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def _to_psycopg_url(value: str) -> URL:
    url = make_url(value)
    query = dict(url.query)
    # This flag is commonly included in Supabase transaction-pooler URLs for
    # other clients; it is not a libpq option and must not reach psycopg.
    query.pop("pgbouncer", None)
    return url.set(drivername="postgresql+psycopg", query=query)
