"""Conversion request/response models."""
from enum import Enum
from typing import Optional


class TaskStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    CONVERTING = "converting"
    COMPLETED = "completed"
    FAILED = "failed"


class MediaType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"


class SupportedFormats:
    IMAGE = ["webp", "jpeg", "png", "avif"]
    VIDEO = ["webp", "mp4", "webm"]


class ConversionTask:
    """In-memory task state for progress tracking."""

    def __init__(self, task_id: str, filename: str, media_type: MediaType):
        self.task_id = task_id
        self.filename = filename
        self.media_type = media_type
        self.status = TaskStatus.PENDING
        self.progress: float = 0.0
        self.error: Optional[str] = None
        self.output_paths: list[str] = []
        self.output_formats: list[str] = []
        self.input_size: Optional[int] = None  # bytes
        self.output_sizes: list[int] = []  # bytes, parallel to output_paths
