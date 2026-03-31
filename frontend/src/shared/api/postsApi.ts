import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { Comment, CommentsResponse, FeedResponse, PostResponse } from '@/shared/types/social';

type FeedArg = { take?: number; cursor?: string | null } | void;

function updatePostCommentCountEverywhere(
  dispatch: any,
  getState: () => unknown,
  postId: string,
  updater: (current: number) => number,
) {
  dispatch(
    postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
      const post = draft.items.find((item) => item.id === postId);
      if (post?._count) post._count.comments = updater(post._count.comments ?? 0);
    }),
  );

  const cachedUserPostsArgs = postsApi.util.selectCachedArgsForQuery(getState() as any, 'getUserPosts') as Array<{
    username: string;
    take?: number;
    cursor?: string | null;
  }>;

  for (const arg of cachedUserPostsArgs) {
    dispatch(
      postsApi.util.updateQueryData('getUserPosts', arg as any, (draft) => {
        const post = draft.items.find((item) => item.id === postId);
        if (post?._count) post._count.comments = updater(post._count.comments ?? 0);
      }),
    );
  }

  dispatch(
    postsApi.util.updateQueryData('getPost', { postId } as any, (draft) => {
      if (draft.post?._count) draft.post._count.comments = updater(draft.post._count.comments ?? 0);
    }),
  );
}


type PostDraftLikeTarget = {
  id: string;
  likes?: Array<{ userId: string }>;
  _count?: { likes?: number; comments?: number; reposts?: number };
};

function updatePostLikeEverywhere(
  dispatch: any,
  getState: () => unknown,
  postId: string,
  userId: string | undefined,
  direction: 'like' | 'unlike',
) {
  const applyLikePatch = (post?: PostDraftLikeTarget | null) => {
    if (!post) return;
    const likes = (post.likes ??= []);
    const hasLike = Boolean(userId && likes.some((item) => item.userId === userId));

    if (direction === 'like') {
      if (userId && !hasLike) likes.push({ userId });
      post._count ??= {};
      post._count.likes = userId && hasLike ? (post._count.likes ?? likes.length) : (post._count.likes ?? likes.length - 1) + 1;
      return;
    }

    if (userId) {
      post.likes = likes.filter((item) => item.userId !== userId);
    }
    post._count ??= {};
    const base = post._count.likes ?? likes.length;
    post._count.likes = Math.max(0, userId && hasLike ? base - 1 : base);
  };

  dispatch(
    postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
      applyLikePatch(draft.items.find((item) => item.id === postId) as any);
    }),
  );

  const cachedUserPostsArgs = postsApi.util.selectCachedArgsForQuery(getState() as any, 'getUserPosts') as Array<{
    username: string;
    take?: number;
    cursor?: string | null;
  }>;

  for (const arg of cachedUserPostsArgs) {
    dispatch(
      postsApi.util.updateQueryData('getUserPosts', arg as any, (draft) => {
        applyLikePatch(draft.items.find((item) => item.id === postId) as any);
      }),
    );
  }

  dispatch(
    postsApi.util.updateQueryData('getPost', { postId } as any, (draft) => {
      applyLikePatch(draft.post as any);
    }),
  );
}

/**
 * RTK Query infinite feed cache:
 * - serializeQueryArgs => one cache entry for the whole feed
 * - merge => append pages
 * - forceRefetch => only refetch when cursor changes
 */
export const postsApi = createApi({
  reducerPath: 'postsApi',
  baseQuery,
  tagTypes: ['Feed', 'Post', 'Comments', 'UserPosts'],
  endpoints: (build) => ({
    getFeed: build.query<FeedResponse, FeedArg>({
      query: (arg) => {
        const take = arg && typeof arg === 'object' && 'take' in arg && arg.take ? arg.take : 20;
        const cursor = arg && typeof arg === 'object' && 'cursor' in arg ? arg.cursor : null;
        const params = new URLSearchParams();
        params.set('take', String(take));
        if (cursor) params.set('cursor', cursor);
        return { url: `/backend/posts/feed?${params.toString()}`, method: 'GET' };
      },
      // keep one cache key for infinite scrolling
      serializeQueryArgs: ({ endpointName }) => endpointName,
      merge: (currentCache, newItems, { arg }) => {
        // If it's the first page request (no cursor), replace cache.
        const cursor = arg && typeof arg === 'object' && 'cursor' in arg ? arg.cursor : null;
        if (!cursor) {
          currentCache.items = newItems.items;
          currentCache.nextCursor = newItems.nextCursor;
          return;
        }
        const seen = new Set(currentCache.items.map((x) => x.id));
        for (const it of newItems.items) {
          if (!seen.has(it.id)) currentCache.items.push(it);
        }
        currentCache.nextCursor = newItems.nextCursor;
      },
      forceRefetch({ currentArg, previousArg }) {
        const cur = currentArg && typeof currentArg === 'object' && 'cursor' in currentArg ? currentArg.cursor : null;
        const prev = previousArg && typeof previousArg === 'object' && 'cursor' in previousArg ? previousArg.cursor : null;
        return cur !== prev;
      },
      providesTags: (result) =>
        result
          ? [
              { type: 'Feed' as const, id: 'LIST' },
              ...result.items.map((p) => ({ type: 'Post' as const, id: p.id })),
            ]
          : [{ type: 'Feed' as const, id: 'LIST' }],
    }),

    getUserPosts: build.query<FeedResponse, { username: string; take?: number; cursor?: string | null }>({
      query: ({ username, take = 20, cursor }) => {
        const params = new URLSearchParams();
        params.set('take', String(take));
        if (cursor) params.set('cursor', cursor);
        return { url: `/backend/users/${encodeURIComponent(username)}/posts?${params.toString()}`, method: 'GET' };
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.username}`,
      merge: (currentCache, newItems, { arg }) => {
        if (!arg.cursor) {
          currentCache.items = newItems.items;
          currentCache.nextCursor = newItems.nextCursor;
          return;
        }
        const seen = new Set(currentCache.items.map((x) => x.id));
        for (const it of newItems.items) {
          if (!seen.has(it.id)) currentCache.items.push(it);
        }
        currentCache.nextCursor = newItems.nextCursor;
      },
      forceRefetch({ currentArg, previousArg }) {
        return currentArg?.cursor !== previousArg?.cursor || currentArg?.username !== previousArg?.username;
      },
      providesTags: (result, _error, arg) =>
        result
          ? [
              { type: 'UserPosts' as const, id: 'LIST' },
              { type: 'UserPosts' as const, id: arg.username },
              ...result.items.map((p) => ({ type: 'Post' as const, id: p.id })),
            ]
          : [
              { type: 'UserPosts' as const, id: 'LIST' },
              { type: 'UserPosts' as const, id: arg.username },
            ],
    }),

    getPost: build.query<PostResponse, { postId: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}`, method: 'GET' }),
      providesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }],
    }),

    createPost: build.mutation<PostResponse, { text?: string; images?: File[]; widgetsJson?: any | null; repostOfId?: string | null }>(
      {
        query: ({ text, images, widgetsJson, repostOfId }) => {
          const fd = new FormData();
          if (text != null) fd.set('text', text);
          if (widgetsJson != null) fd.set('widgetsJson', JSON.stringify(widgetsJson));
          if (repostOfId) fd.set('repostOfId', repostOfId);
          for (const f of images ?? []) fd.append('images', f);
          return { url: '/backend/posts', method: 'POST', body: fd };
        },
        async onQueryStarted(arg, { dispatch, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled;
            dispatch(
              postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
                draft.items.unshift(data.post as any);
                if (arg.repostOfId) {
                  const target = draft.items.find((item) => item.id === arg.repostOfId);
                  if (target?._count) target._count.reposts = (target._count.reposts ?? 0) + 1;
                }
              }),
            );
          } catch {
          }
        },
        invalidatesTags: (_r, _e, arg) => [
          ...(arg.repostOfId ? [{ type: 'Post' as const, id: arg.repostOfId }] : []),
          { type: 'UserPosts' as const, id: 'LIST' },
        ],
      },
    ),

    updatePost: build.mutation<PostResponse, { postId: string; text?: string; images?: File[]; keepImageIds?: string[] }>(
      {
        query: ({ postId, text, images, keepImageIds }) => {
          const fd = new FormData();
          if (text != null) fd.set('text', text);
          for (const id of keepImageIds ?? []) fd.append('keepImageIds', id);
          for (const f of images ?? []) fd.append('images', f);
          return { url: `/backend/posts/${encodeURIComponent(postId)}`, method: 'PUT', body: fd };
        },
        invalidatesTags: (_r, _e, arg) => [
          { type: 'Post' as const, id: arg.postId },
          { type: 'Feed' as const, id: 'LIST' },
          { type: 'UserPosts' as const, id: 'LIST' },
        ],
      },
    ),

    deletePost: build.mutation<{ ok: true }, { postId: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}`, method: 'DELETE' }),
      async onQueryStarted({ postId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
            draft.items = draft.items.filter((p) => p.id !== postId);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }, { type: 'UserPosts' as const, id: 'LIST' }],
    }),

    likePost: build.mutation<{ ok: true }, { postId: string; userId?: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/like`, method: 'POST' }),
      async onQueryStarted({ postId, userId }, { dispatch, getState, queryFulfilled }) {
        updatePostLikeEverywhere(dispatch, getState, postId, userId, 'like');
        try {
          await queryFulfilled;
        } catch {
          updatePostLikeEverywhere(dispatch, getState, postId, userId, 'unlike');
        }
      },
      invalidatesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }],
    }),

    unlikePost: build.mutation<{ ok: true }, { postId: string; userId?: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/like`, method: 'DELETE' }),
      async onQueryStarted({ postId, userId }, { dispatch, getState, queryFulfilled }) {
        updatePostLikeEverywhere(dispatch, getState, postId, userId, 'unlike');
        try {
          await queryFulfilled;
        } catch {
          updatePostLikeEverywhere(dispatch, getState, postId, userId, 'like');
        }
      },
      invalidatesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }],
    }),


    getPostLikes: build.query<{ items: Array<{ id: string; username: string; avatarUrl?: string | null; role?: string; likedAt: string }> }, { postId: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/likes`, method: 'GET' }),
      providesTags: (_r, _e, arg) => [{ type: 'Post', id: `${arg.postId}:likes` }],
    }),

    // Comments
    getComments: build.query<CommentsResponse, { postId: string; take?: number; cursor?: string | null }>({
      query: ({ postId, take = 30, cursor }) => {
        const params = new URLSearchParams();
        params.set('take', String(take));
        if (cursor) params.set('cursor', cursor);
        return { url: `/backend/posts/${encodeURIComponent(postId)}/comments?${params.toString()}`, method: 'GET' };
      },
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.postId}`,
      merge: (currentCache, newItems, { arg }) => {
        if (!arg.cursor) {
          currentCache.items = newItems.items;
          currentCache.nextCursor = newItems.nextCursor ?? null;
          return;
        }
        const seen = new Set(currentCache.items.map((c) => c.id));
        for (const it of newItems.items) if (!seen.has(it.id)) currentCache.items.push(it);
        currentCache.nextCursor = newItems.nextCursor ?? null;
      },
      forceRefetch({ currentArg, previousArg }) {
        return currentArg?.cursor !== previousArg?.cursor;
      },
      providesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        { type: 'Post', id: arg.postId },
      ],
    }),

    getLastComment: build.query<CommentsResponse, { postId: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/comments?take=1`, method: 'GET' }),
      providesTags: (_r, _e, arg) => [{ type: 'Comments', id: `last:${arg.postId}` }],
    }),

    getCommentReplies: build.query<{ items: Comment[] }, { commentId: string }>({
      query: ({ commentId }) => ({ url: `/backend/posts/comments/${encodeURIComponent(commentId)}/replies`, method: 'GET' }),
      providesTags: (_r, _e, arg) => [{ type: 'Comments', id: `replies:${arg.commentId}` }],
    }),

    createComment: build.mutation<{ comment: Comment }, { postId: string; text?: string; images?: File[]; widgetsJson?: any | null; parentId?: string | null }>({
      query: ({ postId, text, images, widgetsJson, parentId }) => {
        const fd = new FormData();
        if (text != null) fd.set('text', text);
        if (widgetsJson != null) fd.set('widgetsJson', JSON.stringify(widgetsJson));
        if (parentId) fd.set('parentId', parentId);
        for (const f of images ?? []) fd.append('images', f);
        return { url: `/backend/posts/${encodeURIComponent(postId)}/comments`, method: 'POST', body: fd };
      },
      async onQueryStarted({ postId, parentId }, { dispatch, getState, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const comment = data.comment;

          if (!parentId) {
            dispatch(
              postsApi.util.updateQueryData('getComments', { postId } as any, (draft) => {
                draft.items.unshift(comment);
              }),
            );
          } else {
            dispatch(
              postsApi.util.updateQueryData('getComments', { postId } as any, (draft) => {
                const parent = draft.items.find((item) => item.id === parentId);
                if (parent?._count) parent._count.replies = (parent._count.replies ?? 0) + 1;
              }),
            );
            dispatch(
              postsApi.util.updateQueryData('getCommentReplies', { commentId: parentId } as any, (draft) => {
                draft.items.push(comment);
              }),
            );
          }

          updatePostCommentCountEverywhere(dispatch, getState, postId, (current) => current + 1);

          if (!parentId) {
            dispatch(
              postsApi.util.upsertQueryData('getLastComment', { postId } as any, {
                items: [comment],
                nextCursor: null,
              } as any),
            );
          }
        } catch {
          // ignore
        }
      },
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        { type: 'Comments', id: `last:${arg.postId}` },
        ...(arg.parentId ? [{ type: 'Comments' as const, id: `replies:${arg.parentId}` }] : []),
        { type: 'Post', id: arg.postId },
      ],
    }),


    likeComment: build.mutation<{ ok: true }, { commentId: string; postId: string; parentId?: string | null; userId?: string }>({
      query: ({ commentId }) => ({ url: `/backend/posts/comments/${encodeURIComponent(commentId)}/like`, method: 'POST' }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        ...(arg.parentId ? [{ type: 'Comments' as const, id: `replies:${arg.parentId}` }] : []),
      ],
    }),

    unlikeComment: build.mutation<{ ok: true }, { commentId: string; postId: string; parentId?: string | null; userId?: string }>({
      query: ({ commentId }) => ({ url: `/backend/posts/comments/${encodeURIComponent(commentId)}/like`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        ...(arg.parentId ? [{ type: 'Comments' as const, id: `replies:${arg.parentId}` }] : []),
      ],
    }),

    deleteComment: build.mutation<{ ok: true }, { commentId: string; postId: string; parentId?: string | null }>({
      query: ({ commentId }) => ({ url: `/backend/posts/comments/${encodeURIComponent(commentId)}`, method: 'DELETE' }),
      async onQueryStarted({ commentId, postId, parentId }, { dispatch, getState, queryFulfilled }) {
        const patch = dispatch(
          postsApi.util.updateQueryData('getComments', { postId } as any, (draft) => {
            if (parentId) {
              const parent = draft.items.find((c) => c.id === parentId);
              if (parent?._count) parent._count.replies = Math.max(0, (parent._count.replies ?? 0) - 1);
            } else {
              draft.items = draft.items.filter((c) => c.id !== commentId);
            }
          }),
        );
        const patchReplies = parentId
          ? dispatch(
              postsApi.util.updateQueryData('getCommentReplies', { commentId: parentId } as any, (draft) => {
                draft.items = draft.items.filter((c) => c.id !== commentId);
              }),
            )
          : null;
        updatePostCommentCountEverywhere(dispatch, getState, postId, (current) => Math.max(0, current - 1));
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
          patchReplies?.undo?.();
          updatePostCommentCountEverywhere(dispatch, getState, postId, (current) => current + 1);
        }
      },
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        ...(arg.parentId ? [{ type: 'Comments' as const, id: `replies:${arg.parentId}` }] : []),
        { type: 'Post', id: arg.postId },
        { type: 'Comments', id: `last:${arg.postId}` },
      ],
    }),
  }),
});

export const {
  useGetFeedQuery,
  useLazyGetFeedQuery,
  useGetUserPostsQuery,
  useLazyGetUserPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useGetPostLikesQuery,
  useGetCommentsQuery,
  useGetCommentRepliesQuery,
  useLazyGetCommentsQuery,
  useGetLastCommentQuery,
  useCreateCommentMutation,
  useLikeCommentMutation,
  useUnlikeCommentMutation,
  useDeleteCommentMutation,
} = postsApi;
