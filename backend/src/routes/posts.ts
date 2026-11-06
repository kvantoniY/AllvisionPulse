import { routeParam } from "../utils/http";

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

router.get("/feed", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 20), 50);

  const posts = await prisma.post.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { comments: true, likes: true, reposts: true } },
      repostOf: {
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          images: true,
          _count: { select: { comments: true, likes: true, reposts: true } },
        },
      },
    },
  });

  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
}));

const CreatePostSchema = z.object({
  text: z.string().max(5000).optional().nullable(),
  widgetsJson: z.any().optional().nullable(),
  repostOfId: z.string().uuid().optional().nullable(),
});

router.post("/", requireAuth, upload.array("images", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreatePostSchema.parse(req.body);
  const files = (req.files as Express.Multer.File[]) ?? [];
  const created = await prisma.post.create({
    data: {
      authorId: req.user!.id,
      text: body.text ?? undefined,
      widgetsJson: body.widgetsJson ?? undefined,
      repostOfId: body.repostOfId ?? undefined,
      images: {
        create: files.map((f, idx) => ({ url: fileUrl(req, path.basename(f.filename)), order: idx })),
      },
    },
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      images: true,
      _count: { select: { comments: true, likes: true, reposts: true } },
    },
  });
  res.json({ post: created });
}));

router.get("/:postId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { comments: true, likes: true, reposts: true } },
    },
  });
  if (!post) throw new HttpError(404, "Post not found");
  res.json({ post });
}));

router.delete("/:postId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.deletedAt) throw new HttpError(404, "Post not found");
  if (req.user!.role !== "ADMIN" && post.authorId !== req.user!.id) throw new HttpError(403, "Forbidden");

  await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/:postId/like", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true, deletedAt: true } });
  if (!post || post.deletedAt) throw new HttpError(404, "Post not found");
  await prisma.postLike.create({ data: { postId, userId: req.user!.id } }).catch(() => null);

  if (post.authorId !== req.user!.id) {
    const notif = await prisma.notification.create({
      data: { userId: post.authorId, type: "POST_LIKED", data: { postId, byUserId: req.user!.id } },
    });
    const emitter = req.app.locals.emitter as any;
    emitter?.emitToUser(post.authorId, "notification:new", notif);
  }

  res.json({ ok: true });
}));

router.delete("/:postId/like", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  await prisma.postLike.deleteMany({ where: { postId, userId: req.user!.id } });
  res.json({ ok: true });
}));

// --- Comments ---
router.get("/:postId/comments", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 30), 100);

  const comments = await prisma.comment.findMany({
    where: { postId, deletedAt: null, parentId: null },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      author: { select: { id: true, username: true, avatarUrl: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { replies: true, likes: true } },
    },
  });
  const hasMore = comments.length > take;
  const items = hasMore ? comments.slice(0, take) : comments;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  res.json({ items, nextCursor });
}));

router.get("/comments/:commentId/replies", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = routeParam(req, 'commentId');
  const replies = await prisma.comment.findMany({
    where: { parentId: commentId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true } }, images: true, likes: { select: { userId: true } } },
  });
  res.json({ items: replies });
}));

const CreateCommentSchema = z.object({
  text: z.string().max(5000).optional().nullable(),
  widgetsJson: z.any().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

router.post("/:postId/comments", requireAuth, upload.array("images", 10), asyncHandler(async (req: AuthedRequest, res) => {
  const postId = routeParam(req, 'postId');
  const body = CreateCommentSchema.parse(req.body);
  const files = (req.files as Express.Multer.File[]) ?? [];

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, deletedAt: true } });
  if (!post || post.deletedAt) throw new HttpError(404, "Post not found");

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
      author: { select: { id: true, username: true, avatarUrl: true } },
      images: true,
      likes: { select: { userId: true } },
      _count: { select: { replies: true, likes: true } },
    },
  });

  if (post.authorId !== req.user!.id) {
    const notif = await prisma.notification.create({
      data: { userId: post.authorId, type: "POST_COMMENTED", data: { postId, commentId: comment.id, byUserId: req.user!.id } },
    });
    const emitter = req.app.locals.emitter as any;
    emitter?.emitToUser(post.authorId, "notification:new", notif);
  }

  res.json({ comment });
}));

router.delete("/comments/:commentId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = routeParam(req, 'commentId');
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.deletedAt) throw new HttpError(404, "Comment not found");
  if (req.user!.role !== "ADMIN" && comment.authorId !== req.user!.id) throw new HttpError(403, "Forbidden");
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

router.post("/comments/:commentId/like", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = routeParam(req, 'commentId');
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true, postId: true, deletedAt: true } });
  if (!comment || comment.deletedAt) throw new HttpError(404, "Comment not found");
  await prisma.commentLike.create({ data: { commentId, userId: req.user!.id } }).catch(() => null);

  if (comment.authorId !== req.user!.id) {
    const notif = await prisma.notification.create({
      data: { userId: comment.authorId, type: "COMMENT_LIKED", data: { commentId, postId: comment.postId, byUserId: req.user!.id } },
    });
    const emitter = req.app.locals.emitter as any;
    emitter?.emitToUser(comment.authorId, "notification:new", notif);
  }

  res.json({ ok: true });
}));

router.delete("/comments/:commentId/like", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const commentId = routeParam(req, 'commentId');
  await prisma.commentLike.deleteMany({ where: { commentId, userId: req.user!.id } });
  res.json({ ok: true });
}));

export default router;
