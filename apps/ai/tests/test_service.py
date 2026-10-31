"""
Tests run fully offline: mongomock replaces MongoDB, HashEmbedder replaces the real model,
FakeLLM replaces the provider. Run:  pytest -q
"""
import json

import mongomock
import pytest
from fastapi.testclient import TestClient

from app.chunking import chunk_text
from app.config import Settings
from app.embeddings import HashEmbedder
from app.main import create_app
from app.quiz import generate_extractive
from app.store import Store

KEY = "test-key"
HEADERS = {"X-Internal-Key": KEY}

ASYNC_LESSON = """JavaScript runs on a single thread. A Promise represents a value that will arrive later.
An async function always returns a promise, and await pauses that function until the promise settles.

To run independent requests at the same time, use Promise.all instead of awaiting them one by one."""

VARIABLES_LESSON = """Use const by default because the binding cannot be reassigned.
Use let when a value must change, such as a loop counter. Avoid var because it is function scoped and hoisted."""


class FakeLLM:
    def __init__(self):
        self.calls: list[list[dict]] = []

    def chat(self, messages, json_mode=False):
        self.calls.append(messages)
        if json_mode:
            return json.dumps(
                {
                    "questions": [
                        {"question": "What does await do?", "options": ["Pauses the async function", "Blocks the thread", "Creates a thread", "Nothing"], "answerIndex": 0, "explanation": "It pauses only that function."},
                        {"question": "Broken", "options": ["a", "a", "b", "c"], "answerIndex": 0},  # invalid: duplicate options
                    ]
                }
            )
        return "await pauses the async function until the promise settles [1]."


def make_client(llm=None):
    settings = Settings(internal_api_key=KEY, min_score=0.2)
    store = Store(mongomock.MongoClient().db)
    app = create_app(settings=settings, store=store, embedder=HashEmbedder(), llm=llm, use_llm=llm is not None)
    return TestClient(app)


def index(client, course="c1", lesson="l1", title="Async JavaScript", content=ASYNC_LESSON):
    r = client.post("/index", headers=HEADERS, json={"courseId": course, "lessonId": lesson, "title": title, "content": content})
    assert r.status_code == 200
    return r.json()


def test_rejects_missing_internal_key():
    with make_client() as client:
        assert client.post("/search", json={"query": "promise"}).status_code == 401


def test_chunking_keeps_code_blocks_whole_and_overlaps():
    text = "intro paragraph " * 60 + "\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\n" + "outro " * 50
    chunks = chunk_text(text, max_chars=400, overlap=50)
    assert len(chunks) > 1
    assert any("const a = 1;\nconst b = 2;" in c for c in chunks)


def test_index_is_idempotent_per_lesson():
    with make_client() as client:
        first = index(client)["chunks"]
        second = index(client)["chunks"]
        assert first == second  # re-indexing replaces, never duplicates


def test_ask_with_llm_returns_citations_scoped_to_course():
    llm = FakeLLM()
    with make_client(llm) as client:
        index(client, course="c1", lesson="l1")
        index(client, course="c2", lesson="l2", title="Variables", content=VARIABLES_LESSON)

        r = client.post("/ask", headers=HEADERS, json={"courseId": "c1", "userId": "u1", "question": "what does await do with a promise"})
        body = r.json()
        assert r.status_code == 200
        assert body["mode"] == "llm"
        assert body["citations"] and all(c["lessonId"] == "l1" for c in body["citations"])
        # the retrieved course text was put in the prompt
        assert "Promise" in llm.calls[-1][-1]["content"]


def test_follow_up_questions_include_chat_history():
    llm = FakeLLM()
    with make_client(llm) as client:
        index(client)
        first = client.post("/ask", headers=HEADERS, json={"courseId": "c1", "userId": "u1", "question": "what is a promise in async javascript"}).json()
        client.post("/ask", headers=HEADERS, json={"courseId": "c1", "userId": "u1", "question": "and what does await do to the promise", "sessionId": first["sessionId"]})
        roles = [m["role"] for m in llm.calls[-1]]
        assert roles[:3] == ["system", "user", "assistant"]  # previous turn replayed


def test_ask_without_llm_falls_back_to_extractive():
    with make_client(llm=None) as client:
        index(client)
        body = client.post("/ask", headers=HEADERS, json={"courseId": "c1", "userId": "u1", "question": "promise await async"}).json()
        assert body["mode"] == "extractive"
        assert "Async JavaScript" in body["answer"]


def test_unrelated_question_is_refused():
    with make_client(FakeLLM()) as client:
        index(client)
        body = client.post("/ask", headers=HEADERS, json={"courseId": "c1", "userId": "u1", "question": "best biryani recipe hyderabad"}).json()
        assert body["citations"] == []
        assert "couldn't find" in body["answer"]


def test_semantic_search_returns_one_hit_per_lesson():
    with make_client() as client:
        index(client, course="c1", lesson="l1")
        index(client, course="c2", lesson="l2", title="Variables", content=VARIABLES_LESSON)
        hits = client.post("/search", headers=HEADERS, json={"query": "const let var reassigned"}).json()["hits"]
        assert hits[0]["lessonId"] == "l2"
        assert len({h["lessonId"] for h in hits}) == len(hits)


def test_quiz_with_llm_drops_invalid_questions():
    with make_client(FakeLLM()) as client:
        index(client)
        body = client.post("/quiz", headers=HEADERS, json={"courseId": "c1", "lessonId": "l1", "count": 5}).json()
        assert body["mode"] == "llm"
        assert len(body["questions"]) == 1  # the duplicate-option question was rejected


def test_extractive_quiz_is_well_formed():
    questions = generate_extractive("Async", ASYNC_LESSON + " " + VARIABLES_LESSON, 3, seed="l1")
    assert questions
    for q in questions:
        assert len(set(q.options)) == 4
        assert "_____" in q.question


@pytest.mark.parametrize("path", ["/index/lessons/l1", "/index/courses/c1"])
def test_delete_endpoints(path):
    with make_client() as client:
        index(client)
        assert client.delete(path, headers=HEADERS).json()["deleted"] >= 1


MARKDOWN_LESSON = """# Asynchronous JavaScript

JavaScript runs on a single thread. A Promise represents the value that will arrive later from the network.
A promise is pending, then either fulfilled with a value or rejected with an error.

```js
async function loadUser(id) {
  const res = await fetch('/api/users/' + id);
  console.error('this code must never appear in a question');
}
```

To run independent requests at the same time, use Promise.all instead of awaiting them one after another."""


def test_offline_quiz_ignores_headings_and_code():
    with make_client(llm=None) as client:
        index(client, title="Async JavaScript", content="\n\n".join([MARKDOWN_LESSON] * 3))  # long enough to need several chunks
        questions = client.post("/quiz", headers=HEADERS, json={"courseId": "c1", "lessonId": "l1", "count": 5}).json()["questions"]
        assert questions
        for q in questions:
            assert "#" not in q["question"] and "```" not in q["question"] and "console" not in q["question"]
            assert "\n" not in q["question"]
