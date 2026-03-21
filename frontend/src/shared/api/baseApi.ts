import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'include',
  }),
  tagTypes: ['Me', 'HealthDay', 'Feed', 'Post', 'Comment', 'Requests', 'Friends', 'Chat', 'Message'],
  endpoints: () => ({}),
});
