"""
Splits a lesson into overlapping chunks for retrieval.

Why chunk at all: an embedding is one vector for a whole piece of text. Embed a 5,000-word
lesson as one vector and the specific paragraph that answers a question gets averaged away.
Small chunks (~800 characters) keep each vector about one idea.

Why overlap: a sentence cut at a chunk boundary would lose its context. Repeating the tail of
one chunk at the start of the next keeps ideas that straddle the boundary findable.
"""
import re

CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)


def _blocks(text: str) -> list[str]:
    """Paragraphs and code blocks, keeping each fenced code block whole."""
    blocks: list[str] = []
    pos = 0
    for match in CODE_FENCE.finditer(text):
        blocks.extend(p.strip() for p in text[pos : match.start()].split("\n\n"))
        blocks.append(match.group(0).strip())
        pos = match.end()
    blocks.extend(p.strip() for p in text[pos:].split("\n\n"))
    return [b for b in blocks if b]


def chunk_text(text: str, max_chars: int = 800, overlap: int = 120) -> list[str]:
    chunks: list[str] = []
    current = ""
    for block in _blocks(text):
        if len(block) > max_chars and not block.startswith("```"):
            # A huge paragraph: hard-split it on sentence ends
            sentences = re.split(r"(?<=[.!?])\s+", block)
        else:
            sentences = [block]
        for piece in sentences:
            if current and len(current) + len(piece) + 2 > max_chars:
                chunks.append(current)
                tail = current[-overlap:] if overlap else ""
                # start the overlap at a word boundary
                current = (tail[tail.find(" ") + 1 :] if " " in tail else tail) + "\n\n" + piece
            else:
                current = f"{current}\n\n{piece}" if current else piece
    if current.strip():
        chunks.append(current)
    return [c.strip() for c in chunks]
