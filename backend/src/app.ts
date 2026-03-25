import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { getEnv } from "./config/env";
import { errorHandler, notFound } from "./utils/http";

import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import postsRouter from "./routes/posts";
import chatsRouter from "./routes/chats";
import healthRouter from "./routes/health";
import tasksRouter from "./routes/tasks";
import notificationsRouter from "./routes/notifications";
import adminRouter from "./routes/admin";
import gamesRouter from "./routes/games";
import storiesRouter from "./routes/stories";
import supportRouter from "./routes/support";
import analyticsRouter from "./routes/analytics";

export function createApp() {
  const env = getEnv();
  const app = express();

  app.set("trust proxy", true);
app.use(helmet({
  crossOriginResourcePolicy: false,  // ← это отключает CORP полностью
  // или более точно:
  // crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: [
    'http://localhost:3000',           // dev
  ],
  credentials: true,                  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // static uploads
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // или 'same-site' если поддомены
  // Опционально для старых браузеров / полной совместимости
  res.setHeader('Access-Control-Allow-Origin', '*'); // или 'http://localhost:3000'
  next();
}, express.static(uploadDir));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/chats", chatsRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/analytics", analyticsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
