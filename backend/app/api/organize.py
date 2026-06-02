"""REST routes for projects, folders, tags, and media library.

All endpoints are session-scoped via X-Session-ID header (handled by get_or_create_session_id
dependency, identical to the converter routes).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.api.routes import get_or_create_session_id
from app.organize import db as orga

logger = logging.getLogger("converter.api.organize")
router = APIRouter(prefix="/api", tags=["organize"])


# -------- pydantic schemas --------

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = None


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    project_id: Optional[str] = None
    parent_id: Optional[str] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    project_id: Optional[str] = None
    parent_id: Optional[str] = None
    clear_project: bool = False
    clear_parent: bool = False


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    color: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    color: Optional[str] = None


class MediaUpdate(BaseModel):
    project_id: Optional[str] = None
    folder_id: Optional[str] = None
    notes: Optional[str] = None
    clear_project: bool = False
    clear_folder: bool = False


# -------- projects --------

@router.post("/projects")
def create_project(body: ProjectIn, request: Request, session_id: str = Depends(get_or_create_session_id)):
    project = orga.create_project(session_id, body.name.strip(), body.description, body.color)
    return project


@router.get("/projects")
def list_projects(session_id: str = Depends(get_or_create_session_id)):
    return {"projects": orga.list_projects(session_id)}


@router.get("/projects/{project_id}")
def get_project(project_id: str, session_id: str = Depends(get_or_create_session_id)):
    project = orga.get_project(session_id, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.patch("/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, session_id: str = Depends(get_or_create_session_id)):
    updated = orga.update_project(
        session_id,
        project_id,
        name=body.name.strip() if body.name else None,
        description=body.description,
        color=body.color,
    )
    if not updated:
        raise HTTPException(404, "Project not found")
    return updated


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = orga.delete_project(session_id, project_id)
    if not ok:
        raise HTTPException(404, "Project not found")
    return {"ok": True}


# -------- folders --------

@router.post("/folders")
def create_folder(body: FolderIn, session_id: str = Depends(get_or_create_session_id)):
    if body.project_id and not orga.get_project(session_id, body.project_id):
        raise HTTPException(400, "Unknown project_id")
    if body.parent_id and not orga.get_folder(session_id, body.parent_id):
        raise HTTPException(400, "Unknown parent_id")
    return orga.create_folder(session_id, body.name.strip(), body.project_id, body.parent_id)


@router.get("/folders")
def list_folders(
    project_id: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    session_id: str = Depends(get_or_create_session_id),
):
    return {"folders": orga.list_folders(session_id, project_id=project_id, parent_id=parent_id)}


@router.get("/folders/{folder_id}")
def get_folder(folder_id: str, session_id: str = Depends(get_or_create_session_id)):
    folder = orga.get_folder(session_id, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return folder


@router.patch("/folders/{folder_id}")
def update_folder(folder_id: str, body: FolderUpdate, session_id: str = Depends(get_or_create_session_id)):
    if body.project_id and not orga.get_project(session_id, body.project_id):
        raise HTTPException(400, "Unknown project_id")
    if body.parent_id and body.parent_id == folder_id:
        raise HTTPException(400, "Folder cannot be its own parent")
    if body.parent_id and not orga.get_folder(session_id, body.parent_id):
        raise HTTPException(400, "Unknown parent_id")
    updated = orga.update_folder(
        session_id,
        folder_id,
        name=body.name.strip() if body.name else None,
        project_id=body.project_id,
        parent_id=body.parent_id,
        _clear_project=body.clear_project,
        _clear_parent=body.clear_parent,
    )
    if not updated:
        raise HTTPException(404, "Folder not found")
    return updated


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = orga.delete_folder(session_id, folder_id)
    if not ok:
        raise HTTPException(404, "Folder not found")
    return {"ok": True}


# -------- tags --------

@router.post("/tags")
def create_tag(body: TagIn, session_id: str = Depends(get_or_create_session_id)):
    try:
        return orga.create_tag(session_id, body.name.strip(), body.color)
    except Exception as e:
        # most likely unique constraint
        raise HTTPException(409, f"Tag already exists: {e!s}")


@router.get("/tags")
def list_tags(session_id: str = Depends(get_or_create_session_id)):
    return {"tags": orga.list_tags(session_id)}


@router.patch("/tags/{tag_id}")
def update_tag(tag_id: str, body: TagUpdate, session_id: str = Depends(get_or_create_session_id)):
    updated = orga.update_tag(
        session_id,
        tag_id,
        name=body.name.strip() if body.name else None,
        color=body.color,
    )
    if not updated:
        raise HTTPException(404, "Tag not found")
    return updated


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = orga.delete_tag(session_id, tag_id)
    if not ok:
        raise HTTPException(404, "Tag not found")
    return {"ok": True}


# -------- media library --------

@router.get("/media")
def list_media(
    project_id: Optional[str] = Query(None),
    folder_id: Optional[str] = Query(None),
    tag_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    session_id: str = Depends(get_or_create_session_id),
):
    items = orga.list_media(
        session_id,
        project_id=project_id,
        folder_id=folder_id,
        tag_id=tag_id,
        q=q,
        limit=limit,
    )
    # Attach tags in one batched query so cards can show chips / quick-tag state.
    tags_by_task = orga.get_tags_for_tasks(session_id, [it["task_id"] for it in items])
    for it in items:
        it["tags"] = tags_by_task.get(it["task_id"], [])
    return {"items": items}


@router.get("/media/{task_id}")
def get_media(task_id: str, session_id: str = Depends(get_or_create_session_id)):
    item = orga.get_media(session_id, task_id)
    if not item:
        raise HTTPException(404, "Media not found")
    item["tags"] = orga.get_tags_for_task(session_id, task_id)
    return item


@router.patch("/media/{task_id}")
def update_media(task_id: str, body: MediaUpdate, session_id: str = Depends(get_or_create_session_id)):
    if body.project_id and not orga.get_project(session_id, body.project_id):
        raise HTTPException(400, "Unknown project_id")
    if body.folder_id and not orga.get_folder(session_id, body.folder_id):
        raise HTTPException(400, "Unknown folder_id")
    updated = orga.update_media(
        session_id,
        task_id,
        project_id=body.project_id,
        folder_id=body.folder_id,
        notes=body.notes,
        _clear_project=body.clear_project,
        _clear_folder=body.clear_folder,
    )
    if not updated:
        raise HTTPException(404, "Media not found")
    updated["tags"] = orga.get_tags_for_task(session_id, task_id)
    return updated


@router.post("/media/{task_id}/tags")
def add_media_tags(
    task_id: str,
    tag_ids: list[str] = Body(..., embed=True),
    session_id: str = Depends(get_or_create_session_id),
):
    if not orga.get_media(session_id, task_id):
        raise HTTPException(404, "Media not found")
    final_ids = orga.attach_tags(session_id, task_id, tag_ids)
    return {"tag_ids": final_ids, "tags": orga.get_tags_for_task(session_id, task_id)}


@router.delete("/media/{task_id}/tags/{tag_id}")
def remove_media_tag(task_id: str, tag_id: str, session_id: str = Depends(get_or_create_session_id)):
    ok = orga.detach_tag(session_id, task_id, tag_id)
    if not ok:
        raise HTTPException(404, "Tag link not found")
    return {"ok": True}
