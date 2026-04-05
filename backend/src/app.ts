import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { getEnv } from "./config/env";
import { getAllowedOrigins, isOriginAllowed, normalizeOrigin } from "./config/cors";
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
import programsRouter from "./routes/programs";
import programRunsRouter from "./routes/programRuns";
import programSessionsRouter from "./routes/programSessions";
import shareArtifactsRouter from "./routes/shareArtifacts";
import achievementsRouter from "./routes/achievements";
import callsRouter from "./routes/calls";

export function createApp() {
  const env = getEnv();
  const app = express();
  const allowedOrigins = getAllowedOrigins(env.CORS_ORIGIN);

  app.set("trust proxy", true);
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin ?? undefined, allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${normalizeOrigin(origin)}`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  app.use(
    "/uploads",
    (req, res, next) => {
      const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
      if (requestOrigin && isOriginAllowed(requestOrigin, allowedOrigins)) {
        res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(requestOrigin));
      }
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(uploadDir, {
      maxAge: "30d",
      immutable: true,
    }),
  );

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/chats", chatsRouter);
  app.use("/api/health/programs", programsRouter);
  app.use("/api/health/program-runs", programRunsRouter);
  app.use("/api/health/program-sessions", programSessionsRouter);
  app.use("/api/health/share-artifacts", shareArtifactsRouter);
  app.use("/api/health/achievements", achievementsRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/calls", callsRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/analytics", analyticsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
