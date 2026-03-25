import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import type {
  PulseAnalytics,
  PulseConfig,
  PulseDebt,
  PulseFinanceCategory,
  PulseFinanceEntry,
  PulseFood,
  PulseGoalSuggestion,
  PulseHealthDay,
  PulseMeal,
  PulseMealItem,
  PulseOverview,
  PulseProfile,
  PulseSavingsGoal,
  PulseTaskGoal,
  PulseTaskItem,
  PulseWeightDelta,
} from '@/shared/types/pulse';

export const pulseApi = createApi({
  reducerPath: 'pulseApi',
  baseQuery,
  tagTypes: ['Pulse'],
  endpoints: (build) => ({
    getOverview: build.query<PulseOverview, string | void>({
      query: (date) => ({ url: `/backend/health/pulse/overview${date ? `?date=${date}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    getConfig: build.query<{ config: PulseConfig }, void>({
      query: () => ({ url: '/backend/health/pulse/config', method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    updateConfig: build.mutation<{ config: PulseConfig }, Partial<PulseConfig>>({
      query: (body) => ({ url: '/backend/health/pulse/config', method: 'PUT', body }),
      invalidatesTags: ['Pulse'],
    }),
    getProfile: build.query<{ profile: PulseProfile | null; suggestion: PulseGoalSuggestion; weightDelta: PulseWeightDelta }, void>({
      query: () => ({ url: '/backend/health/pulse/profile', method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    updateProfile: build.mutation<{ profile: PulseProfile; suggestion: PulseGoalSuggestion; weightDelta: PulseWeightDelta }, Partial<PulseProfile>>({
      query: (body) => ({ url: '/backend/health/pulse/profile', method: 'PUT', body }),
      invalidatesTags: ['Pulse'],
    }),
    getMentalDay: build.query<{ day: PulseHealthDay | null; autoProductivity: number; autoNutrition: number }, string | void>({
      query: (date) => ({ url: `/backend/health/pulse/mental/day${date ? `?date=${date}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    saveMentalDay: build.mutation<{ day: PulseHealthDay }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/mental/day', method: 'PUT', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateNutritionGoal: build.mutation<{ profile: PulseProfile; goal: PulseGoalSuggestion }, { dailyCalories: number; protein?: number | null; fat?: number | null; carbs?: number | null }>({
      query: (body) => ({ url: '/backend/health/pulse/nutrition/goal', method: 'PUT', body }),
      invalidatesTags: ['Pulse'],
    }),
    getNutrition: build.query<{
      meals: PulseMeal[];
      goal: PulseGoalSuggestion;
      profile: PulseProfile | null;
      totalCalories: number;
      totalProtein: number;
      totalFat: number;
      totalCarbs: number;
      remainingCalories: number | null;
      averageNutritionScore: number;
      targetWeight: number | null;
      recentItems: PulseMealItem[];
    }, string | void>({
      query: (date) => ({ url: `/backend/health/pulse/nutrition${date ? `?date=${date}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    addMeal: build.mutation<{ meal: PulseMeal }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/nutrition/meals', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateMeal: build.mutation<{ meal: PulseMeal }, { mealId: string; body: Record<string, unknown> }>({
      query: ({ mealId, body }) => ({ url: `/backend/health/pulse/nutrition/meals/${mealId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    deleteMeal: build.mutation<{ ok: boolean }, string>({
      query: (mealId) => ({ url: `/backend/health/pulse/nutrition/meals/${mealId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    searchFoods: build.query<{ items: PulseFood[] }, string | void>({
      query: (query) => ({ url: `/backend/health/pulse/nutrition/foods${query ? `?query=${encodeURIComponent(query)}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    createFood: build.mutation<{ food: PulseFood }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/nutrition/foods', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    getTasksDay: build.query<{ items: PulseTaskItem[]; summary: { total: number; completed: number; percent: number; productivityScore: number }; goals: PulseTaskGoal[] }, string | void>({
      query: (date) => ({ url: `/backend/health/pulse/tasks/day${date ? `?date=${date}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    createPulseTask: build.mutation<{ task: PulseTaskItem }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/tasks', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updatePulseTask: build.mutation<{ task: PulseTaskItem }, { taskId: string; body: Record<string, unknown> }>({
      query: ({ taskId, body }) => ({ url: `/backend/health/pulse/tasks/${taskId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    togglePulseTaskDate: build.mutation<{ completion: { id: string; completed: boolean } }, { taskId: string; date: string }>({
      query: ({ taskId, date }) => ({ url: `/backend/health/pulse/tasks/${taskId}/toggle-date`, method: 'POST', body: { date } }),
      invalidatesTags: ['Pulse'],
    }),
    deletePulseTask: build.mutation<{ ok: boolean }, string>({
      query: (taskId) => ({ url: `/backend/health/pulse/tasks/${taskId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    createPulseGoal: build.mutation<{ goal: PulseTaskGoal }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/tasks/goals', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updatePulseGoal: build.mutation<{ goal: PulseTaskGoal }, { goalId: string; body: Record<string, unknown> }>({
      query: ({ goalId, body }) => ({ url: `/backend/health/pulse/tasks/goals/${goalId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    deletePulseGoal: build.mutation<{ ok: boolean }, string>({
      query: (goalId) => ({ url: `/backend/health/pulse/tasks/goals/${goalId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    getFinanceOverview: build.query<{ overview: PulseOverview; entries: PulseFinanceEntry[]; goals: PulseSavingsGoal[]; debts: PulseDebt[]; categories: PulseFinanceCategory[] }, string | void>({
      query: (date) => ({ url: `/backend/health/pulse/finance/overview${date ? `?date=${date}` : ''}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
    createFinanceCategory: build.mutation<{ category: PulseFinanceCategory }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/finance/categories', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateFinanceCategory: build.mutation<{ category: PulseFinanceCategory }, { categoryId: string; body: Record<string, unknown> }>({
      query: ({ categoryId, body }) => ({ url: `/backend/health/pulse/finance/categories/${categoryId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    createFinanceEntry: build.mutation<{ entry: PulseFinanceEntry }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/finance/entries', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateFinanceEntry: build.mutation<{ entry: PulseFinanceEntry }, { entryId: string; body: Record<string, unknown> }>({
      query: ({ entryId, body }) => ({ url: `/backend/health/pulse/finance/entries/${entryId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    deleteFinanceEntry: build.mutation<{ ok: boolean }, string>({
      query: (entryId) => ({ url: `/backend/health/pulse/finance/entries/${entryId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    createSavingsGoal: build.mutation<{ goal: PulseSavingsGoal }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/finance/goals', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateSavingsGoal: build.mutation<{ goal: PulseSavingsGoal }, { goalId: string; body: Record<string, unknown> }>({
      query: ({ goalId, body }) => ({ url: `/backend/health/pulse/finance/goals/${goalId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    deleteSavingsGoal: build.mutation<{ ok: boolean }, string>({
      query: (goalId) => ({ url: `/backend/health/pulse/finance/goals/${goalId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    createDebt: build.mutation<{ debt: PulseDebt }, Record<string, unknown>>({
      query: (body) => ({ url: '/backend/health/pulse/finance/debts', method: 'POST', body }),
      invalidatesTags: ['Pulse'],
    }),
    updateDebt: build.mutation<{ debt: PulseDebt }, { debtId: string; body: Record<string, unknown> }>({
      query: ({ debtId, body }) => ({ url: `/backend/health/pulse/finance/debts/${debtId}`, method: 'PATCH', body }),
      invalidatesTags: ['Pulse'],
    }),
    deleteDebt: build.mutation<{ ok: boolean }, string>({
      query: (debtId) => ({ url: `/backend/health/pulse/finance/debts/${debtId}`, method: 'DELETE' }),
      invalidatesTags: ['Pulse'],
    }),
    getAnalytics: build.query<PulseAnalytics, number | void>({
      query: (days = 7) => ({ url: `/backend/health/pulse/analytics?days=${days}`, method: 'GET' }),
      providesTags: ['Pulse'],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetConfigQuery,
  useUpdateConfigMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useGetMentalDayQuery,
  useSaveMentalDayMutation,
  useUpdateNutritionGoalMutation,
  useGetNutritionQuery,
  useAddMealMutation,
  useUpdateMealMutation,
  useDeleteMealMutation,
  useSearchFoodsQuery,
  useCreateFoodMutation,
  useGetTasksDayQuery,
  useCreatePulseTaskMutation,
  useUpdatePulseTaskMutation,
  useTogglePulseTaskDateMutation,
  useDeletePulseTaskMutation,
  useCreatePulseGoalMutation,
  useUpdatePulseGoalMutation,
  useDeletePulseGoalMutation,
  useGetFinanceOverviewQuery,
  useCreateFinanceCategoryMutation,
  useUpdateFinanceCategoryMutation,
  useCreateFinanceEntryMutation,
  useUpdateFinanceEntryMutation,
  useDeleteFinanceEntryMutation,
  useCreateSavingsGoalMutation,
  useUpdateSavingsGoalMutation,
  useDeleteSavingsGoalMutation,
  useCreateDebtMutation,
  useUpdateDebtMutation,
  useDeleteDebtMutation,
  useGetAnalyticsQuery,
} = pulseApi;
