export type MediaKind = 'audio' | 'video';

export type MediaPlaybackPhase =
  | 'idle'
  | 'loading-metadata'
  | 'loading-media'
  | 'buffering'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export type PersistedMediaSnapshot = {
  currentTime: number;
  duration: number;
  bufferedRatio: number;
  phase: MediaPlaybackPhase;
  ended: boolean;
  hasPlayed: boolean;
  updatedAt: number;
};
