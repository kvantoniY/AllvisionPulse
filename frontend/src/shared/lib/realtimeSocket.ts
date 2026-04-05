import type { Socket } from 'socket.io-client';

// Simple singleton to share socket.io instance between components.
// RealtimeProvider is the source of truth.

let socket: Socket | null = null;
const listeners = new Set<(next: Socket | null) => void>();

export function setRealtimeSocket(next: Socket | null) {
  socket = next;
  listeners.forEach((listener) => listener(next));
}

export function getRealtimeSocket(): Socket | null {
  return socket;
}

export function subscribeRealtimeSocket(listener: (next: Socket | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
