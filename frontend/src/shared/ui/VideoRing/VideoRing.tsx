'use client';

import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { useMediaController } from '@/shared/lib/mediaCore/useMediaController';
import styles from './VideoRing.module.css';

export interface VideoRingProps {
  src?: string;
  duration?: number;
  className?: string;
  size?: 'small' | 'message' | 'medium' | 'large';
  autoPlay?: boolean;
  muted?: boolean;
  showProgress?: boolean;
  showCenterControl?: boolean;
  showTimePill?: boolean;
  align?: 'start' | 'end';
  mediaId?: string;
  sending?: boolean;
  tone?: 'incoming' | 'outgoing' | 'neutral';
  eager?: boolean;
  rootMargin?: string;
}

const SIZE_MAP = {
  small: 168,
  message: 240,
  medium: 268,
  large: 320,
} as const;

const EXPAND_RATIO = 1.5;
const RING_STROKE = 3;
const DOT_R = 5;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoRing({
  src,
  duration = 0,
  className,
  size = 'message',
  autoPlay = false,
  muted = false,
  showProgress = true,
  showCenterControl = true,
  showTimePill = true,
  align = 'start',
  mediaId,
  sending = false,
  tone = 'neutral',
  eager = false,
  rootMargin = '320px 0px',
}: VideoRingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrubCleanupRef = useRef<(() => void) | null>(null);
  const resumeAfterScrubRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const intersectionOptions = useMemo<IntersectionObserverInit>(
    () => ({ rootMargin, threshold: 0.01 }),
    [rootMargin],
  );
  const isNearViewport = useIntersection(containerRef, intersectionOptions);

  const controller = useMediaController({
    mediaId: mediaId ?? src ?? `video-note:${size}`,
    kind: 'video',
    src,
    durationHint: duration,
    activate: isNearViewport,
    eager,
    autoPlay,
    onDethroned: () => setExpanded(false),
  });

  const phase = sending ? 'sending' : controller.phase;
  const progress = phase === 'ended' ? 0 : controller.progress;
  const bufferedProgress = phase === 'ended' ? 0 : controller.bufferedRatio;
  const displayedCurrentTime = phase === 'ended' ? 0 : controller.currentTime;
  const displayedDuration = controller.duration || duration;

  /* ── expanded: playing → expand, ended → collapse, dethroned → collapse ── */
  useEffect(() => {
    if (controller.isPlaying) {
      setExpanded(true);
    } else if (phase === 'ended') {
      setExpanded(false);
    }
    /* user-pause keeps expanded; onDethroned callback handles external collapse */
  }, [controller.isPlaying, phase]);

  useEffect(() => {
    setExpanded(false);
  }, [src]);

  /* ── sizes ── */
  const baseDiameter = SIZE_MAP[size];
  const expandedWidth = Math.round(baseDiameter * EXPAND_RATIO);
  const currentWidth = expanded ? expandedWidth : baseDiameter;

  /* ── SVG ring geometry (viewBox is always baseDiameter) ── */
  const ringR = baseDiameter / 2 - RING_STROKE / 2 - 1;
  const C = 2 * Math.PI * ringR;
  const progressOff = C * (1 - progress);
  const bufferedOff = C * (1 - clamp(bufferedProgress, progress, 1));

  /* ── progress dot (SVG coords, pre CSS rotate -90deg) ── */
  const dotA = progress * 2 * Math.PI;
  const dotCx = baseDiameter / 2 + ringR * Math.cos(dotA);
  const dotCy = baseDiameter / 2 + ringR * Math.sin(dotA);

  const style: CSSProperties = {
    width: currentWidth,
    maxWidth: 'calc(100vw - 48px)',
  };

  const isLoading =
    phase === 'loading-metadata' ||
    phase === 'loading-media' ||
    phase === 'buffering';

  /* overlay: spinner/error always; play/pause on hover only */
  const showOverlay =
    showCenterControl &&
    (sending || phase === 'error' || isLoading || isHovered);

  /* time text */
  const displayTime =
    controller.isPlaying || phase === 'paused' || isScrubbing
      ? formatTime(displayedCurrentTime)
      : formatTime(displayedDuration);

  /* cleanup */
  useEffect(
    () => () => {
      scrubCleanupRef.current?.();
      scrubCleanupRef.current = null;
    },
    [],
  );

  /* ── ring scrub helpers ── */
  const ratioFromPointer = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const outer = rect.width / 2;
    const inner = Math.max(0, outer - 36);
    if (dist < inner || dist > outer + 16) return null;
    let n = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2);
    if (n < 0) n += 1;
    if (n > 1) n -= 1;
    return n;
  };

  const finishScrub = async () => {
    scrubCleanupRef.current?.();
    scrubCleanupRef.current = null;
    setIsScrubbing(false);
    if (resumeAfterScrubRef.current) {
      resumeAfterScrubRef.current = false;
      await controller.play();
    }
    resumeAfterScrubRef.current = false;
  };

  const handleRingPointerDown = (
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    if (sending || !controller.canSeek) return;
    const ratio = ratioFromPointer(event.clientX, event.clientY);
    if (ratio == null) return;
    event.preventDefault();
    event.stopPropagation();
    setIsScrubbing(true);
    resumeAfterScrubRef.current = controller.isPlaying;
    if (controller.isPlaying) controller.pause();
    controller.seek(ratio);

    const onMove = (e: PointerEvent) => {
      const r = ratioFromPointer(e.clientX, e.clientY);
      if (r != null) controller.seek(r);
    };
    const onUp = () => void finishScrub();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    scrubCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  };

  /* ── playback toggle ── */
  const handleToggle = async () => {
    if (sending) return;
    if (phase === 'error') {
      controller.retry();
      return;
    }
    await controller.togglePlayback();
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    await handleToggle();
  };

  /* ── render ── */
  const half = baseDiameter / 2;

  return (
    <div
      ref={containerRef}
      className={[
        styles.videoRing,
        align === 'end' ? styles.alignEnd : styles.alignStart,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-phase={phase}
      data-tone={tone}
      data-expanded={expanded ? '' : undefined}
      data-message-interactive="true"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <div
        ref={stageRef}
        className={styles.stage}
        role="button"
        tabIndex={0}
        aria-label={
          sending
            ? 'Отправка видеосообщения'
            : phase === 'error'
              ? 'Повторить загрузку'
              : controller.isPlaying
                ? 'Пауза'
                : 'Воспроизвести'
        }
        onClick={() => void handleToggle()}
        onKeyDown={(event) => void handleKeyDown(event)}
      >
        {/* ── progress ring ── */}
        {showProgress ? (
          <svg
            className={styles.ringSvg}
            viewBox={`0 0 ${baseDiameter} ${baseDiameter}`}
            aria-hidden="true"
          >
            {/* track */}
            <circle
              className={styles.ringTrack}
              cx={half}
              cy={half}
              r={ringR}
              strokeWidth={RING_STROKE}
            />
            {/* buffered */}
            <circle
              className={styles.ringBuffered}
              cx={half}
              cy={half}
              r={ringR}
              strokeWidth={RING_STROKE}
              strokeDasharray={C}
              strokeDashoffset={bufferedOff}
            />
            {/* progress */}
            <circle
              className={styles.ringProgress}
              cx={half}
              cy={half}
              r={ringR}
              strokeWidth={RING_STROKE}
              strokeDasharray={C}
              strokeDashoffset={progressOff}
            />
            {/* dot handle at leading edge */}
            {progress > 0.002 ? (
              <circle
                className={styles.ringDot}
                cx={dotCx}
                cy={dotCy}
                r={DOT_R}
              />
            ) : null}
            {/* invisible hit area for scrub */}
            <circle
              className={styles.ringHit}
              cx={half}
              cy={half}
              r={ringR}
              onPointerDown={handleRingPointerDown}
              onClick={(e) => e.stopPropagation()}
            />
          </svg>
        ) : null}

        {/* ── viewport (video circle, NO gradient overlay) ── */}
        <div className={styles.viewport}>
          {controller.shouldMountMedia ? (
            <video
              ref={(node) => {
                controller.mediaRef.current = node;
              }}
              className={styles.video}
              src={src}
              muted={muted}
              playsInline
              preload={controller.preload}
              disablePictureInPicture
              disableRemotePlayback
            />
          ) : null}

          {!controller.hasVisualFrame ? (
            <div className={styles.skeleton} aria-hidden="true">
              <div className={styles.shimmer} />
            </div>
          ) : null}

          {/* center button */}
          {showOverlay ? (
            <button
              type="button"
              className={styles.centerBtn}
              onClick={(e) => {
                e.stopPropagation();
                void handleToggle();
              }}
              disabled={sending}
              data-message-interactive="true"
            >
              {sending || isLoading ? (
                <Spinner />
              ) : phase === 'error' ? (
                <RetryIcon />
              ) : controller.isPlaying ? (
                <PauseIcon />
              ) : (
                <PlayIcon />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── time OUTSIDE the circle ── */}
      {showTimePill ? (
        <span className={styles.timeLabel}>{displayTime}</span>
      ) : null}
    </div>
  );
}

/* ── icons ── */

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
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

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
