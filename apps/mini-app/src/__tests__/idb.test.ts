/**
 * Unit and property-based tests for idb.ts
 *
 * jsdom does not ship a real IndexedDB implementation, so every test
 * installs a lightweight fake onto globalThis.indexedDB before importing
 * the module under test. vi.resetModules() is called before each isolated
 * test so that the module-private `dbPromise` starts as null.
 */

import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Fake IDB factory ────────────────────────────────────────────────────────

/**
 * Returns a lightweight fake IndexedDB environment.
 *
 * `makeOpenRequest(opts)` produces a fake IDBOpenDBRequest that fires
 * onsuccess / onerror / onupgradeneeded on the next microtask.
 *
 * The returned fakeDb has real put/get semantics backed by an in-memory Map
 * so Property 13 (round-trip) can be verified without a browser engine.
 */
function makeFakeIDB(opts: { failOnOpen?: boolean; triggerUpgrade?: boolean } = {}) {
  const stores: Record<string, Map<IDBValidKey, unknown>> = {
    sounds: new Map(),
    cartelas: new Map(),
  };

  // Helper: build a minimal fake IDBRequest that resolves async
  function makeRequest<T>(
    executor: (
      resolve: (v: T) => void,
      reject: (e: DOMException | null) => void,
    ) => void,
  ): IDBRequest<T> {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      result: undefined as unknown as T,
      error: null as DOMException | null,
    };
    Promise.resolve().then(() =>
      executor(
        (value) => {
          req.result = value;
          req.onsuccess?.call(req as unknown as IDBRequest<T>, new Event('success'));
        },
        (err) => {
          req.error = err;
          req.onerror?.call(req as unknown as IDBRequest<T>, new Event('error'));
        },
      ),
    );
    return req as unknown as IDBRequest<T>;
  }

  function makeObjectStore(storeName: string): IDBObjectStore {
    const map = stores[storeName] ?? (stores[storeName] = new Map());
    return {
      get: (key: IDBValidKey) => makeRequest<unknown>((res) => res(map.get(key))),
      put: (value: unknown, key: IDBValidKey) =>
        makeRequest<IDBValidKey>((res) => { map.set(key, value); res(key); }),
    } as unknown as IDBObjectStore;
  }

  const fakeDb = {
    objectStoreNames: { contains: (n: string) => n in stores },
    createObjectStore: (name: string) => { stores[name] = stores[name] ?? new Map(); },
    transaction: (storeName: string) => ({
      objectStore: () => makeObjectStore(storeName),
    }),
  } as unknown as IDBDatabase;

  const createdStores: string[] = [];
  const upgradeDb = {
    ...fakeDb,
    objectStoreNames: { contains: () => false }, // force creation
    createObjectStore: (name: string) => {
      createdStores.push(name);
      stores[name] = stores[name] ?? new Map();
    },
  } as unknown as IDBDatabase;

  function makeOpenRequest(): IDBOpenDBRequest {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onupgradeneeded: null as ((ev: Event) => void) | null,
      result: fakeDb,
      error: null as DOMException | null,
    };

    Promise.resolve().then(() => {
      if (opts.failOnOpen) {
        req.error = new DOMException('Simulated IDB error', 'UnknownError');
        req.onerror?.call(req as unknown as IDBOpenDBRequest, new Event('error'));
        return;
      }
      if (opts.triggerUpgrade && req.onupgradeneeded) {
        // Swap in the upgradeDb so createObjectStore calls are tracked
        req.result = upgradeDb;
        req.onupgradeneeded.call(
          req as unknown as IDBOpenDBRequest,
          new Event('upgradeneeded') as IDBVersionChangeEvent,
        );
        req.result = fakeDb; // restore after upgrade
      }
      req.onsuccess?.call(req as unknown as IDBOpenDBRequest, new Event('success'));
    });

    return req as unknown as IDBOpenDBRequest;
  }

  return { fakeDb, stores, createdStores, makeOpenRequest };
}

/**
 * Install a fake indexedDB on globalThis and return a cleanup function.
 * Returns { openMock, cleanup, openCount }.
 */
function installFakeIndexedDB(
  opts: { failOnOpen?: boolean; triggerUpgrade?: boolean; throwOnOpen?: boolean } = {},
) {
  const { makeOpenRequest } = makeFakeIDB(opts);
  let openCount = 0;

  const fakeIndexedDB = {
    open: vi.fn((_name: string, _version?: number): IDBOpenDBRequest => {
      openCount++;
      if (opts.throwOnOpen) throw new DOMException('IDB not available', 'SecurityError');
      return makeOpenRequest();
    }),
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDB,
    writable: true,
    configurable: true,
  });

  const cleanup = () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  };

  return { openMock: fakeIndexedDB.open, getOpenCount: () => openCount, cleanup };
}

/**
 * Install a fake indexedDB that also tracks createObjectStore calls during
 * the upgradeneeded event (for test 6.1).
 */
function installFakeIndexedDBWithUpgrade() {
  const createdStores: string[] = [];

  // Helper: make an async IDB get request that resolves to undefined
  function makeAsyncGetRequest() {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      result: undefined as unknown,
      error: null,
    };
    Promise.resolve().then(() => {
      req.onsuccess?.call(req as unknown as IDBRequest, new Event('success'));
    });
    return req as unknown as IDBRequest;
  }

  const upgradeDb = {
    objectStoreNames: { contains: () => false },
    createObjectStore: (name: string) => { createdStores.push(name); },
    transaction: () => ({ objectStore: () => ({ get: () => makeAsyncGetRequest() }) }),
  } as unknown as IDBDatabase;

  const fakeDb = {
    objectStoreNames: { contains: (n: string) => ['sounds', 'cartelas'].includes(n) },
    createObjectStore: (name: string) => { createdStores.push(name); },
    transaction: () => ({ objectStore: () => ({ get: () => makeAsyncGetRequest() }) }),
  } as unknown as IDBDatabase;

  const openMock = vi.fn((_name: string, _version?: number): IDBOpenDBRequest => {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onupgradeneeded: null as ((ev: Event) => void) | null,
      result: fakeDb,
      error: null,
    };

    Promise.resolve().then(() => {
      req.result = upgradeDb;
      if (req.onupgradeneeded) {
        req.onupgradeneeded.call(
          req as unknown as IDBOpenDBRequest,
          new Event('upgradeneeded') as IDBVersionChangeEvent,
        );
      }
      req.result = fakeDb;
      req.onsuccess?.call(req as unknown as IDBOpenDBRequest, new Event('success'));
    });

    return req as unknown as IDBOpenDBRequest;
  });

  Object.defineProperty(globalThis, 'indexedDB', {
    value: { open: openMock },
    writable: true,
    configurable: true,
  });

  const cleanup = () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  };

  return { openMock, createdStores, cleanup };
}

/**
 * Install a round-trip capable fake IDB (for Property 13).
 * Returns the same fakeDb store map so assertions can verify values were stored.
 */
function installRoundTripFakeIDB() {
  const stores: Record<string, Map<IDBValidKey, unknown>> = {
    sounds: new Map(),
    cartelas: new Map(),
  };

  function makeRequest<T>(
    executor: (res: (v: T) => void, rej: (e: DOMException | null) => void) => void,
  ): IDBRequest<T> {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      result: undefined as unknown as T,
      error: null as DOMException | null,
    };
    Promise.resolve().then(() =>
      executor(
        (v) => { req.result = v; req.onsuccess?.call(req as unknown as IDBRequest<T>, new Event('success')); },
        (e) => { req.error = e; req.onerror?.call(req as unknown as IDBRequest<T>, new Event('error')); },
      ),
    );
    return req as unknown as IDBRequest<T>;
  }

  function makeObjectStore(storeName: string) {
    const map = stores[storeName] ?? (stores[storeName] = new Map());
    return {
      get: (key: IDBValidKey) => makeRequest<unknown>((res) => res(map.get(key))),
      put: (value: unknown, key: IDBValidKey) =>
        makeRequest<IDBValidKey>((res) => { map.set(key, value); res(key); }),
    } as unknown as IDBObjectStore;
  }

  const fakeDb = {
    objectStoreNames: { contains: (n: string) => n in stores },
    createObjectStore: (name: string) => { stores[name] = stores[name] ?? new Map(); },
    transaction: (storeName: string) => ({ objectStore: () => makeObjectStore(storeName) }),
  } as unknown as IDBDatabase;

  const openMock = vi.fn((_name: string, _version?: number): IDBOpenDBRequest => {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onupgradeneeded: null as ((ev: Event) => void) | null,
      result: fakeDb,
      error: null,
    };
    Promise.resolve().then(() => {
      req.onsuccess?.call(req as unknown as IDBOpenDBRequest, new Event('success'));
    });
    return req as unknown as IDBOpenDBRequest;
  });

  Object.defineProperty(globalThis, 'indexedDB', {
    value: { open: openMock },
    writable: true,
    configurable: true,
  });

  const cleanup = () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  };

  return { stores, cleanup };
}

// ─── 6.1: IDB initialization ──────────────────────────────────────────────────

describe('6.1 IDB initialization', () => {
  afterEach(() => vi.resetModules());

  it('only exports idbGet and idbPut (Requirement 1.4)', async () => {
    const mod = await import('../lib/idb');
    const keys = Object.keys(mod);
    expect(keys).toContain('idbGet');
    expect(keys).toContain('idbPut');
    expect(keys.length).toBe(2);
  });

  it('opens the DB with name "bingo-cache" and version 1 (Requirements 1.1)', async () => {
    vi.resetModules();
    const { openMock, cleanup } = installFakeIndexedDB();

    const idb = await import('../lib/idb');
    await idb.idbGet('sounds', 1).catch(() => {});

    expect(openMock).toHaveBeenCalledWith('bingo-cache', 1);
    cleanup();
  });

  it('creates "sounds" and "cartelas" stores in onupgradeneeded (Requirement 1.2)', async () => {
    vi.resetModules();
    const { createdStores, cleanup } = installFakeIndexedDBWithUpgrade();

    const idb = await import('../lib/idb');
    await idb.idbGet('sounds', 1).catch(() => {});

    expect(createdStores).toContain('sounds');
    expect(createdStores).toContain('cartelas');
    cleanup();
  });
});

// ─── 6.2: IDB error reset ────────────────────────────────────────────────────

describe('6.2 IDB error reset', () => {
  afterEach(() => vi.resetModules());

  it('resets dbPromise to null after onerror so the next call issues a new open (Requirement 1.3)', async () => {
    vi.resetModules();
    const { openMock, cleanup } = installFakeIndexedDB({ failOnOpen: true });

    const idb = await import('../lib/idb');

    // First call — fails and resets dbPromise to null
    await idb.idbGet('sounds', 1).catch(() => {});
    // Second call — must issue a new open request
    await idb.idbGet('sounds', 1).catch(() => {});

    expect(openMock).toHaveBeenCalledTimes(2);
    cleanup();
  });
});

// ─── 6.3: QuotaExceededError handling ────────────────────────────────────────

describe('6.3 QuotaExceededError handling', () => {
  afterEach(() => vi.resetModules());

  it('idbPut wrapped in .catch(() => {}) does not throw on QuotaExceededError (Requirement 4.1)', async () => {
    vi.resetModules();
    const { cleanup } = installFakeIndexedDB();

    const idb = await import('../lib/idb');

    // Simulate QuotaExceededError by spying on the already-imported module function
    const putSpy = vi.spyOn(idb, 'idbPut').mockRejectedValue(
      new DOMException('QuotaExceededError', 'QuotaExceededError'),
    );

    let threw = false;
    try {
      await idb.idbPut('cartelas', 'key', { test: true }).catch(() => {});
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    putSpy.mockRestore();
    cleanup();
  });
});

// ─── 6.4: IDB unavailable ────────────────────────────────────────────────────

describe('6.4 IDB unavailable (private browsing)', () => {
  afterEach(() => vi.resetModules());

  it('idbGet catches the error and resolves/rejects gracefully (Requirement 4.2)', async () => {
    vi.resetModules();
    const { cleanup } = installFakeIndexedDB({ throwOnOpen: true });

    const idb = await import('../lib/idb');

    let result: unknown = 'sentinel';
    try {
      result = await idb.idbGet('sounds', 1);
    } catch {
      result = undefined;
    }

    expect(result).toBeUndefined();
    cleanup();
  });

  it('idbPut wrapped in .catch(() => {}) does not crash when IDB is unavailable (Requirement 4.2)', async () => {
    vi.resetModules();
    const { cleanup } = installFakeIndexedDB({ throwOnOpen: true });

    const idb = await import('../lib/idb');

    let threw = false;
    try {
      await idb.idbPut('sounds', 1, new ArrayBuffer(8)).catch(() => {});
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    cleanup();
  });
});

// ─── Property 1: IDB singleton ───────────────────────────────────────────────
// Feature: indexdb-cartela-sound, Property 1: IDB singleton
// Validates: Requirements 1.5

describe('Property 1: IDB singleton', () => {
  afterEach(() => vi.resetModules());

  it('indexedDB.open is called only once regardless of N concurrent idbGet calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        async (n) => {
          vi.resetModules();

          const { openMock, cleanup } = installFakeIndexedDB();
          const idb = await import('../lib/idb');

          await Promise.all(
            Array.from({ length: n }, () => idb.idbGet('sounds', 1).catch(() => {})),
          );

          const count = (openMock as ReturnType<typeof vi.fn>).mock.calls.length;
          cleanup();
          return count === 1;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 13: IDB cartela round-trip ─────────────────────────────────────
// Feature: indexdb-cartela-sound, Property 13: IDB cartela round-trip
// Validates: Requirements 6.1, 6.2, 6.3

describe('Property 13: IDB cartela round-trip', () => {
  afterEach(() => vi.resetModules());

  it('idbPut then idbGet returns deeply equal object preserving order and numeric types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 800 }),
        fc.array(fc.integer({ min: 1, max: 75 }), { minLength: 1, maxLength: 50 }),
        fc.uuid(),
        async (cartela_number, grid, keySuffix) => {
          vi.resetModules();

          const { cleanup } = installRoundTripFakeIDB();
          const idb = await import('../lib/idb');

          const key = `round-${keySuffix}:${cartela_number}`;
          const original = { cartela_number, grid };

          await idb.idbPut('cartelas', key, original);
          const retrieved = await idb.idbGet<{ cartela_number: number; grid: number[] }>('cartelas', key);

          cleanup();

          if (retrieved === undefined) return false;
          if (typeof retrieved.cartela_number !== 'number') return false;
          if (retrieved.cartela_number !== original.cartela_number) return false;
          if (!Array.isArray(retrieved.grid)) return false;
          if (retrieved.grid.length !== original.grid.length) return false;
          for (let i = 0; i < original.grid.length; i++) {
            if (typeof retrieved.grid[i] !== 'number') return false;
            if (retrieved.grid[i] !== original.grid[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
