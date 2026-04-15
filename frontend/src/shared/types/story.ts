import type { Role } from '@/shared/types/models';

export type StoryWidgetType = 'pulse' | 'focus' | 'health' | 'tasks' | 'nutrition' | 'pulse_share';

export type StoryMediaTransform = {
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
  fitMode?: 'contain' | 'cover' | 'manual';
  backgroundFill?: string;
  blurFill?: boolean;
};

export type StoryEditorItem =
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      color?: string;
      fontSize?: number;
      align?: 'left' | 'center';
    }
  | {
      id: string;
      type: 'widget';
      x: number;
      y: number;
      w: number;
      h: number;
      widgetType: StoryWidgetType;
      title: string;
      payload: Record<string, unknown>;
      contentScale?: number;
    }
  | {
      id: string;
      type: 'image';
      x: number;
      y: number;
      w: number;
      h: number;
      src: string;
      radius?: number;
    };

export type StoryAuthor = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  role?: Role | null;
};

export type StoryItem = {
  id: string;
  authorId: string;
  mediaUrl: string;
  mediaType: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  itemsJson?: StoryEditorItem[] | null;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  transformJson?: StoryMediaTransform | null;
  createdAt: string;
  expiresAt: string;
  author: StoryAuthor;
  viewedByMe: boolean;
  myReaction?: string | null;
  viewsCount: number;
  highlightIds?: string[];
  archived?: boolean;
};

export type StoryRailItem = {
  author: StoryAuthor;
  totalStories: number;
  unviewedCount: number;
  hasUnviewed: boolean;
  viewed: boolean;
  isOwn: boolean;
  preview?: {
    mediaUrl: string;
    mediaType: string;
  } | null;
  lastCreatedAt: string;
  storyIds: string[];
};

export type StoryViewerItem = {
  id: string;
  viewedAt: string;
  reaction?: string | null;
  viewer: StoryAuthor;
};

export type StoryHighlight = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  count: number;
  cover?: {
    mediaUrl: string;
    mediaType: string;
  } | null;
  items: StoryItem[];
};
