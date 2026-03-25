export function extractApiError(error: unknown) {
  const fallback = { message: 'Не удалось выполнить запрос', status: null as number | null, code: null as string | null, raw: error };

  if (!error || typeof error !== 'object') return fallback;

  const anyError = error as any;
  const payload = anyError?.data?.error ?? anyError?.error ?? anyError?.data ?? null;
  const message = payload?.message ?? anyError?.message ?? fallback.message;
  const status = typeof anyError?.status === 'number' ? anyError.status : typeof payload?.status === 'number' ? payload.status : null;
  const code = typeof payload?.code === 'string' ? payload.code : null;

  return {
    message: String(message),
    status,
    code,
    details: payload?.details ?? null,
    meta: payload?.meta ?? null,
    raw: error,
  };
}

export function logApiError(scope: string, error: unknown, extra?: Record<string, unknown>) {
  const normalized = extractApiError(error);
  console.error(`[api:${scope}]`, {
    ...extra,
    message: normalized.message,
    status: normalized.status,
    code: normalized.code,
    details: normalized.details ?? null,
    meta: normalized.meta ?? null,
    raw: normalized.raw,
  });
  return normalized;
}
