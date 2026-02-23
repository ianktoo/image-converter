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
