'use client';

import type { PersistedMediaSnapshot } from './types';

type RegisteredController = {
  pause: () => void;
  onDethroned?: () => void;
};

const STORAGE_PREFIX = 'pulse:media:';

const snapshotCache = new Map<string, PersistedMediaSnapshot | null>();
const hydratedKeys = new Set<string>();
const controllers = new Map<string, RegisteredController>();

let activeMediaId: string | null = null;

function getStorageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function getSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getPersistedMediaSnapshot(id: string) {
  if (hydratedKeys.has(id)) {
    return snapshotCache.get(id) ?? null;
  }

  hydratedKeys.add(id);
  const storage = getSessionStorage();
  if (!storage) {
    snapshotCache.set(id, null);
    return null;
  }

  try {
    const raw = storage.getItem(getStorageKey(id));
    if (!raw) {
      snapshotCache.set(id, null);
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedMediaSnapshot;
    snapshotCache.set(id, parsed);
    return parsed;
  } catch {
    snapshotCache.set(id, null);
    return null;
  }
}

export function persistMediaSnapshot(id: string, snapshot: PersistedMediaSnapshot | null) {
  hydratedKeys.add(id);

  if (snapshot) {
    snapshotCache.set(id, snapshot);
  } else {
    snapshotCache.delete(id);
  }

  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (snapshot) {
      storage.setItem(getStorageKey(id), JSON.stringify(snapshot));
    } else {
      storage.removeItem(getStorageKey(id));
    }
  } catch {
    // Ignore storage failures.
  }
}

export function registerMediaController(id: string, controller: RegisteredController) {
  controllers.set(id, controller);

  return () => {
    if (controllers.get(id) === controller) {
      controllers.delete(id);
    }

    if (activeMediaId === id) {
      activeMediaId = null;
    }
  };
}

export function requestExclusivePlayback(id: string) {
  if (activeMediaId && activeMediaId !== id) {
    const prev = controllers.get(activeMediaId);
    prev?.pause();
    prev?.onDethroned?.();
  }

  activeMediaId = id;
}

export function releaseExclusivePlayback(id: string) {
  if (activeMediaId === id) {
    activeMediaId = null;
  }
}
