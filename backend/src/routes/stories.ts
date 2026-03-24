import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { asyncHandler, HttpError } from '../utils/http';

const router = Router();

function fileUrl(req: any, filename: string) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${filename}`;
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
  for (const relation of relations) {
    ids.add(relation.senderId === userId ? relation.receiverId : relation.senderId);
  }
  return Array.from(ids);
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
  return {
    id: story.id,
    authorId: story.authorId,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    durationMs: story.durationMs,
    width: story.width,
    height: story.height,
    itemsJson: story.itemsJson,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    author: story.author,
    viewedByMe: viewerId ? Boolean(story.views?.length) : false,
    viewsCount: story._count?.views ?? 0,
  };
}

router.get('/rail', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const visibleUserIds = await getFriendIds(meId);
  const now = new Date();

  const stories = await prisma.story.findMany({
    where: {
      expiresAt: { gt: now },
      authorId: { in: visibleUserIds },
    },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      views: { where: { viewerId: meId }, select: { id: true } },
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

  const rails = Array.from(byAuthor.values())
    .map((item) => ({
      ...item,
      hasUnviewed: item.unviewedCount > 0,
      viewed: item.unviewedCount === 0,
      isOwn: item.author.id === meId,
    }))
    .sort((a, b) => {
      if (a.isOwn && !b.isOwn) return -1;
      if (!a.isOwn && b.isOwn) return 1;
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
      return new Date(b.lastCreatedAt).getTime() - new Date(a.lastCreatedAt).getTime();
    });

  res.json({ items: rails });
}));

router.get('/user/:userId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meId = req.user!.id;
  const userId = req.params.userId;
  const allowed = await ensureStoryAccess(meId, userId, req.user!.role === 'ADMIN');
  if (!allowed) throw new HttpError(403, 'Forbidden');

  const now = new Date();
  const stories = await prisma.story.findMany({
    where: { authorId: userId, expiresAt: { gt: now } },
    orderBy: [{ createdAt: 'asc' }],
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      views: { where: { viewerId: meId }, select: { id: true } },
      _count: { select: { views: true } },
    },
  });

  res.json({
    author: stories[0]?.author ?? null,
    items: stories.map((story) => normalizeStory(story, meId)),
  });
}));

const DraftSchema = z.object({
  durationMs: z.coerce.number().int().min(1000).max(60000).optional(),
  width: z.coerce.number().int().min(1).max(8000).optional().nullable(),
  height: z.coerce.number().int().min(1).max(8000).optional().nullable(),
  itemsJson: z.any().optional().nullable(),
});

router.post('/', requireAuth, upload.array('files', 20), asyncHandler(async (req: AuthedRequest, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, 'Files are required');

  let drafts: Array<z.infer<typeof DraftSchema>> = [];
  const rawDrafts = typeof req.body.drafts === 'string' ? req.body.drafts : typeof req.body.draftsJson === 'string' ? req.body.draftsJson : '[]';
  try {
    const parsed = JSON.parse(rawDrafts);
    drafts = z.array(DraftSchema).max(20).parse(Array.isArray(parsed) ? parsed : []);
  } catch {
    drafts = [];
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const created = await prisma.$transaction(
    files.map((file, index) => {
      const draft = drafts[index] ?? {};
      return prisma.story.create({
        data: {
          authorId: req.user!.id,
          mediaUrl: fileUrl(req, path.basename(file.filename)),
          mediaType: file.mimetype,
          durationMs: draft.durationMs ?? (file.mimetype.startsWith('video/') ? 15000 : 8000),
          width: draft.width ?? undefined,
          height: draft.height ?? undefined,
          itemsJson: draft.itemsJson ?? undefined,
          expiresAt,
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          _count: { select: { views: true } },
        },
      });
    }),
  );

  res.json({ items: created.map((story) => ({ ...normalizeStory({ ...story, views: [] }, req.user!.id) })) });
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

router.get('/:storyId/viewers', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const storyId = req.params.storyId;
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true, authorId: true, expiresAt: true } });
  if (!story || story.expiresAt <= new Date()) throw new HttpError(404, 'Story not found');
  if (req.user!.role !== 'ADMIN' && story.authorId !== req.user!.id) throw new HttpError(403, 'Forbidden');

  const viewers = await prisma.storyView.findMany({
    where: { storyId },
    orderBy: { viewedAt: 'desc' },
    include: {
      viewer: { select: { id: true, username: true, avatarUrl: true } },
    },
  });

  res.json({
    count: viewers.length,
    items: viewers.map((view) => ({
      id: view.id,
      viewedAt: view.viewedAt,
      viewer: view.viewer,
    })),
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
