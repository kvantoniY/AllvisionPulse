
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env";

const env = getEnv();

export type AccessTokenPayload = { sub: string; role: "USER" | "ADMIN"; sessionId: string };

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TTL_MIN}m` });
}

export function signRefreshToken(payload: { sub: string; sessionId: string }) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: `${env.REFRESH_TTL_DAYS}d` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string; sessionId: string; iat: number; exp: number } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as any;
}
