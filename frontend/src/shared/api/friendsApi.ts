import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { Friendship, FriendRequestsResponse } from '@/shared/types/social';

export const friendsApi = createApi({
  reducerPath: 'friendsApi',
  baseQuery,
  tagTypes: ['Friends', 'Requests'],
  endpoints: (build) => ({
    getFriends: build.query<{ friends: Friendship[] }, void>({
      query: () => ({ url: '/backend/users/me/friends', method: 'GET' }),
      providesTags: ['Friends'],
    }),
    getFriendRequests: build.query<FriendRequestsResponse, void>({
      query: () => ({ url: '/backend/users/me/friend-requests', method: 'GET' }),
      providesTags: ['Requests'],
    }),
    sendFriendRequest: build.mutation<Friendship, { userId: string }>({
      query: (body) => ({ url: '/backend/users/me/friends/request', method: 'POST', body }),
      invalidatesTags: ['Requests'],
    }),
    acceptFriendRequest: build.mutation<Friendship, { friendshipId: string }>({
      query: ({ friendshipId }) => ({ url: `/backend/users/me/friends/${encodeURIComponent(friendshipId)}/accept`, method: 'POST' }),
      invalidatesTags: ['Friends', 'Requests'],
    }),
    declineFriendRequest: build.mutation<Friendship, { friendshipId: string }>({
      query: ({ friendshipId }) => ({ url: `/backend/users/me/friends/${encodeURIComponent(friendshipId)}/decline`, method: 'POST' }),
      invalidatesTags: ['Requests'],
    }),
    removeFriend: build.mutation<{ ok: true }, { userId: string }>({
      query: ({ userId }) => ({ url: `/backend/users/me/friends/${encodeURIComponent(userId)}`, method: 'DELETE' }),
      invalidatesTags: ['Friends', 'Requests'],
    }),
  }),
});

export const {
  useGetFriendsQuery,
  useGetFriendRequestsQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useRemoveFriendMutation,
} = friendsApi;
