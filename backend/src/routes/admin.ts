import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireActiveUser, requireRole, AuthedRequest } from "../middleware/auth";
import { normalizePath, trackAnalyticsEvent } from "../utils/analytics";

const router = Router();

router.use(requireAuth, requireActiveUser, requireRole("ADMIN"));

const SuspendUserSchema = z.object({
  durationDays: z.number().int().positive().max(3650).optional().nullable(),
  permanent: z.boolean().optional(),
  reason: z.string().trim().max(500).optional().nullable(),
}).superRefine((value, ctx) => {
  if (!value.permanent && !value.durationDays) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide durationDays or permanent" });
  }
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function hourKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
}

function formatHourLabel(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function getBucketStart(date: Date, bucketMinutes: number) {
  const ms = bucketMinutes * 60 * 1000;
  const stamp = Math.floor(date.getTime() / ms) * ms;
  return new Date(stamp);
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return 0;
  return Math.round(seconds);
}

async function logAdminAction(req: AuthedRequest, actionKey: string, metadata?: Record<string, unknown>) {
  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/admin',
    pageLabel: 'Админ панель',
    actionKey,
    metadata,
  });
}

router.get("/analytics/overview", asyncHandler(async (_req, res) => {
  const now = new Date();
  const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const onlineThreshold = new Date(now.getTime() - 5 * 60 * 1000);

  const [
    totalUsers,
    newUsers7d,
    currentOnlineRows,
    sessions7d,
    sessions30d,
    pageViewEvents14d,
    leaveEvents14d,
    presenceEvents24h,
    actionEvents30d,
    pageViews24hCount,
    pageViews7dCount,
    supportCounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: start7d } } }),
    prisma.analyticsSession.findMany({
      where: { isActive: true, lastSeenAt: { gte: onlineThreshold } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.analyticsSession.findMany({
      where: { startedAt: { gte: start7d } },
      select: { userId: true, sessionKey: true, startedAt: true, lastSeenAt: true, totalDurationSec: true, pageViews: true },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.analyticsSession.findMany({
      where: { startedAt: { gte: start30d } },
      select: { userId: true, sessionKey: true, startedAt: true, totalDurationSec: true, pageViews: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { type: 'PAGE_VIEW', createdAt: { gte: start14d } },
      select: { path: true, pageLabel: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.analyticsEvent.findMany({
      where: { type: 'PAGE_LEAVE', createdAt: { gte: start14d } },
      select: { path: true, durationSec: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.analyticsEvent.findMany({
      where: { type: { in: ['PAGE_VIEW', 'PAGE_LEAVE', 'HEARTBEAT'] }, createdAt: { gte: start24h } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.analyticsEvent.findMany({
      where: { type: 'ACTION', createdAt: { gte: start30d } },
      select: { actionKey: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'desc' },
      take: 1500,
    }),
    prisma.analyticsEvent.count({ where: { type: 'PAGE_VIEW', createdAt: { gte: start24h } } }),
    prisma.analyticsEvent.count({ where: { type: 'PAGE_VIEW', createdAt: { gte: start7d } } }),
    Promise.all([
      prisma.supportTicket.count(),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { status: 'IN_REVIEW' } }),
      prisma.supportQuestion.count({ where: { status: 'OPEN' } }),
      prisma.supportQuestion.count({ where: { status: 'ANSWERED' } }),
      prisma.supportQuestion.count({ where: { status: 'ARCHIVED' } }),
    ]),
  ]);

  const currentOnline = currentOnlineRows.length;

  const sessionsWithDuration = sessions7d.filter((session) => session.totalDurationSec > 0);
  const avgSessionDurationSec = sessionsWithDuration.length
    ? Math.round(sessionsWithDuration.reduce((sum, session) => sum + session.totalDurationSec, 0) / sessionsWithDuration.length)
    : 0;
  const avgPagesPerSession = sessions7d.length
    ? Number((sessions7d.reduce((sum, session) => sum + session.pageViews, 0) / sessions7d.length).toFixed(1))
    : 0;
  const bounceRate = sessions7d.length
    ? Math.round((sessions7d.filter((session) => session.pageViews <= 1).length / sessions7d.length) * 100)
    : 0;

  const activeUsers24h = new Set(
    pageViewEvents14d
      .filter((event) => event.createdAt >= start24h)
      .map((event) => event.userId),
  ).size;
  const activeUsers7d = new Set(
    pageViewEvents14d
      .filter((event) => event.createdAt >= start7d)
      .map((event) => event.userId),
  ).size;
  const activeUsers30d = new Set(sessions30d.map((session) => session.userId)).size;

  const userSessionCounts30d = new Map<string, number>();
  for (const session of sessions30d) {
    userSessionCounts30d.set(session.userId, (userSessionCounts30d.get(session.userId) ?? 0) + 1);
  }
  const returningUsers30d = [...userSessionCounts30d.values()].filter((count) => count > 1).length;
  const retention30d = activeUsers30d ? Math.round((returningUsers30d / activeUsers30d) * 100) : 0;

  const dailyActiveUsers = [] as Array<{ date: string; label: string; value: number }>;
  const pageViewsByDay = [] as Array<{ date: string; label: string; value: number }>;
  const uniqueUsersByDay = new Map<string, Set<string>>();
  const pageViewCountsByDay = new Map<string, number>();
  for (const event of pageViewEvents14d) {
    const key = dateKey(event.createdAt);
    if (!uniqueUsersByDay.has(key)) uniqueUsersByDay.set(key, new Set());
    uniqueUsersByDay.get(key)!.add(event.userId);
    pageViewCountsByDay.set(key, (pageViewCountsByDay.get(key) ?? 0) + 1);
  }
  for (let i = 13; i >= 0; i -= 1) {
    const day = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    const key = dateKey(day);
    dailyActiveUsers.push({ date: key, label: formatDayLabel(day), value: uniqueUsersByDay.get(key)?.size ?? 0 });
    pageViewsByDay.push({ date: key, label: formatDayLabel(day), value: pageViewCountsByDay.get(key) ?? 0 });
  }

  const hourlyActivity = [] as Array<{ slot: string; label: string; views: number; users: number }>;
  const hourlyViewsMap = new Map<string, number>();
  const hourlyUsersMap = new Map<string, Set<string>>();
  for (const event of pageViewEvents14d.filter((item) => item.createdAt >= start24h)) {
    const key = hourKey(event.createdAt);
    hourlyViewsMap.set(key, (hourlyViewsMap.get(key) ?? 0) + 1);
    if (!hourlyUsersMap.has(key)) hourlyUsersMap.set(key, new Set());
    hourlyUsersMap.get(key)!.add(event.userId);
  }
  for (let i = 23; i >= 0; i -= 1) {
    const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
    hour.setMinutes(0, 0, 0);
    const key = hourKey(hour);
    hourlyActivity.push({
      slot: key,
      label: formatHourLabel(hour),
      views: hourlyViewsMap.get(key) ?? 0,
      users: hourlyUsersMap.get(key)?.size ?? 0,
    });
  }

  const onlineMap = new Map<string, Set<string>>();
  for (const event of presenceEvents24h) {
    const bucket = getBucketStart(event.createdAt, 30);
    const key = bucket.toISOString();
    if (!onlineMap.has(key)) onlineMap.set(key, new Set());
    onlineMap.get(key)!.add(event.userId);
  }
  const onlineTimeline = [] as Array<{ slot: string; label: string; users: number }>;
  for (let i = 47; i >= 0; i -= 1) {
    const bucketStart = getBucketStart(new Date(now.getTime() - i * 30 * 60 * 1000), 30);
    const key = bucketStart.toISOString();
    onlineTimeline.push({
      slot: key,
      label: bucketStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      users: onlineMap.get(key)?.size ?? 0,
    });
  }
  const avgOnline24h = onlineTimeline.length
    ? Number((onlineTimeline.reduce((sum, item) => sum + item.users, 0) / onlineTimeline.length).toFixed(1))
    : 0;
  const peakOnline24h = onlineTimeline.reduce((max, item) => Math.max(max, item.users), 0);

  const pageStatsMap = new Map<string, { path: string; label: string; views: number; uniqueUsers: Set<string>; durationTotal: number; durationCount: number }>();
  for (const event of pageViewEvents14d) {
    const path = normalizePath(event.path);
    const current = pageStatsMap.get(path) ?? {
      path,
      label: event.pageLabel?.trim() || path,
      views: 0,
      uniqueUsers: new Set<string>(),
      durationTotal: 0,
      durationCount: 0,
    };
    current.views += 1;
    current.uniqueUsers.add(event.userId);
    if (!current.label && event.pageLabel?.trim()) current.label = event.pageLabel.trim();
    pageStatsMap.set(path, current);
  }
  for (const event of leaveEvents14d) {
    const path = normalizePath(event.path);
    const current = pageStatsMap.get(path) ?? {
      path,
      label: path,
      views: 0,
      uniqueUsers: new Set<string>(),
      durationTotal: 0,
      durationCount: 0,
    };
    if (typeof event.durationSec === 'number' && Number.isFinite(event.durationSec)) {
      current.durationTotal += event.durationSec;
      current.durationCount += 1;
    }
    pageStatsMap.set(path, current);
  }
  const topPages = [...pageStatsMap.values()]
    .map((item) => ({
      path: item.path,
      label: item.label,
      views: item.views,
      uniqueUsers: item.uniqueUsers.size,
      avgDurationSec: item.durationCount ? Math.round(item.durationTotal / item.durationCount) : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  const actionStatsMap = new Map<string, number>();
  for (const event of actionEvents30d) {
    const key = event.actionKey?.trim() || 'other';
    actionStatsMap.set(key, (actionStatsMap.get(key) ?? 0) + 1);
  }
  const topActions = [...actionStatsMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const tabStatsMap = new Map<string, { label: string; views: number }>();
  for (const event of pageViewEvents14d) {
    const root = normalizePath(event.path).split('/')[1] || 'feed';
    const routeKey = root === '' ? 'feed' : root;
    const labelMap: Record<string, string> = {
      feed: 'Лента',
      health: 'Пульс',
      friends: 'Подписки',
      messages: 'Сообщения',
      support: 'Тех поддержка',
      admin: 'Админ панель',
      profile: 'Профиль',
      settings: 'Настройки',
    };
    const current = tabStatsMap.get(routeKey) ?? { label: labelMap[routeKey] ?? routeKey, views: 0 };
    current.views += 1;
    tabStatsMap.set(routeKey, current);
  }
  const topTabs = [...tabStatsMap.entries()]
    .map(([key, value]) => ({ key, label: value.label, views: value.views }))
    .sort((a, b) => b.views - a.views);

  const [ticketsTotal, ticketsOpen, ticketsInReview, questionsOpen, questionsAnswered, questionsArchived] = supportCounts;

  res.json({
    overview: {
      totalUsers,
      newUsers7d,
      activeUsers24h,
      activeUsers7d,
      activeUsers30d,
      currentOnline,
      avgOnline24h,
      peakOnline24h,
      pageViews24h: pageViews24hCount,
      pageViews7d: pageViews7dCount,
      avgSessionDurationSec,
      avgPagesPerSession,
      bounceRate,
      retention30d,
      ticketsOpen,
      ticketsInReview,
      ticketsTotal,
      questionsOpen,
      questionsAnswered,
      questionsArchived,
    },
    charts: {
      dailyActiveUsers,
      pageViewsByDay,
      hourlyActivity,
      onlineTimeline,
    },
    topPages,
    topTabs,
    topActions,
  });
}));

router.get("/users", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      lastSeenAt: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspendedPermanent: true,
      suspensionReason: true,
    },
  });
  res.json({ users });
}));

router.get("/users/:userId", asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      settings: true,
      privacy: true,
      _count: { select: { posts: true, messages: true, healthDays: true, tasks: true } },
    },
  });
  if (!user) throw new HttpError(404, "User not found");
  res.json({ user });
}));

router.post("/users/:userId/suspend", asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  const body = SuspendUserSchema.parse(req.body);

  if (userId === req.user!.id) throw new HttpError(400, "Admin cannot suspend self");

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found");

  const suspendedUntil = body.permanent ? null : new Date(Date.now() + Number(body.durationDays ?? 0) * 24 * 60 * 60 * 1000);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      suspendedAt: new Date(),
      suspendedUntil,
      suspendedPermanent: Boolean(body.permanent),
      suspensionReason: body.reason ?? null,
    },
    select: {
      id: true,
      username: true,
      role: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspendedPermanent: true,
      suspensionReason: true,
    },
  });

  await logAdminAction(req, 'admin_user_suspended', {
    targetUserId: userId,
    durationDays: body.durationDays ?? null,
    permanent: Boolean(body.permanent),
  });

  res.json({ user, ok: true });
}));

router.post("/users/:userId/unsuspend", asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  if (userId === req.user!.id) throw new HttpError(400, "Admin cannot unsuspend self here");

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found");

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      suspendedAt: null,
      suspendedUntil: null,
      suspendedPermanent: false,
      suspensionReason: null,
    },
    select: {
      id: true,
      username: true,
      role: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspendedPermanent: true,
      suspensionReason: true,
    },
  });

  await logAdminAction(req, 'admin_user_unsuspended', { targetUserId: userId });

  res.json({ user, ok: true });
}));

router.delete("/users/:userId", asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  if (userId === req.user!.id) throw new HttpError(400, "Admin cannot delete self");

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found");

  await prisma.$transaction(async (tx) => {
    const [userPosts, userComments, directChats] = await Promise.all([
      tx.post.findMany({ where: { authorId: userId }, select: { id: true } }),
      tx.comment.findMany({ where: { authorId: userId }, select: { id: true } }),
      tx.chat.findMany({
        where: { type: "DIRECT", members: { some: { userId } } },
        select: { id: true },
      }),
    ]);

    const postIds = userPosts.map((item) => item.id);
    const commentIds = userComments.map((item) => item.id);
    const directChatIds = directChats.map((item) => item.id);
    const referencedMessages = await tx.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          ...(directChatIds.length ? [{ chatId: { in: directChatIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const messageIds = referencedMessages.map((item) => item.id);

    if (postIds.length) {
      await tx.post.updateMany({ where: { repostOfId: { in: postIds } }, data: { repostOfId: null } });
    }

    if (commentIds.length) {
      await tx.comment.updateMany({ where: { parentId: { in: commentIds } }, data: { parentId: null } });
    }

    if (messageIds.length) {
      await tx.message.updateMany({ where: { replyToId: { in: messageIds } }, data: { replyToId: null } });
      await tx.message.updateMany({ where: { forwardOfId: { in: messageIds } }, data: { forwardOfId: null } });
      await tx.chat.updateMany({ where: { pinnedMessageId: { in: messageIds } }, data: { pinnedMessageId: null } });
    }

    if (directChatIds.length) {
      await tx.chat.deleteMany({ where: { id: { in: directChatIds } } });
    }

    await tx.user.delete({ where: { id: userId } });
  });

  await logAdminAction(req, 'admin_user_deleted', { targetUserId: userId });
  res.json({ ok: true });
}));

router.get("/posts", asyncHandler(async (_req, res) => {
  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { author: { select: { id: true, username: true, avatarUrl: true, role: true } }, _count: { select: { comments: true, likes: true } } },
  });
  res.json({ posts });
}));

router.delete("/posts/:postId", asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.post.update({ where: { id: req.params.postId }, data: { deletedAt: new Date() } });
  await logAdminAction(req, 'admin_post_deleted', { postId: req.params.postId });
  res.json({ ok: true });
}));

router.delete("/comments/:commentId", asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.comment.update({ where: { id: req.params.commentId }, data: { deletedAt: new Date() } });
  await logAdminAction(req, 'admin_comment_deleted', { commentId: req.params.commentId });
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
