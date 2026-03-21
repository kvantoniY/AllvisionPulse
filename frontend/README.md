# Allvision Pulse — Frontend MVP

## Tech
- Next.js (App Router)
- TypeScript
- Redux Toolkit + RTK Query
- CSS Modules (no UI libs)

## Key architecture decisions
- **Tokens are stored in httpOnly cookies** (`av_access`, `av_refresh`).
- Client never reads tokens.
- All API calls go through Next Route Handlers:
  - `/api/auth/*` — login/register/logout (sets/clears cookies)
  - `/api/backend/*` — proxy to Express `/api/*` with auto `Authorization` and **auto-refresh on 401**.

## Env
Copy `.env.example` to `.env` and set backend URL:

```
BACKEND_URL=http://localhost:4000
```

## Run
```
npm i
npm run dev
```

## Routes
- Public: `/auth/login`, `/auth/register`
- Protected: `/feed`, `/health`, `/messages`, `/profile/:username`, `/settings`, `/game`

Middleware redirects:
- If **not authenticated** (no refresh cookie) → redirect to `/auth/login`
- If authenticated → cannot open `/auth/*` (redirect to `/`)

## Health
Implemented check-in page using backend endpoints:
- `GET /api/health/today`
- `GET /api/health/day/:date`
- `PUT /api/health/checkin`
- `GET /api/health/stats?days=...`
