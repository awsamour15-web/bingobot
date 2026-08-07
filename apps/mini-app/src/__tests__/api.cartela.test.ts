// Feature: indexdb-cartela-sound, Property 7: Cartela cache hit avoids API call
// Validates: Requirements 3.1

import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as idb from '../lib/idb';
import * as api from '../lib/api';

// Ensure localStorage is available in the test environment
function setupLocalStorage() {
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      },
      writable: true,
      configurable: true,
    });
  }
}

// ─── Property 7: Cartela cache hit avoids API call ──────────────────────────

describe('Property 7: Cartela cache hit avoids API call', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupLocalStorage();
    vi.clearAllMocks();
    // Stub global fetch so any accidental apiRequest call never makes real network calls
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns cached value without calling apiRequest when cartela is in IDB', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary roundId (UUID-like string)
        fc.uuid(),
        // Arbitrary cartelaNumber (1-800 per spec context)
        fc.integer({ min: 1, max: 800 }),
        // Arbitrary grid (25 numbers for a 5x5 bingo card)
        fc.array(fc.integer({ min: 1, max: 75 }), { minLength: 25, maxLength: 25 }),
        async (roundId, cartelaNumber, grid) => {
          // Reset mocks between iterations (but don't restore fetchSpy — just reset call history)
          fetchSpy.mockClear();
          vi.spyOn(idb, 'idbGet').mockRestore?.();
          vi.spyOn(idb, 'idbPut').mockRestore?.();

          // Setup: create the cached value that idbGet should return
          const cachedValue = { cartela_number: cartelaNumber, grid };

          // Mock idbGet to return the cached value
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(cachedValue);

          // Call the function under test
          const result = await api.getCartelaGridCached(roundId, cartelaNumber);

          // Assert: idbGet was called with correct parameters
          const expectedKey = `${roundId}:${cartelaNumber}`;
          if (!idbGetSpy.mock.calls.some(call =>
            call[0] === 'cartelas' && call[1] === expectedKey
          )) {
            return false;
          }

          // Assert: fetch was NOT called (cache hit — no API request needed!)
          if (fetchSpy.mock.calls.length > 0) {
            return false;
          }

          // Assert: result matches the cached value
          if (result.cartela_number !== cachedValue.cartela_number) {
            return false;
          }
          if (result.grid.length !== cachedValue.grid.length) {
            return false;
          }
          for (let i = 0; i < result.grid.length; i++) {
            if (result.grid[i] !== cachedValue.grid[i]) {
              return false;
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 8: Cartela cache miss fetches and writes ─────────────────────
// Feature: indexdb-cartela-sound, Property 8: Cartela cache miss fetches and writes
// Validates: Requirements 3.2

describe('Property 8: Cartela cache miss fetches and writes', () => {
  beforeEach(() => {
    setupLocalStorage();
    vi.clearAllMocks();
  });

  it('calls apiRequest and idbPut when cartela is not in IDB', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary roundId (UUID-like string)
        fc.uuid(),
        // Arbitrary cartelaNumber (1-800)
        fc.integer({ min: 1, max: 800 }),
        // Arbitrary grid (25 numbers for a 5x5 bingo card)
        fc.array(fc.integer({ min: 1, max: 75 }), { minLength: 25, maxLength: 25 }),
        async (roundId, cartelaNumber, grid) => {
          // Setup: the value the API will return on cache miss
          const apiValue = { cartela_number: cartelaNumber, grid };

          // Mock idbGet to return undefined (cache miss)
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(undefined);

          // Mock idbPut to track calls without hitting real IndexedDB
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);

          // Mock global fetch so apiRequest returns a controlled response
          // This is the correct level to mock — apiRequest internally calls fetch
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => apiValue,
          } as Response);

          // Call the function under test
          const result = await api.getCartelaGridCached(roundId, cartelaNumber);

          // Allow the fire-and-forget idbPut promise to settle
          await Promise.resolve();

          const expectedKey = `${roundId}:${cartelaNumber}`;
          const expectedPath = `/api/rounds/${roundId}/cartelas/${cartelaNumber}/grid`;

          // Assert: idbGet was called with the correct cache key
          const idbGetCalled = idbGetSpy.mock.calls.some(call =>
            call[0] === 'cartelas' && call[1] === expectedKey
          );

          // Assert: fetch WAS called with the correct API path (cache miss!)
          const fetchCalled = fetchSpy.mock.calls.some(call => {
            const url = String(call[0]);
            return url.endsWith(expectedPath);
          });

          // Assert: idbPut WAS called with key and result (write-through)
          const idbPutCalled = idbPutSpy.mock.calls.some(call =>
            call[0] === 'cartelas' &&
            call[1] === expectedKey &&
            JSON.stringify(call[2]) === JSON.stringify(apiValue)
          );

          // Assert: returned value matches the API response
          const resultCorrect =
            result.cartela_number === apiValue.cartela_number &&
            result.grid.length === apiValue.grid.length &&
            result.grid.every((v, i) => v === apiValue.grid[i]);

          // Restore spies for next iteration
          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          // Debug: log which assertion failed
          if (!idbGetCalled) console.log('FAIL: idbGet not called correctly');
          if (!fetchCalled) console.log('FAIL: fetch not called correctly', fetchSpy.mock.calls);
          if (!idbPutCalled) console.log('FAIL: idbPut not called correctly', idbPutSpy.mock.calls);
          if (!resultCorrect) console.log('FAIL: result incorrect', result, apiValue);

          return idbGetCalled && fetchCalled && idbPutCalled && resultCorrect;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: Cartela API failure produces no store write ──────────────
// Feature: indexdb-cartela-sound, Property 9: Cartela API failure produces no store write
// Validates: Requirements 3.3

describe('Property 9: Cartela API failure produces no store write', () => {
  beforeEach(() => {
    setupLocalStorage();
    vi.clearAllMocks();
  });

  it('propagates error and does not call idbPut when API request fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary roundId (UUID-like string)
        fc.uuid(),
        // Arbitrary cartelaNumber (1-800)
        fc.integer({ min: 1, max: 800 }),
        async (roundId, cartelaNumber) => {
          // Clean up any leftover mocks from previous iterations
          vi.clearAllMocks();
          
          // Mock idbGet to return undefined (cache miss)
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(undefined);

          // Mock idbPut to track calls
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);

          // Mock fetch to return a non-ok response (API failure)
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ message: 'Server error' }),
          } as Response);

          let errorThrown = false;
          try {
            await api.getCartelaGridCached(roundId, cartelaNumber);
          } catch {
            errorThrown = true;
          }

          // Allow any pending promises to settle
          await Promise.resolve();
          await Promise.resolve();

          // Assert: idbPut was NOT called (no partial write on API failure)
          const idbPutCalled = idbPutSpy.mock.calls.length > 0;

          // Restore spies
          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          return errorThrown && !idbPutCalled;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 10: getMyCartelas write-through ─────────────────────────────
// Feature: indexdb-cartela-sound, Property 10: getMyCartelas write-through
// Validates: Requirements 3.4, 3.5

describe('Property 10: getMyCartelas write-through', () => {
  beforeEach(() => {
    setupLocalStorage();
    vi.clearAllMocks();
  });

  it('calls idbPut exactly k times with correct keys and value shapes for k cartelas', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary roundId (UUID-like string)
        fc.uuid(),
        // Arbitrary cartela list of size k (0-20) with unique cartelaNumbers (as in real rounds)
        // and arbitrary 25-element grids
        fc.uniqueArray(
          fc.record({
            cartelaNumber: fc.integer({ min: 1, max: 800 }),
            cartelaGrid: fc.array(fc.integer(), { minLength: 25, maxLength: 25 }),
          }),
          { minLength: 0, maxLength: 20, selector: c => c.cartelaNumber },
        ),
        async (roundId, cartelas) => {
          const k = cartelas.length;
          const apiResponse = { cartelas };

          // Stub idbPut to track calls
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);

          // Stub fetch (apiRequest uses it internally)
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => apiResponse,
          } as Response);

          // Call the function under test
          const result = await api.getMyCartelas(roundId);

          // Allow the fire-and-forget idbPut promises to settle
          await Promise.resolve();
          await Promise.resolve();

          // Assert: idbPut was called exactly k times
          const callCount = idbPutSpy.mock.calls.length;
          if (callCount !== k) {
            idbPutSpy.mockRestore();
            fetchSpy.mockRestore();
            return false;
          }

          // Assert: each call has correct store, key, and value shape
          for (const c of cartelas) {
            const expectedKey = `${roundId}:${c.cartelaNumber}`;
            const expectedValue = { cartela_number: c.cartelaNumber, grid: c.cartelaGrid };

            const matchingCall = idbPutSpy.mock.calls.find(call =>
              call[0] === 'cartelas' &&
              call[1] === expectedKey
            );

            if (!matchingCall) {
              idbPutSpy.mockRestore();
              fetchSpy.mockRestore();
              return false;
            }

            const storedValue = matchingCall[2] as { cartela_number: number; grid: number[] };

            // Assert value shape: { cartela_number: number, grid: number[] }
            if (
              typeof storedValue !== 'object' ||
              storedValue === null ||
              typeof storedValue.cartela_number !== 'number' ||
              !Array.isArray(storedValue.grid)
            ) {
              idbPutSpy.mockRestore();
              fetchSpy.mockRestore();
              return false;
            }

            // Assert correct values
            if (storedValue.cartela_number !== expectedValue.cartela_number) {
              idbPutSpy.mockRestore();
              fetchSpy.mockRestore();
              return false;
            }

            if (storedValue.grid.length !== expectedValue.grid.length) {
              idbPutSpy.mockRestore();
              fetchSpy.mockRestore();
              return false;
            }

            for (let i = 0; i < storedValue.grid.length; i++) {
              if (storedValue.grid[i] !== expectedValue.grid[i]) {
                idbPutSpy.mockRestore();
                fetchSpy.mockRestore();
                return false;
              }
            }
          }

          // Assert: the result returned is the full API response
          if (result.cartelas.length !== k) {
            idbPutSpy.mockRestore();
            fetchSpy.mockRestore();
            return false;
          }

          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
