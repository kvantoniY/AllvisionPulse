import { baseApi } from './baseApi';
import type { StoryItem, StoryRailItem, StoryViewerItem } from '@/shared/types/story';

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
    createStories: build.mutation<
      { items: StoryItem[] },
      { files: File[]; drafts: Array<Partial<StoryItem> & { itemsJson?: any }> }
    >({
      query: ({ files, drafts }) => {
        const form = new FormData();
        for (const file of files) form.append('files', file);
        form.append('draftsJson', JSON.stringify(drafts.map((draft) => ({
          durationMs: draft.durationMs ?? undefined,
          width: draft.width ?? undefined,
          height: draft.height ?? undefined,
          itemsJson: draft.itemsJson ?? undefined,
        }))));
        return { url: '/backend/stories', method: 'POST', body: form };
      },
      invalidatesTags: ['Story'],
    }),
    markStoryViewed: build.mutation<{ ok: boolean }, { storyId: string }>({
      query: ({ storyId }) => ({ url: `/backend/stories/${storyId}/view`, method: 'POST' }),
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
  useCreateStoriesMutation,
  useMarkStoryViewedMutation,
  useGetStoryViewersQuery,
  useDeleteStoryMutation,
} = storiesApi;
