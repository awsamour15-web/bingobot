/**
 * Thin IndexedDB wrapper for caching sounds and cartela grids.
 * Two object stores:
 *   - "sounds"   : key = number (1-75), value = ArrayBuffer
 *   - "cartelas" : key = "roundId:cartelaNumber", value = { cartela_number, grid }
 */
const DB_NAME = 'bingo-cache';
const DB_VERSION = 1;
let dbPromise = null;
function openDB() {
    if (dbPromise)
        return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('sounds'))
                db.createObjectStore('sounds');
            if (!db.objectStoreNames.contains('cartelas'))
                db.createObjectStore('cartelas');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
}
function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
}
export async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = tx(db, store, 'readonly').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
export async function idbPut(store, key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = tx(db, store, 'readwrite').put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
//# sourceMappingURL=idb.js.map