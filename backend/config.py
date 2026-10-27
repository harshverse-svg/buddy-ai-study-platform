"""
BUDDY - AI Study Platform Configuration
All constants and environment settings in one place.
"""
import os

# ─── LLM Configuration ───────────────────────────────────────────────────────
MODEL_NAME = "gemma4:e4b"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_KEEP_ALIVE = -1  # Keep model permanently resident in VRAM
OLLAMA_NUM_CTX = 3072  # Context window accommodating notes and reasoning tokens

# ─── PaddleOCR CPU Enforcement ────────────────────────────────────────────────
os.environ["CUDA_VISIBLE_DEVICES"] = ""  # Force PaddleOCR strictly onto CPU
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
MARKDOWN_DIR = os.path.join(STORAGE_DIR, "markdown")
UPLOADS_DIR = os.path.join(STORAGE_DIR, "uploads")
DB_PATH = os.path.join(STORAGE_DIR, "aether_study.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# ─── Chunking Parameters ─────────────────────────────────────────────────────
CHUNK_WORD_SIZE = 400
CHUNK_OVERLAP = 50

# ─── RAG Parameters ──────────────────────────────────────────────────────────
BM25_TOP_K = 10
RERANK_TOP_K = 4

# ─── Book Generation ─────────────────────────────────────────────────────────
BOOK_MIN_CHAPTERS = 5
BOOK_MAX_CHAPTERS = 8

# ─── Quiz ─────────────────────────────────────────────────────────────────────
QUIZ_MIN_QUESTIONS = 5
QUIZ_MAX_QUESTIONS = 20

# ─── Concept Map ──────────────────────────────────────────────────────────────
CONCEPT_MAP_MIN_NODES = 12
CONCEPT_MAP_MAX_NODES = 22

# ─── Thinking Timer ──────────────────────────────────────────────────────────
THINKING_DURATION_SECONDS = 6.0

# ─── Frontend ─────────────────────────────────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

# Ensure directories exist
for d in [STORAGE_DIR, MARKDOWN_DIR, UPLOADS_DIR]:
    os.makedirs(d, exist_ok=True)
