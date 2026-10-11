# Clubs

A service for book, movie, sport, and board game clubs that brings groups together around shared interests. Create a club, choose what to read, watch, or play, and make it easy to plan the next meetup.

Members can share recommendations, ratings, and reviews; collect titles on a club list; and keep conversations going between meetups. Whether your group meets in person or online, Clubs helps turn a shared love of books and movies into a welcoming, organized community.

## Stack

- **Backend:** FastAPI with separate clubs, users, and events routers under `/api`
- **Database:** SQLAlchemy 2 with PostgreSQL, configured through Pydantic Settings
- **Migrations:** Alembic (`migrations/`)
- **Frontend:** React, TypeScript, Vite, and React Router
- **Serving the frontend:** FastAPI's `APIRouter.frontend()` serves the built React app and falls back to `index.html` for client-side routes.

## Run locally

Install the Python and JavaScript dependencies:

```sh
make install
```

Configuration is read from the project-root `.env` file. Set `DATABASE_URL` to the complete PostgreSQL connection URL from Supabase; both the application and Alembic migrations use it. For the Supabase pooler, preserve the username format `postgres.<project-ref>` and the host and port shown in its connection details (for example, port `5432`). URL-encode special characters in the database password. Set `SUPABASE_URL` for backend token verification; if omitted, the backend uses `VITE_SUPABASE_URL` and derives the standard JWKS endpoint. The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Set `SUPABASE_SECRET_KEY` only when using the admin user-list endpoint. See [.env.example](.env.example) for the format; keep real credentials in your ignored `.env` file. Runtime settings are `LOG_LEVEL` (`CRITICAL`, `ERROR`, `WARNING`, `INFO`, or `DEBUG`), `DEBUG` (`true`/`false`), and `PORT` (defaults to `8000`).

To enable Google sign-in, configure Google as a provider in **Supabase Dashboard → Authentication → Sign In / Providers** with a Google OAuth client ID and secret. Add your Supabase project's Auth callback URL (shown in the provider settings) to the Google OAuth client's authorized redirect URIs. Add the app origins you use (such as `http://localhost:5173`) to **Authentication → URL Configuration → Redirect URLs** in Supabase. The frontend sends users back to the current app origin after Google authentication.

In Google Auth Platform, open **Data Access** and make sure `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile` are configured. Add `openid` manually if it is missing; the email and profile scopes are normally present by default. The frontend requests `openid email profile` during sign-in.

For local Supabase CLI development, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` in the project-root `.env` and replace the placeholder `client_id` in [supabase/config.toml](supabase/config.toml). The secret is intentionally kept out of frontend environment variables. This local configuration does not update a hosted Supabase project's Auth settings; configure the Google provider in that project's dashboard as well.

The shared SQLAlchemy engine, declarative model base, session factory, and FastAPI `get_db` dependency are in `app/core/database.py`. Add ORM models under their backend domain and import them into the Alembic environment before generating migrations.

Create and apply a migration with:

```sh
uv run alembic revision --autogenerate -m "describe schema change"
uv run alembic upgrade head
```

Migration revisions are numbered sequentially and use Alembic's lowercase underscore slug, for example `00001_initial_migration.py`.

Start the local PostgreSQL container, FastAPI, and the Vite frontend together:

```sh
make dev
```

Open the Vite URL printed in the terminal. The local database is available on `LOCAL_DATABASE_PORT` (default `5432`) with a persistent Compose volume. `make db-down` stops it without deleting its data. `PORT` controls FastAPI and the Vite API proxy; `LOG_LEVEL` controls logging; `DEBUG=true` enables FastAPI debug mode and Uvicorn reload.

You can also run the API and frontend separately with `make dev-backend` and `make dev-frontend`; start the database first with `make db-up`.

Interactive API documentation is at `http://127.0.0.1:8000/docs` by default; it follows the configured `PORT` if changed.

`GET /api/users` returns all Supabase Auth user records, including their user and app metadata. It requires a valid signed-in user token and the server-only `SUPABASE_SECRET_KEY`; access is available to any signed-in user. Results are fetched across all Supabase pages.

## Build and serve together

```sh
cd frontend && npm run build
cd ..
uv run python -m app
```

FastAPI serves the production frontend at `http://127.0.0.1:8000`. React Router paths such as `/clubs/sunday-pages` are served through the `index.html` fallback, while API endpoints remain under `/api`.
