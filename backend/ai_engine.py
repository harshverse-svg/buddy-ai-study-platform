"""
BUDDY - Single-Model (gemma4:e4b) Async Intelligence Pipeline
Priority GPU Lock, BM25 RAG, Book Generation, Quiz, Concept Map.
"""
import re
import json
import asyncio
import logging
import time
from typing import List, Optional, AsyncGenerator
from rank_bm25 import BM25Plus, BM25Okapi
import ollama as ollama_client

from config import (
    MODEL_NAME, OLLAMA_KEEP_ALIVE, OLLAMA_NUM_CTX, BM25_TOP_K, RERANK_TOP_K,
    BOOK_MIN_CHAPTERS, BOOK_MAX_CHAPTERS, THINKING_DURATION_SECONDS,
    CONCEPT_MAP_MIN_NODES, CONCEPT_MAP_MAX_NODES
)

logger = logging.getLogger("buddy.ai")

# ─── Defensive JSON Parser ────────────────────────────────────────────────────
def extract_clean_json(raw_text: str) -> Optional[any]:
    """
    Extract JSON from LLM output that may be wrapped in markdown backticks.
    Handles: ```json ... ```, trailing commas, and other common LLM issues.
    """
    if not raw_text:
        return None

    # Strip markdown code fences
    cleaned = re.sub(r'```(?:json)?\s*', '', raw_text)
    cleaned = re.sub(r'```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find JSON array or object
    for pattern in [
        r'(\[[\s\S]*\])',   # JSON array
        r'(\{[\s\S]*\})',   # JSON object
    ]:
        match = re.search(pattern, cleaned)
        if match:
            candidate = match.group(1)
            # Fix trailing commas before ] or }
            candidate = re.sub(r',\s*([}\]])', r'\1', candidate)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    logger.warning(f"Failed to parse JSON from LLM output: {raw_text[:200]}")
    return None


# ─── Priority GPU Lock Manager ────────────────────────────────────────────────
class PriorityOllamaLock:
    """
    Manages access to the single gemma4:e4b model.
    HIGH_PRIORITY: Chat, Quiz, Concept Map (interactive)
    LOW_PRIORITY: Background Book Generation
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        self._high_priority_waiting = 0
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused by default

    async def acquire_high(self):
        """Acquire lock for high-priority (interactive) requests."""
        self._high_priority_waiting += 1
        self._pause_event.clear()  # Signal book worker to pause
        await self._lock.acquire()

    def release_high(self):
        """Release high-priority lock."""
        self._high_priority_waiting -= 1
        if self._high_priority_waiting <= 0:
            self._high_priority_waiting = 0
            self._pause_event.set()  # Allow book worker to resume
        self._lock.release()

    async def acquire_low(self):
        """Acquire lock for low-priority (background) requests."""
        await self._pause_event.wait()  # Wait if high-priority is pending
        await self._lock.acquire()

    def release_low(self):
        """Release low-priority lock."""
        self._lock.release()

    @property
    def should_pause(self):
        return self._high_priority_waiting > 0


gpu_lock = PriorityOllamaLock()


# ─── Ollama Helper ────────────────────────────────────────────────────────────
async def _ollama_generate(prompt: str, system: str = "", temperature: float = 0.7,
                           max_tokens: int = 2048, num_ctx: int = OLLAMA_NUM_CTX) -> str:
    """Generate a response from the local LLM enforcing strict 6GB VRAM context limits."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = await asyncio.to_thread(
            ollama_client.chat,
            model=MODEL_NAME,
            messages=messages,
            options={
                "temperature": temperature,
                "num_predict": min(max_tokens, 2048),
                "num_ctx": min(num_ctx, OLLAMA_NUM_CTX),
            },
            keep_alive=OLLAMA_KEEP_ALIVE
        )
        msg = response.get("message", {}) if isinstance(response, dict) else getattr(response, "message", None)
        content = getattr(msg, "content", "") if hasattr(msg, "content") else (msg.get("content", "") if isinstance(msg, dict) else "")
        if not content:
            thinking = getattr(msg, "thinking", "") if hasattr(msg, "thinking") else (msg.get("thinking", "") if isinstance(msg, dict) else "")
            if thinking:
                content = thinking
        return content
    except Exception as e:
        logger.error(f"Ollama generation error: {e}")
        return f"[AI temporarily unavailable: {e}]"


async def _ollama_stream(prompt: str, system: str = "",
                         temperature: float = 0.7,
                         num_predict: int = 1000,
                         num_ctx: int = OLLAMA_NUM_CTX) -> AsyncGenerator[str, None]:
    """Stream a response from the local LLM token by token with strict 6GB VRAM options."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        def _stream_sync():
            return ollama_client.chat(
                model=MODEL_NAME,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_predict": num_predict,
                    "num_ctx": min(num_ctx, OLLAMA_NUM_CTX),
                },
                keep_alive=OLLAMA_KEEP_ALIVE,
                stream=True
            )

        stream = await asyncio.to_thread(_stream_sync)
        thinking_tokens = []
        has_content = False
        for chunk in stream:
            msg = chunk.get("message", {}) if isinstance(chunk, dict) else getattr(chunk, "message", None)
            token = getattr(msg, "content", "") if hasattr(msg, "content") else (msg.get("content", "") if isinstance(msg, dict) else "")
            thinking_token = getattr(msg, "thinking", "") if hasattr(msg, "thinking") else (msg.get("thinking", "") if isinstance(msg, dict) else "")

            if token:
                has_content = True
                yield token
            elif thinking_token:
                thinking_tokens.append(thinking_token)

        # Fallback: if model only produced reasoning tokens, yield the reasoning text
        if not has_content and thinking_tokens:
            fallback = "".join(thinking_tokens).strip()
            if fallback:
                yield fallback
    except Exception as e:
        logger.error(f"Ollama streaming error: {e}")
        yield f"\n\n[AI temporarily unavailable: {e}]"


# ─── In-Memory BM25 Index Cache ──────────────────────────────────────────────
# Maps session_id -> {"chunks": List[dict], "bm25": BM25Plus}
_SESSION_BM25_CACHE = {}


def tokenize_words(text: str) -> List[str]:
    """Extract alphanumeric words in lowercase, stripping punctuation."""
    return re.findall(r'\b\w+\b', text.lower())


def get_cached_session_bm25(session_id: int, chunks: Optional[List[dict]] = None):
    """
    Get or create an in-memory BM25 index for the session.
    Avoids re-reading disk files and re-tokenizing on every question.
    """
    if session_id and session_id in _SESSION_BM25_CACHE and _SESSION_BM25_CACHE[session_id].get("bm25") is not None:
        return _SESSION_BM25_CACHE[session_id]

    if chunks is None:
        return None

    if not chunks:
        _SESSION_BM25_CACHE[session_id] = {"chunks": [], "bm25": None}
        return _SESSION_BM25_CACHE[session_id]

    tokenized_corpus = [tokenize_words(chunk["text"]) for chunk in chunks]
    bm25 = BM25Plus(tokenized_corpus)
    _SESSION_BM25_CACHE[session_id] = {
        "chunks": chunks,
        "bm25": bm25
    }
    logger.info(f"Built and cached in-memory BM25 index for session {session_id} ({len(chunks)} chunks)")
    return _SESSION_BM25_CACHE[session_id]


def invalidate_session_bm25_cache(session_id: Optional[int] = None):
    """Invalidate cached BM25 index when a document is uploaded or deleted."""
    if session_id is None:
        _SESSION_BM25_CACHE.clear()
        logger.info("Cleared all session BM25 caches")
    elif session_id in _SESSION_BM25_CACHE:
        del _SESSION_BM25_CACHE[session_id]
        logger.info(f"Invalidated in-memory BM25 cache for session {session_id}")


def search_cached_bm25(query: str, session_id: int, chunks: List[dict], top_k: int = 3) -> List[dict]:
    """Ultra-fast CPU lexical search across cached BM25 index, returns top_k chunks directly."""
    if not chunks:
        return []

    cache = get_cached_session_bm25(session_id, chunks)
    bm25 = cache.get("bm25") if cache else None
    if not bm25:
        return chunks[:top_k]

    tokenized_query = tokenize_words(query)
    if not tokenized_query:
        return chunks[:top_k]

    scores = bm25.get_scores(tokenized_query)
    ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
    matched = [chunks[i] for i in ranked_indices if scores[i] > 0]
    if not matched:
        return chunks[:top_k]
    return matched[:top_k]


def bm25_search(query: str, chunks: List[dict], top_k: int = BM25_TOP_K) -> List[dict]:
    """Fallback CPU lexical search across document chunks using BM25Plus."""
    if not chunks:
        return []

    tokenized_corpus = [tokenize_words(chunk["text"]) for chunk in chunks]
    bm25 = BM25Plus(tokenized_corpus)
    tokenized_query = tokenize_words(query)
    if not tokenized_query:
        return chunks[:top_k]

    scores = bm25.get_scores(tokenized_query)
    ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
    matched = [chunks[i] for i in ranked_indices if scores[i] > 0]
    return matched if matched else chunks[:top_k]


def multi_query_bm25(sub_queries: List[str], chunks: List[dict],
                     top_k: int = BM25_TOP_K) -> List[dict]:
    """Run BM25 for each sub-query and return deduplicated top results."""
    if not chunks:
        return []
    seen_texts = set()
    results = []
    for sq in sub_queries:
        for chunk in bm25_search(sq, chunks, top_k):
            key = (chunk.get("source", ""), chunk.get("chunk_index", 0), chunk["text"][:100])
            if key not in seen_texts:
                seen_texts.add(key)
                results.append(chunk)

    if not results and chunks:
        results = chunks[:top_k]

    return results[:top_k]


# ─── 1. Streamlined Chat Q&A Pipeline ─────────────────────────────────────────
async def decompose_query(question: str) -> List[str]:
    """Atomic sub-queries helper (used when full query expansion is explicitly requested)."""
    word_count = len(question.split())
    if word_count < 15:
        return [question]

    prompt = f"""Break this student question into 2-4 clear, atomic sub-questions.
Return ONLY a JSON array of strings, nothing else.

Question: {question}

Example output: ["What is X?", "How does X relate to Y?"]"""

    result = await _ollama_generate(prompt, temperature=0.3, max_tokens=512)
    parsed = extract_clean_json(result)
    if isinstance(parsed, list) and len(parsed) > 0:
        return [str(q) for q in parsed[:4]]
    return [question]


async def rerank_chunks(question: str, chunks: List[dict]) -> List[dict]:
    """Helper for reranking when needed (bypassed in standard chat Q&A for speed)."""
    if len(chunks) <= RERANK_TOP_K:
        return chunks

    chunk_descriptions = "\n".join([
        f"[{i}] {chunk['text'][:300]}..." for i, chunk in enumerate(chunks)
    ])

    prompt = f"""You are a search relevance judge. Given a student's question and candidate text chunks,
return ONLY a JSON array of the {RERANK_TOP_K} most relevant chunk indices (0-indexed).

Question: {question}

Candidate chunks:
{chunk_descriptions}

Return ONLY a JSON array like [2, 0, 5, 3], nothing else."""

    result = await _ollama_generate(prompt, temperature=0.1, max_tokens=256)
    parsed = extract_clean_json(result)
    if isinstance(parsed, list):
        indices = [int(i) for i in parsed if isinstance(i, (int, float)) and 0 <= int(i) < len(chunks)]
        if indices:
            return [chunks[i] for i in indices[:RERANK_TOP_K]]

    return chunks[:RERANK_TOP_K]


async def chat_qa_stream(question: str, chunks: List[dict],
                         session_messages: list = None,
                         session_id: int = 0,
                         mode: str = "concise") -> AsyncGenerator[dict, None]:
    """
    Optimized study RAG pipeline with SSE streaming.
    Bypasses extra LLM calls in Stage 1 & Stage 3 for sub-second start.
    Runs Stage 2 BM25 on CPU directly on query, takes Top 3 chunks, and executes
    a single streaming LLM call in either 'concise' or 'explain' mode.
    """
    start_time = time.time()

    await gpu_lock.acquire_high()
    try:
        # Step 1: Understanding — instant pass-through (no extra LLM call)
        yield {"type": "status", "step": "understanding", "label": "Understanding your question"}
        yield {"type": "stage", "stage": 1, "label": "Understanding your question"}
        sub_queries = [question]
        yield {"type": "sub_queries", "data": sub_queries}
        await asyncio.sleep(0.05)

        # Step 2: Searching — CPU BM25 lexical search using cached index
        yield {"type": "status", "step": "searching", "label": "Searching your notes"}
        yield {"type": "stage", "stage": 2, "label": "Searching your notes"}
        # Take Top 3 chunks directly
        top_chunks = search_cached_bm25(question, session_id, chunks, top_k=3)
        yield {"type": "candidates", "count": len(top_chunks)}
        await asyncio.sleep(0.05)

        # Step 3: Reranking — bypass LLM reranker, use top 3 directly
        reranked = top_chunks[:3]
        yield {"type": "reranked", "count": len(reranked)}

        parts_count = len(reranked)
        files_count = len(set(ch["source"] for ch in reranked)) if reranked else 0
        found_label = f"Found {parts_count} relevant parts in {files_count} files"
        yield {
            "type": "status",
            "step": "found",
            "count": parts_count,
            "files": files_count,
            "label": found_label
        }
        yield {"type": "stage", "stage": 3, "label": found_label}
        await asyncio.sleep(0.05)

        # Step 4: Putting answer together & Double-checking
        yield {"type": "status", "step": "synthesizing", "label": "Putting the answer together"}
        yield {"type": "status", "step": "checking", "label": "Double-checking"}
        yield {"type": "stage", "stage": 4, "label": "Putting the answer together"}

        if not reranked:
            yield {"type": "answer_start"}
            not_found_msg = "Hmm, I can't find that in your notes yet. Upload something about it, or switch to Ask anything for a general answer."
            yield {"type": "token", "data": not_found_msg}
            yield {
                "type": "complete",
                "thinking_time": round(time.time() - start_time, 2),
                "sources": [],
                "sub_queries": sub_queries,
                "full_answer": not_found_msg,
                "parts_count": 0,
                "files_count": 0,
                "mode": mode
            }
            return

        context = "\n\n---\n\n".join([
            f"**Source: {ch['source']}** (Chunk {ch.get('chunk_index', 0)})\n{ch['text']}"
            for ch in reranked
        ])

        # Mode-based configuration
        if mode == "explain":
            num_predict = 1400
            temperature = 0.4
            system_prompt = (
                "You are Shiksha Buddy, an expert AI study assistant. "
                "Explain the topic in full depth with a clear step-by-step breakdown, "
                "examples, and key takeaways from the study material."
            )
        else:
            # Concise mode (default)
            num_predict = 900
            temperature = 0.3
            system_prompt = (
                "Answer the user's question directly and concisely in 3 to 5 bullet points (under 120 words). "
                "Focus strictly on what was asked."
            )

        prompt = f"""Context from uploaded study materials:
{context}

Student's Question: {question}

Response:"""

        # Stream the answer with single LLM call
        yield {"type": "answer_start"}
        full_answer = ""
        async for token in _ollama_stream(
            prompt,
            system=system_prompt,
            temperature=temperature,
            num_predict=num_predict,
            num_ctx=OLLAMA_NUM_CTX
        ):
            full_answer += token
            yield {"type": "token", "data": token}

        thinking_time = time.time() - start_time
        sources = [{
            "source": ch["source"],
            "chunk_index": ch.get("chunk_index", 0),
            "file_id": ch.get("file_id"),
            "page_start": ch.get("page_start", 1),
            "page_end": ch.get("page_end", 1),
            "preview": ch["text"][:200]
        } for ch in reranked]

        yield {
            "type": "complete",
            "thinking_time": round(thinking_time, 2),
            "sources": sources,
            "sub_queries": sub_queries,
            "full_answer": full_answer,
            "parts_count": parts_count,
            "files_count": files_count,
            "mode": mode
        }
    finally:
        gpu_lock.release_high()


async def ask_qa_stream(question: str, session_messages: list = None) -> AsyncGenerator[dict, None]:
    """
    General AI tutor chat (Ask Anything board) without document retrieval.
    System prompt: friendly, accurate tutor, clear step-by-step with examples.
    """
    start_time = time.time()
    await gpu_lock.acquire_high()
    try:
        # Step 1: Understanding
        yield {"type": "status", "step": "understanding", "label": "Understanding your question"}
        await asyncio.sleep(0.2)

        # Step 2: Thinking
        yield {"type": "status", "step": "thinking", "label": "Thinking it through"}
        await asyncio.sleep(0.2)

        # Step 3: Writing
        yield {"type": "status", "step": "writing", "label": "Writing the answer"}

        system_prompt = (
            "You are Shiksha Buddy, a friendly, accurate study tutor. "
            "Answer any question clearly, step by step, with simple examples. "
            "Use markdown and LaTeX where helpful. If unsure, say so."
        )

        conv_history = []
        if session_messages:
            for msg in session_messages[-10:]:
                conv_history.append(f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '')[:600]}")

        if conv_history:
            history_text = "\n".join(conv_history)
            prompt = f"Previous discussion:\n{history_text}\n\nStudent asks: {question}\n\nHelpful, clear response:"
        else:
            prompt = f"Student asks: {question}\n\nHelpful, clear response:"

        yield {"type": "answer_start"}
        full_answer = ""
        async for token in _ollama_stream(prompt, system=system_prompt, num_predict=1100):
            full_answer += token
            yield {"type": "token", "data": token}

        thinking_time = time.time() - start_time
        yield {
            "type": "done",
            "thinking_time": round(thinking_time, 2),
            "full_answer": full_answer
        }
    finally:
        gpu_lock.release_high()


# ─── 2. Background Book Generator ────────────────────────────────────────────
async def generate_book_outline(chunks: List[dict]) -> List[dict]:
    """Phase A: Generate master book outline from document chunks."""
    # Collect headers and summaries
    headers = []
    for chunk in chunks[:20]:
        lines = chunk["text"].split("\n")
        for line in lines:
            if line.strip().startswith("#"):
                headers.append(line.strip())

    prompt = f"""You are designing a comprehensive study textbook based on uploaded materials.

Document headers found:
{chr(10).join(headers[:30]) if headers else 'No headers found - create chapters from the content.'}

Sample content (first 3 chunks):
{chr(10).join([c['text'][:200] for c in chunks[:3]])}

Design a {BOOK_MIN_CHAPTERS} to {BOOK_MAX_CHAPTERS} chapter textbook outline.
Return ONLY a JSON array of objects:
[{{"chapter_num": 1, "title": "...", "topics": ["topic1", "topic2"]}}, ...]"""

    result = await _ollama_generate(prompt, temperature=0.5, max_tokens=2048)
    parsed = extract_clean_json(result)
    if isinstance(parsed, list) and len(parsed) >= 2:
        return parsed[:BOOK_MAX_CHAPTERS]

    # Fallback: auto-generate from chunk content
    return [
        {"chapter_num": i + 1, "title": f"Chapter {i + 1}: {chunks[i * 3]['source'] if i * 3 < len(chunks) else 'Summary'}",
         "topics": ["Overview", "Key Concepts", "Examples"]}
        for i in range(min(BOOK_MIN_CHAPTERS, max(1, len(chunks) // 3)))
    ]


async def generate_chapter(chapter_info: dict, chunks: List[dict],
                           chapter_num: int) -> str:
    """Phase B: Generate a single comprehensive chapter."""
    # Find relevant chunks for this chapter
    chapter_topics = " ".join(chapter_info.get("topics", []))
    relevant = bm25_search(chapter_topics + " " + chapter_info.get("title", ""),
                           chunks, top_k=6)

    context = "\n\n".join([ch["text"] for ch in relevant]) if relevant else \
        "\n\n".join([ch["text"] for ch in chunks[:5]])

    prompt = f"""Write a comprehensive textbook chapter based on the following content.

Chapter {chapter_num}: {chapter_info.get('title', 'Untitled')}
Topics to cover: {', '.join(chapter_info.get('topics', ['General']))}

Source material:
{context}

Write a detailed chapter that includes:
1. **Core Theory & Deep Explanation** — Thorough explanation of concepts
2. **Step-by-Step Worked Examples / Analogies** — At least 1 example
3. **Key Formulas & Definitions Table** — In markdown table format
4. **Chapter Summary** — 3-5 key takeaways
5. **2 Self-Check Questions** — For student self-assessment

Format everything in clean Markdown."""

    return await _ollama_generate(prompt, temperature=0.6, max_tokens=4096)


async def book_generation_worker(session_id: int, db_session_factory):
    """
    Background worker: generates book chapters one by one.
    Automatically pauses when high-priority requests arrive.
    """
    from models import GeneratedBook
    db = db_session_factory()

    try:
        book = db.query(GeneratedBook).filter(
            GeneratedBook.session_id == session_id,
            GeneratedBook.status.in_(["GENERATING", "IDLE"])
        ).first()

        if not book:
            return

        # Load chunks
        from ingestion import get_session_chunks
        chunks = get_session_chunks(session_id, db)
        if not chunks:
            book.status = "COMPLETED"
            book.chapters_json = json.dumps([{"chapter_num": 1, "title": "No Content",
                                               "content": "No documents uploaded yet."}])
            db.commit()
            return

        # Phase A: Generate outline
        book.status = "GENERATING"
        db.commit()

        await gpu_lock.acquire_low()
        try:
            outline = await generate_book_outline(chunks)
        finally:
            gpu_lock.release_low()

        book.total_chapters = len(outline)
        chapters = json.loads(book.chapters_json) if book.chapters_json else []
        db.commit()

        # Phase B: Generate each chapter
        for i, chapter_info in enumerate(outline):
            # Check if should pause for high-priority
            if gpu_lock.should_pause:
                book.status = "PAUSED"
                db.commit()
                await gpu_lock._pause_event.wait()
                book.status = "GENERATING"
                db.commit()

            await gpu_lock.acquire_low()
            try:
                content = await generate_chapter(chapter_info, chunks, i + 1)
            finally:
                gpu_lock.release_low()

            chapters.append({
                "chapter_num": i + 1,
                "title": chapter_info.get("title", f"Chapter {i + 1}"),
                "content": content,
                "status": "COMPLETED"
            })

            book.chapters_json = json.dumps(chapters)
            book.completed_chapters = i + 1
            db.commit()

        book.status = "COMPLETED"
        db.commit()

    except Exception as e:
        logger.error(f"Book generation error: {e}")
        try:
            book.status = "IDLE"
            db.commit()
        except:
            pass
    finally:
        db.close()


# ─── 3. Concept Map Generator ────────────────────────────────────────────────
async def generate_concept_map(chunks: List[dict]) -> dict:
    """Generate a knowledge graph + 1-page cheat sheet from document chunks."""
    await gpu_lock.acquire_high()
    try:
        # Sample representative chunks
        sample_chunks = chunks[:15] if len(chunks) > 15 else chunks
        context = "\n\n---\n\n".join([ch["text"][:400] for ch in sample_chunks])

        prompt = f"""Analyze the following study material and create a knowledge graph.

Study Material:
{context}

Return ONLY a JSON object with two keys:
1. "nodes": An array of {CONCEPT_MAP_MIN_NODES} to {CONCEPT_MAP_MAX_NODES} nodes:
   [{{"id": "n1", "label": "...", "category": "Core Theme|Chapter|Sub-Concept|Formula", "summary": "2-sentence explanation", "source": "filename"}}]
2. "edges": An array of connections:
   [{{"source": "n1", "target": "n2", "label": "depends on|explains|calculates|includes|uses"}}]

Make sure every node is connected. Categories MUST be one of: Core Theme, Chapter, Sub-Concept, Formula.
Return ONLY valid JSON, no markdown."""

        result = await _ollama_generate(prompt, temperature=0.4, max_tokens=4096)
        graph = extract_clean_json(result)

        if not graph or "nodes" not in graph:
            graph = {"nodes": [], "edges": []}

        # Generate cheat sheet
        cheat_prompt = f"""Based on this study material, create a 1-page Master Revision Cheat Sheet.

{context[:2000]}

Format in clean Markdown:
# 📋 [Subject] — Master Cheat Sheet

## Key Definitions
| Term | Definition |
|------|-----------|
...

## Must-Know Formulas
- ...

## Common Exam Traps
1. ...

## Quick Summary
..."""

        cheat_sheet = await _ollama_generate(cheat_prompt, temperature=0.5, max_tokens=2048)

        return {
            "nodes": graph.get("nodes", []),
            "edges": graph.get("edges", []),
            "cheat_sheet": cheat_sheet
        }
    finally:
        gpu_lock.release_high()


# ─── 4. Quiz Generator & Grader ──────────────────────────────────────────────
async def generate_quiz(chunks: List[dict], difficulty: str = "Conceptual",
                        num_questions: int = 10, focus_topic: str = "") -> List[dict]:
    """Generate MCQ quiz strictly bound to document chunks."""
    await gpu_lock.acquire_high()
    try:
        if focus_topic:
            relevant = bm25_search(focus_topic, chunks, top_k=10) if chunks else []
        else:
            if chunks:
                step = max(1, len(chunks) // 10)
                relevant = chunks[::step][:10]
            else:
                relevant = []

        context = "\n\n".join([ch["text"][:500] for ch in relevant]) if relevant else "No context available."

        prompt = f"""You are a strict educational evaluator. Generate exactly {num_questions} multiple-choice questions at "{difficulty}" difficulty.
{f'Focus ONLY on this topic: {focus_topic}' if focus_topic else 'Cover the core concepts from the provided text.'}

STRICT RULES:
1. ALL questions MUST be based strictly and entirely on the "Study Material" provided below.
2. DO NOT hallucinate or use outside knowledge. If a topic is not in the text, do not ask about it.
3. Return ONLY a JSON array.

Study Material:
{context}

Return ONLY a JSON array:
[{{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_index": 0,
  "topic_tag": "topic name",
  "explanation": "Why this answer is correct...",
  "source_chunk": "brief quote from source"
}}]

Return ONLY valid JSON array, no markdown."""

        result = await _ollama_generate(prompt, temperature=0.3, max_tokens=4096)
        questions = extract_clean_json(result)

        if isinstance(questions, list) and len(questions) > 0:
            validated = []
            for q in questions:
                if isinstance(q, dict) and "question" in q and "options" in q:
                    q.setdefault("correct_index", 0)
                    q.setdefault("topic_tag", "General")
                    q.setdefault("explanation", "")
                    q.setdefault("source_chunk", "")
                    if isinstance(q["correct_index"], (int, float)):
                        q["correct_index"] = int(q["correct_index"]) % 4
                    else:
                        q["correct_index"] = 0
                    validated.append(q)
            return validated[:num_questions]

        return []
    finally:
        gpu_lock.release_high()


def grade_quiz(questions: List[dict], answers: List[int]) -> dict:
    """Grade a quiz and compute topic breakdown."""
    correct = 0
    topic_stats = {}

    for i, q in enumerate(questions):
        user_answer = answers[i] if i < len(answers) else -1
        correct_idx = q.get("correct_index", 0)
        is_correct = user_answer == correct_idx
        if is_correct:
            correct += 1

        topic = q.get("topic_tag", "General")
        if topic not in topic_stats:
            topic_stats[topic] = {"correct": 0, "total": 0}
        topic_stats[topic]["total"] += 1
        if is_correct:
            topic_stats[topic]["correct"] += 1

    score_pct = (correct / len(questions) * 100) if questions else 0

    return {
        "total_questions": len(questions),
        "correct_answers": correct,
        "score_percentage": round(score_pct, 1),
        "topic_breakdown": topic_stats
    }


async def generate_remediation(topic_breakdown: dict, score_pct: float) -> str:
    """Generate personalized AI study advice based on quiz results."""
    weak_topics = [
        t for t, stats in topic_breakdown.items()
        if stats["total"] > 0 and (stats["correct"] / stats["total"]) < 0.7
    ]

    prompt = f"""A student scored {score_pct}% on a quiz.

Topic breakdown:
{json.dumps(topic_breakdown, indent=2)}

Weak areas: {', '.join(weak_topics) if weak_topics else 'None identified'}

Provide personalized study advice in Markdown:
1. What they did well
2. Specific topics to review  
3. Study strategies for weak areas
4. Recommended focus for next session"""

    await gpu_lock.acquire_high()
    try:
        return await _ollama_generate(prompt, temperature=0.6, max_tokens=1024)
    finally:
        gpu_lock.release_high()


# ─── Model Verification ──────────────────────────────────────────────────────
async def verify_ollama_model() -> dict:
    """Check if Ollama is running and the target model is available."""
    try:
        models = await asyncio.to_thread(ollama_client.list)
        model_names = []
        if isinstance(models, dict) and "models" in models:
            model_names = [m.get("name", "") for m in models["models"]]
        elif hasattr(models, 'models'):
            model_names = [m.model for m in models.models]

        found = any(MODEL_NAME in name for name in model_names)
        return {
            "status": "ready" if found else "model_not_found",
            "model": MODEL_NAME,
            "available_models": model_names[:10],
            "found": found
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "model": MODEL_NAME, "found": False}


# ─── Summarization & Blurb Engine (Additive Only) ────────────────────────────
async def _ollama_generate_ctx(prompt: str, system: str = "", temperature: float = 0.7,
                               num_predict: int = 2048, num_ctx: int = OLLAMA_NUM_CTX) -> str:
    """Generate response from local LLM with strict context window and prediction limit."""
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = await asyncio.to_thread(
            ollama_client.chat,
            model=MODEL_NAME,
            messages=messages,
            options={
                "temperature": temperature,
                "num_predict": min(num_predict, 2048),
                "num_ctx": min(num_ctx, OLLAMA_NUM_CTX),
            },
            keep_alive=OLLAMA_KEEP_ALIVE
        )
        msg = response.get("message", {}) if isinstance(response, dict) else getattr(response, "message", None)
        content = getattr(msg, "content", "") if hasattr(msg, "content") else (msg.get("content", "") if isinstance(msg, dict) else "")
        if not content:
            thinking = getattr(msg, "thinking", "") if hasattr(msg, "thinking") else (msg.get("thinking", "") if isinstance(msg, dict) else "")
            if thinking:
                content = thinking
        return content
    except Exception as e:
        logger.error(f"Ollama generate_ctx error: {e}")
        return f"[Generation error: {e}]"


async def summarize_map(chunk_text: str) -> str:
    """MAP phase: extract compact notes, definitions, formulas from a 3-chunk batch."""
    system = "You are an expert study notes creator. Write concise, dense factual notes from the provided material only. Do not speculate or introduce outside facts."
    prompt = f"""From this study material, write compact notes: key points, definitions, formulas, numbers. Use only this text. Max 250 words.

Study Material:
{chunk_text}"""
    return await _ollama_generate_ctx(prompt, system=system, temperature=0.3, num_predict=400, num_ctx=4096)


async def summarize_reduce(notes_text: str) -> str:
    """REDUCE phase: merge and condense notes into coherent, unified study notes."""
    system = "You are a master synthesist. Combine notes from multiple sections into one cohesive, deduplicated set of study notes. Retain all key formulas, definitions, numbers, and facts."
    prompt = f"""Merge and condense these study notes into a cohesive set of structured notes. Preserve all key facts, definitions, formulas, and numbers. Remove redundancies. Max 1000 words.

Notes:
{notes_text}"""
    return await _ollama_generate_ctx(prompt, system=system, temperature=0.3, num_predict=1200, num_ctx=4096)


async def summarize_outline(notes_text: str, target_words: int) -> List[dict]:
    """OUTLINE phase: create section outline with titles and word budgets."""
    n = max(1, min(8, round(target_words / 150)))
    budget_per_sec = max(40, round(target_words / n))

    if n == 1:
        return [{"title": "Comprehensive Summary", "budget": target_words}]

    system = "You are an expert curriculum designer. Return ONLY a valid JSON array of section title strings."
    prompt = f"""Based on these study notes, generate an outline of exactly {n} clear, logical section titles that cover the material in order.
Return ONLY a valid JSON array of {n} strings, for example: ["Introduction to Topic", "Core Principles", "Practical Applications", "Exam Takeaways"]

Notes:
{notes_text[:3000]}"""

    res = await _ollama_generate_ctx(prompt, system=system, temperature=0.3, num_predict=250, num_ctx=4096)
    parsed = extract_clean_json(res)

    sections = []
    if isinstance(parsed, list) and len(parsed) > 0:
        for t in parsed[:n]:
            sections.append({"title": str(t).strip(), "budget": budget_per_sec})

    # Fallback if LLM output failed to parse
    if len(sections) < n:
        default_titles = [
            "Overview & Core Definitions", "Fundamental Principles",
            "Key Mechanisms & Process", "Advanced Concepts & Formulas",
            "Practical Examples & Case Studies", "Analysis & Applications",
            "Key Takeaways & Formulas", "Exam Review & Quick Summary"
        ]
        for i in range(len(sections), n):
            sections.append({"title": default_titles[i % len(default_titles)], "budget": budget_per_sec})

    # Adjust last section budget so sum matches target_words
    total_budget = sum(s["budget"] for s in sections)
    diff = target_words - total_budget
    if sections:
        sections[-1]["budget"] = max(30, sections[-1]["budget"] + diff)

    return sections


async def summarize_write_section(section_title: str, section_notes: str, word_budget: int, style: str) -> str:
    """WRITE phase: author one section matching the requested word budget and style."""
    style_instruction = {
        "paragraph": "Write clear, elegant, flowing academic paragraphs with bold keywords. Avoid bullet points.",
        "bullets": "Write organized bullet points grouped under logical subtopics. Bold key terms and definitions.",
        "exam_notes": "Write high-yield study notes with bold headings, Key Terms, critical formulas, and 1-2 Likely Exam Questions with short answers."
    }.get(style, "Write clear, informative study notes with bold keywords.")

    system = f"You are a professional study author. {style_instruction} Use only the provided notes. No outside facts."
    prompt = f"""Author the section "{section_title}".
Target word count: exactly ~{word_budget} words (aim within {int(word_budget * 0.95)} to {int(word_budget * 1.05)} words).
Style: {style}
Use only the notes below. Do not repeat the section title as a top heading.

Notes for this section:
{section_notes}"""

    num_predict = int(word_budget * 1.8 + 40)
    return await _ollama_generate_ctx(prompt, system=system, temperature=0.35, num_predict=num_predict, num_ctx=4096)


async def summarize_adjust(section_title: str, section_content: str, target_words: int, current_words: int, style: str) -> str:
    """LENGTH CHECK adjustment: adjust a section to match target words (expand or trim)."""
    action = "trim" if current_words > target_words else "expand"
    system = "You are an editorial assistant adjusting section length. Preserve all key facts, definitions, and numbers."
    if action == "trim":
        prompt = f"""The following section "{section_title}" currently has {current_words} words, but needs to be approximately {target_words} words.
Condense and trim this text to around {target_words} words while keeping all essential concepts and terminology intact. Style: {style}.

Content:
{section_content}"""
    else:
        prompt = f"""The following section "{section_title}" currently has {current_words} words, but needs to be approximately {target_words} words.
Expand upon the explanations, provide deeper analytical context and thorough breakdowns of the existing concepts to reach approximately {target_words} words. Do not introduce fictional facts. Style: {style}.

Content:
{section_content}"""

    num_predict = int(target_words * 1.8 + 40)
    return await _ollama_generate_ctx(prompt, system=system, temperature=0.35, num_predict=num_predict, num_ctx=4096)


async def make_blurb(sample_text: str) -> str:
    """Generate a crisp 25-40 word summary of what a document covers."""
    system = "You write concise, objective 25-40 word study guide descriptions. Never exceed 40 words. No introductory filler like 'This document covers'."
    prompt = f"""Write a 25-40 word description of what this study material covers, highlighting the core topic and key subjects.

Document excerpts:
{sample_text[:2500]}"""
    raw = await _ollama_generate_ctx(prompt, system=system, temperature=0.3, num_predict=80, num_ctx=4096)
    clean = re.sub(r'^(?:This\s+document\s+(?:covers|provides|is)|In\s+this\s+file)\s*,?\s*', '', raw.strip(), flags=re.IGNORECASE)
    words = clean.split()
    if len(words) > 42:
        clean = " ".join(words[:40]) + "..."
    return clean.strip()

