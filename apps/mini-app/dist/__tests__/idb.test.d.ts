/**
 * Unit and property-based tests for idb.ts
 *
 * jsdom does not ship a real IndexedDB implementation, so every test
 * installs a lightweight fake onto globalThis.indexedDB before importing
 * the module under test. vi.resetModules() is called before each isolated
 * test so that the module-private `dbPromise` starts as null.
 */
export {};
//# sourceMappingURL=idb.test.d.ts.map