"""
MongoDB storage for lesson chunks (with their vectors) and tutor chat history.

Vector search here is "brute force": load the candidate vectors, one matrix multiply, take the
top k. For a course (tens to hundreds of chunks) that is a few milliseconds. At millions of chunks
you would switch to a vector index (MongoDB Atlas Vector Search, pgvector, Qdrant) - same idea,
approximate nearest-neighbour search instead of checking every vector.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
from pymongo import ASCENDING
from pymongo.database import Database


@dataclass
class Hit:
    course_id: str
    lesson_id: str
    lesson_title: str
    text: str
    score: float


class Store:
    def __init__(self, db: Database):
        self.chunks = db["chunks"]
        self.chats = db["chats"]
        self.lessons = db["lessons"]  # original lesson text, used for quiz generation

    def ensure_indexes(self) -> None:
        self.chunks.create_index([("courseId", ASCENDING)])
        self.chunks.create_index([("lessonId", ASCENDING), ("position", ASCENDING)])
        self.chats.create_index([("sessionId", ASCENDING)], unique=True)
        self.lessons.create_index([("lessonId", ASCENDING)], unique=True)

    # ---------- chunks ----------
    def replace_lesson(
        self, course_id: str, lesson_id: str, title: str, content: str, texts: list[str], vectors: np.ndarray
    ) -> int:
        """Re-indexing a lesson = delete its old chunks, insert the new ones, keep its original text."""
        self.lessons.update_one(
            {"lessonId": lesson_id},
            {"$set": {"courseId": course_id, "title": title, "content": content}},
            upsert=True,
        )
        self.chunks.delete_many({"lessonId": lesson_id})
        docs = [
            {
                "courseId": course_id,
                "lessonId": lesson_id,
                "lessonTitle": title,
                "position": i,
                "text": text,
                "embedding": vec.astype(float).tolist(),
            }
            for i, (text, vec) in enumerate(zip(texts, vectors))
        ]
        if docs:
            self.chunks.insert_many(docs)
        return len(docs)

    def delete_lesson(self, lesson_id: str) -> int:
        self.lessons.delete_one({"lessonId": lesson_id})
        return self.chunks.delete_many({"lessonId": lesson_id}).deleted_count

    def delete_course(self, course_id: str) -> int:
        self.chats.delete_many({"courseId": course_id})
        self.lessons.delete_many({"courseId": course_id})
        return self.chunks.delete_many({"courseId": course_id}).deleted_count

    def lesson_text(self, lesson_id: str) -> tuple[str, str]:
        """(title, original text) of a lesson. Not rebuilt from chunks: their overlaps would repeat text."""
        doc = self.lessons.find_one({"lessonId": lesson_id})
        return (doc["title"], doc["content"]) if doc else ("", "")

    def search(self, query_vec: np.ndarray, course_id: str | None = None, k: int = 4) -> list[Hit]:
        filt = {"courseId": course_id} if course_id else {}
        docs = list(self.chunks.find(filt, {"_id": 0}))
        if not docs:
            return []
        matrix = np.array([d["embedding"] for d in docs], dtype=np.float32)
        scores = matrix @ query_vec  # cosine similarity, vectors are unit length
        order = np.argsort(-scores)[:k]
        return [
            Hit(
                course_id=docs[i]["courseId"],
                lesson_id=docs[i]["lessonId"],
                lesson_title=docs[i]["lessonTitle"],
                text=docs[i]["text"],
                score=float(scores[i]),
            )
            for i in order
        ]

    # ---------- chat history ----------
    def history(self, session_id: str, user_id: str, course_id: str, limit: int = 6) -> list[dict]:
        chat = self.chats.find_one({"sessionId": session_id, "userId": user_id, "courseId": course_id})
        return chat["messages"][-limit:] if chat else []

    def append_turn(self, session_id: str, user_id: str, course_id: str, question: str, answer: str) -> None:
        now = datetime.now(timezone.utc)
        self.chats.update_one(
            {"sessionId": session_id, "userId": user_id, "courseId": course_id},
            {
                "$push": {
                    "messages": {
                        "$each": [
                            {"role": "user", "content": question, "at": now},
                            {"role": "assistant", "content": answer, "at": now},
                        ],
                        "$slice": -40,  # keep the last 20 exchanges
                    }
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
