from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore', case_sensitive=False)
    environment: Literal['development', 'test', 'staging', 'production'] = 'development'
    database_url: SecretStr
    database_direct_url: SecretStr = SecretStr('')
    test_database_url: SecretStr = SecretStr('')
    db_pool_size: int = Field(5, ge=1, le=20)
    db_max_overflow: int = Field(5, ge=0, le=20)
    api_public_url: str = 'http://127.0.0.1:8000'
    api_content_token: SecretStr
    admin_session_secret: SecretStr
    admin_session_ttl_seconds: int = Field(28800, ge=300, le=604800)
    admin_cookie_name: str = 'jelajah_session'
    admin_cookie_secure: bool = False
    admin_allowed_origins: list[str] = ['http://127.0.0.1:8000']
    cors_allowed_origins: list[str] = []
    media_allowed_hosts: list[str] = ['res.cloudinary.com']
    gemini_model: str = ''
    gemini_api_key: SecretStr = SecretStr('')
    ai_enabled: bool = False
    ai_mock_mode: bool = False
    ai_daily_limit: int = Field(20, ge=1, le=20)
    ai_max_input_tokens: int = Field(2000, ge=1, le=2000)
    ai_max_output_tokens: int = Field(500, ge=1, le=500)
    ai_timeout_ms: int = Field(30000, ge=1000, le=30000)
    ai_cache_ttl_days: int = Field(7, ge=1, le=7)
    ai_prompt_version: str = 'editorial-metadata-v1'
    # Claim review returns quoted sentences, so it needs more output room than the metadata call.
    ai_review_max_output_tokens: int = Field(1024, ge=1, le=1024)
    ai_review_prompt_version: str = 'editorial-review-v1'
    mcp_enabled: bool = True
    mcp_api_key: SecretStr = SecretStr('')
    mcp_allowed_hosts: list[str] = ['127.0.0.1:8000', 'localhost:8000']
    cloudinary_api_key: SecretStr = SecretStr('')
    cloudinary_api_secret: SecretStr = SecretStr('')
    cloudinary_cloud_name: str = ''
    cloudinary_folder: str = 'jelajah-lokal'

    @model_validator(mode='after')
    def validate_environment(self):
        if not self.database_url.get_secret_value().startswith(('postgresql://', 'postgresql+asyncpg://', 'postgres://')):
            raise ValueError('DATABASE_URL must be PostgreSQL')
        for origin in [self.api_public_url, *self.admin_allowed_origins, *self.cors_allowed_origins]:
            parsed = urlsplit(origin)
            if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
                raise ValueError('Origins must be explicit HTTP(S) origins')
        for secret in (self.api_content_token, self.admin_session_secret):
            if len(secret.get_secret_value()) < 32:
                raise ValueError('Application secrets must have at least 32 characters')
        if self.mcp_enabled and len(self.mcp_api_key.get_secret_value()) < 32:
            raise ValueError('MCP_API_KEY required')
        if self.ai_mock_mode:
            raise ValueError('Runtime mock providers are not supported; tests inject isolated doubles')
        if self.cloudinary_folder != 'jelajah-lokal':
            raise ValueError('Cloudinary namespace must be jelajah-lokal')
        if self.environment in ('production', 'staging'):
            if not self.admin_cookie_secure or any(not x.startswith('https://') for x in self.admin_allowed_origins):
                raise ValueError('Deployed admin requires HTTPS and Secure cookies')
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
