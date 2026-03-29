import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireActiveUser, AuthedRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { activeUserWhere, isUserSuspended } from "../utils/userStatus";

const router = Router();

const PROFILE_VISIBILITY = ["everyone", "followers", "private"] as const;
const CONTACT_VISIBILITY = ["everyone", "followers", "none"] as const;

type ProfileVisibility = (typeof PROFILE_VISIBILITY)[number];
type ContactVisibility = (typeof CONTACT_VISIBILITY)[number];

function fileUrl(req: any, filename: string) {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.get("host");
  return `${proto}://${host}/uploads/${filename}`;
}

function emptyRelationship() {
  return {
    viewerToUser: null,
    userToViewer: null,
    isFollowing: false,
    followsYou: false,
    isMutual: false,
    outgoingRequest: false,
    incomingRequest: false,
    blockedByMe: false,
    blockedMe: false,
    isBlocked: false,
  };
}

function topLevelUserSearchFilter(q: string) {
  if (!q) return undefined;
  return {
    OR: [
      { username: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
      { firstName: { contains: q, mode: "insensitive" as const } },
      { lastName: { contains: q, mode: "insensitive" as const } },
    ],
  };
}

async function getRelationshipContext(viewerId: string, targetId: string) {
  const [viewerToUser, userToViewer, blockEntry] = await Promise.all([
    prisma.friendship.findUnique({
      where: { senderId_receiverId: { senderId: viewerId, receiverId: targetId } },
      select: { id: true, senderId: true, receiverId: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.friendship.findUnique({
      where: { senderId_receiverId: { senderId: targetId, receiverId: viewerId } },
      select: { id: true, senderId: true, receiverId: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.blacklist.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  const isFollowing = viewerToUser?.status === "ACCEPTED";
  const followsYou = userToViewer?.status === "ACCEPTED";
  const blockedByMe = blockEntry?.blockerId === viewerId;
  const blockedMe = blockEntry?.blockedId === viewerId;

  return {
    viewerToUser,
    userToViewer,
    isFollowing,
    followsYou,
    isMutual: isFollowing && followsYou,
    outgoingRequest: viewerToUser?.status === "PENDING",
    incomingRequest: userToViewer?.status === "PENDING",
    blockedByMe,
    blockedMe,
    isBlocked: Boolean(blockEntry),
  };
}

function canViewProfile(args: {
  privacy?: { profileVisibility?: string | null } | null;
  isSelf: boolean;
  isFollowing: boolean;
  isAdmin: boolean;
}) {
  const visibility = (args.privacy?.profileVisibility ?? "everyone") as ProfileVisibility;
  if (args.isAdmin || args.isSelf) return true;
  if (visibility === "everyone") return true;
  if (visibility === "followers") return args.isFollowing;
  return false;
}

function canContact(args: {
  value?: string | null;
  isSelf: boolean;
  isFollowing: boolean;
  isAdmin: boolean;
}) {
  const value = (args.value ?? "everyone") as ContactVisibility;
  if (args.isAdmin || args.isSelf) return true;
  if (value === "everyone") return true;
  if (value === "followers") return args.isFollowing;
  return false;
}

function ensureVisibleUserForViewer(args: {
  user: { suspendedAt?: Date | null; suspendedUntil?: Date | null; suspendedPermanent?: boolean | null };
  isSelf: boolean;
  isAdmin: boolean;
}) {
  if ((args.isSelf || args.isAdmin) || !isUserSuspended(args.user)) return;
  throw new HttpError(404, "User not found");
}

function buildProfilePostInclude(depth = 1): any {
  return {
    author: { select: { id: true, username: true, avatarUrl: true, role: true } },
    images: true,
    likes: { select: { userId: true } },
    _count: { select: { comments: true, likes: true, reposts: true } },
    ...(depth > 0
      ? {
          repostOf: {
            include: buildProfilePostInclude(depth - 1),
          },
        }
      : {}),
  };
}

function visibleUserPostsWhere(authorId: string, isAdmin: boolean) {
  const now = new Date();
  return {
    authorId,
    deletedAt: null,
    ...(isAdmin ? {} : { author: { is: activeUserWhere(now) } }),
    OR: [
      { repostOfId: null },
      { repostOf: { is: { deletedAt: null, ...(isAdmin ? {} : { author: { is: activeUserWhere(now) } }) } } },
    ],
  };
}

async function serializeProfile(viewerId: string, username: string, viewerRole: string) {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      bio: true,
      lastSeenAt: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspendedPermanent: true,
      suspensionReason: true,
      privacy: true,
    },
  });
  if (!user) throw new HttpError(404, "User not found");

  const isSelf = viewerId === user.id;
  const isAdmin = viewerRole === "ADMIN";
  ensureVisibleUserForViewer({ user, isSelf, isAdmin });

  const relationship = isSelf ? emptyRelationship() : await getRelationshipContext(viewerId, user.id);
  const profileAllowed = !relationship.isBlocked && canViewProfile({ privacy: user.privacy, isSelf, isFollowing: relationship.isFollowing, isAdmin });
  const canMessage = !relationship.isBlocked && canContact({ value: user.privacy?.allowMessagesFrom, isSelf, isFollowing: relationship.isFollowing, isAdmin });
  const canCall = !relationship.isBlocked && canContact({ value: user.privacy?.allowCallsFrom, isSelf, isFollowing: relationship.isFollowing, isAdmin });

  const [followersCount, followingCount, postsCount] = await Promise.all([
    prisma.friendship.count({
      where: {
        receiverId: user.id,
        status: "ACCEPTED",
        ...(isAdmin ? {} : { sender: { is: activeUserWhere(now) } }),
      },
    }),
    prisma.friendship.count({
      where: {
        senderId: user.id,
        status: "ACCEPTED",
        ...(isAdmin ? {} : { receiver: { is: activeUserWhere(now) } }),
      },
    }),
    prisma.post.count({
      where: {
        authorId: user.id,
        deletedAt: null,
        ...(isAdmin ? {} : { author: { is: activeUserWhere(now) } }),
      },
    }),
  ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      bio: profileAllowed || isSelf ? user.bio : null,
      lastSeenAt: user.lastSeenAt,
      role: user.role,
      privacy: user.privacy,
      postsCount,
      followersCount,
      followingCount,
      suspendedAt: user.suspendedAt,
      suspendedUntil: user.suspendedUntil,
      suspendedPermanent: user.suspendedPermanent,
      suspensionReason: user.suspensionReason,
    },
    relationship: {
      ...relationship,
      canViewProfile: profileAllowed,
      canMessage,
      canCall,
    },
  };
}

router.get("/me", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const now = new Date();
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      avatarUrl: true,
      bio: true,
      lastSeenAt: true,
      suspendedAt: true,
      suspendedUntil: true,
      suspendedPermanent: true,
      suspensionReason: true,
      settings: true,
      privacy: true,
      pulseConfig: true,
    },
  });
  if (!me) return res.json({ user: null });

  const [followersCount, followingCount, postsCount] = await Promise.all([
    prisma.friendship.count({ where: { receiverId: me.id, status: "ACCEPTED", sender: { is: activeUserWhere(now) } } }),
    prisma.friendship.count({ where: { senderId: me.id, status: "ACCEPTED", receiver: { is: activeUserWhere(now) } } }),
    prisma.post.count({ where: { authorId: me.id, deletedAt: null } }),
  ]);

  res.json({ user: { ...me, followersCount, followingCount, postsCount } });
}));

router.use(requireAuth, requireActiveUser);

router.get("/search", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const q = (req.query.q?.toString() ?? "").trim();
  const now = new Date();
  const queryFilter = topLevelUserSearchFilter(q);
  const users = await prisma.user.findMany({
    where: req.user!.role === "ADMIN"
      ? queryFilter
      : {
          AND: [activeUserWhere(now), ...(queryFilter ? [queryFilter] : [])],
        },
    take: 20,
    select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, role: true, bio: true, lastSeenAt: true, privacy: true },
  });
  res.json({ users });
}));

router.get("/:username/connections", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const username = req.params.username;
  const tab = req.query.tab === "followers" ? "followers" : "following";
  const now = new Date();
  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, privacy: true, suspendedAt: true, suspendedUntil: true, suspendedPermanent: true },
  });
  if (!target) throw new HttpError(404, "User not found");

  const isSelf = req.user!.id === target.id;
  const isAdmin = req.user!.role === "ADMIN";
  ensureVisibleUserForViewer({ user: target, isSelf, isAdmin });

  const relationship = isSelf ? emptyRelationship() : await getRelationshipContext(req.user!.id, target.id);
  const canView = !relationship.isBlocked && canViewProfile({
    privacy: target.privacy,
    isSelf,
    isFollowing: relationship.isFollowing,
    isAdmin,
  });

  if (!canView) {
    return res.json({ canView: false, items: [] });
  }

  const items = await prisma.friendship.findMany({
    where: {
      ...(tab === "followers" ? { receiverId: target.id } : { senderId: target.id }),
      status: "ACCEPTED",
      ...(isAdmin
        ? {}
        : tab === "followers"
          ? { sender: { is: activeUserWhere(now) } }
          : { receiver: { is: activeUserWhere(now) } }),
    },
    include: {
      sender: { select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, role: true, bio: true, lastSeenAt: true, privacy: true } },
      receiver: { select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, role: true, bio: true, lastSeenAt: true, privacy: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.json({ canView: true, items });
}));

router.get("/:username/posts", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const username = req.params.username;
  const payload = await serializeProfile(req.user!.id, username, req.user!.role);
  const user = payload.user;
  const relationship = payload.relationship;
  const isSelf = req.user!.id === user.id;
  const isAdmin = req.user!.role === "ADMIN";

  if (!isSelf && !relationship.canViewProfile) {
    return res.json({ items: [], nextCursor: null });
  }

  const cursor = req.query.cursor?.toString();
  const take = Math.min(Number(req.query.take ?? 20), 50);

  const posts = await prisma.post.findMany({
    where: visibleUserPostsWhere(user.id, isAdmin),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: buildProfilePostInclude(),
  });

  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor });
}));

router.get("/:username", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const payload = await serializeProfile(req.user!.id, req.params.username, req.user!.role);
  res.json(payload);
}));

const UpdateProfileSchema = z.object({
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(280).optional().nullable(),
  firstName: z.string().trim().max(60).optional().nullable(),
  lastName: z.string().trim().max(60).optional().nullable(),
});

router.patch("/me/profile", requireAuth, upload.single("avatar"), asyncHandler(async (req: AuthedRequest, res) => {
  const body = UpdateProfileSchema.parse({
    avatarUrl: req.body?.avatarUrl === "" ? null : req.body?.avatarUrl,
    bio: req.body?.bio === "" ? null : req.body?.bio,
    firstName: req.body?.firstName === "" ? null : req.body?.firstName,
    lastName: req.body?.lastName === "" ? null : req.body?.lastName,
  });
  const nextAvatarUrl = req.file ? fileUrl(req, req.file.filename) : body.avatarUrl;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
    },
    select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true, role: true, bio: true },
  });
  res.json({ user });
}));

const UpdatePrivacySchema = z.object({
  showHealthWidgets: z.boolean().optional(),
  showTasks: z.boolean().optional(),
  showEvents: z.boolean().optional(),
  profileVisibility: z.enum(PROFILE_VISIBILITY).optional(),
  allowMessagesFrom: z.enum(CONTACT_VISIBILITY).optional(),
  allowCallsFrom: z.enum(CONTACT_VISIBILITY).optional(),
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

router.get("/me/blacklist", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const list = await prisma.blacklist.findMany({
    where: { blockerId: req.user!.id },
    include: { blocked: { select: { id: true, username: true, avatarUrl: true, role: true, bio: true, lastSeenAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ blacklist: list });
}));

const BlockSchema = z.object({ userId: z.string().uuid() });

router.post("/me/blacklist", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = BlockSchema.parse(req.body);
  if (body.userId === req.user!.id) throw new HttpError(400, "Cannot block self");

  await prisma.blacklist.create({ data: { blockerId: req.user!.id, blockedId: body.userId } }).catch(() => null);
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: body.userId },
        { senderId: body.userId, receiverId: req.user!.id },
      ],
    },
  });
  res.json({ ok: true });
}));

router.delete("/me/blacklist/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  await prisma.blacklist.deleteMany({ where: { blockerId: req.user!.id, blockedId: userId } });
  res.json({ ok: true });
}));

router.get("/me/following", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const following = await prisma.friendship.findMany({
    where: { senderId: req.user!.id, status: "ACCEPTED", receiver: { is: activeUserWhere(new Date()) } },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true, bio: true, lastSeenAt: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ following });
}));

router.get("/me/followers", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const followers = await prisma.friendship.findMany({
    where: { receiverId: req.user!.id, status: "ACCEPTED", sender: { is: activeUserWhere(new Date()) } },
    include: { sender: { select: { id: true, username: true, avatarUrl: true, bio: true, lastSeenAt: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ followers });
}));

router.get("/me/follow-requests", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const now = new Date();
  const incoming = await prisma.friendship.findMany({
    where: { receiverId: req.user!.id, status: "PENDING", sender: { is: activeUserWhere(now) } },
    include: { sender: { select: { id: true, username: true, avatarUrl: true, bio: true, lastSeenAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const outgoing = await prisma.friendship.findMany({
    where: { senderId: req.user!.id, status: "PENDING", receiver: { is: activeUserWhere(now) } },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true, bio: true, lastSeenAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ incoming, outgoing });
}));

const FollowReqSchema = z.object({ userId: z.string().uuid() });

router.post("/me/follows", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = FollowReqSchema.parse(req.body);
  if (body.userId === req.user!.id) throw new HttpError(400, "Cannot follow self");

  const blocked = await prisma.blacklist.findFirst({
    where: {
      OR: [
        { blockerId: req.user!.id, blockedId: body.userId },
        { blockerId: body.userId, blockedId: req.user!.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) throw new HttpError(403, "Blocked");

  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, privacy: true, suspendedAt: true, suspendedUntil: true, suspendedPermanent: true },
  });
  if (!target || (req.user!.role !== "ADMIN" && isUserSuspended(target))) throw new HttpError(404, "User not found");
  const status = target.privacy?.profileVisibility === "private" && req.user!.role !== "ADMIN" ? "PENDING" : "ACCEPTED";

  const follow = await prisma.friendship.upsert({
    where: { senderId_receiverId: { senderId: req.user!.id, receiverId: body.userId } },
    create: { senderId: req.user!.id, receiverId: body.userId, status },
    update: { status },
  });

  const emitter = req.app.locals.emitter as any;
  const notif = await prisma.notification.create({
    data: {
      userId: body.userId,
      type: status === "PENDING" ? "FRIEND_REQUEST" : "FRIEND_ACCEPTED",
      data: { fromUserId: req.user!.id, followId: follow.id, kind: status === "PENDING" ? "follow_request" : "follow" },
    },
  });
  emitter?.emitToUser(body.userId, "notification:new", notif);

  res.json({ follow });
}));

router.post("/me/follows/:followId/accept", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const id = req.params.followId;
  const follow = await prisma.friendship.findUnique({ where: { id } });
  if (!follow) throw new HttpError(404, "Request not found");
  if (follow.receiverId !== req.user!.id) throw new HttpError(403, "Forbidden");
  const updated = await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });

  const emitter = req.app.locals.emitter as any;
  const notif = await prisma.notification.create({
    data: { userId: follow.senderId, type: "FRIEND_ACCEPTED", data: { byUserId: req.user!.id, followId: id, kind: "follow_accept" } },
  });
  emitter?.emitToUser(follow.senderId, "notification:new", notif);

  res.json({ follow: updated });
}));

router.post("/me/follows/:followId/decline", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const id = req.params.followId;
  const follow = await prisma.friendship.findUnique({ where: { id } });
  if (!follow) throw new HttpError(404, "Request not found");
  if (follow.receiverId !== req.user!.id) throw new HttpError(403, "Forbidden");
  const updated = await prisma.friendship.update({ where: { id }, data: { status: "DECLINED" } });
  res.json({ follow: updated });
}));

router.delete("/me/follows/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const userId = req.params.userId;
  await prisma.friendship.deleteMany({ where: { senderId: req.user!.id, receiverId: userId } });
  res.json({ ok: true });
}));

// Backward-compatible aliases for older frontend modules.
router.get("/me/friends", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const following = await prisma.friendship.findMany({
    where: { senderId: req.user!.id, status: "ACCEPTED", receiver: { is: activeUserWhere(new Date()) } },
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true, role: true, lastSeenAt: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true, role: true, lastSeenAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ friends: following });
}));

router.get("/me/friend-requests", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const now = new Date();
  const incoming = await prisma.friendship.findMany({
    where: { receiverId: req.user!.id, status: "PENDING", sender: { is: activeUserWhere(now) } },
    include: { sender: { select: { id: true, username: true, avatarUrl: true, role: true, lastSeenAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const outgoing = await prisma.friendship.findMany({
    where: { senderId: req.user!.id, status: "PENDING", receiver: { is: activeUserWhere(now) } },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true, role: true, lastSeenAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ incoming, outgoing });
}));

router.post("/me/friends/request", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = FollowReqSchema.parse(req.body);
  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, privacy: true, suspendedAt: true, suspendedUntil: true, suspendedPermanent: true },
  });
  if (!target || (req.user!.role !== "ADMIN" && isUserSuspended(target))) throw new HttpError(404, "User not found");
  const status = target.privacy?.profileVisibility === "private" && req.user!.role !== "ADMIN" ? "PENDING" : "ACCEPTED";
  const friendship = await prisma.friendship.upsert({
    where: { senderId_receiverId: { senderId: req.user!.id, receiverId: body.userId } },
    create: { senderId: req.user!.id, receiverId: body.userId, status },
    update: { status },
  });
  res.json({ friendship });
}));

router.post("/me/friends/:friendshipId/accept", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const friendship = await prisma.friendship.update({ where: { id: req.params.friendshipId }, data: { status: "ACCEPTED" } });
  res.json({ friendship });
}));

router.post("/me/friends/:friendshipId/decline", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const friendship = await prisma.friendship.update({ where: { id: req.params.friendshipId }, data: { status: "DECLINED" } });
  res.json({ friendship });
}));

router.delete("/me/friends/:userId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.friendship.deleteMany({ where: { senderId: req.user!.id, receiverId: req.params.userId } });
  res.json({ ok: true });
}));

export default router;
