from __future__ import annotations

import json
import os

from pydantic_settings import BaseSettings

# Load .env into os.environ early so APP_CONFIG_SECRET_ARN (read via os.getenv
# below) works for local dev without exporting it manually.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except Exception:
    pass


class Settings(BaseSettings):
    """Application configuration loaded from environment variables.
    
    In production, sensitive values are fetched from AWS Secrets Manager.
    Locally, values are loaded from .env for convenience.
    """
    app_name: str = "Paloor"
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_dir: str = "uploads"
    upload_bucket: str = ""
    aws_region: str = "us-east-1"
    database_url: str = "postgresql://paloor_user:paloor_password@localhost:5432/paloor_db"

    # Gemini / LLM
    gemini_api_key: str = ""

    # Alpha Vantage
    alpha_vantage_api_key: str = ""

    # Email
    gmail_address: str = ""
    gmail_app_password: str = ""

    # Auth
    jwt_secret_key: str = "paloor-dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"
        extra = "ignore"


def _load_from_secrets_manager() -> dict:
    """Load config overrides from AWS Secrets Manager when APP_CONFIG_SECRET_ARN is set."""
    secret_arn = os.getenv("APP_CONFIG_SECRET_ARN")
    if not secret_arn:
        return {}
    try:
        import boto3
        client = boto3.client("secretsmanager", region_name="us-east-1")
        response = client.get_secret_value(SecretId=secret_arn)
        return json.loads(response.get("SecretString", "{}"))
    except Exception as e:
        print(f"[config] Warning: could not load Secrets Manager ({secret_arn}): {e}")
        return {}


settings = Settings()

# On AWS (APP_CONFIG_SECRET_ARN is set), override sensitive values from Secrets Manager.
# Local dev uses .env as usual — nothing changes.
_aws_secrets = _load_from_secrets_manager()
if _aws_secrets:
    _OVERRIDES = (
        "ALPHA_VANTAGE_API_KEY",
        "JWT_SECRET_KEY",
        "GEMINI_API_KEY",
        "GMAIL_ADDRESS",
        "GMAIL_APP_PASSWORD",
        "DATABASE_URL",
        "UPLOAD_BUCKET",
        "AWS_REGION",
    )
    for _key in _OVERRIDES:
        if _key in _aws_secrets and _aws_secrets[_key]:
            setattr(settings, _key.lower(), _aws_secrets[_key])
