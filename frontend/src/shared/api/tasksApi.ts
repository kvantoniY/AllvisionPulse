import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { TaskItem } from '@/shared/types/models';

export const tasksApi = createApi({
  reducerPath: 'tasksApi',
  baseQuery,
  tagTypes: ['Task'],
  endpoints: (build) => ({
    getTasks: build.query<{ items: TaskItem[] }, { from?: string; to?: string } | void>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params?.from) search.set('from', params.from);
        if (params?.to) search.set('to', params.to);
        const suffix = search.toString() ? `?${search.toString()}` : '';
        return { url: `/backend/tasks${suffix}`, method: 'GET' };
      },
      providesTags: ['Task'],
    }),
    createTask: build.mutation<{ task: TaskItem }, { title: string; [key: string]: unknown }>({
      query: (body) => ({ url: '/backend/tasks', method: 'POST', body }),
      invalidatesTags: ['Task'],
    }),
    updateTask: build.mutation<{ task: TaskItem }, { taskId: string; body: Record<string, unknown> }>({
      query: ({ taskId, body }) => ({ url: `/backend/tasks/${taskId}`, method: 'PATCH', body }),
      invalidatesTags: ['Task'],
    }),
    toggleTask: build.mutation<{ task: TaskItem }, string>({
      query: (taskId) => ({ url: `/backend/tasks/${taskId}/toggle`, method: 'POST' }),
      invalidatesTags: ['Task'],
    }),
    deleteTask: build.mutation<{ ok: boolean }, string>({
      query: (taskId) => ({ url: `/backend/tasks/${taskId}`, method: 'DELETE' }),
      invalidatesTags: ['Task'],
    }),
  }),
});

export const { useGetTasksQuery, useCreateTaskMutation, useUpdateTaskMutation, useToggleTaskMutation, useDeleteTaskMutation } = tasksApi;
