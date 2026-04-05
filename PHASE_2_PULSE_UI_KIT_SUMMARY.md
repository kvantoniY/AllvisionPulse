# Phase 2 — Pulse UI kit второго уровня

Сделано:
- создан новый слой `frontend/src/shared/ui/pulse/`
- добавлены reusable-компоненты:
  - `SectionShell.tsx`
  - `ControlRow.tsx`
  - `EntityRow.tsx`
  - `StatusPill.tsx`
  - `EmptyState.tsx`
  - `OverflowMenu.tsx`
  - `InlineDetails.tsx`
  - `MetricCard.tsx`
  - `PulseUi.module.css`
  - `index.ts`

Интеграция в продукт:
- Pulse overview: секции, summary-метрики, empty states, status pills
- Health: section shells, nutrition metric cards, meal rows на `EntityRow`, empty states
- Tasks: section shells, control row, empty states
- Finance: control row, entity rows для операций, metric cards, unified empty states, section shells
- Analytics: unified metric cards, section shells, status pills, empty states
- Config: section shells, entity rows, status pills
- Programs: `ProgramsPulseTab` переведён на `EntityRow`, `OverflowMenu`, `StatusPill`, `EmptyState`

Что сознательно НЕ ломалось:
- бизнес-логика и мутации не менялись
- route/query params не менялись
- локальные visual patterns заменялись только там, где это безопасно без переписывания сценариев

Проверка:
- `frontend`: `npm ci`
- `frontend`: `npm run typecheck` ✅
