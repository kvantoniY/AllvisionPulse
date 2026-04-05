import { BaseQueryFn, FetchArgs, FetchBaseQueryError, createApi } from '@reduxjs/toolkit/query/react';
import { logApiError } from '@/shared/lib/apiError';
import { baseQuery } from './baseQuery';

const loggingBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result.error) {
    const request = typeof args === 'string' ? { url: args, method: 'GET' } : { url: args.url, method: args.method ?? 'GET', params: args.params ?? null };
    logApiError('rtk-query', result.error, { endpoint: api.endpoint, request });
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: loggingBaseQuery,
  tagTypes: ['Me', 'HealthDay', 'Feed', 'Post', 'Comment', 'Requests', 'Friends', 'Chat', 'Message', 'Game', 'Story', 'Program', 'ProgramRun', 'ProgramSession', 'Achievement', 'ShareArtifact', 'Notification'],
  endpoints: () => ({}),
});
