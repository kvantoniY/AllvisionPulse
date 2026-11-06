# Allvision Pulse: социальная сеть с чатами и видеозвонками

Fullstack-приложение для общения: лента, истории, личные и групповые чаты, голосовые сообщения и звонки. В профиле также есть дневник самочувствия и задачи.

## Что сделано

- Регистрация, вход, обновление токенов и управление сессиями.
- Публикации, комментарии, реакции, подписки и настройки приватности.
- Истории с изображениями и видео, реакции, архив и подборки.
- Личные и групповые чаты, вложения, реакции и отметки прочтения.
- Голосовые сообщения, присутствие пользователей, аудио- и видеозвонки на WebRTC.
- Дневник самочувствия, задачи и игровые комнаты.

## Как устроен проект

Frontend: Next.js 14 App Router, React, TypeScript, Redux Toolkit и RTK Query. Код разделён на `entities`, `features`, `widgets` и `shared`.

Next.js проксирует HTTP-запросы к Express. Backend использует TypeScript, Prisma и PostgreSQL. Socket.IO доставляет сообщения, уведомления и сигналы для WebRTC. Медиафайлы сохраняются на диске сервера.

| Путь | Назначение |
| --- | --- |
| `frontend/src/features/call` | Интерфейс звонка и соединения WebRTC |
| `frontend/src/features/stories` | Создание и просмотр историй |
| `frontend/src/shared/api` | RTK Query |
| `frontend/src/app/api` | Серверные маршруты Next.js |
| `backend/src/routes` | REST API по разделам |
| `backend/src/realtime/socket.ts` | События общения и звонков |
| `backend/prisma` | Схема базы и миграции |

## Запуск

Нужны Node.js 24, npm и Docker с Compose.

```bash
git clone https://github.com/kvantoniY/AllvisionPulse.git
cd AllvisionPulse
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose -f backend/docker-compose.yml up -d
npm ci --prefix backend
npm ci --prefix frontend
cd backend
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Во втором терминале из корня репозитория:

```bash
npm run dev --prefix frontend
```

Сайт: http://localhost:3000. API: http://localhost:4000/healthz. PostgreSQL: локальный порт 55433.

В Windows PowerShell используйте `Copy-Item` вместо `cp`. Если PowerShell блокирует `npm.ps1`, запускайте `npm.cmd` вместо `npm`.

## Что проверить

1. Создайте аккаунт на `/auth/register`, затем войдите.
2. Опубликуйте запись в `/feed`, проверьте профиль и историю.
3. Создайте второй аккаунт в другом браузере. Откройте чат, отправьте сообщение и ответ.
4. Для проверки звонка разрешите доступ к камере и микрофону в обоих браузерах.

Результаты проверки: [docs/VERIFICATION.md](docs/VERIFICATION.md). Описание событий и маршрутов: [backend/README.md](backend/README.md).

## Ограничения

Для звонков через разные сети может потребоваться TURN-сервер. Его параметры задаются в `frontend/.env.local`. Камера и микрофон работают на localhost или HTTPS. В репозитории нет готового публичного сервера звонков. Проверенные сценарии и непроверенные части перечислены в отчёте, чтобы их можно было отличить от списка реализованных модулей.
