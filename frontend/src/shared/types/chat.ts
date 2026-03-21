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
  };
};

export type Chat = {
  id: string;
  type: ChatType;
  title?: string | null;
  updatedAt: string;
  members: ChatMember[];
  pinnedMessageId?: string | null;
};

export type MessageAttachment = {
  id: string;
  url: string;
  type?: string;
  mime?: string;
  name?: string;
  size?: number;
  durationSec?: number | null;
};

export type MessageRead = {
  id: string;
  userId: string;
  createdAt: string;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  createdAt: string;
  deletedAt?: string | null;
  type?: string;
  text?: string | null;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  attachments?: MessageAttachment[];
  reads?: MessageRead[];
  replyToId?: string | null;
  replyTo?: Message | null;
};
