# ADR 0003: Course-scoped RAG tutor in a separate Python service

**Status:** Accepted

## Context
Students should be able to ask questions about a course and get answers that match what the educator taught, not generic internet answers. Educators edit lessons often.

## Decision
- Retrieval-Augmented Generation: lessons are chunked (~800 characters, 120 overlap), embedded locally with `BAAI/bge-small-en-v1.5` (FastEmbed/ONNX, CPU, free), and stored in MongoDB. A question is embedded, the closest chunks **from that course only** are retrieved, and an LLM answers from them with numbered citations.
- Below a similarity threshold the tutor says it could not find the answer instead of guessing.
- Any OpenAI-compatible provider works (OpenAI, Groq, Gemini, Ollama). With no key, the service returns the best-matching passage (extractive mode), so the feature still works offline.
- The AI code runs in a separate FastAPI service: the Python ML ecosystem, independent scaling, and the Node API stays responsive. Only the API can call it (shared internal key); the API enforces enrollment before forwarding.

## Consequences
- Updating a lesson re-indexes it, so the tutor is always current with no model training.
- Vector search is brute-force cosine similarity (fine for thousands of chunks). At larger scale, switch to a vector index such as MongoDB Atlas Vector Search or pgvector.
