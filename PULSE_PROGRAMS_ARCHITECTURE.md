# Pulse Programs

## 1. Анализ текущего проекта

### Уже существующие домены
- `Pulse` как основной health-overview и точка входа в ежедневные действия.
- `Task Tracker` как уже существующий task engine.
- `Nutrition`, `Finance`, `Health check-in` как прикладные инструменты, в которые программа может открывать пользователя.
- Social containers: `Posts`, `Comments`, `Stories`, `Chats`, `Messages`, плюс attach-flow для embed/share.

### Что переиспользуется
- Не создаётся второй task engine: program-actions типа `TASK` синхронизируются через `Task` и `ProgramTaskLink`.
- Pulse overview остаётся главным хабом, а `Программы` встроены как вкладка внутри `/health`.
- Social sharing использует единый artifact layer и существующие attach points в чатах, постах, комментариях и stories.
- Privacy расширяет существующий user/settings flow, а не создаёт отдельную подсистему.

### Основные риски
- Нельзя хранить runtime только в JSON: день, действие, recovery, task-link и session-member должны быть явными сущностями.
- Нельзя ломать активные прохождения при редактировании программы: нужен immutable version snapshot.
- Нельзя дублировать Task Tracker: только sync и link layer.
- Главный UX-риск: превратить Programs в админку с множеством карточек и текстовых блоков.

## 2. Архитектурное решение

### Backend модули
- `services/programs/programs.ts`: definitions, versions, list/detail.
- `services/programs/runtime.ts`: run generation, action completion, task sync, today aggregation, recovery.
- `services/programs/sessions.ts`: collaborative sessions, invites, start, leave.
- `services/programs/share.ts`: share artifacts, snapshot/reference/invite.
- `services/programs/achievements.ts`: award logic.
- `services/programs/access.ts`, `participation.ts`, `helpers.ts`: access/privacy/conflict helpers.

### Frontend модули
- `features/programs/ui/*`: library, detail, builder, run, session, achievements, pulse tab, today widget.
- `shared/api/programsApi.ts`: RTK Query layer.
- `shared/types/programs.ts`: shared typed contracts.
- `shared/ui/PulseShareCard` и `PulseSharePicker`: общий share UI.

### Маршруты
- `/health?tab=programs`
- `/health/programs`
- `/health/programs/new`
- `/health/programs/[programId]`
- `/health/program-runs/[runId]`
- `/health/program-sessions/[sessionId]`
- `/health/achievements`

### Связи модулей
- `ProgramDefinition` -> `ProgramVersion` -> runtime generation.
- `ProgramRun` всегда работает на конкретной published version.
- `ProgramSession` агрегирует участников, но у каждого `ProgramSessionMember` свой `ProgramRun`.
- `PulseShareArtifact` может ссылаться на program, run, session, achievement или today-widget snapshot.
- `UserAchievement` может быть выдано по run, stage, session и recovery-событиям.

### Ключевые принципы
- Versioning: новые публикации не меняют активные runs.
- Runtime: текущий день и действия вычисляются из явных `ProgramRunDay` / `ProgramRunAction`.
- Sync: task sync двусторонний, по `Task.sourceKey` + `ProgramTaskLink`.
- Privacy: public / restricted / private на уровне definition; visibility внутри session управляется отдельно.

## 3. Сущности и связи

### Основные Prisma-модели
- `ProgramDefinition`
- `ProgramVersion`
- `ProgramAccessGrant`
- `ProgramRuleSet`
- `ProgramStage`
- `ProgramDayTemplate`
- `ProgramActionTemplate`
- `ProgramMilestoneTemplate`
- `ProgramRun`
- `ProgramRunDay`
- `ProgramRunAction`
- `ProgramRunEvent`
- `ProgramRecoveryEvent`
- `ProgramTaskLink`
- `ProgramSession`
- `ProgramSessionMember`
- `ProgramSessionInvite`
- `PulseShareArtifact`
- `AchievementDefinition`
- `UserAchievement`

### Runtime-модель
- `ProgramRun` хранит состояние прохождения.
- `ProgramRunDay` хранит день программы, дату, stage, summary counts.
- `ProgramRunAction` хранит конкретное действие, статус, дату, payload и sync-признаки.
- `ProgramRunEvent` фиксирует жизненный цикл run/action/session.
- `ProgramRecoveryEvent` хранит решение пользователя при возврате.

### Session-модель
- `ProgramSession` описывает общую совместную сессию.
- `ProgramSessionMember` хранит роль, invite status, privacy flags, привязанный run.
- `ProgramSessionInvite` хранит инвайт, token, адресата и канал.

### Share artifact-модель
- `PulseShareArtifact.mode`: `SNAPSHOT | REFERENCE | INVITE`
- `PulseShareArtifact.kind`: widget / metric / program / invite / progress / achievement
- Один renderer/resolver слой обслуживает все social containers.

### Achievements-модель
- `AchievementDefinition` — каталог достижений Pulse.
- `UserAchievement` — выданное достижение с source/result/progress.

### Sync с Task Tracker
- Task-экшены программ используют существующую таблицу `Task`.
- `ProgramTaskLink` хранит явную связь `runAction <-> task`.
- Task completion из Task Tracker обновляет `ProgramRunAction`.
- Completion из Programs обновляет соответствующую `Task`.
- При pause/cancel/archive/delete задачи корректно прячутся или архивируются.

## 4. UX-сценарии

### Создание программы
- Пошаговый wizard.
- Минимум полей на шаг.
- `Дни и шаги` собраны в один editor, а не в две независимые формы.
- Advanced поля скрыты в `Дополнительно`.

### Личный старт
- Из detail screen пользователь запускает personal run.
- Если уже есть активное совместное прохождение той же программы, личный старт блокируется понятным сообщением.

### Совместный старт
- Владелец создаёт session.
- Участники получают явное приглашение: `Принять / Отклонить`.
- После принятия показывается статус готовности.
- Владелец запускает сессию, после чего runs создаются у всех принявших.

### Today / Day flow
- В Pulse виджет `Сегодня по программам` агрегирует задачи со всех активных программ.
- Внутри конкретной программы показывается только контекст этой программы: день, этап, текст дня, советы, задачи.

### Recovery
- Пользователь выбирает мягкий сценарий: продолжить, догнать, сдвинуть, recovery day, пропустить.
- Пропуски не превращаются в бесконечный хвост.

### Sharing
- Program card
- Program progress
- Session invite
- Today actions
- Achievement

### Profile / Achievements
- Отдельный экран достижений Pulse.
- Блок достижений в профиле.
- По умолчанию видимость регулируется privacy.

### Mobile UX
- Больше collapsible sections.
- Меньше одновременной информации.
- Primary CTA не больше 1-2 на экран.
- Secondary actions прячутся в popover/details.

### Desktop UX
- Широкий summary hero.
- Основной daily flow в центре.
- Детали и история сжимаются в disclosure/compact rows.

## 5. API-контракты

### Programs
- `GET /backend/health/programs?scope=...`
- `GET /backend/health/programs/:programId`
- `POST /backend/health/programs`
- `PATCH /backend/health/programs/:programId`
- `POST /backend/health/programs/:programId/publish`
- `POST /backend/health/programs/:programId/archive`
- `DELETE /backend/health/programs/:programId`

### Runs
- `POST /backend/health/program-runs`
- `GET /backend/health/program-runs/:runId`
- `GET /backend/health/program-runs/today`
- `POST /backend/health/program-runs/:runId/actions/:actionId/complete`
- `POST /backend/health/program-runs/:runId/actions/:actionId/skip`
- `POST /backend/health/program-runs/:runId/actions/:actionId/reschedule`
- `POST /backend/health/program-runs/:runId/recovery`
- `POST /backend/health/program-runs/:runId/pause`
- `POST /backend/health/program-runs/:runId/resume`
- `POST /backend/health/program-runs/:runId/cancel`
- `POST /backend/health/program-runs/:runId/archive`
- `DELETE /backend/health/program-runs/:runId`

### Sessions / Invites
- `POST /backend/health/program-sessions`
- `GET /backend/health/program-sessions/:sessionId`
- `POST /backend/health/program-sessions/:sessionId/start`
- `POST /backend/health/program-sessions/:sessionId/leave`
- `GET /backend/health/program-sessions/invites/inbox`
- `POST /backend/health/program-sessions/invites/:inviteId/accept`
- `POST /backend/health/program-sessions/invites/:inviteId/decline`
- `GET /backend/health/program-sessions/invites/link/:token`
- `POST /backend/health/program-sessions/invites/link/:token/accept`

### Sharing / Achievements
- `POST /backend/health/share-artifacts`
- `GET /backend/health/share-artifacts/:artifactId`
- `GET /backend/health/achievements`

## 6. Реализация backend

### Что уже внедрено
- Prisma schema и миграция под program engine.
- Express routes для programs / runs / sessions / share-artifacts / achievements.
- Version snapshot logic.
- Run generation.
- Recovery engine.
- Session start/invite/leave flow.
- Task sync в обе стороны.
- Today aggregation.
- Permission checks и access logic.
- Achievement awarding.

### Что важно держать дальше
- Не тащить бизнес-логику в routes.
- Любую новую action-интеграцию добавлять через engine, а не через одноразовый хардкод.
- Realtime hooks добавлять только поверх готового service layer.

## 7. Реализация frontend

### Что уже внедрено
- Programs как вкладка внутри Pulse.
- Programs library / detail / builder / run / session / achievements screens.
- Today widget.
- Share sheet и social attach integration.
- Profile achievements block.
- Builder wizard.
- Compact run/session UI с daily-flow приоритетом.
- RTK Query endpoints и shared typed contracts.

### UI-принципы
- Меньше карточек в карточках.
- Вторичные действия под стрелкой или `details`.
- Прогресс чаще выражается полосами, бейджами и иконками, а не длинным текстом.
- Участники совместного прохождения показываются полноценным блоком, а не сухим списком.

## Изменённые файлы

### Backend
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260401070000_pulse_program_engine/migration.sql`
- `backend/src/routes/programs.ts`
- `backend/src/routes/programRuns.ts`
- `backend/src/routes/programSessions.ts`
- `backend/src/routes/shareArtifacts.ts`
- `backend/src/routes/achievements.ts`
- `backend/src/services/programs/*`

### Frontend
- `frontend/src/shared/api/programsApi.ts`
- `frontend/src/shared/types/programs.ts`
- `frontend/src/features/programs/ui/*`
- `frontend/src/app/(protected)/health/programs/*`
- `frontend/src/app/(protected)/health/program-runs/*`
- `frontend/src/app/(protected)/health/program-sessions/*`
- `frontend/src/app/(protected)/health/achievements/*`
- `frontend/src/shared/ui/PulseShareCard/*`
- `frontend/src/shared/ui/PulseSharePicker/*`

## Что проверить вручную после деплоя
- Старт личной программы.
- Старт совместной сессии владельцем после принятия invite.
- Синхронизация task completion между Programs и Task Tracker.
- Recovery после пропусков.
- Restricted/public/private access.
- Share artifacts в чат, пост, комментарий и stories.
- Видимость achievements в профиле.

## Ограничения и риски
- Полный backend typecheck шумит legacy-ошибками вне Programs.
- Нужен отдельный UX-polish проход по run/session/builder на реальном мобильном устройстве.
- Системные программы стоит дальше развивать через тот же builder/engine, а не специальный код.
