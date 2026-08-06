# Implementation Plan: IndexedDB Cartela & Sound Caching

## Overview

This feature adds comprehensive IndexedDB caching for sounds and cartela grids in the Fidel Bingo mini-app. The implementation follows a cache-first, write-through pattern where all IndexedDB errors are gracefully degraded. Changes are confined to three existing files: `idb.ts` (no changes), `api.ts` (add caching wrappers), and `LiveGameScreen.tsx` (minimal changes).

## Tasks

- [x] 1. Add cartela grid caching to api.ts
  - [x] 1.1 Implement `getCartelaGridCached(roundId, cartelaNumber)` function
    - Create new exported async function that wraps existing `getCartelaGrid`
    - Read from IDB first using key `"${roundId}:${cartelaNumber}"`
    - On cache hit, return cached value without API call
    - On cache miss, call API, then write result to IDB (fire-and-forget)
    - Import `idbGet` and `idbPut` from `./idb`
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 1.2 Write property test for cartela cache hit behavior
    - **Property 7: Cartela cache hit avoids API call**
    - **Validates: Requirements 3.1**
    - Test with arbitrary `(roundId, cartelaNumber)` pairs
    - Stub `idbGet` to return a cached value
    - Assert `apiRequest` is not called
    - Use fast-check with 100+ iterations
  
  - [x] 1.3 Write property test for cartela cache miss behavior
    - **Property 8: Cartela cache miss fetches and writes**
    - **Validates: Requirements 3.2**
    - Test with arbitrary inputs
    - Stub `idbGet` to return `undefined`
    - Assert `apiRequest` is called followed by `idbPut`
    - Use fast-check with 100+ iterations
  
  - [x] 1.4 Write property test for cartela API failure handling
    - **Property 9: Cartela API failure produces no store write**
    - **Validates: Requirements 3.3**
    - Make `apiRequest` reject with error
    - Assert `idbPut` is never called
    - Assert error propagates to caller
    - Use fast-check with 100+ iterations

  - [x] 1.5 Update `getMyCartelas(roundId)` to write-through each cartela
    - After successful API response, iterate over `result.cartelas`
    - For each cartela, call `idbPut('cartelas', key, { cartela_number, grid })` fire-and-forget
    - Key format: `"${roundId}:${c.cartelaNumber}"`
    - Value format: `{ cartela_number: number, grid: number[] }`
    - _Requirements: 3.4, 3.5_
  
  - [x] 1.6 Write property test for getMyCartelas write-through
    - **Property 10: getMyCartelas write-through**
    - **Validates: Requirements 3.4, 3.5**
    - Test with arbitrary cartela list of size k
    - Assert exactly k calls to `idbPut` with correct keys and shape
    - Use fast-check with 100+ iterations

- [ ] 2. Update LiveGameScreen.tsx to use cached cartela grid
  - [-] 2.1 Replace `getCartelaGrid` with `getCartelaGridCached` in `onWon` handler
    - Update import statement to include `getCartelaGridCached`
    - Replace the call inside the `onWon` socket handler
    - Keep the existing `.catch(() => {})` error swallowing
    - _Requirements: 3.1, 3.2_

- [~] 3. Checkpoint - Verify cartela caching integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Write property tests for sound preloading
  - [~] 4.1 Write property test for sound preload completeness
    - **Property 2: Sound preload completeness**
    - **Validates: Requirements 2.1**
    - Stub IDB and fetch
    - Run `preloadSounds()` with fresh `audioCache`
    - Assert `audioCache` contains exactly 75 entries (keys 1-75)
    - Use fast-check with 100+ iterations
  
  - [~] 4.2 Write property test for sound IDB cache hit
    - **Property 3: Sound IDB cache hit avoids network**
    - **Validates: Requirements 2.2**
    - Test with arbitrary sound number n in 1-75
    - Stub `idbGet('sounds', n)` to return ArrayBuffer
    - Assert `fetch` is not called for `/sounds/${n}.wav`
    - Use fast-check with 100+ iterations
  
  - [~] 4.3 Write property test for sound IDB cache miss
    - **Property 4: Sound IDB cache miss triggers fetch and write**
    - **Validates: Requirements 2.3**
    - Test with arbitrary sound number n in 1-75
    - Stub `idbGet` to return `undefined`
    - Assert `fetch('/sounds/${n}.wav')` is called
    - Assert `idbPut('sounds', n, ArrayBuffer)` is called after fetch
    - Use fast-check with 100+ iterations
  
  - [~] 4.4 Write property test for sound preload error fallback
    - **Property 5: Sound preload never throws**
    - **Validates: Requirements 2.4**
    - Test with arbitrary sound number n
    - Make `idbGet`, `fetch`, or `idbPut` reject
    - Assert `preloadSounds()` still produces entry in `audioCache` (URL-based Audio)
    - Assert no error is propagated
    - Use fast-check with 100+ iterations
  
  - [~] 4.5 Write property test for in-memory sound cache skip
    - **Property 6: In-memory sound cache skips IDB and network**
    - **Validates: Requirements 2.5**
    - Pre-fill `audioCache` with arbitrary sounds
    - Call `preloadSounds()` again
    - Assert `idbGet` and `fetch` call count = 0 for pre-filled keys
    - Use fast-check with 100+ iterations
  
  - [~] 4.6 Write property test for sound mute behavior
    - **Property 11: Sound mute skips playback**
    - **Validates: Requirements 5.3**
    - Test with arbitrary number n in 1-75
    - Set `soundOnRef.current = false`
    - Call `playSound(n)`
    - Assert `.play()` is never called on any HTMLAudioElement
    - Use fast-check with 100+ iterations
  
  - [~] 4.7 Write property test for sound identity
    - **Property 12: Sound identity**
    - **Validates: Requirements 5.1, 5.4**
    - Test with arbitrary number n in audioCache
    - Call `playSound(n)`
    - Assert `.play()` called on exactly `audioCache.get(n)`
    - Use fast-check with 100+ iterations

- [ ] 5. Write property tests for IDB infrastructure
  - [~] 5.1 Write property test for IDB singleton
    - **Property 1: IDB singleton**
    - **Validates: Requirements 1.5**
    - Call `openDB()` N times within same session
    - Assert all calls return same Promise reference
    - Use fast-check with 100+ iterations
  
  - [~] 5.2 Write property test for IDB cartela round-trip
    - **Property 13: IDB cartela round-trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Test with arbitrary valid cartela grid object `{ cartela_number: number, grid: number[] }`
    - Call `idbPut('cartelas', key, g)` followed by `idbGet('cartelas', key)`
    - Assert result is deeply equal to original, array order preserved, numeric types intact
    - Use fast-check with 100+ iterations

- [ ] 6. Write unit tests for error branches and edge cases
  - [~] 6.1 Write unit test for IDB initialization
    - Assert DB name is `'bingo-cache'`
    - Assert DB version is `1`
    - Assert both `sounds` and `cartelas` stores are created
    - Assert only `idbGet` and `idbPut` are exported
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [~] 6.2 Write unit test for IDB error reset
    - Simulate `onerror` during `openDB()`
    - Call `openDB()` again
    - Assert a new request is issued (dbPromise was reset to null)
    - _Requirements: 1.3_
  
  - [~] 6.3 Write unit test for QuotaExceededError handling
    - Simulate `idbPut` throwing `QuotaExceededError`
    - Assert caller does not throw
    - Assert in-memory state is unaffected
    - _Requirements: 4.1_
  
  - [~] 6.4 Write unit test for IDB unavailable (private browsing)
    - Simulate `indexedDB.open` throwing error
    - Assert `idbGet` resolves to `undefined`
    - Assert `idbPut` is no-op (no crash)
    - _Requirements: 4.2_
  
  - [~] 6.5 Write unit test for audio autoplay retry
    - Simulate `Audio.play()` rejecting with `NotAllowedError`
    - Assert `setTimeout` is called with ~300ms delay
    - Assert retry attempt is made
    - _Requirements: 5.2_

- [~] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No changes needed to `idb.ts` - existing implementation satisfies all requirements
- Sound preloading already works correctly in `LiveGameScreen.tsx` - no changes needed
- All IDB operations are fire-and-forget - cache failures never block the UI
- Property tests use fast-check with minimum 100 iterations per property
- Test files: `apps/mini-app/src/__tests__/idb.test.ts`, `apps/mini-app/src/__tests__/api.cartela.test.ts`, `apps/mini-app/src/__tests__/LiveGameScreen.sound.test.ts`
- Each property test includes a comment: `// Feature: indexdb-cartela-sound, Property N: <property text>`
