'use client'

import { createContext, useContext } from 'react';

type StoriesUiContextValue = {
  openViewer: (userId: string, storyId?: string | null) => void;
  closeViewer: () => void;
  openCreator: () => void;
  closeCreator: () => void;
};

export const StoriesUiContext = createContext<StoriesUiContextValue | null>(null);

export function useStoriesUi() {
  const ctx = useContext(StoriesUiContext);
  if (!ctx) throw new Error('useStoriesUi must be used within StoriesProvider');
  return ctx;
}

export type { StoriesUiContextValue };
