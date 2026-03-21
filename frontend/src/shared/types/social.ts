import type { User } from './models';

export type PostImage = {
  id: string;
  url: string;
};

export type Post = {
  id: string;
  authorId: string;
  author: User;
  text: string | null;
  widgetsJson?: any | null;
  images?: PostImage[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    comments: number;
    likes: number;
    reposts: number;
  };
  likes?: { userId: string }[];
  repostOf?: Post | null;
};

export type CommentImage = {
  id: string;
  url: string;
};

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
  _count?: {
    replies: number;
    likes: number;
  };
  likes?: { userId: string }[];
};

export type FeedResponse = {
  items: Post[];
  nextCursor: string | null;
};

export type PostResponse = { post: Post };

export type CommentsResponse = {
  items: Comment[];
  nextCursor?: string | null;
};

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';

export type Friendship = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
};

export type FriendRequestsResponse = {
  incoming: Friendship[];
  outgoing: Friendship[];
};
