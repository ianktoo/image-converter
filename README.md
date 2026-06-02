# Image Converter

Convert images and videos to WebP and other formats (React + Python).

## Architecture

A React single-page app talks to a FastAPI backend over a **session-scoped `/api`**. The
backend converts media with **Pillow** (images) and **ffmpeg** (video) on a thread pool,
persists per-session metadata to SQL, and stores files on local disk. There is no login —
each browser gets an `X-Session-ID` that scopes all of its data. Sessions are **ephemeral**:
they expire after 1 hour of inactivity (sliding window) and a background sweeper purges the
expired session's rows and files, so users never collide and disk doesn't grow unbounded.
A session with a batch still processing is never swept and is refreshed when the job finishes.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser — React SPA (Vite, TypeScript, shadcn/ui, Tailwind, PWA)          │
│  Views: Convert · Library (tree + media grid) · AI Explain                 │
│  (view-context switches views; no router)                                  │
│  lib/api.ts  →  sends X-Session-ID (stored in localStorage)                │
└───────────────┬────────────────────────────────────────────────────────────┘
                │  HTTP  /api/*
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FastAPI app (backend/app/main.py)                                         │
│   • CORS + session-header middleware (returns X-Session-ID on new sessions)│
│   • Routers, all under /api:  routes.py (convert) · organize.py · ai.py    │
│   • Serves frontend/dist at "/" when present → single-port prod mode       │
└───┬───────────────────────┬────────────────────────┬───────────────────────┘
    │                       │                        │
    ▼                       ▼                        ▼
ConversionService       organize/db.py +         ai/service.py
(singleton, thread      ai/db.py + db.py         (Anthropic SDK)
 pool; in-memory        (SQLAlchemy Core)              │
 task registry)              │                         ▼
 • Pillow  (images)          │                   Claude API (vision)
 • ffmpeg  (video)           │
    │                        │
    ▼                        ▼
Local disk               SQL database  (SQLite default │ MySQL │ SQL Server)
 uploads/  outputs/       sessions · session_activities · batches · events
 zips/     library/       projects · folders · tags · media_tags
                          prompt_templates · ai_explanations
```

### Tech stack

| Layer        | Choices                                                                 |
|--------------|-------------------------------------------------------------------------|
| Frontend     | React + Vite + TypeScript, shadcn/ui, Tailwind, PWA (`vite-plugin-pwa`)  |
| Backend      | FastAPI, Uvicorn, Pydantic                                              |
| Conversion   | Pillow (+ `pillow-heif` for HEIC), ffmpeg (external binary) for video    |
| Persistence  | SQLAlchemy Core — SQLite by default, MySQL or SQL Server via env         |
| AI           | Anthropic Claude (vision) via the `anthropic` SDK                        |

### Backend modules

- **`api/routes.py`** — convert/upload, URL import, batch + zip, downloads, session stats, media library.
- **`api/organize.py`** — projects, folders, tags, and media CRUD (media is a view over `session_activities`).
- **`api/ai.py`** — prompt templates and `/ai/explain` (sends a converted output to Claude).
- **`conversion/service.py`** — `ConversionService` singleton: Pillow image pipeline (resize/crop/format/quality), ffmpeg video pipeline, run in a `ThreadPoolExecutor`; tasks tracked in memory.
- **`batch.py`** — background batch jobs + zip building (`flat | by_file | by_format`); state persisted so it survives restarts.
- **`db.py`** — engine, DDL, session/activity/event/observability queries, and a fallback chain (configured DB → SQLite file → in-memory) so the app always starts.

### Storage

| Dir                | Holds                                                       |
|--------------------|-------------------------------------------------------------|
| `backend/uploads`  | Incoming files (deleted after conversion unless saved)      |
| `backend/outputs`  | Converted results, served via download endpoints            |
| `backend/zips`     | Batch zip archives                                          |
| `backend/library`  | Persisted originals for the "save-first" media library      |
| `backend/data`     | SQLite database (`converter.db`) when using the default DB   |

### Key flows

1. **Convert** — `POST /api/upload-multiple` writes to `uploads/`, runs the thread-pool conversion to `outputs/`, records an activity row, cleans up the upload, returns task results. Download via `/api/download/{task_id}/{filename}`.
2. **Batch** — `POST /api/upload-batch` returns a `batch_id` and converts in the background, then zips. Poll `GET /api/batch/{id}`; fetch `GET /api/batch/{id}/zip` when complete.
3. **Save-first library** — `POST /api/media/save` stores originals in `library/` without converting; `POST /api/media/{task_id}/convert` converts a saved original later and attaches outputs to the same item.
4. **Library / organize** — one **Library** workspace (left tree: All media / Projects→Folders / Tags) where projects, folders, and tags are created inline at the point of use. Per-card quick actions (move/tag/convert/delete), multi-select bulk actions, and **Convert all** for a scope. `POST /api/library/convert` (scope = `task_ids | project_id | folder_id`) converts every saved original in the background, attaches outputs to each item in place, and bundles one ZIP (poll `/api/batch/{id}`, download `/api/batch/{id}/zip`).
5. **AI explain** — `POST /api/ai/explain` loads a converted output, sends it to Claude with a prompt/template, and stores the explanation. Requires `ANTHROPIC_API_KEY` (see Configuration).
6. **Session & cleanup** — every request upserts the session (sliding 1-hour TTL) and logs an event; `GET /api/session/stats` and `/api/observability/summary` drive the dashboard; `DELETE /api/session/data` purges all of the session's rows and files. A background sweeper (every `SESSION_SWEEP_INTERVAL_SECONDS`) auto-purges sessions idle past `SESSION_TTL_SECONDS`, skipping any with a batch still `processing` and refreshing a session's clock when its batch finishes.

### Frontend ↔ backend wiring

- **Dev:** Vite (`:5173`) serves the UI and proxies `/api` → Uvicorn (`:8000`).
- **Local one-app prod:** FastAPI serves `frontend/dist` and `/api` from one port — see [Run locally as one app](#run-locally-as-one-app-custom-hostname-single-port-auto-start).
- The client uses a relative `/api` base unless `VITE_API_BASE_URL` is set (used for split deployments like Vercel + a separate API host).

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

## Run with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

This starts both services with live reload:

- Frontend: http://localhost:9000 (Vite dev server)
- Backend: http://localhost:9090 (FastAPI + ffmpeg baked into the image)

Uploads, outputs, zips and the SQLite database persist in named Docker volumes (`backend-uploads`, `backend-outputs`, `backend-zips`, `backend-data`). To wipe them: `docker compose down -v`.

## Run locally as one app (custom hostname, single port, auto-start)

For a "production-like" local install that serves the built frontend **and** the API from
a single origin under a friendly name — **http://image-converter.test:7420** — and starts
automatically when you log into Windows.

How it works: when `frontend/dist` exists, the FastAPI app (`backend/app/main.py`) mounts
it at `/`, so the UI and the `/api` routes share one port. No Vite proxy, no CORS.

**One-time setup:**

1. Map the hostname to loopback. In an **elevated** PowerShell (Run as administrator):

   ```powershell
   Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" -Value "127.0.0.1`timage-converter.test" -Encoding ASCII
   ipconfig /flushdns
   ```

   > `.test` is reserved for local use and resolves instantly via the hosts file. Avoid
   > `.local` on Windows — it triggers mDNS lookups that are slow/flaky.

2. Add the auto-start shortcut (runs at every logon). Create a shortcut in your Startup
   folder (`Win + R` → `shell:startup`) that runs:

   ```
   powershell.exe -ExecutionPolicy Bypass -File "C:\path\to\image-converter\serve-prod.ps1"
   ```

**Scripts:**

- **`serve-prod.ps1`** — the server. Builds the frontend if `frontend/dist` is missing
  (`-Build` forces a rebuild), then runs uvicorn from `backend/.venv` on `127.0.0.1:7420`.
  It refuses to start a second instance if the port is already in use.
- **`app.ps1`** — control script:

  ```powershell
  .\app.ps1 status     # RUNNING + PID, or STOPPED
  .\app.ps1 start      # start (no-op if already running)
  .\app.ps1 stop       # stop the running server
  .\app.ps1 restart    # stop then start
  ```

  `status` always prints the PID, so you can also stop it manually with
  `Stop-Process -Id <PID>`. To see what holds the port:
  `Get-NetTCPConnection -LocalPort 7420 -State Listen`.

To change the port, edit `$AppPort` near the top of both `serve-prod.ps1` and `app.ps1`.

This is independent of `npm run dev` — dev mode (below) still serves the UI via Vite with
hot reload and proxies `/api` to port 8000 as usual.

## Configuration (env files)

Optional: use `.env` to override defaults.

- **Backend:** copy `backend/.env.example` to `backend/.env`. You can set:
  - `DATABASE_URL` – optional; default is SQLite at `backend/data/converter.db`. Set for MySQL (e.g. `mysql+pymysql://user:password@localhost:3306/converter`) or SQL Server (see `backend/.env.example`).
  - `UPLOAD_DIR`, `OUTPUT_DIR`, `BATCH_ZIP_DIR` – paths
  - `URL_DOWNLOAD_MAX_MB`, `URL_DOWNLOAD_TIMEOUT` – URL download limits
  - `HOST`, `PORT` – server bind (default `0.0.0.0:8000`)
  - `CORS_ORIGINS` – comma-separated allowed origins (e.g. frontend URL)
  - `SESSION_TTL_SECONDS` – session inactivity timeout before purge (default `3600` = 1 hour)
  - `SESSION_SWEEP_INTERVAL_SECONDS` – how often the background sweeper runs (default `300`)
  - `LOG_LEVEL` – e.g. `DEBUG`, `INFO`
- **Frontend:** copy `frontend/.env.example` to `frontend/.env`. You can set:
  - `VITE_API_BASE_URL` – API base (leave empty when using dev proxy)
  - `VITE_APP_TITLE` – app title
  - `VITE_DEBUG=true` – show raw error details in the UI

## Deploy on Vercel (frontend only)

The repo is set up to deploy the **frontend** to [Vercel](https://vercel.com):

1. Import the project in Vercel (GitHub/GitLab/Bitbucket).
2. Use the default build settings (root directory: project root; `vercel.json` sets build/output).
3. Add environment variables in the Vercel dashboard if needed:
   - **`VITE_API_BASE_URL`** – full URL of your backend (e.g. `https://your-api.vercel.app` or another host). Leave empty only if you serve the API from the same origin.
4. Deploy.

The backend (FastAPI) is not deployed by this config. Run it elsewhere (e.g. Railway, Render, or a Vercel serverless API) and set `VITE_API_BASE_URL` so the frontend can call it.

## Deploy on Render (frontend + backend)

The repo includes a [Render Blueprint](https://docs.render.com/blueprint-spec) so you can deploy both the **frontend** (static site) and **backend** (Python API) on [Render](https://render.com):

1. In the [Render Dashboard](https://dashboard.render.com), go to **New → Blueprint**.
2. Connect your Git repo; Render will detect `render.yaml` and create two services:
   - **image-converter-frontend** – static site (Vite build, served from CDN).
   - **image-converter-api** – web service (FastAPI on Python 3.13).
3. After the first deploy, set environment variables in the Dashboard:
   - **Frontend:** `VITE_API_BASE_URL` = your backend URL (e.g. `https://image-converter-api.onrender.com`). Redeploy the frontend after changing it.
   - **Backend:** `CORS_ORIGINS` = your frontend URL (e.g. `https://image-converter-frontend.onrender.com`). Add `DATABASE_URL` if you use MySQL/Postgres instead of SQLite.
4. Optional: attach a [persistent disk](https://docs.render.com/disks) to the API service if you want SQLite/data to persist across deploys (otherwise the filesystem is ephemeral).

Python version is set via `backend/.python-version` (3.13).

## Make commands

If you have `make` installed:

| Command   | Description                          |
|-----------|--------------------------------------|
| `make`    | Run both backend and frontend (default) |
| `make run` | Same as `make`                       |
| `make backend` | Backend only (port 8000)          |
| `make frontend` | Frontend only (port 5173)         |
| `make install` | Install all dependencies (root + frontend + backend pip) |
