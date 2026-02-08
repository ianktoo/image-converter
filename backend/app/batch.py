"""Batch job state and zip creation. Persisted to local SQL (SQLite) database."""
import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import BATCH_ZIP_DIR, OUTPUT_DIR
from app.db import get_batch_from_db, save_batch, update_batch_status

logger = logging.getLogger("converter.batch")


@dataclass
class BatchJob:
    batch_id: str
    status: str  # "processing" | "completed" | "failed"
    task_ids: list[str] = field(default_factory=list)
    error: Optional[str] = None
    zip_filename: Optional[str] = None


_batches: dict[str, BatchJob] = {}


def get_batch(batch_id: str) -> Optional[BatchJob]:
    job = _batches.get(batch_id)
    if job is not None:
        return job
    row = get_batch_from_db(batch_id)
    if row is None:
        return None
    job = BatchJob(
        batch_id=row["batch_id"],
        status=row["status"],
        task_ids=row["task_ids"],
        error=row.get("error"),
        zip_filename=row.get("zip_filename"),
    )
    _batches[batch_id] = job
    return job


def create_batch(batch_id: str, task_ids: list[str], session_id: Optional[str] = None) -> BatchJob:
    job = BatchJob(batch_id=batch_id, status="processing", task_ids=task_ids)
    _batches[batch_id] = job
    save_batch(batch_id, "processing", task_ids, session_id=session_id)
    return job


def set_batch_completed(batch_id: str, zip_filename: str, task_ids: Optional[list[str]] = None) -> None:
    job = _batches.get(batch_id)
    if job:
        job.status = "completed"
        job.zip_filename = zip_filename
        if task_ids is not None:
            job.task_ids = task_ids
    update_batch_status(batch_id, "completed", zip_filename=zip_filename, task_ids=task_ids)


def set_batch_failed(batch_id: str, error: str) -> None:
    job = _batches.get(batch_id)
    if job:
        job.status = "failed"
        job.error = error
    update_batch_status(batch_id, "failed", error=error)


def _sanitize_folder_name(name: str) -> str:
    """Safe folder name for zip (no path separators, no empty)."""
    s = "".join(c for c in name if c.isalnum() or c in "._- ").strip() or "file"
    return s[:64]


def create_zip_from_task_outputs(
    batch_id: str,
    task_id_to_paths: list[tuple[str, list[str]]],
    zip_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    folder_structure: str = "flat",
    task_id_to_filename: Optional[dict[str, str]] = None,
) -> str:
    """Create a zip of all output files. folder_structure: flat | by_file | by_format. Returns zip filename."""
    zip_dir = zip_dir or BATCH_ZIP_DIR
    output_dir = output_dir or OUTPUT_DIR
    task_id_to_filename = task_id_to_filename or {}
    zip_path = zip_dir / f"{batch_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for task_id, paths in task_id_to_paths:
            folder_name = _sanitize_folder_name(task_id_to_filename.get(task_id, task_id[:8]))
            for p in paths:
                path = Path(p)
                if not path.is_absolute():
                    path = output_dir / path.name
                if not path.is_file():
                    continue
                ext = path.suffix.lstrip(".").lower() or "bin"
                if folder_structure == "by_file":
                    arcname = f"{folder_name}/{path.name}"
                elif folder_structure == "by_format":
                    arcname = f"{ext}/{path.name}"
                else:
                    arcname = f"{task_id[:8]}_{path.name}"
                zf.write(path, arcname)
    logger.info("Created zip %s with %s tasks (structure=%s)", zip_path.name, len(task_id_to_paths), folder_structure)
    return zip_path.name
