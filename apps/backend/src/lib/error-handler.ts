// Centralized Error Handler
// Provides structured error logging, classification, and response formatting

import type { Request, Response, NextFunction } from 'express';

// ─── Error Types ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, 'RATE_LIMIT', message);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public originalError?: unknown) {
    super(500, 'DATABASE_ERROR', message, false); // Non-operational
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(503, 'EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, false);
  }
}

// ─── Error Logger ────────────────────────────────────────────────────────────

interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  statusCode?: number;
  path?: string;
  method?: string;
  userId?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export const errorLogger = {
  log(log: ErrorLog): void {
    const logLine = JSON.stringify({
      ...log,
      timestamp: new Date().toISOString(),
    });

    if (log.level === 'error') {
      console.error(`[ERROR] ${logLine}`);
    } else if (log.level === 'warn') {
      console.warn(`[WARN] ${logLine}`);
    } else {
      console.log(`[INFO] ${logLine}`);
    }
  },

  error(error: Error | AppError, req?: Request, metadata?: Record<string, unknown>): void {
    const isAppError = error instanceof AppError;
    
    this.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      code: isAppError ? error.code : 'UNKNOWN_ERROR',
      message: error.message,
      statusCode: isAppError ? error.statusCode : 500,
      path: req?.path,
      method: req?.method,
      userId: (req as any)?.user?.id,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      metadata,
    });
  },

  warn(code: string, message: string, metadata?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'warn',
      code,
      message,
      metadata,
    });
  },

  info(code: string, message: string, metadata?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      code,
      message,
      metadata,
    });
  },
};

// ─── Error Response Formatter ────────────────────────────────────────────────

function formatErrorResponse(error: Error | AppError, includeStack = false) {
  if (error instanceof AppError) {
    return {
      error: error.code,
      message: error.message,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
    };
  }

  // Unknown errors — don't leak internal details in production
  return {
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message,
    ...(includeStack && error.stack ? { stack: error.stack } : {}),
  };
}

// ─── Express Error Handler Middleware ────────────────────────────────────────

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log the error
  errorLogger.error(err, req);

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Send response
  const includeStack = process.env.NODE_ENV !== 'production';
  res.status(statusCode).json(formatErrorResponse(err, includeStack));
}

// ─── Async Route Handler Wrapper ─────────────────────────────────────────────

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Wraps async route handlers to catch errors and pass them to Express error middleware.
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Not Found Handler ───────────────────────────────────────────────────────

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
}

// ─── Unhandled Rejection & Exception Handlers ────────────────────────────────

export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason);
    errorLogger.error(
      reason instanceof Error ? reason : new Error(String(reason)),
      undefined,
      { type: 'unhandledRejection' },
    );
    // Don't exit in production — log and continue
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    errorLogger.error(error, undefined, { type: 'uncaughtException' });
    // Uncaught exceptions are serious — exit after logging
    process.exit(1);
  });
}

// ─── Prisma Error Parser ─────────────────────────────────────────────────────

export function parsePrismaError(error: unknown): AppError {
  const e = error as { code?: string; meta?: { target?: string[] }; message?: string };

  switch (e.code) {
    case 'P2002':
      // Unique constraint violation
      const target = e.meta?.target?.[0] || 'field';
      return new ConflictError(`Duplicate ${target}`);
    
    case 'P2025':
      // Record not found
      return new NotFoundError('Record');
    
    case 'P2003':
      // Foreign key constraint violation
      return new ValidationError('Invalid reference');
    
    case 'P2014':
      // Relation violation
      return new ConflictError('Cannot delete — related records exist');
    
    default:
      return new DatabaseError(
        e.message || 'Database operation failed',
        error,
      );
  }
}

// ─── Safe Async Execution Helper ─────────────────────────────────────────────

/**
 * Executes an async function with error handling.
 * Returns [error, result] tuple. If error occurred, result is null.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
): Promise<[Error | null, T | null]> {
  try {
    const result = await fn();
    return [null, result];
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), null];
  }
}
