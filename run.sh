#!/usr/bin/env bash
# ==============================================================================
# BUDDY - Autonomous Local AI Study Platform Launcher
# ==============================================================================

set -e

echo "========================================================"
echo "  BUDDY - Autonomous Local AI Study Platform"
echo "  Optimized for 6GB VRAM (NVIDIA RTX 3050)"
echo "========================================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3.10+."
    exit 1
fi

if ! command -v ollama &> /dev/null; then
    echo "[WARNING] Ollama CLI not detected in PATH. Ensure Ollama is running."
fi

echo "[1/2] Installing/Verifying Python dependencies..."
python3 -m pip install -q -r requirements.txt

echo "[2/2] Starting BUDDY server on http://127.0.0.1:8000..."
python3 backend/main.py
