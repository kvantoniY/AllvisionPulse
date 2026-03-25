import type { User } from './models';

export type PostImage = { id: string; url: string };
export type Post = {
  id: string;
  authorId: string;
  author: User;
  text: string | null;
  widgetsJson?: any | null;
  images?: PostImage[];
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number; likes: number; reposts: number };
  likes?: { userId: string }[];
  repostOf?: Post | null;
};

export type CommentImage = { id: string; url: string };
export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  author: User;
  text: string | null;
  widgetsJson?: any | null;
  images?: CommentImage[];
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  _count?: { replies: number; likes: number };
  likes?: { userId: string }[];
};

export type FeedResponse = { items: Post[]; nextCursor: string | null };
export type PostResponse = { post: Post };
export type CommentsResponse = { items: Comment[]; nextCursor?: string | null };

export type FollowStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';
export type FollowRecord = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FollowStatus;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
};

export type FollowRequestsResponse = { incoming: FollowRecord[]; outgoing: FollowRecord[] };
export type FollowRelationship = {
  viewerToUser?: FollowRecord | null;
  userToViewer?: FollowRecord | null;
  isFollowing: boolean;
  followsYou: boolean;
  isMutual: boolean;
  outgoingRequest: boolean;
  incomingRequest: boolean;
  blockedByMe: boolean;
  blockedMe: boolean;
  isBlocked: boolean;
  canViewProfile: boolean;
  canMessage: boolean;
  canCall: boolean;
};
