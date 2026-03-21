import type { FieldError, FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import { z } from 'zod';

function isFieldError(value: unknown): value is FieldError {
  return Boolean(value) && typeof value === 'object' && 'type' in (value as FieldError);
}

function assignFieldError(target: Record<string, unknown>, path: readonly PropertyKey[], error: FieldError) {
  const segments = (path.length > 0 ? path : ['root']).map(String);
  let current = target;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (index === segments.length - 1) {
      if (!(segment in current)) {
        current[segment] = error;
      }
      return;
    }

    const next = current[segment];
    if (!next || typeof next !== 'object' || isFieldError(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
}

function toFieldErrors<TFieldValues extends FieldValues>(error: z.ZodError<TFieldValues>): FieldErrors<TFieldValues> {
  const fieldErrors: Record<string, unknown> = {};

  for (const issue of error.issues) {
    assignFieldError(fieldErrors, issue.path, {
      type: issue.code,
      message: issue.message,
    });
  }

  return fieldErrors as FieldErrors<TFieldValues>;
}

export function zodResolver<TFieldValues extends FieldValues>(schema: z.ZodType<TFieldValues>): Resolver<TFieldValues> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }

    return {
      values: {},
      errors: toFieldErrors(result.error),
    };
  };
}
