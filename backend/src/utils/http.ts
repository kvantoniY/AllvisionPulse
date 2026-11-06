
import { Request, Response, NextFunction } from "express";

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function pickErrorShape(err: any) {
  return {
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    details: err?.details,
    meta: err?.meta,
    stack: typeof err?.stack === 'string' ? err.stack : undefined,
  };
}

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Not found: ${req.method} ${req.path}`));
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err?.message === "BLOCKED" ? 403 : (err?.status ?? 500);
  const message = err?.message === "BLOCKED" ? "Blocked" : (err?.message ?? "Internal error");
  const details = err?.details;
  const requestMeta = {
    method: req.method,
    path: req.originalUrl || req.path,
    query: req.query,
    params: req.params,
    userId: (req as any)?.user?.id ?? null,
  };

  if (status >= 500) {
    console.error('[http:error]', safeJson({ request: requestMeta, error: pickErrorShape(err) }));
  } else {
    console.warn('[http:handled]', safeJson({ request: requestMeta, error: pickErrorShape(err) }));
  }

  res.status(status).json({
    error: {
      message,
      status,
      details,
      code: err?.code ?? null,
      meta: err?.meta ?? null,
      path: req.originalUrl || req.path,
      method: req.method,
    },
  });
}

// Обычные параметры маршрута должны быть строками, в отличие от wildcard-параметров Express 5.
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid route parameter: ' + name);
  return value;
}
