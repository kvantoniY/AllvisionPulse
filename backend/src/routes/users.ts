
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

router.get("/me", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, username: true, role: true, avatarUrl: true, bio: true, lastSeenAt: true,
      settings: true, privacy: true,
    },
  });
  res.json({ user: me });
}));

router.get("/search", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const q = (req.query.q?.toString() ?? "").trim();
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : undefined,
    take: 20,
    select: { id: true, username: true, avatarUrl: true, lastSeenAt: true },
  });
  res.json({ users });
}));

router.get("/:username", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const username = req.params.username;
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, avatarUrl: true, bio: true, lastSeenAt: true,
      privacy: true,
    },
  });
  if (!user) throw new HttpError(404, "User not found");

  // friendship status
  const rel = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: user.id },
        { senderId: user.id, receiverId: req.user!.id },
      ],
    },
    select: { id: true, senderId: true, receiverId: true, status: true },
  });

  res.json({ user, relationship: rel });
}));

const UpdateProfileSchema = z.object({
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(280).optional().nullable(),
});

router.patch("/me/profile", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = UpdateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarUrl: body.avatarUrl ?? undefined, bio: body.bio ?? undefined },
    select: { id: true, username: true, avatarUrl: true, bio: true },
  });
  res.json({ user });
}));

const UpdatePrivacySchema = z.object({
  showHealthWidgets: z.boolean().optional(),
  showTasks: z.boolean().optional(),
  showEvents: z.boolean().optional(),
  allowMessagesFrom: z.enum(["everyone", "friends"]).optional(),
});

router.patch("/me/privacy", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = UpdatePrivacySchema.parse(req.body);
  const privacy = await prisma.userPrivacy.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...body },
    update: body,
  });
  res.json({ privacy });
}));

// --- Blacklist ---
router.get("/me/blacklist", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const list = await prisma.blacklist.findMany({
    where: { blockerId: req.user!.id },
    include: { blocked: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ blacklist: list });
}));

const BlockSchema = z.object({ userId: z.string().uuid() });

router.post("/me/blacklist", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = BlockSchema.parse(req.body);
  if (body.userId === req.user!.id) throw new HttpError(400, "Cannot block self");
  await prisma.blacklist.create({ data: { blockerId: req.user!.id, blockedId: body.userId } }).catch(() => null);
  // also mark friendships blocked
  await prisma.friendship.updateMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: body.userId },
        { senderId: body.userId, receiverId: req.user!.id },
      ],
    },
    data: { status: "BLOCKED" },
  });
  res.json({ ok: true });
}));

router.delete("/me/blacklist/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  await prisma.blacklist.deleteMany({ where: { blockerId: req.user!.id, blockedId: userId } });
  res.json({ ok: true });
}));

// --- Friends ---
router.get("/me/friends", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const friends = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, status: "ACCEPTED" },
        { receiverId: req.user!.id, status: "ACCEPTED" },
      ],
    },
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ friends });
}));

router.get("/me/friend-requests", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const incoming = await prisma.friendship.findMany({
    where: { receiverId: req.user!.id, status: "PENDING" },
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  const outgoing = await prisma.friendship.findMany({
    where: { senderId: req.user!.id, status: "PENDING" },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ incoming, outgoing });
}));

const FriendReqSchema = z.object({ userId: z.string().uuid() });

router.post("/me/friends/request", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = FriendReqSchema.parse(req.body);
  if (body.userId === req.user!.id) throw new HttpError(400, "Cannot friend self");

  // blacklist check
  const blocked = await prisma.blacklist.findFirst({
    where: { OR: [{ blockerId: req.user!.id, blockedId: body.userId }, { blockerId: body.userId, blockedId: req.user!.id }] },
    select: { id: true },
  });
  if (blocked) throw new HttpError(403, "Blocked");

  const fr = await prisma.friendship.upsert({
    where: { senderId_receiverId: { senderId: req.user!.id, receiverId: body.userId } },
    create: { senderId: req.user!.id, receiverId: body.userId, status: "PENDING" },
    update: { status: "PENDING" },
  });

  // notify
  const emitter = req.app.locals.emitter as any;
  const notif = await prisma.notification.create({
    data: { userId: body.userId, type: "FRIEND_REQUEST", data: { fromUserId: req.user!.id, friendshipId: fr.id } },
  });
  emitter?.emitToUser(body.userId, "notification:new", notif);

  res.json({ friendship: fr });
}));

router.post("/me/friends/:friendshipId/accept", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const id = req.params.friendshipId;
  const fr = await prisma.friendship.findUnique({ where: { id } });
  if (!fr) throw new HttpError(404, "Request not found");
  if (fr.receiverId !== req.user!.id) throw new HttpError(403, "Forbidden");
  const updated = await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });

  const emitter = req.app.locals.emitter as any;
  const notif = await prisma.notification.create({
    data: { userId: fr.senderId, type: "FRIEND_ACCEPTED", data: { byUserId: req.user!.id, friendshipId: id } },
  });
  emitter?.emitToUser(fr.senderId, "notification:new", notif);

  res.json({ friendship: updated });
}));

router.post("/me/friends/:friendshipId/decline", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const id = req.params.friendshipId;
  const fr = await prisma.friendship.findUnique({ where: { id } });
  if (!fr) throw new HttpError(404, "Request not found");
  if (fr.receiverId !== req.user!.id) throw new HttpError(403, "Forbidden");
  const updated = await prisma.friendship.update({ where: { id }, data: { status: "DECLINED" } });
  res.json({ friendship: updated });
}));

router.delete("/me/friends/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: userId },
        { senderId: userId, receiverId: req.user!.id },
      ],
    },
  });
  res.json({ ok: true });
}));

export default router;
