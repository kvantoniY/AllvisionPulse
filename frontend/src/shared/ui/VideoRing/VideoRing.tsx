'use client';

import type { CSSProperties } from 'react';
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
  showCenterControl?: boolean;
  showTimePill?: boolean;
}

const SIZE_MAP = {
  small: 184,
  medium: 388,
  large: 420,
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
  showCenterControl = true,
  showTimePill = true,
}: VideoRingProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const resolvedVideo = src ? internalVideoRef.current : videoElement;
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay));
  const [isReady, setIsReady] = useState(!src);
  const [localDuration, setLocalDuration] = useState(duration);
  const [localCurrentTime, setLocalCurrentTime] = useState(currentTime);

  useEffect(() => {
    setLocalDuration(duration);
  }, [duration]);

  useEffect(() => {
    setLocalCurrentTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    setIsReady(!src);
  }, [src]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = resolvedVideo;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsReady(false);
    const handleLoaded = () => setIsReady(true);
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
      setIsReady(true);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('loadeddata', handleLoaded);
    video.addEventListener('canplay', handleLoaded);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('canplay', handleLoaded);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [resolvedVideo, src]);

  const resolvedDuration = src ? localDuration : duration;
  const resolvedCurrentTime = src ? localCurrentTime : currentTime;
  const progress = resolvedDuration > 0 ? Math.max(0, Math.min(1, resolvedCurrentTime / resolvedDuration)) : 0;
  const displayedTime = resolvedCurrentTime > 0 ? resolvedCurrentTime : resolvedDuration;
  const diameter = SIZE_MAP[size];
  const ringRadius = diameter / 2 - 6;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - progress);
  const style = useMemo(() => ({ '--video-ring-size': `${diameter}px` } as CSSProperties), [diameter]);

  const applySeekFromPointer = (clientX: number, clientY: number) => {
    if ((!onSeek && !src) || !resolvedDuration || !isReady) return;
    const shell = (src ? internalVideoRef.current?.closest(`.${styles.shell}`) : resolvedVideo?.closest?.(`.${styles.shell}`)) as HTMLElement | null;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX);
    const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const ratio = normalized / (Math.PI * 2);
    const nextTime = resolvedDuration * ratio;
    if (onSeek) onSeek(nextTime);
    if (src && resolvedVideo) {
      resolvedVideo.currentTime = nextTime;
      setLocalCurrentTime(nextTime);
    }
  };

  const handleProgressPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-video-ring-control="true"]')) return;
    if ((!onSeek && !src) || !resolvedDuration || !isReady) return;

    event.preventDefault();
    applySeekFromPointer(event.clientX, event.clientY);

    const handleMove = (moveEvent: PointerEvent) => applySeekFromPointer(moveEvent.clientX, moveEvent.clientY);
    const handleUp = (upEvent: PointerEvent) => {
      applySeekFromPointer(upEvent.clientX, upEvent.clientY);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      dragCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  };

  const togglePlayback = async () => {
    const video = resolvedVideo;
    if (!video) return;

    if (!isReady && src) {
      try {
        video.load();
      } catch {
        // ignore
      }
    }

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

  return (
    <div className={[styles.videoRing, !isReady ? styles.videoRingLoading : '', className].filter(Boolean).join(' ')} style={style}>
      <div className={styles.shell} onPointerDown={handleProgressPointerDown} data-message-interactive="true">
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
              className={[styles.video, !isReady ? styles.videoBlurred : ''].filter(Boolean).join(' ')}
              src={src}
              autoPlay={autoPlay}
              muted={muted}
              playsInline
              preload="metadata"
              controls={controls}
            />
          ) : (
            <div className={styles.videoHost}>
              <div className={styles.videoHostInner} ref={(node) => {
                if (!node || !videoElement || node.firstChild === videoElement) return;
                node.innerHTML = '';
                node.appendChild(videoElement);
                videoElement.classList.add(styles.videoExternal);
                videoElement.muted = muted;
                videoElement.playsInline = true;
              }} />
            </div>
          )}
        </div>

        {showTimePill ? <div className={styles.timePill}>{formatTime(displayedTime)}</div> : null}

        {showCenterControl ? (
          <button
            type="button"
            className={styles.playButton}
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            data-video-ring-control="true"
            data-message-interactive="true"
          >
            {isReady ? (isPlaying ? <PauseIcon /> : <PlayIcon />) : <LoadingSpinner />}
          </button>
        ) : null}

        {!isReady ? (
          <div className={styles.loadingOverlay} aria-hidden="true">
            <LoadingSpinner compact />
          </div>
        ) : null}
      </div>
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
