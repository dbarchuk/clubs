.DEFAULT_GOAL := help

PORT ?= $(shell sed -n 's/^PORT=//p' .env 2>/dev/null | head -n 1)
ifeq ($(strip $(PORT)),)
PORT := 8000
endif
LOCAL_DATABASE_PORT ?= 5432

export PORT LOCAL_DATABASE_PORT

.PHONY: help install db-up db-down db-logs docker-up db-ui dev dev-backend rebuild-frontend

help:
	@printf '%s\n' \
	  'make install       Install Python and frontend dependencies' \
	  'make docker-up     Start PostgreSQL and pgAdmin' \
	  'make db-up         Start the local PostgreSQL container' \
	  'make db-down       Stop all Docker containers (keep their data)' \
	  'make db-logs       Follow PostgreSQL logs' \
	  'make db-ui         Open pgAdmin at http://127.0.0.1:8080' \
	  'make dev           Start Docker, rebuild frontend, and FastAPI' \
	  'make rebuild-frontend  Build the frontend production bundle'

install:
	uv sync --project "$(CURDIR)" --package clubs
	cd frontend && npm ci

docker-up:
	docker compose up --detach --wait

db-up:
	docker compose up --detach --wait db

db-down:
	docker compose down

db-logs:
	docker compose logs --follow db

db-ui:
	@printf 'pgAdmin is available at http://127.0.0.1:8080\nEmail: admin@clubs.local\nPassword: admin\n'

dev: rebuild-frontend dev-backend

dev-backend:
	uv run --project "$(CURDIR)" alembic upgrade head
	uv run --project "$(CURDIR)" python -m app

rebuild-frontend:
	cd frontend && npm run build
