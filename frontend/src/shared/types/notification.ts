export type NotificationActor = {
  id: string;
  username: string;
  avatarUrl?: string | null;
} | null;

export type AppNotification = {
  id: string;
  type: string;
  category: 'message' | 'social';
  title: string;
  message: string;
  href: string;
  imageUrl?: string | null;
  actor?: NotificationActor;
  createdAt: string;
  readAt: string | null;
  meta: Record<string, unknown>;
  push: {
    tag: string;
    requireInteraction: boolean;
    renotify: boolean;
  };
  seen?: boolean;
};

export type NotificationsResponse = {
  items: AppNotification[];
  nextCursor?: string | null;
};
