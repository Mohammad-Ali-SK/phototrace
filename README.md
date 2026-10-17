# PhotoTrace AI – setup (Windows)
Requirements: Node 18+, Python 3.11+, Docker Desktop (for PostgreSQL).

## Backend
```
docker compose up -d db
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      (then edit: SECRET_KEY, email/SMS credentials)
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Docs: http://localhost:8000/docs · Tests: `pytest` (uses SQLite + a test-only delivery adapter).
Backend reads `.env` values from the process environment: in PowerShell load them or set them with `$env:SECRET_KEY="..."` before starting.

## Frontend
```
copy .env.example .env      (VITE_API_URL=http://localhost:8000)
npm install
npm run dev
```
## Production notes
HTTPS only; APP_ENV=production, COOKIE_SECURE=true, exact CORS_ORIGINS; if frontend and API are on different sites use COOKIE_SAMESITE=none.
Run behind a proxy that sets the real client IP (rate limits are per IP and per contact); store uploads on durable storage; verify your sending domain (Resend) / Twilio sender.

To run the backend tests on PostgreSQL instead of SQLite: create an empty database and set TEST_DATABASE_URL (the suite drops/creates its tables there), e.g.
  set TEST_DATABASE_URL=postgresql+psycopg://phototrace:phototrace@localhost:5432/phototrace_test
  pytest
Frontend tests: `npm test` (jsdom render/guard tests, mocked fetch).
