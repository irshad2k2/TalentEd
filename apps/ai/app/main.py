"""
TalentEd AI service (FastAPI).

Internal only: the Node API is the only caller, authenticated with the X-Internal-Key header.
Endpoints:
  POST   /index                     chunk + embed + store a lesson
  DELETE /index/lessons/{id}        remove a lesson's chunks
  DELETE /index/courses/{id}        remove a course's chunks and chats
  POST   /ask                       RAG tutor answer with citations
  POST   /search                    semantic search across all courses
  POST   /quiz                      generate multiple-choice questions for a lesson
"""
from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import MongoClient

from . import quiz as quiz_mod
from . import rag
from .chunking import chunk_text
from .config import Settings, get_settings
from .embeddings import Embedder, FastEmbedEmbedder
from .llm import LLM, OpenAICompatibleLLM
from .store import Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")


# ---------- request / response models (validation + OpenAPI docs at /docs for free) ----------
class IndexRequest(BaseModel):
    courseId: str = Field(min_length=1, max_length=64)
    lessonId: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)


class AskRequest(BaseModel):
    courseId: str = Field(min_length=1, max_length=64)
    userId: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=3, max_length=1000)
    sessionId: str | None = Field(default=None, max_length=64)


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=10, ge=1, le=50)


class QuizRequest(BaseModel):
    courseId: str
    lessonId: str
    count: int = Field(default=5, ge=1, le=10)


def create_app(
    settings: Settings | None = None,
    store: Store | None = None,
    embedder: Embedder | None = None,
    llm: LLM | None = None,
    use_llm: bool | None = None,
) -> FastAPI:
    """Factory: production builds real dependencies; tests pass fakes in."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if store is None:
            db = MongoClient(settings.mongo_url).get_default_database()
            app.state.store = Store(db)
        else:
            app.state.store = store
        app.state.store.ensure_indexes()

        if embedder is None:
            log.info("Loading embedding model %s (first run downloads it)", settings.embedding_model)
            app.state.embedder = FastEmbedEmbedder(settings.embedding_model)
        else:
            app.state.embedder = embedder

        llm_enabled = use_llm if use_llm is not None else bool(settings.llm_api_key)
        if llm is not None:
            app.state.llm = llm
        elif llm_enabled:
            app.state.llm = OpenAICompatibleLLM(settings.llm_base_url, settings.llm_api_key, settings.llm_model)
        else:
            app.state.llm = None
        log.info("AI service ready (LLM: %s)", "on" if app.state.llm else "off, extractive mode")
        yield

    app = FastAPI(title="TalentEd AI", version="1.0.0", lifespan=lifespan)

    def require_internal_key(x_internal_key: str = Header(default="")) -> None:
        # compare_digest = constant-time comparison
        if not secrets.compare_digest(x_internal_key, settings.internal_api_key):
            raise HTTPException(status_code=401, detail="Invalid internal key")

    guarded = [Depends(require_internal_key)]

    @app.get("/health")
    def health(request: Request):
        return {"status": "ok", "llm": request.app.state.llm is not None}

    @app.post("/index", dependencies=guarded)
    def index_lesson(body: IndexRequest, request: Request):
        st: Store = request.app.state.store
        texts = chunk_text(f"# {body.title}\n\n{body.content}", settings.chunk_chars, settings.chunk_overlap)
        vectors = request.app.state.embedder.embed_passages(texts)
        count = st.replace_lesson(body.courseId, body.lessonId, body.title, body.content, texts, vectors)
        return {"chunks": count}

    @app.delete("/index/lessons/{lesson_id}", dependencies=guarded)
    def delete_lesson(lesson_id: str, request: Request):
        return {"deleted": request.app.state.store.delete_lesson(lesson_id)}

    @app.delete("/index/courses/{course_id}", dependencies=guarded)
    def delete_course(course_id: str, request: Request):
        return {"deleted": request.app.state.store.delete_course(course_id)}

    @app.post("/ask", dependencies=guarded)
    def ask(body: AskRequest, request: Request):
        result = rag.ask(
            store=request.app.state.store,
            embedder=request.app.state.embedder,
            llm=request.app.state.llm,
            course_id=body.courseId,
            user_id=body.userId,
            question=body.question,
            session_id=body.sessionId,
            top_k=settings.top_k,
            min_score=settings.min_score,
        )
        return {
            "answer": result.answer,
            "sessionId": result.session_id,
            "mode": result.mode,
            "citations": [
                {"lessonId": h.lesson_id, "lessonTitle": h.lesson_title, "snippet": h.text[:300], "score": round(h.score, 3)}
                for h in result.citations
            ],
        }

    @app.post("/search", dependencies=guarded)
    def search(body: SearchRequest, request: Request):
        st: Store = request.app.state.store
        hits = st.search(request.app.state.embedder.embed_query(body.query), k=body.limit * 3)
        # one result per lesson, best chunk wins
        seen: set[str] = set()
        results = []
        for h in hits:
            if h.lesson_id in seen or h.score < settings.min_score - 0.1:
                continue
            seen.add(h.lesson_id)
            results.append(
                {"courseId": h.course_id, "lessonId": h.lesson_id, "lessonTitle": h.lesson_title, "snippet": h.text[:200], "score": round(h.score, 3)}
            )
        return {"hits": results[: body.limit]}

    @app.post("/quiz", dependencies=guarded)
    def generate_quiz(body: QuizRequest, request: Request):
        title, text = request.app.state.store.lesson_text(body.lessonId)
        if not text:
            raise HTTPException(status_code=404, detail="Lesson is not indexed yet")
        llm_client = request.app.state.llm
        questions: list[quiz_mod.Question] = []
        mode = "extractive"
        if llm_client is not None:
            try:
                questions = quiz_mod.generate_with_llm(llm_client, title, text, body.count)
                mode = "llm"
            except Exception:
                log.exception("LLM quiz generation failed, using extractive fallback")
        if not questions:
            questions = quiz_mod.generate_extractive(title, text, body.count, seed=body.lessonId)
            mode = "extractive"
        return {"questions": [q.model_dump() for q in questions], "mode": mode}

    return app


app = create_app()
