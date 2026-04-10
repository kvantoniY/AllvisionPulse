'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { useMediaController } from '@/shared/lib/mediaCore/useMediaController';
import styles from './AudioMessage.module.css';

export interface AudioMessageProps {
  url?: string;
  duration?: number;
  title?: string;
  className?: string;
  mediaId?: string;
  sending?: boolean;
  tone?: 'incoming' | 'outgoing' | 'neutral';
  eager?: boolean;
  rootMargin?: string;
}

const BAR_COUNT = 48;
const PLAYBACK_RATES = [1, 1.5, 2] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildWaveform(seedSource: string) {
  const seed = hashString(seedSource) || 1;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const a = Math.sin((seed + i * 13) * 0.19);
    const b = Math.cos((seed + i * 7) * 0.11);
    const c = Math.sin((seed + i * 23) * 0.07);
    return 0.12 + Math.abs(a * 0.42 + b * 0.34 + c * 0.24) * 0.88;
  });
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioMessage({
  url,
  duration = 0,
  title = 'Голосовое сообщение',
  className,
  mediaId,
  sending = false,
  tone = 'neutral',
  eager = false,
  rootMargin = '320px 0px',
}: AudioMessageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  const intersectionOptions = useMemo<IntersectionObserverInit>(() => ({
    rootMargin,
    threshold: 0.01,
  }), [rootMargin]);
  const isNearViewport = useIntersection(containerRef, intersectionOptions);

  const controller = useMediaController({
    mediaId: mediaId ?? url ?? title,
    kind: 'audio',
    src: url,
    durationHint: duration,
    activate: isNearViewport,
    eager,
  });

  const phase = sending ? 'sending' : controller.phase;
  const progress = phase === 'ended' ? 0 : controller.progress;
  const waveform = useMemo(() => buildWaveform(mediaId ?? url ?? title), [mediaId, title, url]);
  const isActive = phase === 'playing' || phase === 'paused' || phase === 'buffering';
  const displayedDuration = controller.duration || duration;

  /* sync playback rate to <audio> element */
  useEffect(() => {
    const media = controller.mediaRef.current;
    if (media) media.playbackRate = playbackRate;
  }, [playbackRate, controller.shouldMountMedia]);

  const cycleSpeed = () => {
    const idx = PLAYBACK_RATES.indexOf(playbackRate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(next);
    const media = controller.mediaRef.current;
    if (media) media.playbackRate = next;
  };

  const handlePrimaryAction = async () => {
    if (sending) return;
    if (phase === 'error') {
      controller.retry();
      return;
    }
    await controller.togglePlayback();
  };

  const speedLabel = playbackRate === 1 ? '1×' : playbackRate === 1.5 ? '1.5×' : '2×';

  return (
    <div
      ref={containerRef}
      className={[styles.audio, className].filter(Boolean).join(' ')}
      data-phase={phase}
      data-tone={tone}
      aria-busy={sending || phase === 'loading-metadata' || phase === 'loading-media' || phase === 'buffering'}
    >
      {/* ── play / pause button ── */}
      <button
        type="button"
        className={styles.playBtn}
        onClick={() => void handlePrimaryAction()}
        disabled={sending}
        aria-label={
          sending
            ? 'Отправка голосового сообщения'
            : phase === 'error'
              ? 'Повторить загрузку'
              : controller.isPlaying
                ? 'Пауза'
                : 'Воспроизвести'
        }
        data-message-interactive="true"
      >
        {sending ? (
          <Spinner />
        ) : phase === 'error' ? (
          <RetryIcon />
        ) : controller.isPlaying ? (
          <PauseIcon />
        ) : phase === 'loading-metadata' || phase === 'loading-media' || phase === 'buffering' ? (
          <Spinner />
        ) : (
          <PlayIcon />
        )}
      </button>

      {/* ── body: waveform + meta ── */}
      <div className={styles.body}>
        <div className={styles.wavetrack} data-message-interactive="true">
          {/* bars */}
          <div className={styles.bars} aria-hidden="true">
            {waveform.map((value, index) => {
              const fraction = index / Math.max(1, waveform.length - 1);
              const active = fraction <= progress;
              return (
                <span
                  key={index}
                  className={active ? styles.barActive : styles.bar}
                  style={{ height: `${Math.round(4 + value * 24)}px` }}
                />
              );
            })}
          </div>

          {/* thumb indicator */}
          <span
            className={styles.thumb}
            style={{ left: `${progress * 100}%` }}
            aria-hidden="true"
          />

          {/* hidden range scrubber */}
          {!sending && controller.canSeek ? (
            <input
              className={styles.scrubber}
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(progress * 1000)}
              onChange={(e) => controller.seek(Number(e.currentTarget.value) / 1000)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label="Позиция воспроизведения"
              data-message-interactive="true"
            />
          ) : null}
        </div>

        {/* meta row: time + speed */}
        <div className={styles.meta}>
          <span className={styles.time}>
            {isActive ? formatTime(controller.currentTime) : formatTime(displayedDuration)}
          </span>
          {isActive || phase === 'ended' ? (
            <button
              type="button"
              className={styles.speedBtn}
              onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
              aria-label={`Скорость воспроизведения ${speedLabel}`}
              data-message-interactive="true"
            >
              {speedLabel}
            </button>
          ) : null}
        </div>
      </div>

      {/* hidden <audio> */}
      {controller.shouldMountMedia ? (
        <audio
          ref={(node) => {
            controller.mediaRef.current = node;
            if (node) node.playbackRate = playbackRate;
          }}
          src={url}
          preload={controller.preload}
          playsInline
          className={styles.hidden}
        />
      ) : null}
    </div>
  );
}

/* ── icons ── */

function Spinner({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={[styles.spinner, compact ? styles.spinnerSm : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
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

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
