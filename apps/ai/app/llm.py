"""
Thin wrapper over any OpenAI-compatible chat API (OpenAI, Groq, Gemini's compatible endpoint,
Ollama running locally...). Switching provider = changing LLM_BASE_URL / LLM_MODEL / LLM_API_KEY.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Protocol

log = logging.getLogger("ai.llm")


class LLM(Protocol):
    def chat(self, messages: list[dict], json_mode: bool = False) -> str: ...


class OpenAICompatibleLLM:
    def __init__(self, base_url: str, api_key: str, model: str):
        from openai import OpenAI

        self._client = OpenAI(base_url=base_url, api_key=api_key, timeout=60, max_retries=2)
        self._model = model

    def chat(self, messages: list[dict], json_mode: bool = False) -> str:
        kwargs: dict = {"model": self._model, "messages": messages, "temperature": 0.2}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""


def parse_json_object(text: str) -> dict:
    """Models sometimes wrap JSON in ``` fences or add a sentence. Take the outermost {...}."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object in model output")
    return json.loads(match.group(0))
