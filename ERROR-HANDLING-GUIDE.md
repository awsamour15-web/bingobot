# Error Handling System Guide

## Overview
Comprehensive error handling system with structured logging, user-friendly messages, and graceful degradation.

---

## Backend Error Handling

### Error Types (`apps/backend/src/lib/error-handler.ts`)

```typescript
// Custom error classes
- AppError              // Base class for all application errors
- ValidationError       // 400 - Invalid input
- UnauthorizedError     // 401 - Not authenticated
- ForbiddenError        // 403 - Not authorized
- NotFoundError         // 404 - Resource not found
- ConflictError         // 409 - Duplicate/conflict
- RateLimitError        // 429 - Too many requests
- DatabaseError         // 500 - DB operation failed
- ExternalServiceError  // 503 - External API failed
```

### Usage in Routes

#### Option 1: Throw Custom Errors
```typescript
import { NotFoundError, ValidationError } from '../lib/error-handler.js';

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  const round = await prisma.gameRound.findUnique({ where: { id } });
  if (!round) {
    throw new NotFoundError('Round'); // Automatically handled
  }
  
  res.json(round);
});
```

#### Option 2: Use asyncHandler Wrapper
```typescript
import { asyncHandler, NotFoundError } from '../lib/error-handler.js';

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const round = await prisma.gameRound.findUnique({ where: { id } });
  if (!round) throw new NotFoundError('Round');
  
  res.json(round);
}));
```

### Prisma Error Handling

```typescript
import { parsePrismaError } from '../lib/error-handler.js';

try {
  await prisma.player.create({ data: { ... } });
} catch (error) {
  throw parsePrismaError(error); // Converts Prisma errors to AppError
}
```

Common Prisma error codes:
- `P2002` → `ConflictError` (unique constraint)
- `P2025` → `NotFoundError` (record not found)
- `P2003` → `ValidationError` (foreign key violation)

### Error Logging

```typescript
import { errorLogger } from '../lib/error-handler.js';

// Log errors with context
errorLogger.error(error, req, { customField: 'value' });

// Log warnings
errorLogger.warn('RATE_LIMIT_APPROACHING', 'User nearing limit', { userId });

// Log info
errorLogger.info('PAYMENT_PROCESSED', 'Payment completed', { amount });
```

### Safe Async Execution

```typescript
import { safeAsync } from '../lib/error-handler.js';

const [error, result] = await safeAsync(async () => {
  return await someRiskyOperation();
});

if (error) {
  // Handle error
  console.error('Operation failed:', error);
  return;
}

// Use result safely
console.log('Success:', result);
```

---

## Frontend Error Handling

### Error Parsing (`apps/mini-app/src/lib/error-handler.ts`)

```typescript
import { parseError, errorLogger } from '../lib/error-handler';

try {
  await someApiCall();
} catch (error) {
  const appError = parseError(error);
  
  console.log(appError.code);        // ERROR_CODE
  console.log(appError.message);     // Technical message
  console.log(appError.userMessage); // Bilingual user-friendly message
  
  // Log for analytics
  errorLogger.log(appError, { context: 'additional data' });
}
```

### User-Friendly Error Messages

The system provides bilingual (Amharic/English) error messages:

```typescript
INSUFFICIENT_BALANCE: 'ቀሪ ሂሳብ አይበቃም! እባክዎ ገንዘብ ያስገቡ።\nInsufficient balance! Please deposit.'
CARTELA_TAKEN: 'ይህ ካርቴላ ተወስዷል። እባክዎ ሌላ ይምረጡ።\nCartela already taken. Pick another.'
NETWORK_ERROR: 'የኢንተርኔት ግንኙነት ችግር አለ። እባክዎ ግንኙነትዎን ያረጋግጡ።\nNo internet connection.'
```

### Error Display Helpers

```typescript
import { getErrorIcon, getErrorColor } from '../lib/error-handler';

const icon = getErrorIcon(appError.code);   // 💳, 🎫, ⚠️, etc.
const color = getErrorColor(appError.code); // #f59e0b, #ef4444, etc.
```

### React Error Boundary

Wrap your app with `ErrorBoundary` to catch rendering errors:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

Custom fallback UI:

```tsx
<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <h1>Oops! {error.message}</h1>
      <button onClick={reset}>Try Again</button>
    </div>
  )}
>
  <YourApp />
</ErrorBoundary>
```

### Retry with Exponential Backoff

```typescript
import { retryAsync } from '../lib/error-handler';

const data = await retryAsync(
  () => fetchSomeData(),
  {
    retries: 3,
    delay: 1000,      // Start with 1s
    backoff: 2,       // Double each retry (1s, 2s, 4s)
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}:`, error);
    }
  }
);
```

### Safe Async Wrapper

```typescript
import { safeAsync } from '../lib/error-handler';

const [error, data] = await safeAsync(() => fetchProfile());

if (error) {
  setErrorMessage(error.userMessage);
  return;
}

setProfile(data);
```

---

## API Client Error Handling

The API client (`apps/mini-app/src/lib/api.ts`) automatically:

1. **Retries failed requests** (up to 3 times with exponential backoff)
2. **Handles 401 errors** (clears session and redirects to login)
3. **Re-authenticates on stale tokens** (404 errors)
4. **Logs all errors** to the error logger
5. **Provides structured error objects** with code and message

Example error response:
```json
{
  "code": "INSUFFICIENT_BALANCE",
  "message": "Balance too low",
  "statusCode": 400
}
```

---

## Global Error Handlers

### Backend

Automatically set up in `apps/backend/src/index.ts`:

```typescript
import { setupGlobalErrorHandlers } from './lib/error-handler.js';

setupGlobalErrorHandlers(); // Catches unhandled rejections & exceptions
```

Handles:
- `unhandledRejection` - Logs and continues (production) or exits (dev)
- `uncaughtException` - Logs and exits (always fatal)

### Frontend

Browser errors are caught by:
1. **ErrorBoundary** - React rendering errors
2. **API client** - Network/HTTP errors
3. **Error logger** - Tracks last 50 errors in memory

---

## Error Response Format

### Backend API Response
```json
{
  "error": "INSUFFICIENT_BALANCE",
  "message": "Balance 50 Birr is less than required 100 Birr",
  "stack": "Error: ...\n at ..." // Only in development
}
```

### Frontend Parsed Error
```typescript
{
  code: "INSUFFICIENT_BALANCE",
  message: "Balance 50 Birr is less than required 100 Birr",
  userMessage: "ቀሪ ሂሳብ አይበቃም! እባክዎ ገንዘብ ያስገቡ።\nInsufficient balance! Please deposit.",
  statusCode: 400
}
```

---

## Best Practices

### ✅ Do

1. **Use custom error classes** instead of throwing generic `Error`
2. **Provide user-friendly messages** for client-facing errors
3. **Log errors with context** (user ID, request path, metadata)
4. **Use safeAsync** for risky operations
5. **Wrap components** with ErrorBoundary
6. **Add bilingual messages** for Ethiopian users

### ❌ Don't

1. **Don't leak sensitive data** in error messages (passwords, tokens)
2. **Don't swallow errors** without logging
3. **Don't show stack traces** in production to users
4. **Don't retry** non-idempotent operations (POST/DELETE) blindly
5. **Don't block UI** with error modals for non-critical errors

---

## Error Code Reference

| Code | Status | Description | User Action |
|------|--------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input | Fix input and retry |
| `UNAUTHORIZED` | 401 | Not logged in | Log in again |
| `FORBIDDEN` | 403 | No permission | Contact support |
| `NOT_FOUND` | 404 | Resource missing | Go back or refresh |
| `CONFLICT` | 409 | Duplicate entry | Choose different value |
| `RATE_LIMIT` | 429 | Too many requests | Wait and retry |
| `INTERNAL_ERROR` | 500 | Server error | Retry later |
| `DATABASE_ERROR` | 500 | DB operation failed | Retry later |
| `EXTERNAL_SERVICE_ERROR` | 503 | External API down | Retry later |
| `NETWORK_ERROR` | - | No internet | Check connection |
| `INSUFFICIENT_BALANCE` | 400 | Not enough funds | Deposit money |
| `CARTELA_TAKEN` | 409 | Already selected | Pick another |
| `PLAYER_SUSPENDED` | 403 | Account banned | Contact support |

---

## Monitoring & Debugging

### View Error Logs (Frontend)

```typescript
import { errorLogger } from './lib/error-handler';

// Get all logged errors
const logs = errorLogger.getLogs();
console.table(logs);

// Clear logs
errorLogger.clear();
```

### View Error Logs (Backend)

Errors are logged to stdout/stderr in JSON format:

```json
{
  "timestamp": "2026-08-20T18:30:00.000Z",
  "level": "error",
  "code": "DATABASE_ERROR",
  "message": "Connection refused",
  "statusCode": 500,
  "path": "/api/rounds/123",
  "method": "GET",
  "userId": "player-id",
  "stack": "Error: ...\n at ..."
}
```

Search logs on Render:
```bash
# Filter by error level
grep '"level":"error"' logs.txt

# Filter by code
grep '"code":"DATABASE_ERROR"' logs.txt

# Filter by user
grep '"userId":"player-id"' logs.txt
```

---

## Testing Error Handling

### Backend

```typescript
import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError } from '../lib/error-handler';

describe('Error handling', () => {
  it('throws NotFoundError for missing resource', async () => {
    await expect(getRound('invalid-id')).rejects.toThrow(NotFoundError);
  });
  
  it('returns proper error response', async () => {
    const error = new ValidationError('Invalid input', 'email');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
```

### Frontend

```typescript
import { describe, it, expect } from 'vitest';
import { parseError, getErrorIcon } from '../lib/error-handler';

describe('Error parsing', () => {
  it('parses API errors correctly', () => {
    const error = { code: 'NOT_FOUND', message: 'Round not found' };
    const parsed = parseError(error);
    
    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.userMessage).toContain('አልተገኘም');
  });
  
  it('returns correct icon for error type', () => {
    expect(getErrorIcon('INSUFFICIENT_BALANCE')).toBe('💳');
    expect(getErrorIcon('NETWORK_ERROR')).toBe('📡');
  });
});
```

---

## Deployment Notes

1. **Set NODE_ENV=production** on Render to:
   - Hide stack traces from API responses
   - Reduce error logging verbosity
   - Continue on unhandled rejections (instead of exiting)

2. **Monitor error rates** using Render logs or external services (Sentry, LogRocket)

3. **Add error alerting** for critical errors (>10 errors/min)

4. **Review error logs weekly** to identify patterns and fix root causes
