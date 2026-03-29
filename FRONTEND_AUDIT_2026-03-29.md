# Frontend audit — 2026-03-29

## What is the real root problem?

The deployment failures were layered, not singular:

1. **Infrastructure/toolchain instability** masked app errors first
   - mixed Node/npm environments in CI and Docker
   - polluted lockfile/registry history
2. **The first real frontend blocker** is strict TypeScript in production build
   - `src/app/(protected)/health/page.tsx` used nullable `profile?.currentWeightKg` and `profile?.targetWeightKg`
   - logic narrowed a derived value (`goalDelta`) but still compared raw nullable variables later
3. **The broader codebase problem** is oversized page-components with duplicated business logic and weak type boundaries

## Concrete evidence found

### 1) Oversized files
Top biggest frontend files:
- `src/app/(protected)/health/page.tsx` — 3880 lines
- `src/app/(protected)/messages/[chatId]/page.tsx` — 1217 lines
- `src/features/games/GameSessionPanel.tsx` — 1132 lines
- `src/features/call/webrtcRoom.ts` — 1002 lines
- `src/features/call/CallScreen.tsx` — 975 lines
- `src/features/stories/ui/StoryCreator.tsx` — 971 lines

These sizes strongly increase the chance of duplicated logic, stale branches and type regressions.

### 2) Type escapes
The codebase currently contains many local type escapes:
- `as any` occurrences: 67
- non-null assertions (`!`) also exist in critical UI/game/profile code

This means the project is partially relying on "trust me" typing instead of explicit narrowing.

### 3) Missing fast type gate
Frontend `package.json` had no dedicated `typecheck` script.
That means the team only gets type feedback late during `next build`, instead of from a fast explicit CI/local step.

### 4) Health page duplication
Weight-goal logic was duplicated in at least two places:
- summary cards
- separate goal summary widget

The failing branch came from duplicated nullable logic.

## Changes included in this patch

- fixed nullable weight goal logic by centralizing it into one helper
- reused the same helper in both summary-card and goal-summary blocks
- fixed CSS warning in `Health.module.css` (`align-items: flex-start`)
- added `typecheck` script to frontend `package.json`

## Recommended next steps

1. Add `npm run typecheck` as a separate CI step before build
2. Split `health/page.tsx` into feature sections:
   - profile
   - mental
   - nutrition
   - tasks
   - finance
   - analytics
3. Extract pure business helpers from page components into `shared/lib` or feature-level `model`
4. Reduce `as any` usage, starting with:
   - `health/page.tsx`
   - `messages/[chatId]/page.tsx`
   - `shared/api/postsApi.ts`
   - `RealtimeProvider.tsx`
   - `GameSessionPanel.tsx`
5. After stabilization, upgrade Next.js from 14.2.5 to a patched release and refresh the lockfile in a clean public registry environment
