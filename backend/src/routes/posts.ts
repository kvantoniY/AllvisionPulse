import { Router } from "express";
import { z } from "zod";
import path from "path";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireActiveUser, AuthedRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { activeUserWhere } from "../utils/userStatus";
import { createAndDeliverNotification } from "../utils/notifications";

const router = Router();
router.use(requireAuth, requireActiveUser);

function fileUrl(_req: any, filename: string) {
  return `/uploads/${encodeURIComponent(filename)}`;
}

function visiblePostWhere(postId?: string) {
  const now = new Date();
  return {
    ...(postId ? { id: postId } : {}),
    deletedAt: null,
    author: { is: activeUserWhere(now) },
    OR: [
      { repostOfId: null },
      { repostOf: { is: { deletedAt: null, author: { is: activeUserWhere(now) } } } },
    ],
  };
}

function buildPostInclude(depth = 1): any {
  return {
    author: { select: { id: true, username: true, avatarUrl: true, role: true } },
    images: true,
    likes: { select: { userId: true } },
    _count: { select: { comments: true, likes: true, reposts: true } },
    ...(depth > 0
      ? {
          repostOf: {
            include: buildPostInclude(depth - 1),
          },
        }
      : {}),
  };
}

function parseJsonField(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeWidgetsJson(value: unknown) {
  const parsed = parseJsonField(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function mapPost<T extends { widgetsJson?: any | null; repostOf?: any | null }>(post: T): T {
  const widgetsJson = normalizeWidgetsJson(post.widgetsJson);
  return {
    ...post,
    widgetsJson,
    repostOf: post.repostOf ? mapPost(post.repostOf) : post.repostOf,
  };
}

async function resolveOriginalPostId(postId: string) {
  let currentId = postId;
  for (let i = 0; i < 8; i += 1) {
    const current = await prisma.post.findFirst({
      where: visiblePostWhere(currentId),
      select: { id: true, repostOfId: true },
    });
    if (!current) throw new HttpError(404, "Post not found");
    if (!current.repostOfId) return current.id;
    currentId = current.repostOfId;
  }
  return currentId;
}

function mapComment<T extends { widgetsJson?: any | null }>(comment: T) {
  const widgetsJson = normalizeWidgetsJson(comment.widgetsJson);
  return {
    ...comment,
    widgetsJson,
    replyToUsername: typeof widgetsJson?.replyToUsername === "string" ? widgetsJson.replyToUsername : null,
  };
}

async function ensureVisiblePost(postId: string) {
  const post = await prisma.post.findFirst({
    where: visiblePostWhere(postId),
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post) throw new HttpError(404, "Post not found");
  return post;
}

router.get("/feed", asyncHandler(async (req: AuthedRequest, res) => {
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 20), 50);

  const posts = await prisma.post.findMany({
    where: visiblePostWhere(),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: buildPostInclude(),
  });

  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items: items.map(mapPost), nextCursor });
}));

const CreatePostSchema = z.object({
  text: z.string().max(5000).optional().nullable(),
  widgetsJson: z.any().optional().nullable(),
  repostOfId: z.string().uuid().optional().nullable(),
});


const UpdatePostSchema = z.object({
  text: z.string().max(5000).optional().nullable(),
  widgetsJson: z.any().optional().nullable(),
  keepImageIds: z.union([z.string(), z.array(z.string())]).optional(),
});

router.post("/", upload.array("images", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreatePostSchema.parse({
    ...req.body,
    widgetsJson: parseJsonField(req.body.widgetsJson),
  });
  const files = (req.files as Express.Multer.File[]) ?? [];

  let repostOfId: string | undefined;
  if (body.repostOfId) {
    repostOfId = await resolveOriginalPostId(body.repostOfId);
  }

  const created = await prisma.post.create({
    data: {
      authorId: req.user!.id,
      text: body.text ?? undefined,
      widgetsJson: body.widgetsJson ?? undefined,
      repostOfId,
      images: {
        create: files.map((f, idx) => ({ url: fileUrl(req, path.basename(f.filename)), order: idx })),
      },
    },
    include: buildPostInclude(),
  });
  res.json({ post: mapPost(created) });
}));


router.put("/:postId", upload.array("images", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const body = UpdatePostSchema.parse({
    ...req.body,
    widgetsJson: parseJsonField(req.body.widgetsJson),
  });
  const files = (req.files as Express.Multer.File[]) ?? [];

  const post = await prisma.post.findUnique({ where: { id: postId }, include: { images: true } });
  if (!post || post.deletedAt) throw new HttpError(404, "Post not found");
  if (req.user!.role !== "ADMIN" && post.authorId !== req.user!.id) throw new HttpError(403, "Forbidden");

  const keepImageIds = Array.isArray(body.keepImageIds)
    ? body.keepImageIds
    : typeof body.keepImageIds === 'string'
      ? [body.keepImageIds]
      : post.images.map((img) => img.id);

  const removeIds = post.images.filter((img) => !keepImageIds.includes(img.id)).map((img) => img.id);
  if (removeIds.length) {
    await prisma.postImage.deleteMany({ where: { id: { in: removeIds }, postId } });
  }

  const remainingCount = await prisma.postImage.count({ where: { postId } });
  if (files.length) {
    await prisma.postImage.createMany({
      data: files.map((f, idx) => ({
        postId,
        url: fileUrl(req, path.basename(f.filename)),
        order: remainingCount + idx,
      })),
    });
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      text: body.text == null ? post.text : (body.text || null),
      widgetsJson: body.widgetsJson === undefined ? post.widgetsJson : body.widgetsJson,
    },
    include: buildPostInclude(),
  });

  res.json({ post: mapPost(updated) });
}));

router.get("/:postId", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const post = await prisma.post.findFirst({
    where: visiblePostWhere(postId),
    include: buildPostInclude(),
  });
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post: mapPost(post) });
}));

router.delete("/:postId", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.deletedAt) throw new HttpError(404, "Post not found");
  if (req.user!.role !== "ADMIN" && post.authorId !== req.user!.id) throw new HttpError(403, "Forbidden");

  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/:postId/like", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const post = await ensureVisiblePost(postId);
  await prisma.postLike.create({ data: { postId, userId: req.user!.id } }).catch(() => null);

  if (post.authorId !== req.user!.id) {
    await createAndDeliverNotification({
      app: req.app,
      userId: post.authorId,
      type: "POST_LIKED",
      data: { postId, byUserId: req.user!.id },
    });
  }

  res.json({ ok: true });
}));

router.delete("/:postId/like", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  await prisma.postLike.deleteMany({ where: { postId, userId: req.user!.id } });
  res.json({ ok: true });
}));


router.get("/:postId/likes", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  await ensureVisiblePost(postId);

  const items = await prisma.postLike.findMany({
    where: { postId, user: { is: activeUserWhere(new Date()) } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true, role: true } },
    },
  });

  res.json({ items: items.map((item) => ({
    id: item.user.id,
    username: item.user.username,
    avatarUrl: item.user.avatarUrl,
    role: item.user.role,
    likedAt: item.createdAt,
  })) });
}));

router.get("/:postId/comments", asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 30), 100);
  await ensureVisiblePost(postId);

  const comments = await prisma.comment.findMany({
    where: { postId, deletedAt: null, parentId: null, author: { is: activeUserWhere(new Date()) } },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { replies: true, likes: true } },
    },
  });
  const hasMore = comments.length > take;
  const items = hasMore ? comments.slice(0, take) : comments;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  res.json({ items: items.map(mapComment), nextCursor });
}));

router.get("/comments/:commentId/replies", asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = req.params.commentId;
  const replies = await prisma.comment.findMany({
    where: { parentId: commentId, deletedAt: null, author: { is: activeUserWhere(new Date()) } },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true, role: true } }, images: true, likes: { select: { userId: true } }, _count: { select: { replies: true, likes: true } } },
  });
  res.json({ items: replies.map(mapComment) });
}));

const CreateCommentSchema = z.object({
  text: z.string().max(5000).optional().nullable(),
  widgetsJson: z.any().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

router.post("/:postId/comments", upload.array("images", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const postId = req.params.postId;
  const body = CreateCommentSchema.parse({
    ...req.body,
    widgetsJson: parseJsonField(req.body.widgetsJson),
  });
  const files = (req.files as Express.Multer.File[]) ?? [];

  const post = await ensureVisiblePost(postId);

  if (body.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: body.parentId, postId, deletedAt: null, author: { is: activeUserWhere(new Date()) } },
      select: { id: true },
    });
    if (!parent) throw new HttpError(404, "Comment not found");
  }

  const comment = await prisma.comment.create({
    data: {
      postId,
      authorId: req.user!.id,
      parentId: body.parentId ?? undefined,
      text: body.text ?? undefined,
      widgetsJson: body.widgetsJson ?? undefined,
      images: { create: files.map((f, idx) => ({ url: fileUrl(req, path.basename(f.filename)), order: idx })) },
    },
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { replies: true, likes: true } },
    },
  });

  if (post.authorId !== req.user!.id) {
    await createAndDeliverNotification({
      app: req.app,
      userId: post.authorId,
      type: "POST_COMMENTED",
      data: { postId, commentId: comment.id, byUserId: req.user!.id },
    });
  }

  res.json({ comment: mapComment(comment) });
}));

router.delete("/comments/:commentId", asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = req.params.commentId;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.deletedAt) throw new HttpError(404, "Comment not found");
  if (req.user!.role !== "ADMIN" && comment.authorId !== req.user!.id) throw new HttpError(403, "Forbidden");
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/comments/:commentId/like", asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = req.params.commentId;
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null, author: { is: activeUserWhere(new Date()) }, post: { is: visiblePostWhere() } },
    select: { authorId: true, postId: true },
  });
  if (!comment) throw new HttpError(404, "Comment not found");
  await prisma.commentLike.create({ data: { commentId, userId: req.user!.id } }).catch(() => null);

  if (comment.authorId !== req.user!.id) {
    await createAndDeliverNotification({
      app: req.app,
      userId: comment.authorId,
      type: "COMMENT_LIKED",
      data: { commentId, postId: comment.postId, byUserId: req.user!.id },
    });
  }

  res.json({ ok: true });
}));

router.delete("/comments/:commentId/like", asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = req.params.commentId;
  await prisma.commentLike.deleteMany({ where: { commentId, userId: req.user!.id } });
  res.json({ ok: true });
}));

export default router;
