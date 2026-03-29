# Backend runtime audit

Current deployment blocker is most likely backend startup/runtime, not image build.

## High-probability root causes fixed here

1. `uuid@13` was imported from CommonJS route files (`auth.ts`, `stories.ts`, `upload.ts`). In a CommonJS backend build this can crash at runtime before the server starts.
2. Backend healthcheck started too aggressively for a container that first runs `prisma migrate deploy` and only then starts `node dist/server.js`.

## Fixes in this patch

- Replaced `uuid()` with `crypto.randomUUID()` in the 3 startup-critical files.
- Increased backend healthcheck tolerance with `start_period: 120s` and `retries: 20`.

## Still present in backend codebase

- Large amount of TypeScript drift in route files (`string | string[]`, Express 5 handler typings, Prisma select/include mismatches).
- These do not necessarily block runtime immediately because the Dockerfile currently allows emitted JS for alpha deploys.
- Long-term fix is to normalize request params/queries through helpers and tighten Prisma query typings.
