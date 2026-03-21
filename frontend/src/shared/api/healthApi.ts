import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type { HealthDay } from '@/shared/types/models';

export const healthApi = createApi({
  reducerPath: 'healthApi',
  baseQuery,
  tagTypes: ['HealthDay'],
  endpoints: (build) => ({
    getToday: build.query<{ day: HealthDay | null }, void>({
      query: () => ({ url: '/backend/health/today', method: 'GET' }),
      providesTags: ['HealthDay'],
    }),
    getByDate: build.query<{ day: HealthDay | null }, string>({
      query: (date) => ({ url: `/backend/health/day/${date}`, method: 'GET' }),
      providesTags: ['HealthDay'],
    }),
    upsertCheckin: build.mutation<{ day: HealthDay }, {
      date?: string;
      sleepHours?: number | null;
      sleepQuality?: number | null;
      alcohol?: boolean;
      coffee?: boolean;
      wellbeing?: number | null;
      stress?: number | null;
      activity?: boolean;
      productivity?: number | null;
      nutrition?: number | null;
      smoking?: boolean;
      comment?: string | null;
    }>({
      query: (body) => ({ url: '/backend/health/checkin', method: 'PUT', body }),
      invalidatesTags: ['HealthDay'],
    }),
    deleteDay: build.mutation<{ ok: boolean }, string>({
      query: (date) => ({ url: `/backend/health/day/${date}`, method: 'DELETE' }),
      invalidatesTags: ['HealthDay'],
    }),
    getStats: build.query<any, number | void>({
      query: (days = 7) => ({ url: `/backend/health/stats?days=${days}`, method: 'GET' }),
    }),
  }),
});

export const {
  useGetTodayQuery,
  useGetByDateQuery,
  useUpsertCheckinMutation,
  useDeleteDayMutation,
  useGetStatsQuery,
} = healthApi;
