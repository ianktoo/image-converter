"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import CORS_ORIGINS, logger as config_logger
from app.db import init_db

logging.getLogger("uvicorn").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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


if __name__ == "__main__":
    import uvicorn
    from app.config import HOST, PORT
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
