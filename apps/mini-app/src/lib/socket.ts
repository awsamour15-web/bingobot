import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@fidel/shared';
import { getJwtFromStorage } from './auth-storage';

// Connect to the same origin as the page (or a configured WebSocket URL).
// In dev, set VITE_API_URL=http://localhost:3000 so the socket connects to the backend.
const WS_URL = import.meta.env.VITE_API_URL ?? '';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(WS_URL, {
  autoConnect: false,
  // Prefer WebSocket directly — avoids the polling→upgrade round-trip latency
  transports: ['websocket', 'polling'],
  // Optimize reconnection for smoother experience
  reconnectionDelay: 1000,
  reconnectionDelayMax: 3000,
  timeout: 10000,
  auth: (cb) => {
    // Fetch the JWT dynamically at connection time so the token is always fresh.
    cb({ token: getJwtFromStorage() ?? '' });
  },
});
