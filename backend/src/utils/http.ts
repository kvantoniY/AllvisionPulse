
import { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Not found: ${req.method} ${req.path}`));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.message === "BLOCKED" ? 403 : (err?.status ?? 500);
  const message = err?.message === "BLOCKED" ? "Blocked" : (err?.message ?? "Internal error");
  const details = err?.details;
  res.status(status).json({ error: { message, status, details } });
}
