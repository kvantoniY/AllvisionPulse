# Allvision Pulse Backend (Express + TS + Prisma + Postgres + Socket.io)

## Быстрый старт

### 1) Запусти Postgres
```bash
docker compose up -d
```

### 2) Настрой env
```bash
cp .env.example .env
```

### 3) Установи зависимости и подготовь БД
```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

### 4) Запусти dev-сервер
```bash
npm run dev
```

API: `http://localhost:4000`
Uploads: `http://localhost:4000/uploads/<filename>`

## Socket.io (реалтайм)
Клиент подключается к `ws://localhost:4000` и передаёт access token:

```js
const socket = io("http://localhost:4000", { auth: { token: access } });
```

События:
- presence:online / presence:offline
- message:new / message:deleted / message:reaction / message:read
- notification:new
- chat:member_added / chat:member_removed / chat:pinned

## Основные роуты (кратко)

### Auth
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/refresh`
- POST `/api/auth/logout`
- GET `/api/auth/sessions`
- DELETE `/api/auth/sessions/:sessionId`

### Users
- GET `/api/users/me`
- PATCH `/api/users/me/profile`
- PATCH `/api/users/me/privacy`
- GET `/api/users/:username`
- GET `/api/users/search?q=...`
- Blacklist: GET/POST/DELETE `/api/users/me/blacklist...`
- Friends: request/accept/decline/list

### Posts
- GET `/api/posts/feed?take=20&cursor=<postId>`
- POST `/api/posts` (multipart `images[]`, поля `text`, `widgetsJson`, `repostOfId`)
- POST/DELETE `/api/posts/:postId/like`
- Comments: `/api/posts/:postId/comments`, `/api/posts/comments/:commentId/replies`, лайки комментариев

### Chats
- GET `/api/chats`
- POST `/api/chats/direct`
- POST `/api/chats/group`
- Messages: GET/POST `/api/chats/:chatId/messages` (multipart `files[]`)
- Read receipts: POST `/api/chats/:chatId/read`
- Reactions: POST/DELETE `/api/chats/:chatId/messages/:messageId/reactions`
- Media: GET `/api/chats/:chatId/media`

### Health
- GET `/api/health/today`
- GET `/api/health/day/:date`
- PUT `/api/health/checkin`
- GET `/api/health/range?from=YYYY-MM-DD&to=YYYY-MM-DD`
- GET `/api/health/stats?days=7|14|30`
- DELETE `/api/health/day/:date`

### Tasks
- GET `/api/tasks?from=&to=`
- POST `/api/tasks`
- PATCH `/api/tasks/:taskId`
- POST `/api/tasks/:taskId/toggle`
- DELETE `/api/tasks/:taskId`

### Admin (только роль ADMIN)
- GET `/api/admin/users`
- GET `/api/admin/users/:userId`
- DELETE `/api/admin/users/:userId`
- GET `/api/admin/posts`
- DELETE `/api/admin/posts/:postId`
- DELETE `/api/admin/comments/:commentId`
- GET `/api/admin/chats`
- GET `/api/admin/health/:userId`
- GET `/api/admin/tasks/:userId`

## Примечания по будущим модулям (Call/Games/Chat Events)
В Prisma-схеме уже есть таблицы `CallRoom`, `GameRoom`, `ChatEvent` (+ options/votes).
Сейчас для `ChatEvent` есть только GET список, остальное можно дополнять позже.
