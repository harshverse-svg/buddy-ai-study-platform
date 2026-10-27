"""
BUDDY - FastAPI Main Application
Single-port server: API + static frontend serving.
"""
import os
import sys
import json
import asyncio
import logging
import shutil
from datetime import datetime, timezone
from typing import Optional, List, Union, Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from config import UPLOADS_DIR, FRONTEND_DIR, MODEL_NAME
from database import init_db, seed_demo_data, get_db, SessionLocal
from models import (
    StudySession, DocumentRecord, ChatMessage, AskMessage,
    QuizAttempt, GeneratedBook, ConceptMap, SummaryCache, NotebookItem
)
from ingestion import ingest_document, get_session_chunks
from summary_engine import (
    SummaryJob, active_summary_jobs, run_summary_worker,
    generate_summary_key, queue_file_blurb
)
from ai_engine import (
    chat_qa_stream, ask_qa_stream, generate_quiz, grade_quiz,
    generate_remediation, generate_concept_map,
    generate_book_outline, book_generation_worker,
    verify_ollama_model, extract_clean_json,
    invalidate_session_bm25_cache
)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    encoding="utf-8"
)
logger = logging.getLogger("buddy.main")

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Shiksha Buddy - AI Study Platform",
    version="1.0.0",
    description="Local AI Study, Quiz, Book Generator and Concept Map Platform"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Startup ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("Shiksha Buddy starting up...")
    init_db()
    seed_demo_data()
    model_info = await verify_ollama_model()
    logger.info(f"Ollama status: {model_info}")
    logger.info("Shiksha Buddy ready!")


# ─── Pydantic Models ─────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    title: str = "New Study Session"

class SessionUpdate(BaseModel):
    title: str

class BulkDeleteRequest(BaseModel):
    session_ids: Optional[List[int]] = None
    all: bool = False

class ChatRequest(BaseModel):
    session_id: int
    message: str
    mode: str = "concise"

class AskRequest(BaseModel):
    session_id: int
    message: str

class QuizRequest(BaseModel):
    session_id: int
    difficulty_label: str = "Conceptual"
    num_questions: int = 10
    focus_topic: str = ""

class QuizSubmission(BaseModel):
    session_id: int
    quiz_attempt_id: int
    answers: list

class BookRequest(BaseModel):
    session_id: int

class SummaryStartRequest(BaseModel):
    session_id: int
    file_ids: Any = "all"
    words: int = 500
    style: str = "paragraph"

class NotebookItemCreate(BaseModel):
    session_id: int
    title: str
    content: str
    source: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(StudySession).filter(
        StudySession.is_deleted == False
    ).order_by(StudySession.updated_at.desc()).all()
    return [{
        "id": s.id,
        "title": s.title,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "doc_count": len([d for d in s.documents]),
        "message_count": len([m for m in s.messages])
    } for s in sessions]


@app.get("/api/sessions/search")
def search_sessions(q: str = Query("", min_length=1), db: Session = Depends(get_db)):
    search_term = q.strip()
    if not search_term:
        return []

    pattern = f"%{search_term}%"

    # Search in titles
    sessions = db.query(StudySession).filter(
        StudySession.is_deleted == False,
        StudySession.title.ilike(pattern)
    ).all()

    # Search in chat messages
    chat_matches = db.query(ChatMessage).join(StudySession).filter(
        StudySession.is_deleted == False,
        ChatMessage.content.ilike(pattern)
    ).order_by(ChatMessage.timestamp.desc()).all()

    # Search in ask messages
    ask_matches = db.query(AskMessage).join(StudySession).filter(
        StudySession.is_deleted == False,
        AskMessage.content.ilike(pattern)
    ).order_by(AskMessage.timestamp.desc()).all()

    results_map = {}

    def make_snippet(text: str, query: str, max_chars=120) -> str:
        idx = text.lower().find(query.lower())
        if idx == -1:
            clean = text.replace('\n', ' ').strip()
            return clean[:max_chars] + ("..." if len(clean) > max_chars else "")
        start = max(0, idx - 40)
        end = min(len(text), idx + len(query) + 60)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(text) else ""
        return (prefix + text[start:end].replace('\n', ' ') + suffix).strip()

    # Title matches
    for s in sessions:
        results_map[s.id] = {
            "id": s.id,
            "title": s.title,
            "snippet": f"Title match: {s.title}",
            "updated_at": s.updated_at.isoformat() if s.updated_at else datetime.now(timezone.utc).isoformat()
        }

    # Message matches
    for m in chat_matches:
        if m.session_id not in results_map:
            s = m.session
            results_map[m.session_id] = {
                "id": s.id,
                "title": s.title,
                "snippet": make_snippet(m.content, search_term),
                "updated_at": s.updated_at.isoformat() if s.updated_at else datetime.now(timezone.utc).isoformat()
            }

    for m in ask_matches:
        if m.session_id not in results_map:
            s = m.session
            results_map[m.session_id] = {
                "id": s.id,
                "title": s.title,
                "snippet": make_snippet(m.content, search_term),
                "updated_at": s.updated_at.isoformat() if s.updated_at else datetime.now(timezone.utc).isoformat()
            }

    sorted_results = sorted(results_map.values(), key=lambda x: x["updated_at"], reverse=True)
    return sorted_results


@app.post("/api/sessions")
def create_session(req: SessionCreate, db: Session = Depends(get_db)):
    session = StudySession(title=req.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title}


@app.patch("/api/sessions/{session_id}")
def update_session(session_id: int, req: SessionUpdate, db: Session = Depends(get_db)):
    s = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")
    if req.title and req.title.strip():
        s.title = req.title.strip()
        s.updated_at = datetime.now(timezone.utc)
        db.commit()
    return {"id": s.id, "title": s.title}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")

    # Limit to the most recent 30 messages in chronological order for instantaneous chat switching
    recent_messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.id.desc()).limit(30).all()
    recent_messages.reverse()

    return {
        "id": s.id,
        "title": s.title,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "documents": [{
            "id": d.id, "filename": d.filename, "file_type": d.file_type,
            "ocr_used": d.ocr_used, "chunk_count": d.chunk_count,
            "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None
        } for d in s.documents],
        "messages": [{
            "id": m.id, "role": m.role, "content": m.content,
            "sources_json": m.sources_json,
            "sub_queries_json": m.sub_queries_json,
            "thinking_time_sec": m.thinking_time_sec,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None
        } for m in recent_messages],
    }


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int, soft: bool = Query(False), db: Session = Depends(get_db)):
    s = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")

    if soft:
        s.is_deleted = True
        s.updated_at = datetime.now(timezone.utc)
        db.commit()
        total_files = db.query(DocumentRecord).join(StudySession).filter(StudySession.is_deleted == False).count()
        return {"success": True, "soft_deleted": True, "total_files": total_files}

    # Permanent purge: remove physical files on disk first
    for doc in s.documents:
        file_path = os.path.join(UPLOADS_DIR, doc.filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        if doc.md_path and os.path.exists(doc.md_path):
            try:
                os.remove(doc.md_path)
            except Exception:
                pass

    db.delete(s)
    db.commit()
    invalidate_session_bm25_cache(session_id)

    total_files = db.query(DocumentRecord).join(StudySession).filter(StudySession.is_deleted == False).count()
    return {"success": True, "purged": True, "total_files": total_files}


@app.post("/api/sessions/{session_id}/restore")
def restore_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")
    s.is_deleted = False
    s.updated_at = datetime.now(timezone.utc)
    db.commit()
    total_files = db.query(DocumentRecord).join(StudySession).filter(StudySession.is_deleted == False).count()
    return {
        "success": True,
        "restored": s.id,
        "title": s.title,
        "total_files": total_files
    }


@app.post("/api/sessions/bulk-delete")
def bulk_delete_sessions(req: BulkDeleteRequest, db: Session = Depends(get_db)):
    if req.all:
        sessions = db.query(StudySession).all()
    elif req.session_ids:
        sessions = db.query(StudySession).filter(StudySession.id.in_(req.session_ids)).all()
    else:
        return {"success": True, "deleted_count": 0, "total_files": 0}

    count = 0
    for s in sessions:
        for doc in s.documents:
            file_path = os.path.join(UPLOADS_DIR, doc.filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
            if doc.md_path and os.path.exists(doc.md_path):
                try:
                    os.remove(doc.md_path)
                except Exception:
                    pass
        db.delete(s)
        count += 1
    db.commit()
    invalidate_session_bm25_cache()
    total_files = db.query(DocumentRecord).join(StudySession).filter(StudySession.is_deleted == False).count()
    return {"success": True, "deleted_count": count, "total_files": total_files}


# ═══════════════════════════════════════════════════════════════════════════════
# FILE UPLOAD & INGESTION
# ═══════════════════════════════════════════════════════════════════════════════

def _save_upload_file_sync(file_path: str, content: bytes):
    with open(file_path, "wb") as f:
        f.write(content)


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    session_id: int = Form(...),
    db: Session = Depends(get_db)
):
    # Validate session
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save uploaded file asynchronously without blocking the event loop
    file_path = os.path.join(UPLOADS_DIR, file.filename)
    content = await file.read()
    await asyncio.to_thread(_save_upload_file_sync, file_path, content)

    # Ingest
    try:
        markdown_text, md_filename, ocr_used, chunk_count = await ingest_document(file_path)

        ext = os.path.splitext(file.filename)[1].lower()
        doc = DocumentRecord(
            session_id=session_id,
            filename=file.filename,
            file_type=ext,
            ocr_used=ocr_used,
            md_path=f"storage/markdown/{md_filename}",
            chunk_count=chunk_count,
            token_savings_pct=round((1 - len(markdown_text) / max(len(content), 1)) * 100, 1)
        )
        db.add(doc)
        session.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(doc)

        # Invalidate in-memory BM25 cache for this session so it updates immediately
        invalidate_session_bm25_cache(session_id)

        # Queue low-priority blurb job in background without delaying upload response
        asyncio.create_task(queue_file_blurb(doc.id, session_id))

        return {
            "id": doc.id,
            "filename": file.filename,
            "file_type": ext,
            "ocr_used": ocr_used,
            "chunk_count": chunk_count,
            "extraction_method": "PaddleOCR CPU" if ocr_used else "MarkItDown Digital",
            "message": f"[OK] {file.filename} ingested: {chunk_count} chunks"
        }
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# CHAT Q&A (SSE STREAMING)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/chat/stream")
async def chat_stream(
    session_id: int = Query(...),
    message: str = Query(...),
    mode: str = Query("concise"),
    db: Session = Depends(get_db)
):
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=message)
    db.add(user_msg)
    db.commit()

    # Load chunks
    chunks = get_session_chunks(session_id, db)

    # Get conversation history
    history = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.timestamp.desc()).limit(10).all()
    session_msgs = [{"role": m.role, "content": m.content} for m in reversed(history)]

    async def event_generator():
        full_answer = ""
        sources_data = []
        sub_queries_data = []
        thinking_time = 0

        async for event in chat_qa_stream(message, chunks, session_msgs, session_id=session_id, mode=mode):
            if event["type"] == "status":
                yield {"event": "status", "data": json.dumps(event)}
            elif event["type"] == "stage":
                yield {"event": "stage", "data": json.dumps(event)}
            elif event["type"] == "sub_queries":
                sub_queries_data = event["data"]
                yield {"event": "sub_queries", "data": json.dumps(event["data"])}
            elif event["type"] == "candidates":
                yield {"event": "candidates", "data": json.dumps({"count": event["count"]})}
            elif event["type"] == "reranked":
                yield {"event": "reranked", "data": json.dumps({"count": event["count"]})}
            elif event["type"] == "token":
                yield {"event": "token", "data": event["data"]}
            elif event["type"] == "answer_start":
                yield {"event": "answer_start", "data": ""}
            elif event["type"] == "complete":
                full_answer = event.get("full_answer", "")
                sources_data = event.get("sources", [])
                thinking_time = event.get("thinking_time", 0)
                yield {"event": "complete", "data": json.dumps({
                    "thinking_time": thinking_time,
                    "sources": sources_data,
                    "mode": mode
                })}

        # Save assistant message
        try:
            db2 = SessionLocal()
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=full_answer,
                sources_json=json.dumps(sources_data),
                sub_queries_json=json.dumps(sub_queries_data),
                thinking_time_sec=thinking_time
            )
            db2.add(ai_msg)
            s = db2.query(StudySession).filter(StudySession.id == session_id).first()
            if s:
                s.updated_at = datetime.now(timezone.utc)
            db2.commit()
            db2.close()
        except Exception as e:
            logger.error(f"Error saving AI message: {e}")

    return EventSourceResponse(event_generator())


# ═══════════════════════════════════════════════════════════════════════════════
# ASK ANYTHING BOARD (GENERAL TUTOR, NO FILES REQUIRED)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/ask")
async def ask_endpoint(
    req: AskRequest,
    db: Session = Depends(get_db)
):
    session = db.query(StudySession).filter(StudySession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = AskMessage(session_id=req.session_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()

    # Load conversation history (~10 turns)
    history = db.query(AskMessage).filter(
        AskMessage.session_id == req.session_id
    ).order_by(AskMessage.timestamp.desc()).limit(10).all()
    session_msgs = [{"role": m.role, "content": m.content} for m in reversed(history)]

    async def event_generator():
        full_answer = ""
        thinking_time = 0

        async for event in ask_qa_stream(req.message, session_msgs):
            if event["type"] == "status":
                yield {"event": "status", "data": json.dumps(event)}
            elif event["type"] == "token":
                yield {"event": "token", "data": event["data"]}
            elif event["type"] == "answer_start":
                yield {"event": "answer_start", "data": ""}
            elif event["type"] == "done":
                full_answer = event.get("full_answer", "")
                thinking_time = event.get("thinking_time", 0)
                yield {"event": "done", "data": json.dumps(event)}

        # Save assistant message
        try:
            db2 = SessionLocal()
            ai_msg = AskMessage(
                session_id=req.session_id,
                role="assistant",
                content=full_answer,
                thinking_time_sec=thinking_time
            )
            db2.add(ai_msg)
            s = db2.query(StudySession).filter(StudySession.id == req.session_id).first()
            if s:
                s.updated_at = datetime.now(timezone.utc)
            db2.commit()
            db2.close()
        except Exception as e:
            logger.error(f"Error saving Ask AI message: {e}")

    return EventSourceResponse(event_generator())


@app.get("/api/ask")
async def ask_endpoint_get(
    session_id: int = Query(...),
    message: str = Query(...),
    db: Session = Depends(get_db)
):
    req = AskRequest(session_id=session_id, message=message)
    return await ask_endpoint(req, db)


@app.get("/api/ask/history")
async def get_ask_history(session_id: int = Query(...), db: Session = Depends(get_db)):
    msgs = db.query(AskMessage).filter(AskMessage.session_id == session_id).order_by(AskMessage.timestamp.asc()).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "thinking_time": m.thinking_time_sec, "timestamp": m.timestamp.isoformat()} for m in msgs]


@app.delete("/api/ask/history")
async def delete_ask_history(session_id: int = Query(...), db: Session = Depends(get_db)):
    db.query(AskMessage).filter(AskMessage.session_id == session_id).delete()
    db.commit()
    return {"success": True, "message": "Ask history cleared"}


# ═══════════════════════════════════════════════════════════════════════════════
# FILE MANAGER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/files")
async def get_session_files(session_id: int = Query(...), db: Session = Depends(get_db)):
    docs = db.query(DocumentRecord).filter(DocumentRecord.session_id == session_id).order_by(DocumentRecord.uploaded_at.desc()).all()
    results = []
    for doc in docs:
        file_path = os.path.join(UPLOADS_DIR, doc.filename)
        size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        results.append({
            "id": doc.id,
            "name": doc.filename,
            "type": doc.file_type,
            "size": size,
            "status": "ready"
        })
    return results


@app.delete("/api/files/{id}")
async def delete_file_endpoint(id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentRecord).filter(DocumentRecord.id == id).first()
    if not doc:
        raise HTTPException(404, "File not found")
    file_path = os.path.join(UPLOADS_DIR, doc.filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
    if doc.md_path and os.path.exists(doc.md_path):
        try:
            os.remove(doc.md_path)
        except Exception:
            pass
    filename = doc.filename
    session_id = doc.session_id
    db.delete(doc)
    db.commit()
    invalidate_session_bm25_cache(session_id)
    return {"success": True, "message": f"Deleted {filename}"}


# ═══════════════════════════════════════════════════════════════════════════════
# QUIZ ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/quiz/generate")
async def quiz_generate(req: QuizRequest, db: Session = Depends(get_db)):
    session = db.query(StudySession).filter(StudySession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    chunks = get_session_chunks(req.session_id, db)
    questions = await generate_quiz(
        chunks, req.difficulty_label, req.num_questions, req.focus_topic
    )

    if not questions:
        raise HTTPException(500, "Failed to generate quiz questions")

    # Save quiz attempt (without answers yet)
    attempt = QuizAttempt(
        session_id=req.session_id,
        difficulty_label=req.difficulty_label,
        total_questions=len(questions),
        questions_json=json.dumps(questions)
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {
        "quiz_id": attempt.id,
        "questions": questions,
        "difficulty": req.difficulty_label,
        "total": len(questions)
    }


@app.post("/api/quiz/submit")
async def quiz_submit(req: QuizSubmission, db: Session = Depends(get_db)):
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == req.quiz_attempt_id).first()
    if not attempt:
        raise HTTPException(404, "Quiz attempt not found")

    questions = json.loads(attempt.questions_json) if attempt.questions_json else []
    results = grade_quiz(questions, req.answers)

    # Update attempt
    attempt.correct_answers = results["correct_answers"]
    attempt.score_percentage = results["score_percentage"]
    attempt.topic_breakdown_json = json.dumps(results["topic_breakdown"])
    db.commit()

    # Generate remediation advice
    remediation = await generate_remediation(
        results["topic_breakdown"], results["score_percentage"]
    )

    return {
        **results,
        "quiz_id": attempt.id,
        "remediation": remediation,
        "questions": questions  # Include for review
    }


@app.get("/api/quiz/history/{session_id}")
def quiz_history(session_id: int, db: Session = Depends(get_db)):
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.session_id == session_id
    ).order_by(QuizAttempt.created_at.desc()).all()
    return [{
        "id": a.id,
        "difficulty": a.difficulty_label,
        "total": a.total_questions,
        "correct": a.correct_answers,
        "score": a.score_percentage,
        "topics": json.loads(a.topic_breakdown_json) if a.topic_breakdown_json else {},
        "created_at": a.created_at.isoformat() if a.created_at else None
    } for a in attempts]


# ═══════════════════════════════════════════════════════════════════════════════
# BOOK GENERATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/book/generate")
async def book_generate(req: BookRequest, db: Session = Depends(get_db)):
    session = db.query(StudySession).filter(StudySession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Check for existing book
    existing = db.query(GeneratedBook).filter(
        GeneratedBook.session_id == req.session_id
    ).first()

    if existing and existing.status == "GENERATING":
        return {"message": "Book is already generating", "book_id": existing.id, "status": existing.status}

    if existing:
        existing.status = "GENERATING"
        existing.completed_chapters = 0
        existing.chapters_json = "[]"
        db.commit()
        book = existing
    else:
        book = GeneratedBook(
            session_id=req.session_id,
            title=f"Study Guide - {session.title}",
            status="GENERATING",
            chapters_json="[]"
        )
        db.add(book)
        db.commit()
        db.refresh(book)

    # Launch background worker
    asyncio.create_task(book_generation_worker(req.session_id, SessionLocal))
    return {"book_id": book.id, "status": "GENERATING", "message": "[OK] Book generation started!"}


@app.get("/api/book/status/{session_id}")
def book_status(session_id: int, db: Session = Depends(get_db)):
    book = db.query(GeneratedBook).filter(
        GeneratedBook.session_id == session_id
    ).first()
    if not book:
        return {"status": "IDLE", "chapters": [], "total": 0, "completed": 0}

    chapters = json.loads(book.chapters_json) if book.chapters_json else []
    return {
        "book_id": book.id,
        "status": book.status,
        "title": book.title,
        "total_chapters": book.total_chapters,
        "completed_chapters": book.completed_chapters,
        "chapters": chapters,
        "progress_pct": round(
            (book.completed_chapters / max(book.total_chapters, 1)) * 100
        ) if book.total_chapters else 0
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CONCEPT MAP ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/concept-map/generate")
async def concept_map_generate(req: BookRequest, db: Session = Depends(get_db)):
    session = db.query(StudySession).filter(StudySession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    chunks = get_session_chunks(req.session_id, db)
    if not chunks:
        raise HTTPException(400, "No documents uploaded yet")

    result = await generate_concept_map(chunks)

    # Save or update concept map
    existing = db.query(ConceptMap).filter(ConceptMap.session_id == req.session_id).first()
    if existing:
        existing.nodes_json = json.dumps(result["nodes"])
        existing.edges_json = json.dumps(result["edges"])
        existing.one_page_summary_md = result["cheat_sheet"]
    else:
        cmap = ConceptMap(
            session_id=req.session_id,
            nodes_json=json.dumps(result["nodes"]),
            edges_json=json.dumps(result["edges"]),
            one_page_summary_md=result["cheat_sheet"]
        )
        db.add(cmap)

    db.commit()
    return {
        "nodes": result["nodes"],
        "edges": result["edges"],
        "cheat_sheet": result["cheat_sheet"]
    }


@app.get("/api/concept-map/{session_id}")
def get_concept_map(session_id: int, db: Session = Depends(get_db)):
    cmap = db.query(ConceptMap).filter(ConceptMap.session_id == session_id).first()
    if not cmap:
        return {"nodes": [], "edges": [], "cheat_sheet": ""}
    return {
        "nodes": json.loads(cmap.nodes_json) if cmap.nodes_json else [],
        "edges": json.loads(cmap.edges_json) if cmap.edges_json else [],
        "cheat_sheet": cmap.one_page_summary_md or ""
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ANALYTICS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/analytics/{session_id}")
def get_analytics(session_id: int, db: Session = Depends(get_db)):
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.session_id == session_id
    ).order_by(QuizAttempt.created_at.asc()).all()

    total_questions = sum(a.total_questions for a in attempts)
    total_correct = sum(a.correct_answers for a in attempts)

    # Aggregate topic stats
    all_topics = {}
    for a in attempts:
        topics = json.loads(a.topic_breakdown_json) if a.topic_breakdown_json else {}
        for topic, stats in topics.items():
            if topic not in all_topics:
                all_topics[topic] = {"correct": 0, "total": 0}
            all_topics[topic]["correct"] += stats.get("correct", 0)
            all_topics[topic]["total"] += stats.get("total", 0)

    return {
        "total_quizzes": len(attempts),
        "total_questions": total_questions,
        "total_correct": total_correct,
        "overall_accuracy": round(
            (total_correct / max(total_questions, 1)) * 100, 1
        ),
        "score_history": [
            {"attempt": i + 1, "score": a.score_percentage,
             "difficulty": a.difficulty_label,
             "date": a.created_at.isoformat() if a.created_at else None}
            for i, a in enumerate(attempts)
        ],
        "topic_mastery": {
            topic: round((s["correct"] / max(s["total"], 1)) * 100, 1)
            for topic, s in all_topics.items()
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/system/status")
async def system_status():
    model_info = await verify_ollama_model()
    from ingestion import _ocr_available
    return {
        "model": MODEL_NAME,
        "model_status": model_info,
        "ocr_available": _ocr_available if _ocr_available is not None else "not_checked",
        "ocr_engine": "Baidu PaddleOCR (CPU)" if _ocr_available else "PyMuPDF Digital Only",
        "platform": "Shiksha Buddy v1.0"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FULL-DOCUMENT SUMMARY & NOTEBOOK ENDPOINTS (Part A)
# ═══════════════════════════════════════════════════════════════════════════════
import uuid


@app.post("/api/summary/start")
async def start_summary(req: SummaryStartRequest, db: Session = Depends(get_db)):
    session = db.query(StudySession).filter(StudySession.id == req.session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    all_docs = db.query(DocumentRecord).filter(DocumentRecord.session_id == req.session_id).all()
    if not all_docs:
        raise HTTPException(400, "No files uploaded in this session to summarize.")

    if req.file_ids == "all" or not req.file_ids:
        resolved_file_ids = [d.id for d in all_docs]
    elif isinstance(req.file_ids, list):
        resolved_file_ids = [d.id for d in all_docs if d.id in req.file_ids]
    else:
        resolved_file_ids = [d.id for d in all_docs]

    if not resolved_file_ids:
        raise HTTPException(400, "None of the requested files were found.")

    # Check cache first
    cache_key = generate_summary_key(req.session_id, resolved_file_ids, req.words, req.style)
    cached = db.query(SummaryCache).filter(
        SummaryCache.kind == "summary",
        SummaryCache.key == cache_key
    ).first()

    if cached and cached.content:
        return {
            "job_id": None,
            "cached": True,
            "text": cached.content,
            "word_count": cached.word_count,
            "words_target": cached.words_target or req.words,
            "style": cached.style or req.style,
            "created_at": cached.created_at.isoformat() if cached.created_at else None
        }

    job_id = str(uuid.uuid4())
    job = SummaryJob(
        job_id=job_id,
        session_id=req.session_id,
        file_ids=resolved_file_ids,
        words=req.words,
        style=req.style
    )
    active_summary_jobs[job_id] = job
    asyncio.create_task(run_summary_worker(job))

    return {"job_id": job_id, "cached": False}


@app.get("/api/summary/{job_id}/events")
async def summary_events(job_id: str):
    job = active_summary_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Summary job not found or expired")

    async def event_generator():
        while True:
            try:
                data = await asyncio.wait_for(job.queue.get(), timeout=25.0)
                yield {"event": "message", "data": json.dumps(data)}
                if data.get("done") or data.get("error") or data.get("cancelled"):
                    break
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": json.dumps({"status": job.status})}
                if job.status in ("COMPLETED", "ERROR", "CANCELLED"):
                    break

    return EventSourceResponse(event_generator())


@app.post("/api/summary/{job_id}/cancel")
def cancel_summary(job_id: str):
    job = active_summary_jobs.get(job_id)
    if not job:
        return {"status": "not_found"}
    job.cancel()
    return {"status": "cancelled"}


@app.get("/api/summary/blurbs")
async def get_file_blurbs(session_id: int = Query(...), db: Session = Depends(get_db)):
    docs = db.query(DocumentRecord).filter(DocumentRecord.session_id == session_id).all()
    blurbs = {}
    missing_docs = []

    for d in docs:
        cache_key = f"blurb_{d.id}"
        cached = db.query(SummaryCache).filter(
            SummaryCache.kind == "blurb",
            SummaryCache.key == cache_key
        ).first()
        if cached and cached.content:
            blurbs[str(d.id)] = cached.content
        else:
            missing_docs.append(d)

    for md in missing_docs:
        asyncio.create_task(queue_file_blurb(md.id, session_id))

    return blurbs





@app.get("/api/notebook")
def get_notebook_items(session_id: int = Query(...), db: Session = Depends(get_db)):
    items = db.query(NotebookItem).filter(
        NotebookItem.session_id == session_id
    ).order_by(NotebookItem.created_at.desc()).all()

    return [
        {
            "id": it.id,
            "session_id": it.session_id,
            "title": it.title,
            "content": it.content,
            "source": it.source or "Study Session",
            "created_at": it.created_at.isoformat() if it.created_at else None
        }
        for it in items
    ]


@app.post("/api/notebook")
def add_notebook_item(req: NotebookItemCreate, db: Session = Depends(get_db)):
    if not req.title.strip() or not req.content.strip():
        raise HTTPException(400, "Title and content cannot be empty")

    item = NotebookItem(
        session_id=req.session_id,
        title=req.title.strip(),
        content=req.content.strip(),
        source=req.source.strip() if req.source else "Study Session"
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "session_id": item.session_id,
        "title": item.title,
        "content": item.content,
        "source": item.source,
        "created_at": item.created_at.isoformat() if item.created_at else None
    }


@app.delete("/api/notebook/{item_id}")
def delete_notebook_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(NotebookItem).filter(NotebookItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Notebook item not found")
    db.delete(item)
    db.commit()
    return {"status": "deleted", "id": item_id}


@app.delete("/api/notebook/clear")
def clear_notebook(session_id: int = Query(...), db: Session = Depends(get_db)):
    deleted = db.query(NotebookItem).filter(NotebookItem.session_id == session_id).delete()
    db.commit()
    return {"status": "cleared", "count": deleted}


# ─── Mount Frontend Static Files (MUST be last) ──────────────────────────────
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    # Add backend dir to sys.path so relative imports work when executed directly
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
