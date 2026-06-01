"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.ai import ensure_ai_tables
from app.api.ai import router as ai_router
from app.api.organize import router as organize_router
from app.api.routes import router
from app.config import CORS_ORIGINS, logger as config_logger
from app.db import init_db
from app.organize import ensure_organize_tables

logging.getLogger("uvicorn").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_organize_tables()
    ensure_ai_tables()
    config_logger.info("Converter API started")
    yield
    config_logger.info("Converter API shutting down")


app = FastAPI(
    title="Image/Video Converter API",
    description="Convert images and videos to WebP and other formats with progress tracking.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def session_header_middleware(request, call_next):
    """Set X-Session-ID on response when the session was created by the dependency."""
    response = await call_next(request)
    if hasattr(request.state, "session_id"):
        response.headers["X-Session-ID"] = request.state.session_id
    return response


app.middleware("http")(session_header_middleware)
app.include_router(router)
app.include_router(organize_router)
app.include_router(ai_router)

# Serve the built frontend (frontend/dist) when present so the whole app runs on
# one origin/port in production. API routes above are registered first and keep
# priority; this catch-all mount only handles non-/api paths. In dev (no dist),
# the Vite server serves the UI and proxies /api here instead.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
    config_logger.info("Serving frontend from %s", _FRONTEND_DIST)


if __name__ == "__main__":
    import uvicorn
    from app.config import HOST, PORT
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
