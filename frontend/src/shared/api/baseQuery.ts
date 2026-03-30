import { BaseQueryFn, FetchArgs, FetchBaseQueryError, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'include',
});

function shouldRetry(method: string, error?: FetchBaseQueryError) {
  if (method !== 'GET' || !error) return false;
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return true;
  return typeof error.status === 'number' && error.status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  const method = (typeof args === 'string' ? 'GET' : String(args.method ?? 'GET')).toUpperCase();

  let result = await rawBaseQuery(args, api, extraOptions);
  if (!shouldRetry(method, result.error)) return result;

  await sleep(350);
  result = await rawBaseQuery(args, api, extraOptions);
  return result;
};
