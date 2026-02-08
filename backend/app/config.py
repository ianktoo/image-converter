"""Application configuration. Loads from environment and .env file."""
import logging
import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Load .env from cwd, then backend/.env, then project root .env
load_dotenv()
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

# Paths (override with env)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(BASE_DIR / "outputs")))
BATCH_ZIP_DIR = Path(os.getenv("BATCH_ZIP_DIR", str(BASE_DIR / "zips")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
BATCH_ZIP_DIR.mkdir(parents=True, exist_ok=True)

# Supported formats
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}

# Conversion options (env overrides)
WEB_OPTIMIZED_QUALITY = int(os.getenv("WEB_OPTIMIZED_QUALITY", "85"))
WEB_OPTIMIZED_EFFORT = int(os.getenv("WEB_OPTIMIZED_EFFORT", "6"))
DEFAULT_QUALITY = int(os.getenv("DEFAULT_QUALITY", "90"))
IMAGE_OUTPUT_FORMATS = ["webp", "jpeg", "png", "avif"]
VIDEO_OUTPUT_FORMATS = ["webp", "mp4", "webm"]

# Size presets (name -> (width, height)) for social / ads
SIZE_PRESETS = {
    "original": None,
    "instagram_square": (1080, 1080),
    "instagram_portrait": (1080, 1350),
    "instagram_story": (1080, 1920),
    "facebook_post": (1200, 630),
    "twitter_post": (1200, 675),
    "linkedin_banner": (1200, 627),
    "linkedin_background": (1584, 396),
    "pinterest": (1000, 1500),
    "youtube_thumbnail": (1280, 720),
    "google_display": (1200, 628),
}

# Concurrency
MAX_WORKERS = int(os.getenv("MAX_WORKERS", str(min(32, (os.cpu_count() or 4) + 4))))

# Database – SQLite by default. For MySQL use either DATABASE_URL or MYSQL_* vars (password with @ is safe with MYSQL_*).
#   MySQL (single URL; if password contains @ or #, use MYSQL_* vars instead): mysql+pymysql://user:password@localhost:3306/converter
#   MySQL (separate vars; password is not parsed as URL): MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
#   SQL Server: mssql+pyodbc://user:password@localhost/DbName?driver=ODBC+Driver+17+for+SQL+Server
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    mysql_host = os.getenv("MYSQL_HOST", "").strip()
    mysql_user = os.getenv("MYSQL_USER", "").strip()
    mysql_password = os.getenv("MYSQL_PASSWORD", "")
    mysql_database = os.getenv("MYSQL_DATABASE", "").strip()
    if mysql_host and mysql_user and mysql_database:
        mysql_port = os.getenv("MYSQL_PORT", "3306").strip()
        user_enc = quote_plus(mysql_user)
        pass_enc = quote_plus(mysql_password)
        DATABASE_URL = f"mysql+pymysql://{user_enc}:{pass_enc}@{mysql_host}:{mysql_port}/{mysql_database}"
    else:
        db_path = BASE_DIR / "data" / "converter.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        DATABASE_URL = f"sqlite:///{db_path}"

# Limits (env)
URL_DOWNLOAD_TIMEOUT = int(os.getenv("URL_DOWNLOAD_TIMEOUT", "60"))
# Images: max count per upload, max size per file (MB)
MAX_IMAGES_PER_UPLOAD = int(os.getenv("MAX_IMAGES_PER_UPLOAD", "10"))
MAX_IMAGE_SIZE_MB = int(os.getenv("MAX_IMAGE_SIZE_MB", "20"))
MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
# Videos: one at a time, max size per file (MB)
MAX_VIDEOS_PER_UPLOAD = 1
MAX_VIDEO_SIZE_MB = int(os.getenv("MAX_VIDEO_SIZE_MB", "150"))
MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024
# URL download: use same per-type limits
URL_DOWNLOAD_MAX_IMAGE_MB = int(os.getenv("URL_DOWNLOAD_MAX_IMAGE_MB", str(MAX_IMAGE_SIZE_MB)))
URL_DOWNLOAD_MAX_IMAGE_BYTES = URL_DOWNLOAD_MAX_IMAGE_MB * 1024 * 1024
URL_DOWNLOAD_MAX_VIDEO_MB = int(os.getenv("URL_DOWNLOAD_MAX_VIDEO_MB", str(MAX_VIDEO_SIZE_MB)))
URL_DOWNLOAD_MAX_VIDEO_BYTES = URL_DOWNLOAD_MAX_VIDEO_MB * 1024 * 1024

# Server (for uvicorn)
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
# CORS: comma-separated origins, e.g. "http://localhost:5173,http://127.0.0.1:5173"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("converter")
