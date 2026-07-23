import WebApp from '@twa-dev/sdk';
import { login } from './api';

// In development, WebApp.initData may be empty. Use a mock fallback.
const DEV_MOCK_INIT_DATA = 'mock_init_data_for_development';

export async function initAuth(): Promise<void> {
  if (isLoggedIn()) return;

  const initData = WebApp.initData || DEV_MOCK_INIT_DATA;

  // Parse optional start param from WebApp.initDataUnsafe
  const startParam = (WebApp.initDataUnsafe as { start_param?: string }).start_param;

  const { token, playerId } = await login(initData, startParam);
  localStorage.setItem('jwt', token);
  localStorage.setItem('playerId', playerId);
}

export function getPlayerId(): string | null {
  return localStorage.getItem('playerId');
}

export function getJwt(): string | null {
  return localStorage.getItem('jwt');
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('jwt') && !!localStorage.getItem('playerId');
}
