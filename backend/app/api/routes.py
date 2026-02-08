"""API routes for upload and conversion."""
import asyncio
import base64
import logging
import re
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image

from app.batch import (
    create_batch,
    create_zip_from_task_outputs,
    get_batch,
    set_batch_completed,
    set_batch_failed,
)
from app.config import (
    BATCH_ZIP_DIR,
    IMAGE_EXTENSIONS,
    MAX_IMAGE_SIZE_BYTES,
    MAX_IMAGES_PER_UPLOAD,
    MAX_VIDEO_SIZE_BYTES,
    MAX_VIDEOS_PER_UPLOAD,
    OUTPUT_DIR,
    SIZE_PRESETS,
    UPLOAD_DIR,
    URL_DOWNLOAD_MAX_IMAGE_BYTES,
    URL_DOWNLOAD_MAX_VIDEO_BYTES,
    URL_DOWNLOAD_TIMEOUT,
    VIDEO_EXTENSIONS,
)
from app.conversion.service import get_conversion_service
from app.db import (
    delete_session_data,
    get_session_activities,
    get_session_stats,
    record_activity,
)

logger = logging.getLogger("converter.api")
router = APIRouter(prefix="/api", tags=["converter"])

ALL_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


def _is_image_ext(ext: str) -> bool:
    return ext.lower() in IMAGE_EXTENSIONS


def _max_upload_bytes_for_ext(ext: str) -> int:
    return MAX_IMAGE_SIZE_BYTES if _is_image_ext(ext) else MAX_VIDEO_SIZE_BYTES


def _max_url_download_bytes_for_ext(ext: str) -> int:
    return URL_DOWNLOAD_MAX_IMAGE_BYTES if _is_image_ext(ext) else URL_DOWNLOAD_MAX_VIDEO_BYTES


def get_or_create_session_id(request: Request) -> str:
    """Use X-Session-ID header or generate and attach to request for response header."""
    sid = (request.headers.get("X-Session-ID") or "").strip()
    if sid:
        return sid
    sid = str(uuid.uuid4())
    request.state.session_id = sid
    return sid


def _parse_crop(
    crop_x: Optional[float] = None,
    crop_y: Optional[float] = None,
    crop_width: Optional[float] = None,
    crop_height: Optional[float] = None,
) -> Optional[tuple[float, float, float, float]]:
    """Parse optional crop (0-1). Return (x, y, w, h) if all valid else None."""
    if crop_x is None or crop_y is None or crop_width is None or crop_height is None:
        return None
    try:
        x, y, w, h = float(crop_x), float(crop_y), float(crop_width), float(crop_height)
    except (TypeError, ValueError):
        return None
    if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1 and x + w <= 1.001 and y + h <= 1.001):
        return None
    return (x, y, w, h)


def _download_from_url(url: str) -> tuple[Path, str]:
    """Download file from URL to UPLOAD_DIR. Returns (path, original_filename). Raises HTTPException on error."""
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise HTTPException(400, "Invalid URL")
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "Only http and https URLs are supported")
    req = Request(url, headers={"User-Agent": "ImageConverter/1.0"})
    try:
        with urlopen(req, timeout=URL_DOWNLOAD_TIMEOUT) as resp:
            if resp.status >= 400:
                raise HTTPException(502, f"URL returned status {resp.status}")
            filename = None
            cd = resp.headers.get("Content-Disposition")
            if cd:
                m = re.search(r"filename\*?=(?:UTF-8'')?([^;\s]+)", cd, re.I)
                if m:
                    filename = unquote(m.group(1).strip('"\'')).strip()
            if not filename:
                path_part = (parsed.path or "").rstrip("/").split("/")[-1]
                if path_part:
                    filename = unquote(path_part)
            if not filename or "." not in filename:
                filename = "image.jpg"
            ext = Path(filename).suffix.lower()
            if ext not in ALL_EXTENSIONS:
                raise HTTPException(400, f"Unsupported format from URL: {ext}. Use a direct link to an image or video file.")
            max_bytes = _max_url_download_bytes_for_ext(ext)
            max_mb = max_bytes // (1024 * 1024)
            task_id = str(uuid.uuid4())
            safe_name = f"{task_id}_{filename}"
            dest = UPLOAD_DIR / safe_name
            total = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        dest.unlink(missing_ok=True)
                        raise HTTPException(413, f"File too large (max {max_mb} MB for {'image' if _is_image_ext(ext) else 'video'})")
                    f.write(chunk)
            return dest, filename
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("URL download failed: %s", e)
        raise HTTPException(502, f"Failed to download URL: {e!s}")


# Extension -> content-type for URL preview
_EXT_TO_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
    ".bmp": "image/bmp", ".tiff": "image/tiff", ".tif": "image/tiff",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".m4v": "video/mp4",
}


@router.post("/url-preview")
def url_preview(url: str = Body(..., embed=True)):
    """Fetch URL and return metadata + image preview (data URL) for display. Temp file is deleted after."""
    url = (url or "").strip()
    if not url:
        raise HTTPException(400, "URL is required")
    dest, filename = _download_from_url(url)
    try:
        content_length = dest.stat().st_size
        ext = Path(filename).suffix.lower()
        content_type = _EXT_TO_MIME.get(ext, "application/octet-stream")
        out = {
            "filename": filename,
            "content_type": content_type,
            "content_length": content_length,
        }
        if ext in IMAGE_EXTENSIONS:
            try:
                with Image.open(dest) as img:
                    out["width"] = img.width
                    out["height"] = img.height
                with open(dest, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("ascii")
                out["data_url"] = f"data:{content_type};base64,{b64}"
            except Exception as e:
                logger.warning("Could not build image preview for %s: %s", url, e)
        return out
    except Exception as e:
        logger.exception("URL preview failed: %s", e)
        raise HTTPException(500, str(e))
    finally:
        dest.unlink(missing_ok=True)


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/limits")
def get_limits():
    """Return upload and URL download limits for the client."""
    return {
        "max_images_per_upload": MAX_IMAGES_PER_UPLOAD,
        "max_image_size_mb": MAX_IMAGE_SIZE_BYTES // (1024 * 1024),
        "max_image_size_bytes": MAX_IMAGE_SIZE_BYTES,
        "max_videos_per_upload": MAX_VIDEOS_PER_UPLOAD,
        "max_video_size_mb": MAX_VIDEO_SIZE_BYTES // (1024 * 1024),
        "max_video_size_bytes": MAX_VIDEO_SIZE_BYTES,
    }


@router.get("/formats")
def get_formats():
    return {
        "image": list(IMAGE_EXTENSIONS),
        "video": list(VIDEO_EXTENSIONS),
        "output_image": ["webp", "jpeg", "png", "avif"],
        "output_video": ["webp", "mp4", "webm"],
    }


@router.get("/presets")
def get_presets():
    """Size presets for social/ads (name -> [width, height] or null for original)."""
    return {
        name: list(dims) if dims else None
        for name, dims in SIZE_PRESETS.items()
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    formats: str = Query("webp", description="Comma-separated: webp,jpeg,png"),
    web_optimized: bool = Query(False, description="Quick web-optimized conversion"),
    background_tasks: BackgroundTasks = None,
):
    """Upload a single file and start conversion."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALL_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}")
    max_bytes = _max_upload_bytes_for_ext(ext)
    max_mb = max_bytes // (1024 * 1024)
    output_formats = [f.strip().lower() for f in formats.split(",") if f.strip()]
    if not output_formats:
        output_formats = ["webp"]

    task_id = str(uuid.uuid4())
    safe_name = f"{task_id}_{file.filename}"
    dest = UPLOAD_DIR / safe_name
    try:
        total = 0
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413, f"File too large (max {max_mb} MB for {'image' if _is_image_ext(ext) else 'video'})")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Upload failed: %s", e)
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(500, "Upload failed")

    svc = get_conversion_service()
    try:
        task = svc.convert(Path(dest), output_formats, web_optimized=web_optimized)
        if background_tasks:
            background_tasks.add_task(svc.cleanup_upload, dest)
        return {
            "task_id": task.task_id,
            "filename": file.filename,
            "status": task.status.value,
            "progress": task.progress,
            "output_formats": task.output_formats,
            "output_paths": [Path(p).name for p in task.output_paths],
            "input_size": getattr(task, "input_size", None),
            "output_sizes": getattr(task, "output_sizes", []),
        }
    except Exception as e:
        if dest.exists():
            dest.unlink(missing_ok=True)
        logger.exception("Conversion failed: %s", e)
        raise HTTPException(500, str(e))


def _task_to_dict(t):
    return {
        "task_id": t.task_id,
        "filename": t.filename,
        "status": t.status.value,
        "progress": t.progress,
        "error": t.error,
        "output_formats": t.output_formats,
        "output_paths": [Path(p).name for p in t.output_paths],
        "input_size": getattr(t, "input_size", None),
        "output_sizes": getattr(t, "output_sizes", []),
    }


@router.post("/upload-multiple")
async def upload_multiple(
    files: list[UploadFile] = File(...),
    formats: str = Query("webp", description="Comma-separated output formats"),
    web_optimized: bool = Query(False),
    sizes: str = Query("original", description="Comma-separated: original,instagram_square,... or WxH"),
    fill_mode: str = Query("crop", description="crop | color | blur"),
    fill_color: str = Query("", description="Hex fill color when fill_mode=color"),
    size_reduction_percent: int = Query(0, ge=0, le=80),
    strip_metadata: bool = Query(False),
    progressive: bool = Query(False),
    aggressive_compression: bool = Query(False),
    crop_x: Optional[float] = Query(None, ge=0, le=1),
    crop_y: Optional[float] = Query(None, ge=0, le=1),
    crop_width: Optional[float] = Query(None, ge=0.01, le=1),
    crop_height: Optional[float] = Query(None, ge=0.01, le=1),
    background_tasks: BackgroundTasks = None,
    session_id: str = Depends(get_or_create_session_id),
):
    """Upload multiple files and convert in parallel. Optional crop (0-1) applied to images."""
    output_formats = [f.strip().lower() for f in formats.split(",") if f.strip()]
    if not output_formats:
        output_formats = ["webp"]
    size_list = [s.strip() for s in sizes.split(",") if s.strip()] or ["original"]
    fill_color_val = fill_color.strip() or None
    crop = _parse_crop(crop_x, crop_y, crop_width, crop_height)

    to_upload: list[tuple] = []
    for file in files:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALL_EXTENSIONS:
            continue
        to_upload.append((file, ext))
    if not to_upload:
        raise HTTPException(400, "No valid files uploaded")
    has_video = any(not _is_image_ext(ext) for _, ext in to_upload)
    if has_video:
        if len(to_upload) > MAX_VIDEOS_PER_UPLOAD:
            raise HTTPException(400, f"Only {MAX_VIDEOS_PER_UPLOAD} video at a time (max {MAX_VIDEO_SIZE_BYTES // (1024*1024)} MB)")
    else:
        if len(to_upload) > MAX_IMAGES_PER_UPLOAD:
            raise HTTPException(400, f"Max {MAX_IMAGES_PER_UPLOAD} images per upload (max {MAX_IMAGE_SIZE_BYTES // (1024*1024)} MB each)")

    uploaded: list[Path] = []
    for file, ext in to_upload:
        max_bytes = _max_upload_bytes_for_ext(ext)
        max_mb = max_bytes // (1024 * 1024)
        task_id = str(uuid.uuid4())
        safe_name = f"{task_id}_{file.filename}"
        dest = UPLOAD_DIR / safe_name
        try:
            total = 0
            with open(dest, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        dest.unlink(missing_ok=True)
                        raise HTTPException(413, f"File too large: {file.filename} (max {max_mb} MB)")
                    f.write(chunk)
            uploaded.append(dest)
        except HTTPException:
            for d in uploaded:
                if d.exists():
                    d.unlink(missing_ok=True)
            raise
        except Exception as e:
            logger.exception("Upload failed for %s: %s", file.filename, e)
            if dest.exists():
                dest.unlink(missing_ok=True)

    if not uploaded:
        raise HTTPException(400, "No valid files uploaded")

    svc = get_conversion_service()
    try:
        tasks = svc.convert_many(
            uploaded,
            output_formats,
            web_optimized=web_optimized,
            size_presets=size_list,
            fill_mode=fill_mode or "crop",
            fill_color=fill_color_val,
            size_reduction_percent=size_reduction_percent or None,
            strip_metadata=strip_metadata,
            progressive=progressive,
            aggressive_compression=aggressive_compression,
            crop=crop,
        )
        if background_tasks:
            for d in uploaded:
                background_tasks.add_task(svc.cleanup_upload, d)
        for t in tasks:
            out_bytes = sum(t.output_sizes) if getattr(t, "output_sizes", None) else None
            record_activity(
                session_id,
                t.task_id,
                t.filename,
                t.status.value,
                input_bytes=getattr(t, "input_size", None),
                output_bytes=out_bytes,
                output_count=len(t.output_paths),
            )
        return {
            "tasks": [_task_to_dict(t) for t in tasks],
        }
    except Exception as e:
        for d in uploaded:
            if d.exists():
                d.unlink(missing_ok=True)
        logger.exception("Batch conversion failed: %s", e)
        raise HTTPException(500, str(e))


@router.post("/upload-from-url")
def upload_from_url(
    url: str = Body(..., embed=True),
    formats: str = Query("webp", description="Comma-separated output formats"),
    web_optimized: bool = Query(False),
    sizes: str = Query("original", description="Comma-separated: original,instagram_square,... or WxH"),
    fill_mode: str = Query("crop", description="crop | color | blur"),
    fill_color: str = Query("", description="Hex fill color when fill_mode=color"),
    size_reduction_percent: int = Query(0, ge=0, le=80),
    strip_metadata: bool = Query(False),
    progressive: bool = Query(False),
    aggressive_compression: bool = Query(False),
    crop_x: Optional[float] = Query(None, ge=0, le=1),
    crop_y: Optional[float] = Query(None, ge=0, le=1),
    crop_width: Optional[float] = Query(None, ge=0.01, le=1),
    crop_height: Optional[float] = Query(None, ge=0.01, le=1),
    background_tasks: BackgroundTasks = None,
    session_id: str = Depends(get_or_create_session_id),
):
    """Download file from URL and convert. Same options as upload-multiple."""
    url = (url or "").strip()
    if not url:
        raise HTTPException(400, "URL is required")
    output_formats = [f.strip().lower() for f in formats.split(",") if f.strip()]
    if not output_formats:
        output_formats = ["webp"]
    size_list = [s.strip() for s in sizes.split(",") if s.strip()] or ["original"]
    fill_color_val = fill_color.strip() or None
    crop = _parse_crop(crop_x, crop_y, crop_width, crop_height)

    dest, filename = _download_from_url(url)
    svc = get_conversion_service()
    try:
        tasks = svc.convert_many(
            [dest],
            output_formats,
            web_optimized=web_optimized,
            size_presets=size_list,
            fill_mode=fill_mode or "crop",
            fill_color=fill_color_val,
            size_reduction_percent=size_reduction_percent or None,
            strip_metadata=strip_metadata,
            progressive=progressive,
            aggressive_compression=aggressive_compression,
            crop=crop,
        )
        if background_tasks:
            background_tasks.add_task(svc.cleanup_upload, dest)
        for t in tasks:
            out_bytes = sum(t.output_sizes) if getattr(t, "output_sizes", None) else None
            record_activity(
                session_id,
                t.task_id,
                t.filename or filename,
                t.status.value,
                input_bytes=getattr(t, "input_size", None),
                output_bytes=out_bytes,
                output_count=len(t.output_paths),
            )
        out = [_task_to_dict(t) for t in tasks]
        if out and filename:
            out[0]["filename"] = filename
        return {"tasks": out}
    except Exception as e:
        if dest.exists():
            dest.unlink(missing_ok=True)
        logger.exception("Convert from URL failed: %s", e)
        raise HTTPException(500, str(e))


def _run_batch_and_zip(
    batch_id: str,
    uploaded: list[Path],
    output_formats: list[str],
    web_optimized: bool,
    size_list: list[str],
    fill_mode: str,
    fill_color: Optional[str],
    size_reduction_percent: Optional[int] = None,
    strip_metadata: bool = False,
    progressive: bool = False,
    aggressive_compression: bool = False,
    zip_folder_structure: str = "flat",
    crop: Optional[tuple[float, float, float, float]] = None,
    session_id: Optional[str] = None,
):
    """Blocking: convert all then zip. Called in thread."""
    svc = get_conversion_service()
    try:
        tasks = svc.convert_many(
            uploaded,
            output_formats,
            web_optimized=web_optimized,
            size_presets=size_list or ["original"],
            fill_mode=fill_mode or "crop",
            fill_color=fill_color,
            size_reduction_percent=size_reduction_percent,
            strip_metadata=strip_metadata,
            progressive=progressive,
            aggressive_compression=aggressive_compression,
            crop=crop,
        )
        if session_id:
            for t in tasks:
                out_bytes = sum(t.output_sizes) if getattr(t, "output_sizes", None) else None
                record_activity(
                    session_id,
                    t.task_id,
                    t.filename,
                    t.status.value,
                    batch_id=batch_id,
                    input_bytes=getattr(t, "input_size", None),
                    output_bytes=out_bytes,
                    output_count=len(t.output_paths),
                )
        task_id_to_paths = [(t.task_id, t.output_paths) for t in tasks if t.output_paths]
        if task_id_to_paths:
            task_id_to_filename = {t.task_id: t.filename for t in tasks}
            zip_name = create_zip_from_task_outputs(
                batch_id,
                task_id_to_paths,
                folder_structure=zip_folder_structure or "flat",
                task_id_to_filename=task_id_to_filename,
            )
            set_batch_completed(batch_id, zip_name, task_ids=[t[0] for t in task_id_to_paths])
        else:
            set_batch_failed(batch_id, "No outputs produced")
    except Exception as e:
        logger.exception("Batch failed: %s", e)
        set_batch_failed(batch_id, str(e))
    finally:
        for d in uploaded:
            if d.exists():
                try:
                    d.unlink()
                except OSError:
                    pass


@router.post("/upload-batch")
async def upload_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    formats: str = Query("webp"),
    web_optimized: bool = Query(False),
    sizes: str = Query("original"),
    fill_mode: str = Query("crop"),
    fill_color: str = Query(""),
    size_reduction_percent: int = Query(0, ge=0, le=80),
    strip_metadata: bool = Query(False),
    progressive: bool = Query(False),
    aggressive_compression: bool = Query(False),
    zip_folder_structure: str = Query("flat", description="flat | by_file | by_format"),
    crop_x: Optional[float] = Query(None, ge=0, le=1),
    crop_y: Optional[float] = Query(None, ge=0, le=1),
    crop_width: Optional[float] = Query(None, ge=0.01, le=1),
    crop_height: Optional[float] = Query(None, ge=0.01, le=1),
    session_id: str = Depends(get_or_create_session_id),
):
    """Upload multiple files; process in background and zip when done. Returns batch_id."""
    output_formats = [f.strip().lower() for f in formats.split(",") if f.strip()]
    if not output_formats:
        output_formats = ["webp"]
    size_list = [s.strip() for s in sizes.split(",") if s.strip()] or ["original"]
    fill_mode_val = fill_mode or "crop"
    fill_color_val = fill_color.strip() or None
    crop = _parse_crop(crop_x, crop_y, crop_width, crop_height)

    to_upload: list[tuple] = []
    for file in files:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALL_EXTENSIONS:
            continue
        to_upload.append((file, ext))
    if not to_upload:
        raise HTTPException(400, "No valid files uploaded")
    has_video = any(not _is_image_ext(ext) for _, ext in to_upload)
    if has_video:
        if len(to_upload) > MAX_VIDEOS_PER_UPLOAD:
            raise HTTPException(400, f"Only {MAX_VIDEOS_PER_UPLOAD} video at a time (max {MAX_VIDEO_SIZE_BYTES // (1024*1024)} MB)")
    else:
        if len(to_upload) > MAX_IMAGES_PER_UPLOAD:
            raise HTTPException(400, f"Max {MAX_IMAGES_PER_UPLOAD} images per upload (max {MAX_IMAGE_SIZE_BYTES // (1024*1024)} MB each)")

    batch_id = str(uuid.uuid4())
    uploaded: list[Path] = []
    for file, ext in to_upload:
        max_bytes = _max_upload_bytes_for_ext(ext)
        max_mb = max_bytes // (1024 * 1024)
        safe_name = f"{batch_id}_{uuid.uuid4().hex[:8]}_{file.filename}"
        dest = UPLOAD_DIR / safe_name
        try:
            total = 0
            with open(dest, "wb") as f:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        dest.unlink(missing_ok=True)
                        raise HTTPException(413, f"File too large: {file.filename} (max {max_mb} MB)")
                    f.write(chunk)
            uploaded.append(dest)
        except HTTPException:
            for d in uploaded:
                if d.exists():
                    d.unlink(missing_ok=True)
            raise
        except Exception as e:
            logger.exception("Upload failed for %s: %s", file.filename, e)
            if dest.exists():
                dest.unlink(missing_ok=True)

    if not uploaded:
        raise HTTPException(400, "No valid files uploaded")

    create_batch(batch_id, [], session_id=session_id)

    async def run_batch_async():
        await asyncio.to_thread(
            _run_batch_and_zip,
            batch_id,
            uploaded,
            output_formats,
            web_optimized,
            size_list,
            fill_mode_val,
            fill_color_val,
            size_reduction_percent or None,
            strip_metadata,
            progressive,
            aggressive_compression,
            zip_folder_structure or "flat",
            crop,
            session_id,
        )

    background_tasks.add_task(run_batch_async)
    return {"batch_id": batch_id, "status": "processing", "message": "Conversion started. Poll /api/batch/{batch_id} for status."}


@router.get("/batch/{batch_id}")
def batch_status(batch_id: str):
    """Get batch job status; zip_filename present when status=completed."""
    job = get_batch(batch_id)
    if not job:
        raise HTTPException(404, "Batch not found")
    return {
        "batch_id": job.batch_id,
        "status": job.status,
        "task_ids": job.task_ids,
        "error": job.error,
        "zip_filename": job.zip_filename,
    }


@router.get("/batch/{batch_id}/zip")
def download_batch_zip(batch_id: str):
    """Download the batch zip when status=completed."""
    job = get_batch(batch_id)
    if not job or job.status != "completed" or not job.zip_filename:
        raise HTTPException(404, "Zip not ready")
    path = BATCH_ZIP_DIR / job.zip_filename
    if not path.is_file():
        raise HTTPException(404, "Zip file not found")
    return FileResponse(path, filename=job.zip_filename)


@router.post("/zip-outputs")
def create_zip_from_tasks(
    task_ids: list[str] = Body(..., embed=True),
    folder_structure: str = Body("flat", embed=True),
):
    """Create a zip of outputs for given task_ids. folder_structure: flat | by_file | by_format."""
    if not task_ids:
        raise HTTPException(400, "task_ids required")
    folder_structure = (folder_structure or "flat").lower()
    if folder_structure not in ("flat", "by_file", "by_format"):
        folder_structure = "flat"
    svc = get_conversion_service()
    task_id_to_paths: list[tuple[str, list[str]]] = []
    task_id_to_filename: dict[str, str] = {}
    for tid in task_ids:
        task = svc.get_task(tid)
        if not task or not task.output_paths:
            continue
        task_id_to_paths.append((tid, task.output_paths))
        task_id_to_filename[tid] = task.filename
    if not task_id_to_paths:
        raise HTTPException(404, "No output files found for the given tasks")
    zip_id = str(uuid.uuid4())
    zip_name = create_zip_from_task_outputs(
        zip_id,
        task_id_to_paths,
        zip_dir=BATCH_ZIP_DIR,
        output_dir=OUTPUT_DIR,
        folder_structure=folder_structure,
        task_id_to_filename=task_id_to_filename,
    )
    path = BATCH_ZIP_DIR / zip_name
    if not path.is_file():
        raise HTTPException(500, "Zip creation failed")
    return FileResponse(path, filename=f"converted-{folder_structure}.zip")


@router.get("/session/stats")
def session_stats(session_id: str = Depends(get_or_create_session_id)):
    """Return aggregated stats for the current session."""
    return get_session_stats(session_id)


@router.get("/session/activities")
def session_activities(
    limit: int = Query(50, ge=1, le=200),
    session_id: str = Depends(get_or_create_session_id),
):
    """Return recent conversion activities for the current session."""
    return {"activities": get_session_activities(session_id, limit=limit)}


@router.delete("/session/data")
def session_delete_data(session_id: str = Depends(get_or_create_session_id)):
    """Delete all session data: activities, batch records, and associated output/zip files."""
    task_ids, batch_zips = delete_session_data(session_id)
    for tid in task_ids:
        prefix = tid[:8]
        for f in OUTPUT_DIR.iterdir():
            if f.is_file() and prefix in f.name:
                try:
                    f.unlink()
                except OSError as e:
                    logger.warning("Could not delete output file %s: %s", f, e)
    for batch_id, zip_filename in batch_zips:
        if zip_filename:
            path = BATCH_ZIP_DIR / zip_filename
            if path.is_file():
                try:
                    path.unlink()
                except OSError as e:
                    logger.warning("Could not delete zip %s: %s", path, e)
    return {"ok": True, "message": "Session data cleared"}


@router.get("/task/{task_id}")
def get_task_status(task_id: str):
    """Get conversion task status and progress."""
    svc = get_conversion_service()
    task = svc.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return {
        "task_id": task.task_id,
        "filename": task.filename,
        "status": task.status.value,
        "progress": task.progress,
        "error": task.error,
        "output_formats": task.output_formats,
        "output_paths": [Path(p).name for p in task.output_paths],
        "input_size": getattr(task, "input_size", None),
        "output_sizes": getattr(task, "output_sizes", []),
    }


@router.get("/download/{task_id}/{filename}")
def download_output(task_id: str, filename: str):
    """Download a converted file by task_id and output filename."""
    svc = get_conversion_service()
    task = svc.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    path = OUTPUT_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "File not found")
    if filename not in [Path(p).name for p in task.output_paths]:
        raise HTTPException(403, "File not part of this task")
    return FileResponse(path, filename=filename)


@router.delete("/task/{task_id}")
def delete_task_outputs(task_id: str):
    """Remove output files for a task."""
    svc = get_conversion_service()
    svc.cleanup_task_outputs(task_id)
    return {"ok": True}
