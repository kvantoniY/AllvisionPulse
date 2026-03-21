
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../utils/http";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 30), 100);

  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
}));

router.post("/read", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, id: { in: body.ids } },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

router.post("/read-all", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
