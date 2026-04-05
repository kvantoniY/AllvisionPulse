'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { PulseTaskItem } from '@/shared/types/pulse';
import { extractApiError } from '@/shared/lib/apiError';
import { Button } from '@/shared/ui/Button/Button';
import { DailyPlannerEditor } from './DailyPlannerEditor';
import styles from './DailyPlanner.module.css';

type PlannerMode = 'day' | 'week';

type TaskUpdateInput = {
  title?: string;
  notes?: string | null;
  date?: string | null;
  time?: string | null;
  endTime?: string | null;
};

type Props = {
  mode: PlannerMode;
  date: string;
  weekDates: string[];
  tasks: PulseTaskItem[];
  allTasks: PulseTaskItem[];
  onToggleTask: (taskId: string, date: string) => void;
  onUpdateTask: (taskId: string, body: TaskUpdateInput) => Promise<void> | void;
  onCreateTaskAtSlot?: (payload: { date: string; time: string; endTime?: string }) => void;
  showHeader?: boolean;
  compact?: boolean;
};

type PlannerTaskLayout = {
  key: string;
  task: PulseTaskItem;
  occurrenceDate: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
  explicitEnd: boolean;
};

type DraftWindow = {
  occurrenceDate: string;
  startMinutes: number;
  endMinutes: number;
  persistEnd: boolean;
};

type InteractionState = {
  type: 'drag' | 'resize-start' | 'resize-end';
  key: string;
  task: PulseTaskItem;
  occurrenceDate: string;
  baseStartMinutes: number;
  baseEndMinutes: number;
  baseColumnIndex: number;
  columnWidth: number;
  originX: number;
  originY: number;
  persistEnd: boolean;
};

type EditorState = {
  title: string;
  notes: string;
  date: string;
  time: string;
  endTime: string;
};

const HOUR_HEIGHT = 64;
const DEFAULT_DURATION_MINUTES = 45;
const MIN_DURATION_MINUTES = 15;
const SNAP_MINUTES = 15;

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

function dateKey(value?: string | Date | null) {
  const parsed = value instanceof Date ? value : parseDate(value ?? null);
  if (!parsed) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(value: string, offsetDays: number) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  parsed.setDate(parsed.getDate() + offsetDays);
  return dateKey(parsed);
}

function formatPlannerDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return 'На выбранный день';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(parsed);
}

function formatDayHeader(value: string, short = false) {
  const parsed = parseDate(value);
  if (!parsed) return { weekday: '—', day: '—' };
  return {
    weekday: new Intl.DateTimeFormat('ru-RU', { weekday: short ? 'short' : 'long' }).format(parsed),
    day: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: short ? undefined : 'short' }).format(parsed),
  };
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function minutesToTime(minutes: number) {
  const safe = clamp(minutes, 0, 24 * 60);
  const hh = Math.floor(safe / 60);
  const mm = safe % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeRangeLabel(startMinutes: number, endMinutes: number) {
  const start = minutesToTime(startMinutes);
  const duration = endMinutes - startMinutes;
  if (duration <= DEFAULT_DURATION_MINUTES) return start;
  return `${start}–${minutesToTime(endMinutes)}`;
}

function startMinutesForTask(task: PulseTaskItem) {
  const parsed = parseDate(task.dueDate);
  if (!task.hasTime || !parsed) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function hasExplicitEnd(task: PulseTaskItem) {
  return Boolean(parseDate(task.endDate ?? null));
}

function endMinutesForTask(task: PulseTaskItem, startMinutes: number) {
  const parsed = parseDate(task.endDate ?? null);
  if (!parsed) return Math.min(24 * 60, startMinutes + DEFAULT_DURATION_MINUTES);
  return Math.max(startMinutes + MIN_DURATION_MINUTES, parsed.getHours() * 60 + parsed.getMinutes());
}

function taskSort(left: PulseTaskItem, right: PulseTaskItem) {
  const leftDate = parseDate(left.dueDate);
  const rightDate = parseDate(right.dueDate);
  const leftTime = leftDate ? leftDate.getHours() * 60 + leftDate.getMinutes() : Number.POSITIVE_INFINITY;
  const rightTime = rightDate ? rightDate.getHours() * 60 + rightDate.getMinutes() : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const leftEnd = parseDate(left.endDate ?? null);
  const rightEnd = parseDate(right.endDate ?? null);
  const leftDuration = leftEnd && leftDate ? leftEnd.getTime() - leftDate.getTime() : DEFAULT_DURATION_MINUTES * 60_000;
  const rightDuration = rightEnd && rightDate ? rightEnd.getTime() - rightDate.getTime() : DEFAULT_DURATION_MINUTES * 60_000;
  if (leftDuration !== rightDuration) return rightDuration - leftDuration;
  return left.title.localeCompare(right.title, 'ru');
}

function trimNotes(value?: string | null, max = 96) {
  const clean = (value ?? '').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function plannerSecondaryLabel(task: PulseTaskItem) {
  if (task.sourceEventTitle?.trim()) return task.sourceEventTitle.trim();
  if (task.programMeta?.title?.trim()) return task.programMeta.title.trim();
  if (task.taskType === 'HABIT') return 'Привычка';
  if (task.taskType === 'REGULAR') return 'Регулярная';
  return null;
}

function sourceDetails(task: PulseTaskItem) {
  const typeLabel =
    task.socialEventRole === 'EVENT'
      ? 'Событие'
      : task.socialEventRole === 'SUBTASK'
        ? 'Подзадача события'
        : task.taskType === 'HABIT'
          ? 'Привычка'
          : task.taskType === 'REGULAR'
            ? 'Регулярная задача'
            : 'Разовая задача';

  const originLabel = task.programMeta
    ? `Из программы «${task.programMeta.title}»`
    : task.sourceArtifactId || task.sourceKey?.startsWith('artifact:')
      ? 'Из договорённости в чате'
      : task.socialEventRole === 'SUBTASK' && task.sourceEventTitle
        ? `Из события «${task.sourceEventTitle}»`
        : 'Личная задача';

  const assignmentLabel =
    task.subtaskAssignmentMode === 'ALL'
      ? 'Обязательна для всех'
      : task.subtaskAssignmentMode === 'ANYONE'
        ? 'Кто-то один может взять'
        : task.subtaskAssignmentMode === 'PERSONAL'
          ? 'Назначена конкретному участнику'
          : null;

  return {
    typeLabel,
    originLabel,
    assignmentLabel,
  };
}

function buildLayouts(tasks: PulseTaskItem[], activeDates: string[], drafts: Record<string, DraftWindow>): PlannerTaskLayout[] {
  const grouped = new Map<string, PulseTaskItem[]>();
  for (const task of tasks) {
    const fallbackDay = dateKey(task.dueDate);
    const key = task.occurrenceKey ?? `${task.id}:${fallbackDay}`;
    const dayKey = drafts[key]?.occurrenceDate ?? fallbackDay;
    if (!dayKey || !activeDates.includes(dayKey)) continue;
    grouped.set(dayKey, [...(grouped.get(dayKey) ?? []), task]);
  }

  const layouts: PlannerTaskLayout[] = [];
  for (const day of activeDates) {
    const dayTasks = [...(grouped.get(day) ?? [])].sort(taskSort);
    const laneEndMinutes: number[] = [];
    const dayLayouts: PlannerTaskLayout[] = [];

    dayTasks.forEach((task) => {
      const key = task.occurrenceKey ?? `${task.id}:${dateKey(task.dueDate)}`;
      const draft = drafts[key];
      const startMinutes = draft?.startMinutes ?? startMinutesForTask(task);
      if (startMinutes == null) return;
      const endMinutes = draft?.endMinutes ?? endMinutesForTask(task, startMinutes);
      let lane = laneEndMinutes.findIndex((value) => value <= startMinutes);
      if (lane < 0) {
        lane = laneEndMinutes.length;
        laneEndMinutes.push(endMinutes);
      } else {
        laneEndMinutes[lane] = endMinutes;
      }
      dayLayouts.push({
        key,
        task,
        occurrenceDate: draft?.occurrenceDate ?? day,
        startMinutes,
        endMinutes,
        lane,
        laneCount: 1,
        explicitEnd: draft?.persistEnd ?? hasExplicitEnd(task),
      });
    });

    const normalized = dayLayouts.map((layout) => {
      const laneCount = Math.max(
        1,
        dayLayouts.filter(
          (candidate) => candidate.startMinutes < layout.endMinutes && candidate.endMinutes > layout.startMinutes,
        ).length,
      );
      return {
        ...layout,
        laneCount,
      };
    });
    layouts.push(...normalized);
  }

  return layouts;
}

function relatedEventTasks(task: PulseTaskItem, occurrenceDate: string, allTasks: PulseTaskItem[]) {
  if (task.socialEventRole !== 'EVENT') return [];
  return [...allTasks]
    .filter((item) => {
      if (item.socialEventRole !== 'SUBTASK') return false;
      if (dateKey(item.dueDate) !== occurrenceDate) return false;
      if (task.sourceArtifactId && item.sourceArtifactId) {
        return task.sourceArtifactId === item.sourceArtifactId;
      }
      return Boolean(task.title && item.sourceEventTitle === task.title);
    })
    .sort(taskSort);
}

export function DailyPlanner({ mode, date, weekDates, tasks, allTasks, onToggleTask, onUpdateTask, onCreateTaskAtSlot, showHeader = true, compact = false }: Props) {
  const [activeTaskKey, setActiveTaskKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftWindow>>({});
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [editor, setEditor] = useState<EditorState>({
    title: '',
    notes: '',
    date: '',
    time: '',
    endTime: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const draftsRef = useRef<Record<string, DraftWindow>>({});
  const columnsGridRef = useRef<HTMLDivElement | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const autoScrollKeyRef = useRef<string>('');
  const activeDates = mode === 'week' ? weekDates : [date];
  const timedTasks = useMemo(
    () => tasks.filter((task) => Boolean(task.hasTime && task.dueDate)).sort(taskSort),
    [tasks],
  );
  const layouts = useMemo(() => buildLayouts(timedTasks, activeDates, drafts), [activeDates, drafts, timedTasks]);
  const layoutMap = useMemo(() => new Map(layouts.map((layout) => [layout.key, layout])), [layouts]);
  const activeTask = activeTaskKey ? layoutMap.get(activeTaskKey) ?? null : null;
  const relatedTasks = useMemo(
    () => (activeTask ? relatedEventTasks(activeTask.task, activeTask.occurrenceDate, allTasks) : []),
    [activeTask, allTasks],
  );
  const columns = mode === 'week' ? weekDates : [date];
  const gridHeight = HOUR_HEIGHT * 24;
  const firstTaskStartMinutes = useMemo(
    () => layouts.reduce((min, layout) => Math.min(min, layout.startMinutes), Number.POSITIVE_INFINITY),
    [layouts],
  );

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    if (!activeTask) return;
    const parsedDue = parseDate(activeTask.task.dueDate);
    const parsedEnd = parseDate(activeTask.task.endDate ?? null);
    setEditor({
      title: activeTask.task.title,
      notes: activeTask.task.notes ?? '',
      date: activeTask.occurrenceDate,
      time: parsedDue && activeTask.task.hasTime ? minutesToTime(parsedDue.getHours() * 60 + parsedDue.getMinutes()) : '',
      endTime: parsedEnd ? minutesToTime(parsedEnd.getHours() * 60 + parsedEnd.getMinutes()) : '',
    });
  }, [activeTask?.key, activeTask?.occurrenceDate, activeTask?.task.dueDate, activeTask?.task.endDate, activeTask?.task.hasTime, activeTask?.task.notes, activeTask?.task.title]);

  useLayoutEffect(() => {
    if (!Number.isFinite(firstTaskStartMinutes)) return;
    const wrap = boardWrapRef.current;
    if (!wrap) return;

    const nextKey = `${mode}:${activeDates.join('|')}:${Math.round(firstTaskStartMinutes)}`;
    if (autoScrollKeyRef.current === nextKey) return;
    autoScrollKeyRef.current = nextKey;

    const topOffset = Math.max(0, (firstTaskStartMinutes / 60) * HOUR_HEIGHT - 72);
    wrap.scrollTop = topOffset;

    let cancelled = false;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      wrap.scrollTop = topOffset;
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        wrap.scrollTo({ top: topOffset, behavior: 'auto' });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeDates, firstTaskStartMinutes, mode]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const deltaMinutes = roundToStep(((event.clientY - interaction.originY) / HOUR_HEIGHT) * 60, SNAP_MINUTES);
      const rawColumnShift = interaction.columnWidth > 0 ? Math.round((event.clientX - interaction.originX) / interaction.columnWidth) : 0;
      const dayShift = mode === 'week' && interaction.task.taskType === 'ONE_TIME' ? rawColumnShift : 0;
      const targetColumn = clamp(interaction.baseColumnIndex + dayShift, 0, columns.length - 1);
      const nextOccurrenceDate = columns[targetColumn] ?? interaction.occurrenceDate;
      let startMinutes = interaction.baseStartMinutes;
      let endMinutes = interaction.baseEndMinutes;

      if (interaction.type === 'drag') {
        const duration = interaction.baseEndMinutes - interaction.baseStartMinutes;
        startMinutes = clamp(roundToStep(interaction.baseStartMinutes + deltaMinutes, SNAP_MINUTES), 0, 24 * 60 - MIN_DURATION_MINUTES);
        endMinutes = startMinutes + duration;
        if (endMinutes > 24 * 60) {
          endMinutes = 24 * 60;
          startMinutes = Math.max(0, endMinutes - duration);
        }
      } else if (interaction.type === 'resize-start') {
        startMinutes = clamp(
          roundToStep(interaction.baseStartMinutes + deltaMinutes, SNAP_MINUTES),
          0,
          interaction.baseEndMinutes - MIN_DURATION_MINUTES,
        );
      } else {
        endMinutes = clamp(
          roundToStep(interaction.baseEndMinutes + deltaMinutes, SNAP_MINUTES),
          interaction.baseStartMinutes + MIN_DURATION_MINUTES,
          24 * 60,
        );
      }

      if (Math.abs(event.clientY - interaction.originY) > 3 || Math.abs(event.clientX - interaction.originX) > 3) {
        suppressClickRef.current = interaction.key;
      }

      setDrafts((prev) => ({
        ...prev,
        [interaction.key]: {
          occurrenceDate: nextOccurrenceDate,
          startMinutes,
          endMinutes,
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
        time: minutesToTime(draft.startMinutes),
      };

      if (interaction.task.taskType === 'ONE_TIME') {
        body.date = draft.occurrenceDate;
      }
      if (draft.persistEnd || hasExplicitEnd(interaction.task)) {
        body.endTime = minutesToTime(draft.endMinutes);
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
  }, [columns, interaction, mode, onUpdateTask]);

  const openEditor = (layout: PlannerTaskLayout) => {
    if (suppressClickRef.current === layout.key) {
      suppressClickRef.current = null;
      return;
    }
    setErrorMessage(null);
    setActiveTaskKey(layout.key);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, layout: PlannerTaskLayout) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(layout);
    }
  };

  const startInteraction = (type: InteractionState['type'], layout: PlannerTaskLayout, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const gridRect = columnsGridRef.current?.getBoundingClientRect();
    const columnWidth = gridRect ? gridRect.width / columns.length : 0;
    const baseColumnIndex = columns.indexOf(layout.occurrenceDate);
    setErrorMessage(null);
    suppressClickRef.current = null;
    setInteraction({
      type,
      key: layout.key,
      task: layout.task,
      occurrenceDate: layout.occurrenceDate,
      baseStartMinutes: layout.startMinutes,
      baseEndMinutes: layout.endMinutes,
      baseColumnIndex: Math.max(baseColumnIndex, 0),
      columnWidth,
      originX: event.clientX,
      originY: event.clientY,
      persistEnd: layout.explicitEnd,
    });
  };

  const handleQuickToggle = (event: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>, layout: PlannerTaskLayout) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleTask(layout.task.id, layout.occurrenceDate);
  };

  const handleSave = async () => {
    if (!activeTask) return;
    setSaving(true);
    try {
      setErrorMessage(null);
      await Promise.resolve(
        onUpdateTask(activeTask.task.id, {
          title: editor.title.trim(),
          notes: editor.notes.trim() || null,
          date: activeTask.task.taskType === 'ONE_TIME' ? editor.date || null : undefined,
          time: editor.time || null,
          endTime: editor.endTime || null,
        }),
      );
      setActiveTaskKey(null);
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAtGridSlot = (occurrenceDate: string, event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onCreateTaskAtSlot) return;
    if (event.target instanceof HTMLElement && event.target.closest('[data-planner-event="true"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = clamp(event.clientY - rect.top, 0, rect.height);
    const startMinutes = clamp(roundToStep((relativeY / Math.max(rect.height, 1)) * 24 * 60, SNAP_MINUTES), 0, 23 * 60 + 45);
    const endMinutes = Math.min(startMinutes + DEFAULT_DURATION_MINUTES, 23 * 60 + 59);
    onCreateTaskAtSlot({
      date: occurrenceDate,
      time: minutesToTime(startMinutes),
      endTime: endMinutes > startMinutes ? minutesToTime(endMinutes) : undefined,
    });
  };

  const handleGridSlotKeyDown = (occurrenceDate: string, event: KeyboardEvent<HTMLDivElement>) => {
    if (!onCreateTaskAtSlot) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onCreateTaskAtSlot({
      date: occurrenceDate,
      time: '09:00',
      endTime: '09:45',
    });
  };

  return (
    <>
      <section className={[styles.surface, compact ? styles.surfaceCompact : ''].filter(Boolean).join(' ')}>
        {showHeader ? (
          <div className={styles.header}>
            <div>
              <div className={styles.eyebrow}>Ежедневник</div>
              <div className={styles.title}>
                {mode === 'week' ? 'Неделя по времени' : `План на ${formatPlannerDate(date)}`}
              </div>
              <div className={styles.subtitle}>
                Только задачи с точным временем. Перетаскивайте блоки по сетке и меняйте длительность без лишнего шума.
              </div>
            </div>
            <div className={styles.countPill}>{timedTasks.length} по времени</div>
          </div>
        ) : null}

        <div ref={boardWrapRef} className={styles.boardWrap}>
          <div
            className={styles.board}
            style={{
              ['--planner-columns' as string]: String(columns.length),
              ['--planner-height' as string]: `${gridHeight}px`,
              minWidth: mode === 'week' ? '920px' : '520px',
            }}
          >
            <div className={styles.timeRail}>
              <div className={styles.timeRailSpacer} />
              {Array.from({ length: 25 }, (_, hour) => (
                <div key={hour} className={styles.timeTick}>
                  <span>{hourLabel(hour)}</span>
                </div>
              ))}
            </div>

            <div className={styles.columnsArea}>
              <div className={styles.columnsHeader}>
                {columns.map((columnDate) => {
                  const header = formatDayHeader(columnDate, mode === 'week');
                  const active = columnDate === date;
                  return (
                    <div
                      key={columnDate}
                      className={[styles.columnHeader, active ? styles.columnHeaderActive : ''].filter(Boolean).join(' ')}
                    >
                      <span>{header.weekday}</span>
                      <strong>{header.day}</strong>
                    </div>
                  );
                })}
              </div>

              <div ref={columnsGridRef} className={styles.columnsGrid}>
                {columns.map((columnDate) => (
                  <div
                    key={columnDate}
                    className={styles.dayColumn}
                    onClick={(event) => handleCreateAtGridSlot(columnDate, event)}
                    onKeyDown={(event) => handleGridSlotKeyDown(columnDate, event)}
                    role={onCreateTaskAtSlot ? 'button' : undefined}
                    tabIndex={onCreateTaskAtSlot ? 0 : undefined}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div key={hour} className={styles.hourCell} />
                    ))}
                  </div>
                ))}

                {layouts.map((layout) => {
                  const columnIndex = columns.indexOf(layout.occurrenceDate);
                  if (columnIndex < 0) return null;
                  const top = (layout.startMinutes / 60) * HOUR_HEIGHT;
                  const height = Math.max(52, ((layout.endMinutes - layout.startMinutes) / 60) * HOUR_HEIGHT);
                  const width = `calc(${100 / columns.length}% - 10px)`;
                  const innerWidth = `${100 / layout.laneCount}%`;
                  const isTiny = height < 58;
                  const isCompact = height < 90;
                  const secondaryLabel = plannerSecondaryLabel(layout.task);
                  return (
                    <div
                      key={layout.key}
                      className={styles.eventShell}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `calc(${(100 / columns.length) * columnIndex}% + 5px)`,
                        width,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        data-planner-event="true"
                        className={[
                          styles.eventCard,
                          layout.task.completedForDate ? styles.eventCardDone : '',
                          isCompact ? styles.eventCardCompact : '',
                          isTiny ? styles.eventCardTiny : '',
                          interaction?.key === layout.key ? styles.eventCardDragging : '',
                        ].filter(Boolean).join(' ')}
                        style={{
                          left: `calc(${layout.lane * (100 / layout.laneCount)}% + 1px)`,
                          width: `calc(${innerWidth} - 2px)`,
                        }}
                        onClick={() => openEditor(layout)}
                        onKeyDown={(event) => handleKeyDown(event, layout)}
                        onPointerDown={(event) => startInteraction('drag', layout, event)}
                      >
                        <button
                          type="button"
                          className={[styles.cardCheckbox, layout.task.completedForDate ? styles.cardCheckboxDone : ''].filter(Boolean).join(' ')}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => handleQuickToggle(event, layout)}
                          aria-label={layout.task.completedForDate ? 'Снять выполнение' : 'Отметить выполненной'}
                        >
                          {layout.task.completedForDate ? <Check className={styles.checkboxIcon} strokeWidth={3} /> : null}
                        </button>

                        <div className={styles.eventCardInner}>
                          <div className={styles.eventCardTop}>
                            <span className={styles.eventTime}>
                              {layout.task.timeLabel ?? timeRangeLabel(layout.startMinutes, layout.endMinutes)}
                            </span>
                            {!isTiny && secondaryLabel ? <span className={styles.eventType}>{secondaryLabel}</span> : null}
                          </div>

                          <div className={styles.eventContent}>
                            <strong className={styles.eventTitle}>{layout.task.title}</strong>
                            {!isCompact && !isTiny && trimNotes(layout.task.notes, 56) ? <span className={styles.eventNotes}>{trimNotes(layout.task.notes, 56)}</span> : null}
                          </div>
                        </div>

                        <div
                          className={[styles.resizeHandle, styles.resizeHandleTop].join(' ')}
                          onPointerDown={(event) => startInteraction('resize-start', layout, event)}
                        />
                        <div
                          className={[styles.resizeHandle, styles.resizeHandleBottom].join(' ')}
                          onPointerDown={(event) => startInteraction('resize-end', layout, event)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {!layouts.length ? (
          <div className={styles.empty}>
            Нажмите на пустой слот в сетке, чтобы сразу создать задачу на нужное время.
          </div>
        ) : null}

        {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
      </section>
      <DailyPlannerEditor
        activeTask={activeTask ? { task: activeTask.task, occurrenceDate: activeTask.occurrenceDate } : null}
        editor={editor}
        setEditor={setEditor}
        saving={saving}
        onSave={() => void handleSave()}
        onClose={() => setActiveTaskKey(null)}
        onToggleTask={onToggleTask}
        relatedTasks={relatedTasks}
        sourceDetails={sourceDetails}
      />
    </>
  );
}
