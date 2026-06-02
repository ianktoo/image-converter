"""Data access for organize tables (projects, folders, tags, media_tags) + session_activities extensions.

All entities are session-scoped via session_id. Media items are surfaced as a view over
session_activities (the existing per-conversion record), enriched with optional project/folder
membership, notes, kind, and mime_type added in Phase 2.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text

from app import config as app_config
from app.db import get_engine, session as _db_session

logger = logging.getLogger("converter.organize")


# -------- helpers --------

def _is_sqlite() -> bool:
    return "sqlite" in app_config.DATABASE_URL


def _is_mysql() -> bool:
    return "mysql" in app_config.DATABASE_URL


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# -------- DDL --------

_SQLITE_DDL = [
    """
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_id TEXT,
        parent_id TEXT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(session_id, name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS media_tags (
        task_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, tag_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_projects_session ON projects(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_folders_session ON folders(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)",
    "CREATE INDEX IF NOT EXISTS idx_tags_session ON tags(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_media_tags_task ON media_tags(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id)",
]


_SQLITE_ALTER_SESSION_ACTIVITIES = [
    "ALTER TABLE session_activities ADD COLUMN project_id TEXT",
    "ALTER TABLE session_activities ADD COLUMN folder_id TEXT",
    "ALTER TABLE session_activities ADD COLUMN notes TEXT",
    "ALTER TABLE session_activities ADD COLUMN kind TEXT",
    "ALTER TABLE session_activities ADD COLUMN mime_type TEXT",
    "ALTER TABLE session_activities ADD COLUMN output_paths_json TEXT",
    "ALTER TABLE session_activities ADD COLUMN source_path TEXT",
]


_MYSQL_DDL = [
    """
    CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(16),
        created_at VARCHAR(50) NOT NULL,
        updated_at VARCHAR(50) NOT NULL,
        INDEX idx_projects_session (session_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS folders (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        project_id VARCHAR(64),
        parent_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        created_at VARCHAR(50) NOT NULL,
        updated_at VARCHAR(50) NOT NULL,
        INDEX idx_folders_session (session_id),
        INDEX idx_folders_project (project_id),
        INDEX idx_folders_parent (parent_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tags (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(16),
        created_at VARCHAR(50) NOT NULL,
        UNIQUE KEY uniq_session_tag (session_id, name),
        INDEX idx_tags_session (session_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS media_tags (
        task_id VARCHAR(255) NOT NULL,
        tag_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        created_at VARCHAR(50) NOT NULL,
        PRIMARY KEY (task_id, tag_id),
        INDEX idx_media_tags_task (task_id),
        INDEX idx_media_tags_tag (tag_id)
    )
    """,
]


_MYSQL_ALTER_SESSION_ACTIVITIES = [
    "ALTER TABLE session_activities ADD COLUMN project_id VARCHAR(64)",
    "ALTER TABLE session_activities ADD COLUMN folder_id VARCHAR(64)",
    "ALTER TABLE session_activities ADD COLUMN notes TEXT",
    "ALTER TABLE session_activities ADD COLUMN kind VARCHAR(16)",
    "ALTER TABLE session_activities ADD COLUMN mime_type VARCHAR(128)",
    "ALTER TABLE session_activities ADD COLUMN output_paths_json TEXT",
    "ALTER TABLE session_activities ADD COLUMN source_path VARCHAR(512)",
]


_SQLSERVER_DDL = [
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'projects')
    CREATE TABLE projects (
        id NVARCHAR(64) PRIMARY KEY,
        session_id NVARCHAR(255) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        color NVARCHAR(16),
        created_at DATETIME2 NOT NULL,
        updated_at DATETIME2 NOT NULL
    )
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'folders')
    CREATE TABLE folders (
        id NVARCHAR(64) PRIMARY KEY,
        session_id NVARCHAR(255) NOT NULL,
        project_id NVARCHAR(64),
        parent_id NVARCHAR(64),
        name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL,
        updated_at DATETIME2 NOT NULL
    )
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tags')
    CREATE TABLE tags (
        id NVARCHAR(64) PRIMARY KEY,
        session_id NVARCHAR(255) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        color NVARCHAR(16),
        created_at DATETIME2 NOT NULL,
        CONSTRAINT uniq_session_tag UNIQUE(session_id, name)
    )
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'media_tags')
    CREATE TABLE media_tags (
        task_id NVARCHAR(255) NOT NULL,
        tag_id NVARCHAR(64) NOT NULL,
        session_id NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL,
        CONSTRAINT pk_media_tags PRIMARY KEY (task_id, tag_id)
    )
    """,
]


def _try(conn, sql: str) -> None:
    """Run a DDL statement; swallow exceptions (used for idempotent ALTER TABLE)."""
    try:
        conn.execute(text(sql))
    except Exception:
        pass


def ensure_organize_tables() -> None:
    """Create Phase 2 tables and add new columns to session_activities. Idempotent."""
    engine = get_engine()
    with engine.connect() as conn:
        if _is_sqlite():
            for stmt in _SQLITE_DDL:
                conn.execute(text(stmt))
            for stmt in _SQLITE_ALTER_SESSION_ACTIVITIES:
                _try(conn, stmt)
        elif _is_mysql():
            for stmt in _MYSQL_DDL:
                conn.execute(text(stmt))
            for stmt in _MYSQL_ALTER_SESSION_ACTIVITIES:
                _try(conn, stmt)
        else:
            for stmt in _SQLSERVER_DDL:
                conn.execute(text(stmt))
        conn.commit()
    logger.info("Organize tables ensured (projects, folders, tags, media_tags + session_activities columns)")


# -------- projects --------

def create_project(session_id: str, name: str, description: Optional[str], color: Optional[str]) -> dict:
    now = _now_iso()
    pid = _new_id()
    with _db_session() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, session_id, name, description, color, created_at, updated_at) "
                "VALUES (:id, :sid, :name, :desc, :color, :now, :now)"
            ),
            {"id": pid, "sid": session_id, "name": name, "desc": description, "color": color, "now": now},
        )
    return {"id": pid, "name": name, "description": description, "color": color, "created_at": now, "updated_at": now}


def list_projects(session_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, name, description, color, created_at, updated_at FROM projects "
                "WHERE session_id = :sid ORDER BY created_at DESC"
            ),
            {"sid": session_id},
        ).fetchall()
    return [
        {"id": r[0], "name": r[1], "description": r[2], "color": r[3], "created_at": r[4], "updated_at": r[5]}
        for r in rows
    ]


def get_project(session_id: str, project_id: str) -> Optional[dict]:
    with get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT id, name, description, color, created_at, updated_at FROM projects "
                "WHERE id = :id AND session_id = :sid"
            ),
            {"id": project_id, "sid": session_id},
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "description": row[2], "color": row[3], "created_at": row[4], "updated_at": row[5]}


def update_project(session_id: str, project_id: str, *, name: Optional[str] = None, description: Optional[str] = None, color: Optional[str] = None) -> Optional[dict]:
    existing = get_project(session_id, project_id)
    if not existing:
        return None
    fields = []
    params: dict = {"id": project_id, "sid": session_id, "now": _now_iso()}
    if name is not None:
        fields.append("name = :name")
        params["name"] = name
    if description is not None:
        fields.append("description = :desc")
        params["desc"] = description
    if color is not None:
        fields.append("color = :color")
        params["color"] = color
    if not fields:
        return existing
    fields.append("updated_at = :now")
    with _db_session() as conn:
        conn.execute(
            text(f"UPDATE projects SET {', '.join(fields)} WHERE id = :id AND session_id = :sid"),
            params,
        )
    return get_project(session_id, project_id)


def delete_project(session_id: str, project_id: str) -> bool:
    with _db_session() as conn:
        # detach folders + media from this project (but keep them)
        conn.execute(
            text("UPDATE folders SET project_id = NULL WHERE project_id = :id AND session_id = :sid"),
            {"id": project_id, "sid": session_id},
        )
        conn.execute(
            text("UPDATE session_activities SET project_id = NULL WHERE project_id = :id AND session_id = :sid"),
            {"id": project_id, "sid": session_id},
        )
        result = conn.execute(
            text("DELETE FROM projects WHERE id = :id AND session_id = :sid"),
            {"id": project_id, "sid": session_id},
        )
    return result.rowcount > 0


# -------- folders --------

def create_folder(session_id: str, name: str, project_id: Optional[str], parent_id: Optional[str]) -> dict:
    now = _now_iso()
    fid = _new_id()
    with _db_session() as conn:
        conn.execute(
            text(
                "INSERT INTO folders (id, session_id, project_id, parent_id, name, created_at, updated_at) "
                "VALUES (:id, :sid, :pid, :parent, :name, :now, :now)"
            ),
            {"id": fid, "sid": session_id, "pid": project_id, "parent": parent_id, "name": name, "now": now},
        )
    return {
        "id": fid,
        "name": name,
        "project_id": project_id,
        "parent_id": parent_id,
        "created_at": now,
        "updated_at": now,
    }


def list_folders(session_id: str, project_id: Optional[str] = None, parent_id: Optional[str] = None) -> list[dict]:
    sql = (
        "SELECT id, name, project_id, parent_id, created_at, updated_at FROM folders "
        "WHERE session_id = :sid"
    )
    params: dict = {"sid": session_id}
    if project_id is not None:
        sql += " AND project_id = :pid"
        params["pid"] = project_id
    if parent_id is not None:
        sql += " AND parent_id = :parent"
        params["parent"] = parent_id
    sql += " ORDER BY name ASC"
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
    return [
        {"id": r[0], "name": r[1], "project_id": r[2], "parent_id": r[3], "created_at": r[4], "updated_at": r[5]}
        for r in rows
    ]


def get_folder(session_id: str, folder_id: str) -> Optional[dict]:
    with get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT id, name, project_id, parent_id, created_at, updated_at FROM folders "
                "WHERE id = :id AND session_id = :sid"
            ),
            {"id": folder_id, "sid": session_id},
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "project_id": row[2], "parent_id": row[3], "created_at": row[4], "updated_at": row[5]}


def update_folder(
    session_id: str,
    folder_id: str,
    *,
    name: Optional[str] = None,
    project_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    _clear_project: bool = False,
    _clear_parent: bool = False,
) -> Optional[dict]:
    existing = get_folder(session_id, folder_id)
    if not existing:
        return None
    fields = []
    params: dict = {"id": folder_id, "sid": session_id, "now": _now_iso()}
    if name is not None:
        fields.append("name = :name")
        params["name"] = name
    if _clear_project:
        fields.append("project_id = NULL")
    elif project_id is not None:
        fields.append("project_id = :pid")
        params["pid"] = project_id
    if _clear_parent:
        fields.append("parent_id = NULL")
    elif parent_id is not None:
        fields.append("parent_id = :parent")
        params["parent"] = parent_id
    if not fields:
        return existing
    fields.append("updated_at = :now")
    with _db_session() as conn:
        conn.execute(
            text(f"UPDATE folders SET {', '.join(fields)} WHERE id = :id AND session_id = :sid"),
            params,
        )
    return get_folder(session_id, folder_id)


def delete_folder(session_id: str, folder_id: str) -> bool:
    with _db_session() as conn:
        # promote child folders up
        conn.execute(
            text("UPDATE folders SET parent_id = NULL WHERE parent_id = :id AND session_id = :sid"),
            {"id": folder_id, "sid": session_id},
        )
        # detach media
        conn.execute(
            text("UPDATE session_activities SET folder_id = NULL WHERE folder_id = :id AND session_id = :sid"),
            {"id": folder_id, "sid": session_id},
        )
        result = conn.execute(
            text("DELETE FROM folders WHERE id = :id AND session_id = :sid"),
            {"id": folder_id, "sid": session_id},
        )
    return result.rowcount > 0


# -------- tags --------

def create_tag(session_id: str, name: str, color: Optional[str]) -> dict:
    now = _now_iso()
    tid = _new_id()
    with _db_session() as conn:
        conn.execute(
            text(
                "INSERT INTO tags (id, session_id, name, color, created_at) "
                "VALUES (:id, :sid, :name, :color, :now)"
            ),
            {"id": tid, "sid": session_id, "name": name, "color": color, "now": now},
        )
    return {"id": tid, "name": name, "color": color, "created_at": now}


def list_tags(session_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("SELECT id, name, color, created_at FROM tags WHERE session_id = :sid ORDER BY name ASC"),
            {"sid": session_id},
        ).fetchall()
    return [{"id": r[0], "name": r[1], "color": r[2], "created_at": r[3]} for r in rows]


def get_tag(session_id: str, tag_id: str) -> Optional[dict]:
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT id, name, color, created_at FROM tags WHERE id = :id AND session_id = :sid"),
            {"id": tag_id, "sid": session_id},
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1], "color": row[2], "created_at": row[3]}


def update_tag(session_id: str, tag_id: str, *, name: Optional[str] = None, color: Optional[str] = None) -> Optional[dict]:
    existing = get_tag(session_id, tag_id)
    if not existing:
        return None
    fields = []
    params: dict = {"id": tag_id, "sid": session_id}
    if name is not None:
        fields.append("name = :name")
        params["name"] = name
    if color is not None:
        fields.append("color = :color")
        params["color"] = color
    if not fields:
        return existing
    with _db_session() as conn:
        conn.execute(
            text(f"UPDATE tags SET {', '.join(fields)} WHERE id = :id AND session_id = :sid"),
            params,
        )
    return get_tag(session_id, tag_id)


def delete_tag(session_id: str, tag_id: str) -> bool:
    with _db_session() as conn:
        conn.execute(
            text("DELETE FROM media_tags WHERE tag_id = :id AND session_id = :sid"),
            {"id": tag_id, "sid": session_id},
        )
        result = conn.execute(
            text("DELETE FROM tags WHERE id = :id AND session_id = :sid"),
            {"id": tag_id, "sid": session_id},
        )
    return result.rowcount > 0


# -------- media tags --------

def attach_tags(session_id: str, task_id: str, tag_ids: list[str]) -> list[str]:
    """Attach tags to a media item (task). Returns the final list of tag ids."""
    now = _now_iso()
    with _db_session() as conn:
        # validate tags belong to this session
        if tag_ids:
            placeholders = ",".join(f":t{i}" for i in range(len(tag_ids)))
            params = {f"t{i}": tid for i, tid in enumerate(tag_ids)}
            params["sid"] = session_id
            rows = conn.execute(
                text(f"SELECT id FROM tags WHERE session_id = :sid AND id IN ({placeholders})"),
                params,
            ).fetchall()
            valid_ids = [r[0] for r in rows]
            for tid in valid_ids:
                # upsert-style: try insert, ignore conflict
                try:
                    conn.execute(
                        text(
                            "INSERT INTO media_tags (task_id, tag_id, session_id, created_at) "
                            "VALUES (:task, :tag, :sid, :now)"
                        ),
                        {"task": task_id, "tag": tid, "sid": session_id, "now": now},
                    )
                except Exception:
                    pass
        result = conn.execute(
            text("SELECT tag_id FROM media_tags WHERE task_id = :task AND session_id = :sid"),
            {"task": task_id, "sid": session_id},
        ).fetchall()
    return [r[0] for r in result]


def detach_tag(session_id: str, task_id: str, tag_id: str) -> bool:
    with _db_session() as conn:
        result = conn.execute(
            text("DELETE FROM media_tags WHERE task_id = :task AND tag_id = :tag AND session_id = :sid"),
            {"task": task_id, "tag": tag_id, "sid": session_id},
        )
    return result.rowcount > 0


def get_tags_for_task(session_id: str, task_id: str) -> list[dict]:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                "SELECT t.id, t.name, t.color, t.created_at FROM tags t "
                "JOIN media_tags mt ON t.id = mt.tag_id "
                "WHERE mt.task_id = :task AND mt.session_id = :sid "
                "ORDER BY t.name ASC"
            ),
            {"task": task_id, "sid": session_id},
        ).fetchall()
    return [{"id": r[0], "name": r[1], "color": r[2], "created_at": r[3]} for r in rows]


def get_tags_for_tasks(session_id: str, task_ids: list[str]) -> dict[str, list[dict]]:
    """Batched version of get_tags_for_task: one query for many task_ids.
    Returns {task_id: [tag, ...]} (only task_ids that have tags appear)."""
    ids = [t for t in task_ids if t]
    if not ids:
        return {}
    # Expanding IN clause with named params (portable across SQLite/MySQL/SQL Server).
    placeholders = ", ".join(f":t{i}" for i in range(len(ids)))
    params: dict = {"sid": session_id}
    for i, tid in enumerate(ids):
        params[f"t{i}"] = tid
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                "SELECT mt.task_id, t.id, t.name, t.color, t.created_at FROM tags t "
                "JOIN media_tags mt ON t.id = mt.tag_id "
                f"WHERE mt.session_id = :sid AND mt.task_id IN ({placeholders}) "
                "ORDER BY t.name ASC"
            ),
            params,
        ).fetchall()
    result: dict[str, list[dict]] = {}
    for r in rows:
        result.setdefault(r[0], []).append(
            {"id": r[1], "name": r[2], "color": r[3], "created_at": r[4]}
        )
    return result


# -------- media items (view over session_activities) --------

def list_media(
    session_id: str,
    *,
    project_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    tag_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """List media items, optionally filtered. Returns most recent first."""
    sql = (
        "SELECT sa.task_id, sa.batch_id, sa.filename, sa.input_bytes, sa.output_bytes, "
        "sa.output_count, sa.status, sa.created_at, sa.completed_at, sa.duration_seconds, "
        "sa.project_id, sa.folder_id, sa.notes, sa.kind, sa.mime_type, sa.output_paths_json, sa.source_path "
        "FROM session_activities sa "
    )
    params: dict = {"sid": session_id, "lim": limit}
    where = ["sa.session_id = :sid"]
    if tag_id is not None:
        sql += "JOIN media_tags mt ON mt.task_id = sa.task_id AND mt.session_id = sa.session_id "
        where.append("mt.tag_id = :tag")
        params["tag"] = tag_id
    if project_id is not None:
        where.append("sa.project_id = :pid")
        params["pid"] = project_id
    if folder_id is not None:
        where.append("sa.folder_id = :fid")
        params["fid"] = folder_id
    if q:
        where.append("LOWER(sa.filename) LIKE :q")
        params["q"] = f"%{q.lower()}%"
    sql += "WHERE " + " AND ".join(where) + " ORDER BY sa.created_at DESC LIMIT :lim"
    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
    return [_row_to_media(r) for r in rows]


def get_media(session_id: str, task_id: str) -> Optional[dict]:
    with get_engine().connect() as conn:
        row = conn.execute(
            text(
                "SELECT task_id, batch_id, filename, input_bytes, output_bytes, output_count, "
                "status, created_at, completed_at, duration_seconds, project_id, folder_id, notes, kind, mime_type, output_paths_json, source_path "
                "FROM session_activities WHERE task_id = :task AND session_id = :sid"
            ),
            {"task": task_id, "sid": session_id},
        ).fetchone()
    if not row:
        return None
    return _row_to_media(row)


def delete_media(session_id: str, task_id: str) -> Optional[dict]:
    """Delete a media item (session_activities row) + its tag links.
    Returns {'source_path', 'outputs'} so the caller can remove files, or None if not found."""
    item = get_media(session_id, task_id)
    if not item:
        return None
    source_path = get_source_path(session_id, task_id)
    with _db_session() as conn:
        conn.execute(
            text("DELETE FROM media_tags WHERE task_id = :task AND session_id = :sid"),
            {"task": task_id, "sid": session_id},
        )
        conn.execute(
            text("DELETE FROM session_activities WHERE task_id = :task AND session_id = :sid"),
            {"task": task_id, "sid": session_id},
        )
    return {"source_path": source_path, "outputs": item.get("outputs", [])}


def get_source_path(session_id: str, task_id: str) -> Optional[str]:
    """Return the persisted original filename (in LIBRARY_DIR) for a media item, if any."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT source_path FROM session_activities WHERE task_id = :task AND session_id = :sid"),
            {"task": task_id, "sid": session_id},
        ).fetchone()
    return row[0] if row and row[0] else None


def update_media(
    session_id: str,
    task_id: str,
    *,
    project_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    notes: Optional[str] = None,
    _clear_project: bool = False,
    _clear_folder: bool = False,
) -> Optional[dict]:
    existing = get_media(session_id, task_id)
    if not existing:
        return None
    fields = []
    params: dict = {"task": task_id, "sid": session_id}
    if _clear_project:
        fields.append("project_id = NULL")
    elif project_id is not None:
        fields.append("project_id = :pid")
        params["pid"] = project_id
    if _clear_folder:
        fields.append("folder_id = NULL")
    elif folder_id is not None:
        fields.append("folder_id = :fid")
        params["fid"] = folder_id
    if notes is not None:
        fields.append("notes = :notes")
        params["notes"] = notes
    if not fields:
        return existing
    with _db_session() as conn:
        conn.execute(
            text(f"UPDATE session_activities SET {', '.join(fields)} WHERE task_id = :task AND session_id = :sid"),
            params,
        )
    return get_media(session_id, task_id)


def _row_to_media(r) -> dict:
    outputs: list[str] = []
    raw_outputs = r[15] if len(r) > 15 else None
    if raw_outputs:
        try:
            parsed = json.loads(raw_outputs)
            if isinstance(parsed, list):
                outputs = [str(p) for p in parsed]
        except (ValueError, TypeError):
            outputs = []
    return {
        "task_id": r[0],
        "batch_id": r[1],
        "filename": r[2],
        "input_bytes": r[3],
        "output_bytes": r[4],
        "output_count": r[5],
        "status": r[6],
        "created_at": r[7],
        "completed_at": r[8],
        "duration_seconds": r[9],
        "project_id": r[10],
        "folder_id": r[11],
        "notes": r[12],
        "kind": r[13],
        "mime_type": r[14],
        "outputs": outputs,
        "has_source": bool(r[16]) if len(r) > 16 else False,
    }


# -------- session cleanup hook --------

def delete_organize_session_data(session_id: str) -> None:
    """Wipe all organize-scoped data for the session. Called from db.delete_session_data."""
    with _db_session() as conn:
        conn.execute(text("DELETE FROM media_tags WHERE session_id = :sid"), {"sid": session_id})
        conn.execute(text("DELETE FROM tags WHERE session_id = :sid"), {"sid": session_id})
        conn.execute(text("DELETE FROM folders WHERE session_id = :sid"), {"sid": session_id})
        conn.execute(text("DELETE FROM projects WHERE session_id = :sid"), {"sid": session_id})
