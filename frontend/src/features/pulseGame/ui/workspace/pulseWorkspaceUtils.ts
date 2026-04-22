'use client';

import type { PulseFood, PulseMealItem, PulseTaskGoal, PulseTaskItem } from '@/shared/types/pulse';

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

export type TaskArea = 'none' | 'work' | 'home' | 'health' | 'personal';

type TaskType = 'REGULAR' | 'ONE_TIME' | 'HABIT';
type TaskSchedule = 'NONE' | 'WEEKLY' | 'MONTHLY';

const GOAL_META_MARKER = '[PULSE_META]';

const TASK_AREA_TAGS: Record<Exclude<TaskArea, 'none'>, string> = {
  work: 'работа',
  home: 'дом',
  health: 'здоровье',
  personal: 'личное',
};

const AREA_PATTERNS: Record<Exclude<TaskArea, 'none'>, RegExp> = {
  work: /работ|work|office|проект/i,
  home: /дом|быт|home|house/i,
  health: /здоров|спорт|health|fit|well/i,
  personal: /лич|сем|personal|self/i,
};

export function fmtDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dateOnly = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const normalized = raw.split('T')[0] ?? raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const fallback = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

export function formatLongDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parsed);
}

export function shiftDate(value: string, delta: number) {
  const date = parseDate(value) ?? new Date();
  date.setDate(date.getDate() + delta);
  return fmtDate(date);
}

export function getWeekDates(selectedDate: string) {
  const date = parseDate(selectedDate) ?? new Date();
  const jsDay = date.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  return Array.from({ length: 7 }).map((_, index) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + index);
    return fmtDate(current);
  });
}

export function getDayOfMonthOrToday(value?: string | Date | null) {
  return (parseDate(value) ?? new Date()).getDate();
}

export function scrollHorizontalChildIntoView(
  container: HTMLElement | null,
  node: HTMLElement | null,
  options: {
    behavior?: ScrollBehavior;
    inset?: number;
    mode?: 'nearest' | 'center';
  } = {},
) {
  if (!container || !node) return;

  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  if (maxScrollLeft <= 0) return;

  const inset = options.inset ?? 12;
  const behavior = options.behavior ?? 'auto';
  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();

  if (options.mode === 'center') {
    const centeredLeft =
      container.scrollLeft +
      (nodeRect.left - containerRect.left) -
      (container.clientWidth - nodeRect.width) / 2;

    container.scrollTo({
      left: Math.max(0, Math.min(maxScrollLeft, centeredLeft)),
      behavior,
    });
    return;
  }

  const leftOverflow = nodeRect.left - containerRect.left - inset;
  const rightOverflow = nodeRect.right - containerRect.right + inset;

  if (leftOverflow < 0) {
    container.scrollTo({
      left: Math.max(0, container.scrollLeft + leftOverflow),
      behavior,
    });
    return;
  }

  if (rightOverflow > 0) {
    container.scrollTo({
      left: Math.min(maxScrollLeft, container.scrollLeft + rightOverflow),
      behavior,
    });
  }
}

export function getCurrentTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatTimeLabel(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '—';
  if (parsed.getHours() === 0 && parsed.getMinutes() === 0) return 'Без времени';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatUsageCountLabel(value?: number | null) {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  if (safe === 1) return '1 добавление';
  if (safe >= 2 && safe <= 4) return `${safe} добавления`;
  return `${safe} добавлений`;
}

export function num(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function intNum(value: string) {
  const parsed = num(value);
  return parsed == null ? null : Math.round(parsed);
}

export function addMinutesToTime(value: string, minutesToAdd = 45) {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const nextMinutes = Math.min(hours * 60 + minutes + minutesToAdd, 23 * 60 + 59);
  const nextHours = Math.floor(nextMinutes / 60);
  const nextMinutePart = nextMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutePart).padStart(2, '0')}`;
}

export function resolveTaskAreaFromTags(tags: string[]): TaskArea {
  for (const [area, pattern] of Object.entries(AREA_PATTERNS) as Array<[Exclude<TaskArea, 'none'>, RegExp]>) {
    if (tags.some((tag) => pattern.test(tag))) {
      return area;
    }
  }
  return 'none';
}

function stripAreaTags(tags: string[]) {
  return tags.filter((tag) => !Object.values(AREA_PATTERNS).some((pattern) => pattern.test(tag)));
}

function mergeTaskTags(area: TaskArea, tags: string[]) {
  const base = stripAreaTags(tags).filter(Boolean);
  if (area === 'none') return base;
  return [TASK_AREA_TAGS[area], ...base];
}

export function getPriorityLabel(priority: number) {
  if (priority >= 4) return 'Высокий';
  if (priority <= 1) return 'Низкий';
  return 'Обычный';
}

export type TaskDraft = {
  title: string;
  notes: string;
  taskType: TaskType;
  date: string;
  timeMode: 'NONE' | 'SINGLE' | 'RANGE';
  time: string;
  endTime: string;
  hasEndTime: boolean;
  scheduleType: TaskSchedule;
  daysOfWeek: number[];
  daysOfMonth: number[];
  priority: number;
  area: TaskArea;
  tags: string[];
};

export function inferTimeMode(draft: Pick<TaskDraft, 'time' | 'endTime' | 'hasEndTime'>): TaskDraft['timeMode'] {
  if (!draft.time) return 'NONE';
  if (draft.endTime || draft.hasEndTime) return 'RANGE';
  return 'SINGLE';
}

export function normalizeTaskDraft(draft: TaskDraft): TaskDraft {
  const timeMode =
    draft.timeMode === 'NONE' && !draft.time
      ? 'NONE'
      : draft.timeMode === 'RANGE' || draft.hasEndTime
        ? 'RANGE'
        : draft.time
          ? 'SINGLE'
          : 'NONE';

  if (timeMode === 'NONE') {
    return { ...draft, timeMode, time: '', endTime: '', hasEndTime: false };
  }

  if (timeMode === 'SINGLE') {
    return { ...draft, timeMode, endTime: '', hasEndTime: false };
  }

  const resolvedTime = draft.time || '09:00';
  return {
    ...draft,
    timeMode,
    time: resolvedTime,
    endTime: draft.endTime || addMinutesToTime(resolvedTime),
    hasEndTime: true,
  };
}

export function createTaskDraft(date: string, overrides: Partial<TaskDraft> = {}): TaskDraft {
  const resolvedDate = overrides.date || date;
  const resolvedDaysOfMonth = overrides.daysOfMonth?.length
    ? [...overrides.daysOfMonth]
    : [getDayOfMonthOrToday(resolvedDate)];

  const baseDraft: TaskDraft = {
    title: '',
    notes: '',
    taskType: 'ONE_TIME',
    date: resolvedDate,
    timeMode: 'NONE',
    time: '',
    endTime: '',
    hasEndTime: false,
    scheduleType: 'NONE',
    daysOfWeek: overrides.daysOfWeek?.length ? [...overrides.daysOfWeek] : [0],
    daysOfMonth: resolvedDaysOfMonth,
    priority: 2,
    area: 'none',
    tags: [],
  };

  const resolvedTimeMode =
    overrides.timeMode ?? (overrides.endTime ? 'RANGE' : overrides.time ? 'SINGLE' : 'NONE');

  return normalizeTaskDraft({
    ...baseDraft,
    ...overrides,
    date: resolvedDate,
    timeMode: resolvedTimeMode,
    daysOfMonth: resolvedDaysOfMonth,
    hasEndTime: resolvedTimeMode === 'RANGE',
  });
}

export function canSubmitTaskDraft(draft: TaskDraft) {
  if (!draft.title.trim()) return false;
  if (draft.taskType === 'REGULAR' && draft.scheduleType === 'WEEKLY' && !draft.daysOfWeek.length) {
    return false;
  }
  if (draft.taskType === 'REGULAR' && draft.scheduleType === 'MONTHLY' && !draft.daysOfMonth.length) {
    return false;
  }
  if (draft.timeMode === 'NONE') return true;
  if (draft.timeMode === 'SINGLE') return Boolean(draft.time);
  return Boolean(draft.time && draft.endTime);
}

function formatTaskInputTime(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

export function createTaskDraftFromItem(task: PulseTaskItem, fallbackDate: string) {
  const taskDate = parseDate(task.dueDate ?? null);
  const endDate = parseDate(task.endDate ?? null);
  const resolvedDate = taskDate ? fmtDate(taskDate) : fallbackDate;
  const timeMode: TaskDraft['timeMode'] = !task.hasTime ? 'NONE' : endDate ? 'RANGE' : 'SINGLE';
  const scheduleType: TaskDraft['scheduleType'] =
    task.taskType !== 'REGULAR'
      ? 'NONE'
      : task.scheduleType === 'MONTHLY'
        ? 'MONTHLY'
        : 'WEEKLY';
  const daysOfWeek =
    task.scheduleType === 'DAILY'
      ? [0, 1, 2, 3, 4, 5, 6]
      : task.daysOfWeek?.length
        ? [...task.daysOfWeek]
        : [0];

  return normalizeTaskDraft({
    title: task.title,
    notes: task.notes ?? '',
    taskType: task.taskType,
    date: resolvedDate,
    time: task.hasTime ? formatTaskInputTime(task.dueDate) : '',
    endTime: endDate ? formatTaskInputTime(task.endDate) : '',
    timeMode,
    hasEndTime: timeMode === 'RANGE',
    scheduleType,
    daysOfWeek,
    daysOfMonth: task.daysOfMonth?.length ? [...task.daysOfMonth] : [getDayOfMonthOrToday(resolvedDate)],
    priority: task.priority ?? 2,
    area: resolveTaskAreaFromTags(task.tags ?? []),
    tags: [...(task.tags ?? [])],
  });
}

export function buildTaskPayload(draft: TaskDraft, fallbackDate: string) {
  const resolvedDate = draft.date || fallbackDate;
  return {
    title: draft.title.trim(),
    notes: draft.notes.trim() || null,
    taskType: draft.taskType,
    date: resolvedDate,
    time: draft.timeMode === 'NONE' ? null : draft.time || null,
    endTime: draft.timeMode === 'RANGE' ? draft.endTime || null : null,
    scheduleType: draft.taskType === 'REGULAR' ? draft.scheduleType : 'NONE',
    daysOfWeek:
      draft.taskType === 'REGULAR' && draft.scheduleType === 'WEEKLY'
        ? draft.daysOfWeek
        : [],
    daysOfMonth:
      draft.taskType === 'REGULAR' && draft.scheduleType === 'MONTHLY'
        ? draft.daysOfMonth
        : [],
    priority: draft.priority,
    tags: mergeTaskTags(draft.area, draft.tags),
  };
}

export type GoalSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type GoalMeta = {
  subtasks: GoalSubtask[];
  achieved?: boolean;
};

export function normalizeGoalSubtasks(value: unknown): GoalSubtask[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const source = item as Record<string, unknown>;
      const title = String(source?.title ?? '').trim();
      if (!title) return null;

      return {
        id: String(source?.id ?? `goal-subtask-${index}`),
        title,
        done: Boolean(source?.done),
      } satisfies GoalSubtask;
    })
    .filter((item): item is GoalSubtask => Boolean(item));
}

export function parseGoalDescription(description?: string | null) {
  const raw = (description ?? '').trim();
  if (!raw) {
    return {
      text: '',
      meta: { subtasks: [], achieved: false } satisfies GoalMeta,
    };
  }

  const markerIndex = raw.lastIndexOf(GOAL_META_MARKER);
  if (markerIndex === -1) {
    return {
      text: raw,
      meta: { subtasks: [], achieved: false } satisfies GoalMeta,
    };
  }

  const text = raw.slice(0, markerIndex).trim();
  const payload = raw.slice(markerIndex + GOAL_META_MARKER.length);

  try {
    const parsed = JSON.parse(decodeURIComponent(payload));

    return {
      text,
      meta: {
        subtasks: normalizeGoalSubtasks(parsed?.subtasks),
        achieved: Boolean(parsed?.achieved),
      } satisfies GoalMeta,
    };
  } catch {
    return {
      text: raw,
      meta: { subtasks: [], achieved: false } satisfies GoalMeta,
    };
  }
}

export function buildGoalDescription(text: string, meta: GoalMeta) {
  const normalizedText = text.trim();
  const normalizedMeta = {
    subtasks: normalizeGoalSubtasks(meta.subtasks),
    achieved: Boolean(meta.achieved),
  } satisfies GoalMeta;

  if (!normalizedMeta.subtasks.length && !normalizedMeta.achieved) {
    return normalizedText || null;
  }

  const payload = encodeURIComponent(JSON.stringify(normalizedMeta));
  return `${normalizedText}${normalizedText ? '\n\n' : ''}${GOAL_META_MARKER}${payload}`;
}

export function decorateGoal(goal: PulseTaskGoal) {
  const parsed = parseGoalDescription(goal.description);
  const subtaskCount = parsed.meta.subtasks.length;
  const doneCount = parsed.meta.subtasks.filter((item) => item.done).length;
  const computedProgress = subtaskCount ? Math.round((doneCount / subtaskCount) * 100) : goal.progress;
  const achieved = parsed.meta.achieved || computedProgress >= 100;

  return {
    ...goal,
    displayDescription: parsed.text,
    subtasks: parsed.meta.subtasks,
    subtaskCount,
    doneCount,
    computedProgress,
    achieved,
  };
}

export function getMealItemIdentity(item: PulseMealItem) {
  return (item.sourceFoodId && item.sourceFoodId.trim()) || item.name.trim().toLowerCase();
}

export function getFoodIdentity(food: Pick<PulseFood, 'id' | 'name'>) {
  return (food.id && food.id.trim()) || food.name.trim().toLowerCase();
}

export function buildMealItemFromFood(food: PulseFood): PulseMealItem {
  const grams = Number(food.defaultGrams ?? 100);
  const factor = food.defaultGrams ? 1 : grams / 100;
  const scaleMacro = (value?: number | null) =>
    value == null ? null : Number(((food.defaultGrams ? value : value * factor)).toFixed(1));

  return {
    sourceFoodId: food.id,
    name: food.name,
    grams,
    calories: food.defaultGrams ? Number(food.calories) : Math.round(Number(food.calories) * factor),
    protein: scaleMacro(food.protein),
    fat: scaleMacro(food.fat),
    carbs: scaleMacro(food.carbs),
    isHealthy: Boolean(food.isHealthy),
  };
}
