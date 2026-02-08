"""Database layer. SQLite by default; set DATABASE_URL for MySQL (e.g. localhost:3306) or SQL Server.
Startup ensures required tables exist; on connection failure logs verbosely and falls back to SQLite or in-memory so the app can start."""
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError

from app import config as app_config

logger = logging.getLogger("converter.db")

_engine: Optional[Engine] = None

# Tables required for the app (created at startup if missing)
REQUIRED_TABLES = ("batches", "session_activities")


def _is_sqlite() -> bool:
    return "sqlite" in app_config.DATABASE_URL


def _is_mysql() -> bool:
    return "mysql" in app_config.DATABASE_URL


def _db_kind() -> str:
    if _is_mysql():
        return "MySQL"
    if _is_sqlite():
        return "SQLite"
    return "SQL Server"


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        kwargs = {}
        if _is_sqlite():
            kwargs["connect_args"] = {"check_same_thread": False}
        _engine = create_engine(app_config.DATABASE_URL, **kwargs)
        logger.info("Database engine created (%s)", _db_kind())
    return _engine


def _create_sqlite_tables(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS batches (
            batch_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            task_ids_json TEXT,
            error TEXT,
            zip_filename TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            session_id TEXT
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS session_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            batch_id TEXT,
            filename TEXT,
            input_bytes INTEGER,
            output_bytes INTEGER,
            output_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            duration_seconds REAL
        )
    """))
    _add_session_id_column_sqlite(conn)
    conn.commit()


def _add_session_id_column_sqlite(conn) -> None:
    try:
        conn.execute(text("ALTER TABLE batches ADD COLUMN session_id TEXT"))
    except Exception:
        pass


def _create_mysql_tables(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS batches (
            batch_id VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            task_ids_json TEXT,
            error TEXT,
            zip_filename VARCHAR(255),
            created_at VARCHAR(50) NOT NULL,
            updated_at VARCHAR(50) NOT NULL,
            session_id VARCHAR(255)
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS session_activities (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            task_id VARCHAR(255) NOT NULL,
            batch_id VARCHAR(255),
            filename VARCHAR(512),
            input_bytes BIGINT,
            output_bytes BIGINT,
            output_count INT NOT NULL DEFAULT 0,
            status VARCHAR(50) NOT NULL,
            created_at VARCHAR(50) NOT NULL,
            completed_at VARCHAR(50),
            duration_seconds DOUBLE
        )
    """))
    _add_session_id_column_mysql(conn)
    conn.commit()


def _add_session_id_column_mysql(conn) -> None:
    try:
        conn.execute(text("ALTER TABLE batches ADD COLUMN session_id VARCHAR(255)"))
    except Exception:
        pass


def _create_sqlserver_tables(conn) -> None:
    conn.execute(text("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'batches')
        CREATE TABLE batches (
            batch_id NVARCHAR(255) PRIMARY KEY,
            status NVARCHAR(50) NOT NULL,
            task_ids_json NVARCHAR(MAX),
            error NVARCHAR(MAX),
            zip_filename NVARCHAR(255),
            created_at DATETIME2 NOT NULL,
            updated_at DATETIME2 NOT NULL,
            session_id NVARCHAR(255)
        )
    """))
    conn.execute(text("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'session_activities')
        CREATE TABLE session_activities (
            id BIGINT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(255) NOT NULL,
            task_id NVARCHAR(255) NOT NULL,
            batch_id NVARCHAR(255),
            filename NVARCHAR(512),
            input_bytes BIGINT,
            output_bytes BIGINT,
            output_count INT NOT NULL DEFAULT 0,
            status NVARCHAR(50) NOT NULL,
            created_at DATETIME2 NOT NULL,
            completed_at DATETIME(2),
            duration_seconds FLOAT
        )
    """))
    conn.commit()


def _ensure_tables(engine: Engine) -> None:
    """Create required tables if they do not exist."""
    with engine.connect() as conn:
        if _is_sqlite():
            _create_sqlite_tables(conn)
        elif _is_mysql():
            _create_mysql_tables(conn)
        else:
            _create_sqlserver_tables(conn)
    logger.info("Required tables ensured: %s", ", ".join(REQUIRED_TABLES))


def init_db() -> None:
    """Prepare database at startup: ensure required tables exist. On failure, fall back to SQLite file or in-memory so the app can start."""
    global _engine
    kind = _db_kind()
    logger.info("Database init: preparing %s (tables: %s)", kind, ", ".join(REQUIRED_TABLES))

    try:
        engine = get_engine()
        _ensure_tables(engine)
        logger.info("Database ready: %s", kind)
        return
    except OperationalError as e:
        logger.warning(
            "Database connection failed (%s): %s. Will try fallback.",
            kind,
            e.orig,
            exc_info=True,
        )
        if _is_mysql():
            try:
                sqlite_path = app_config.BASE_DIR / "data" / "converter.db"
                sqlite_path.parent.mkdir(parents=True, exist_ok=True)
                fallback_url = f"sqlite:///{sqlite_path}"
                app_config.DATABASE_URL = fallback_url
                _engine = None
                engine = get_engine()
                _ensure_tables(engine)
                logger.warning(
                    "MySQL unavailable. Using SQLite at %s. Fix MYSQL_* in .env to use MySQL.",
                    sqlite_path,
                )
                return
            except Exception as fallback_err:
                logger.exception(
                    "SQLite file fallback failed: %s. Trying in-memory SQLite.",
                    fallback_err,
                )
        else:
            logger.exception("Database error (non-MySQL). Trying in-memory SQLite.")

    except Exception as e:
        logger.exception("Database init failed: %s. Trying in-memory SQLite.", e)

    # Last resort: in-memory SQLite so the app can run (batch state will not persist across restarts)
    in_memory_url = "sqlite:///:memory:"
    try:
        app_config.DATABASE_URL = in_memory_url
        _engine = None
        engine = create_engine(in_memory_url, connect_args={"check_same_thread": False})
        _engine = engine
        _ensure_tables(engine)
        logger.warning(
            "Database unavailable. Using in-memory SQLite. Batch state will not persist across restarts."
        )
    except Exception as e:
        logger.exception("In-memory SQLite fallback failed: %s. Forcing engine so app can start.", e)
        app_config.DATABASE_URL = in_memory_url
        _engine = create_engine(in_memory_url, connect_args={"check_same_thread": False})
        with _engine.connect() as conn:
            _create_sqlite_tables(conn)
        logger.warning("Forced in-memory SQLite. Batch state will not persist across restarts.")


@contextmanager
def session():
    with get_engine().connect() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_batch(batch_id: str, status: str, task_ids: list[str], session_id: Optional[str] = None) -> None:
    now = _now_iso()
    task_ids_json = json.dumps(task_ids)
    params = {"batch_id": batch_id, "status": status, "task_ids_json": task_ids_json, "now": now, "session_id": session_id}
    with session() as conn:
        if _is_sqlite():
            conn.execute(
                text("""
                    INSERT OR REPLACE INTO batches (batch_id, status, task_ids_json, error, zip_filename, created_at, updated_at, session_id)
                    VALUES (:batch_id, :status, :task_ids_json, NULL, NULL, :now, :now, :session_id)
                """),
                params,
            )
        elif _is_mysql():
            conn.execute(
                text("""
                    INSERT INTO batches (batch_id, status, task_ids_json, error, zip_filename, created_at, updated_at, session_id)
                    VALUES (:batch_id, :status, :task_ids_json, NULL, NULL, :now, :now, :session_id)
                    ON DUPLICATE KEY UPDATE status = :status, task_ids_json = :task_ids_json, updated_at = :now, session_id = COALESCE(:session_id, session_id)
                """),
                params,
            )
        else:
            conn.execute(
                text("""
                    MERGE batches AS t USING (SELECT :batch_id AS batch_id) AS s ON t.batch_id = s.batch_id
                    WHEN MATCHED THEN UPDATE SET status = :status, task_ids_json = :task_ids_json, updated_at = :now
                    WHEN NOT MATCHED THEN INSERT (batch_id, status, task_ids_json, created_at, updated_at, session_id)
                    VALUES (:batch_id, :status, :task_ids_json, :now, :now, :session_id)
                """),
                params,
            )


def get_batch_from_db(batch_id: str) -> Optional[dict]:
    """Return batch row as dict or None. Used when batch is not in memory (e.g. after restart)."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT batch_id, status, task_ids_json, error, zip_filename, session_id FROM batches WHERE batch_id = :id"),
            {"id": batch_id},
        ).fetchone()
    if not row:
        return None
    task_ids = json.loads(row[2]) if row[2] else []
    return {
        "batch_id": row[0],
        "status": row[1],
        "task_ids": task_ids,
        "error": row[3],
        "zip_filename": row[4],
        "session_id": row[5] if len(row) > 5 else None,
    }


def get_batch_ids_by_session(session_id: str) -> list[str]:
    """Return batch_id list for the given session."""
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("SELECT batch_id FROM batches WHERE session_id = :sid"),
            {"sid": session_id},
        ).fetchall()
    return [r[0] for r in rows]


def record_activity(
    session_id: str,
    task_id: str,
    filename: str,
    status: str,
    *,
    batch_id: Optional[str] = None,
    input_bytes: Optional[int] = None,
    output_bytes: Optional[int] = None,
    output_count: int = 0,
    duration_seconds: Optional[float] = None,
) -> None:
    now = _now_iso()
    params = {
        "session_id": session_id,
        "task_id": task_id,
        "batch_id": batch_id,
        "filename": filename,
        "input_bytes": input_bytes,
        "output_bytes": output_bytes,
        "output_count": output_count,
        "status": status,
        "created_at": now,
        "completed_at": now,
        "duration_seconds": duration_seconds,
    }
    with session() as conn:
        if _is_sqlite():
            conn.execute(
                text("""
                    INSERT INTO session_activities (session_id, task_id, batch_id, filename, input_bytes, output_bytes, output_count, status, created_at, completed_at, duration_seconds)
                    VALUES (:session_id, :task_id, :batch_id, :filename, :input_bytes, :output_bytes, :output_count, :status, :created_at, :completed_at, :duration_seconds)
                """),
                params,
            )
        else:
            conn.execute(
                text("""
                    INSERT INTO session_activities (session_id, task_id, batch_id, filename, input_bytes, output_bytes, output_count, status, created_at, completed_at, duration_seconds)
                    VALUES (:session_id, :task_id, :batch_id, :filename, :input_bytes, :output_bytes, :output_count, :status, :created_at, :completed_at, :duration_seconds)
                """),
                params,
            )


def get_session_stats(session_id: str) -> dict:
    """Aggregate stats for a session: images_uploaded, images_output, total_input_bytes, total_output_bytes, compression_percent, time_spent_seconds."""
    with get_engine().connect() as conn:
        row = conn.execute(
            text("""
                SELECT
                    COUNT(*) AS images_uploaded,
                    COALESCE(SUM(output_count), 0) AS images_output,
                    COALESCE(SUM(input_bytes), 0) AS total_input_bytes,
                    COALESCE(SUM(output_bytes), 0) AS total_output_bytes,
                    COALESCE(SUM(duration_seconds), 0) AS time_spent_seconds
                FROM session_activities WHERE session_id = :sid
            """),
            {"sid": session_id},
        ).fetchone()
    if not row or row[0] == 0:
        return {
            "images_uploaded": 0,
            "images_output": 0,
            "total_input_bytes": 0,
            "total_output_bytes": 0,
            "compression_percent": 0.0,
            "time_spent_seconds": 0.0,
        }
    images_uploaded = row[0]
    images_output = int(row[1])
    total_input = int(row[2])
    total_output = int(row[3])
    time_spent = float(row[4])
    compression_percent = 0.0
    if total_input > 0 and total_output >= 0:
        compression_percent = round((1.0 - total_output / total_input) * 100.0, 1)
    return {
        "images_uploaded": images_uploaded,
        "images_output": images_output,
        "total_input_bytes": total_input,
        "total_output_bytes": total_output,
        "compression_percent": compression_percent,
        "time_spent_seconds": time_spent,
    }


def get_session_activities(session_id: str, limit: int = 100) -> list[dict]:
    """Recent activities for the session, newest first."""
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("""
                SELECT task_id, batch_id, filename, input_bytes, output_bytes, output_count, status, created_at, completed_at, duration_seconds
                FROM session_activities WHERE session_id = :sid ORDER BY created_at DESC LIMIT :lim
            """),
            {"sid": session_id, "lim": limit},
        ).fetchall()
    return [
        {
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
        }
        for r in rows
    ]


def delete_session_data(session_id: str) -> tuple[list[str], list[tuple[str, Optional[str]]]]:
    """
    Delete all session_activities and batches for the session.
    Returns (task_ids, [(batch_id, zip_filename), ...]) so caller can delete output files and zip files.
    """
    task_ids: list[str] = []
    batch_zips: list[tuple[str, Optional[str]]] = []
    with get_engine().connect() as conn:
        rows = conn.execute(text("SELECT task_id FROM session_activities WHERE session_id = :sid"), {"sid": session_id}).fetchall()
        task_ids = [r[0] for r in rows]
        rows = conn.execute(text("SELECT batch_id, zip_filename FROM batches WHERE session_id = :sid"), {"sid": session_id}).fetchall()
        batch_zips = [(r[0], r[1]) for r in rows]
        conn.execute(text("DELETE FROM session_activities WHERE session_id = :sid"), {"sid": session_id})
        conn.execute(text("DELETE FROM batches WHERE session_id = :sid"), {"sid": session_id})
        conn.commit()
    return task_ids, batch_zips


def update_batch_status(
    batch_id: str,
    status: str,
    *,
    task_ids: Optional[list[str]] = None,
    error: Optional[str] = None,
    zip_filename: Optional[str] = None,
) -> None:
    now = _now_iso()
    set_parts = ["status = :status", "updated_at = :now"]
    params = {"batch_id": batch_id, "status": status, "now": now}
    if task_ids is not None:
        set_parts.append("task_ids_json = :task_ids_json")
        params["task_ids_json"] = json.dumps(task_ids)
    if error is not None:
        set_parts.append("error = :error")
        params["error"] = error
    if zip_filename is not None:
        set_parts.append("zip_filename = :zip_filename")
        params["zip_filename"] = zip_filename
    with session() as conn:
        conn.execute(text(f"UPDATE batches SET {', '.join(set_parts)} WHERE batch_id = :batch_id"), params)
