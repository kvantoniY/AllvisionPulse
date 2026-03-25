import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { hashPassword, verifyPassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { v4 as uuid } from "uuid";

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_\.]+$/),
  password: z.string().min(8).max(128),
});

router.post("/register", asyncHandler(async (req, res) => {
  const body = RegisterSchema.parse(req.body);
  const exists = await prisma.user.findFirst({
    where: { OR: [{ username: body.username }, ...(body.email ? [{ email: body.email }] : [])] },
    select: { id: true },
  });
  if (exists) throw new HttpError(409, "User already exists");

  const user = await prisma.user.create({
    data: {
      email: body.email,
      username: body.username,
      passwordHash: await hashPassword(body.password),
      settings: { create: {} },
      privacy: { create: {} },
    },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  const sessionId = uuid();
  const refresh = signRefreshToken({ sub: user.id, sessionId });
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshToken: refresh,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    },
  });
  const access = signAccessToken({ sub: user.id, role: user.role, sessionId });

  res.json({ user, tokens: { access, refresh } });
}));

const LoginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(8).max(128),
});

router.post("/login", asyncHandler(async (req, res) => {
  const body = LoginSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: body.login }, { email: body.login }] },
  });
  if (!user) throw new HttpError(401, "Invalid credentials");

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  const sessionId = uuid();
  const refresh = signRefreshToken({ sub: user.id, sessionId });
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshToken: refresh,
      userAgent: req.get("user-agent"),
      ip: req.ip,
    },
  });
  const access = signAccessToken({ sub: user.id, role: user.role, sessionId });

  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role }, tokens: { access, refresh } });
}));

const RefreshSchema = z.object({ refresh: z.string().min(10) });

router.post("/refresh", asyncHandler(async (req, res) => {
  const body = RefreshSchema.parse(req.body);
  const payload = verifyRefreshToken(body.refresh);
  const session = await prisma.session.findFirst({
    where: { id: payload.sessionId, userId: payload.sub, revokedAt: null, refreshToken: body.refresh },
    include: { user: true },
  });
  if (!session) throw new HttpError(401, "Invalid refresh token");
  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

  const access = signAccessToken({ sub: session.userId, role: session.user.role, sessionId: session.id });
  res.json({ tokens: { access, refresh: body.refresh } });
}));

router.post("/logout", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.session.update({ where: { id: req.user!.sessionId }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
}));

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

router.post("/password", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = ChangePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "User not found");
  const ok = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, "Current password is incorrect");
  if (body.currentPassword === body.newPassword) throw new HttpError(400, "New password must be different");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await prisma.session.updateMany({ where: { userId: user.id, id: { not: req.user!.sessionId } }, data: { revokedAt: new Date() } });

  res.json({ ok: true });
}));

router.get("/sessions", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, lastUsedAt: true, revokedAt: true, userAgent: true, ip: true },
  });
  res.json({ sessions });
}));

router.delete("/sessions/:sessionId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const sessionId = req.params.sessionId;
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new HttpError(404, "Session not found");
  if (req.user!.role !== "ADMIN" && session.userId !== req.user!.id) throw new HttpError(403, "Forbidden");
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
