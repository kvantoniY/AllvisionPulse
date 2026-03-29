# Frontend typecheck batch audit — 2026-03-29

## Что было не так в корне
- Production build впервые дошёл до строгой проверки типов, и всплыла серия накопленных nullable/type drift ошибок.
- В проекте есть перегруженные page-компоненты, особенно `health/page.tsx`, из-за чего мелкие небезопасные сравнения и вызовы `parseDate(...).getDate()` размазаны по файлу.
- RTK Query base API использовался через `injectEndpoints`, но store не импортировал все инжектируемые API, из-за чего тип `dispatch` расходился с фактическим набором endpoint'ов.
- Некоторые UI-компоненты уже ожидают поля `role`, но типы `StoryAuthor` и `UserSearchItem` их не описывали.
- В shared audio helper API и места вызова разъехались: код вызывал `playUiBeep('start')`, а helper принимал только объект.

## Что исправлено
- Усилена nullable-логика в `health/page.tsx`.
- Добавлен helper `getDayOfMonthOrToday`.
- Исправлен RTK Query store wiring для base API + side-effect imports injected APIs.
- Синхронизированы shared types для stories/users search.
- Исправлена сигнатура `playUiBeep`.
- Исправлен тип `getMediaStyle` в StoryViewer.
- Нормализован тип результата `extractApiError`.
- Добавлен отдельный `npm run typecheck`.

## Следующий техдолг
1. Разрезать `src/app/(protected)/health/page.tsx` на фичевые секции и hooks.
2. Вынести date/number normalizers в shared util слой.
3. Прогнать проект на поиск `as any`, `!` и небезопасных nullable access.
4. Обновить Next.js с 14.2.5 до patched версии.
