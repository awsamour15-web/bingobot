export interface AppError {
    code: string;
    message: string;
    userMessage: string;
    statusCode?: number;
}
export declare function parseError(error: unknown): AppError;
interface ErrorLog {
    timestamp: string;
    code: string;
    message: string;
    url?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}
export declare const errorLogger: {
    log(error: AppError, metadata?: Record<string, unknown>): void;
    getLogs(): ErrorLog[];
    clear(): void;
};
export declare function retryAsync<T>(fn: () => Promise<T>, options?: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (attempt: number, error: unknown) => void;
}): Promise<T>;
/**
 * Wraps an async function to catch errors and return [error, result] tuple.
 * Usage: const [error, data] = await safeAsync(() => fetchData());
 */
export declare function safeAsync<T>(fn: () => Promise<T>): Promise<[AppError | null, T | null]>;
export declare function getErrorIcon(code: string): string;
export declare function getErrorColor(code: string): string;
export {};
//# sourceMappingURL=error-handler.d.ts.map