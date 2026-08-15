import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import * as auth from '../lib/auth';

function setupLocalStorage() {
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
      },
      writable: true,
      configurable: true,
    });
  }
}

describe('apiRequest 404 handling', () => {
  beforeEach(() => {
    setupLocalStorage();
    localStorage.clear();
    localStorage.setItem('jwt', 'fake-jwt');
    localStorage.setItem('playerId', 'player-1');
    vi.restoreAllMocks();
  });

  it('does not re-auth for a missing round 404', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'NOT_FOUND', message: 'Round not found' }),
    } as Response);

    const reAuthSpy = vi.spyOn(auth, 'reAuth').mockResolvedValue();

    await expect(api.apiRequest('GET', '/api/rounds/abc123')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(reAuthSpy).not.toHaveBeenCalled();
  });

  it('re-auths only when the backend says the player record is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'NOT_FOUND', message: 'Player not found' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);

    const reAuthSpy = vi.spyOn(auth, 'reAuth').mockResolvedValue();

    await expect(api.apiRequest('GET', '/api/players/me')).resolves.toEqual({ ok: true });

    expect(reAuthSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
