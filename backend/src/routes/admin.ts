
import { Router } from "express";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

router.get("/users", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, username: true, email: true, role: true, createdAt: true, lastSeenAt: true },
  });
  res.json({ users });
}));

router.get("/users/:userId", asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true, privacy: true, _count: { select: { posts: true, messages: true, healthDays: true, tasks: true } } },
  });
  if (!user) throw new HttpError(404, "User not found");
  res.json({ user });
}));

router.delete("/users/:userId", asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  await prisma.user.delete({ where: { id: userId } });
  res.json({ ok: true });
}));

router.get("/posts", asyncHandler(async (_req, res) => {
  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { author: { select: { id: true, username: true } }, _count: { select: { comments: true, likes: true } } },
  });
  res.json({ posts });
}));

router.delete("/posts/:postId", asyncHandler(async (req, res) => {
  await prisma.post.update({ where: { id: req.params.postId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.delete("/comments/:commentId", asyncHandler(async (req, res) => {
  await prisma.comment.update({ where: { id: req.params.commentId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.get("/chats", asyncHandler(async (_req, res) => {
  const chats = await prisma.chat.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: { members: true, _count: { select: { messages: true } } } });
  res.json({ chats });
}));

router.get("/health/:userId", asyncHandler(async (req, res) => {
  const rows = await prisma.healthDay.findMany({ where: { userId: req.params.userId }, orderBy: { date: "desc" }, take: 200 });
  res.json({ rows });
}));

router.get("/tasks/:userId", asyncHandler(async (req, res) => {
  const tasks = await prisma.task.findMany({ where: { userId: req.params.userId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ tasks });
}));

export default router;
