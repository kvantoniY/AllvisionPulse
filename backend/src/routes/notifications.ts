
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler } from "../utils/http";
import { requireAuth, requireActiveUser, AuthedRequest } from "../middleware/auth";
import { serializeNotification } from "../utils/notifications";
import {
  deleteWebPushSubscription,
  getWebPushPublicKey,
  isWebPushConfigured,
  upsertWebPushSubscription,
} from "../utils/webPush";

const router = Router();

// Public VAPID key — intentionally unauthenticated. The service worker needs
// to fetch this during `pushsubscriptionchange` when it may not have a user
// context, and it's literally a public key (safe to expose).
router.get("/push/public-key", asyncHandler(async (_req, res) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ enabled: false, message: "Web push is not configured" });
    return;
  }

  res.json({
    enabled: true,
    publicKey: getWebPushPublicKey(),
  });
}));

router.use(requireAuth, requireActiveUser);

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

  res.json({ items: await Promise.all(items.map((item) => serializeNotification(item as any))), nextCursor });
}));

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post("/push/subscribe", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const subscription = PushSubscriptionSchema.parse(req.body?.subscription ?? req.body);
  const saved = await upsertWebPushSubscription({
    userId: req.user!.id,
    subscription,
    userAgent: req.headers["user-agent"]?.toString() ?? null,
  });
  if (!saved) {
    res.status(503).json({
      ok: false,
      message: "Web push subscriptions are unavailable until the pending Prisma migration is applied",
    });
    return;
  }
  res.json({ ok: true, subscriptionId: saved.id });
}));

router.delete("/push/subscribe", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = z.object({ endpoint: z.string().url() }).parse(req.body);
  await deleteWebPushSubscription({
    userId: req.user!.id,
    endpoint: body.endpoint,
  });
  res.json({ ok: true });
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

router.delete("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.notification.deleteMany({
    where: { userId: req.user!.id },
  });
  res.json({ ok: true });
}));

export default router;
