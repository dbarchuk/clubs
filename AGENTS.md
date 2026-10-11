# Agents — Clubs Project

## Project Overview

A book and movie clubs service with a React + TypeScript frontend and a FastAPI + SQLAlchemy backend backed by PostgreSQL.

---

## 🤝 Collaboration Rule

If you need additional information to complete a task, **always ask before proceeding**. Never assume project details, conventions, or requirements that aren't documented here or in the codebase.

---

## 🖥️ React Frontend Best Practices

### Stack
- React 19, TypeScript 6, Vite, react-router-dom v7, lucide-react, oxlint

### File Organization
- Components live in `frontend/src/` — use descriptive file names (`ClubCard.tsx`, not `index.tsx`)
- Group related components in feature folders under `src/clubs/`, `src/events/`, etc.
- Page-level components go in `src/pages/` with matching CSS (`login.css`)
- Shared utilities and types go in `src/lib/` and `src/types/`
- Auth context and hooks live in `src/lib/auth-context.ts`
- `AuthProvider` component lives in `src/lib/auth.tsx`
- Supabase client singleton lives in `src/lib/supabase.ts`
- `App.tsx` handles routing and conditional rendering (login vs. app shell)

### Component Conventions
- Use **function components only** (no class components)
- Define prop types with `interface` or `type` aliases — always explicit, never `any`
- Use `React.FC<Props>` only if you need children; otherwise plain typed arrow functions
- Keep components small — split into presentational and container patterns when needed
- Use `export { default }` for component files

```tsx
// Good
interface ClubCardProps { club: Club }
export function ClubCard({ club }: ClubCardProps) { ... }
```

### Hooks Rules
- Only call hooks at the top level — never inside conditionals, loops, or nested functions
- Custom hooks must start with `use` (e.g., `useClubs`, `useAuth`)
- Always handle loading and error states explicitly — never assume data is present
- Use `useState` / `useEffect` sparingly; prefer derived state and `useMemo` / `useCallback`
- Never call `setState` synchronously inside an effect if it can trigger cascading renders — derive values during render instead

```tsx
// Always handle both loading and error
const { data, loading, error } = useClubs()
if (loading) return <Loading />
if (error) return <ErrorState message={error} />
```

### TypeScript Discipline
- `noUnusedLocals` and `noUnusedParameters` are **errors** — keep code clean
- Use `satisfies` for type-safe object literals
- Prefer `unknown` over `any`; validate with type guards before narrowing
- Never use `@ts-ignore` or `// @ts-expect-error` without a comment explaining why
- Use `ReturnType<T>` and `Parameters<T>` instead of duplicating types
- Separate type definitions (`interface`) from implementation

### Styling
- CSS is imported directly (`import './clubs.css'`)
- Use CSS custom properties (`--serif`, colors) defined in `theme.css` for consistency
- No inline `style` props except for truly dynamic values (e.g., `width: ${progress}%`)
- Utility classes only for layout; keep visual tokens in CSS

### Routing
- Use `react-router-dom` `Link` and `NavLink` for navigation
- Define routes in `App.tsx` with `<Routes>` and `<Route>`
- Protected routes: if user is not authenticated, render `<LoginPage />` instead of the app shell
- After login, show a menu with "Movie clubs" (`/movie-clubs`) and "Book clubs" (`/book-clubs`) links
- Always have a catch-all `*` route for 404

### Accessibility
- Always include `aria-label` on icon-only buttons and links
- Use semantic HTML elements (`<nav>`, `<main>`, `<section>`)
- Ensure focus-visible outlines are styled (already configured in `theme.css`)
- Icons are decorative — wrap in `aria-hidden="true"` when paired with text

### Linting
- Use `npm run lint` (oxlint) before committing
- Fix all lint errors — they are treated as blocking

### Supabase Auth
- `src/lib/supabase.ts` — singleton client initialized from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `src/lib/auth-context.ts` — `AuthContext`, `AuthContextType` interface, and `useAuth()` hook
- `src/lib/auth.tsx` — `AuthProvider` component handling session sync, profile fetching, signUp/signIn/signOut
- `src/types/supabase.ts` — shared TypeScript types (`Profile`, `Club`)
- `src/pages/LoginPage.tsx` — login/sign-up page with form, validation, and error handling
- Auth state is reactive via `onAuthStateChange` subscription
- Profile is fetched from `profiles` table on user change; cleared to `null` when no user
- Always guard profile access with `user` check — profile is derived as `user ? profile : null` to avoid stale state
- `signUp` upserts a `profiles` row with `display_name` from the full name
- `signIn` creates a profile if one doesn't exist (falls back to email prefix as `display_name`)
- `src/pages/ProfilePage.tsx` — profile view/edit page with `/me` route
- `src/pages/profile.css` — profile page styling

### Backend API Routes
- `GET /api/me` — returns the current user's profile (requires `Authorization: Bearer <supabase_token>`)
- `PUT /api/me` — updates the current user's profile (requires `Authorization: Bearer <supabase_token>`)
- Profile model: `app/backend/users/models.py` — `Profile` SQLAlchemy model with `user_id`, `display_name`, `full_name`, `avatar_url`, `bio`, `role`, `created_at`, `updated_at`
- JWT tokens are decoded with `jose` (verify_signature disabled) to extract user UUID
- Profile table: `migrations/versions/000001_add_profiles_table.py`

---

## ⚡ FastAPI Backend Best Practices

### Stack
- Python 3.13, FastAPI, SQLAlchemy 2.0 (async-ready), Pydantic v2, Alembic, psycopg

### File Organization
```
app/
├── core/           # config, database, logging, middleware
├── backend/        # feature routers (clubs, users, events)
│   ├── clubs/
│   ├── users/
│   └── events/
└── main.py         # app factory, lifespan, router registration
migrations/         # Alembic migrations
```

### Database Layer
- Use `SQLAlchemy 2.0` style with `DeclarativeBase` from `app.core.database`
- All models inherit from `Base` — never create standalone declarative bases
- Use `Session` dependency injection via `get_db()` — never create sessions outside the dependency chain
- Always use **async** functions with `await` for database operations
- Use `AsyncSession` for async database access
- Use `datetime.now(UTC)` for UTC timestamps with timezone-aware database columns. For existing timezone-naive UTC columns, use `datetime.now(UTC).replace(tzinfo=None)` to preserve their storage semantics; never use deprecated `datetime.utcnow()`.
- SQLAlchemy datetime defaults and `onupdate` values must be callables so the timestamp is generated when each row is written.

```python
# models.py
from app.core.database import Base

class Club(Base):
    __tablename__ = "clubs"
    id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = mapped_column(String, nullable=False)
    # ...
```

### SQLAlchemy Model Names
- Do not use Python built-ins or reserved words as model or field names. For example, use `club_type` instead of `type`, and avoid names such as `int`.

### Pydantic Models
- Define request/response schemas with Pydantic `BaseModel`
- Use `Literal` for constrained string values (e.g., `kind: Literal["Book", "Film"]`)
- Separate **input** models (`ClubCreate`) from **output** models (`Club`)
- Use `Field()` with constraints (`ge`, `le`, `max_length`) for validation

```python
class ClubCreate(BaseModel):
    title: str
    kind: Literal["Book", "Film"]
    description: str

class Club(BaseModel):
    id: str
    title: str
    kind: Literal["Book", "Film"]
    # ...
```

### Router Conventions
- Each feature gets its own router module under `app/backend/<feature>/`
- Always set `prefix` and `tags` on routers
- Export `router` as the default from each module
- Register routers in `app/backend/router.py` using `router.include_router()`
- Use dependency injection for database access: `Depends(get_db)`

```python
router = APIRouter(prefix="/clubs", tags=["clubs"])

@router.get("", response_model=list[Club])
async def list_clubs(db: Session = Depends(get_db)) -> list[Club]:
    ...
```

### Error Handling
- Use `HTTPException` with appropriate status codes
- Never catch broad `Exception` — catch specific SQLAlchemy errors
- Add a global exception handler for unhandled errors in `main.py`

### Configuration
- All settings via `pydantic-settings` in `app/core/config.py`
- Use `.env` file for environment variables (never hardcode secrets)
- Settings are cached with `@lru_cache` — no repeated instantiation
- Use `SecretStr` for passwords

---

## 🗄️ Alembic Migrations — ALWAYS

**Rule: Never modify the database schema directly. Always create an Alembic migration.**

### Workflow

1. **After changing any model**, generate a migration:
   ```bash
   alembic revision --autogenerate -m "description of change"
   ```
2. **Review the generated migration** before applying — check `upgrade()` and `downgrade()`
3. **Apply the migration** to bring the DB up to date:
   ```bash
   alembic upgrade head
   ```
4. **Never edit a migration script manually** unless fixing a broken migration — instead create a new corrective migration

### Migration Rules
- Every migration must have both `upgrade()` and `downgrade()` functions
- `downgrade()` must be the exact inverse of `upgrade()` — always test it
- Use descriptive revision messages: `"add user profile table"`, not `"fix"`
- Sequential revision IDs are enforced by the project's `migrations/naming.py` — respect them
- Never put DDL in `__init__.py` or any non-migration file
- When adding a table, also add any needed indexes in the migration
- If a column is nullable in the model, ensure the migration reflects `nullable=True`

### Adding a New Model
```bash
# 1. Define the model in the appropriate app/backend/<feature>/models.py
# 2. Generate migration
alembic revision --autogenerate -m "add <model_name>"
# 3. Review and apply
alembic upgrade head
```

### Schema Changes
- Adding a column → new migration, not ALTER in app code
- Renaming a column → new migration with `op.alter_column()`
- Dropping a column → new migration with `op.drop_column()`, **never** just remove from the model

---

## 🔄 Cross-Cutting Conventions

### Git
- Commit with descriptive messages
- Never commit `.env` — use `.env.example` for template
- Include migration files in every commit that touches the database schema

### Environment
- Backend runs on port 8000 (configurable via `PORT`)
- Frontend runs on Vite dev server with API proxy to `/api`
- PostgreSQL runs via Docker Compose (see `compose.yaml`)
- Use `make dev` to start everything together

### Testing
- Backend: add tests in `tests/` directory using pytest
- Frontend: add tests alongside components as `*_test.tsx` or `*.spec.tsx`
- Test both success and error paths
- Mock external dependencies (database, API calls)

### Supabase Integration (implemented)
- Auth uses `@supabase/supabase-js` and `@supabase/ssr` via client singleton at `frontend/src/lib/supabase.ts`
- Auth state managed through `AuthProvider` context at `frontend/src/lib/auth.tsx` with `useAuth()` hook
- `profiles` table in Supabase linked to `auth.users` via UUID — stores `display_name`, `avatar_url`, `bio`, `role`
- Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` defined in `frontend/.env.example` (never commit `.env`)
- Frontend reads user/profile from Supabase auth context; backend uses `Depends(get_db)` with PostgreSQL for club data
- Always wrap Supabase calls in try/catch with proper error handling
- Keep backend models in sync with Supabase schema via Alembic migrations on the PostgreSQL side

---

## Quick Reference

| Task | Command |
|------|---------|
| Start dev environment | `make dev` |
| Create migration | `alembic revision --autogenerate -m "msg"` |
| Apply migrations | `alembic upgrade head` |
| Lint frontend | `cd frontend && npm run lint` |
| Install deps | `make install` |
| Start DB | `make db-up` |
