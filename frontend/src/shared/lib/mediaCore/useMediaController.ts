'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPersistedMediaSnapshot,
  persistMediaSnapshot,
  registerMediaController,
  releaseExclusivePlayback,
  requestExclusivePlayback,
} from './mediaPlaybackStore';
import type { MediaKind, MediaPlaybackPhase } from './types';

type MediaControllerOptions = {
  mediaId: string;
  kind: MediaKind;
  src?: string | null;
  durationHint?: number | null;
  activate?: boolean;
  eager?: boolean;
  autoPlay?: boolean;
  onDethroned?: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasUsableDuration(value?: number | null) {
  return Number.isFinite(value) && Number(value) > 0;
}

function getMissingFileMessage(kind: MediaKind) {
  return kind === 'video' ? 'Видеофайл недоступен' : 'Аудиофайл недоступен';
}

function getPlaybackErrorMessage(kind: MediaKind) {
  return kind === 'video' ? 'Не удалось загрузить видео' : 'Не удалось загрузить аудио';
}

function getInitialPhase({
  src,
  shouldMount,
}: {
  src?: string | null;
  shouldMount: boolean;
}): MediaPlaybackPhase {
  if (!src) return 'error';
  return shouldMount ? 'loading-metadata' : 'idle';
}

export function useMediaController({
  mediaId,
  kind,
  src,
  durationHint,
  activate = false,
  eager = false,
  autoPlay = false,
  onDethroned,
}: MediaControllerOptions) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const onDethronedRef = useRef(onDethroned);
  onDethronedRef.current = onDethroned;
  const frameRef = useRef<number | null>(null);
  const restoredTimeRef = useRef(false);
  const hasPlayedRef = useRef(false);

  const snapshot = useMemo(() => getPersistedMediaSnapshot(mediaId), [mediaId]);
  const initialTime = snapshot && !snapshot.ended ? snapshot.currentTime : 0;
  const initialDuration = hasUsableDuration(durationHint) ? Number(durationHint) : snapshot?.duration ?? 0;
  const shouldInitiallyMount = Boolean(src) && (eager || activate || autoPlay || initialTime > 0);

  const [phase, setPhase] = useState<MediaPlaybackPhase>(() => getInitialPhase({ src, shouldMount: shouldInitiallyMount }));
  const [duration, setDuration] = useState(initialDuration);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [bufferedRatio, setBufferedRatio] = useState(snapshot?.bufferedRatio ?? 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(src ? null : getMissingFileMessage(kind));
  const [slowNetwork, setSlowNetwork] = useState(false);
  const [shouldMountMedia, setShouldMountMedia] = useState(shouldInitiallyMount);
  const [shouldResumePlayback, setShouldResumePlayback] = useState(autoPlay);
  const [hasVisualFrame, setHasVisualFrame] = useState(kind === 'audio');

  hasPlayedRef.current = hasPlayedRef.current || Boolean(snapshot?.hasPlayed) || initialTime > 0;

  const stopFrameLoop = useCallback(() => {
    if (frameRef.current == null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const syncBuffered = useCallback((media: HTMLMediaElement) => {
    if (!hasUsableDuration(media.duration) || media.buffered.length === 0) {
      setBufferedRatio(0);
      return;
    }

    let maxEnd = 0;
    for (let index = 0; index < media.buffered.length; index += 1) {
      maxEnd = Math.max(maxEnd, media.buffered.end(index));
    }

    setBufferedRatio(clamp(maxEnd / media.duration, 0, 1));
  }, []);

  const syncDuration = useCallback((media: HTMLMediaElement) => {
    if (hasUsableDuration(media.duration)) {
      setDuration(media.duration);
    }
  }, []);

  const syncCurrentTime = useCallback((media: HTMLMediaElement) => {
    setCurrentTime(media.currentTime || 0);
  }, []);

  const startFrameLoop = useCallback(() => {
    const tick = () => {
      const media = mediaRef.current;
      if (!media) {
        frameRef.current = null;
        return;
      }

      syncCurrentTime(media);
      syncBuffered(media);

      if (!media.paused && !media.ended) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    stopFrameLoop();
    frameRef.current = window.requestAnimationFrame(tick);
  }, [stopFrameLoop, syncBuffered, syncCurrentTime]);

  const applySettledPhase = useCallback((media: HTMLMediaElement) => {
    syncDuration(media);
    syncBuffered(media);
    syncCurrentTime(media);

    if (media.ended || (hasUsableDuration(media.duration) && media.currentTime >= Math.max(0, media.duration - 0.08))) {
      setPhase('ended');
      return;
    }

    if (!media.paused) {
      setPhase('playing');
      return;
    }

    if ((media.currentTime || 0) > 0.04 || hasPlayedRef.current) {
      setPhase('paused');
      return;
    }

    setPhase('ready');
  }, [syncBuffered, syncCurrentTime, syncDuration]);

  const attemptPlay = useCallback(async () => {
    const media = mediaRef.current;
    if (!media || !src) return;

    requestExclusivePlayback(mediaId);
    setErrorMessage(null);
    setShouldMountMedia(true);

    if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
      setPhase('loading-metadata');
      media.load();
    } else if (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setPhase('loading-media');
    }

    try {
      await media.play();
    } catch {
      releaseExclusivePlayback(mediaId);
      applySettledPhase(media);
    } finally {
      setShouldResumePlayback(false);
    }
  }, [applySettledPhase, mediaId, src]);

  const pause = useCallback(() => {
    setShouldResumePlayback(false);
    const media = mediaRef.current;
    if (!media) {
      releaseExclusivePlayback(mediaId);
      return;
    }

    if (!media.paused) {
      media.pause();
    }

    releaseExclusivePlayback(mediaId);
  }, [mediaId]);

  const play = useCallback(async () => {
    if (!src) {
      setErrorMessage(getMissingFileMessage(kind));
      setPhase('error');
      return;
    }

    setShouldMountMedia(true);
    const media = mediaRef.current;
    if (!media) {
      setShouldResumePlayback(true);
      return;
    }

    await attemptPlay();
  }, [attemptPlay, kind, src]);

  const retry = useCallback(() => {
    if (!src) {
      setErrorMessage(getMissingFileMessage(kind));
      setPhase('error');
      return;
    }

    setShouldMountMedia(true);
    setErrorMessage(null);
    setSlowNetwork(false);
    setHasVisualFrame(kind === 'audio');
    restoredTimeRef.current = false;

    const media = mediaRef.current;
    if (!media) {
      setShouldResumePlayback(false);
      setPhase('loading-metadata');
      return;
    }

    setPhase('loading-metadata');
    media.load();
  }, [kind, src]);

  const seek = useCallback((ratio: number) => {
    const media = mediaRef.current;
    const resolvedDuration = hasUsableDuration(duration) ? duration : media?.duration ?? 0;
    if (!media || !hasUsableDuration(resolvedDuration)) return;

    const nextTime = clamp(ratio, 0, 1) * resolvedDuration;
    media.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (media.paused) {
      setPhase(nextTime > 0.04 ? 'paused' : 'ready');
    }
  }, [duration]);

  const togglePlayback = useCallback(async () => {
    if (phase === 'playing') {
      pause();
      return;
    }

    await play();
  }, [pause, phase, play]);

  useEffect(() => {
    const nextSnapshot = getPersistedMediaSnapshot(mediaId);
    const nextTime = nextSnapshot && !nextSnapshot.ended ? nextSnapshot.currentTime : 0;
    const nextDuration = hasUsableDuration(durationHint) ? Number(durationHint) : nextSnapshot?.duration ?? 0;
    const nextShouldMount = Boolean(src) && (eager || autoPlay || nextTime > 0);

    restoredTimeRef.current = false;
    hasPlayedRef.current = Boolean(nextSnapshot?.hasPlayed) || nextTime > 0;
    stopFrameLoop();
    releaseExclusivePlayback(mediaId);
    setDuration(nextDuration);
    setCurrentTime(nextTime);
    setBufferedRatio(nextSnapshot?.bufferedRatio ?? 0);
    setErrorMessage(src ? null : getMissingFileMessage(kind));
    setSlowNetwork(false);
    setShouldMountMedia(nextShouldMount);
    setShouldResumePlayback(autoPlay);
    setHasVisualFrame(kind === 'audio');
    setPhase(getInitialPhase({ src, shouldMount: nextShouldMount }));

    const media = mediaRef.current;
    if (media) {
      media.pause();
      try {
        media.currentTime = 0;
      } catch {
        // Ignore seek reset failures.
      }
    }
  }, [autoPlay, durationHint, eager, kind, mediaId, src, stopFrameLoop]);

  useEffect(() => {
    if (!src || shouldMountMedia || (!activate && !eager)) return;
    setShouldMountMedia(true);
    setPhase('loading-metadata');
  }, [activate, eager, shouldMountMedia, src]);

  useEffect(() => {
    if (!shouldResumePlayback || !shouldMountMedia || !src) return;
    void attemptPlay();
  }, [attemptPlay, shouldMountMedia, shouldResumePlayback, src]);

  useEffect(() => {
    if (!(phase === 'loading-metadata' || phase === 'loading-media' || phase === 'buffering')) {
      setSlowNetwork(false);
      return;
    }

    const timeout = window.setTimeout(() => setSlowNetwork(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (!shouldMountMedia || !src) return;

    const media = mediaRef.current;
    if (!media) return;

    const restoreTimeIfNeeded = () => {
      if (restoredTimeRef.current) return;
      const nextSnapshot = getPersistedMediaSnapshot(mediaId);
      if (!nextSnapshot || nextSnapshot.ended || !hasUsableDuration(nextSnapshot.currentTime)) {
        restoredTimeRef.current = true;
        return;
      }

      const safeDuration = hasUsableDuration(media.duration) ? media.duration : duration;
      if (!hasUsableDuration(safeDuration)) return;

      const safeTime = Math.min(nextSnapshot.currentTime, Math.max(0, safeDuration - 0.18));
      if (safeTime <= 0) {
        restoredTimeRef.current = true;
        return;
      }

      try {
        media.currentTime = safeTime;
        setCurrentTime(safeTime);
      } catch {
        // Ignore browsers that reject early seek.
      }

      restoredTimeRef.current = true;
    };

    const handleLoadStart = () => {
      setErrorMessage(null);
      setPhase('loading-metadata');
      if (kind === 'video') {
        setHasVisualFrame(false);
      }
    };

    const handleLoadedMetadata = () => {
      syncDuration(media);
      restoreTimeIfNeeded();
      setPhase('loading-media');
    };

    const handleLoadedData = () => {
      if (kind === 'video') {
        setHasVisualFrame(true);
      }

      applySettledPhase(media);
    };

    const handleCanPlay = () => {
      applySettledPhase(media);
    };

    const handlePlay = () => {
      hasPlayedRef.current = true;
      setErrorMessage(null);
      setSlowNetwork(false);
      setPhase('playing');
      requestExclusivePlayback(mediaId);
      startFrameLoop();
    };

    const handlePause = () => {
      stopFrameLoop();
      releaseExclusivePlayback(mediaId);
      applySettledPhase(media);
    };

    const handleWaiting = () => {
      if (media.ended) return;
      setPhase('buffering');
    };

    const handleTimeUpdate = () => {
      syncCurrentTime(media);
    };

    const handleProgress = () => {
      syncBuffered(media);
    };

    const handleEnded = () => {
      stopFrameLoop();
      releaseExclusivePlayback(mediaId);
      setCurrentTime(0);
      setBufferedRatio(0);
      setPhase('ended');
      try {
        media.currentTime = 0;
      } catch {
        // Ignore seek reset failures.
      }
    };

    const handleError = () => {
      stopFrameLoop();
      releaseExclusivePlayback(mediaId);
      setErrorMessage(getPlaybackErrorMessage(kind));
      setPhase('error');
    };

    media.addEventListener('loadstart', handleLoadStart);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('loadeddata', handleLoadedData);
    media.addEventListener('canplay', handleCanPlay);
    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('waiting', handleWaiting);
    media.addEventListener('stalled', handleWaiting);
    const handleDurationChange = () => {
      syncDuration(media);
    };

    const handleSeeked = () => {
      syncCurrentTime(media);
      syncBuffered(media);
      applySettledPhase(media);
    };

    media.addEventListener('progress', handleProgress);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('durationchange', handleDurationChange);
    media.addEventListener('seeked', handleSeeked);
    media.addEventListener('ended', handleEnded);
    media.addEventListener('error', handleError);

    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata();
    }

    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      handleLoadedData();
    }

    return () => {
      media.removeEventListener('loadstart', handleLoadStart);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('loadeddata', handleLoadedData);
      media.removeEventListener('canplay', handleCanPlay);
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('waiting', handleWaiting);
      media.removeEventListener('stalled', handleWaiting);
      media.removeEventListener('progress', handleProgress);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('durationchange', handleDurationChange);
      media.removeEventListener('seeked', handleSeeked);
      media.removeEventListener('ended', handleEnded);
      media.removeEventListener('error', handleError);
      stopFrameLoop();
    };
  }, [
    applySettledPhase,
    duration,
    kind,
    mediaId,
    shouldMountMedia,
    src,
    startFrameLoop,
    stopFrameLoop,
    syncBuffered,
    syncCurrentTime,
    syncDuration,
  ]);

  useEffect(() => registerMediaController(mediaId, {
    pause,
    onDethroned: () => onDethronedRef.current?.(),
  }), [mediaId, pause]);

  useEffect(() => {
    if (!src) {
      persistMediaSnapshot(mediaId, null);
      return;
    }

    persistMediaSnapshot(mediaId, {
      currentTime: phase === 'ended' ? 0 : currentTime,
      duration,
      bufferedRatio,
      phase,
      ended: phase === 'ended',
      hasPlayed: hasPlayedRef.current,
      updatedAt: Date.now(),
    });
  }, [bufferedRatio, currentTime, duration, mediaId, phase, src]);

  useEffect(() => () => {
    stopFrameLoop();
    releaseExclusivePlayback(mediaId);
  }, [mediaId, stopFrameLoop]);

  const preload = useMemo<'none' | 'metadata' | 'auto'>(() => {
    if (!shouldMountMedia) return 'none';
    if (phase === 'playing' || phase === 'buffering' || shouldResumePlayback || eager) return 'auto';
    return 'metadata';
  }, [eager, phase, shouldMountMedia, shouldResumePlayback]);

  const progress = hasUsableDuration(duration) ? clamp(currentTime / duration, 0, 1) : 0;
  const bufferedProgress = clamp(Math.max(bufferedRatio, progress), 0, 1);

  return {
    mediaRef,
    phase,
    currentTime,
    duration,
    progress,
    bufferedRatio: bufferedProgress,
    errorMessage,
    slowNetwork,
    shouldMountMedia,
    hasVisualFrame,
    preload,
    isPlaying: phase === 'playing',
    isReady: phase === 'ready' || phase === 'playing' || phase === 'paused' || phase === 'ended',
    canSeek: shouldMountMedia && hasUsableDuration(duration) && phase !== 'loading-metadata' && phase !== 'error',
    pause,
    play,
    retry,
    seek,
    togglePlayback,
  };
}
