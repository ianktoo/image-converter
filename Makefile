# Image Converter - make targets
# Usage: make [target]
#   make          → run all (backend + frontend)
#   make run      → same
#   make backend  → backend only (port 8000)
#   make frontend → frontend only (port 5173)
#   make install  → install root + frontend deps; backend: pip install -r backend/requirements.txt

.PHONY: run all backend frontend install install-backend install-frontend

# Default: run both
run: all
all:
	npm run dev

# Backend only (Python API)
backend:
	cd backend && python -m uvicorn app.main:app --reload --port 8000

# Frontend only (Vite)
frontend:
	cd frontend && npm run dev

# First-time setup
install: install-frontend install-backend

install-frontend:
	npm install
	cd frontend && npm install

install-backend:
	cd backend && pip install -r requirements.txt
