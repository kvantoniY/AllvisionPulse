import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { User } from '@/shared/types/models';
import type { AdminAnalyticsResponse } from '@/shared/types/analytics';

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery,
  tagTypes: ['AdminUsers', 'Me', 'User', 'AdminAnalytics'],
  endpoints: (build) => ({
    getAdminAnalytics: build.query<AdminAnalyticsResponse, void>({
      query: () => ({ url: '/backend/admin/analytics/overview', method: 'GET' }),
      providesTags: ['AdminAnalytics'],
    }),
    suspendUser: build.mutation<
      { ok: true; user: User },
      { userId: string; durationDays?: number | null; permanent?: boolean; reason?: string | null }
    >({
      query: ({ userId, ...body }) => ({ url: `/backend/admin/users/${userId}/suspend`, method: 'POST', body }),
      invalidatesTags: ['AdminUsers', 'Me', 'User', 'AdminAnalytics'],
    }),
    unsuspendUser: build.mutation<{ ok: true; user: User }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/admin/users/${userId}/unsuspend`, method: 'POST' }),
      invalidatesTags: ['AdminUsers', 'Me', 'User', 'AdminAnalytics'],
    }),
    deleteUserAsAdmin: build.mutation<{ ok: true }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/admin/users/${userId}`, method: 'DELETE' }),
      invalidatesTags: ['AdminUsers', 'Me', 'User', 'AdminAnalytics'],
    }),
  }),
});

export const {
  useGetAdminAnalyticsQuery,
  useSuspendUserMutation,
  useUnsuspendUserMutation,
  useDeleteUserAsAdminMutation,
} = adminApi;
