# Contributing to BUDDY 🧠

Thank you for your interest in contributing to **BUDDY — AI Study Platform**! We welcome contributions from developers, researchers, and students around the world.

---

## 🌟 Hackathon & Development Guidelines

### 1. Code Style & Philosophy
- **Zero Cloud Leakage**: Ensure all AI inference, document parsing, and database transactions remain 100% local. No third-party cloud analytics or external API dependencies without explicit toggles.
- **VRAM Sensitivity**: All background workers and document parsers MUST run on CPU to reserve the GPU for local LLM inference (under 6GB VRAM budget).
- **Python Backend**: Follow PEP 8 guidelines. Write clear docstrings and maintain defensive JSON parsers for model interactions.
- **Frontend Architecture**: Keep the vanilla ES6+ & Three.js stack modular, fast, and dependency-light.

---

## 🛠️ Development Setup

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/harshverse-svg/buddy-ai-study-platform.git
   cd buddy-ai-study-platform
   ```

2. **Set up a Virtual Environment**:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Start Ollama & Serve the Model**:
   ```bash
   ollama pull gemma4:e4b
   ollama serve
   ```

5. **Run the Application**:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
   Open `http://localhost:8000` in your browser.

---

## 🔀 Submitting Pull Requests

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Commit your changes with conventional commit syntax:
   - `feat(chat): add voice input streaming`
   - `fix(rag): optimize BM25 tokenization for mathematical symbols`
   - `docs: update hardware benchmark table`
3. Push to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
4. Open a Pull Request on GitHub with a clear description and testing steps.

---

## 🛡️ Reporting Security Issues & Bugs

If you discover a bug or security issue, please open an Issue on GitHub with:
- Operating System & GPU specifications
- Ollama model version & context size
- Reproducible steps or sample document snippet
