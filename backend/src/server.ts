import "dotenv/config";

import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { createApp } from "./app";
import { getEnv } from "./config/env";
import { getAllowedOrigins } from "./config/cors";
import { createSocket } from "./realtime/socket";

const env = getEnv();
const app = createApp();

// ensure upload dir exists
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: getAllowedOrigins(env.CORS_ORIGIN),
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: env.SOCKET_RECOVERY_MS,
    skipMiddlewares: true,
  },
  pingInterval: 10000,
  pingTimeout: 20000,
});

const emitter = createSocket(io);
app.locals.emitter = emitter;

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Allvision Pulse API listening on http://localhost:${env.PORT}`);
});
