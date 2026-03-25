import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { FollowRecord, FollowRequestsResponse } from '@/shared/types/social';

export const friendsApi = createApi({
  reducerPath: 'friendsApi',
  baseQuery,
  tagTypes: ['Friends', 'Requests', 'Followers', 'Blacklist'],
  endpoints: (build) => ({
    getFriends: build.query<{ friends: FollowRecord[] }, void>({
      query: () => ({ url: '/backend/users/me/friends', method: 'GET' }),
      providesTags: ['Friends'],
    }),
    getFollowing: build.query<{ following: FollowRecord[] }, void>({
      query: () => ({ url: '/backend/users/me/following', method: 'GET' }),
      providesTags: ['Friends'],
    }),
    getFollowers: build.query<{ followers: FollowRecord[] }, void>({
      query: () => ({ url: '/backend/users/me/followers', method: 'GET' }),
      providesTags: ['Followers'],
    }),
    getFriendRequests: build.query<FollowRequestsResponse, void>({
      query: () => ({ url: '/backend/users/me/follow-requests', method: 'GET' }),
      providesTags: ['Requests'],
    }),
    sendFriendRequest: build.mutation<{ follow: FollowRecord }, { userId: string }>({
      query: (body) => ({ url: '/backend/users/me/follows', method: 'POST', body }),
      invalidatesTags: ['Requests', 'Friends', 'Followers'],
    }),
    acceptFriendRequest: build.mutation<{ follow: FollowRecord }, { friendshipId: string }>({
      query: ({ friendshipId }) => ({ url: `/backend/users/me/follows/${encodeURIComponent(friendshipId)}/accept`, method: 'POST' }),
      invalidatesTags: ['Friends', 'Requests', 'Followers'],
    }),
    declineFriendRequest: build.mutation<{ follow: FollowRecord }, { friendshipId: string }>({
      query: ({ friendshipId }) => ({ url: `/backend/users/me/follows/${encodeURIComponent(friendshipId)}/decline`, method: 'POST' }),
      invalidatesTags: ['Requests'],
    }),
    removeFriend: build.mutation<{ ok: true }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/users/me/follows/${encodeURIComponent(userId)}`, method: 'DELETE' }),
      invalidatesTags: ['Friends', 'Followers', 'Requests'],
    }),
    getBlacklist: build.query<{ blacklist: any[] }, void>({
      query: () => ({ url: '/backend/users/me/blacklist', method: 'GET' }),
      providesTags: ['Blacklist'],
    }),
    blockUser: build.mutation<{ ok: true }, { userId: string }>({
      query: (body) => ({ url: '/backend/users/me/blacklist', method: 'POST', body }),
      invalidatesTags: ['Blacklist', 'Friends', 'Followers', 'Requests'],
    }),
    unblockUser: build.mutation<{ ok: true }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/users/me/blacklist/${encodeURIComponent(userId)}`, method: 'DELETE' }),
      invalidatesTags: ['Blacklist'],
    }),
  }),
});

export const {
  useGetFriendsQuery,
  useGetFollowingQuery,
  useGetFollowersQuery,
  useGetFriendRequestsQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useRemoveFriendMutation,
  useGetBlacklistQuery,
  useBlockUserMutation,
  useUnblockUserMutation,
} = friendsApi;
