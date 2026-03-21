import type { Socket } from 'socket.io-client';

// Simple singleton to share socket.io instance between components.
// RealtimeProvider is the source of truth.

let socket: Socket | null = null;

export function setRealtimeSocket(next: Socket | null) {
  socket = next;
}

export function getRealtimeSocket(): Socket | null {
  return socket;
}
