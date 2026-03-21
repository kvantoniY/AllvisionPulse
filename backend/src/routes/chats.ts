
import { Router } from "express";
import { z } from "zod";
import path from "path";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

function fileUrl(req: any, filename: string) {
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
}

router.get("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chats = await prisma.chatMember.findMany({
    where: { userId: req.user!.id, leftAt: null },
    orderBy: { chat: { updatedAt: "desc" } },
    include: {
      chat: {
        include: {
          members: { include: { user: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } } } },
          pinnedMessage: true,
        },
      },
    },
  });
  res.json({ items: chats.map(m => m.chat) });
}));

const CreateDirectSchema = z.object({ userId: z.string().uuid() });

router.post("/direct", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateDirectSchema.parse(req.body);
  if (body.userId === req.user!.id) throw new HttpError(400, "Cannot create direct with self");

  // privacy: allow messages from friends only
  const targetPrivacy = await prisma.userPrivacy.findUnique({ where: { userId: body.userId } });
  if (targetPrivacy?.allowMessagesFrom === "friends") {
    const friend = await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { senderId: req.user!.id, receiverId: body.userId },
          { senderId: body.userId, receiverId: req.user!.id },
        ],
      },
      select: { id: true },
    });
    if (!friend && req.user!.role !== "ADMIN") throw new HttpError(403, "User accepts messages from friends only");
  }

  // find existing direct chat with exactly these 2 members
  const existing = await prisma.chat.findFirst({
    where: {
      type: "DIRECT",
      members: { every: { userId: { in: [req.user!.id, body.userId] } } },
    },
    include: { members: true },
  });

  if (existing && existing.members.length === 2) {
    return res.json({ chat: existing });
  }

  const chat = await prisma.chat.create({
    data: {
      type: "DIRECT",
      members: { create: [{ userId: req.user!.id, role: "MEMBER" }, { userId: body.userId, role: "MEMBER" }] },
    },
    include: { members: true },
  });

  res.json({ chat });
}));

const CreateGroupSchema = z.object({
  title: z.string().min(1).max(80),
  memberIds: z.array(z.string().uuid()).max(50).default([]),
});

router.post("/group", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateGroupSchema.parse(req.body);
  const uniqueIds = Array.from(new Set([req.user!.id, ...body.memberIds]));
  const chat = await prisma.chat.create({
    data: {
      type: "GROUP",
      title: body.title,
      members: {
        create: uniqueIds.map(uid => ({ userId: uid, role: uid === req.user!.id ? "CREATOR" : "MEMBER" })),
      },
    },
    include: { members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } } },
  });
  res.json({ chat });
}));

router.post("/:chatId/members", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const body = z.object({ userId: z.string().uuid() }).parse(req.body);

  const me = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!me) throw new HttpError(404, "Chat not found");
  if (me.role === "MEMBER" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can add members");

  const member = await prisma.chatMember.upsert({
    where: { chatId_userId: { chatId, userId: body.userId } },
    create: { chatId, userId: body.userId, role: "MEMBER" },
    update: { leftAt: null },
  });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "chat:member_added", { chatId, userId: body.userId });

  res.json({ member });
}));

router.delete("/:chatId/members/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const userId = req.params.userId;

  const me = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!me) throw new HttpError(404, "Chat not found");
  if (me.role === "MEMBER" && req.user!.role !== "ADMIN" && userId !== req.user!.id) throw new HttpError(403, "Forbidden");

  await prisma.chatMember.update({
    where: { chatId_userId: { chatId, userId } },
    data: { leftAt: new Date() },
  });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "chat:member_removed", { chatId, userId });

  res.json({ ok: true });
}));

router.get("/:chatId/messages", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 50), 100);

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  const messages = await prisma.message.findMany({
    where: { chatId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      attachments: true,
      reactions: true,
      reads: { select: { userId: true, readAt: true } },
      replyTo: { include: { sender: { select: { id: true, username: true } } } },
    },
  });

  const hasMore = messages.length > take;
  const items = hasMore ? messages.slice(0, take) : messages;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
}));

const SendMessageSchema = z.object({
  type: z.enum(["TEXT","IMAGE","AUDIO","VIDEO_NOTE","SYSTEM"]).default("TEXT"),
  text: z.string().max(8000).optional().nullable(),
  replyToId: z.string().uuid().optional().nullable(),
  forwardOfId: z.string().uuid().optional().nullable(),
});

router.post("/:chatId/messages", requireAuth, upload.array("files", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const body = SendMessageSchema.parse(req.body);
  const files = (req.files as Express.Multer.File[]) ?? [];

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  const message = await prisma.message.create({
    data: {
      chatId,
      senderId: req.user!.id,
      type: body.type as any,
      text: body.text ?? undefined,
      replyToId: body.replyToId ?? undefined,
      forwardOfId: body.forwardOfId ?? undefined,
      attachments: {
        create: files.map(f => ({
          url: fileUrl(req, path.basename(f.filename)),
          mime: f.mimetype,
          size: f.size,
        })),
      },
    },
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      attachments: true,
      reactions: true,
      reads: true,
      replyTo: { include: { sender: { select: { id: true, username: true } } } },
    },
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "message:new", message);

  // notifications for direct chat recipient(s)
  const members = await prisma.chatMember.findMany({ where: { chatId, leftAt: null }, select: { userId: true } });
  await Promise.all(members.filter(m => m.userId !== req.user!.id).map(async m => {
    const notif = await prisma.notification.create({
      data: { userId: m.userId, type: "MESSAGE", data: { chatId, messageId: message.id, fromUserId: req.user!.id } },
    });
    emitter?.emitToUser(m.userId, "notification:new", notif);
  }));

  res.json({ message });
}));

router.delete("/:chatId/messages/:messageId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chatId, messageId } = req.params;
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.chatId !== chatId || msg.deletedAt) throw new HttpError(404, "Message not found");

  const me = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!me) throw new HttpError(404, "Chat not found");

  if (req.user!.role !== "ADMIN" && msg.senderId !== req.user!.id) throw new HttpError(403, "Forbidden");

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "message:deleted", { chatId, messageId });

  res.json({ ok: true });
}));

const ReactSchema = z.object({ emoji: z.string().min(1).max(12) });

router.post("/:chatId/messages/:messageId/reactions", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chatId, messageId } = req.params;
  const body = ReactSchema.parse(req.body);

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  const reaction = await prisma.messageReaction.create({
    data: { messageId, userId: req.user!.id, emoji: body.emoji },
  }).catch(() => null);

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "message:reaction", { chatId, messageId, userId: req.user!.id, emoji: body.emoji, op: "add" });

  res.json({ reaction });
}));

router.delete("/:chatId/messages/:messageId/reactions", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chatId, messageId } = req.params;
  const emoji = req.query.emoji?.toString();
  if (!emoji) throw new HttpError(400, "emoji required");

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  await prisma.messageReaction.deleteMany({ where: { messageId, userId: req.user!.id, emoji } });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "message:reaction", { chatId, messageId, userId: req.user!.id, emoji, op: "remove" });

  res.json({ ok: true });
}));

const ReadSchema = z.object({ messageId: z.string().uuid() });

router.post("/:chatId/read", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const body = ReadSchema.parse(req.body);

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  // Mark-as-read can be sent multiple times (scroll, reconnect, optimistic UI).
  // Use upsert to keep this endpoint idempotent and avoid UNIQUE constraint errors.
  await prisma.messageRead.upsert({
    where: { chatId_userId_messageId: { chatId, userId: req.user!.id, messageId: body.messageId } },
    create: { chatId, userId: req.user!.id, messageId: body.messageId },
    update: {},
  });

  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "message:read", { chatId, userId: req.user!.id, messageId: body.messageId });

  res.json({ ok: true });
}));

router.get("/:chatId/media", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } } });
  if (!member) throw new HttpError(404, "Chat not found");

  const messages = await prisma.message.findMany({
    where: { chatId, deletedAt: null, attachments: { some: {} } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, attachments: true, senderId: true },
  });

  res.json({ items: messages });
}));

// Pin message (group only)
router.post("/:chatId/pin/:messageId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chatId, messageId } = req.params;
  const me = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: req.user!.id } }, include: { chat: true } });
  if (!me) throw new HttpError(404, "Chat not found");
  if (me.chat.type !== "GROUP") throw new HttpError(400, "Only group chats support pin");
  if (me.role === "MEMBER" && req.user!.role !== "ADMIN") throw new HttpError(403, "Only admins can pin");

  await prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: messageId } });
  const emitter = req.app.locals.emitter as any;
  emitter?.emitToChat(chatId, "chat:pinned", { chatId, messageId });

  res.json({ ok: true });
}));

// --- FUTURE: chat events scaffold endpoints (create option votes) ---
router.get("/:chatId/events", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const chatId = req.params.chatId;
  const events = await prisma.chatEvent.findMany({ where: { chatId }, include: { options: true, votes: true }, orderBy: { createdAt: "desc" } });
  res.json({ items: events });
}));

export default router;
