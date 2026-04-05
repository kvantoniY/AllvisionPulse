import { prisma } from "../db/prisma";
import { sendWebPushToUsers, type WebPushPayload } from "./webPush";

type StoredNotification = {
  id: string;
  userId: string;
  type: string;
  data: any;
  createdAt: Date | string;
  readAt?: Date | string | null;
};

type DeliveryActor = {
  id: string;
  username: string;
  avatarUrl?: string | null;
} | null;

export type SerializedNotification = {
  id: string;
  type: string;
  category: "message" | "social";
  title: string;
  message: string;
  href: string;
  imageUrl: string | null;
  actor: DeliveryActor;
  createdAt: string;
  readAt: string | null;
  meta: Record<string, unknown>;
  push: {
    tag: string;
    requireInteraction: boolean;
    renotify: boolean;
  };
};

type CallInviteInput = {
  chatId: string;
  callId: string;
  fromUserId: string;
  kind: "direct" | "group";
};

function textOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function truncateText(value: unknown, max = 92) {
  const source = textOrEmpty(value).replace(/\s+/g, " ");
  if (!source) return "";
  if (source.length <= max) return source;
  return `${source.slice(0, max - 3).trimEnd()}...`;
}

function messagePreview(message: { text?: string | null; type?: string | null; attachments?: any[] | null } | null | undefined) {
  if (!message) return "Новое сообщение";
  const text = truncateText(message.text, 96);
  if (text) return text;
  if ((message.attachments ?? []).length) return "Отправил вложение";
  if (message.type === "AUDIO") return "Голосовое сообщение";
  if (message.type === "VIDEO_NOTE") return "Видеосообщение";
  if (message.type === "SYSTEM") return "Обновление в чате";
  return "Новое сообщение";
}

function actorName(actor?: { username?: string | null } | null) {
  return textOrEmpty(actor?.username) || "Кто-то";
}

function buildSerializedNotification(args: {
  notification: StoredNotification;
  category: "message" | "social";
  title: string;
  message: string;
  href: string;
  actor?: DeliveryActor;
  imageUrl?: string | null;
  meta?: Record<string, unknown>;
  push?: Partial<SerializedNotification["push"]>;
}) {
  return {
    id: args.notification.id,
    type: args.notification.type,
    category: args.category,
    title: args.title,
    message: args.message,
    href: args.href,
    imageUrl: args.imageUrl ?? args.actor?.avatarUrl ?? null,
    actor: args.actor ?? null,
    createdAt: toIsoString(args.notification.createdAt) ?? new Date().toISOString(),
    readAt: toIsoString(args.notification.readAt) ?? null,
    meta: args.meta ?? {},
    push: {
      tag: args.push?.tag ?? `notification:${args.notification.id}`,
      requireInteraction: Boolean(args.push?.requireInteraction),
      renotify: Boolean(args.push?.renotify),
    },
  } satisfies SerializedNotification;
}

async function serializeMessageNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const chatId = textOrEmpty(data.chatId);
  const messageId = textOrEmpty(data.messageId);
  const fromUserId = textOrEmpty(data.fromUserId);

  const message = messageId
    ? await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
          attachments: true,
          chat: {
            include: {
              members: {
                where: { leftAt: null },
                include: { user: { select: { id: true, username: true } } },
              },
            },
          },
        },
      })
    : null;

  const sender =
    message?.sender ??
    (fromUserId
      ? await prisma.user.findUnique({
          where: { id: fromUserId },
          select: { id: true, username: true, avatarUrl: true },
        })
      : null);

  const chat =
    message?.chat ??
    (chatId
      ? await prisma.chat.findUnique({
          where: { id: chatId },
          include: {
            members: {
              where: { leftAt: null },
              include: { user: { select: { id: true, username: true } } },
            },
          },
        })
      : null);

  const preview = messagePreview(message);
  const chatTitle = chat?.type === "GROUP" ? textOrEmpty(chat.title) || "Групповой чат" : actorName(sender);
  const title = chat?.type === "GROUP" ? `Новое сообщение в чате «${chatTitle}»` : `Сообщение от ${actorName(sender)}`;
  const messageText = chat?.type === "GROUP" ? `${actorName(sender)}: ${preview}` : preview;

  return buildSerializedNotification({
    notification,
    category: "message",
    title,
    message: messageText,
    href: chatId ? `/messages/${chatId}` : "/messages",
    actor: sender
      ? {
          id: sender.id,
          username: sender.username,
          avatarUrl: sender.avatarUrl ?? null,
        }
      : null,
    meta: {
      chatId,
      messageId,
      fromUserId,
      chatType: chat?.type ?? null,
      chatTitle,
    },
  });
}

async function serializePostLikedNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const postId = textOrEmpty(data.postId);
  const actorId = textOrEmpty(data.byUserId);
  const [actor, post] = await Promise.all([
    actorId
      ? prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, username: true, avatarUrl: true },
        })
      : null,
    postId
      ? prisma.post.findUnique({
          where: { id: postId },
          select: { id: true, text: true },
        })
      : null,
  ]);

  const snippet = truncateText(post?.text, 96);
  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} оценил вашу публикацию`,
    message: snippet || "Откройте публикацию, чтобы посмотреть реакцию.",
    href: postId ? `/feed?post=${postId}` : "/feed",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: { postId },
  });
}

async function serializePostCommentedNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const postId = textOrEmpty(data.postId);
  const commentId = textOrEmpty(data.commentId);
  const actorId = textOrEmpty(data.byUserId);
  const [actor, comment] = await Promise.all([
    actorId
      ? prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, username: true, avatarUrl: true },
        })
      : null,
    commentId
      ? prisma.comment.findUnique({
          where: { id: commentId },
          select: { id: true, text: true },
        })
      : null,
  ]);

  const snippet = truncateText(comment?.text, 96);
  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} оставил комментарий к вашей публикации`,
    message: snippet || "Откройте публикацию, чтобы ответить на комментарий.",
    href: postId ? `/feed?post=${postId}` : "/feed",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: { postId, commentId },
  });
}

async function serializeCommentLikedNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const postId = textOrEmpty(data.postId);
  const commentId = textOrEmpty(data.commentId);
  const actorId = textOrEmpty(data.byUserId);
  const [actor, comment] = await Promise.all([
    actorId
      ? prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, username: true, avatarUrl: true },
        })
      : null,
    commentId
      ? prisma.comment.findUnique({
          where: { id: commentId },
          select: { id: true, text: true },
        })
      : null,
  ]);

  const snippet = truncateText(comment?.text, 96);
  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} оценил ваш комментарий`,
    message: snippet || "Откройте обсуждение, чтобы увидеть контекст реакции.",
    href: postId ? `/feed?post=${postId}` : "/feed",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: { postId, commentId },
  });
}

async function serializeFriendRequestNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const actorId = textOrEmpty(data.fromUserId);
  const actor = actorId
    ? await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, username: true, avatarUrl: true },
      })
    : null;

  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} хочет подписаться на вас`,
    message: "Откройте запросы в разделе подписок, чтобы принять или отклонить заявку.",
    href: "/friends?tab=requests",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: { followId: textOrEmpty(data.followId) },
    push: {
      requireInteraction: true,
      renotify: true,
    },
  });
}

async function serializeFriendAcceptedNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const actorId = textOrEmpty(data.byUserId) || textOrEmpty(data.fromUserId);
  const actor = actorId
    ? await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, username: true, avatarUrl: true },
      })
    : null;

  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} принял ваш запрос`,
    message: "Теперь вы можете общаться и переходить в профиль напрямую.",
    href: actor?.username ? `/profile/${actor.username}` : "/friends?tab=following",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: { followId: textOrEmpty(data.followId) },
  });
}

async function serializeArtifactActivityNotification(notification: StoredNotification) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const actorId = textOrEmpty(data.actorId);
  const artifactId = textOrEmpty(data.artifactId);
  const [actor, artifact] = await Promise.all([
    actorId
      ? prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, username: true, avatarUrl: true },
        })
      : null,
    artifactId
      ? prisma.pulseShareArtifact.findUnique({
          where: { id: artifactId },
          select: { id: true, title: true, originChatId: true },
        })
      : null,
  ]);

  const verb = textOrEmpty(data.verb);
  const titleByVerb: Record<string, string> = {
    accept: "принял карточку",
    accepted: "принял карточку",
    decline: "отклонил карточку",
    declined: "отклонил карточку",
    follow: "следит за карточкой",
    added: "добавил карточку в Pulse",
    completed: "завершил карточку",
    settled: "закрыл расчет по карточке",
  };

  return buildSerializedNotification({
    notification,
    category: "social",
    title: `${actorName(actor)} ${titleByVerb[verb] ?? "обновил карточку"}`,
    message: artifact?.title ? `«${truncateText(artifact.title, 96)}»` : "Откройте карточку, чтобы увидеть детали.",
    href: artifactId ? `/health/programs?share=${artifactId}` : artifact?.originChatId ? `/messages/${artifact.originChatId}` : "/health",
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          avatarUrl: actor.avatarUrl ?? null,
        }
      : null,
    meta: {
      artifactId,
      verb,
      originChatId: artifact?.originChatId ?? null,
    },
  });
}

export async function serializeNotification(notification: StoredNotification): Promise<SerializedNotification> {
  if (notification.type === "MESSAGE") return serializeMessageNotification(notification);
  if (notification.type === "POST_LIKED") return serializePostLikedNotification(notification);
  if (notification.type === "POST_COMMENTED") return serializePostCommentedNotification(notification);
  if (notification.type === "COMMENT_LIKED") return serializeCommentLikedNotification(notification);
  if (notification.type === "FRIEND_REQUEST") return serializeFriendRequestNotification(notification);
  if (notification.type === "FRIEND_ACCEPTED") return serializeFriendAcceptedNotification(notification);
  if (notification.type === "ARTIFACT_ACTIVITY") return serializeArtifactActivityNotification(notification);

  return buildSerializedNotification({
    notification,
    category: "social",
    title: "Новое уведомление",
    message: "Откройте центр уведомлений, чтобы увидеть подробности.",
    href: "/feed",
  });
}

function notificationToPushPayload(notification: SerializedNotification): WebPushPayload {
  return {
    kind: "notification",
    title: notification.title,
    message: notification.message,
    href: notification.href,
    iconUrl: notification.imageUrl,
    tag: notification.push.tag,
    requireInteraction: notification.push.requireInteraction,
    renotify: notification.push.renotify,
    meta: {
      notificationId: notification.id,
      type: notification.type,
      ...notification.meta,
    },
  };
}

export async function deliverNotification(app: { locals: Record<string, any> }, notification: StoredNotification) {
  const serialized = await serializeNotification(notification);
  const emitter = app.locals.emitter as any;
  emitter?.emitToUser(notification.userId, "notification:new", serialized);
  await sendWebPushToUsers([notification.userId], notificationToPushPayload(serialized));
  return serialized;
}

export async function createAndDeliverNotification(input: {
  app: { locals: Record<string, any> };
  userId: string;
  type: string;
  data: Record<string, unknown>;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type as any,
      data: input.data as any,
    },
  });
  await deliverNotification(input.app, notification);
  return notification;
}

export async function buildCallInvitePushPayload(input: CallInviteInput): Promise<WebPushPayload | null> {
  const [caller, chat] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.fromUserId },
      select: { id: true, username: true, avatarUrl: true },
    }),
    prisma.chat.findUnique({
      where: { id: input.chatId },
      select: { id: true, type: true, title: true },
    }),
  ]);

  if (!chat) return null;

  const chatTitle = chat.type === "GROUP" ? textOrEmpty(chat.title) || "Групповой чат" : "Личный чат";
  const callerDisplay = actorName(caller);

  return {
    kind: "incoming_call",
    title: input.kind === "group" ? `${callerDisplay} приглашает в звонок` : `${callerDisplay} звонит вам`,
    message:
      input.kind === "group"
        ? `Чат «${chatTitle}». Откройте приложение, чтобы подключиться к звонку.`
        : "Откройте приложение, чтобы принять или отклонить звонок.",
    href: `/messages/${input.chatId}`,
    iconUrl: caller?.avatarUrl ?? null,
    tag: `call:${input.callId}`,
    requireInteraction: true,
    renotify: true,
    actions: [{ action: "open", title: "Открыть" }],
    meta: {
      chatId: input.chatId,
      callId: input.callId,
      fromUserId: input.fromUserId,
      kind: input.kind,
    },
  };
}
