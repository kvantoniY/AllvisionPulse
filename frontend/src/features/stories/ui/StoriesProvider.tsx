'use client';

import { PropsWithChildren, useMemo, useState } from 'react';
import { useGetStoriesRailQuery } from '@/shared/api/storiesApi';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { StoriesUiContext, type StoriesUiContextValue } from './StoriesContext';

type ViewerState = { userId: string; storyId?: string | null } | null;

export function StoriesProvider({ children }: PropsWithChildren) {
  useGetStoriesRailQuery(undefined, { refetchOnFocus: true, refetchOnReconnect: true });

  const [viewer, setViewer] = useState<ViewerState>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const value = useMemo<StoriesUiContextValue>(() => ({
    openViewer: (userId, storyId) => setViewer({ userId, storyId }),
    closeViewer: () => setViewer(null),
    openCreator: () => setCreatorOpen(true),
    closeCreator: () => setCreatorOpen(false),
  }), []);

  return (
    <StoriesUiContext.Provider value={value}>
      {children}
      <StoryViewer
        viewer={viewer}
        onChangeViewer={setViewer}
        onClose={() => setViewer(null)}
      />
      <StoryCreator open={creatorOpen} onClose={() => setCreatorOpen(false)} onCreated={(userId) => setViewer({ userId })} />
    </StoriesUiContext.Provider>
  );
}
