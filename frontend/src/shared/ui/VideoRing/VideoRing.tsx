'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './VideoRing.module.css';

export interface VideoRingProps {
  videoElement?: HTMLVideoElement | null;
  src?: string;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  showProgress?: boolean;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
}

const SIZE_MAP = {
  small: 120,
  medium: 168,
  large: 220,
} as const;

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoRing({
  videoElement,
  src,
  duration = 0,
  currentTime = 0,
  onSeek,
  showProgress = true,
  className,
  size = 'medium',
  autoPlay = false,
  muted = false,
  controls = false,
}: VideoRingProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const resolvedVideo = src ? internalVideoRef.current : videoElement;
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay));
  const [localDuration, setLocalDuration] = useState(duration);
  const [localCurrentTime, setLocalCurrentTime] = useState(currentTime);

  useEffect(() => {
    setLocalDuration(duration);
  }, [duration]);

  useEffect(() => {
    setLocalCurrentTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    const video = resolvedVideo;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (src) setLocalCurrentTime(0);
    };
    const handleTimeUpdate = () => {
      if (src) setLocalCurrentTime(video.currentTime || 0);
    };
    const handleLoadedMetadata = () => {
      if (src && Number.isFinite(video.duration) && video.duration > 0) {
        setLocalDuration(video.duration);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [resolvedVideo, src]);

  const resolvedDuration = src ? localDuration : duration;
  const resolvedCurrentTime = src ? localCurrentTime : currentTime;
  const progress = resolvedDuration > 0 ? Math.max(0, Math.min(1, resolvedCurrentTime / resolvedDuration)) : 0;
  const diameter = SIZE_MAP[size];
  const ringRadius = diameter / 2 - 6;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - progress);
  const style = useMemo(() => ({ '--video-ring-size': `${diameter}px` } as React.CSSProperties), [diameter]);

  const togglePlayback = async () => {
    const video = resolvedVideo;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch {
        // ignore autoplay restrictions
      }
      return;
    }

    video.pause();
  };

  const handleProgressPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek && !src) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const ratio = normalized / (Math.PI * 2);
    const nextTime = resolvedDuration * ratio;
    if (onSeek) onSeek(nextTime);
    if (src && resolvedVideo) {
      resolvedVideo.currentTime = nextTime;
      setLocalCurrentTime(nextTime);
    }
  };

  return (
    <div className={[styles.videoRing, className].filter(Boolean).join(' ')} style={style}>
      <div className={styles.shell} onPointerDown={handleProgressPointer}>
        {showProgress ? (
          <svg className={styles.progressSvg} viewBox={`0 0 ${diameter} ${diameter}`} aria-hidden="true">
            <circle className={styles.progressTrack} cx={diameter / 2} cy={diameter / 2} r={ringRadius} />
            <circle
              className={styles.progressValue}
              cx={diameter / 2}
              cy={diameter / 2}
              r={ringRadius}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
        ) : null}

        <div className={styles.viewport}>
          {src ? (
            <video
              ref={internalVideoRef}
              className={styles.video}
              src={src}
              autoPlay={autoPlay}
              muted={muted}
              playsInline
              preload="metadata"
              controls={controls}
            />
          ) : (
            <div className={styles.videoFallback}>Видео</div>
          )}
        </div>

        <button type="button" className={styles.playButton} onClick={togglePlayback} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <div className={styles.caption}>{formatTime(resolvedCurrentTime || resolvedDuration)}</div>
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
