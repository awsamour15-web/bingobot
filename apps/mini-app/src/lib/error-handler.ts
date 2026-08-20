// Frontend Error Handler
// Provides user-friendly error messages and error tracking

export interface AppError {
  code: string;
  message: string;
  userMessage: string;
  statusCode?: number;
}

// ─── Error Message Mapper ────────────────────────────────────────────────────

const errorMessages: Record<string, string> = {
  // Network errors
  NETWORK_ERROR: 'የኢንተርኔት ግንኙነት ችግር አለ። እባክዎ ግንኙነትዎን ያረጋግጡ።\nNo internet connection. Check your network.',
  TIMEOUT: 'ጥያቄው ጊዜው አልፎበታል። እባክዎ እንደገና ይሞክሩ።\nRequest timed out. Try again.',
  
  // Authentication errors
  UNAUTHORIZED: 'እባክዎ እንደገና ይግቡ።\nPlease log in again.',
  FORBIDDEN: 'ይህን ማድረግ አይፈቀድም።\nYou don\'t have permission.',
  INVALID_TOKEN: 'የመግቢያ ጊዜዎ አልቋል። እባክዎ እንደገና ይግቡ።\nSession expired. Log in again.',
  
  // Resource errors
  NOT_FOUND: 'ተጠየቀው ነገር አልተገኘም።\nRequested resource not found.',
  ROUND_NOT_FOUND: 'ጨዋታው አልተገኘም።\nGame round not found.',
  
  // Validation errors
  VALIDATION_ERROR: 'የተሳሳተ መረጃ። እባክዎ ያረጋግጡ።\nInvalid input. Check your data.',
  INVALID_CARTELA: 'ካርቴላው ትክክል አይደለም።\nInvalid cartela selection.',
  
  // Business logic errors
  INSUFFICIENT_BALANCE: 'ቀሪ ሂሳብ አይበቃም! እባክዎ ገንዘብ ያስገቡ።\nInsufficient balance! Please deposit.',
  CARTELA_TAKEN: 'ይህ ካርቴላ ተወስዷል። እባክዎ ሌላ ይምረጡ።\nCartela already taken. Pick another.',
  ROUND_NOT_JOINABLE: 'ወደዚህ ጨዋታ መቀላቀል አይቻልም።\nCannot join this round.',
  PLAYER_SUSPENDED: 'መለያዎ ታግዷል። እባክዎ ድጋፍ ያግኙ።\nAccount suspended. Contact support.',
  MAX_CARTELAS_EXCEEDED: 'ከ2 ካርቴላ በላይ መምረጥ አይቻልም።\nMax 2 cartelas allowed.',
  
  // Server errors
  INTERNAL_ERROR: 'የሰርቨር ስህተት። እባክዎ ቆየት ብለው ይሞክሩ።\nServer error. Try again later.',
  DATABASE_ERROR: 'የውሂብ ጎታ ስህተት። እባክዎ ቆየት ብለው ይሞክሩ።\nDatabase error. Try again later.',
  EXTERNAL_SERVICE_ERROR: 'የውጭ አገልግሎት ስህተት። እባክዎ ቆየት ብለው ይሞክሩ።\nExternal service error. Try later.',
  
  // Rate limiting
  RATE_LIMIT: 'በጣም ብዙ ጥያቄዎች። እባክዎ ትንሽ ይጠብቁ።\nToo many requests. Wait a moment.',
};

// ─── Error Parser ────────────────────────────────────────────────────────────

export function parseError(error: unknown): AppError {
  // Network error
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network request failed',
      userMessage: errorMessages['NETWORK_ERROR'] || 'Network error',
    };
  }

  // API error response
  if (typeof error === 'object' && error !== null) {
    const apiError = error as { code?: string; message?: string; statusCode?: number };
    
    const code = apiError.code || 'INTERNAL_ERROR';
    const message = apiError.message || 'Unknown error';
    const userMessage = errorMessages[code] || message;

    return {
      code,
      message,
      userMessage,
      ...(apiError.statusCode !== undefined ? { statusCode: apiError.statusCode } : {}),
    };
  }

  // String error
  if (typeof error === 'string') {
    return {
      code: 'UNKNOWN',
      message: error,
      userMessage: error,
    };
  }

  // Generic Error object
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: error.message,
      userMessage: error.message,
    };
  }

  // Fallback
  return {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred',
    userMessage: 'የማይጠበቅ ስህተት ተከስቷል።\nAn unexpected error occurred.',
  };
}

// ─── Error Logger (for analytics/debugging) ──────────────────────────────────

interface ErrorLog {
  timestamp: string;
  code: string;
  message: string;
  url?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const errorLogs: ErrorLog[] = [];
const MAX_LOGS = 50; // Keep last 50 errors in memory

export const errorLogger = {
  log(error: AppError, metadata?: Record<string, unknown>): void {
    const log: ErrorLog = {
      timestamp: new Date().toISOString(),
      code: error.code,
      message: error.message,
      ...(window.location.href ? { url: window.location.href } : {}),
      ...(localStorage.getItem('userId') ? { userId: localStorage.getItem('userId')! } : {}),
      ...(metadata ? { metadata } : {}),
    };

    errorLogs.push(log);
    
    // Keep only last MAX_LOGS
    if (errorLogs.length > MAX_LOGS) {
      errorLogs.shift();
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ERROR]', log);
    }
  },

  getLogs(): ErrorLog[] {
    return [...errorLogs];
  },

  clear(): void {
    errorLogs.length = 0;
  },
};

// ─── Retry Helper ────────────────────────────────────────────────────────────

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {},
): Promise<T> {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < retries) {
        if (onRetry) onRetry(attempt + 1, error);
        
        const waitTime = delay * Math.pow(backoff, attempt);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}

// ─── Safe Async Wrapper ──────────────────────────────────────────────────────

/**
 * Wraps an async function to catch errors and return [error, result] tuple.
 * Usage: const [error, data] = await safeAsync(() => fetchData());
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
): Promise<[AppError | null, T | null]> {
  try {
    const result = await fn();
    return [null, result];
  } catch (error) {
    const appError = parseError(error);
    errorLogger.log(appError);
    return [appError, null];
  }
}

// ─── User-Friendly Error Display ─────────────────────────────────────────────

export function getErrorIcon(code: string): string {
  const icons: Record<string, string> = {
    NETWORK_ERROR: '📡',
    UNAUTHORIZED: '🔒',
    FORBIDDEN: '⛔',
    NOT_FOUND: '🔍',
    INSUFFICIENT_BALANCE: '💳',
    CARTELA_TAKEN: '🎫',
    PLAYER_SUSPENDED: '🚫',
    RATE_LIMIT: '⏱️',
    INTERNAL_ERROR: '⚠️',
    DATABASE_ERROR: '💾',
  };
  
  return icons[code] || '❌';
}

export function getErrorColor(code: string): string {
  if (code.includes('BALANCE') || code.includes('TAKEN')) {
    return '#f59e0b'; // Amber for business logic errors
  }
  if (code.includes('UNAUTHORIZED') || code.includes('FORBIDDEN')) {
    return '#f97316'; // Orange for auth errors
  }
  if (code.includes('NETWORK') || code.includes('TIMEOUT')) {
    return '#6366f1'; // Indigo for network errors
  }
  
  return '#ef4444'; // Red for general errors
}
