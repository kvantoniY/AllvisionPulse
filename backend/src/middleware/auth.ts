
import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/http";

export type AuthedRequest = Request & { user?: { id: string; role: "USER" | "ADMIN"; sessionId: string } };

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Missing Bearer token"));
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    // Ensure session still valid
    const session = await prisma.session.findFirst({
      where: { id: payload.sessionId, userId: payload.sub, revokedAt: null },
      select: { id: true },
    });
    if (!session) return next(new HttpError(401, "Session revoked"));
    req.user = { id: payload.sub, role: payload.role, sessionId: payload.sessionId };
    return next();
  } catch (e) {
    return next(new HttpError(401, "Invalid token"));
  }
}

export function requireRole(role: "ADMIN") {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Unauthorized"));
    if (req.user.role !== role) return next(new HttpError(403, "Forbidden"));
    return next();
  };
}
