import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { User } from '@/shared/types/models';

type AuthResponse = { user: Pick<User, 'id' | 'username' | 'email' | 'role'>; tokens: { access: string; refresh: string } };
export type AuthSession = { id: string; createdAt: string; lastUsedAt: string; revokedAt?: string | null; userAgent?: string | null; ip?: string | null };

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery,
  tagTypes: ['Me', 'Session'],
  endpoints: (build) => ({
    login: build.mutation<{ user: AuthResponse['user'] }, { login: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Me', 'Session'],
    }),
    register: build.mutation<{ user: AuthResponse['user'] }, { email?: string; username: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Me', 'Session'],
    }),
    logout: build.mutation<{ ok: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me', 'Session'],
    }),
    changePassword: build.mutation<{ ok: boolean }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/backend/auth/password', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
    getSessions: build.query<{ sessions: AuthSession[]; currentSessionId?: string | null }, void>({
      query: () => ({ url: '/backend/auth/sessions', method: 'GET' }),
      providesTags: ['Session'],
    }),
    revokeSession: build.mutation<{ ok: boolean }, { sessionId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/auth/sessions/${sessionId}`, method: 'DELETE' }),
      invalidatesTags: ['Session'],
    }),
    revokeOtherSessions: build.mutation<{ ok: boolean; revokedCount: number }, void>({
      query: () => ({ url: '/backend/auth/sessions/revoke-others', method: 'POST' }),
      invalidatesTags: ['Session'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useChangePasswordMutation,
  useGetSessionsQuery,
  useRevokeSessionMutation,
  useRevokeOtherSessionsMutation,
} = authApi;
