'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AudioMessage.module.css';

export interface AudioMessageProps {
  url: string;
  duration?: number;
  title?: string;
  className?: string;
}

const BAR_COUNT = 48;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildWaveform(url: string) {
  const seed = hashString(url) || 1;
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const sine = Math.sin((seed + index * 13) * 0.11);
    const cosine = Math.cos((seed + index * 7) * 0.08);
    const value = Math.abs(sine * 0.56 + cosine * 0.44);
    return 0.22 + value * 0.78;
  });
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioMessage({ url, duration = 0, title = 'Голосовое сообщение', className }: AudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(duration);
  const waveform = useMemo(() => buildWaveform(url), [url]);

  useEffect(() => {
    setResolvedDuration(duration);
  }, [duration]);

  useEffect(() => {
    setIsReady(false);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [url]);

  useEffect(() => () => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(audio.duration);
      }
    };

    const syncCurrentTime = () => setCurrentTime(audio.currentTime || 0);
    const markReady = () => {
      syncDuration();
      setIsReady(true);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsReady(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('loadedmetadata', markReady);
    audio.addEventListener('loadeddata', markReady);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('canplay', markReady);
    audio.addEventListener('canplaythrough', markReady);
    audio.addEventListener('progress', syncDuration);
    audio.addEventListener('timeupdate', syncCurrentTime);
    audio.addEventListener('seeked', syncCurrentTime);
    audio.addEventListener('ended', handleEnded);

    if (audio.readyState >= 1) {
      markReady();
      syncCurrentTime();
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('loadedmetadata', markReady);
      audio.removeEventListener('loadeddata', markReady);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('canplay', markReady);
      audio.removeEventListener('canplaythrough', markReady);
      audio.removeEventListener('progress', syncDuration);
      audio.removeEventListener('timeupdate', syncCurrentTime);
      audio.removeEventListener('seeked', syncCurrentTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  const playbackProgress = resolvedDuration > 0 ? Math.min(1, currentTime / resolvedDuration) : 0;

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isReady) {
      try {
        audio.load();
      } catch {
        // ignore
      }
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      // ignore browser gesture restrictions
    }
  };

  const commitSeek = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !resolvedDuration) return;
    const nextTime = resolvedDuration * Math.max(0, Math.min(1, ratio));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const ratioFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !resolvedDuration || !isReady) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(`.${styles.playButton}`)) return;

    const apply = (clientX: number) => {
      const ratio = ratioFromClientX(clientX);
      if (ratio == null) return;
      commitSeek(ratio);
    };

    event.preventDefault();
    apply(event.clientX);

    const handleMove = (moveEvent: PointerEvent) => apply(moveEvent.clientX);
    const handleUp = (upEvent: PointerEvent) => {
      apply(upEvent.clientX);
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  };

  return (
    <div className={[styles.audioMessage, !isReady ? styles.audioMessageLoading : '', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.playButton}
        onClick={togglePlayPause}
        aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        data-message-interactive="true"
      >
        {isReady ? (isPlaying ? <PauseIcon /> : <PlayIcon />) : <LoadingSpinner />}
      </button>

      <div className={styles.content}>
        <div ref={trackRef} className={styles.waveformTrack} role="group" aria-label="Голосовое сообщение" data-message-interactive="true" onPointerDown={handleTrackPointerDown}>
          <div className={styles.waveProgress} style={{ width: `${playbackProgress * 100}%` }} aria-hidden="true" />
          <div className={styles.waveformBars} aria-hidden="true">
            {waveform.map((value, index) => {
              const active = index / (waveform.length - 1 || 1) <= playbackProgress;
              return (
                <span
                  key={`${url}-${index}`}
                  className={[styles.waveBar, active ? styles.waveBarActive : ''].filter(Boolean).join(' ')}
                  style={{ height: `${Math.round(10 + value * 18)}px` }}
                />
              );
            })}
          </div>
          <input
            className={styles.scrubber}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(playbackProgress * 1000)}
            onChange={(event) => commitSeek(Number(event.currentTarget.value) / 1000)}
            aria-label="Прокрутка голосового сообщения"
            data-message-interactive="true"
          />
          <div className={styles.progressThumb} style={{ left: `${playbackProgress * 100}%` }} aria-hidden="true" />
          {!isReady ? <div className={styles.trackLoadingOverlay}><LoadingSpinner compact /></div> : null}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.primaryMeta}>{formatTime(currentTime)}</span>
          <span className={styles.secondaryMeta}>{title}</span>
          <span className={styles.totalMeta}>{formatTime(resolvedDuration)}</span>
        </div>
      </div>

      <audio ref={audioRef} src={url} preload="metadata" playsInline />
    </div>
  );
}

function LoadingSpinner({ compact = false }: { compact?: boolean }) {
  return <span className={[styles.spinner, compact ? styles.spinnerCompact : ''].filter(Boolean).join(' ')} aria-hidden="true" />;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.9-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </svg>
  );
}
