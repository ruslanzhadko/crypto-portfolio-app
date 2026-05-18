import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, details } },
    { status: STATUS_BY_CODE[code] },
  );
}

export function handleZodError(err: ZodError): NextResponse<ApiErrorBody> {
  return apiError('BAD_REQUEST', 'Помилка валідації', err.flatten());
}

export function handleUnknown(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ZodError) return handleZodError(err);
  if (process.env.NODE_ENV === 'development') {
    console.error('[api] unhandled error:', err);
  }
  const message = err instanceof Error ? err.message : 'Невідома помилка';
  return apiError('INTERNAL_ERROR', message);
}
