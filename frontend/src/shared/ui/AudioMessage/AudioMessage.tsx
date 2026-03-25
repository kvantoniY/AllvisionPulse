'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AudioMessage.module.css';

export interface AudioMessageProps {
  url: string;
  duration?: number;
  title?: string;
  className?: string;
}

const BAR_COUNT = 34;

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

export function AudioMessage({ url, duration = 0, title = 'Голосовое', className }: AudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(duration);
  const waveform = useMemo(() => buildWaveform(url), [url]);

  useEffect(() => {
    setResolvedDuration(duration);
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(audio.duration);
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  const playbackProgress = resolvedDuration > 0 ? Math.min(1, currentTime / resolvedDuration) : 0;

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

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

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !resolvedDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = resolvedDuration * ratio;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className={[styles.audioMessage, className].filter(Boolean).join(' ')}>
      <button type="button" className={styles.playButton} onClick={togglePlayPause} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className={styles.content}>
        <div className={styles.rowTop}>
          <span className={styles.title}>{title}</span>
          <span className={styles.duration}>{formatTime(resolvedDuration)}</span>
        </div>

        <div className={styles.waveformTrack} onClick={handleSeek} role="slider" aria-label="Прокрутка голосового сообщения" tabIndex={0}>
          <div className={styles.waveformBars}>
            {waveform.map((value, index) => {
              const active = index / (waveform.length - 1 || 1) <= playbackProgress;
              return (
                <span
                  key={`${url}-${index}`}
                  className={[styles.waveBar, active ? styles.waveBarActive : ''].filter(Boolean).join(' ')}
                  style={{ height: `${Math.round(8 + value * 18)}px` }}
                />
              );
            })}
          </div>
          <div className={styles.progressThumb} style={{ left: `${playbackProgress * 100}%` }} />
        </div>

        <div className={styles.rowBottom}>
          <span className={styles.currentTime}>{formatTime(currentTime)}</span>
          <span className={styles.caption}>{isPlaying ? 'Сейчас играет' : 'Голосовое сообщение'}</span>
        </div>
      </div>

      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  );
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
