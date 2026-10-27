"""
BUDDY - Thread-Safe SQLite Database Module
WAL mode + check_same_thread=False for concurrent access.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
import logging
from config import DATABASE_URL
from models import (
    Base, StudySession, DocumentRecord, ChatMessage, AskMessage,
    QuizAttempt, GeneratedBook, ConceptMap
)

logger = logging.getLogger("buddy.database")

# ─── Engine with thread-safety ────────────────────────────────────────────────
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    pool_pre_ping=True,
    echo=False
)

# Enable WAL mode on every new connection
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=30000;")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """FastAPI dependency for DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables if they don't exist and ensure schema migrations."""
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            cursor = conn.execute(text("PRAGMA table_info(study_sessions);"))
            columns = [row[1] for row in cursor.fetchall()]
            if "is_deleted" not in columns:
                conn.execute(text("ALTER TABLE study_sessions ADD COLUMN is_deleted BOOLEAN DEFAULT 0;"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Could not check/alter study_sessions table: {e}")


def seed_demo_data():
    """Seed demo data if database is empty (for hackathon judges)."""
    db = SessionLocal()
    try:
        count = db.query(StudySession).count()
        if count > 0:
            db.close()
            return

        # Demo Study Session
        demo_session = StudySession(
            title="📚 Machine Learning Fundamentals",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(demo_session)
        db.flush()

        # Demo Document
        demo_doc = DocumentRecord(
            session_id=demo_session.id,
            filename="ml_foundations.pdf",
            file_type=".pdf",
            ocr_used=False,
            md_path="storage/markdown/ml_foundations.md",
            chunk_count=24,
            token_savings_pct=92.5,
            uploaded_at=datetime.now(timezone.utc)
        )
        db.add(demo_doc)

        # Demo Concept Map
        demo_nodes = json.dumps([
            {"id": "n1", "label": "Machine Learning", "category": "Core Theme",
             "summary": "The study of algorithms that learn from data to make predictions.", "source": "ml_foundations.pdf"},
            {"id": "n2", "label": "Supervised Learning", "category": "Chapter",
             "summary": "Learning from labeled examples to predict outcomes on new data.", "source": "ml_foundations.pdf"},
            {"id": "n3", "label": "Unsupervised Learning", "category": "Chapter",
             "summary": "Finding hidden patterns in data without labeled outcomes.", "source": "ml_foundations.pdf"},
            {"id": "n4", "label": "Linear Regression", "category": "Sub-Concept",
             "summary": "Models the relationship between variables using a linear equation y = mx + b.", "source": "ml_foundations.pdf"},
            {"id": "n5", "label": "Decision Trees", "category": "Sub-Concept",
             "summary": "Tree-structured classifier that splits data based on feature thresholds.", "source": "ml_foundations.pdf"},
            {"id": "n6", "label": "K-Means Clustering", "category": "Sub-Concept",
             "summary": "Partitions data into K clusters by minimizing within-cluster variance.", "source": "ml_foundations.pdf"},
            {"id": "n7", "label": "Gradient Descent", "category": "Formula",
             "summary": "Optimization algorithm: θ = θ - α·∇J(θ) to minimize loss functions.", "source": "ml_foundations.pdf"},
            {"id": "n8", "label": "Neural Networks", "category": "Chapter",
             "summary": "Multi-layer perceptrons that learn non-linear representations.", "source": "ml_foundations.pdf"},
            {"id": "n9", "label": "Backpropagation", "category": "Formula",
             "summary": "Chain rule applied to compute gradients through network layers.", "source": "ml_foundations.pdf"},
            {"id": "n10", "label": "Overfitting", "category": "Sub-Concept",
             "summary": "When a model memorizes training data but fails on unseen data.", "source": "ml_foundations.pdf"},
            {"id": "n11", "label": "Cross-Validation", "category": "Sub-Concept",
             "summary": "K-fold technique to estimate model generalization performance.", "source": "ml_foundations.pdf"},
            {"id": "n12", "label": "Loss Function", "category": "Formula",
             "summary": "MSE = (1/n)Σ(yi - ŷi)² measures prediction error magnitude.", "source": "ml_foundations.pdf"},
        ])
        demo_edges = json.dumps([
            {"source": "n1", "target": "n2", "label": "includes"},
            {"source": "n1", "target": "n3", "label": "includes"},
            {"source": "n1", "target": "n8", "label": "includes"},
            {"source": "n2", "target": "n4", "label": "uses"},
            {"source": "n2", "target": "n5", "label": "uses"},
            {"source": "n3", "target": "n6", "label": "uses"},
            {"source": "n4", "target": "n7", "label": "optimized by"},
            {"source": "n8", "target": "n9", "label": "trained via"},
            {"source": "n4", "target": "n12", "label": "minimizes"},
            {"source": "n2", "target": "n10", "label": "risk of"},
            {"source": "n10", "target": "n11", "label": "mitigated by"},
            {"source": "n7", "target": "n12", "label": "minimizes"},
        ])
        demo_cmap = ConceptMap(
            session_id=demo_session.id,
            nodes_json=demo_nodes,
            edges_json=demo_edges,
            one_page_summary_md="""# 📋 Machine Learning — Master Cheat Sheet

## Key Definitions
| Term | Definition |
|------|-----------|
| Supervised Learning | Learn from labeled data (X→Y mapping) |
| Unsupervised Learning | Find structure in unlabeled data |
| Gradient Descent | Iterative optimizer: θ = θ - α·∇J(θ) |
| Overfitting | Model memorizes noise instead of patterns |

## Must-Know Formulas
- **MSE Loss**: `L = (1/n) Σ(yᵢ - ŷᵢ)²`
- **Gradient Update**: `θ ← θ - α · ∂L/∂θ`
- **Sigmoid**: `σ(z) = 1 / (1 + e⁻ᶻ)`

## Common Exam Traps
1. Confusing **bias** (underfitting) with **variance** (overfitting)
2. Forgetting to normalize features before gradient descent
3. Using accuracy for imbalanced datasets (use F1/AUC instead)

## Quick Summary
Machine Learning models learn patterns from data. Supervised methods predict labels, unsupervised methods find clusters. All models minimize a loss function via gradient descent and must be validated with cross-validation to prevent overfitting.
""",
            created_at=datetime.now(timezone.utc)
        )
        db.add(demo_cmap)

        # Demo Quiz Attempts (3 historical)
        quiz_data = [
            {"diff": "Foundational", "total": 10, "correct": 8, "score": 80.0,
             "breakdown": json.dumps({"Linear Regression": {"correct": 3, "total": 3},
                                      "Decision Trees": {"correct": 2, "total": 3},
                                      "K-Means": {"correct": 3, "total": 4}})},
            {"diff": "Conceptual", "total": 10, "correct": 6, "score": 60.0,
             "breakdown": json.dumps({"Gradient Descent": {"correct": 2, "total": 3},
                                      "Overfitting": {"correct": 1, "total": 3},
                                      "Neural Networks": {"correct": 3, "total": 4}})},
            {"diff": "Analytical", "total": 10, "correct": 9, "score": 90.0,
             "breakdown": json.dumps({"Backpropagation": {"correct": 3, "total": 3},
                                      "Cross-Validation": {"correct": 3, "total": 3},
                                      "Loss Functions": {"correct": 3, "total": 4}})},
        ]
        for qd in quiz_data:
            db.add(QuizAttempt(
                session_id=demo_session.id,
                difficulty_label=qd["diff"],
                total_questions=qd["total"],
                correct_answers=qd["correct"],
                score_percentage=qd["score"],
                topic_breakdown_json=qd["breakdown"],
                questions_json="[]",
                created_at=datetime.now(timezone.utc)
            ))

        # Create demo markdown file
        import os
        demo_md_path = os.path.join(os.path.dirname(__file__), "storage", "markdown", "ml_foundations.md")
        with open(demo_md_path, "w", encoding="utf-8") as f:
            f.write("""# Machine Learning Fundamentals

## Chapter 1: Introduction to Machine Learning
Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data.
Rather than being explicitly programmed, these systems improve their performance through experience.

### Types of Machine Learning
- **Supervised Learning**: The algorithm learns from labeled training data
- **Unsupervised Learning**: The algorithm finds hidden patterns in unlabeled data  
- **Reinforcement Learning**: The agent learns by interacting with an environment

## Chapter 2: Linear Regression
Linear regression models the relationship between a dependent variable y and independent variables X.
The goal is to find the best-fit line: y = wx + b where w is the weight and b is the bias.

### Gradient Descent
The optimization algorithm updates parameters iteratively:
θ = θ - α · ∇J(θ)
where α is the learning rate and ∇J(θ) is the gradient of the cost function.

## Chapter 3: Decision Trees
Decision trees split the data into branches based on feature values.
They use metrics like Information Gain and Gini Impurity to determine the best splits.

## Chapter 4: Neural Networks
Neural networks consist of layers of interconnected nodes (neurons).
Each connection has a weight, and each neuron applies an activation function.
Backpropagation computes gradients using the chain rule to update weights.

## Chapter 5: Model Evaluation
Overfitting occurs when a model performs well on training data but poorly on test data.
Cross-validation (K-fold) helps estimate how well a model generalizes.
Common metrics: Accuracy, Precision, Recall, F1-Score, AUC-ROC.
""")

        db.commit()
        logger.info("[OK] Demo data seeded successfully!")
    except Exception as e:
        db.rollback()
        logger.warning(f"[WARN] Demo seeding error (non-fatal): {e}")
    finally:
        db.close()
