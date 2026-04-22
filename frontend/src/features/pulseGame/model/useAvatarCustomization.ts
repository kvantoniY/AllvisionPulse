'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { AvatarGender } from '../lib/types';
import {
  createDefaultAvatarAppearance,
  sanitizeAvatarAppearance,
  type PulseAvatarAppearance,
} from '../lib/avatarAppearance';

const GENDER_STORAGE_KEY = 'pulse.avatar.gender';
const LEGACY_APPEARANCE_STORAGE_KEY = 'pulse.avatar.appearance';
const EVENT = 'pulse:avatar-customization';

function getAppearanceStorageKey(gender: AvatarGender): string {
  return `pulse.avatar.appearance.${gender}`;
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.key == null ||
      event.key === GENDER_STORAGE_KEY ||
      event.key === LEGACY_APPEARANCE_STORAGE_KEY ||
      event.key === getAppearanceStorageKey('male') ||
      event.key === getAppearanceStorageKey('female')
    ) {
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

function readGender(): AvatarGender {
  if (typeof window === 'undefined') return 'male';
  const raw = window.localStorage.getItem(GENDER_STORAGE_KEY);
  return raw === 'female' ? 'female' : 'male';
}

function readAppearance(gender: AvatarGender): PulseAvatarAppearance {
  if (typeof window === 'undefined') return createDefaultAvatarAppearance(gender);

  const raw = window.localStorage.getItem(getAppearanceStorageKey(gender));
  if (!raw) {
    const legacyRaw = window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY);
    if (!legacyRaw || readGender() !== gender) {
      return createDefaultAvatarAppearance(gender);
    }

    try {
      return sanitizeAvatarAppearance(JSON.parse(legacyRaw), gender);
    } catch {
      return createDefaultAvatarAppearance(gender);
    }
  }

  try {
    return sanitizeAvatarAppearance(JSON.parse(raw), gender);
  } catch {
    return createDefaultAvatarAppearance(gender);
  }
}

function readAppearanceSnapshot(): string {
  const gender = readGender();
  return JSON.stringify(readAppearance(gender));
}

function getServerGenderSnapshot(): AvatarGender {
  return 'male';
}

function getServerAppearanceSnapshot(): string {
  return JSON.stringify(createDefaultAvatarAppearance('male'));
}

function emitCustomizationChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function useAvatarCustomization(): {
  gender: AvatarGender;
  appearance: PulseAvatarAppearance;
  setGender: (next: AvatarGender) => void;
  setAppearance: (next: PulseAvatarAppearance) => void;
  patchAppearance: (patch: Partial<PulseAvatarAppearance>) => void;
  resetAppearance: (gender?: AvatarGender) => void;
} {
  const gender = useSyncExternalStore(subscribe, readGender, getServerGenderSnapshot);
  const appearanceSnapshot = useSyncExternalStore(
    subscribe,
    readAppearanceSnapshot,
    getServerAppearanceSnapshot,
  );
  const appearance = useMemo(() => {
    try {
      return sanitizeAvatarAppearance(JSON.parse(appearanceSnapshot), gender);
    } catch {
      return createDefaultAvatarAppearance(gender);
    }
  }, [appearanceSnapshot, gender]);

  const setGender = useCallback((next: AvatarGender) => {
    if (typeof window === 'undefined') return;

    const currentGender = readGender();
    const currentKey = getAppearanceStorageKey(currentGender);
    const currentSpecificRaw = window.localStorage.getItem(currentKey);
    const legacyRaw = window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY);

    if (!currentSpecificRaw && legacyRaw) {
      try {
        const migratedAppearance = sanitizeAvatarAppearance(JSON.parse(legacyRaw), currentGender);
        window.localStorage.setItem(currentKey, JSON.stringify(migratedAppearance));
      } catch {
        window.localStorage.setItem(
          currentKey,
          JSON.stringify(createDefaultAvatarAppearance(currentGender)),
        );
      }
    }

    const nextKey = getAppearanceStorageKey(next);
    const existingRaw = window.localStorage.getItem(nextKey);
    let normalizedAppearance = createDefaultAvatarAppearance(next);

    if (existingRaw) {
      try {
        normalizedAppearance = sanitizeAvatarAppearance(JSON.parse(existingRaw), next);
      } catch {
        normalizedAppearance = createDefaultAvatarAppearance(next);
      }
    }

    window.localStorage.setItem(GENDER_STORAGE_KEY, next);
    window.localStorage.setItem(nextKey, JSON.stringify(normalizedAppearance));
    emitCustomizationChanged();
  }, []);

  const setAppearance = useCallback((next: PulseAvatarAppearance) => {
    if (typeof window === 'undefined') return;
    const currentGender = readGender();
    const normalizedAppearance = sanitizeAvatarAppearance(next, currentGender);
    window.localStorage.setItem(
      getAppearanceStorageKey(currentGender),
      JSON.stringify(normalizedAppearance),
    );
    emitCustomizationChanged();
  }, []);

  const patchAppearance = useCallback((patch: Partial<PulseAvatarAppearance>) => {
    if (typeof window === 'undefined') return;
    const currentGender = readGender();
    const currentAppearance = readAppearance(currentGender);
    const nextAppearance = sanitizeAvatarAppearance(
      { ...currentAppearance, ...patch },
      currentGender,
    );
    window.localStorage.setItem(
      getAppearanceStorageKey(currentGender),
      JSON.stringify(nextAppearance),
    );
    emitCustomizationChanged();
  }, []);

  const resetAppearance = useCallback((nextGender?: AvatarGender) => {
    if (typeof window === 'undefined') return;
    const currentGender = nextGender ?? readGender();
    window.localStorage.setItem(
      getAppearanceStorageKey(currentGender),
      JSON.stringify(createDefaultAvatarAppearance(currentGender)),
    );
    emitCustomizationChanged();
  }, []);

  return {
    gender,
    appearance,
    setGender,
    setAppearance,
    patchAppearance,
    resetAppearance,
  };
}
