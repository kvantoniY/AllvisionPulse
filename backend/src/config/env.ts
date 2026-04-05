
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  JWT_ACCESS_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  ACCESS_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("uploads"),
  SOCKET_RECOVERY_MS: z.coerce.number().default(60000),
  CALL_RECONNECT_GRACE_MS: z.coerce.number().default(60000),
  CALL_MAX_PARTICIPANTS: z.coerce.number().default(4),
  TURN_SECRET: z.string().optional(),
  TURN_HOST: z.string().default("turn.allvision-pulse.ru"),
  TURN_PORT: z.coerce.number().default(3478),
  TURN_TTL_SEC: z.coerce.number().default(43200),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_VAPID_SUBJECT: z.string().default("mailto:notify@allvision-pulse.ru"),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
