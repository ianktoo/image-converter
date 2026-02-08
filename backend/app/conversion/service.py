"""Image and video conversion service with progress tracking and parallel execution."""
import logging
import os
import shutil
import subprocess
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Optional

from PIL import Image

from app.config import (
    DEFAULT_QUALITY,
    IMAGE_EXTENSIONS,
    IMAGE_OUTPUT_FORMATS,
    MAX_WORKERS,
    OUTPUT_DIR,
    SIZE_PRESETS,
    UPLOAD_DIR,
    VIDEO_EXTENSIONS,
    VIDEO_OUTPUT_FORMATS,
    WEB_OPTIMIZED_EFFORT,
    WEB_OPTIMIZED_QUALITY,
)
from app.conversion.models import ConversionTask, MediaType, TaskStatus
from app.conversion.resize import hex_to_rgb, resize_keep_aspect, resize_to_fit

logger = logging.getLogger("converter.service")


class ConversionService:
    """Handles image and video conversion with progress and error handling."""

    def __init__(self):
        self._tasks: dict[str, ConversionTask] = {}
        self._executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        logger.info("ConversionService initialized with max_workers=%s", MAX_WORKERS)

    @staticmethod
    def get_media_type(path: Path) -> Optional[MediaType]:
        ext = path.suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            return MediaType.IMAGE
        if ext in VIDEO_EXTENSIONS:
            return MediaType.VIDEO
        return None

    def _create_task(self, filename: str, media_type: MediaType) -> ConversionTask:
        task_id = str(uuid.uuid4())
        task = ConversionTask(task_id=task_id, filename=filename, media_type=media_type)
        self._tasks[task_id] = task
        return task

    def get_task(self, task_id: str) -> Optional[ConversionTask]:
        return self._tasks.get(task_id)

    @staticmethod
    def _parse_size_presets(preset_names: Optional[list[str]]) -> list[tuple[Optional[int], Optional[int], str]]:
        if not preset_names:
            return [(None, None, "original")]
        result = []
        seen = set()
        for name in preset_names:
            name = (name or "").strip().lower()
            if name in seen:
                continue
            if name == "original":
                result.append((None, None, "original"))
                seen.add(name)
                continue
            if "x" in name:
                parts = name.split("x", 1)
                if len(parts) == 2:
                    a, b = parts[0].strip(), parts[1].strip()
                    if a.isdigit() and b.isdigit():
                        w, h = int(a), int(b)
                        if 1 <= w <= 4096 and 1 <= h <= 4096:
                            result.append((w, h, name))
                            seen.add(name)
                        continue
                    if a.isdigit() and b == "":
                        w = int(a)
                        if 1 <= w <= 4096:
                            result.append((w, None, name))
                            seen.add(name)
                        continue
                    if a == "" and b.isdigit():
                        h = int(b)
                        if 1 <= h <= 4096:
                            result.append((None, h, name))
                            seen.add(name)
                        continue
                continue
            if name in SIZE_PRESETS:
                dims = SIZE_PRESETS[name]
                if dims:
                    result.append((dims[0], dims[1], name))
                    seen.add(name)
        return result if result else [(None, None, "original")]

    def _convert_image(
        self,
        src: Path,
        out_formats: list[str],
        task: ConversionTask,
        web_optimized: bool = False,
        size_presets: Optional[list[tuple[Optional[int], Optional[int], str]]] = None,
        fill_mode: str = "crop",
        fill_color: Optional[str] = None,
        size_reduction_percent: Optional[int] = None,
        strip_metadata: bool = False,
        progressive: bool = False,
        aggressive_compression: bool = False,
        crop: Optional[tuple[float, float, float, float]] = None,
    ) -> list[Path]:
        """crop: optional (x, y, width, height) normalized 0-1. Applied before resize."""
        task.status = TaskStatus.CONVERTING
        task.progress = 0.0
        outputs: list[Path] = []
        if not size_presets:
            size_presets = [(None, None, "original")]
        total = len(out_formats) * len(size_presets)
        if total == 0:
            total = 1
        quality = WEB_OPTIMIZED_QUALITY if web_optimized else DEFAULT_QUALITY
        if size_reduction_percent is not None and 0 <= size_reduction_percent <= 80:
            # Map 0–80% reduction to quality ~95 down to ~25
            quality = max(25, min(95, 95 - int(size_reduction_percent * 0.9)))
        effort = WEB_OPTIMIZED_EFFORT if (web_optimized or aggressive_compression) else 4
        if aggressive_compression:
            effort = 6
        rgb_fill = hex_to_rgb(fill_color) if fill_color else (128, 128, 128)

        try:
            with Image.open(src) as img:
                if img.mode in ("RGBA", "P") and "jpeg" in out_formats:
                    base_img = img.convert("RGB")
                elif img.mode not in ("RGB", "RGBA"):
                    base_img = img.convert("RGB")
                else:
                    base_img = img

                if crop and len(crop) == 4:
                    cx, cy, cw, ch = crop
                    w, h = base_img.size
                    left = int(cx * w)
                    top = int(cy * h)
                    right = int((cx + cw) * w)
                    bottom = int((cy + ch) * h)
                    left = max(0, min(left, w - 1))
                    top = max(0, min(top, h - 1))
                    right = max(left + 1, min(right, w))
                    bottom = max(top + 1, min(bottom, h))
                    base_img = base_img.crop((left, top, right, bottom))

                step = 0
                for (tw, th, size_label) in size_presets:
                    if tw is not None and th is not None:
                        work = resize_to_fit(
                            base_img, tw, th,
                            fill_mode=fill_mode or "crop",
                            fill_color=rgb_fill,
                        )
                        suffix = f"{tw}x{th}"
                    elif tw is not None:
                        work = resize_keep_aspect(base_img, target_width=tw)
                        suffix = f"{tw}x"
                    elif th is not None:
                        work = resize_keep_aspect(base_img, target_height=th)
                        suffix = f"x{th}"
                    else:
                        work = base_img
                        suffix = "original"

                    for fmt in out_formats:
                        fmt = fmt.lower()
                        if fmt not in IMAGE_OUTPUT_FORMATS:
                            continue
                        out_path = OUTPUT_DIR / f"{src.stem}_{task.task_id[:8]}_{suffix}.{fmt}"
                        save_kw: dict = {}
                        out_img = work.copy() if strip_metadata else work
                        if strip_metadata:
                            out_img.info = {}
                        if fmt == "webp":
                            save_kw = {"format": "WEBP", "quality": quality, "method": effort}
                            if web_optimized or aggressive_compression:
                                save_kw["optimize"] = True
                        elif fmt == "jpeg":
                            save_kw = {"format": "JPEG", "quality": quality, "optimize": True, "progressive": progressive}
                        elif fmt == "png":
                            save_kw = {"format": "PNG", "optimize": True}
                        elif fmt == "avif":
                            try:
                                save_kw = {"format": "AVIF", "quality": quality}
                            except Exception:
                                continue
                        out_img.save(str(out_path), **save_kw)
                        outputs.append(out_path)
                        step += 1
                        task.progress = step / total * 100.0
                        task.output_paths.append(str(out_path))
                        task.output_formats.append(fmt)
                        task.output_sizes.append(out_path.stat().st_size)
                        logger.info("Converted %s -> %s", src.name, out_path.name)
            task.status = TaskStatus.COMPLETED
            task.progress = 100.0
            return outputs
        except Exception as e:
            logger.exception("Image conversion failed for %s: %s", src, e)
            task.status = TaskStatus.FAILED
            task.error = str(e)
            raise

    def _convert_video(
        self,
        src: Path,
        out_formats: list[str],
        task: ConversionTask,
        web_optimized: bool = False,
    ) -> list[Path]:
        task.status = TaskStatus.CONVERTING
        task.progress = 0.0
        outputs: list[Path] = []
        total = max(1, len(out_formats))
        qscale = "18" if web_optimized else "23"  # lower = better quality for ffmpeg

        for i, fmt in enumerate(out_formats):
            fmt = fmt.lower()
            if fmt not in VIDEO_OUTPUT_FORMATS:
                logger.warning("Unsupported video format requested: %s", fmt)
                continue
            out_path = OUTPUT_DIR / f"{src.stem}_{task.task_id[:8]}.{fmt}"
            try:
                if fmt == "webp":
                    # Animated WebP via ffmpeg libwebp
                    cmd = [
                        "ffmpeg", "-y", "-i", str(src),
                        "-vcodec", "libwebp",
                        "-lossless", "0",
                        "-compression_level", "4" if web_optimized else "6",
                        "-q:v", qscale,
                        "-loop", "1", "-an", "-vsync", "0",
                        str(out_path),
                    ]
                elif fmt == "mp4":
                    cmd = [
                        "ffmpeg", "-y", "-i", str(src),
                        "-c:v", "libx264", "-preset", "medium",
                        "-crf", qscale, "-an",
                        str(out_path),
                    ]
                elif fmt == "webm":
                    cmd = [
                        "ffmpeg", "-y", "-i", str(src),
                        "-c:v", "libvpx-vp9", "-crf", qscale,
                        "-b:v", "0", "-an",
                        str(out_path),
                    ]
                else:
                    continue
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
                if result.returncode != 0:
                    raise RuntimeError(result.stderr or result.stdout or "ffmpeg failed")
                outputs.append(out_path)
                task.output_paths.append(str(out_path))
                task.output_formats.append(fmt)
                task.output_sizes.append(out_path.stat().st_size)
                logger.info("Converted video %s -> %s", src.name, out_path.name)
            except FileNotFoundError:
                logger.error("ffmpeg not found. Install ffmpeg for video conversion.")
                task.status = TaskStatus.FAILED
                task.error = "ffmpeg not installed"
                raise
            except Exception as e:
                logger.exception("Video conversion failed for %s: %s", src, e)
                task.status = TaskStatus.FAILED
                task.error = str(e)
                raise
            task.progress = (i + 1) / total * 100.0
        task.status = TaskStatus.COMPLETED
        task.progress = 100.0
        return outputs

    def convert(
        self,
        file_path: Path,
        output_formats: list[str],
        web_optimized: bool = False,
        on_progress: Optional[Callable[[str, float], None]] = None,
        size_presets: Optional[list[str]] = None,
        fill_mode: str = "crop",
        fill_color: Optional[str] = None,
        size_reduction_percent: Optional[int] = None,
        strip_metadata: bool = False,
        progressive: bool = False,
        aggressive_compression: bool = False,
        crop: Optional[tuple[float, float, float, float]] = None,
    ) -> ConversionTask:
        """Convert a single file. file_path should be under UPLOAD_DIR. crop: (x,y,w,h) 0-1 for images only."""
        media_type = self.get_media_type(file_path)
        if not media_type:
            raise ValueError(f"Unsupported file type: {file_path.suffix}")
        task = self._create_task(file_path.name, media_type)
        task.status = TaskStatus.CONVERTING
        try:
            if file_path.is_file():
                task.input_size = file_path.stat().st_size
            parsed_sizes = self._parse_size_presets(size_presets)
            if media_type == MediaType.IMAGE:
                self._convert_image(
                    file_path, output_formats, task, web_optimized,
                    size_presets=parsed_sizes, fill_mode=fill_mode, fill_color=fill_color,
                    size_reduction_percent=size_reduction_percent,
                    strip_metadata=strip_metadata,
                    progressive=progressive,
                    aggressive_compression=aggressive_compression,
                    crop=crop,
                )
            else:
                self._convert_video(file_path, output_formats, task, web_optimized)
            if on_progress:
                on_progress(task.task_id, 100.0)
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            if on_progress:
                on_progress(task.task_id, task.progress)
            logger.exception("Conversion failed for %s: %s", file_path, e)
        return task

    def convert_many(
        self,
        file_paths: list[Path],
        output_formats: list[str],
        web_optimized: bool = False,
        on_progress: Optional[Callable[[str, float], None]] = None,
        size_presets: Optional[list[str]] = None,
        fill_mode: str = "crop",
        fill_color: Optional[str] = None,
        size_reduction_percent: Optional[int] = None,
        strip_metadata: bool = False,
        progressive: bool = False,
        aggressive_compression: bool = False,
        crop: Optional[tuple[float, float, float, float]] = None,
    ) -> list[ConversionTask]:
        """Convert multiple files in parallel. crop applied to images only (same region for all)."""
        valid_paths = [
            p for p in file_paths
            if self.get_media_type(p) is not None
        ]
        for p in file_paths:
            if p not in valid_paths:
                logger.warning("Skipping unsupported file: %s", p)
        futures = {
            self._executor.submit(
                self.convert,
                path,
                output_formats,
                web_optimized,
                on_progress,
                size_presets,
                fill_mode,
                fill_color,
                size_reduction_percent,
                strip_metadata,
                progressive,
                aggressive_compression,
                crop,
            ): path
            for path in valid_paths
        }
        tasks: list[ConversionTask] = []
        for future in as_completed(futures):
            try:
                task = future.result()
                tasks.append(task)
            except Exception as e:
                path = futures[future]
                logger.exception("Task failed for %s: %s", path, e)
                task = self._create_task(path.name, self.get_media_type(path) or MediaType.IMAGE)
                task.status = TaskStatus.FAILED
                task.error = str(e)
                tasks.append(task)
        return tasks

    def cleanup_task_outputs(self, task_id: str) -> None:
        """Remove output files for a task."""
        task = self._tasks.get(task_id)
        if not task:
            return
        for p in task.output_paths:
            try:
                Path(p).unlink(missing_ok=True)
            except OSError as e:
                logger.warning("Could not remove %s: %s", p, e)

    def cleanup_upload(self, path: Path) -> None:
        """Remove uploaded file after processing."""
        try:
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
        except OSError as e:
            logger.warning("Could not remove upload %s: %s", path, e)


# Singleton
_conversion_service: Optional[ConversionService] = None


def get_conversion_service() -> ConversionService:
    global _conversion_service
    if _conversion_service is None:
        _conversion_service = ConversionService()
    return _conversion_service
