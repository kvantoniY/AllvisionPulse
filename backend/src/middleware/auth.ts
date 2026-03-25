import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/http";
import { getSuspensionState } from "../utils/userStatus";

export type AuthedRequest = Request & {
  user?: {
    id: string;
    role: "USER" | "ADMIN";
    sessionId: string;
    suspendedAt?: Date | null;
    suspendedUntil?: Date | null;
    suspendedPermanent?: boolean;
    suspensionReason?: string | null;
  };
};

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new HttpError(401, "Missing Bearer token"));
  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.session.findFirst({
      where: { id: payload.sessionId, userId: payload.sub, revokedAt: null },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            role: true,
            suspendedAt: true,
            suspendedUntil: true,
            suspendedPermanent: true,
            suspensionReason: true,
          },
        },
      },
    });

    if (!session?.user) return next(new HttpError(401, "Session revoked"));

    req.user = {
      id: session.user.id,
      role: session.user.role,
      sessionId: session.id,
      suspendedAt: session.user.suspendedAt,
      suspendedUntil: session.user.suspendedUntil,
      suspendedPermanent: session.user.suspendedPermanent,
      suspensionReason: session.user.suspensionReason,
    };
    return next();
  } catch (_error) {
    return next(new HttpError(401, "Invalid token"));
  }
}

export function requireActiveUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Unauthorized"));

  const suspension = getSuspensionState(req.user);
  if (!suspension.isSuspended) return next();

  const message = suspension.suspendedPermanent
    ? "Вы заблокированы администрацией бессрочно"
    : `Вы заблокированы администрацией до ${suspension.suspendedUntil?.toISOString()}`;

  const error: any = new HttpError(403, message, {
    suspendedPermanent: suspension.suspendedPermanent,
    suspendedUntil: suspension.suspendedUntil?.toISOString() ?? null,
    suspensionReason: suspension.suspensionReason,
  });
  error.code = "ACCOUNT_SUSPENDED";
  error.meta = {
    suspendedPermanent: suspension.suspendedPermanent,
    suspendedUntil: suspension.suspendedUntil?.toISOString() ?? null,
    suspensionReason: suspension.suspensionReason,
  };
  return next(error);
}

export function requireRole(role: "ADMIN") {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Unauthorized"));
    if (req.user.role !== role) return next(new HttpError(403, "Forbidden"));
    return next();
  };
}
