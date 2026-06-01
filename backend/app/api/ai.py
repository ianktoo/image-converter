"""REST routes for AI explain + prompt templates."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.routes import get_or_create_session_id
from app.ai import db as ai_db
from app.ai.service import AIServiceError, explain_image
from app.config import OUTPUT_DIR
from app.organize import db as orga_db

logger = logging.getLogger("converter.api.ai")
router = APIRouter(prefix="/api", tags=["ai"])


# -------- schemas --------

class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1)
    system_prompt: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    body: Optional[str] = None
    system_prompt: Optional[str] = None


class ExplainIn(BaseModel):
    task_id: str
    prompt: str = Field(min_length=1)
    system_prompt: Optional[str] = None
    template_id: Optional[str] = None
    model: Optional[str] = None
    # Which output file to send. If omitted, the first output of the task is used.
    output_filename: Optional[str] = None


# -------- prompt templates --------

@router.get("/prompts")
def list_prompts(session_id: str = Depends(get_or_create_session_id)):
    return {"templates": ai_db.list_templates(session_id)}


@router.post("/prompts")
def create_prompt(body: TemplateIn, session_id: str = Depends(get_or_create_session_id)):
    return ai_db.create_template(
        session_id,
        body.name.strip(),
        body.body,
        body.system_prompt,
    )


@router.patch("/prompts/{template_id}")
def update_prompt(template_id: str, body: TemplateUpdate, session_id: str = Depends(get_or_create_session_id)):
    updated = ai_db.update_template(
        session_id,
        template_id,
        name=body.name.strip() if body.name else None,
        body=body.body,
        system_prompt=body.system_prompt,
    )
    if not updated:
        raise HTTPException(404, "Template not found")
    return updated


@router.delete("/prompts/{template_id}")
def delete_prompt(template_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = ai_db.delete_template(session_id, template_id)
    if not ok:
        raise HTTPException(404, "Template not found")
    return {"ok": True}


# -------- AI explain --------

@router.post("/ai/explain")
def ai_explain(body: ExplainIn, session_id: str = Depends(get_or_create_session_id)):
    media = orga_db.get_media(session_id, body.task_id)
    if not media:
        raise HTTPException(404, "Media not found")
    outputs = media.get("outputs") or []
    if not outputs:
        raise HTTPException(400, "This media item has no converted outputs yet.")
    target_name = body.output_filename or outputs[0]
    if target_name not in outputs:
        raise HTTPException(400, f"Output {target_name!r} is not part of this task.")
    path = OUTPUT_DIR / target_name
    if not path.is_file():
        raise HTTPException(404, "Output file not found on disk.")

    try:
        result = explain_image(
            path,
            body.prompt,
            system_prompt=body.system_prompt,
            model=body.model,
        )
    except AIServiceError as e:
        # 422: configuration/payload problem rather than 500 (no Anthropic outage).
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.exception("AI explain failed: %s", e)
        raise HTTPException(500, "AI explanation failed")

    saved = ai_db.insert_explanation(
        session_id,
        body.task_id,
        template_id=body.template_id,
        prompt=body.prompt,
        system_prompt=body.system_prompt,
        response=result["response"],
        model=result["model"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
    )
    return saved


@router.get("/ai/explanations")
def list_explanations(
    task_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session_id: str = Depends(get_or_create_session_id),
):
    return {"explanations": ai_db.list_explanations(session_id, task_id=task_id, limit=limit)}


@router.delete("/ai/explanations/{explanation_id}")
def delete_explanation_route(explanation_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = ai_db.delete_explanation(session_id, explanation_id)
    if not ok:
        raise HTTPException(404, "Explanation not found")
    return {"ok": True}


@router.get("/ai/status")
def ai_status():
    """Lightweight check so the UI can show 'AI ready' vs 'API key missing' without making a real call."""
    from app import config as app_config
    return {
        "configured": bool(app_config.ANTHROPIC_API_KEY),
        "model": app_config.ANTHROPIC_MODEL,
        "max_image_bytes": app_config.AI_MAX_IMAGE_BYTES,
    }


# Avoid an unused import warning on Body.
_unused = Body
