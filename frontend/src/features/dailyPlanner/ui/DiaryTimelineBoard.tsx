'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { extractApiError } from '@/shared/lib/apiError';
import type { PulseTaskItem } from '@/shared/types/pulse';
import styles from './DiaryTimelineBoard.module.css';

type TaskUpdateInput = {
  date?: string | null;
  time?: string | null;
  endTime?: string | null;
};

type Props = {
  date: string;
  tasks: PulseTaskItem[];
  onCreateTaskAtSlot: (payload: { date: string; time: string; endTime?: string }) => void;
  onOpenTask: (task: PulseTaskItem) => void;
  onUpdateTask: (taskId: string, body: TaskUpdateInput) => Promise<void> | void;
};

type LayoutItem = {
  key: string;
  task: PulseTaskItem;
  tone: 'event' | 'habit' | 'regular' | 'program' | 'finance' | 'debt' | 'personal';
  label: string;
  excerpt: string;
  startOffset: number;
  endOffset: number;
  lane: number;
  leftPercent: number;
  widthPercent: number;
  centerPercent: number;
  bottom: number;
  timeLabel: string;
  explicitEnd: boolean;
};

type DraftWindow = {
  startOffset: number;
  endOffset: number;
  persistEnd: boolean;
};

type InteractionState = {
  type: 'drag' | 'resize-start' | 'resize-end';
  key: string;
  task: PulseTaskItem;
  baseStartOffset: number;
  baseEndOffset: number;
  originX: number;
  trackWidth: number;
  persistEnd: boolean;
};

const START_HOUR = 6;
const TOTAL_MINUTES = 24 * 60;
const SLOT_MINUTES = 15;
const SLOT_COUNT = TOTAL_MINUTES / SLOT_MINUTES;
const DEFAULT_DURATION_MINUTES = 45;
const MIN_DURATION_MINUTES = 15;
const EVENT_BASELINE_OFFSET = 56;
const LANE_STEP = 28;
const HOUR_LABELS = Array.from({ length: 25 }, (_, index) => (START_HOUR + index) % 24);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeOffsetFromDate(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return null;

  const rawMinutes = parsed.getHours() * 60 + parsed.getMinutes();
  const adjustedMinutes = rawMinutes < START_HOUR * 60 ? rawMinutes + 24 * 60 : rawMinutes;
  return adjustedMinutes - START_HOUR * 60;
}

function offsetToTime(offset: number) {
  const totalMinutes = (START_HOUR * 60 + clamp(offset, 0, TOTAL_MINUTES)) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatTimeRange(startOffset: number, endOffset: number) {
  return `${offsetToTime(startOffset)}-${offsetToTime(endOffset)}`;
}

function getTaskWindow(task: PulseTaskItem, draft?: DraftWindow) {
  const startOffset = draft?.startOffset ?? timeOffsetFromDate(task.dueDate);
  if (startOffset == null) return null;

  let endOffset = draft?.endOffset ?? timeOffsetFromDate(task.endDate ?? null);
  if (endOffset == null) {
    endOffset = startOffset + DEFAULT_DURATION_MINUTES;
  }

  if (endOffset <= startOffset) {
    endOffset += TOTAL_MINUTES;
  }

  return {
    startOffset: clamp(startOffset, 0, TOTAL_MINUTES - MIN_DURATION_MINUTES),
    endOffset: clamp(endOffset, startOffset + MIN_DURATION_MINUTES, TOTAL_MINUTES),
    explicitEnd: draft?.persistEnd ?? Boolean(task.endDate),
  };
}

function getTaskVisualMeta(task: PulseTaskItem) {
  if (task.sourceKey?.startsWith('finance:')) {
    return { label: 'Финансовая задача', tone: 'finance' as const };
  }
  if (task.sourceKey?.startsWith('debt:')) {
    return { label: 'Платеж по долгу', tone: 'debt' as const };
  }
  if (task.programMeta?.title?.trim()) {
    return { label: task.programMeta.title.trim(), tone: 'program' as const };
  }
  if (task.sourceEventTitle?.trim()) {
    return { label: task.sourceEventTitle.trim(), tone: 'event' as const };
  }
  if (task.taskType === 'HABIT') {
    return { label: 'Привычка', tone: 'habit' as const };
  }
  if (task.taskType === 'REGULAR') {
    return { label: 'Регулярная задача', tone: 'regular' as const };
  }
  return { label: 'Личная задача', tone: 'personal' as const };
}

function getTaskExcerpt(task: PulseTaskItem, max = 84) {
  const clean = task.notes?.trim() ?? '';
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function getTaskKey(task: PulseTaskItem) {
  return task.occurrenceKey ?? task.id;
}

function buildLayouts(tasks: PulseTaskItem[], drafts: Record<string, DraftWindow>) {
  const prepared = tasks
    .map((task) => {
      const key = getTaskKey(task);
      const window = getTaskWindow(task, drafts[key]);
      if (!window) return null;
      const meta = getTaskVisualMeta(task);
      return {
        key,
        task,
        tone: meta.tone,
        label: meta.label,
        excerpt: getTaskExcerpt(task),
        startOffset: window.startOffset,
        endOffset: window.endOffset,
        explicitEnd: window.explicitEnd,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

  const laneEnds: number[] = [];

  return prepared.map((item) => {
    let lane = laneEnds.findIndex((value) => value <= item.startOffset);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.endOffset);
    } else {
      laneEnds[lane] = item.endOffset;
    }

    const widthPercent = Math.max(1.6, ((item.endOffset - item.startOffset) / TOTAL_MINUTES) * 100);

    return {
      ...item,
      lane,
      leftPercent: (item.startOffset / TOTAL_MINUTES) * 100,
      widthPercent,
      centerPercent: (item.startOffset / TOTAL_MINUTES) * 100 + widthPercent / 2,
      bottom: EVENT_BASELINE_OFFSET + lane * LANE_STEP,
      timeLabel: formatTimeRange(item.startOffset, item.endOffset),
    } satisfies LayoutItem;
  });
}

export function DiaryTimelineBoard({ date, tasks, onCreateTaskAtSlot, onOpenTask, onUpdateTask }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const draftsRef = useRef<Record<string, DraftWindow>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftWindow>>({});
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [hoveredTaskKey, setHoveredTaskKey] = useState<string | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const layouts = useMemo(() => buildLayouts(tasks, drafts), [drafts, tasks]);
  const hoveredLayout = hoveredTaskKey ? layouts.find((item) => item.key === hoveredTaskKey) ?? null : null;
  const nowOffset = useMemo(() => {
    const rawMinutes = now.getHours() * 60 + now.getMinutes();
    const adjusted = rawMinutes < START_HOUR * 60 ? rawMinutes + 24 * 60 : rawMinutes;
    return clamp(adjusted - START_HOUR * 60, 0, TOTAL_MINUTES);
  }, [now]);
  const showCurrentMarker = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const deltaMinutes = roundToStep(((event.clientX - interaction.originX) / Math.max(interaction.trackWidth, 1)) * TOTAL_MINUTES, SLOT_MINUTES);
      const duration = interaction.baseEndOffset - interaction.baseStartOffset;
      let startOffset = interaction.baseStartOffset;
      let endOffset = interaction.baseEndOffset;

      if (interaction.type === 'drag') {
        startOffset = clamp(interaction.baseStartOffset + deltaMinutes, 0, TOTAL_MINUTES - duration);
        endOffset = startOffset + duration;
      } else if (interaction.type === 'resize-start') {
        startOffset = clamp(interaction.baseStartOffset + deltaMinutes, 0, interaction.baseEndOffset - MIN_DURATION_MINUTES);
      } else {
        endOffset = clamp(interaction.baseEndOffset + deltaMinutes, interaction.baseStartOffset + MIN_DURATION_MINUTES, TOTAL_MINUTES);
      }

      if (Math.abs(event.clientX - interaction.originX) > 3) {
        suppressClickRef.current = interaction.key;
      }

      setDrafts((prev) => ({
        ...prev,
        [interaction.key]: {
          startOffset,
          endOffset,
          persistEnd: interaction.persistEnd || interaction.type !== 'drag',
        },
      }));
    };

    const handlePointerUp = () => {
      const draft = draftsRef.current[interaction.key];
      const wasDragged = suppressClickRef.current === interaction.key;
      setInteraction(null);
      if (!draft || !wasDragged) return;

      const body: TaskUpdateInput = {
        time: offsetToTime(draft.startOffset),
      };

      if (interaction.task.taskType === 'ONE_TIME') {
        body.date = date;
      }

      if (draft.persistEnd || interaction.task.endDate) {
        body.endTime = offsetToTime(draft.endOffset);
      }

      void Promise.resolve(onUpdateTask(interaction.task.id, body))
        .catch((error) => {
          setErrorMessage(extractApiError(error).message);
        })
        .finally(() => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[interaction.key];
            return next;
          });
          window.setTimeout(() => {
            if (suppressClickRef.current === interaction.key) suppressClickRef.current = null;
          }, 0);
        });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [date, interaction, onUpdateTask]);

  const startInteraction = (type: InteractionState['type'], layout: LayoutItem, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = trackRef.current?.getBoundingClientRect();
    setErrorMessage(null);
    setHoveredTaskKey(layout.key);
    suppressClickRef.current = null;
    setInteraction({
      type,
      key: layout.key,
      task: layout.task,
      baseStartOffset: layout.startOffset,
      baseEndOffset: layout.endOffset,
      originX: event.clientX,
      trackWidth: rect?.width ?? 0,
      persistEnd: layout.explicitEnd,
    });
  };

  const handleOpenTask = (layout: LayoutItem) => {
    if (suppressClickRef.current === layout.key) {
      suppressClickRef.current = null;
      return;
    }
    onOpenTask(layout.task);
  };

  const handleCreateAtSlot = (slotIndex: number) => {
    const startOffset = clamp(slotIndex * SLOT_MINUTES, 0, TOTAL_MINUTES - MIN_DURATION_MINUTES);
    const endOffset = Math.min(TOTAL_MINUTES, startOffset + DEFAULT_DURATION_MINUTES);
    onCreateTaskAtSlot({
      date,
      time: offsetToTime(startOffset),
      endTime: offsetToTime(endOffset),
    });
  };

  const previewBottom = hoveredLayout ? Math.min(146, hoveredLayout.bottom + 42) : 0;
  const previewLeft = hoveredLayout ? clamp(hoveredLayout.centerPercent, 10, 90) : 0;

  return (
    <section className={styles.root}>
      <div className={styles.frame}>
        <div className={styles.canvas}>
          <div className={styles.backdrop} aria-hidden="true">
            <div className={[styles.segment, styles.segmentMorning].join(' ')} />
            <div className={[styles.segment, styles.segmentDay].join(' ')} />
            <div className={[styles.segment, styles.segmentSunset].join(' ')} />
            <div className={[styles.segment, styles.segmentNight].join(' ')} />

            <span className={[styles.orb, styles.orbSunrise].join(' ')} />
            <span className={[styles.orb, styles.orbDay].join(' ')} />
            <span className={[styles.orb, styles.orbSunset].join(' ')} />
            <span className={[styles.orb, styles.orbMoon].join(' ')} />

            <span className={[styles.cloud, styles.cloudMorning].join(' ')} />
            <span className={[styles.cloud, styles.cloudDay].join(' ')} />
            <span className={[styles.landscape, styles.landscapeFar].join(' ')} />
            <span className={[styles.landscape, styles.landscapeNear].join(' ')} />
            <span className={styles.citySunset} />
            <span className={styles.cityNight} />
            <span className={styles.stars} />
          </div>

          <div ref={trackRef} className={styles.trackArea}>
            <div className={styles.tickGrid} aria-hidden="true">
              {Array.from({ length: SLOT_COUNT + 1 }, (_, index) => (
                <span
                  key={index}
                  className={[
                    styles.tickMark,
                    index % 4 === 0 ? styles.tickMarkHour : styles.tickMarkMinute,
                  ].filter(Boolean).join(' ')}
                />
              ))}
            </div>

            <div className={styles.slotGrid}>
              {Array.from({ length: SLOT_COUNT }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={styles.slotButton}
                  onMouseEnter={() => setHoveredSlotIndex(index)}
                  onMouseLeave={() => setHoveredSlotIndex((current) => (current === index ? null : current))}
                  onClick={() => handleCreateAtSlot(index)}
                  aria-label={`Добавить задачу на ${offsetToTime(index * SLOT_MINUTES)}`}
                >
                  <span
                    className={[
                      styles.slotIndicator,
                      index % 4 === 0 ? styles.slotIndicatorHour : '',
                      hoveredSlotIndex === index ? styles.slotIndicatorHover : '',
                    ].filter(Boolean).join(' ')}
                  />
                  {hoveredSlotIndex === index ? (
                    <span className={styles.slotPlus}>
                      <Plus size={12} strokeWidth={2.6} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className={styles.trackRail} aria-hidden="true">
              <span
                className={styles.trackRailFill}
                style={{ width: `${showCurrentMarker ? (nowOffset / TOTAL_MINUTES) * 100 : 0}%` }}
              />
            </div>

            <div className={styles.eventsLayer}>
              {layouts.map((layout) => (
                <button
                  key={layout.key}
                  type="button"
                  className={[
                    styles.event,
                    layout.task.completedForDate ? styles.eventDone : '',
                    hoveredTaskKey === layout.key ? styles.eventHover : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${layout.leftPercent}%`,
                    width: `${layout.widthPercent}%`,
                    bottom: `${layout.bottom}px`,
                  }}
                  onPointerDown={(event) => startInteraction('drag', layout, event)}
                  onMouseEnter={() => setHoveredTaskKey(layout.key)}
                  onMouseLeave={() => setHoveredTaskKey((current) => (current === layout.key ? null : current))}
                  onClick={() => handleOpenTask(layout)}
                  aria-label={`${layout.task.title}, ${layout.timeLabel}`}
                >
                  <span className={styles.eventRail} />
                  <span className={styles.eventDot} data-tone={layout.tone}>
                    {layout.task.completedForDate ? <Check className={styles.eventCheck} strokeWidth={3} /> : null}
                  </span>
                  <span className={[styles.resizeHandle, styles.resizeHandleStart].join(' ')} onPointerDown={(event) => startInteraction('resize-start', layout, event)} />
                  <span className={[styles.resizeHandle, styles.resizeHandleEnd].join(' ')} onPointerDown={(event) => startInteraction('resize-end', layout, event)} />
                </button>
              ))}
            </div>

            {hoveredLayout ? (
              <div
                className={styles.preview}
                style={{
                  left: `${previewLeft}%`,
                  bottom: `${previewBottom}px`,
                }}
              >
                <span className={styles.previewTitle}>
                  <span className={styles.previewDot} data-tone={hoveredLayout.tone} />
                  {hoveredLayout.task.title}
                </span>
                {hoveredLayout.excerpt ? <span className={styles.previewText}>{hoveredLayout.excerpt}</span> : null}
                <span className={styles.previewTime}>{hoveredLayout.timeLabel}</span>
              </div>
            ) : null}

            {showCurrentMarker ? (
              <div
                className={styles.currentMarker}
                style={{ left: `${(nowOffset / TOTAL_MINUTES) * 100}%` }}
                aria-hidden="true"
              >
                <span className={styles.currentBadge}>
                  {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={styles.currentLine} />
                <span className={styles.currentDot} />
              </div>
            ) : null}
          </div>

          <div className={styles.scale} aria-hidden="true">
            {HOUR_LABELS.map((hour, index) => (
              <span key={`${hour}-${index}`} className={styles.scaleLabel}>
                {hour}
              </span>
            ))}
          </div>
        </div>
      </div>

      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
    </section>
  );
}
