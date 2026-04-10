import type { Role } from './models';
import type { PulseShareEmbedArtifact } from '@/shared/lib/pulseShare';

export type ChatType = 'DIRECT' | 'GROUP';

export type ChatRole = 'CREATOR' | 'ADMIN' | 'MEMBER';

export type ChatMember = {
  id: string;
  userId: string;
  role: ChatRole;
  leftAt: string | null;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    role?: Role;
  };
};

export type Chat = {
  id: string;
  type: ChatType;
  title?: string | null;
  updatedAt: string;
  members: ChatMember[];
  pinnedMessageId?: string | null;
  lastMessage?: Message | null;
};

export type MessageAttachment = {
  id: string;
  url: string;
  type?: string;
  mime?: string;
  name?: string;
  size?: number;
  durationSec?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};


export type MessageMeta = {
  kind?: 'storyReply' | 'pulse_share';
  storyId?: string;
  storyAuthorId?: string;
  storyAuthorName?: string;
  storyImageUrl?: string;
  storyMediaType?: string;
  storyCreatedAt?: string;
  artifactId?: string;
  artifact?: PulseShareEmbedArtifact;
  media?: {
    kind?: 'audio' | 'video_note';
    durationSec?: number | null;
    width?: number | null;
    height?: number | null;
    source?: 'recorded' | 'upload';
  };
};

export type MessageRead = {
  id?: string;
  userId: string;
  createdAt?: string;
  readAt?: string;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  type?: string;
  text?: string | null;
  metaJson?: MessageMeta | null;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    role?: Role;
  };
  attachments?: MessageAttachment[];
  reads?: MessageRead[];
  replyToId?: string | null;
  replyTo?: Message | null;
  forwardOfId?: string | null;
  forwardOf?: Message | null;
};

export type ChatPulseHistoryItem = {
  id: string;
  createdAt: string;
  title?: string | null;
  description?: string | null;
  kind: string;
  mode: string;
  actionType?: string | null;
  sourceType: string;
  owner?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
  artifact: PulseShareEmbedArtifact;
};
