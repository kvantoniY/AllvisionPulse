import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { User } from '@/shared/types/models';

export type UserSearchItem = Pick<User, 'id' | 'username' | 'avatarUrl' | 'bio' | 'lastSeenAt'>;

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
    getUserByUsername: build.query<{ user: User; relationship: any }, string>({
      query: (username) => ({ url: `/backend/users/${encodeURIComponent(username)}`, method: 'GET' }),
      providesTags: (result, error, username) => [{ type: 'User' as const, id: username }],
    }),
    updateProfile: build.mutation<{ user: Partial<User> }, { avatarUrl?: string | null; bio?: string | null }>({
      query: (body) => ({ url: '/backend/users/me/profile', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        try {
          const { data } = await queryFulfilled;
          // обновим /me
          dispatch(
            usersApi.util.updateQueryData('getMe', undefined, (draft) => {
              if (draft.user) Object.assign(draft.user, data.user);
            }),
          );
          // и профиль текущего юзера, если он открыт
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
        } catch {
          // ignore
        }
      },
    }),
    updatePrivacy: build.mutation<{ privacy: any }, Partial<User['privacy']>>({
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
  useUpdateProfileMutation,
  useUpdatePrivacyMutation,
} = usersApi;
