"""Data access for AI module: prompt templates + explanation history."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text

from app import config as app_config
from app.db import get_engine, session as _db_session

logger = logging.getLogger("converter.ai")


def _is_sqlite() -> bool:
    return "sqlite" in app_config.DATABASE_URL


def _is_mysql() -> bool:
    return "mysql" in app_config.DATABASE_URL


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


_SQLITE_DDL = [
    """
    CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        system_prompt TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_explanations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        template_id TEXT,
        prompt TEXT NOT NULL,
        system_prompt TEXT,
        response TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompt_templates(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_ai_explain_session ON ai_explanations(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_ai_explain_task ON ai_explanations(task_id)",
]


_MYSQL_DDL = [
    """
    CREATE TABLE IF NOT EXISTS prompt_templates (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        system_prompt TEXT,
        is_default TINYINT NOT NULL DEFAULT 0,
        created_at VARCHAR(50) NOT NULL,
        updated_at VARCHAR(50) NOT NULL,
        INDEX idx_prompts_session (session_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_explanations (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        task_id VARCHAR(255) NOT NULL,
        template_id VARCHAR(64),
        prompt TEXT NOT NULL,
        system_prompt TEXT,
        response MEDIUMTEXT NOT NULL,
        model VARCHAR(128) NOT NULL,
        input_tokens INT,
        output_tokens INT,
        created_at VARCHAR(50) NOT NULL,
        INDEX idx_ai_explain_session (session_id),
        INDEX idx_ai_explain_task (task_id)
    )
    """,
]


_SQLSERVER_DDL = [
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'prompt_templates')
    CREATE TABLE prompt_templates (
        id NVARCHAR(64) PRIMARY KEY,
        session_id NVARCHAR(255) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        system_prompt NVARCHAR(MAX),
        is_default BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL,
        updated_at DATETIME2 NOT NULL
    )
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ai_explanations')
    CREATE TABLE ai_explanations (
        id NVARCHAR(64) PRIMARY KEY,
        session_id NVARCHAR(255) NOT NULL,
        task_id NVARCHAR(255) NOT NULL,
        template_id NVARCHAR(64),
        prompt NVARCHAR(MAX) NOT NULL,
        system_prompt NVARCHAR(MAX),
        response NVARCHAR(MAX) NOT NULL,
        model NVARCHAR(128) NOT NULL,
        input_tokens INT,
        output_tokens INT,
        created_at DATETIME2 NOT NULL
    )
    """,
]


# Built-in starter templates seeded the first time a session opens the AI view.
DEFAULT_TEMPLATES = [
    {
        "name": "Describe the image",
        "body": "Describe this image in 2-3 sentences. Mention the subject, mood, colors, and composition.",
        "system_prompt": "You are a concise visual critic. Use plain language.",
    },
    {
        "name": "Suggest compression settings",
        "body": (
            "Based on this image, recommend optimal output format and settings for web use. "
            "Consider format (WebP/JPEG/PNG/AVIF), quality (0-100), and whether to strip metadata or use progressive encoding. "
            "Explain your reasoning briefly."
        ),
        "system_prompt": "You are an expert in image optimization for the web.",
    },
    {
        "name": "Suggest social crops",
        "body": (
            "Looking at the composition and subject, suggest which social media sizes work best for this image "
            "(Instagram square 1:1, portrait 4:5, story 9:16, Twitter 16:9, etc.) and which would be poor choices. "
            "Note any subjects that would be lost in tighter crops."
        ),
        "system_prompt": "You are a social media designer.",
    },
    {
        "name": "Alt text",
        "body": "Write concise, accessible alt text for this image (max 125 characters). Focus on what is essential to convey the image's meaning.",
        "system_prompt": "You write accessibility-focused alt text.",
    },
]


def _try(conn, sql: str) -> None:
    try:
        conn.execute(text(sql))
    except Exception:
        pass


def ensure_ai_tables() -> None:
    """Create AI tables. Idempotent."""
    engine = get_engine()
    with engine.connect() as conn:
        if _is_sqlite():
            for stmt in _SQLITE_DDL:
                conn.execute(text(stmt))
        elif _is_mysql():
            for stmt in _MYSQL_DDL:
                conn.execute(text(stmt))
        else:
            for stmt in _SQLSERVER_DDL:
                conn.execute(text(stmt))
        conn.commit()
    logger.info("AI tables ensured (prompt_templates, ai_explanations)")


# -------- prompt templates --------

def seed_default_templates(session_id: str) -> None:
    """Insert built-in templates the first time a session asks for prompts. Idempotent (skips if any exist)."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT COUNT(*) FROM prompt_templates WHERE session_id = :sid"),
            {"sid": session_id},
        ).fetchone()
        if row and row[0] and int(row[0]) > 0:
            return
    now = _now_iso()
    with _db_session() as conn:
        for tpl in DEFAULT_TEMPLATES:
            conn.execute(
                text(
                    "INSERT INTO prompt_templates (id, session_id, name, body, system_prompt, is_default, created_at, updated_at) "
                    "VALUES (:id, :sid, :name, :body, :sys, 1, :now, :now)"
                ),
                {
                    "id": _new_id(),
                    "sid": session_id,
                    "name": tpl["name"],
                    "body": tpl["body"],
                    "sys": tpl.get("system_prompt"),
                    "now": now,
                },
            )


def list_templates(session_id: str) -> list[dict]:
    seed_default_templates(session_id)
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, name, body, system_prompt, is_default, created_at, updated_at "
                "FROM prompt_templates WHERE session_id = :sid ORDER BY is_default DESC, name ASC"
            ),
            {"sid": session_id},
        ).fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "body": r[2],
            "system_prompt": r[3],
            "is_default": bool(r[4]),
            "created_at": r[5],
            "updated_at": r[6],
        }
        for r in rows
    ]


def get_template(session_id: str, template_id: str) -> Optional[dict]:
    with get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT id, name, body, system_prompt, is_default, created_at, updated_at "
                "FROM prompt_templates WHERE id = :id AND session_id = :sid"
            ),
            {"id": template_id, "sid": session_id},
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "body": row[2],
        "system_prompt": row[3],
        "is_default": bool(row[4]),
        "created_at": row[5],
        "updated_at": row[6],
    }


def create_template(session_id: str, name: str, body: str, system_prompt: Optional[str]) -> dict:
    now = _now_iso()
    tid = _new_id()
    with _db_session() as conn:
        conn.execute(
            text(
                "INSERT INTO prompt_templates (id, session_id, name, body, system_prompt, is_default, created_at, updated_at) "
                "VALUES (:id, :sid, :name, :body, :sys, 0, :now, :now)"
            ),
            {"id": tid, "sid": session_id, "name": name, "body": body, "sys": system_prompt, "now": now},
        )
    return {
        "id": tid,
        "name": name,
        "body": body,
        "system_prompt": system_prompt,
        "is_default": False,
        "created_at": now,
        "updated_at": now,
    }


def update_template(
    session_id: str,
    template_id: str,
    *,
    name: Optional[str] = None,
    body: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> Optional[dict]:
    existing = get_template(session_id, template_id)
    if not existing:
        return None
    fields = []
    params: dict = {"id": template_id, "sid": session_id, "now": _now_iso()}
    if name is not None:
        fields.append("name = :name")
        params["name"] = name
    if body is not None:
        fields.append("body = :body")
        params["body"] = body
    if system_prompt is not None:
        fields.append("system_prompt = :sys")
        params["sys"] = system_prompt
    if not fields:
        return existing
    fields.append("updated_at = :now")
    with _db_session() as conn:
        conn.execute(
            text(f"UPDATE prompt_templates SET {', '.join(fields)} WHERE id = :id AND session_id = :sid"),
            params,
        )
    return get_template(session_id, template_id)


def delete_template(session_id: str, template_id: str) -> bool:
    with _db_session() as conn:
        result = conn.execute(
            text("DELETE FROM prompt_templates WHERE id = :id AND session_id = :sid"),
            {"id": template_id, "sid": session_id},
        )
    return result.rowcount > 0


# -------- explanation history --------

def insert_explanation(
    session_id: str,
    task_id: str,
    *,
    template_id: Optional[str],
    prompt: str,
    system_prompt: Optional[str],
    response: str,
    model: str,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
) -> dict:
    now = _now_iso()
    eid = _new_id()
    with _db_session() as conn:
        conn.execute(
            text(
                "INSERT INTO ai_explanations (id, session_id, task_id, template_id, prompt, system_prompt, response, model, input_tokens, output_tokens, created_at) "
                "VALUES (:id, :sid, :task, :tpl, :prompt, :sys, :resp, :model, :it, :ot, :now)"
            ),
            {
                "id": eid,
                "sid": session_id,
                "task": task_id,
                "tpl": template_id,
                "prompt": prompt,
                "sys": system_prompt,
                "resp": response,
                "model": model,
                "it": input_tokens,
                "ot": output_tokens,
                "now": now,
            },
        )
    return {
        "id": eid,
        "task_id": task_id,
        "template_id": template_id,
        "prompt": prompt,
        "system_prompt": system_prompt,
        "response": response,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "created_at": now,
    }


def list_explanations(session_id: str, task_id: Optional[str] = None, limit: int = 50) -> list[dict]:
    sql = (
        "SELECT id, task_id, template_id, prompt, system_prompt, response, model, input_tokens, output_tokens, created_at "
        "FROM ai_explanations WHERE session_id = :sid"
    )
    params: dict = {"sid": session_id, "lim": limit}
    if task_id is not None:
        sql += " AND task_id = :task"
        params["task"] = task_id
    sql += " ORDER BY created_at DESC LIMIT :lim"
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
    return [
        {
            "id": r[0],
            "task_id": r[1],
            "template_id": r[2],
            "prompt": r[3],
            "system_prompt": r[4],
            "response": r[5],
            "model": r[6],
            "input_tokens": r[7],
            "output_tokens": r[8],
            "created_at": r[9],
        }
        for r in rows
    ]


def delete_explanation(session_id: str, explanation_id: str) -> bool:
    with _db_session() as conn:
        result = conn.execute(
            text("DELETE FROM ai_explanations WHERE id = :id AND session_id = :sid"),
            {"id": explanation_id, "sid": session_id},
        )
    return result.rowcount > 0


def delete_ai_session_data(session_id: str) -> None:
    """Wipe AI-scoped data for the session. Called from db.delete_session_data."""
    with _db_session() as conn:
        conn.execute(text("DELETE FROM ai_explanations WHERE session_id = :sid"), {"sid": session_id})
        conn.execute(text("DELETE FROM prompt_templates WHERE session_id = :sid"), {"sid": session_id})
