export type StoryWidgetType = 'pulse' | 'focus' | 'health' | 'tasks' | 'nutrition';

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
  createdAt: string;
  expiresAt: string;
  author: StoryAuthor;
  viewedByMe: boolean;
  viewsCount: number;
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
  viewer: StoryAuthor;
};
