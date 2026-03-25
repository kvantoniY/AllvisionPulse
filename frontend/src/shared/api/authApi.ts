import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { User } from '@/shared/types/models';

type AuthResponse = { user: Pick<User, 'id' | 'username' | 'email' | 'role'>; tokens: { access: string; refresh: string } };

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery,
  tagTypes: ['Me'],
  endpoints: (build) => ({
    login: build.mutation<{ user: AuthResponse['user'] }, { login: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    register: build.mutation<{ user: AuthResponse['user'] }, { email?: string; username: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    logout: build.mutation<{ ok: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
    changePassword: build.mutation<{ ok: boolean }, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/backend/auth/password', method: 'POST', body }),
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation, useLogoutMutation, useChangePasswordMutation } = authApi;
