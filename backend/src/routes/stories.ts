import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth, requireActiveUser, AuthedRequest } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { getEnv } from '../config/env';
import { activeUserWhere, isUserSuspended } from '../utils/userStatus';
import { buildUploadUrl } from '../utils/uploads';

const router = Router();
router.use(requireAuth, requireActiveUser);
const env = getEnv();

const storyStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve(process.cwd(), env.UPLOAD_DIR)),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const storyUpload = multer({
  storage: storyStorage,
  limits: { fileSize: 1000 * 1024 * 1024 },
});

function fileUrl(_req: any, filename: string) {
  return buildUploadUrl(filename);
}

async function getFriendIds(userId: string) {
  const relations = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    select: { senderId: true, receiverId: true },
  });

  const ids = new Set<string>([userId]);
  for (const relation of relations) ids.add(relation.senderId === userId ? relation.receiverId : relation.senderId);
  return Array.from(ids);
}


async function ensureAuthorVisibleForStories(authorId: string, viewerId: string, isAdmin = false) {
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, suspendedAt: true, suspendedUntil: true, suspendedPermanent: true },
  });
  if (!author) throw new HttpError(404, 'User not found');
  if (!isAdmin && viewerId !== authorId && isUserSuspended(author)) throw new HttpError(404, 'User not found');
  return author;
}

async function ensureStoryAccess(viewerId: string, authorId: string, isAdmin = false) {
  if (viewerId === authorId || isAdmin) return true;
  const relation = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: viewerId, receiverId: authorId },
        { senderId: authorId, receiverId: viewerId },
      ],
    },
    select: { id: true },
  });
  return Boolean(relation);
}

function normalizeStory(story: any, viewerId: string) {
  const myView = viewerId ? (story.views?.[0] ?? null) : null;
  return {
    id: story.id,
    authorId: story.authorId,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    durationMs: story.durationMs,
    width: story.width,
    height: story.height,
    itemsJson: story.itemsJson,
    trimStartMs: story.trimStartMs,
    trimEndMs: story.trimEndMs,
    transformJson: story.transformJson,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    author: story.author,
    viewedByMe: viewerId ? Boolean(myView) : false,
    myReaction: myView?.reaction ?? null,
    viewsCount: story._count?.views ?? 0,
    highlightIds: Array.isArray(story.highlightEntries) ? story.highlightEntries.map((entry: any) => entry.highlightId) : [],
    archived: new Date(story.expiresAt).getTime() <= Date.now(),
  };
}

const DraftSchema = z.object({
  durationMs: z.coerce.number().int().min(1000).max(30000).optional(),
  width: z.coerce.number().int().min(1).max(8000).optional().nullable(),
  height: z.coerce.number().int().min(1).max(8000).optional().nullable(),
  itemsJson: z.any().optional().nullable(),
  trimStartMs: z.coerce.number().int().min(0).max(86_400_000).optional().nullable(),
  trimEndMs: z.coerce.number().int().min(0).max(86_400_000).optional().nullable(),
  sourceDurationMs: z.coerce.number().int().min(0).max(120_000).optional().nullable(),
  transformJson: z.any().optional().nullable(),
});

const HighlightTargetSchema = z.object({
  highlightId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(80).optional().nullable(),
}).optional().nullable();

async function resolveHighlightTarget(userId: string, target: z.infer<typeof HighlightTargetSchema>) {
  if (!target) return null;
  if (target.highlightId) {
    const highlight = await prisma.storyHighlight.findFirst({ where: { id: target.highlightId, userId } });
    if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
    return highlight;
  }
  if (target.title) {
    return prisma.storyHighlight.create({ data: { userId, title: target.title.trim() } });
  }
  return null;
}

async function ensureHighlightCapacity(highlightId: string, adding: number) {
  const existing = await prisma.storyHighlightItem.count({ where: { highlightId } });
  if (existing + adding > 30) throw new HttpError(400, 'В одном актуальном может быть максимум 30 сторис');
}

router.get('/rail', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const visibleUserIds = await getFriendIds(meId);
  const now = new Date();

  const stories = await prisma.story.findMany({
    where: {
      expiresAt: { gt: now },
      authorId: { in: visibleUserIds },
      author: { is: activeUserWhere(now) },
    },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true } },
      views: { where: { viewerId: meId }, select: { id: true, reaction: true } },
      _count: { select: { views: true } },
    },
  });

  const byAuthor = new Map<string, any>();
  for (const story of stories) {
    const existing = byAuthor.get(story.authorId) ?? {
      author: story.author,
      totalStories: 0,
      unviewedCount: 0,
      lastCreatedAt: story.createdAt,
      preview: { mediaUrl: story.mediaUrl, mediaType: story.mediaType },
      storyIds: [],
    };
    existing.totalStories += 1;
    existing.storyIds.push(story.id);
    existing.lastCreatedAt = story.createdAt > existing.lastCreatedAt ? story.createdAt : existing.lastCreatedAt;
    existing.preview = { mediaUrl: story.mediaUrl, mediaType: story.mediaType };
    if (story.authorId !== meId && !(story.views?.length)) existing.unviewedCount += 1;
    byAuthor.set(story.authorId, existing);
  }

  const items = Array.from(byAuthor.values())
    .map((item) => ({ ...item, hasUnviewed: item.unviewedCount > 0, viewed: item.unviewedCount === 0, isOwn: item.author.id === meId }))
    .sort((a, b) => {
      if (a.isOwn && !b.isOwn) return -1;
      if (!a.isOwn && b.isOwn) return 1;
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return new Date(b.lastCreatedAt).getTime() - new Date(a.lastCreatedAt).getTime();
    });

  res.json({ items });
}));

router.get('/user/:userId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const userId = req.params.userId;
  await ensureAuthorVisibleForStories(userId, meId, req.user!.role === 'ADMIN');
  const allowed = await ensureStoryAccess(meId, userId, req.user!.role === 'ADMIN');
  if (!allowed) throw new HttpError(403, 'Forbidden');

  const now = new Date();
  const stories = await prisma.story.findMany({
    where: { authorId: userId, expiresAt: { gt: now }, ...(req.user!.role === 'ADMIN' ? {} : { author: { is: activeUserWhere(now) } }) },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true } },
      views: { where: { viewerId: meId }, select: { id: true, reaction: true } },
      _count: { select: { views: true } },
      highlightEntries: { select: { highlightId: true } },
    },
  });

  res.json({
    author: stories[0]?.author ?? null,
    items: stories.map((story) => normalizeStory(story, meId)),
  });
}));

router.get('/archive', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const now = new Date();
  const items = await prisma.story.findMany({
    where: { authorId: meId, expiresAt: { lte: now } },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true } },
      views: { where: { viewerId: meId }, select: { id: true, reaction: true } },
      _count: { select: { views: true } },
      highlightEntries: { select: { highlightId: true } },
    },
  });
  res.json({ items: items.map((story) => normalizeStory(story, meId)) });
}));

router.get('/highlights/user/:userId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const userId = req.params.userId;
  await ensureAuthorVisibleForStories(userId, meId, req.user!.role === 'ADMIN');
  const allowed = await ensureStoryAccess(meId, userId, req.user!.role === 'ADMIN');
  if (!allowed) throw new HttpError(403, 'Forbidden');

  const highlights = await prisma.storyHighlight.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      entries: {
        ...(req.user!.role === 'ADMIN' ? {} : { where: { story: { author: { is: activeUserWhere(new Date()) } } } }),
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: {
          story: {
            include: {
              author: { select: { id: true, username: true, avatarUrl: true, role: true } },
              views: { where: { viewerId: meId }, select: { id: true, reaction: true } },
              _count: { select: { views: true } },
              highlightEntries: { select: { highlightId: true } },
            },
          },
        },
      },
    },
  });

  const items = highlights
    .map((highlight) => ({
      id: highlight.id,
      title: highlight.title,
      createdAt: highlight.createdAt,
      updatedAt: highlight.updatedAt,
      count: highlight.entries.length,
      cover: highlight.entries[0]?.story ? {
        mediaUrl: highlight.entries[0].story.mediaUrl,
        mediaType: highlight.entries[0].story.mediaType,
      } : null,
      items: highlight.entries.map((entry) => normalizeStory(entry.story, meId)),
    }))
    .filter((highlight) => highlight.count > 0);

  res.json({ items });
}));

const CreateHighlightSchema = z.object({ title: z.string().trim().min(1).max(80) });

router.post('/highlights', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateHighlightSchema.parse(req.body ?? {});
  const highlight = await prisma.storyHighlight.create({ data: { userId: req.user!.id, title: body.title } });
  res.json({ highlight });
}));

router.patch('/highlights/:highlightId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateHighlightSchema.parse(req.body ?? {});
  const highlight = await prisma.storyHighlight.findFirst({ where: { id: req.params.highlightId, userId: req.user!.id } });
  if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
  const updated = await prisma.storyHighlight.update({ where: { id: highlight.id }, data: { title: body.title } });
  res.json({ highlight: updated });
}));

router.delete('/highlights/:highlightId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const highlight = await prisma.storyHighlight.findFirst({ where: { id: req.params.highlightId, userId: req.user!.id } });
  if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
  await prisma.storyHighlight.delete({ where: { id: highlight.id } });
  res.json({ ok: true });
}));

router.post('/highlights/:highlightId/stories', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = z.object({ storyId: z.string().uuid() }).parse(req.body ?? {});
  const highlight = await prisma.storyHighlight.findFirst({ where: { id: req.params.highlightId, userId: req.user!.id } });
  if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
  const story = await prisma.story.findFirst({ where: { id: body.storyId, authorId: req.user!.id } });
  if (!story) throw new HttpError(404, 'Story not found');
  await ensureHighlightCapacity(highlight.id, 1);
  const order = await prisma.storyHighlightItem.count({ where: { highlightId: highlight.id } });
  await prisma.storyHighlightItem.upsert({
    where: { highlightId_storyId: { highlightId: highlight.id, storyId: story.id } },
    create: { highlightId: highlight.id, storyId: story.id, order },
    update: {},
  });
  await prisma.storyHighlight.update({ where: { id: highlight.id }, data: { updatedAt: new Date() } });
  res.json({ ok: true, highlightId: highlight.id });
}));

router.delete('/highlights/:highlightId/stories/:storyId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const highlight = await prisma.storyHighlight.findFirst({ where: { id: req.params.highlightId, userId: req.user!.id } });
  if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
  await prisma.storyHighlightItem.deleteMany({ where: { highlightId: highlight.id, storyId: req.params.storyId } });
  const remaining = await prisma.storyHighlightItem.count({ where: { highlightId: highlight.id } });
  if (remaining === 0) await prisma.storyHighlight.delete({ where: { id: highlight.id } });
  else await prisma.storyHighlight.update({ where: { id: highlight.id }, data: { updatedAt: new Date() } });
  res.json({ ok: true });
}));

router.post('/:storyId/highlight', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const story = await prisma.story.findFirst({ where: { id: req.params.storyId, authorId: req.user!.id } });
  if (!story) throw new HttpError(404, 'Story not found');
  const target = HighlightTargetSchema.parse(req.body ?? {});
  const highlight = await resolveHighlightTarget(req.user!.id, target);
  if (!highlight) throw new HttpError(400, 'Выбери актуальное');
  await ensureHighlightCapacity(highlight.id, 1);
  const order = await prisma.storyHighlightItem.count({ where: { highlightId: highlight.id } });
  await prisma.storyHighlightItem.upsert({
    where: { highlightId_storyId: { highlightId: highlight.id, storyId: story.id } },
    create: { highlightId: highlight.id, storyId: story.id, order },
    update: {},
  });
  await prisma.storyHighlight.update({ where: { id: highlight.id }, data: { updatedAt: new Date() } });
  res.json({ ok: true, highlightId: highlight.id });
}));

router.delete('/:storyId/highlight/:highlightId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const story = await prisma.story.findFirst({ where: { id: req.params.storyId, authorId: req.user!.id } });
  if (!story) throw new HttpError(404, 'Story not found');
  const highlight = await prisma.storyHighlight.findFirst({ where: { id: req.params.highlightId, userId: req.user!.id } });
  if (!highlight) throw new HttpError(404, 'Актуальное не найдено');
  await prisma.storyHighlightItem.deleteMany({ where: { highlightId: highlight.id, storyId: story.id } });
  const remaining = await prisma.storyHighlightItem.count({ where: { highlightId: highlight.id } });
  if (remaining === 0) await prisma.storyHighlight.delete({ where: { id: highlight.id } });
  else await prisma.storyHighlight.update({ where: { id: highlight.id }, data: { updatedAt: new Date() } });
  res.json({ ok: true });
}));

router.post('/', requireAuth, storyUpload.array('files', 20), asyncHandler(async (req: AuthedRequest, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, 'Files are required');
  if (files.some((file) => file.size > 1000 * 1024 * 1024)) throw new HttpError(400, 'Видео или изображение превышает 1000 МБ');

  let drafts: Array<z.infer<typeof DraftSchema>> = [];
  const rawDrafts = typeof req.body.drafts === 'string' ? req.body.drafts : typeof req.body.draftsJson === 'string' ? req.body.draftsJson : '[]';
  try {
    const parsed = JSON.parse(rawDrafts);
    drafts = z.array(DraftSchema).max(20).parse(Array.isArray(parsed) ? parsed : []);
  } catch {
    drafts = [];
  }

  const rawHighlightTarget = typeof req.body.highlightTargetJson === 'string' ? req.body.highlightTargetJson : null;
  let highlightTarget: z.infer<typeof HighlightTargetSchema> = null;
  if (rawHighlightTarget) {
    try {
      highlightTarget = HighlightTargetSchema.parse(JSON.parse(rawHighlightTarget));
    } catch {
      highlightTarget = null;
    }
  }

  if (drafts.some((draft) => (draft.sourceDurationMs ?? 0) > 120000)) throw new HttpError(400, 'Видео для сторис не должно быть длиннее 2 минут');

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const highlight = await resolveHighlightTarget(req.user!.id, highlightTarget);
  if (highlight) await ensureHighlightCapacity(highlight.id, files.length);
  const highlightStartOrder = highlight ? await prisma.storyHighlightItem.count({ where: { highlightId: highlight.id } }) : 0;

  const created = await prisma.$transaction(async (tx) => {
    const stories = [] as any[];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const draft = drafts[index] ?? {};
      const trimStartMs = draft.trimStartMs ?? 0;
      const trimEndMs = draft.trimEndMs ?? undefined;
      const resolvedDuration = draft.durationMs ?? (file.mimetype.startsWith('video/') ? 15000 : 8000);
      const story = await tx.story.create({
        data: {
          authorId: req.user!.id,
          mediaUrl: fileUrl(req, path.basename(file.filename)),
          mediaType: file.mimetype,
          durationMs: resolvedDuration,
          width: draft.width ?? undefined,
          height: draft.height ?? undefined,
          itemsJson: draft.itemsJson ?? undefined,
          trimStartMs,
          trimEndMs: trimEndMs ?? trimStartMs + resolvedDuration,
          transformJson: draft.transformJson ?? undefined,
          expiresAt,
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true, role: true } },
          _count: { select: { views: true } },
          highlightEntries: { select: { highlightId: true } },
        },
      });
      if (highlight) {
        await tx.storyHighlightItem.create({ data: { highlightId: highlight.id, storyId: story.id, order: highlightStartOrder + index } });
      }
      stories.push(story);
    }
    if (highlight) await tx.storyHighlight.update({ where: { id: highlight.id }, data: { updatedAt: new Date() } });
    return stories;
  });

  res.json({ items: created.map((story) => normalizeStory({ ...story, views: [] }, req.user!.id)) });
}));

router.post('/:storyId/view', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const storyId = req.params.storyId;
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true, authorId: true, expiresAt: true } });
  if (!story || story.expiresAt <= new Date()) throw new HttpError(404, 'Story not found');
  const allowed = await ensureStoryAccess(meId, story.authorId, req.user!.role === 'ADMIN');
  if (!allowed) throw new HttpError(403, 'Forbidden');

  if (story.authorId !== meId) {
    await prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId: meId } },
      create: { storyId, viewerId: meId },
      update: { viewedAt: new Date() },
    });
  }

  res.json({ ok: true });
}));

const StoryReactionSchema = z.object({ emoji: z.string().trim().max(16).nullable().optional() });

router.post('/:storyId/reaction', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const storyId = req.params.storyId;
  const body = StoryReactionSchema.parse(req.body ?? {});
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true, authorId: true, expiresAt: true } });
  if (!story || story.expiresAt <= new Date()) throw new HttpError(404, 'Story not found');
  const allowed = await ensureStoryAccess(meId, story.authorId, req.user!.role === 'ADMIN');
  if (!allowed) throw new HttpError(403, 'Forbidden');
  if (story.authorId === meId) throw new HttpError(400, 'Cannot react to own story');

  await prisma.storyView.upsert({
    where: { storyId_viewerId: { storyId, viewerId: meId } },
    create: { storyId, viewerId: meId, reaction: body.emoji ?? null },
    update: { viewedAt: new Date(), reaction: body.emoji ?? null },
  });

  res.json({ ok: true, reaction: body.emoji ?? null });
}));

router.get('/:storyId/viewers', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const storyId = req.params.storyId;
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true, authorId: true } });
  if (!story) throw new HttpError(404, 'Story not found');
  if (req.user!.role !== 'ADMIN' && story.authorId !== req.user!.id) throw new HttpError(403, 'Forbidden');

  const viewers = await prisma.storyView.findMany({
    where: { storyId },
    orderBy: { viewedAt: 'desc' },
    include: {
      viewer: { select: { id: true, username: true, avatarUrl: true, role: true } },
    },
  });

  res.json({
    count: viewers.length,
    items: viewers.map((view) => ({ id: view.id, viewedAt: view.viewedAt, reaction: view.reaction, viewer: view.viewer })),
  });
}));

router.delete('/:storyId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const storyId = req.params.storyId;
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true, authorId: true } });
  if (!story) throw new HttpError(404, 'Story not found');
  if (req.user!.role !== 'ADMIN' && story.authorId !== req.user!.id) throw new HttpError(403, 'Forbidden');
  await prisma.story.delete({ where: { id: storyId } });
  res.json({ ok: true });
}));

export default router;
