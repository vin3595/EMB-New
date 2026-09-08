from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "easemybill"

    anthropic_api_key: str = ""
    ocr_model_id: str = ""

    emergent_llm_key: str = ""
    emergent_auth_base: str = "https://demobackend.emergentagent.com/auth/v1"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    session_ttl_days: int = 7

    cors_origins: str = "http://localhost:3000"
    admin_emails: str = ""

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = ""
    msg91_auth_key: str = ""
    msg91_sender_id: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
