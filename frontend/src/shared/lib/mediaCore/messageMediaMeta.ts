import type { MessageAttachment, MessageMeta } from '@/shared/types/chat';

export type ChatMediaMetaKind = 'audio' | 'video_note';

export type ChatMessageMediaMeta = {
  kind?: ChatMediaMetaKind;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  source?: 'recorded' | 'upload';
};

function normalizeDuration(duration?: number | null) {
  if (!Number.isFinite(duration) || !duration || duration <= 0) return undefined;
  return Math.max(1, Math.round(duration));
}

export function createMessageMediaMeta(kind: ChatMediaMetaKind, durationSec?: number | null): MessageMeta {
  return {
    media: {
      kind,
      durationSec: normalizeDuration(durationSec) ?? null,
      source: 'recorded',
    },
  };
}

export function getAttachmentDurationSec(attachment?: MessageAttachment | null) {
  if (!attachment) return undefined;

  if (Number.isFinite(attachment.durationSec) && Number(attachment.durationSec) > 0) {
    return Number(attachment.durationSec);
  }

  if (Number.isFinite(attachment.durationMs) && Number(attachment.durationMs) > 0) {
    return Number(attachment.durationMs) / 1000;
  }

  return undefined;
}

export function getMessageMediaMeta(
  metaJson?: MessageMeta | null,
  attachment?: MessageAttachment | null,
): ChatMessageMediaMeta | null {
  const raw = (metaJson as MessageMeta | null | undefined)?.media;
  const attachmentDuration = getAttachmentDurationSec(attachment);
  const durationSec = normalizeDuration(raw?.durationSec ?? attachmentDuration);

  if (!raw && durationSec == null) {
    return null;
  }

  return {
    kind: raw?.kind,
    durationSec,
    width: raw?.width ?? null,
    height: raw?.height ?? null,
    source: raw?.source,
  };
}
