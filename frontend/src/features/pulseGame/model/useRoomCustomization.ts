'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { RoomTheme } from '../lib/types';

const ROOM_THEME_STORAGE_KEY = 'pulse.room.theme';
const EVENT = 'pulse:room-customization';

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key == null || event.key === ROOM_THEME_STORAGE_KEY) {
      listener();
    }
  };
  const onCustom = () => listener();

  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, onCustom);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, onCustom);
  };
}

function readRoomTheme(): RoomTheme {
  if (typeof window === 'undefined') return 'default';

  const raw = window.localStorage.getItem(ROOM_THEME_STORAGE_KEY);
  return raw === 'blue' ? 'blue' : 'default';
}

function getServerSnapshot(): RoomTheme {
  return 'default';
}

function emitRoomCustomizationChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function useRoomCustomization(): {
  roomTheme: RoomTheme;
  setRoomTheme: (next: RoomTheme) => void;
} {
  const roomTheme = useSyncExternalStore(subscribe, readRoomTheme, getServerSnapshot);

  const setRoomTheme = useCallback((next: RoomTheme) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ROOM_THEME_STORAGE_KEY, next);
    emitRoomCustomizationChanged();
  }, []);

  return {
    roomTheme,
    setRoomTheme,
  };
}
