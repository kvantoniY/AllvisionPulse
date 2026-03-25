import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { CommentsResponse, FeedResponse, PostResponse } from '@/shared/types/social';

type FeedArg = { take?: number; cursor?: string | null } | void;

/**
 * RTK Query infinite feed cache:
 * - serializeQueryArgs => one cache entry for the whole feed
 * - merge => append pages
 * - forceRefetch => only refetch when cursor changes
 */
export const postsApi = createApi({
  reducerPath: 'postsApi',
  baseQuery,
  tagTypes: ['Feed', 'Post', 'Comments'],
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
        invalidatesTags: (_r, _e, arg) => arg.repostOfId ? [{ type: 'Post' as const, id: arg.repostOfId }] : [],
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
      invalidatesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }],
    }),

    likePost: build.mutation<{ ok: true }, { postId: string; userId?: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/like`, method: 'POST' }),
      async onQueryStarted({ postId, userId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
            const p = draft.items.find((x) => x.id === postId);
            if (!p) return;
            const likes = (p.likes ??= []);
            if (userId && !likes.some((l) => l.userId === userId)) likes.push({ userId });
            if (p._count) p._count.likes = (p._count.likes ?? 0) + 1;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, arg) => [{ type: 'Post', id: arg.postId }],
    }),

    unlikePost: build.mutation<{ ok: true }, { postId: string; userId?: string }>({
      query: ({ postId }) => ({ url: `/backend/posts/${encodeURIComponent(postId)}/like`, method: 'DELETE' }),
      async onQueryStarted({ postId, userId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
            const p = draft.items.find((x) => x.id === postId);
            if (!p) return;
            if (userId) p.likes = (p.likes ?? []).filter((l) => l.userId !== userId);
            if (p._count) p._count.likes = Math.max(0, (p._count.likes ?? 0) - 1);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
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

    createComment: build.mutation<{ comment: any }, { postId: string; text?: string; images?: File[]; widgetsJson?: any | null }>({
      query: ({ postId, text, images, widgetsJson }) => {
        const fd = new FormData();
        if (text != null) fd.set('text', text);
        if (widgetsJson != null) fd.set('widgetsJson', JSON.stringify(widgetsJson));
        for (const f of images ?? []) fd.append('images', f);
        return { url: `/backend/posts/${encodeURIComponent(postId)}/comments`, method: 'POST', body: fd };
      },
      async onQueryStarted({ postId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          const comment = data.comment;

          // Update comments cache for that post: prepend (since endpoint orders desc)
          dispatch(
            postsApi.util.updateQueryData('getComments', { postId } as any, (draft) => {
              draft.items.unshift(comment);
            }),
          );

          // Update feed post counts
          dispatch(
            postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
              const p = draft.items.find((x) => x.id === postId);
              if (p?._count) p._count.comments = (p._count.comments ?? 0) + 1;
            }),
          );

          // Update last comment cache
          dispatch(
            postsApi.util.upsertQueryData('getLastComment', { postId } as any, {
              items: [comment],
              nextCursor: null,
            } as any),
          );
        } catch {
          // ignore
        }
      },
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        { type: 'Comments', id: `last:${arg.postId}` },
        { type: 'Post', id: arg.postId },
      ],
    }),

    deleteComment: build.mutation<{ ok: true }, { commentId: string; postId: string }>({
      query: ({ commentId }) => ({ url: `/backend/posts/comments/${encodeURIComponent(commentId)}`, method: 'DELETE' }),
      async onQueryStarted({ commentId, postId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          postsApi.util.updateQueryData('getComments', { postId } as any, (draft) => {
            draft.items = draft.items.filter((c) => c.id !== commentId);
          }),
        );
        const patchFeed = dispatch(
          postsApi.util.updateQueryData('getFeed', undefined as any, (draft) => {
            const p = draft.items.find((x) => x.id === postId);
            if (p?._count) p._count.comments = Math.max(0, (p._count.comments ?? 0) - 1);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
          patchFeed.undo();
        }
      },
      invalidatesTags: (_r, _e, arg) => [
        { type: 'Comments', id: arg.postId },
        { type: 'Post', id: arg.postId },
        { type: 'Comments', id: `last:${arg.postId}` },
      ],
    }),
  }),
});

export const {
  useGetFeedQuery,
  useLazyGetFeedQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useDeletePostMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useGetPostLikesQuery,
  useGetCommentsQuery,
  useLazyGetCommentsQuery,
  useGetLastCommentQuery,
  useCreateCommentMutation,
  useDeleteCommentMutation,
} = postsApi;
