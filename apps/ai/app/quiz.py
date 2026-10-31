"""
Quiz generation from a lesson.

With an LLM: ask for strict JSON, then validate every question with Pydantic and drop bad ones.
Without an LLM: build fill-in-the-blank questions from the lesson's own sentences, so the feature
still works offline (simpler questions, but correct by construction).
"""
from __future__ import annotations

import logging
import random
import re

from pydantic import BaseModel, Field, ValidationError, field_validator

from .llm import LLM, parse_json_object

log = logging.getLogger("ai.quiz")


class Question(BaseModel):
    question: str = Field(min_length=3)
    options: list[str] = Field(min_length=4, max_length=4)
    answerIndex: int = Field(ge=0, le=3)
    explanation: str | None = None

    @field_validator("options")
    @classmethod
    def distinct(cls, v: list[str]) -> list[str]:
        if len({o.strip().lower() for o in v}) != 4:
            raise ValueError("options must be distinct")
        return [o.strip() for o in v]


PROMPT = """Write {count} multiple-choice questions that test understanding of the lesson below.
Return ONLY a JSON object of this shape:
{{"questions": [{{"question": "...", "options": ["A", "B", "C", "D"], "answerIndex": 0, "explanation": "..."}}]}}
Rules: exactly 4 distinct options; one correct answer; answerIndex is 0-3; vary the correct position;
use only facts stated in the lesson; the explanation is one sentence.

Lesson title: {title}
Lesson:
{text}"""


def generate_with_llm(llm: LLM, title: str, text: str, count: int) -> list[Question]:
    raw = llm.chat(
        [
            {"role": "system", "content": "You write accurate quiz questions and reply with JSON only."},
            {"role": "user", "content": PROMPT.format(count=count, title=title, text=text[:12000])},
        ],
        json_mode=True,
    )
    items = parse_json_object(raw).get("questions", [])
    questions: list[Question] = []
    for item in items:
        try:
            questions.append(Question.model_validate(item))
        except ValidationError as err:
            log.info("Dropped invalid question: %s", err.errors()[0]["msg"])
    return questions[:count]


STOPWORDS = set(
    "about above after again against because before being below between could does doing during each "
    "every first from further have having here into itself just more most other over same should since "
    "some such than that their them then there these they this those through under until very what when "
    "where which while will with would your which return const value values function either without "
    "inside later often never always another other".split()
)


def _keywords(text: str) -> list[str]:
    words = re.findall(r"\b[A-Za-z][A-Za-z\-]{4,}\b", text)
    seen: dict[str, str] = {}
    for w in words:
        if w.lower() not in STOPWORDS:
            seen.setdefault(w.lower(), w)
    return list(seen.values())


def generate_extractive(title: str, text: str, count: int, seed: str) -> list[Question]:
    rng = random.Random(seed)  # same lesson -> same quiz, makes tests deterministic
    prose = re.sub(r"```.*?```", "\n", text, flags=re.DOTALL)  # drop code blocks
    prose = re.sub(r"^\s*#.*$", "", prose, flags=re.MULTILINE)  # drop heading lines
    prose = re.sub(r"[*`>]", "", prose)  # drop Markdown symbols
    parts = re.split(r"(?<=[.!?])\s+|\n\s*\n", prose)  # sentence ends AND blank lines
    sentences = [" ".join(s.split()) for s in parts if 8 <= len(s.split()) <= 40]
    pool = _keywords(prose)
    questions: list[Question] = []

    for sentence in sentences:
        candidates = [k for k in _keywords(sentence) if k in pool]
        if not candidates:
            continue
        answer = max(candidates, key=len)
        distractors = [k for k in pool if k.lower() != answer.lower() and k.lower() not in sentence.lower()]
        if len(distractors) < 3:
            continue
        options = rng.sample(distractors, 3) + [answer]
        rng.shuffle(options)
        blanked = re.sub(rf"\b{re.escape(answer)}\b", "_____", sentence, count=1)
        try:
            questions.append(
                Question(
                    question=f"Fill in the blank: {blanked}",
                    options=options,
                    answerIndex=options.index(answer),
                    explanation=f'From "{title}": {sentence}',
                )
            )
        except ValidationError:
            continue
        if len(questions) >= count:
            break
    return questions
