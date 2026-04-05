import { createHmac } from "crypto";

type TurnCredentialsParams = {
  userId: string;
  secret: string;
  host: string;
  port: number;
  ttlSec: number;
};

export type TurnCredentialsPayload = {
  enabled: true;
  realm: string;
  urls: string[];
  username: string;
  credential: string;
  ttlSec: number;
  expiresAt: string;
};

export function buildTurnCredentials({
  userId,
  secret,
  host,
  port,
  ttlSec,
}: TurnCredentialsParams): TurnCredentialsPayload {
  const expiresAtUnix = Math.floor(Date.now() / 1000) + Math.max(300, ttlSec);
  const username = `${expiresAtUnix}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  const endpoint = `${host.trim()}:${Math.max(1, port)}`;

  return {
    enabled: true,
    realm: host.trim(),
    urls: [
      `turn:${endpoint}?transport=udp`,
      `turn:${endpoint}?transport=tcp`,
    ],
    username,
    credential,
    ttlSec: Math.max(300, ttlSec),
    expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
  };
}
