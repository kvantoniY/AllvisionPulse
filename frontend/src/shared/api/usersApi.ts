import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { User, UserPrivacy } from '@/shared/types/models';
import type { FollowRecord, FollowRelationship } from '@/shared/types/social';

export type UserSearchItem = Pick<User, 'id' | 'username' | 'avatarUrl' | 'bio' | 'lastSeenAt' | 'privacy'>;

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery,
  tagTypes: ['Me', 'User'],
  endpoints: (build) => ({
    getMe: build.query<{ user: User | null }, void>({
      query: () => ({ url: '/backend/users/me', method: 'GET' }),
      providesTags: ['Me'],
    }),
    searchUsers: build.query<{ users: UserSearchItem[] }, { q: string }>({
      query: ({ q }) => ({ url: `/backend/users/search?q=${encodeURIComponent(q)}`, method: 'GET' }),
    }),
    getUserByUsername: build.query<{ user: User; relationship: FollowRelationship }, string>({
      query: (username) => ({ url: `/backend/users/${encodeURIComponent(username)}`, method: 'GET' }),
      providesTags: (_result, _error, username) => [{ type: 'User' as const, id: username }],
    }),
    getUserConnections: build.query<{ canView: boolean; items: FollowRecord[] }, { username: string; tab: 'followers' | 'following' }>({
      query: ({ username, tab }) => ({ url: `/backend/users/${encodeURIComponent(username)}/connections?tab=${tab}`, method: 'GET' }),
    }),
    updateProfile: build.mutation<{ user: Partial<User> }, { avatarUrl?: string | null; bio?: string | null }>({
      query: (body) => ({ url: '/backend/users/me/profile', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled, getState }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            usersApi.util.updateQueryData('getMe', undefined, (draft) => {
              if (draft.user) Object.assign(draft.user, data.user);
            }),
          );
          const state: any = getState();
          const username = state?.usersApi?.queries
            ? Object.values(state.usersApi.queries)
                .map((q: any) => q?.originalArgs)
                .find((v: any) => typeof v === 'string')
            : null;
          if (typeof username === 'string') {
            dispatch(
              usersApi.util.updateQueryData('getUserByUsername', username, (draft) => {
                Object.assign(draft.user, data.user);
              }),
            );
          }
        } catch {}
      },
    }),
    updatePrivacy: build.mutation<{ privacy: UserPrivacy }, Partial<UserPrivacy>>({
      query: (body) => ({ url: '/backend/users/me/privacy', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
  }),
});

export const {
  useGetMeQuery,
  useSearchUsersQuery,
  useLazySearchUsersQuery,
  useGetUserByUsernameQuery,
  useGetUserConnectionsQuery,
  useUpdateProfileMutation,
  useUpdatePrivacyMutation,
} = usersApi;
