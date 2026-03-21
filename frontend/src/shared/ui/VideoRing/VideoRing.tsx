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
  small: 132,
  medium: 184,
  large: 236,
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
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = useRef(false);
  const [draggedProgress, setDraggedProgress] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localDuration, setLocalDuration] = useState(duration);
  const [localCurrentTime, setLocalCurrentTime] = useState(currentTime);
  const resolvedVideo = src ? internalVideoRef.current : videoElement;
  const resolvedDuration = src ? localDuration : duration;
  const resolvedCurrentTime = src ? localCurrentTime : currentTime;
  const progress = draggedProgress ?? (resolvedDuration > 0 ? resolvedCurrentTime / resolvedDuration : 0);
  const clampedProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const ringRadius = 52;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - clampedProgress);
  const sizePx = SIZE_MAP[size];

  useEffect(() => {
    setLocalDuration(duration);
  }, [duration]);

  useEffect(() => {
    setLocalCurrentTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    const video = internalVideoRef.current;
    if (!src || !video) return;

    const handleLoadedMetadata = () => {
      if (video.duration > 0) setLocalDuration(video.duration);
    };
    const handleTimeUpdate = () => setLocalCurrentTime(video.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setLocalCurrentTime(0);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  useEffect(() => {
    if (src) return;
    const canvas = previewCanvasRef.current;
    const video = videoElement;
    if (!canvas || !video) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      // ignore if frame is not available yet
    }
  }, [src, videoElement, currentTime, duration]);

  const seekToProgress = async (nextProgress: number) => {
    const nextTime = nextProgress * (resolvedDuration || 0);
    if (!Number.isFinite(nextTime)) return;

    if (src && internalVideoRef.current) {
      internalVideoRef.current.currentTime = nextTime;
      setLocalCurrentTime(nextTime);
      return;
    }

    onSeek?.(nextTime);
  };

  const computeProgressFromPointer = (clientX: number, clientY: number, rect: DOMRect) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    return Math.max(0, Math.min(1, angle / (Math.PI * 2)));
  };

  const bindPointerSeek = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!showProgress || !(src || onSeek) || !resolvedDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerActiveRef.current = true;

    const update = (clientX: number, clientY: number) => {
      const nextProgress = computeProgressFromPointer(clientX, clientY, rect);
      setDraggedProgress(nextProgress);
    };

    update(event.clientX, event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
    const handlePointerUp = async (upEvent: PointerEvent) => {
      const nextProgress = computeProgressFromPointer(upEvent.clientX, upEvent.clientY, rect);
      setDraggedProgress(null);
      pointerActiveRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      await seekToProgress(nextProgress);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const togglePlayback = async () => {
    const video = internalVideoRef.current;
    if (!src || !video) return;

    if (video.paused) {
      try {
        await video.play();
      } catch {
        // ignore gesture-related rejections
      }
      return;
    }

    video.pause();
  };

  const rootClassName = useMemo(
    () => [styles.videoRingContainer, styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`], className].filter(Boolean).join(' '),
    [className, size],
  );

  return (
    <div className={rootClassName}>
      {src ? (
        <video
          ref={internalVideoRef}
          className={styles.videoSurface}
          src={src}
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          muted={muted}
          loop={false}
          controls={controls}
        />
      ) : (
        <canvas ref={previewCanvasRef} className={styles.videoSurface} />
      )}

      <svg
        className={styles.ringOverlay}
        viewBox="0 0 140 140"
        style={{ width: sizePx, height: sizePx }}
        onPointerDown={bindPointerSeek}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="videoRingTrack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#86a4ff" />
            <stop offset="50%" stopColor="#6ac8ff" />
            <stop offset="100%" stopColor="#4ddc8f" />
          </linearGradient>
          <filter id="videoRingGlow">
            <feGaussianBlur stdDeviation="1.6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="70" cy="70" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
        {showProgress ? (
          <circle
            cx="70"
            cy="70"
            r={ringRadius}
            fill="none"
            stroke="url(#videoRingTrack)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            filter="url(#videoRingGlow)"
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
              transition: draggedProgress === null ? 'stroke-dashoffset 120ms linear' : 'none',
            }}
          />
        ) : null}
      </svg>

      {src ? (
        <button type="button" className={styles.centerControl} onClick={togglePlayback} aria-label={isPlaying ? 'Pause video note' : 'Play video note'}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
      ) : null}

      {showProgress ? (
        <div className={styles.timeDisplay}>
          <span className={styles.currentTime}>{formatTime(draggedProgress !== null ? draggedProgress * resolvedDuration : resolvedCurrentTime)}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.duration}>{formatTime(resolvedDuration)}</span>
        </div>
      ) : null}
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
      <path d="M6 4h4v16H6V4Zm8 0h4v16h-4V4Z" />
    </svg>
  );
}
