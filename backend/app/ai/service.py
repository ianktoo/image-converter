"""Claude vision service. Loads a converted output as base64 and asks the Anthropic API to explain it."""
from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Optional

from app import config as app_config

logger = logging.getLogger("converter.ai.service")


class AIServiceError(Exception):
    """Raised when AI configuration or call fails. Caller maps to HTTP error."""


_EXT_TO_MEDIA_TYPE = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _ensure_api_key() -> str:
    key = app_config.ANTHROPIC_API_KEY
    if not key:
        raise AIServiceError(
            "ANTHROPIC_API_KEY is not configured. Set it in your environment "
            "(or docker-compose host env) to enable AI explanations.",
        )
    return key


def _read_image_b64(path: Path) -> tuple[str, str]:
    """Return (media_type, base64_data) for an image file Claude accepts."""
    ext = path.suffix.lower()
    media_type = _EXT_TO_MEDIA_TYPE.get(ext)
    if media_type is None:
        raise AIServiceError(
            f"Unsupported image format for AI: {ext}. Claude accepts JPEG, PNG, GIF, WebP.",
        )
    data = path.read_bytes()
    if len(data) > app_config.AI_MAX_IMAGE_BYTES:
        raise AIServiceError(
            f"Image too large ({len(data) // 1024} KB). "
            f"Set AI_MAX_IMAGE_BYTES or pick a smaller output.",
        )
    return media_type, base64.standard_b64encode(data).decode("ascii")


def explain_image(
    image_path: Path,
    prompt: str,
    *,
    system_prompt: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> dict:
    """Call Anthropic with an image + prompt. Returns {response, model, input_tokens, output_tokens}."""
    api_key = _ensure_api_key()
    media_type, b64 = _read_image_b64(image_path)

    try:
        # Imported lazily so the rest of the app starts even if the package is missing.
        from anthropic import Anthropic  # type: ignore
    except ImportError as e:
        raise AIServiceError(f"anthropic SDK not installed: {e}") from e

    client = Anthropic(api_key=api_key)
    model_id = model or app_config.ANTHROPIC_MODEL
    tokens = max_tokens or app_config.ANTHROPIC_MAX_TOKENS

    kwargs: dict = {
        "model": model_id,
        "max_tokens": tokens,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }
    if system_prompt and system_prompt.strip():
        kwargs["system"] = system_prompt.strip()

    try:
        resp = client.messages.create(**kwargs)
    except Exception as e:
        logger.exception("Anthropic call failed: %s", e)
        raise AIServiceError(f"Claude API call failed: {e}") from e

    # Concatenate any text blocks in the response.
    parts: list[str] = []
    for block in resp.content:
        text_val = getattr(block, "text", None)
        if isinstance(text_val, str):
            parts.append(text_val)
    text_out = "\n".join(parts).strip()

    usage = getattr(resp, "usage", None)
    return {
        "response": text_out,
        "model": getattr(resp, "model", model_id),
        "input_tokens": getattr(usage, "input_tokens", None) if usage else None,
        "output_tokens": getattr(usage, "output_tokens", None) if usage else None,
    }
