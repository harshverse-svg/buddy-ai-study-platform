"""
BUDDY - Full-Document Map-Reduce Summary Engine
Handles:
- Map-reduce document summarization with length targeting & honest reporting
- Caching for batch notes and final summaries
- Background worker with PriorityOllamaLock (low priority, pauses for chat/quiz)
- Document blurb generation
"""
import os
import re
import json
import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Union, Any

from config import MARKDOWN_DIR
from database import SessionLocal
from models import DocumentRecord, SummaryCache
from ai_engine import (
    gpu_lock, summarize_map, summarize_reduce, summarize_outline,
    summarize_write_section, summarize_adjust, make_blurb
)
from ingestion import get_session_chunks

logger = logging.getLogger("buddy.summary")

# ─── Job State & Active Listeners ─────────────────────────────────────────────
class SummaryJob:
    def __init__(self, job_id: str, session_id: int, file_ids: List[int], words: int, style: str):
        self.job_id = job_id
        self.session_id = session_id
        self.file_ids = file_ids
        self.words = words
        self.style = style
        self.queue: asyncio.Queue = asyncio.Queue()
        self.cancelled = False
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.status = "PENDING"  # PENDING | RUNNING | COMPLETED | CANCELLED | ERROR

    def cancel(self):
        self.cancelled = True
        self.status = "CANCELLED"
        try:
            self.queue.put_nowait({"cancelled": True})
        except Exception:
            pass

    async def emit(self, event_data: dict):
        if not self.cancelled:
            await self.queue.put(event_data)


active_summary_jobs: Dict[str, SummaryJob] = {}


def generate_summary_key(session_id: int, file_ids: List[int], words: int, style: str) -> str:
    sorted_ids = sorted(file_ids)
    raw = f"{session_id}_{sorted_ids}_{words}_{style}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def generate_notes_batch_key(batch_text: str) -> str:
    return hashlib.sha1(batch_text.encode("utf-8")).hexdigest()


# ─── Pipeline Worker ──────────────────────────────────────────────────────────
async def run_summary_worker(job: SummaryJob):
    job.status = "RUNNING"
    db = SessionLocal()
    try:
        # Step 1: Load ALL chunks of the chosen files in order (no search step)
        all_chunks = get_session_chunks(job.session_id, db)
        if job.file_ids and "all" not in job.file_ids:
            target_ids = set(job.file_ids)
            chunks = [c for c in all_chunks if c.get("file_id") in target_ids]
        else:
            chunks = all_chunks

        if not chunks:
            job.status = "ERROR"
            job.error = "No study material found for the selected files."
            await job.emit({"error": job.error})
            return

        # Step 2: MAP Phase - batches of 3 chunks (~1200 words)
        batch_size = 3
        chunk_batches = [chunks[i:i + batch_size] for i in range(0, len(chunks), batch_size)]
        total_batches = len(chunk_batches)
        mapped_notes: List[str] = []

        for b_idx, batch in enumerate(chunk_batches):
            if job.cancelled:
                return

            # Check if high-priority request needs the GPU
            while gpu_lock.should_pause:
                if job.cancelled:
                    return
                await asyncio.sleep(0.4)

            # Combine batch text
            batch_text = "\n\n".join(c["text"] for c in batch)
            batch_key = generate_notes_batch_key(batch_text)

            # Check cache
            cached_note = db.query(SummaryCache).filter(
                SummaryCache.kind == "notes",
                SummaryCache.key == batch_key
            ).first()

            if cached_note and cached_note.content:
                notes_content = cached_note.content
            else:
                await gpu_lock.acquire_low()
                try:
                    notes_content = await summarize_map(batch_text)
                finally:
                    gpu_lock.release_low()

                # Cache mapped notes
                try:
                    note_entry = SummaryCache(
                        session_id=job.session_id,
                        kind="notes",
                        key=batch_key,
                        content=notes_content,
                        word_count=len(notes_content.split()),
                        status="COMPLETED"
                    )
                    db.add(note_entry)
                    db.commit()
                except Exception as ex:
                    db.rollback()
                    logger.warning(f"Failed to cache batch notes: {ex}")

            mapped_notes.append(notes_content)
            await job.emit({
                "phase": "reading",
                "done": b_idx + 1,
                "total": total_batches
            })

        # Step 3: REDUCE Phase - merge notes in groups until <= 1500 words
        all_notes_text = "\n\n".join(mapped_notes)
        notes_word_count = len(all_notes_text.split())

        if notes_word_count > 1500 and total_batches > 1:
            await job.emit({"phase": "combining", "done": 1, "total": 1})
            while len(all_notes_text.split()) > 1500:
                if job.cancelled:
                    return
                while gpu_lock.should_pause:
                    await asyncio.sleep(0.4)

                await gpu_lock.acquire_low()
                try:
                    all_notes_text = await summarize_reduce(all_notes_text)
                finally:
                    gpu_lock.release_low()

        # Step 4: OUTLINE Phase
        if job.cancelled:
            return
        while gpu_lock.should_pause:
            await asyncio.sleep(0.4)

        outline_sections = await summarize_outline(all_notes_text, job.words)
        n_sections = len(outline_sections)

        # Slice notes across sections proportionally
        notes_paragraphs = [p.strip() for p in all_notes_text.split("\n\n") if p.strip()]
        if not notes_paragraphs:
            notes_paragraphs = [all_notes_text]

        chunk_per_section = max(1, len(notes_paragraphs) // n_sections)
        section_notes_slices = []
        for i in range(n_sections):
            start = i * chunk_per_section
            end = (i + 1) * chunk_per_section if i < n_sections - 1 else len(notes_paragraphs)
            slice_text = "\n\n".join(notes_paragraphs[start:end])
            if not slice_text.strip():
                slice_text = all_notes_text
            section_notes_slices.append(slice_text)

        # Step 5: WRITE Phase
        written_sections: List[Dict[str, Any]] = []
        for s_idx, sec in enumerate(outline_sections):
            if job.cancelled:
                return
            while gpu_lock.should_pause:
                if job.cancelled:
                    return
                await asyncio.sleep(0.4)

            sec_title = sec["title"]
            budget = sec["budget"]
            sec_notes = section_notes_slices[s_idx]

            await gpu_lock.acquire_low()
            try:
                sec_content = await summarize_write_section(
                    sec_title, sec_notes, budget, job.style
                )
            finally:
                gpu_lock.release_low()

            written_sections.append({
                "title": sec_title,
                "content": sec_content,
                "budget": budget,
                "words": len(sec_content.split())
            })

            await job.emit({
                "phase": "writing",
                "done": s_idx + 1,
                "total": n_sections
            })

        # Step 6: LENGTH CHECK (Run adjust up to 2 times to reach 90-110% of target)
        lower_bound = int(job.words * 0.90)
        upper_bound = int(job.words * 1.10)

        for adjust_round in range(2):
            total_written_words = sum(s["words"] for s in written_sections)
            if lower_bound <= total_written_words <= upper_bound:
                break

            if job.cancelled:
                return

            diff = job.words - total_written_words

            # Pick the section that has the largest divergence from target budget
            worst_sec_idx = max(
                range(len(written_sections)),
                key=lambda idx: abs(written_sections[idx]["words"] - written_sections[idx]["budget"])
            )
            worst_sec = written_sections[worst_sec_idx]

            adjusted_target_words = max(40, worst_sec["words"] + diff)

            while gpu_lock.should_pause:
                if job.cancelled:
                    return
                await asyncio.sleep(0.4)

            # If expanding, draw additional rich context from the notes
            detail_notes = ""
            if diff > 0:
                if worst_sec_idx < len(section_notes_slices) and section_notes_slices[worst_sec_idx]:
                    detail_notes = section_notes_slices[worst_sec_idx]
                if len(detail_notes.split()) < 100 and all_notes_text:
                    detail_notes = all_notes_text[:2000]

            input_text = worst_sec["content"]
            if detail_notes and len(input_text.split()) < adjusted_target_words:
                input_text = f"{input_text}\n\nAdditional source context to draw details from:\n{detail_notes}"

            await gpu_lock.acquire_low()
            try:
                adjusted_content = await summarize_adjust(
                    worst_sec["title"],
                    input_text,
                    adjusted_target_words,
                    worst_sec["words"],
                    job.style
                )
                worst_sec["content"] = adjusted_content
                worst_sec["words"] = len(adjusted_content.split())
            finally:
                gpu_lock.release_low()

        # Build full markdown text without duplicate headings
        final_markdown_parts = []
        for s in written_sections:
            title_text = s['title'].strip()
            content = s['content'].strip()

            # Thoroughly strip duplicated title from start of content
            clean_title_core = re.sub(r'^[#*\-_\d\.\s:]+|[#*\-_\s:]+$', '', title_text).strip().lower()
            lines = content.split('\n')
            while lines:
                first_line = lines[0].strip()
                if not first_line:
                    lines.pop(0)
                    continue
                first_line_core = re.sub(r'^[#*\-_\d\.\s:]+|[#*\-_\s:]+$', '', first_line).strip().lower()
                if (first_line_core == clean_title_core or 
                    (clean_title_core and clean_title_core in first_line_core) or
                    (first_line_core and first_line_core in clean_title_core)):
                    lines.pop(0)
                    while lines and not lines[0].strip():
                        lines.pop(0)
                else:
                    break

            cleaned_content = '\n'.join(lines).strip()
            if not cleaned_content:
                cleaned_content = content

            final_markdown_parts.append(f"### {title_text}\n\n{cleaned_content}")

        final_text = "\n\n".join(final_markdown_parts)
        final_word_count = len(final_text.split())

        # Step 7: Store the result in SummaryCache
        summary_key = generate_summary_key(job.session_id, job.file_ids, job.words, job.style)
        try:
            summary_entry = SummaryCache(
                session_id=job.session_id,
                kind="summary",
                key=summary_key,
                file_ids=json.dumps(job.file_ids),
                words_target=job.words,
                style=job.style,
                content=final_text,
                word_count=final_word_count,
                status="COMPLETED"
            )
            db.add(summary_entry)
            db.commit()
        except Exception as ex:
            db.rollback()
            logger.warning(f"Failed to cache final summary: {ex}")

        job.status = "COMPLETED"
        job.result = {
            "done": True,
            "text": final_text,
            "word_count": final_word_count,
            "words_target": job.words,
            "style": job.style
        }
        await job.emit(job.result)

    except Exception as e:
        logger.error(f"Error in summary worker: {e}", exc_info=True)
        job.status = "ERROR"
        job.error = str(e)
        await job.emit({"error": str(e)})
    finally:
        db.close()


# ─── File Blurb Worker ────────────────────────────────────────────────────────
async def queue_file_blurb(doc_id: int, session_id: int):
    """
    Queue and execute background blurb generation for an ingested document.
    Writes a 25-40 word summary from first 2 chunks and headings.
    Does not delay file upload responses.
    """
    db = SessionLocal()
    try:
        blurb_key = f"blurb_{doc_id}"
        existing = db.query(SummaryCache).filter(
            SummaryCache.kind == "blurb",
            SummaryCache.key == blurb_key
        ).first()

        if existing and existing.content:
            return existing.content

        doc = db.query(DocumentRecord).filter(DocumentRecord.id == doc_id).first()
        if not doc or not doc.md_path:
            return ""

        md_path = os.path.join(MARKDOWN_DIR, os.path.basename(doc.md_path))
        if not os.path.exists(md_path):
            return ""

        with open(md_path, "r", encoding="utf-8", errors="replace") as f:
            md_text = f.read()

        # Extract headings and first 2 chunks (~800 words)
        headings = re.findall(r'^#{1,3}\s+(.+)$', md_text, flags=re.MULTILINE)
        words = md_text.split()
        sample_body = " ".join(words[:800])
        headings_preview = ", ".join(headings[:6]) if headings else ""

        sample_text = f"Key topics: {headings_preview}\n\nContent:\n{sample_body}"

        while gpu_lock.should_pause:
            await asyncio.sleep(0.5)

        await gpu_lock.acquire_low()
        try:
            blurb = await make_blurb(sample_text)
        finally:
            gpu_lock.release_low()

        if blurb:
            blurb_entry = SummaryCache(
                session_id=session_id,
                kind="blurb",
                key=blurb_key,
                file_ids=json.dumps([doc_id]),
                content=blurb,
                word_count=len(blurb.split()),
                status="COMPLETED"
            )
            db.add(blurb_entry)
            db.commit()

        return blurb
    except Exception as e:
        logger.error(f"Error generating blurb for doc {doc_id}: {e}")
        return ""
    finally:
        db.close()
