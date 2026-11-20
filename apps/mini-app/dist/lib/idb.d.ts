/**
 * Thin IndexedDB wrapper for caching sounds and cartela grids.
 * Two object stores:
 *   - "sounds"   : key = number (1-75), value = ArrayBuffer
 *   - "cartelas" : key = "roundId:cartelaNumber", value = { cartela_number, grid }
 */
export declare function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined>;
export declare function idbPut(store: string, key: IDBValidKey, value: unknown): Promise<void>;
//# sourceMappingURL=idb.d.ts.map