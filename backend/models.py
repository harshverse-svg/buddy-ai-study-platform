"""
BUDDY - SQLAlchemy ORM Models
All database tables for the study platform.
"""
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey,
    create_engine, event
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime, timezone
from config import DATABASE_URL

Base = declarative_base()


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(256), nullable=False, default="Untitled Session")
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    documents = relationship("DocumentRecord", back_populates="session", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    quizzes = relationship("QuizAttempt", back_populates="session", cascade="all, delete-orphan")
    books = relationship("GeneratedBook", back_populates="session", cascade="all, delete-orphan")
    concept_maps = relationship("ConceptMap", back_populates="session", cascade="all, delete-orphan")
    ask_messages = relationship("AskMessage", back_populates="session", cascade="all, delete-orphan")


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    filename = Column(String(512), nullable=False)
    file_type = Column(String(16), nullable=False)
    ocr_used = Column(Boolean, default=False)
    md_path = Column(String(1024), nullable=True)
    chunk_count = Column(Integer, default=0)
    token_savings_pct = Column(Float, default=0.0)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="documents")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    sub_queries_json = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    sources_json = Column(Text, nullable=True)
    thinking_time_sec = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="messages")


class AskMessage(Base):
    __tablename__ = "ask_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    thinking_time_sec = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="ask_messages")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    difficulty_label = Column(String(32), nullable=False)
    total_questions = Column(Integer, nullable=False)
    correct_answers = Column(Integer, default=0)
    score_percentage = Column(Float, default=0.0)
    topic_breakdown_json = Column(Text, nullable=True)
    questions_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="quizzes")


class GeneratedBook(Base):
    __tablename__ = "generated_books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    title = Column(String(512), default="Study Guide")
    status = Column(String(16), default="IDLE")  # IDLE | GENERATING | PAUSED | COMPLETED
    total_chapters = Column(Integer, default=0)
    completed_chapters = Column(Integer, default=0)
    chapters_json = Column(Text, nullable=True)  # JSON array of chapter objects
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="books")


class ConceptMap(Base):
    __tablename__ = "concept_maps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    nodes_json = Column(Text, nullable=True)
    edges_json = Column(Text, nullable=True)
    one_page_summary_md = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("StudySession", back_populates="concept_maps")


class SummaryCache(Base):
    __tablename__ = "summary_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    kind = Column(String(32), nullable=False)  # 'notes' | 'blurb' | 'summary'
    key = Column(String(128), index=True, nullable=False)
    file_ids = Column(Text, nullable=True)  # JSON list of file IDs
    words_target = Column(Integer, nullable=True)
    style = Column(String(32), nullable=True)  # 'paragraph' | 'bullets' | 'exam_notes'
    content = Column(Text, nullable=False)
    word_count = Column(Integer, default=0)
    status = Column(String(16), default="COMPLETED")  # 'PENDING' | 'COMPLETED' | 'FAILED'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class NotebookItem(Base):
    __tablename__ = "notebook_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    title = Column(String(512), nullable=False)
    content = Column(Text, nullable=False)
    source = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

