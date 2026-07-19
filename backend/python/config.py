"""
Centralized application configuration.

All settings flow from environment variables (loaded from .env).
No magic strings scattered across files.
"""

from pydantic_settings import BaseSettings
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory
_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

# Auto-load root .env if it exists to retrieve Authorization DATABASE_URL
_root_env_path = Path(__file__).parent.parent.parent / ".env"
if _root_env_path.exists():
    from dotenv import dotenv_values
    _root_env = dotenv_values(_root_env_path)
    if "DATABASE_URL" in _root_env:
        import os
        os.environ.setdefault("AUTH_DATABASE_URL", _root_env["DATABASE_URL"])


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Ollama / LLM
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3:8b"

    # Application
    app_env: str = "development"
    app_port: int = 8000

    # Database
    database_url: str = "postgresql://postgres:[YOUR-PASSWORD]@db.elvwfsventokcoetasut.supabase.co:5432/postgres"
    auth_database_url: str = "postgresql://postgres:[YOUR-PASSWORD]@db.zhqzhyzxfewkkfsjevmq.supabase.co:5432/postgres"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Singleton instance — import this everywhere
settings = Settings()
