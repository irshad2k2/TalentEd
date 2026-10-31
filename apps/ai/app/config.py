"""Settings read from environment variables (same .env as the API)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017/talented"
    internal_api_key: str = "change-me-internal-key-shared-by-api-and-ai"

    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Any OpenAI-compatible endpoint. Empty key = no LLM, extractive fallback.
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    # Retrieval tuning
    top_k: int = 4
    # Cosine similarity below this = "not in the course". bge-small scores unrelated text around 0.4-0.5.
    min_score: float = 0.55
    chunk_chars: int = 800
    chunk_overlap: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()
