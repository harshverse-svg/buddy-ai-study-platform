"""
BUDDY - Smart Hybrid Ingestion Engine
MarkItDown + PyMuPDF digital-first, PaddleOCR CPU fallback for scanned pages.
"""
import os
import re
import asyncio
import tempfile
import logging
from typing import List, Tuple, Optional

import pymupdf as fitz  # PyMuPDF

from config import MARKDOWN_DIR, UPLOADS_DIR, CHUNK_WORD_SIZE, CHUNK_OVERLAP

logger = logging.getLogger("buddy.ingestion")

# ─── Lazy Singleton PaddleOCR (CPU Only) ─────────────────────────────────────
_ocr_instance = None
_ocr_lock = asyncio.Lock()
_ocr_available = None  # None = not checked, True/False = result


def _init_paddleocr_sync():
    """
    Initialize PaddleOCR as a singleton. Supports both v2.x and v3.x APIs.
    Runs on CPU only (CUDA_VISIBLE_DEVICES="" set in config.py).
    """
    global _ocr_instance, _ocr_available
    try:
        # pyrefly: ignore[missing-import]
        from paddleocr import PaddleOCR
        # Try v3.x API first
        try:
            _ocr_instance = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
                lang="en"
            )
            logger.info("[OK] PaddleOCR v3.x initialized (CPU)")
        except (TypeError, ValueError):
            # Fallback to v2.x API
            _ocr_instance = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                use_gpu=False,
                show_log=False
            )
            logger.info("[OK] PaddleOCR v2.x initialized (CPU)")
        _ocr_available = True
    except ImportError:
        logger.warning("[WARN] PaddleOCR not available - OCR fallback disabled. "
                       "Digital text extraction via PyMuPDF still works.")
        _ocr_available = False
    except Exception as e:
        logger.warning(f"[WARN] PaddleOCR init failed: {e} - OCR fallback disabled.")
        _ocr_available = False


async def get_ocr_instance():
    """Get or initialize the PaddleOCR singleton lazily in a background thread."""
    global _ocr_instance, _ocr_available
    if _ocr_available is None:
        async with _ocr_lock:
            if _ocr_available is None:
                await asyncio.to_thread(_init_paddleocr_sync)
    return _ocr_instance


def _run_ocr_sync(image_path: str) -> str:
    """Run OCR on an image file. Supports both v2.x and v3.x PaddleOCR APIs."""
    global _ocr_instance
    if _ocr_instance is None:
        return ""
    try:
        # v3.x API: predict() method
        if hasattr(_ocr_instance, "predict"):
            result = _ocr_instance.predict(image_path)
            if result and isinstance(result, dict) and "rec_texts" in result:
                return "\n".join(result["rec_texts"])
            elif result and isinstance(result, list):
                texts = []
                for item in result:
                    if isinstance(item, dict) and "rec_texts" in item:
                        texts.extend(item["rec_texts"])
                return "\n".join(texts)
        # v2.x API: ocr() method
        result = _ocr_instance.ocr(image_path, cls=True)
        if result and result[0]:
            lines = [line[1][0] for line in result[0] if line[1]]
            return "\n".join(lines)
    except Exception as e:
        logger.error(f"OCR error on {image_path}: {e}")
    return ""


async def run_ocr_async(image_path: str) -> str:
    """Run OCR in a background thread to avoid blocking the event loop."""
    await get_ocr_instance()
    if not _ocr_available:
        return ""
    return await asyncio.to_thread(_run_ocr_sync, image_path)


# ─── MarkItDown Wrapper ──────────────────────────────────────────────────────
def _markitdown_convert_sync(file_path: str) -> str:
    """Convert a document using MarkItDown."""
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        return result.text_content if result and result.text_content else ""
    except Exception as e:
        logger.error(f"MarkItDown error on {file_path}: {e}")
        return ""


async def markitdown_convert(file_path: str) -> str:
    """Async wrapper for MarkItDown conversion."""
    return await asyncio.to_thread(_markitdown_convert_sync, file_path)


def _write_text_file_sync(path: str, content: str):
    """Write text to file synchronously in worker thread."""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _read_text_file_sync(path: str) -> str:
    """Read text from file synchronously in worker thread."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


# ─── PDF Ingestion (Digital-First, OCR Fallback) ─────────────────────────────
async def ingest_pdf(file_path: str) -> Tuple[str, bool]:
    """
    Ingest a PDF: extract digital text immediately with PyMuPDF per page.
    Only run PaddleOCR if PyMuPDF extracts fewer than 30 characters of stripped text.
    Returns (markdown_text, ocr_was_used).
    """
    ocr_used = False
    markdown_parts = []

    try:
        doc = await asyncio.to_thread(fitz.open, file_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            # Digital text extraction with PyMuPDF — immediate
            raw_text = page.get_text("text") or ""
            text = raw_text.strip()

            if len(text) >= 30:
                # Digital text extraction — fast and immediate
                markdown_parts.append(f"\n## Page {page_num + 1}\n\n{text}")
            else:
                # Scanned page (fewer than 30 stripped characters) — try OCR
                if _ocr_available is not False:
                    try:
                        pix = await asyncio.to_thread(page.get_pixmap, dpi=200)
                        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                            await asyncio.to_thread(pix.save, tmp.name)
                            tmp_path = tmp.name

                        ocr_text = await run_ocr_async(tmp_path)
                        if ocr_text.strip():
                            markdown_parts.append(f"\n## Page {page_num + 1} (OCR)\n\n{ocr_text.strip()}")
                            ocr_used = True
                        else:
                            markdown_parts.append(f"\n## Page {page_num + 1}\n\n[Scanned page — no text detected]")

                        try:
                            os.unlink(tmp_path)
                        except Exception:
                            pass
                    except Exception as e:
                        logger.error(f"OCR fallback error on page {page_num + 1}: {e}")
                        markdown_parts.append(f"\n## Page {page_num + 1}\n\n[Scanned page — OCR unavailable]")
                else:
                    markdown_parts.append(f"\n## Page {page_num + 1}\n\n[Scanned page — OCR not installed]")

        await asyncio.to_thread(doc.close)
    except Exception as e:
        logger.error(f"PDF ingestion error: {e}")
        # Fallback to MarkItDown
        text = await markitdown_convert(file_path)
        return text, False

    return "\n".join(markdown_parts), ocr_used


# ─── Excel Ingestion ─────────────────────────────────────────────────────────
async def ingest_excel(file_path: str) -> str:
    """Ingest .xlsx/.csv files using MarkItDown with openpyxl/pandas fallback."""
    text = await markitdown_convert(file_path)
    if text.strip():
        return text

    # Pandas fallback for multi-sheet workbooks
    try:
        import pandas as pd
        ext = os.path.splitext(file_path)[1].lower()
        parts = []
        if ext == ".csv":
            df = await asyncio.to_thread(pd.read_csv, file_path)
            parts.append(f"## Data\n\n{df.to_markdown(index=False)}")
        else:
            xls = await asyncio.to_thread(pd.ExcelFile, file_path)
            for sheet in xls.sheet_names:
                df = await asyncio.to_thread(pd.read_excel, file_path, sheet_name=sheet)
                parts.append(f"## {sheet}\n\n{df.to_markdown(index=False)}")
        return "\n\n".join(parts)
    except Exception as e:
        logger.error(f"Excel ingestion error: {e}")
        return f"[Error processing file: {e}]"


# ─── Image Ingestion (Direct OCR) ────────────────────────────────────────────
async def ingest_image(file_path: str) -> Tuple[str, bool]:
    """Ingest .png/.jpg files via PaddleOCR."""
    text = await run_ocr_async(file_path)
    if text.strip():
        return text, True
    return "[No text detected in image]", False


# ─── Generic Document Ingestion ──────────────────────────────────────────────
async def ingest_document(file_path: str) -> Tuple[str, str, bool, int]:
    """
    Main ingestion entry point. Non-blocking asynchronous extraction and chunking.
    Returns: (markdown_text, md_filename, ocr_used, chunk_count)
    """
    ext = os.path.splitext(file_path)[1].lower()
    basename = os.path.splitext(os.path.basename(file_path))[0]
    ocr_used = False

    if ext == ".pdf":
        text, ocr_used = await ingest_pdf(file_path)
    elif ext in (".xlsx", ".csv"):
        text = await ingest_excel(file_path)
    elif ext in (".docx", ".doc"):
        text = await markitdown_convert(file_path)
    elif ext in (".md", ".txt"):
        text = await asyncio.to_thread(_read_text_file_sync, file_path)
    elif ext in (".png", ".jpg", ".jpeg"):
        text, ocr_used = await ingest_image(file_path)
    else:
        text = await markitdown_convert(file_path)

    # Add source header
    full_markdown = f"---\nsource: {os.path.basename(file_path)}\n---\n\n{text}"

    # Save as .md asynchronously without blocking the event loop
    md_filename = f"{basename}.md"
    md_path = os.path.join(MARKDOWN_DIR, md_filename)
    await asyncio.to_thread(_write_text_file_sync, md_path, full_markdown)

    # Chunk the document asynchronously without blocking the event loop
    chunks = await asyncio.to_thread(chunk_markdown, full_markdown, os.path.basename(file_path))

    return full_markdown, md_filename, ocr_used, len(chunks)


# ─── Chunking Engine ─────────────────────────────────────────────────────────
def chunk_markdown(text: str, source_filename: str = "unknown") -> List[dict]:
    """
    Split markdown into semantic chunks of ~400 words with 50-word overlap.
    Each chunk preserves source metadata.
    """
    words = text.split()
    chunks = []
    start = 0

    while start < len(words):
        end = min(start + CHUNK_WORD_SIZE, len(words))
        chunk_text = " ".join(words[start:end])
        chunks.append({
            "text": chunk_text,
            "source": source_filename,
            "chunk_index": len(chunks),
            "word_count": end - start
        })
        if end >= len(words):
            break
        start = end - CHUNK_OVERLAP

    return chunks


def get_session_chunks(session_id: int, db) -> List[dict]:
    """Load all chunks for a given session from saved markdown files."""
    from models import DocumentRecord
    docs = db.query(DocumentRecord).filter(DocumentRecord.session_id == session_id).all()
    all_chunks = []
    for doc in docs:
        md_path = os.path.join(MARKDOWN_DIR, os.path.basename(doc.md_path or ""))
        if os.path.exists(md_path):
            with open(md_path, "r", encoding="utf-8") as f:
                text = f.read()
            chunks = chunk_markdown(text, doc.filename)
            current_page = 1
            for chunk in chunks:
                pages_found = re.findall(r'## Page\s+(\d+)', chunk["text"])
                if pages_found:
                    page_start = int(pages_found[0])
                    page_end = int(pages_found[-1])
                    current_page = page_end
                else:
                    page_start = current_page
                    page_end = current_page

                chunk["file_id"] = doc.id
                chunk["page_start"] = page_start
                chunk["page_end"] = page_end
                all_chunks.append(chunk)
    return all_chunks
