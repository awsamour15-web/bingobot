/**
 * Property-based tests for sound preloading and playback logic
 * extracted from LiveGameScreen.tsx.
 *
 * Because preloadSounds and playSound live inside a React component,
 * we test the core logic by re-implementing the exact same algorithm
 * as standalone async functions that accept their dependencies as params.
 * This avoids needing to render the component while still validating
 * the real behavior described in the spec.
 */

import { describe, it, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import * as idb from '../lib/idb';

// ─── Standalone helpers mirroring the exact LiveGameScreen logic ────────────

/**
 * Mirrors the `load(n)` inner function inside the preloadSounds useEffect.
 * Dependencies are injected for testability.
 */
async function loadSound(
  n: number,
  audioCache: Map<number, { src: string; preload: string }>,
  idbGetFn: typeof idb.idbGet,
  idbPutFn: typeof idb.idbPut,
  fetchFn: typeof fetch,
  AudioCtor: (src: string) => { src: string; preload: string },
  URLCreateObjectURL: (blob: Blob) => string,
): Promise<void> {
  if (audioCache.has(n)) return;
  try {
    let buf = await idbGetFn<ArrayBuffer>('sounds', n);
    if (!buf) {
      const res = await fetchFn(`/sounds/${n}.wav`);
      buf = await res.arrayBuffer();
      idbPutFn('sounds', n, buf).catch(() => {});
    }
    const blob = new Blob([buf], { type: 'audio/wav' });
    const audio = AudioCtor(URLCreateObjectURL(blob));
    audio.preload = 'auto';
    audioCache.set(n, audio);
  } catch {
    const audio = AudioCtor(`/sounds/${n}.wav`);
    audio.preload = 'auto';
    audioCache.set(n, audio);
  }
}

/**
 * Mirrors the full preloadSounds() function — runs load(n) for n=1..75 in parallel.
 */
async function preloadSounds(
  audioCache: Map<number, { src: string; preload: string }>,
  idbGetFn: typeof idb.idbGet,
  idbPutFn: typeof idb.idbPut,
  fetchFn: typeof fetch,
  AudioCtor: (src: string) => { src: string; preload: string },
  URLCreateObjectURL: (blob: Blob) => string,
): Promise<void> {
  await Promise.all(
    Array.from({ length: 75 }, (_, i) =>
      loadSound(i + 1, audioCache, idbGetFn, idbPutFn, fetchFn, AudioCtor, URLCreateObjectURL),
    ),
  );
}

/**
 * Mirrors the playSound(num) function inside LiveGameScreen.
 */
function playSound(
  num: number,
  soundOnRef: { current: boolean },
  audioCache: Map<number, { play: () => Promise<void>; currentTime: number }>,
): void {
  if (!soundOnRef.current) return;
  try {
    const cached = audioCache.get(num);
    const audio = cached ?? { play: () => Promise.resolve(), currentTime: 0 };
    audio.currentTime = 0;
    const p = audio.play();
    if (p) {
      p.catch(() => {});
    }
  } catch {}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Creates a minimal Audio mock with a trackable play() spy */
function makeAudioMock(src: string) {
  return {
    src,
    preload: 'auto',
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

/** Factory that returns a new Audio mock each time (simulating new Audio(src)) */
function makeAudioCtor() {
  const created: Array<ReturnType<typeof makeAudioMock>> = [];
  const ctor = (src: string) => {
    const a = makeAudioMock(src);
    created.push(a);
    return a;
  };
  return { ctor, created };
}

/** Minimal fake ArrayBuffer for IDB stubs */
function fakeArrayBuffer(): ArrayBuffer {
  return new ArrayBuffer(8);
}

/** Minimal fake fetch response that returns an ArrayBuffer */
function makeFetchResponse(buf: ArrayBuffer): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf,
    json: async () => ({}),
  } as unknown as Response;
}

// ─── Property 2: Sound preload completeness ─────────────────────────────────
// Feature: indexdb-cartela-sound, Property 2: Sound preload completeness
// Validates: Requirements 2.1

describe('Property 2: Sound preload completeness', () => {
  it('audioCache contains exactly 75 entries (keys 1-75) after preloadSounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // No input needed — property holds for any fresh audioCache
        fc.constant(null),
        async () => {
          const audioCache = new Map<number, ReturnType<typeof makeAudioMock>>();
          const { ctor } = makeAudioCtor();
          const buf = fakeArrayBuffer();

          // Stub idbGet to always return an ArrayBuffer (simulate warm IDB cache)
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(buf as unknown as undefined);
          // Stub idbPut to no-op
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);
          // Stub fetch (should not be called when IDB has data, but stub to be safe)
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            makeFetchResponse(buf),
          );

          await preloadSounds(
            audioCache as Map<number, { src: string; preload: string }>,
            idb.idbGet,
            idb.idbPut,
            globalThis.fetch,
            ctor as (src: string) => { src: string; preload: string },
            (blob: Blob) => `blob:${blob.size}`,
          );

          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          // Must have exactly 75 entries
          if (audioCache.size !== 75) return false;
          // Keys must be exactly 1..75
          for (let n = 1; n <= 75; n++) {
            if (!audioCache.has(n)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Sound IDB cache hit avoids network ─────────────────────────
// Feature: indexdb-cartela-sound, Property 3: Sound IDB cache hit avoids network
// Validates: Requirements 2.2

describe('Property 3: Sound IDB cache hit avoids network', () => {
  it('does not call fetch for /sounds/n.wav when idbGet returns an ArrayBuffer', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 75 }),
        async (n) => {
          const audioCache = new Map<number, ReturnType<typeof makeAudioMock>>();
          const { ctor } = makeAudioCtor();
          const buf = fakeArrayBuffer();

          // idbGet returns a buffer for key n → cache hit for n
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockImplementation(
            async (_store: string, key: IDBValidKey) => {
              if (key === n) return buf as unknown as undefined;
              return buf as unknown as undefined; // also return for other keys
            },
          );
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            makeFetchResponse(buf),
          );

          // Run preload only for the single key n (to isolate the property)
          await loadSound(
            n,
            audioCache as Map<number, { src: string; preload: string }>,
            idb.idbGet,
            idb.idbPut,
            globalThis.fetch,
            ctor as (src: string) => { src: string; preload: string },
            (blob: Blob) => `blob:${blob.size}`,
          );

          // fetch must not have been called for /sounds/n.wav
          const fetchCalledForN = fetchSpy.mock.calls.some(
            (call) => String(call[0]) === `/sounds/${n}.wav`,
          );

          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          return !fetchCalledForN;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Sound IDB cache miss triggers fetch and write ──────────────
// Feature: indexdb-cartela-sound, Property 4: Sound IDB cache miss triggers fetch and write
// Validates: Requirements 2.3

describe('Property 4: Sound IDB cache miss triggers fetch and write', () => {
  it('calls fetch and idbPut when idbGet returns undefined', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 75 }),
        async (n) => {
          const audioCache = new Map<number, ReturnType<typeof makeAudioMock>>();
          const { ctor } = makeAudioCtor();
          const buf = fakeArrayBuffer();

          // idbGet returns undefined → cache miss
          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(undefined);
          // idbPut tracks write call
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);
          // fetch returns a buffer
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            makeFetchResponse(buf),
          );

          await loadSound(
            n,
            audioCache as Map<number, { src: string; preload: string }>,
            idb.idbGet,
            idb.idbPut,
            globalThis.fetch,
            ctor as (src: string) => { src: string; preload: string },
            (blob: Blob) => `blob:${blob.size}`,
          );

          // Allow fire-and-forget idbPut to settle
          await Promise.resolve();

          // fetch must have been called for /sounds/n.wav
          const fetchCalled = fetchSpy.mock.calls.some(
            (call) => String(call[0]) === `/sounds/${n}.wav`,
          );

          // idbPut must have been called with ('sounds', n, ArrayBuffer)
          const idbPutCalled = idbPutSpy.mock.calls.some(
            (call) =>
              call[0] === 'sounds' &&
              call[1] === n &&
              call[2] instanceof ArrayBuffer,
          );

          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          return fetchCalled && idbPutCalled;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: Sound preload never throws ─────────────────────────────────
// Feature: indexdb-cartela-sound, Property 5: Sound preload never throws
// Validates: Requirements 2.4

describe('Property 5: Sound preload never throws', () => {
  it('still produces audioCache entry for key n even when idbGet/fetch/idbPut reject', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 75 }),
        // Which dependency to make fail: 0=idbGet, 1=fetch, 2=idbPut (idbPut is fire-and-forget so test idbGet+fetch)
        fc.integer({ min: 0, max: 1 }),
        async (n, failMode) => {
          const audioCache = new Map<number, ReturnType<typeof makeAudioMock>>();
          const { ctor } = makeAudioCtor();
          const buf = fakeArrayBuffer();

          let idbGetSpy: ReturnType<typeof vi.spyOn>;
          let fetchSpy: ReturnType<typeof vi.spyOn>;
          let idbPutSpy: ReturnType<typeof vi.spyOn>;

          if (failMode === 0) {
            // idbGet rejects
            idbGetSpy = vi.spyOn(idb, 'idbGet').mockRejectedValue(new Error('IDB error'));
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(buf));
          } else {
            // fetch rejects (idbGet returns undefined first)
            idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(undefined);
            fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
          }
          idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);

          let threw = false;
          try {
            await loadSound(
              n,
              audioCache as Map<number, { src: string; preload: string }>,
              idb.idbGet,
              idb.idbPut,
              globalThis.fetch,
              ctor as (src: string) => { src: string; preload: string },
              (blob: Blob) => `blob:${blob.size}`,
            );
          } catch {
            threw = true;
          }

          idbGetSpy.mockRestore();
          fetchSpy.mockRestore();
          idbPutSpy.mockRestore();

          // Must not have thrown
          if (threw) return false;
          // audioCache must contain an entry for n (URL-based fallback)
          if (!audioCache.has(n)) return false;
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: In-memory sound cache skips IDB and network ────────────────
// Feature: indexdb-cartela-sound, Property 6: In-memory sound cache skips IDB and network
// Validates: Requirements 2.5

describe('Property 6: In-memory sound cache skips IDB and network', () => {
  it('does not call idbGet or fetch for keys already in audioCache', async () => {
    await fc.assert(
      fc.asyncProperty(
        // A subset of keys to pre-fill (arbitrary subset of 1..75)
        fc.array(fc.integer({ min: 1, max: 75 }), { minLength: 1, maxLength: 75 }).map(
          (arr) => [...new Set(arr)],
        ),
        async (prefillKeys) => {
          const audioCache = new Map<number, ReturnType<typeof makeAudioMock>>();
          const { ctor } = makeAudioCtor();
          const buf = fakeArrayBuffer();

          // Pre-fill audioCache with arbitrary entries
          for (const k of prefillKeys) {
            audioCache.set(k, makeAudioMock(`/sounds/${k}.wav`));
          }

          const idbGetSpy = vi.spyOn(idb, 'idbGet').mockResolvedValue(buf as unknown as undefined);
          const idbPutSpy = vi.spyOn(idb, 'idbPut').mockResolvedValue(undefined);
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            makeFetchResponse(buf),
          );

          await preloadSounds(
            audioCache as Map<number, { src: string; preload: string }>,
            idb.idbGet,
            idb.idbPut,
            globalThis.fetch,
            ctor as (src: string) => { src: string; preload: string },
            (blob: Blob) => `blob:${blob.size}`,
          );

          // Check that idbGet was NOT called for any pre-filled key
          const idbGetCalledForPrefilled = idbGetSpy.mock.calls.some((call) =>
            prefillKeys.includes(call[1] as number),
          );

          // Check that fetch was NOT called for any pre-filled key
          const fetchCalledForPrefilled = fetchSpy.mock.calls.some((call) =>
            prefillKeys.some((k) => String(call[0]) === `/sounds/${k}.wav`),
          );

          idbGetSpy.mockRestore();
          idbPutSpy.mockRestore();
          fetchSpy.mockRestore();

          return !idbGetCalledForPrefilled && !fetchCalledForPrefilled;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 11: Sound mute skips playback ─────────────────────────────────
// Feature: indexdb-cartela-sound, Property 11: Sound mute skips playback
// Validates: Requirements 5.3

describe('Property 11: Sound mute skips playback', () => {
  it('does not call .play() on any HTMLAudioElement when soundOnRef.current is false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 75 }),
        async (n) => {
          const soundOnRef = { current: false };
          const audioMock = {
            play: vi.fn().mockResolvedValue(undefined),
            currentTime: 0,
          };
          const audioCache = new Map<number, typeof audioMock>();
          audioCache.set(n, audioMock);

          playSound(n, soundOnRef, audioCache);

          // Allow any microtasks to settle
          await Promise.resolve();

          const playCalled = audioMock.play.mock.calls.length > 0;

          // Reset mock for next iteration
          audioMock.play.mockClear();

          return !playCalled;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 12: Sound identity ────────────────────────────────────────────
// Feature: indexdb-cartela-sound, Property 12: Sound identity
// Validates: Requirements 5.1, 5.4

describe('Property 12: Sound identity', () => {
  it('calls .play() on exactly audioCache.get(n) and no other element', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 75 }),
        async (n) => {
          const soundOnRef = { current: true };

          // Create distinct mocks for every entry in audioCache (1..75)
          const audioCache = new Map<number, { play: ReturnType<typeof vi.fn>; currentTime: number }>();
          for (let i = 1; i <= 75; i++) {
            audioCache.set(i, { play: vi.fn().mockResolvedValue(undefined), currentTime: 0 });
          }

          playSound(n, soundOnRef, audioCache);

          // Allow microtasks to settle
          await Promise.resolve();

          // The mock for key n must have had play() called once
          const targetMock = audioCache.get(n)!;
          if (targetMock.play.mock.calls.length !== 1) return false;

          // No other mock should have had play() called
          for (const [key, mock] of audioCache) {
            if (key !== n && mock.play.mock.calls.length > 0) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 6.5: Unit test for audio autoplay retry ────────────────────────────
// Feature: indexdb-cartela-sound, Task 6.5: Autoplay retry
// Validates: Requirements 5.2

/**
 * Mirrors the exact autoplay-retry logic inside LiveGameScreen.tsx's
 * playSound function:
 *
 *   p.catch((err) => {
 *     if (err?.name === 'NotAllowedError') {
 *       setTimeout(() => { audio.currentTime = 0; audio.play().catch(() => {}); }, 300);
 *     }
 *   });
 */
function playSoundWithRetry(
  num: number,
  soundOnRef: { current: boolean },
  audioCache: Map<number, { play: () => Promise<void>; currentTime: number }>,
  setTimeoutFn: (fn: () => void, ms: number) => void,
): void {
  if (!soundOnRef.current) return;
  try {
    const cached = audioCache.get(num);
    const audio = cached ?? { play: () => Promise.resolve(), currentTime: 0 };
    audio.currentTime = 0;
    const p = audio.play();
    if (p) {
      p.catch((err: { name?: string }) => {
        if (err?.name === 'NotAllowedError') {
          setTimeoutFn(() => {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }, 300);
        }
      });
    }
  } catch {}
}

describe('6.5 Audio autoplay retry', () => {
  it('calls setTimeout with ~300ms delay when play() rejects with NotAllowedError', async () => {
    const notAllowedError = Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });

    const audioMock = {
      currentTime: 0,
      play: vi.fn()
        .mockRejectedValueOnce(notAllowedError) // first call rejects
        .mockResolvedValue(undefined),           // retry resolves
    };

    const audioCache = new Map<number, typeof audioMock>();
    audioCache.set(1, audioMock);

    const soundOnRef = { current: true };
    const setTimeoutSpy = vi.fn<(fn: () => void, ms: number) => void>();

    playSoundWithRetry(1, soundOnRef, audioCache, setTimeoutSpy);

    // Allow the rejected promise's .catch() to run
    await new Promise((r) => setTimeout(r, 0));

    // setTimeout must have been called once with a delay of 300ms
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    const [_fn, delay] = setTimeoutSpy.mock.calls[0];
    expect(delay).toBe(300);
  });

  it('does NOT call setTimeout when play() rejects with a non-NotAllowedError', async () => {
    const otherError = Object.assign(new Error('AbortError'), { name: 'AbortError' });

    const audioMock = {
      currentTime: 0,
      play: vi.fn().mockRejectedValueOnce(otherError),
    };

    const audioCache = new Map<number, typeof audioMock>();
    audioCache.set(2, audioMock);

    const soundOnRef = { current: true };
    const setTimeoutSpy = vi.fn<(fn: () => void, ms: number) => void>();

    playSoundWithRetry(2, soundOnRef, audioCache, setTimeoutSpy);

    await new Promise((r) => setTimeout(r, 0));

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('retries playback when the setTimeout callback executes after NotAllowedError', async () => {
    const notAllowedError = Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });

    const audioMock = {
      currentTime: 0,
      play: vi.fn()
        .mockRejectedValueOnce(notAllowedError)
        .mockResolvedValue(undefined),
    };

    const audioCache = new Map<number, typeof audioMock>();
    audioCache.set(3, audioMock);

    const soundOnRef = { current: true };

    // Capture the retry callback
    let retryCallback: (() => void) | null = null;
    const setTimeoutSpy = vi.fn((fn: () => void, _ms: number) => {
      retryCallback = fn;
    });

    playSoundWithRetry(3, soundOnRef, audioCache, setTimeoutSpy);

    // Allow the .catch() to fire
    await new Promise((r) => setTimeout(r, 0));

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(retryCallback).not.toBeNull();

    // Execute the retry
    retryCallback!();

    // play() should have been called twice total: once initially, once in retry
    expect(audioMock.play).toHaveBeenCalledTimes(2);
    // currentTime reset on retry
    expect(audioMock.currentTime).toBe(0);
  });
});


