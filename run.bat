@echo off
title BUDDY - AI Study Platform Launcher
echo ========================================================
echo   BUDDY - Autonomous Local AI Study Platform
echo   Optimized for 6GB VRAM (NVIDIA RTX 3050)
echo ========================================================
echo.

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ and try again.
    pause
    exit /b 1
)

:: Check Ollama
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Ollama CLI was not found in PATH.
    echo Ensure Ollama is installed and running with model: gemma4:e4b
    echo.
)

echo [1/2] Checking dependencies...
python -m pip install -q -r requirements.txt

echo [2/2] Launching BUDDY Backend on http://127.0.0.1:8000...
echo.
start http://127.0.0.1:8000
python backend\main.py

pause
