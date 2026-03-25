import { baseApi } from './baseApi';
import type { StoryHighlight, StoryItem, StoryRailItem, StoryViewerItem } from '@/shared/types/story';

export const storiesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getStoriesRail: build.query<{ items: StoryRailItem[] }, void>({
      query: () => ({ url: '/backend/stories/rail', method: 'GET' }),
      providesTags: ['Story'],
    }),
    getUserStories: build.query<{ author: StoryItem['author'] | null; items: StoryItem[] }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/stories/user/${userId}`, method: 'GET' }),
      providesTags: (_res, _err, arg) => [{ type: 'Story', id: arg.userId }],
    }),
    getStoriesArchive: build.query<{ items: StoryItem[] }, void>({
      query: () => ({ url: '/backend/stories/archive', method: 'GET' }),
      providesTags: [{ type: 'Story', id: 'ARCHIVE' }],
    }),
    getStoryHighlights: build.query<{ items: StoryHighlight[] }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/stories/highlights/user/${userId}`, method: 'GET' }),
      providesTags: (_res, _err, arg) => [{ type: 'Story', id: `highlights:${arg.userId}` }],
    }),
    createHighlight: build.mutation<{ highlight: { id: string; title: string } }, { title: string }>({
      query: (body) => ({ url: '/backend/stories/highlights', method: 'POST', body }),
      invalidatesTags: ['Story'],
    }),
    updateHighlight: build.mutation<{ highlight: { id: string; title: string } }, { highlightId: string; title: string }>({
      query: ({ highlightId, title }) => ({ url: `/backend/stories/highlights/${highlightId}`, method: 'PATCH', body: { title } }),
      invalidatesTags: ['Story'],
    }),
    deleteHighlight: build.mutation<{ ok: boolean }, { highlightId: string }>({
      query: ({ highlightId }) => ({ url: `/backend/stories/highlights/${highlightId}`, method: 'DELETE' }),
      invalidatesTags: ['Story'],
    }),
    addStoryToHighlight: build.mutation<{ ok: boolean; highlightId?: string }, { storyId: string; highlightId?: string | null; title?: string | null }>({
      query: ({ storyId, ...body }) => ({ url: `/backend/stories/${storyId}/highlight`, method: 'POST', body }),
      invalidatesTags: ['Story'],
    }),
    removeStoryFromHighlight: build.mutation<{ ok: boolean }, { storyId: string; highlightId: string }>({
      query: ({ storyId, highlightId }) => ({ url: `/backend/stories/${storyId}/highlight/${highlightId}`, method: 'DELETE' }),
      invalidatesTags: ['Story'],
    }),
    createStories: build.mutation<
      { items: StoryItem[] },
      { files: File[]; drafts: Array<Partial<StoryItem> & { itemsJson?: any; sourceDurationMs?: number | null }>; highlightTarget?: { highlightId?: string | null; title?: string | null } | null }
    >({
      query: ({ files, drafts, highlightTarget }) => {
        const form = new FormData();
        for (const file of files) form.append('files', file);
        form.append('draftsJson', JSON.stringify(drafts.map((draft) => ({
          durationMs: draft.durationMs ?? undefined,
          width: draft.width ?? undefined,
          height: draft.height ?? undefined,
          itemsJson: draft.itemsJson ?? undefined,
          trimStartMs: draft.trimStartMs ?? undefined,
          trimEndMs: draft.trimEndMs ?? undefined,
          sourceDurationMs: draft.sourceDurationMs ?? undefined,
          transformJson: draft.transformJson ?? undefined,
        }))));
        if (highlightTarget) form.append('highlightTargetJson', JSON.stringify(highlightTarget));
        return { url: '/backend/stories', method: 'POST', body: form };
      },
      invalidatesTags: ['Story'],
    }),
    markStoryViewed: build.mutation<{ ok: boolean }, { storyId: string }>({
      query: ({ storyId }) => ({ url: `/backend/stories/${storyId}/view`, method: 'POST' }),
      invalidatesTags: ['Story'],
    }),
    reactToStory: build.mutation<{ ok: boolean; reaction?: string | null }, { storyId: string; emoji: string | null }>({
      query: ({ storyId, emoji }) => ({
        url: `/backend/stories/${storyId}/reaction`,
        method: 'POST',
        body: { emoji },
      }),
      invalidatesTags: ['Story'],
    }),
    getStoryViewers: build.query<{ count: number; items: StoryViewerItem[] }, { storyId: string }>({
      query: ({ storyId }) => ({ url: `/backend/stories/${storyId}/viewers`, method: 'GET' }),
      providesTags: (_res, _err, arg) => [{ type: 'Story', id: `viewers:${arg.storyId}` }],
    }),
    deleteStory: build.mutation<{ ok: boolean }, { storyId: string }>({
      query: ({ storyId }) => ({ url: `/backend/stories/${storyId}`, method: 'DELETE' }),
      invalidatesTags: ['Story'],
    }),
  }),
});

export const {
  useGetStoriesRailQuery,
  useGetUserStoriesQuery,
  useGetStoriesArchiveQuery,
  useGetStoryHighlightsQuery,
  useCreateHighlightMutation,
  useUpdateHighlightMutation,
  useDeleteHighlightMutation,
  useAddStoryToHighlightMutation,
  useRemoveStoryFromHighlightMutation,
  useCreateStoriesMutation,
  useMarkStoryViewedMutation,
  useReactToStoryMutation,
  useGetStoryViewersQuery,
  useDeleteStoryMutation,
} = storiesApi;
