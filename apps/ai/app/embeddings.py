"""
Embeddings turn text into vectors where similar MEANING = nearby vectors.
"how do I wait for a fetch to finish" lands near a chunk about async/await even with no shared words.

FastEmbedEmbedder runs BAAI/bge-small-en-v1.5 locally on CPU (ONNX, ~130 MB, 384 dimensions):
no API key, no per-request cost. HashEmbedder is a tiny deterministic stand-in used in tests.
"""
from __future__ import annotations

import hashlib
import re
from typing import Protocol

import numpy as np


class Embedder(Protocol):
    def embed_passages(self, texts: list[str]) -> np.ndarray: ...
    def embed_query(self, text: str) -> np.ndarray: ...


def _normalize(m: np.ndarray) -> np.ndarray:
    """Unit-length rows, so a dot product IS cosine similarity."""
    norms = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.clip(norms, 1e-12, None)


class FastEmbedEmbedder:
    def __init__(self, model_name: str):
        from fastembed import TextEmbedding  # imported lazily: heavy, and tests don't need it

        self._model = TextEmbedding(model_name)

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return _normalize(np.array(list(self._model.passage_embed(texts)), dtype=np.float32))

    def embed_query(self, text: str) -> np.ndarray:
        # bge models expect queries and passages to be embedded slightly differently
        return _normalize(np.array(list(self._model.query_embed([text]))[0], dtype=np.float32))


class HashEmbedder:
    """Bag-of-words hashed into a fixed-size vector. Keyword overlap only - for tests."""

    def __init__(self, dims: int = 256):
        self.dims = dims

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(self.dims, dtype=np.float32)
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            v[int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dims] += 1.0
        return v

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return _normalize(np.stack([self._vec(t) for t in texts]))

    def embed_query(self, text: str) -> np.ndarray:
        return _normalize(self._vec(text))
