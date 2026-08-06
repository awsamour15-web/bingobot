# Requirements Document

## Introduction

The Fidel Bingo mini-app (Telegram, React/Vite) already has a thin IndexedDB wrapper (`idb.ts`) with two object stores: `sounds` (keyed by number 1–75, value `ArrayBuffer`) and `cartelas` (keyed by string, value arbitrary object). Sound preloading is used in `LiveGameScreen` and history-detail caching is used in `api.ts`, but both implementations are incomplete and inconsistent. This feature consolidates and completes the IndexedDB caching layer so that:

1. All 75 `.wav` sound files are reliably fetched once, persisted in IndexedDB, and served from cache on subsequent visits — eliminating repeated network downloads on every session.
2. Cartela grid data (the 5×5 bingo card numbers for a player's joined cartelas) is cached per round so it survives page reloads during a live game without requiring a new API call.

The feature must work within Telegram's WebView environment, handle storage quota gracefully, and remain compatible with the existing `idb.ts` API surface.

---

## Glossary

- **IDB_Cache**: The IndexedDB database named `bingo-cache` (version 1) with two object stores — `sounds` and `cartelas`.
- **Sound_Store**: The `sounds` object store inside IDB_Cache. Keys are integers 1–75; values are `ArrayBuffer` containing raw `.wav` audio data.
- **Cartela_Store**: The `cartelas` object store inside IDB_Cache. Keys are strings of the form `"roundId:cartelaNumber"`; values are objects `{ cartela_number: number, grid: number[] }`.
- **Sound_Preloader**: The module-level routine (currently inside `LiveGameScreen`) responsible for fetching and caching all 75 sounds.
- **Cartela_Cache**: The caching layer responsible for storing and retrieving cartela grid data from IDB_Cache.
- **Round**: A single bingo game session identified by a UUID (`roundId`).
- **Cartela**: A specific 5×5 bingo card identified by a `cartelaNumber` (integer 1–800) within a Round.
- **ArrayBuffer**: Raw binary data type used to store `.wav` audio in IndexedDB.

---

## Requirements

### Requirement 1: IndexedDB Database Initialization

**User Story:** As a developer, I want the IndexedDB database to open reliably on every app start, so that both sound and cartela caching work without initialization errors.

#### Acceptance Criteria

1. THE IDB_Cache SHALL open with database name `bingo-cache` and version `1`.
2. WHEN IDB_Cache is opened for the first time, THE IDB_Cache SHALL create the `sounds` object store and the `cartelas` object store.
3. WHEN IDB_Cache fails to open due to a browser error, THE IDB_Cache SHALL reset its cached promise so the next call retries the open operation.
4. THE IDB_Cache SHALL expose `idbGet<T>(store, key)` and `idbPut(store, key, value)` as the only public API functions.
5. THE IDB_Cache SHALL reuse a single shared `IDBDatabase` instance across all calls within the same page session (singleton pattern).

---

### Requirement 2: Sound File Caching

**User Story:** As a player, I want the 75 number-announcement sounds to load instantly after the first visit, so that audio plays without delay during a live game.

#### Acceptance Criteria

1. WHEN the `LiveGameScreen` mounts, THE Sound_Preloader SHALL attempt to load all 75 sounds (numbers 1–75) in parallel.
2. WHEN a sound for number `n` is requested and an `ArrayBuffer` for key `n` exists in the Sound_Store, THE Sound_Preloader SHALL create an `HTMLAudioElement` from that cached buffer without making a network request.
3. WHEN a sound for number `n` is requested and no entry exists in the Sound_Store, THE Sound_Preloader SHALL fetch `/sounds/{n}.wav` over the network, store the resulting `ArrayBuffer` in the Sound_Store under key `n`, and then create an `HTMLAudioElement` from that buffer.
4. IF fetching or caching a sound for number `n` fails, THEN THE Sound_Preloader SHALL fall back to creating an `HTMLAudioElement` directly from the URL `/sounds/{n}.wav` without throwing an error.
5. WHEN a sound has already been loaded into the in-memory `audioCache` for the current session, THE Sound_Preloader SHALL not re-fetch it from either IndexedDB or the network.
6. THE Sound_Preloader SHALL store at most one `ArrayBuffer` entry per number key in the Sound_Store (no duplicates).

---

### Requirement 3: Cartela Grid Caching

**User Story:** As a player, I want my bingo card to reload instantly if I refresh the page mid-game, so that I don't lose my game state.

#### Acceptance Criteria

1. WHEN `getCartelaGrid(roundId, cartelaNumber)` is called and an entry for key `"roundId:cartelaNumber"` exists in the Cartela_Store, THE Cartela_Cache SHALL return the cached `{ cartela_number, grid }` object without making an API request.
2. WHEN `getCartelaGrid(roundId, cartelaNumber)` is called and no entry exists in the Cartela_Store, THE Cartela_Cache SHALL fetch the grid from the API, store the result in the Cartela_Store under key `"roundId:cartelaNumber"`, and return the result.
3. IF the API request for a cartela grid fails, THEN THE Cartela_Cache SHALL propagate the error to the caller without writing a partial entry to the Cartela_Store.
4. WHEN `getMyCartelas(roundId)` returns cartela grids for a player's joined cartelas, THE Cartela_Cache SHALL persist each cartela grid to the Cartela_Store under its corresponding `"roundId:cartelaNumber"` key.
5. THE Cartela_Store SHALL store cartela grids as plain serializable objects `{ cartela_number: number, grid: number[] }` only.

---

### Requirement 4: Cache Validity and Storage Quota Handling

**User Story:** As a developer, I want the cache to degrade gracefully when storage is unavailable, so that the app continues to work even if IndexedDB is blocked or full.

#### Acceptance Criteria

1. IF a write to the Sound_Store or Cartela_Store fails due to a `QuotaExceededError`, THEN THE IDB_Cache SHALL silently swallow the error and allow the caller to continue using the in-memory or network fallback.
2. IF IndexedDB is unavailable in the current browser context (e.g., private browsing in some environments), THEN THE IDB_Cache SHALL reject the `openDB` promise and all subsequent `idbGet`/`idbPut` calls SHALL resolve as `undefined`/no-op respectively, without crashing the app.
3. THE Sound_Preloader SHALL NOT block the game screen from rendering while sounds are being preloaded or fetched.
4. THE Cartela_Cache SHALL NOT block the game screen from rendering while a cartela grid write is in progress.

---

### Requirement 5: Sound Playback Correctness

**User Story:** As a player, I want the correct number sound to play every time a number is called, so that I can follow the game by audio.

#### Acceptance Criteria

1. WHEN a `NUMBER_CALLED` WebSocket event is received with number `n`, THE Sound_Preloader SHALL play the `HTMLAudioElement` associated with key `n` from the in-memory `audioCache`.
2. WHEN a sound for number `n` is played and the audio context is locked (browser autoplay policy), THE Sound_Preloader SHALL retry playback once after 300 ms.
3. WHEN the sound toggle is set to off (`soundOn = false`), THE Sound_Preloader SHALL skip playback for all subsequent `NUMBER_CALLED` events.
4. FOR ALL numbers `n` in range 1–75, THE Sound_Preloader SHALL play the audio associated with exactly number `n` and not any other number (identity property).

---

### Requirement 6: Round-Trip Data Integrity for Cached Cartelas

**User Story:** As a developer, I want to verify that cartela grid data stored and retrieved from IndexedDB is identical to what the server returned, so that no bingo card corruption occurs.

#### Acceptance Criteria

1. FOR ALL valid cartela grid objects `g` returned by the API, storing `g` into the Cartela_Store and retrieving it SHALL produce an object deeply equal to `g` (round-trip property).
2. THE Cartela_Store SHALL preserve the `grid` array element order exactly as received from the API (order invariant).
3. THE Cartela_Store SHALL preserve the numeric type of all `grid` values (no string coercion).
