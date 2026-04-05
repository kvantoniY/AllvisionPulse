# Pulse refactor summary

## What was changed

### 1. Health page decomposition
The monolithic `src/app/(protected)/health/page.tsx` was reduced by extracting reusable view primitives into:
- `src/features/pulse/ui/HealthPageWidgets.tsx`
- `src/features/pulse/ui/AnalyticsTab.tsx`
- `src/features/pulse/ui/ConfigTab.tsx`

This keeps the existing visual classes from `Health.module.css`, so the refactor improves maintainability without forcing a risky restyle.

### 2. Daily planner editor decomposition
The task editor was extracted from `DailyPlanner.tsx` into:
- `src/features/dailyPlanner/ui/DailyPlannerEditor.tsx`
- `src/features/dailyPlanner/ui/DailyPlannerEditor.module.css`

Behavior change:
- mobile: uses `MobileSheet`
- desktop: uses a side drawer instead of a centered modal
- secondary metadata moved behind a "Детали" toggle

### 3. Config cleanup
Configuration now uses the shared `Switch` component instead of only local button-like switch styling for the extracted config screen.

## Verification
- `npm ci`
- `npm run typecheck` ✅

## Notes
The biggest remaining architectural hotspot is still `health/page.tsx`, because its tab state and action handlers are still centralized there. The safest next step is to move `pulse`, `health`, `tasks`, and `finance` tab render trees into dedicated components with a shared view-model/context instead of attempting a full rewrite in one pass.
