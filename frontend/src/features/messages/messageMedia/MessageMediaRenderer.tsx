'use client';

import { memo } from 'react';
import type { Message } from '@/shared/types/chat';
import { AudioMessage } from '@/shared/ui/AudioMessage';
import { VideoRing } from '@/shared/ui/VideoRing';
import { getMessageMediaMeta } from '@/shared/lib/mediaCore/messageMediaMeta';

type MessageMediaRendererProps = {
  message: Message;
  mine: boolean;
  audioClassName?: string;
  videoClassName?: string;
  videoWrapClassName?: string;
};

function MessageMediaRendererComponent({
  message,
  mine,
  audioClassName,
  videoClassName,
  videoWrapClassName,
}: MessageMediaRendererProps) {
  const messageType = String(message.type ?? 'TEXT');
  if (messageType !== 'AUDIO' && messageType !== 'VIDEO_NOTE') {
    return null;
  }

  const attachment = message.attachments?.[0] ?? null;
  const meta = getMessageMediaMeta(message.metaJson, attachment);
  const duration = meta?.durationSec ?? undefined;
  const sending = Boolean((message as Message & { __pending?: boolean }).__pending);
  const mediaId = `${message.chatId}:${message.id}:${messageType}`;
  const tone = mine ? 'outgoing' : 'incoming';
  const fallbackTitle = messageType === 'AUDIO' ? 'Голосовое сообщение' : 'Видеосообщение';

  if (messageType === 'AUDIO') {
    return (
      <AudioMessage
        url={attachment?.url}
        duration={duration}
        mediaId={mediaId}
        sending={sending}
        tone={tone}
        title={fallbackTitle}
        className={audioClassName}
      />
    );
  }

  return (
    <div className={videoWrapClassName} data-message-interactive="true" aria-label={fallbackTitle}>
      <VideoRing
        src={attachment?.url}
        duration={duration}
        mediaId={mediaId}
        sending={sending}
        tone={tone}
        size="message"
        showProgress
        showTimePill
        showCenterControl
        align={mine ? 'end' : 'start'}
        className={videoClassName}
      />
    </div>
  );
}

export const MessageMediaRenderer = memo(MessageMediaRendererComponent);
