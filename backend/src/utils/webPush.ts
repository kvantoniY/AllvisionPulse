import webpush from "web-push";
import { prisma } from "../db/prisma";
import { getEnv } from "../config/env";

const env = getEnv();

export type WebPushPayload = {
  kind: "notification" | "incoming_call";
  title: string;
  message: string;
  href: string;
  iconUrl?: string | null;
  tag?: string;
  requireInteraction?: boolean;
  renotify?: boolean;
  actions?: Array<{ action: string; title: string }>;
  meta?: Record<string, unknown>;
};

type PushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  } | null;
};

let webPushReady = false;

export function isWebPushConfigured() {
  return Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY && env.WEB_PUSH_VAPID_SUBJECT);
}

export function getWebPushPublicKey() {
  return env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

function ensureWebPushConfigured() {
  if (!isWebPushConfigured() || webPushReady) return;
  webpush.setVapidDetails(
    env.WEB_PUSH_VAPID_SUBJECT,
    env.WEB_PUSH_VAPID_PUBLIC_KEY as string,
    env.WEB_PUSH_VAPID_PRIVATE_KEY as string,
  );
  webPushReady = true;
}

export async function upsertWebPushSubscription(input: {
  userId: string;
  subscription: PushSubscriptionInput;
  userAgent?: string | null;
}) {
  const endpoint = String(input.subscription.endpoint ?? "").trim();
  const p256dh = String(input.subscription.keys?.p256dh ?? "").trim();
  const auth = String(input.subscription.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid push subscription");
  }

  return prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: input.userId,
      endpoint,
      expirationTime:
        typeof input.subscription.expirationTime === "number" && Number.isFinite(input.subscription.expirationTime)
          ? new Date(input.subscription.expirationTime)
          : null,
      p256dh,
      auth,
      userAgent: input.userAgent ?? null,
    },
    update: {
      userId: input.userId,
      expirationTime:
        typeof input.subscription.expirationTime === "number" && Number.isFinite(input.subscription.expirationTime)
          ? new Date(input.subscription.expirationTime)
          : null,
      p256dh,
      auth,
      userAgent: input.userAgent ?? null,
      lastUsedAt: new Date(),
    },
  });
}

export async function deleteWebPushSubscription(input: { userId: string; endpoint: string }) {
  const endpoint = String(input.endpoint ?? "").trim();
  if (!endpoint) return { count: 0 };
  return prisma.webPushSubscription.deleteMany({
    where: {
      userId: input.userId,
      endpoint,
    },
  });
}

async function touchWebPushSubscription(endpoint: string) {
  await prisma.webPushSubscription.updateMany({
    where: { endpoint },
    data: { lastUsedAt: new Date() },
  });
}

async function removeWebPushSubscription(endpoint: string) {
  await prisma.webPushSubscription.deleteMany({
    where: { endpoint },
  });
}

export async function sendWebPushToUsers(userIds: string[], payload: WebPushPayload) {
  const targets = Array.from(new Set(userIds.map((userId) => String(userId ?? "").trim()).filter(Boolean)));
  if (!targets.length || !isWebPushConfigured()) return;

  ensureWebPushConfigured();

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: {
      userId: { in: targets },
    },
  });

  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime?.getTime() ?? null,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          body,
          {
            TTL: payload.kind === "incoming_call" ? 60 : 300,
            urgency: payload.kind === "incoming_call" ? "high" : "normal",
            topic: payload.tag,
          },
        );
        await touchWebPushSubscription(subscription.endpoint);
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          await removeWebPushSubscription(subscription.endpoint);
          return;
        }
        console.error("[web-push:send-error]", {
          endpoint: subscription.endpoint,
          statusCode,
          message: String(error?.message ?? error),
        });
      }
    }),
  );
}
