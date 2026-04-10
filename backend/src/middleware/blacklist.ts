
import { Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { AuthedRequest } from "./auth";

// Blockss interactions if either side has blocked the other.
// Use this in endpoints that access another user.
export async function forbidIfBlockedByTarget(req: AuthedRequest, _res: Response, next: NextFunction) {
  const me = req.user!.id;
  const targetId = (req.params.userId || req.params.targetId || req.body?.targetId) as string | undefined;
  if (!targetId || targetId === me) return next();
  const blocked = await prisma.blacklist.findFirst({
    where: {
      OR: [
        { blockerId: me, blockedId: targetId },
        { blockerId: targetId, blockedId: me },
      ],
    },
    select: { id: true },
  });
  if (blocked) return next(new Error("BLOCKED")); // normalized in error handler below
  return next();
}
