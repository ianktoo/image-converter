# Image Converter

Convert images and videos to WebP and other formats (React + Python).

## Run everything (backend + frontend)

**One-time setup:**

```bash
# Project root: install runner dependency
npm install

# Backend: create venv and install deps (Python 3.13)
cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && cd ..
```

**Start both:**

```bash
npm run dev
```

Or double-click **`run.bat`** (Windows), or run **`.\run.ps1`** in PowerShell.

- Backend: http://127.0.0.1:8000  
- Frontend: http://localhost:5173  

To run only one:

- Backend: `npm run dev:backend`
- Frontend: `npm run dev:frontend`

## Configuration (env files)

Optional: use `.env` to override defaults.

- **Backend:** copy `backend/.env.example` to `backend/.env`. You can set:
  - `DATABASE_URL` – optional; default is SQLite at `backend/data/converter.db`. Set for MySQL (e.g. `mysql+pymysql://user:password@localhost:3306/converter`) or SQL Server (see `backend/.env.example`).
  - `UPLOAD_DIR`, `OUTPUT_DIR`, `BATCH_ZIP_DIR` – paths
  - `URL_DOWNLOAD_MAX_MB`, `URL_DOWNLOAD_TIMEOUT` – URL download limits
  - `HOST`, `PORT` – server bind (default `0.0.0.0:8000`)
  - `CORS_ORIGINS` – comma-separated allowed origins (e.g. frontend URL)
  - `LOG_LEVEL` – e.g. `DEBUG`, `INFO`
- **Frontend:** copy `frontend/.env.example` to `frontend/.env`. You can set:
  - `VITE_API_BASE_URL` – API base (leave empty when using dev proxy)
  - `VITE_APP_TITLE` – app title
  - `VITE_DEBUG=true` – show raw error details in the UI

## Make commands

If you have `make` installed:

| Command   | Description                          |
|-----------|--------------------------------------|
| `make`    | Run both backend and frontend (default) |
| `make run` | Same as `make`                       |
| `make backend` | Backend only (port 8000)          |
| `make frontend` | Frontend only (port 5173)         |
| `make install` | Install all dependencies (root + frontend + backend pip) |
