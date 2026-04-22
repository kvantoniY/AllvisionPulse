import { Prisma } from "@prisma/client";
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
let webPushStartupLogged = false;
let webPushMissingTableLogged = false;

const PLACEHOLDER_VAPID_TOKENS = [
  "replace_with",
  "change_me",
  "your_",
  "example",
];

function looksLikePlaceholder(value: string | undefined | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VAPID_TOKENS.some((token) => normalized.includes(token));
}

function looksLikeValidBase64UrlKey(value: string | undefined | null, expectedBytes: number) {
  if (!value) return false;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9\-_]+$/.test(normalized)) return false;
  // base64url length for N bytes is ceil(N*4/3); VAPID public key is 65 bytes (~87 chars),
  // private key is 32 bytes (~43 chars). We accept a small tolerance.
  const minChars = Math.floor((expectedBytes * 4) / 3) - 2;
  const maxChars = Math.ceil((expectedBytes * 4) / 3) + 2;
  return normalized.length >= minChars && normalized.length <= maxChars;
}

function isMissingWebPushSubscriptionTable(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2021") return false;
  if (error.meta?.modelName === "WebPushSubscription") return true;
  return String(error.meta?.table ?? "").includes("WebPushSubscription");
}

function logMissingWebPushSubscriptionTable() {
  if (webPushMissingTableLogged) return;
  webPushMissingTableLogged = true;
  console.warn(
    "[web-push] WebPushSubscription table is missing. Apply Prisma migration `20260405233000_add_web_push_subscriptions` (for example `prisma migrate deploy`) to enable push subscription storage.",
  );
}

export function isWebPushConfigured() {
  const pub = env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const priv = env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = env.WEB_PUSH_VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  if (looksLikePlaceholder(pub) || looksLikePlaceholder(priv)) return false;
  if (!looksLikeValidBase64UrlKey(pub, 65)) return false;
  if (!looksLikeValidBase64UrlKey(priv, 32)) return false;
  return true;
}

export function getWebPushPublicKey() {
  return env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

function logWebPushStartupStatus() {
  if (webPushStartupLogged) return;
  webPushStartupLogged = true;

  if (isWebPushConfigured()) {
    console.log("[web-push] VAPID keys configured — push notifications enabled");
    return;
  }

  const pub = env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const priv = env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const reasons: string[] = [];
  if (!pub) reasons.push("WEB_PUSH_VAPID_PUBLIC_KEY is empty");
  else if (looksLikePlaceholder(pub)) reasons.push("WEB_PUSH_VAPID_PUBLIC_KEY looks like a placeholder");
  else if (!looksLikeValidBase64UrlKey(pub, 65)) reasons.push("WEB_PUSH_VAPID_PUBLIC_KEY is not a valid base64url 65-byte key");
  if (!priv) reasons.push("WEB_PUSH_VAPID_PRIVATE_KEY is empty");
  else if (looksLikePlaceholder(priv)) reasons.push("WEB_PUSH_VAPID_PRIVATE_KEY looks like a placeholder");
  else if (!looksLikeValidBase64UrlKey(priv, 32)) reasons.push("WEB_PUSH_VAPID_PRIVATE_KEY is not a valid base64url 32-byte key");

  console.warn(
    "[web-push] DISABLED — push notifications will NOT be sent. Reasons:",
    reasons.join("; "),
    "— generate keys with `npx web-push generate-vapid-keys` and set WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY in your env.",
  );
}

logWebPushStartupStatus();

function ensureWebPushConfigured() {
  if (!isWebPushConfigured() || webPushReady) return;
  try {
    webpush.setVapidDetails(
      env.WEB_PUSH_VAPID_SUBJECT,
      env.WEB_PUSH_VAPID_PUBLIC_KEY as string,
      env.WEB_PUSH_VAPID_PRIVATE_KEY as string,
    );
    webPushReady = true;
  } catch (error) {
    console.error("[web-push] Failed to configure VAPID details:", error);
  }
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

  try {
    return await prisma.webPushSubscription.upsert({
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
  } catch (error) {
    if (isMissingWebPushSubscriptionTable(error)) {
      logMissingWebPushSubscriptionTable();
      return null;
    }
    throw error;
  }
}

export async function deleteWebPushSubscription(input: { userId: string; endpoint: string }) {
  const endpoint = String(input.endpoint ?? "").trim();
  if (!endpoint) return { count: 0 };
  try {
    return await prisma.webPushSubscription.deleteMany({
      where: {
        userId: input.userId,
        endpoint,
      },
    });
  } catch (error) {
    if (isMissingWebPushSubscriptionTable(error)) {
      logMissingWebPushSubscriptionTable();
      return { count: 0 };
    }
    throw error;
  }
}

async function touchWebPushSubscription(endpoint: string) {
  try {
    await prisma.webPushSubscription.updateMany({
      where: { endpoint },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    if (isMissingWebPushSubscriptionTable(error)) {
      logMissingWebPushSubscriptionTable();
      return;
    }
    throw error;
  }
}

async function removeWebPushSubscription(endpoint: string) {
  try {
    await prisma.webPushSubscription.deleteMany({
      where: { endpoint },
    });
  } catch (error) {
    if (isMissingWebPushSubscriptionTable(error)) {
      logMissingWebPushSubscriptionTable();
      return;
    }
    throw error;
  }
}

export async function sendWebPushToUsers(userIds: string[], payload: WebPushPayload) {
  const targets = Array.from(new Set(userIds.map((userId) => String(userId ?? "").trim()).filter(Boolean)));
  if (!targets.length) return;

  if (!isWebPushConfigured()) {
    console.warn("[web-push:skip] VAPID not configured — cannot send to", targets.length, "user(s)");
    return;
  }

  ensureWebPushConfigured();

  let subscriptions: Awaited<ReturnType<typeof prisma.webPushSubscription.findMany>>;
  try {
    subscriptions = await prisma.webPushSubscription.findMany({
      where: {
        userId: { in: targets },
      },
    });
  } catch (error) {
    if (isMissingWebPushSubscriptionTable(error)) {
      logMissingWebPushSubscriptionTable();
      return;
    }
    throw error;
  }

  if (!subscriptions.length) {
    console.warn("[web-push:skip] No saved subscriptions for target users:", targets);
    return;
  }

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
