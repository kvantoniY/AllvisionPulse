'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Coffee,
  CreditCard,
  Ellipsis,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Info,
  Moon,
  Pencil,
  Plus,
  Ruler,
  Scale,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  UtensilsCrossed,
  WalletMinimal,
  Wine,
  Zap,
} from 'lucide-react';
import styles from './Health.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import {
  useAddMealMutation,
  useCreateDebtMutation,
  useCreateFinanceCategoryMutation,
  useCreateFinanceEntryMutation,
  useCreateFoodMutation,
  useCreatePulseGoalMutation,
  useCreatePulseTaskMutation,
  useCreateSavingsGoalMutation,
  useDeleteDebtMutation,
  useDeleteFinanceEntryMutation,
  useDeleteMealMutation,
  useDeletePulseGoalMutation,
  useDeletePulseTaskMutation,
  useDeleteSavingsGoalMutation,
  useGetAnalyticsQuery,
  useGetConfigQuery,
  useUpdateFinanceCategoryMutation,
  useUpdateFinanceEntryMutation,
  useGetFinanceOverviewQuery,
  useGetMentalDayQuery,
  useGetNutritionQuery,
  useGetOverviewQuery,
  useGetProfileQuery,
  useGetTasksDayQuery,
  useGetTasksRangeQuery,
  useSaveMentalDayMutation,
  useSearchFoodsQuery,
  useTogglePulseTaskDateMutation,
  useUpdateConfigMutation,
  useUpdateDebtMutation,
  useUpdateMealMutation,
  useUpdateNutritionGoalMutation,
  useUpdateProfileMutation,
  useUpdatePulseGoalMutation,
  useUpdatePulseTaskMutation,
  useUpdateSavingsGoalMutation,
} from '@/shared/api/pulseApi';
import { computeMentalPulse7, computeMentalScore } from '@/shared/lib/health';
import type { PulseFinanceEntry, PulseFinanceShareMeta, PulseFood, PulseMeal, PulseMealItem, PulseTaskGoal, PulseTaskItem } from '@/shared/types/pulse';
import { DiaryTimelineBoard } from '@/features/dailyPlanner/ui/DiaryTimelineBoard';
import { ProgramTodayWidget } from '@/features/programs/ui/ProgramTodayWidget';
import { Field, FinanceComparisonMetricCard, FinanceEntryCompactRow, FinanceShareParticipants, HealthSlider, MiniRing, PulseIcon, Segmented, SliderCard } from '@/features/pulse/ui/HealthPageWidgets';
import type { PulseIconName } from '@/features/pulse/ui/HealthPageWidgets';
const ProgramsPulseTab = dynamic(
  () => import('@/features/programs/ui/ProgramsPulseTab').then((mod) => mod.ProgramsPulseTab),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}><Skeleton style={{ width: '100%', height: 320 }} /></div>,
  },
);

const DailyPlanner = dynamic(
  () => import('@/features/dailyPlanner/ui/DailyPlanner').then((mod) => mod.DailyPlanner),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}><Skeleton style={{ width: '100%', height: 420 }} /></div>,
  },
);

const AnalyticsTab = dynamic(
  () => import('@/features/pulse/ui/AnalyticsTab').then((mod) => mod.AnalyticsTab),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}><Skeleton style={{ width: '100%', height: 360 }} /></div>,
  },
);

const ConfigTab = dynamic(
  () => import('@/features/pulse/ui/ConfigTab').then((mod) => mod.ConfigTab),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}><Skeleton style={{ width: '100%', height: 280 }} /></div>,
  },
);

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const NUTRITION_HEIGHT_SCALE = [200, 195, 190, 185, 180, 175, 170, 165, 160, 155, 150];

const DIARY_TIMELINE_START_HOUR = 6;
const DIARY_TIMELINE_TOTAL_HOURS = 24;
const DIARY_TIMELINE_LABELS = Array.from(
  { length: DIARY_TIMELINE_TOTAL_HOURS + 1 },
  (_, index) => (DIARY_TIMELINE_START_HOUR + index) % 24,
);

function fmtDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dayOnly = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dayOnly.getTime()) ? null : dayOnly;
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

function formatLongDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(parsed);
}

function getDayOfMonthOrToday(value?: string | Date | null) {
  return (parseDate(value) ?? new Date()).getDate();
}

function formatShortDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(parsed);
}

function formatToolbarWeekday(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(parsed);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatNumericValue(value: number | null | undefined, maximumFractionDigits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function formatMoneyCompact(value: number | null | undefined) {
  const amount = value ?? 0;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} млн ₽`;
  if (abs >= 1_000) return `${Math.round(amount / 1_000)} тыс ₽`;
  return formatMoney(amount);
}

function formatChartTick(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(parsed);
}

function ensureHorizontalChildVisibility(container: HTMLElement | null, node: HTMLElement | null, inset = 16) {
  if (!container || !node) return;

  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  if (maxScrollLeft <= 0) return;

  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const leftOverflow = nodeRect.left - containerRect.left - inset;
  const rightOverflow = nodeRect.right - containerRect.right + inset;

  if (leftOverflow < 0) {
    container.scrollTo({ left: Math.max(0, container.scrollLeft + leftOverflow), behavior: 'auto' });
    return;
  }

  if (rightOverflow > 0) {
    container.scrollTo({ left: Math.min(maxScrollLeft, container.scrollLeft + rightOverflow), behavior: 'auto' });
  }
}

function shiftDate(value: string, delta: number) {
  const date = parseDate(value) ?? new Date();
  date.setDate(date.getDate() + delta);
  return fmtDate(date);
}

function getWeekDates(selectedDate: string) {
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

function num(v: string) {
  if (!v.trim()) return null;
  const value = Number(v.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function intNum(v: string) {
  const parsed = num(v);
  return parsed == null ? null : Math.round(parsed);
}

const GOAL_META_MARKER = '[PULSE_META]';

type GoalSubtask = {
  id: string;
  title: string;
  done: boolean;
};

type GoalMeta = {
  subtasks: GoalSubtask[];
  achieved?: boolean;
};


type DebtScenarioKey = 'CREDIT' | 'MORTGAGE' | 'INSTALLMENT' | 'PERSONAL';

type DebtScenarioMeta = {
  key: DebtScenarioKey;
  title: string;
  description: string;
  debtType: string;
  icon: PulseIconName;
  requiresInterest?: boolean;
  prefersSchedule?: boolean;
  requiresTerm?: boolean;
  titlePlaceholder: string;
};

const debtScenarioOptions: DebtScenarioMeta[] = [
  {
    key: 'CREDIT',
    title: 'Кредит',
    description: 'Банк, кредитная линия или потребительский займ с регулярным платежом.',
    debtType: 'Кредит',
    icon: 'card',
    requiresInterest: true,
    prefersSchedule: true,
    requiresTerm: true,
    titlePlaceholder: 'Например, Потребительский кредит',
  },
  {
    key: 'MORTGAGE',
    title: 'Ипотека',
    description: 'Долгосрочное обязательство с фиксированным днём платежа и ставкой.',
    debtType: 'Ипотека',
    icon: 'target',
    requiresInterest: true,
    prefersSchedule: true,
    requiresTerm: true,
    titlePlaceholder: 'Например, Ипотека Сбербанк',
  },
  {
    key: 'INSTALLMENT',
    title: 'Рассрочка',
    description: 'Покупка частями. Обычно без процентов, но с понятным графиком.',
    debtType: 'Рассрочка',
    icon: 'calendar',
    prefersSchedule: true,
    requiresTerm: true,
    titlePlaceholder: 'Например, Рассрочка на ноутбук',
  },
  {
    key: 'PERSONAL',
    title: 'Личный долг',
    description: 'Когда должен человеку. Без лишних банковских полей и процентов.',
    debtType: 'Личный долг',
    icon: 'heart',
    prefersSchedule: false,
    requiresTerm: false,
    titlePlaceholder: 'Например, Долг Сергею',
  },
];

function normalizeGoalSubtasks(value: unknown): GoalSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const source = item as Record<string, unknown>;
      const title = String(source?.title ?? '').trim();
      if (!title) return null;
      return {
        id: String(source?.id ?? `subtask-${index}`),
        title,
        done: Boolean(source?.done),
      } satisfies GoalSubtask;
    })
    .filter((item): item is GoalSubtask => Boolean(item));
}

function createGoalSubtasksFromText(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `goal-subtask-${Date.now()}-${index}-${title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-')}`,
      title,
      done: false,
    }));
}

function parseGoalDescription(description?: string | null) {
  const raw = (description ?? '').trim();
  if (!raw) return { text: '', meta: { subtasks: [], achieved: false } as GoalMeta };
  const markerIndex = raw.lastIndexOf(GOAL_META_MARKER);
  if (markerIndex === -1) return { text: raw, meta: { subtasks: [], achieved: false } as GoalMeta };

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
    return { text: raw, meta: { subtasks: [], achieved: false } as GoalMeta };
  }
}

function buildGoalDescription(text: string, meta: GoalMeta) {
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

function decorateGoal(goal: PulseTaskGoal) {
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

function pillTone(value: number, target: number) {
  if (value >= target) return 'success';
  if (value >= target * 0.75) return 'neutral';
  return 'danger';
}

function formatMealTime(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function clampPercent(value: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function formatFullDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
}

function formatToolbarDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(parsed);
}

function normalizeDateKey(value?: string | null) {
  const parsed = parseDate(value);
  return parsed ? fmtDate(parsed) : null;
}

function shiftDateKey(value: string, deltaDays: number) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const next = new Date(parsed);
  next.setDate(next.getDate() + deltaDays);
  return fmtDate(next);
}

function describeScore(score: number) {
  if (score >= 85) return 'Отличное';
  if (score >= 70) return 'Хорошее';
  if (score >= 55) return 'Стабильно';
  if (score >= 40) return 'Ниже нормы';
  return 'Требует внимания';
}

function describeTrend(score: number) {
  if (score >= 80) return 'Сильный ритм';
  if (score >= 65) return 'Стабильно';
  if (score >= 50) return 'Неровно';
  return 'Просадка';
}

function getRecommendationMeta(text: string) {
  const value = text.toLowerCase();

  if (/(стресс|сон|самочув|устал|настро)/.test(value)) {
    return { tone: 'danger', action: 'Записать', icon: 'heart' as const, target: 'health' as const };
  }

  if (/(калор|питани|при[её]м пищи|еда|бжу)/.test(value)) {
    return { tone: 'info', action: 'Добавить', icon: 'meal' as const, target: 'meal' as const };
  }

  if (/(платеж|кредит|расход|финанс|долг)/.test(value)) {
    return { tone: 'warning', action: 'Открыть', icon: 'wallet' as const, target: 'finance' as const };
  }

  if (/(задач|продуктив|дедлайн|привыч)/.test(value)) {
    return { tone: 'warning', action: 'Открыть', icon: 'spark' as const, target: 'tasks' as const };
  }

  return { tone: 'neutral', action: 'Открыть', icon: 'spark' as const, target: 'pulse' as const };
}

function getPulseRecommendationMeta(text: string) {
  const meta = getRecommendationMeta(text);

  return {
    ...meta,
    group: meta.tone === 'danger' || meta.target === 'finance' ? 'attention' as const : 'suggestion' as const,
  };
}

function getFinanceCategoryMeta(name?: string | null) {
  const value = (name ?? '').toLowerCase();

  if (/(прод|еда|магаз|пятер|вкусвилл|лента)/.test(value)) return { icon: 'meal' as const, tone: 'green' as const };
  if (/(каф|ресторан|кофе|бар)/.test(value)) return { icon: 'coffee' as const, tone: 'yellow' as const };
  if (/(транспорт|метро|такси|авто|бенз)/.test(value)) return { icon: 'trend' as const, tone: 'blue' as const };
  if (/(дом|коммун|ипотек|квартир)/.test(value)) return { icon: 'target' as const, tone: 'orange' as const };
  if (/(здоров|аптек|врач)/.test(value)) return { icon: 'heart' as const, tone: 'pink' as const };
  if (/(досуг|хобби|кино|игр|развлеч)/.test(value)) return { icon: 'spark' as const, tone: 'purple' as const };
  if (/(зарплат|прем|доход|подар)/.test(value)) return { icon: 'trend' as const, tone: 'green' as const };
  return { icon: 'wallet' as const, tone: 'orange' as const };
}

function getHabitOverviewMeta(title: string) {
  const value = title.toLowerCase();

  if (/(кур|сигар|вейп|никотин)/.test(value)) return { icon: 'cigarette' as const, tone: 'accent' as const };
  if (/(кровать|сон|спать|отбой|подъём|подъем|постель)/.test(value)) return { icon: 'bed' as const, tone: 'success' as const };
  if (/(алког|вино|пиво|бар|коктейл)/.test(value)) return { icon: 'wine' as const, tone: 'info' as const };
  if (/(вода|пить|стакан)/.test(value)) return { icon: 'meal' as const, tone: 'info' as const };
  if (/(шаг|ход|трен|спорт|бег|зал|заряд)/.test(value)) return { icon: 'activity' as const, tone: 'success' as const };
  return { icon: 'flame' as const, tone: 'accent' as const };
}

function getRecurrenceLabel(recurrenceJson: unknown) {
  if (!recurrenceJson || typeof recurrenceJson !== 'object') return null;
  return 'Регулярный платёж';
}


function findCategoryIdByKeywords(categories: Array<{ id: string; name: string }>, patterns: RegExp[]) {
  return categories.find((category) => patterns.some((pattern) => pattern.test(category.name.toLowerCase())))?.id ?? null;
}

function getDaysUntilLabel(value?: string | null, baseDate?: string) {
  const target = parseDate(value ?? null);
  const base = parseDate(baseDate ?? null) ?? new Date();
  if (!target) return null;
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  const finish = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diff = Math.round((finish - start) / 86400000);
  if (diff <= 0) return 'сегодня';
  if (diff == 1) return 'через 1 день';
  if (diff < 5) return `через ${diff} дня`;
  return `через ${diff} дней`;
}

type FinanceCompositionItem = {
  key: string;
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'accent' | 'neutral';
};

type SummaryCard = {
  key: string;
  icon: PulseIconName;
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
  tone?: 'accent' | 'success' | 'danger' | 'neutral' | 'goal';
};


function formatTimeLabel(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '—';
  if (parsed.getHours() === 0 && parsed.getMinutes() === 0) return 'Без времени';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function getCurrentTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatUsageCountLabel(value?: number | null) {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  if (safe === 1) return '1 добавление';
  if (safe >= 2 && safe <= 4) return `${safe} добавления`;
  return `${safe} добавлений`;
}

function formatOperationsCountLabel(value: number, range: 'DAY' | 'MONTH' | 'YEAR') {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  const remainder10 = safe % 10;
  const remainder100 = safe % 100;
  const noun = remainder10 === 1 && remainder100 !== 11
    ? 'операция'
    : remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)
      ? 'операции'
      : 'операций';
  const period = range === 'DAY' ? 'за день' : range === 'MONTH' ? 'за месяц' : 'за год';
  return `${safe} ${noun} ${period}`;
}

function getMealItemIdentity(item: PulseMealItem) {
  return (item.sourceFoodId && item.sourceFoodId.trim()) || item.name.trim().toLowerCase();
}

function getFoodIdentity(food: Pick<PulseFood, 'id' | 'name'>) {
  return (food.id && food.id.trim()) || food.name.trim().toLowerCase();
}

function getTaskProgressGradient(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  if (clamped >= 80) {
    return 'linear-gradient(90deg, rgba(94, 152, 110, 0.9), rgba(62, 118, 83, 0.96))';
  }
  if (clamped >= 40) {
    return 'linear-gradient(90deg, rgba(214, 136, 80, 0.9), rgba(183, 105, 51, 0.96))';
  }
  return 'linear-gradient(90deg, rgba(191, 111, 97, 0.9), rgba(156, 82, 72, 0.96))';
}

function getTaskProgressAccent(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  if (clamped >= 80) return 'rgb(132, 184, 144)';
  if (clamped >= 40) return 'rgb(224, 162, 103)';
  return 'rgb(208, 132, 120)';
}

type TaskDraft = {
  title: string;
  notes: string;
  taskType: 'REGULAR' | 'ONE_TIME' | 'HABIT';
  date: string;
  timeMode: 'NONE' | 'SINGLE' | 'RANGE';
  time: string;
  endTime: string;
  hasEndTime: boolean;
  scheduleType: 'NONE' | 'WEEKLY' | 'MONTHLY';
  daysOfWeek: number[];
  daysOfMonth: number[];
};

type MentalFormState = {
  sleepHours: string;
  nutrition: string;
  productivity: string;
  stress: string;
  wellbeing: string;
  alcoholLevel: string;
  activityLevel: string;
  caffeineLevel: string;
  comment: string;
};

function addMinutesToTime(value: string, minutesToAdd = 45) {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  const nextMinutes = Math.min(hours * 60 + minutes + minutesToAdd, 23 * 60 + 59);
  const nextHours = Math.floor(nextMinutes / 60);
  const nextMinutePart = nextMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutePart).padStart(2, '0')}`;
}

function inferTimeMode(draft: Pick<TaskDraft, 'time' | 'endTime' | 'hasEndTime'>): TaskDraft['timeMode'] {
  if (!draft.time) return 'NONE';
  if (draft.endTime || draft.hasEndTime) return 'RANGE';
  return 'SINGLE';
}

function normalizeTaskDraft(draft: TaskDraft): TaskDraft {
  const timeMode = draft.timeMode === 'NONE' && !draft.time ? 'NONE'
    : draft.timeMode === 'RANGE' || draft.hasEndTime ? 'RANGE'
    : draft.time ? 'SINGLE'
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

function createTaskDraft(date: string, overrides: Partial<TaskDraft> = {}): TaskDraft {
  const resolvedDate = overrides.date || date;
  const resolvedDaysOfMonth = overrides.daysOfMonth?.length ? [...overrides.daysOfMonth] : [getDayOfMonthOrToday(resolvedDate)];
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
  };
  const resolvedTimeMode =
    overrides.timeMode
    ?? (overrides.endTime ? 'RANGE' : overrides.time ? 'SINGLE' : 'NONE');

  return normalizeTaskDraft({
    ...baseDraft,
    ...overrides,
    date: resolvedDate,
    timeMode: resolvedTimeMode,
    daysOfMonth: resolvedDaysOfMonth,
    hasEndTime: resolvedTimeMode === 'RANGE',
  });
}

function canSubmitTaskDraft(draft: TaskDraft) {
  if (!draft.title.trim()) return false;
  if (draft.timeMode === 'NONE') return true;
  if (draft.timeMode === 'SINGLE') return Boolean(draft.time);
  return Boolean(draft.time && draft.endTime);
}

function formatTaskInputTime(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

function createTaskDraftFromItem(task: PulseTaskItem, fallbackDate: string) {
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
  });
}

function buildTaskPayload(draft: TaskDraft, fallbackDate: string) {
  const resolvedDate = draft.date || fallbackDate;
  return {
    title: draft.title.trim(),
    notes: draft.notes.trim() || null,
    taskType: draft.taskType,
    date: resolvedDate,
    time: draft.timeMode === 'NONE' ? null : (draft.time || null),
    endTime: draft.timeMode === 'RANGE' ? (draft.endTime || null) : null,
    scheduleType: draft.taskType === 'ONE_TIME' ? 'NONE' : draft.scheduleType,
    daysOfWeek: draft.taskType === 'REGULAR' && draft.scheduleType === 'WEEKLY' ? draft.daysOfWeek : [],
    daysOfMonth: draft.taskType === 'REGULAR' && draft.scheduleType === 'MONTHLY' ? draft.daysOfMonth : [],
  };
}

function sortTasksByPlannerOrder<T extends { dueDate?: string | null; hasTime?: boolean; completedForDate?: boolean; priority?: number; title: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftDate = parseDate(left.dueDate ?? null);
    const rightDate = parseDate(right.dueDate ?? null);
    const leftTime = left.hasTime && leftDate ? leftDate.getHours() * 60 + leftDate.getMinutes() : Number.POSITIVE_INFINITY;
    const rightTime = right.hasTime && rightDate ? rightDate.getHours() * 60 + rightDate.getMinutes() : Number.POSITIVE_INFINITY;

    if (leftTime !== rightTime) return leftTime - rightTime;
    if ((right.priority ?? 0) !== (left.priority ?? 0)) return (right.priority ?? 0) - (left.priority ?? 0);
    return left.title.localeCompare(right.title, 'ru');
  });
}

function getTaskPrimaryTime(task: PulseTaskItem) {
  if (task.timeLabel?.trim()) return task.timeLabel.trim();
  if (task.hasTime && task.dueDate) return formatTimeLabel(task.dueDate);
  return 'Без времени';
}

function getTaskVisualMeta(task: PulseTaskItem) {
  if (task.sourceKey?.startsWith('finance:')) {
    return { label: 'Финансовая задача', tone: 'finance' as const };
  }
  if (task.sourceKey?.startsWith('debt:')) {
    return { label: 'Платёж по долгу', tone: 'debt' as const };
  }
  if (task.programMeta?.title?.trim()) {
    return { label: task.programMeta.title.trim(), tone: 'program' as const };
  }
  if (task.sourceEventTitle?.trim()) {
    return { label: task.sourceEventTitle.trim(), tone: 'event' as const };
  }
  if (task.socialEventRole === 'SUBTASK' || task.sourceArtifactId) {
    return { label: 'Из события', tone: 'event' as const };
  }
  if (task.taskType === 'HABIT') {
    return { label: 'Привычка', tone: 'habit' as const };
  }
  if (task.taskType === 'REGULAR') {
    return { label: 'Регулярная задача', tone: 'regular' as const };
  }
  return { label: 'Личная задача', tone: 'personal' as const };
}

function getTaskTypeLabel(task: PulseTaskItem) {
  if (task.taskType === 'HABIT') return 'Привычка';
  if (task.taskType === 'REGULAR') return 'Регулярная задача';
  return 'Разовая задача';
}

function getTaskRepeatSummary(task: PulseTaskItem) {
  if (task.taskType === 'ONE_TIME') return 'Без повтора';
  if (task.taskType === 'HABIT') return 'Повторяется каждый день';
  if (task.scheduleType === 'WEEKLY') {
    return task.daysOfWeek.length ? `По дням недели: ${task.daysOfWeek.map((day) => weekdayLabels[day] ?? '').filter(Boolean).join(', ')}` : 'По дням недели';
  }
  if (task.scheduleType === 'MONTHLY') {
    return task.daysOfMonth.length ? `По дням месяца: ${task.daysOfMonth.join(', ')}` : 'По дням месяца';
  }
  if (task.scheduleType === 'DAILY') return 'Ежедневно';
  return 'Без повтора';
}

function getTaskStatusLabel(task: PulseTaskItem) {
  return task.completedForDate ? 'Выполнена' : 'В работе';
}

function formatEntryMomentLabel(entry: Pick<PulseFinanceEntry, 'date' | 'createdAt'>) {
  const dateLabel = formatShortDate(entry.date);
  const timeLabel = formatTimeLabel(entry.createdAt);
  return timeLabel === 'Без времени' ? dateLabel : `${dateLabel} · ${timeLabel}`;
}

function formatMoneyDelta(value: number) {
  if (value === 0) return '0 ₽';
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
}

function getDeltaToneClass(value: number, positiveTrend: 'up' | 'down') {
  if (value === 0) return '';
  const isPositive = positiveTrend === 'up' ? value > 0 : value < 0;
  return isPositive ? styles.financeDeltaGood : styles.financeDeltaBad;
}

function getParticipantInitials(username?: string | null) {
  const parts = (username ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '•';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}


function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type DiaryTimelineEntry = {
  key: string;
  task: PulseTaskItem;
  label: string;
  tone: ReturnType<typeof getTaskVisualMeta>['tone'];
  left: number;
  minutes: number;
  windowLabel: string;
  excerpt: string;
};

function getDiaryTimelineMinutes(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return null;

  const minutes = parsed.getHours() * 60 + parsed.getMinutes();
  return minutes < DIARY_TIMELINE_START_HOUR * 60 ? minutes + 24 * 60 : minutes;
}

function getDiaryTimelinePercent(minutes: number) {
  return clampNumber(
    ((minutes - DIARY_TIMELINE_START_HOUR * 60) / (DIARY_TIMELINE_TOTAL_HOURS * 60)) * 100,
    0,
    100,
  );
}

function getDiaryTaskWindowLabel(task: PulseTaskItem) {
  const startLabel = getTaskPrimaryTime(task);
  if (!task.endDate) return startLabel;

  const endLabel = formatTimeLabel(task.endDate);
  if (!endLabel || endLabel === 'Без времени') return startLabel;
  return `${startLabel} - ${endLabel}`;
}

function getDiaryTaskExcerpt(task: PulseTaskItem, max = 72) {
  const clean = task.notes?.trim() ?? '';
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function getDiaryTaskKey(task: PulseTaskItem) {
  return task.occurrenceKey ?? task.id;
}

function pickDiaryFeaturedTask(entries: DiaryTimelineEntry[], date: string, now: Date) {
  if (!entries.length) return null;

  const openEntries = entries.filter((entry) => !entry.task.completedForDate);
  if (!openEntries.length) return entries[0] ?? null;

  if (date === fmtDate(now)) {
    const currentMinutesRaw = now.getHours() * 60 + now.getMinutes();
    const currentMinutes =
      currentMinutesRaw < DIARY_TIMELINE_START_HOUR * 60 ? currentMinutesRaw + 24 * 60 : currentMinutesRaw;

    return openEntries.find((entry) => entry.minutes >= currentMinutes) ?? openEntries[0] ?? entries[0] ?? null;
  }

  return openEntries[0] ?? entries[0] ?? null;
}

function DiaryTimelineHero({
  date,
  tasks,
  onOpenTask,
}: {
  date: string;
  tasks: PulseTaskItem[];
  onOpenTask: (task: PulseTaskItem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [scrollThumb, setScrollThumb] = useState({ visible: false, width: 32, left: 0 });
  const [now, setNow] = useState(() => new Date());

  const entries = useMemo<DiaryTimelineEntry[]>(() => {
    return tasks
      .map((task) => {
        const minutes = getDiaryTimelineMinutes(task.dueDate);
        if (minutes == null) return null;

        const visualMeta = getTaskVisualMeta(task);
        return {
          key: getDiaryTaskKey(task),
          task,
          label: visualMeta.label,
          tone: visualMeta.tone,
          left: getDiaryTimelinePercent(minutes),
          minutes,
          windowLabel: getDiaryTaskWindowLabel(task),
          excerpt: getDiaryTaskExcerpt(task),
        };
      })
      .filter((entry): entry is DiaryTimelineEntry => Boolean(entry))
      .sort((left, right) => left.minutes - right.minutes);
  }, [tasks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!entries.length) {
      setSelectedKey(null);
      return;
    }

    setSelectedKey((current) => {
      if (current && entries.some((entry) => entry.key === current)) return current;
      return pickDiaryFeaturedTask(entries, date, now)?.key ?? entries[0]?.key ?? null;
    });
  }, [date, entries, now]);

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? entries[0] ?? null;
  const isToday = date === fmtDate(now);
  const currentMinutesRaw = now.getHours() * 60 + now.getMinutes();
  const currentMinutes =
    currentMinutesRaw < DIARY_TIMELINE_START_HOUR * 60 ? currentMinutesRaw + 24 * 60 : currentMinutesRaw;
  const progressPercent = isToday ? getDiaryTimelinePercent(currentMinutes) : selectedEntry?.left ?? 0;
  const bubbleLeft = clampNumber(selectedEntry?.left ?? 50, 12, 88);
  const bubbleClassName = [
    styles.diaryHeroBubble,
    selectedEntry && selectedEntry.left < 18 ? styles.diaryHeroBubbleStart : '',
    selectedEntry && selectedEntry.left > 82 ? styles.diaryHeroBubbleEnd : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const updateThumb = () => {
      const node = scrollRef.current;
      if (!node) return;

      const hasOverflow = node.scrollWidth - node.clientWidth > 6;
      if (!hasOverflow) {
        setScrollThumb({ visible: false, width: 100, left: 0 });
        return;
      }

      const width = clampNumber((node.clientWidth / node.scrollWidth) * 100, 18, 100);
      const maxOffset = Math.max(0, 100 - width);
      const left =
        node.scrollWidth === node.clientWidth
          ? 0
          : (node.scrollLeft / (node.scrollWidth - node.clientWidth)) * maxOffset;

      setScrollThumb({ visible: true, width, left });
    };

    updateThumb();
    const node = scrollRef.current;
    if (!node) return;

    node.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
    return () => {
      node.removeEventListener('scroll', updateThumb);
      window.removeEventListener('resize', updateThumb);
    };
  }, [entries.length]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !selectedEntry || node.scrollWidth <= node.clientWidth) return;

    const targetLeft = (selectedEntry.left / 100) * node.scrollWidth - node.clientWidth * 0.5;
    node.scrollTo({
      left: clampNumber(targetLeft, 0, node.scrollWidth - node.clientWidth),
      behavior: 'smooth',
    });
  }, [selectedEntry?.key]);

  return (
    <section className={styles.diaryHeroSection}>
      <div className={styles.diaryHeroFrame}>
        <div ref={scrollRef} className={styles.diaryHeroScroller}>
          <div className={styles.diaryHeroCanvas}>
            <div className={styles.diaryHeroBackdrop} aria-hidden="true">
              <div className={[styles.diaryHeroSegment, styles.diaryHeroSegmentMorning].join(' ')} />
              <div className={[styles.diaryHeroSegment, styles.diaryHeroSegmentDay].join(' ')} />
              <div className={[styles.diaryHeroSegment, styles.diaryHeroSegmentSunset].join(' ')} />
              <div className={[styles.diaryHeroSegment, styles.diaryHeroSegmentNight].join(' ')} />

              <span className={[styles.diaryHeroOrb, styles.diaryHeroSunrise].join(' ')} />
              <span className={[styles.diaryHeroOrb, styles.diaryHeroSun].join(' ')} />
              <span className={[styles.diaryHeroOrb, styles.diaryHeroSunsetGlow].join(' ')} />
              <span className={[styles.diaryHeroOrb, styles.diaryHeroMoon].join(' ')} />

              <span className={[styles.diaryHeroCloud, styles.diaryHeroCloudMorning].join(' ')} />
              <span className={[styles.diaryHeroCloud, styles.diaryHeroCloudDay].join(' ')} />
              <span className={[styles.diaryHeroLandscape, styles.diaryHeroLandscapeFar].join(' ')} />
              <span className={[styles.diaryHeroLandscape, styles.diaryHeroLandscapeNear].join(' ')} />
              <span className={styles.diaryHeroCitySunset} />
              <span className={styles.diaryHeroCityNight} />
              <span className={styles.diaryHeroStars} />
            </div>

            {selectedEntry ? (
              <button
                type="button"
                className={bubbleClassName}
                style={{ left: `${bubbleLeft}%` }}
                onClick={() => onOpenTask(selectedEntry.task)}
              >
                <span className={styles.diaryHeroBubbleTitle}>
                  <span className={styles.diaryHeroBubbleDot} data-tone={selectedEntry.tone} />
                  {selectedEntry.task.title}
                </span>
                {selectedEntry.excerpt ? <span className={styles.diaryHeroBubbleText}>{selectedEntry.excerpt}</span> : null}
                <span className={styles.diaryHeroBubbleTime}>{selectedEntry.windowLabel}</span>
              </button>
            ) : null}

            {isToday ? (
              <div
                className={styles.diaryHeroNow}
                style={{ left: `${clampNumber(progressPercent, 4, 96)}%` }}
                aria-hidden="true"
              >
                <span className={styles.diaryHeroNowBadge}>
                  {now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={styles.diaryHeroNowDot} />
              </div>
            ) : null}

            <div className={styles.diaryHeroMarkers}>
              {entries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={[
                    styles.diaryHeroMarker,
                    entry.key === selectedEntry?.key ? styles.diaryHeroMarkerActive : '',
                  ].filter(Boolean).join(' ')}
                  style={{ left: `${entry.left}%` }}
                  onClick={() => setSelectedKey(entry.key)}
                  aria-label={`${entry.task.title}, ${entry.windowLabel}`}
                >
                  <span className={styles.diaryHeroMarkerStem} />
                  <span className={styles.diaryHeroMarkerDot} data-tone={entry.tone} />
                </button>
              ))}
            </div>

            <div className={styles.diaryHeroProgressTrack} aria-hidden="true">
              <span style={{ width: `${clampNumber(progressPercent, 0, 100)}%` }} />
            </div>

            <div className={styles.diaryHeroScale} aria-hidden="true">
              {DIARY_TIMELINE_LABELS.map((hour, index) => (
                <span key={`${hour}-${index}`} className={styles.diaryHeroScaleTick}>
                  {hour}
                </span>
              ))}
            </div>

            {!entries.length ? (
              <div className={styles.diaryHeroEmpty}>
                Добавьте задачи со временем, и они появятся на ленте дня.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {scrollThumb.visible ? (
        <div className={styles.diaryHeroScrollbar} aria-hidden="true">
          <span
            className={styles.diaryHeroScrollbarThumb}
            style={{ width: `${scrollThumb.width}%`, left: `${scrollThumb.left}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}

function NutritionFigureIllustration() {
  return (
    <svg viewBox="0 0 160 260" className={styles.nutritionFigureSvg} aria-hidden="true">
      <defs>
        <linearGradient id="nfSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbdcbd" />
          <stop offset="100%" stopColor="#e2b690" />
        </linearGradient>
        <linearGradient id="nfShirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#56b6ff" />
          <stop offset="60%" stopColor="#2c8ee0" />
          <stop offset="100%" stopColor="#1d6ab3" />
        </linearGradient>
        <linearGradient id="nfPants" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4658" />
          <stop offset="100%" stopColor="#1b2433" />
        </linearGradient>
        <linearGradient id="nfShoe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9a3c" />
          <stop offset="100%" stopColor="#d85a0c" />
        </linearGradient>
        <linearGradient id="nfHair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4d2e1a" />
          <stop offset="100%" stopColor="#271709" />
        </linearGradient>
        <radialGradient id="nfShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="80" cy="252" rx="44" ry="4.5" fill="url(#nfShadow)" />

      <path d="M56 238 Q52 242 54 247 Q56 250 62 250 L78 250 Q80 249 80 246 L80 236 Z" fill="url(#nfShoe)" />
      <path d="M80 236 L80 246 Q80 249 82 250 L98 250 Q104 250 106 247 Q108 242 104 238 Z" fill="url(#nfShoe)" />
      <path d="M54 248 L106 248 L106 250 L54 250 Z" fill="#000000" opacity="0.22" />

      <path d="M66 170 Q64 172 64 176 L60 238 Q60 240 62 240 L78 240 Q80 240 80 238 L80 170 Z" fill="url(#nfPants)" />
      <path d="M80 170 L80 238 Q80 240 82 240 L98 240 Q100 240 100 238 L96 176 Q96 172 94 170 Z" fill="url(#nfPants)" />
      <rect x="79" y="172" width="2" height="66" fill="#121827" opacity="0.7" />
      <path d="M62 230 Q80 236 98 230 L100 238 Q80 244 60 238 Z" fill="#0f1724" opacity="0.35" />

      <path d="M52 98 Q54 86 68 82 Q74 80 80 80 Q86 80 92 82 Q106 86 108 98 L110 140 Q110 160 106 172 Q90 178 80 178 Q70 178 54 172 Q50 160 50 140 Z" fill="url(#nfShirt)" />
      <path d="M52 152 Q80 164 108 152 L110 170 Q80 180 50 170 Z" fill="#0f4a85" opacity="0.28" />
      <path d="M70 82 Q80 88 90 82 L88 90 Q80 94 72 90 Z" fill="url(#nfSkin)" />
      <path d="M70 82 Q80 88 90 82" fill="none" stroke="#0f4a85" strokeWidth="1.2" opacity="0.6" />

      <path d="M50 98 Q44 108 44 120 L44 158 Q44 166 52 166 Q60 166 60 158 L60 120 Q60 110 56 102 Z" fill="url(#nfShirt)" />
      <path d="M110 98 Q116 108 116 120 L116 158 Q116 166 108 166 Q100 166 100 158 L100 120 Q100 110 104 102 Z" fill="url(#nfShirt)" />
      <path d="M44 148 Q52 152 60 148 L60 160 Q52 162 44 160 Z" fill="#0f4a85" opacity="0.25" />
      <path d="M100 148 Q108 152 116 148 L116 160 Q108 162 100 160 Z" fill="#0f4a85" opacity="0.25" />

      <circle cx="52" cy="170" r="7.5" fill="url(#nfSkin)" />
      <circle cx="108" cy="170" r="7.5" fill="url(#nfSkin)" />
      <path d="M46 172 Q52 176 58 172" fill="none" stroke="#c79470" strokeWidth="1" opacity="0.55" />
      <path d="M102 172 Q108 176 114 172" fill="none" stroke="#c79470" strokeWidth="1" opacity="0.55" />

      <path d="M72 76 L72 88 Q72 92 78 92 L82 92 Q88 92 88 88 L88 76 Z" fill="url(#nfSkin)" />
      <path d="M72 86 Q80 90 88 86 L88 92 Q80 94 72 92 Z" fill="#b98a6d" opacity="0.55" />

      <circle cx="80" cy="54" r="24" fill="url(#nfSkin)" />
      <ellipse cx="57" cy="56" rx="3" ry="5" fill="url(#nfSkin)" />
      <ellipse cx="103" cy="56" rx="3" ry="5" fill="url(#nfSkin)" />
      <circle cx="58" cy="56" r="1.4" fill="#c68a67" opacity="0.5" />
      <circle cx="102" cy="56" r="1.4" fill="#c68a67" opacity="0.5" />

      <path d="M56 48 Q54 32 66 26 Q72 22 80 22 Q88 22 94 26 Q106 32 104 48 Q80 52 56 48 Z" fill="url(#nfShoe)" />
      <path d="M62 30 Q70 25 80 25" fill="none" stroke="#ffc288" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      <path d="M66 40 Q72 37 78 36" fill="none" stroke="#ffc288" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
      <path d="M52 44 L108 44 Q112 48 110 52 L106 54 L54 54 Q48 52 50 46 Z" fill="#a83d06" />
      <path d="M54 48 Q80 52 106 48" fill="none" stroke="#ffb066" strokeWidth="0.9" opacity="0.65" />
      <path d="M54 50 L106 50" fill="none" stroke="#6d2704" strokeWidth="0.6" opacity="0.6" />
      <circle cx="80" cy="20" r="5" fill="#ffc99a" />
      <circle cx="81.5" cy="18.4" r="1.5" fill="#ffedd4" opacity="0.9" />
      <path d="M77 20 Q80 23 83 20" fill="none" stroke="#cf7a3c" strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      <path d="M80 16 L80 12" fill="none" stroke="#c96b2a" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />

      <path d="M66 54 Q71 51 76 54" fill="none" stroke="#241208" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M84 54 Q89 51 94 54" fill="none" stroke="#241208" strokeWidth="2.4" strokeLinecap="round" />

      <ellipse cx="71" cy="61" rx="2.3" ry="2.7" fill="#1d120a" />
      <ellipse cx="89" cy="61" rx="2.3" ry="2.7" fill="#1d120a" />
      <circle cx="71.8" cy="60.2" r="0.8" fill="#ffffff" />
      <circle cx="89.8" cy="60.2" r="0.8" fill="#ffffff" />

      <ellipse cx="64" cy="68" rx="3" ry="1.8" fill="#f29478" opacity="0.55" />
      <ellipse cx="96" cy="68" rx="3" ry="1.8" fill="#f29478" opacity="0.55" />

      <path d="M79 64 Q82 68 80 71 Q78 70 79 64" fill="#cc9675" opacity="0.6" />

      <path d="M74 73 Q80 77 86 73" fill="none" stroke="#2a1a10" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M76 74 Q80 76 84 74" fill="#d47a68" opacity="0.6" />
    </svg>
  );
}

export default function HealthPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedMainTab = searchParams.get('tab');
  const today = useMemo(() => fmtDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [mainTab, setMainTab] = useState<'pulse' | 'health' | 'tasks' | 'finance' | 'programs' | 'analytics' | 'config'>(() => {
    if (requestedMainTab === 'health' || requestedMainTab === 'tasks' || requestedMainTab === 'finance' || requestedMainTab === 'programs' || requestedMainTab === 'analytics' || requestedMainTab === 'config') {
      return requestedMainTab;
    }
    return 'pulse';
  });
  const [healthSubTab, setHealthSubTab] = useState<'mental' | 'nutrition'>('mental');
  const [financeSubTab, setFinanceSubTab] = useState<'expenses' | 'income' | 'savings' | 'debts' | 'stats'>('expenses');
  const [financeRange, setFinanceRange] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'timeline'>('list');
  const [plannerMode, setPlannerMode] = useState<'day' | 'week'>('day');
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const weekRowRef = useRef<HTMLDivElement | null>(null);
  const weekButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const financeSubnavRef = useRef<HTMLDivElement | null>(null);
  const financeSubnavButtonRefs = useRef<Record<'expenses' | 'income' | 'savings' | 'debts' | 'stats', HTMLButtonElement | null>>({
    expenses: null,
    income: null,
    savings: null,
    debts: null,
    stats: null,
  });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [nutritionGoalModalOpen, setNutritionGoalModalOpen] = useState(false);
  const skipSearchSyncRef = useRef(false);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const financeEntryScope = financeSubTab === 'expenses' || financeSubTab === 'income' ? (financeRange.toLowerCase() as 'day' | 'month' | 'year') : 'day';
  const needsOverview = mainTab === 'pulse' || mainTab === 'analytics';
  const needsProfile = mainTab === 'pulse' || mainTab === 'health';
  const needsMental = mainTab === 'pulse' || mainTab === 'health';
  const needsNutrition = mainTab === 'pulse' || mainTab === 'health';
  const needsTasks = mainTab === 'pulse' || mainTab === 'tasks';
  const needsFinance = mainTab === 'pulse' || mainTab === 'finance';
  const needsAnalytics = mainTab === 'pulse' || mainTab === 'health' || mainTab === 'analytics';

  const { data: overviewData } = useGetOverviewQuery(selectedDate, { skip: !needsOverview });
  const { data: configData } = useGetConfigQuery(undefined, { skip: needsOverview });
  const { data: profileData } = useGetProfileQuery(undefined, { skip: !needsProfile });
  const { data: mentalData } = useGetMentalDayQuery(selectedDate, { skip: !needsMental });
  const { data: nutritionData } = useGetNutritionQuery(selectedDate, { skip: !needsNutrition });
  const { data: tasksData } = useGetTasksDayQuery(selectedDate, { skip: !needsTasks });
  const { data: tasksRangeData } = useGetTasksRangeQuery(
    { from: weekDates[0] ?? selectedDate, to: weekDates[6] ?? selectedDate },
    { skip: mainTab !== 'tasks' || taskViewMode !== 'timeline' || plannerMode !== 'week' },
  );
  const { data: financeData } = useGetFinanceOverviewQuery(
    { date: selectedDate, period: financeEntryScope },
    { skip: !needsFinance },
  );
  const previousMonthDate = useMemo(() => {
    const base = parseDate(selectedDate) ?? new Date();
    const prev = new Date(base);
    prev.setMonth(prev.getMonth() - 1);
    return fmtDate(prev);
  }, [selectedDate]);
  const { data: previousMonthFinanceData } = useGetFinanceOverviewQuery(previousMonthDate, { skip: !needsFinance });
  const { data: analyticsData } = useGetAnalyticsQuery(7, { skip: !needsAnalytics });

  const [updateProfile, { isLoading: profileSaving }] = useUpdateProfileMutation();
  const [updateConfig, { isLoading: configSaving }] = useUpdateConfigMutation();
  const [saveMentalDay, { isLoading: mentalSaving }] = useSaveMentalDayMutation();
  const [updateNutritionGoal, { isLoading: goalSaving }] = useUpdateNutritionGoalMutation();
  const [addMeal, { isLoading: mealSaving }] = useAddMealMutation();
  const [updateMeal] = useUpdateMealMutation();
  const [deleteMeal] = useDeleteMealMutation();
  const [createFood, { isLoading: foodSaving }] = useCreateFoodMutation();
  const [createPulseTask, { isLoading: taskSaving }] = useCreatePulseTaskMutation();
  const [updatePulseTask] = useUpdatePulseTaskMutation();
  const [togglePulseTaskDate] = useTogglePulseTaskDateMutation();
  const [deletePulseTask] = useDeletePulseTaskMutation();
  const [createPulseGoal, { isLoading: pulseGoalSaving }] = useCreatePulseGoalMutation();
  const [updatePulseGoal, { isLoading: pulseGoalUpdating }] = useUpdatePulseGoalMutation();
  const [deletePulseGoal] = useDeletePulseGoalMutation();
  const [createFinanceCategory, { isLoading: categorySaving }] = useCreateFinanceCategoryMutation();
  const [updateFinanceCategory, { isLoading: categoryUpdating }] = useUpdateFinanceCategoryMutation();
  const [createFinanceEntry, { isLoading: financeSaving }] = useCreateFinanceEntryMutation();
  const [updateFinanceEntry, { isLoading: financeUpdating }] = useUpdateFinanceEntryMutation();
  const [deleteFinanceEntry] = useDeleteFinanceEntryMutation();
  const [createSavingsGoal, { isLoading: savingsSaving }] = useCreateSavingsGoalMutation();
  const [updateSavingsGoal, { isLoading: savingsUpdating }] = useUpdateSavingsGoalMutation();
  const [deleteSavingsGoal] = useDeleteSavingsGoalMutation();
  const [createDebt, { isLoading: debtSaving }] = useCreateDebtMutation();
  const [updateDebt, { isLoading: debtUpdating }] = useUpdateDebtMutation();
  const [deleteDebt] = useDeleteDebtMutation();

  const config = configData?.config ?? overviewData?.config;
  const profile = profileData?.profile;
  const profileSuggestion = profileData?.suggestion;
  const weightDelta = profileData?.weightDelta;
  useEffect(() => {
    const activeIndex = weekDates.findIndex((date) => date === selectedDate);
    if (activeIndex < 0) return;

    const node = weekButtonRefs.current[activeIndex];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      ensureHorizontalChildVisibility(weekRowRef.current, node, 16);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mainTab, selectedDate, weekDates]);

  useEffect(() => {
    if (mainTab !== 'finance') return;

    const frame = window.requestAnimationFrame(() => {
      ensureHorizontalChildVisibility(financeSubnavRef.current, financeSubnavButtonRefs.current[financeSubTab], 16);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [financeSubTab, mainTab]);

  const [profileForm, setProfileForm] = useState({
    heightCm: '',
    startWeightKg: '',
    currentWeightKg: '',
    targetWeightKg: '',
    age: '',
  });

  useEffect(() => {
    setProfileForm({
      heightCm: profile?.heightCm?.toString() ?? '',
      startWeightKg: profile?.startWeightKg?.toString() ?? '',
      currentWeightKg: profile?.currentWeightKg?.toString() ?? '',
      targetWeightKg: profile?.targetWeightKg?.toString() ?? '',
      age: profile?.age?.toString() ?? '',
    });
  }, [profile?.heightCm, profile?.startWeightKg, profile?.currentWeightKg, profile?.targetWeightKg, profile?.age]);

  const [mentalParametersOpen, setMentalParametersOpen] = useState(false);
  const mentalBaselineForm = useMemo<MentalFormState>(() => ({
    sleepHours: mentalData?.day?.sleepHours?.toString() ?? '7.5',
    nutrition: mentalData?.day?.nutrition?.toString() ?? String(mentalData?.autoNutrition ?? 7),
    productivity: mentalData?.day?.productivity?.toString() ?? String(mentalData?.autoProductivity ?? 7),
    stress: mentalData?.day?.stress?.toString() ?? '3',
    wellbeing: mentalData?.day?.wellbeing?.toString() ?? '7',
    alcoholLevel: mentalData?.day?.alcoholLevel?.toString() ?? '0',
    activityLevel: mentalData?.day?.activityLevel?.toString() ?? '1',
    caffeineLevel: mentalData?.day?.caffeineLevel?.toString() ?? '1',
    comment: mentalData?.day?.comment ?? '',
  }), [mentalData?.autoNutrition, mentalData?.autoProductivity, mentalData?.day]);
  const [mentalForm, setMentalForm] = useState<MentalFormState>({
    sleepHours: '7.5',
    nutrition: '7',
    productivity: '7',
    stress: '3',
    wellbeing: '7',
    alcoholLevel: '0',
    activityLevel: '1',
    caffeineLevel: '1',
    comment: '',
  });

  useEffect(() => {
    setMentalForm(mentalBaselineForm);
  }, [mentalBaselineForm]);

  useEffect(() => {
    setMentalParametersOpen(false);
  }, [selectedDate]);

  const [goalForm, setGoalForm] = useState({
    dailyCalories: '',
    protein: '',
    fat: '',
    carbs: '',
  });

  useEffect(() => {
    setGoalForm({
      dailyCalories: String(nutritionData?.goal?.dailyCalories ?? profile?.dailyCaloriesGoal ?? ''),
      protein: String(nutritionData?.goal?.protein ?? profile?.proteinGoal ?? ''),
      fat: String(nutritionData?.goal?.fat ?? profile?.fatGoal ?? ''),
      carbs: String(nutritionData?.goal?.carbs ?? profile?.carbsGoal ?? ''),
    });
  }, [nutritionData?.goal, profile?.dailyCaloriesGoal, profile?.proteinGoal, profile?.fatGoal, profile?.carbsGoal]);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [foodModalOpen, setFoodModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskEditingId, setTaskEditingId] = useState<string | null>(null);
  const [taskDetailsItem, setTaskDetailsItem] = useState<PulseTaskItem | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'TASKS' | 'HABITS'>('ALL');
  const [showScheduledTasksInList, setShowScheduledTasksInList] = useState(true);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [showPulseCompletedTasks, setShowPulseCompletedTasks] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null | undefined>(undefined);
  const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);
  const [quickTaskExpanded, setQuickTaskExpanded] = useState(false);
  const [taskAdvancedOpen, setTaskAdvancedOpen] = useState(false);
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [activeFinanceCategoryId, setActiveFinanceCategoryId] = useState<string | null>(null);
  const [editingFinanceEntryId, setEditingFinanceEntryId] = useState<string | null>(null);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [savingsContributionModalOpen, setSavingsContributionModalOpen] = useState(false);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPaymentModalOpen, setDebtPaymentModalOpen] = useState(false);

  const [mealTitle, setMealTitle] = useState('Приём пищи');
  const [mealTime, setMealTime] = useState(getCurrentTimeInputValue());
  const [mealNotes, setMealNotes] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [mealItems, setMealItems] = useState<PulseMealItem[]>([]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const { data: foodSearchData } = useSearchFoodsQuery(foodSearch, { skip: !mealModalOpen && !foodModalOpen });

  useEffect(() => {
    const meals = nutritionData?.meals ?? [];
    if (!meals.length) {
      if (expandedMealId !== null) setExpandedMealId(null);
      return;
    }

    if (expandedMealId === undefined || (expandedMealId !== null && !meals.some((meal) => meal.id === expandedMealId))) {
      setExpandedMealId(meals[0]?.id ?? null);
    }
  }, [expandedMealId, nutritionData?.meals]);

  const [customFoodForm, setCustomFoodForm] = useState({
    name: '',
    calories: '',
    grams: '100',
    protein: '',
    fat: '',
    carbs: '',
    isDish: false,
    isHealthy: true,
  });
  const [customFoodSearch, setCustomFoodSearch] = useState('');
  const [customDishItems, setCustomDishItems] = useState<PulseMealItem[]>([]);
  const { data: customFoodSearchData } = useSearchFoodsQuery(customFoodSearch, { skip: !foodModalOpen || !customFoodForm.isDish });

  const [quickTaskForm, setQuickTaskForm] = useState<TaskDraft>(() => createTaskDraft(selectedDate));
  const [taskForm, setTaskForm] = useState<TaskDraft>(() => createTaskDraft(selectedDate));

  useEffect(() => {
    setTaskForm((prev) => ({
      ...prev,
      date: prev.date || selectedDate,
      daysOfMonth: prev.daysOfMonth.length ? prev.daysOfMonth : [getDayOfMonthOrToday(selectedDate)],
    }));
  }, [selectedDate]);

  useEffect(() => {
    if (quickTaskExpanded) return;
    setQuickTaskForm((prev) => ({
      ...prev,
      date: selectedDate,
      daysOfMonth: prev.daysOfMonth.length ? prev.daysOfMonth : [getDayOfMonthOrToday(selectedDate)],
    }));
  }, [quickTaskExpanded, selectedDate]);

  const [globalGoalForm, setGlobalGoalForm] = useState({
    title: '',
    description: '',
    progress: '0',
    targetDate: '',
    subtasks: '',
  });

  const [financeForm, setFinanceForm] = useState({
    title: '',
    amount: '',
    type: 'EXPENSE',
    categoryId: '',
    notes: '',
    recurring: false,
    scheduleType: 'MONTHLY',
    daysOfWeek: [0],
    daysOfMonth: [(parseDate(selectedDate) ?? new Date()).getDate()],
  });

  const [categoryForm, setCategoryForm] = useState({ name: '', limitAmount: '' });
  const [savingsForm, setSavingsForm] = useState({ title: '', targetAmount: '', savedAmount: '', deadline: '', items: '' });
  const [debtScenario, setDebtScenario] = useState<DebtScenarioKey>('CREDIT');
  const [debtHasSchedule, setDebtHasSchedule] = useState(true);
  const [debtForm, setDebtForm] = useState({
    title: '',
    debtType: 'Кредит',
    totalAmount: '',
    paidAmount: '',
    interestRate: '',
    startedAt: selectedDate,
    dueDate: '',
    paymentDay: '',
    paymentAmount: '',
    termMonths: '',
    notes: '',
  });
  const [debtPaymentForm, setDebtPaymentForm] = useState({ amount: '', note: '' });
  const [savingsContributionForm, setSavingsContributionForm] = useState({ amount: '', note: '' });
  const [activeDebtId, setActiveDebtId] = useState<string | null>(null);
  const [activeSavingsGoalId, setActiveSavingsGoalId] = useState<string | null>(null);

  const selectedDebtScenario = debtScenarioOptions.find((item) => item.key === debtScenario) ?? debtScenarioOptions[0];

  useEffect(() => {
    setDebtForm((prev) => ({
      ...prev,
      debtType: selectedDebtScenario.debtType,
      startedAt: prev.startedAt || selectedDate,
      interestRate: selectedDebtScenario.requiresInterest ? prev.interestRate : '',
      paymentDay: debtHasSchedule ? prev.paymentDay : '',
      paymentAmount: debtHasSchedule ? prev.paymentAmount : '',
      termMonths: selectedDebtScenario.requiresTerm ? prev.termMonths : '',
    }));
  }, [debtHasSchedule, debtScenario, selectedDate, selectedDebtScenario.debtType, selectedDebtScenario.requiresInterest, selectedDebtScenario.requiresTerm]);

  useEffect(() => {
    setDebtHasSchedule(Boolean(selectedDebtScenario.prefersSchedule));
  }, [selectedDebtScenario.prefersSchedule]);

  const resetDebtForm = () => {
    setDebtScenario('CREDIT');
    setDebtHasSchedule(true);
    setDebtForm({
      title: '',
      debtType: 'Кредит',
      totalAmount: '',
      paidAmount: '',
      interestRate: '',
      startedAt: selectedDate,
      dueDate: '',
      paymentDay: '',
      paymentAmount: '',
      termMonths: '',
      notes: '',
    });
  };

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ value: 'pulse' | 'health' | 'tasks' | 'finance' | 'programs' | 'analytics' | 'config'; label: string; icon: PulseIconName }> = [{ value: 'pulse', label: 'Обзор', icon: 'grid' }];
    tabs.push({ value: 'health', label: 'Здоровье', icon: 'heart' });
    tabs.push({ value: 'tasks', label: 'Задачи', icon: 'check' });
    tabs.push({ value: 'finance', label: 'Финансы', icon: 'card' });
    tabs.push({ value: 'programs', label: 'Программы', icon: 'book' });
    tabs.push({ value: 'analytics', label: 'Аналитика', icon: 'trend' });
    tabs.push({ value: 'config', label: 'Настройки', icon: 'gear' });
    return tabs;
  }, []);

  const replaceTabInUrl = (nextTab: typeof mainTab) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (nextTab === 'pulse') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    const query = params.toString();
    const nextUrl = query ? `${pathname ?? '/health'}?${query}` : pathname ?? '/health';
    window.history.replaceState(window.history.state, '', nextUrl);
    window.dispatchEvent(new CustomEvent('av:pulse-tab-change', { detail: { tab: nextTab } }));
  };

  const changeMainTab = (nextTab: typeof mainTab) => {
    if (nextTab === mainTab) return;
    skipSearchSyncRef.current = true;
    setMainTab(nextTab);
    replaceTabInUrl(nextTab);
  };

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.value === mainTab)) {
      if (mainTab !== 'pulse') {
        setMainTab('pulse');
        replaceTabInUrl('pulse');
      }
    }
  }, [visibleTabs, mainTab]);

  useEffect(() => {
    if (skipSearchSyncRef.current) {
      skipSearchSyncRef.current = false;
      return;
    }
    const nextTab =
      requestedMainTab === 'health' ||
      requestedMainTab === 'tasks' ||
      requestedMainTab === 'finance' ||
      requestedMainTab === 'programs' ||
      requestedMainTab === 'analytics' ||
      requestedMainTab === 'config'
        ? requestedMainTab
        : 'pulse';
    if (!visibleTabs.some((tab) => tab.value === nextTab)) return;
    if (nextTab !== mainTab) {
      setMainTab(nextTab);
    }
  }, [requestedMainTab, visibleTabs, mainTab]);

  const isHealthEnabled = config?.healthEnabled ?? true;
  const isMentalEnabled = config?.mentalEnabled ?? true;
  const isNutritionEnabled = config?.nutritionEnabled ?? true;
  const isTasksEnabled = config?.tasksEnabled ?? true;
  const isFinanceEnabled = config?.financeEnabled ?? true;

  const mainTabMeta = useMemo(() => {
    if (mainTab === 'health') {
      return {
        title: 'Здоровье',
        description: healthSubTab === 'nutrition'
          ? 'Питание, калории и цели на каждый день'
          : 'Сон, состояние, стресс и самочувствие в динамике',
      };
    }

    if (mainTab === 'tasks') {
      return {
        title: 'Задачи',
        description: 'План дня по времени, список задач и привычек без лишнего шума',
      };
    }

    if (mainTab === 'finance') {
      return {
        title: 'Финансы',
        description: 'Доходы, расходы, платежи и финансовые цели в одном месте',
      };
    }

    if (mainTab === 'programs') {
      return {
        title: 'Программы',
        description: 'Личные и совместные программы, приглашения, прогресс участников и действия на сегодня',
      };
    }

    if (mainTab === 'analytics') {
      return {
        title: 'Аналитика',
        description: 'Ключевые показатели и тренды по вашему прогрессу',
      };
    }

    if (mainTab === 'config') {
      return {
        title: 'Настройки',
        description: 'Настройка модулей, целей и персональных параметров Pulse',
      };
    }

    return {
      title: 'Пульс',
      description: 'Ваш ежедневный центр контроля',
    };
  }, [mainTab, healthSubTab]);


  const mealPreviewCalories = mealItems.reduce((sum, item) => sum + Number(item.calories || 0), 0);
  const groupedMealItems = useMemo(() => {
    const map = new Map<string, {
      key: string;
      item: PulseMealItem;
      count: number;
      totalGrams: number;
      totalCalories: number;
      totalProtein: number;
      totalFat: number;
      totalCarbs: number;
    }>();
    mealItems.forEach((item) => {
      const key = getMealItemIdentity(item);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalGrams += Number(item.grams || 0);
        existing.totalCalories += Number(item.calories || 0);
        existing.totalProtein += Number(item.protein || 0);
        existing.totalFat += Number(item.fat || 0);
        existing.totalCarbs += Number(item.carbs || 0);
        return;
      }
      map.set(key, {
        key,
        item,
        count: 1,
        totalGrams: Number(item.grams || 0),
        totalCalories: Number(item.calories || 0),
        totalProtein: Number(item.protein || 0),
        totalFat: Number(item.fat || 0),
        totalCarbs: Number(item.carbs || 0),
      });
    });
    return Array.from(map.values());
  }, [mealItems]);
  const mealItemCountMap = useMemo(() => {
    const map = new Map<string, number>();
    mealItems.forEach((item) => {
      const key = getMealItemIdentity(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [mealItems]);
  const customDishItemCountMap = useMemo(() => {
    const map = new Map<string, number>();
    customDishItems.forEach((item) => {
      const key = getMealItemIdentity(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [customDishItems]);
  const customDishTotals = useMemo(() => {
    return customDishItems.reduce(
      (acc, item) => ({
        grams: acc.grams + Number(item.grams || 0),
        calories: acc.calories + Number(item.calories || 0),
        protein: acc.protein + Number(item.protein || 0),
        fat: acc.fat + Number(item.fat || 0),
        carbs: acc.carbs + Number(item.carbs || 0),
      }),
      { grams: 0, calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
  }, [customDishItems]);
  const customDishUsesComposition = customFoodForm.isDish && customDishItems.length > 0;
  const goalCalories = nutritionData?.goal?.dailyCalories ?? null;

  const pulseDay = overviewData?.today;
  const nutritionGoal = nutritionData?.goal;
  const financeOverview = financeData?.overview.finance;
  const recommendations = useMemo(() => (pulseDay?.recommendations ?? []).filter((item) => {
    const meta = getRecommendationMeta(item);
    if (meta.target === 'meal') return isNutritionEnabled;
    if (meta.target === 'tasks') return isTasksEnabled;
    if (meta.target === 'finance') return isFinanceEnabled;
    if (meta.target === 'health') return isHealthEnabled && isMentalEnabled;
    return true;
  }), [isFinanceEnabled, isHealthEnabled, isMentalEnabled, isNutritionEnabled, isTasksEnabled, pulseDay?.recommendations]);
  const caloriesTarget = nutritionGoal?.dailyCalories ?? profile?.dailyCaloriesGoal ?? profileSuggestion?.dailyCalories ?? 0;
  const caloriesProgress = caloriesTarget > 0 ? Math.min(100, Math.round(((pulseDay?.caloriesConsumed ?? 0) / caloriesTarget) * 100)) : 0;
  const tasksProgress = pulseDay?.tasksTotal ? Math.min(100, Math.round(((pulseDay?.tasksDone ?? 0) / pulseDay.tasksTotal) * 100)) : 0;
  const showFinancePulseSummary = false;
  const paymentsToday = showFinancePulseSummary
    ? (financeOverview?.upcomingPayments ?? []).filter((item) => normalizeDateKey(item.date) === selectedDate)
    : [];
  const pulseTodayItems = useMemo(
    () => sortTasksByPlannerOrder([...(tasksData?.items ?? [])]).slice(0, 6),
    [tasksData?.items],
  );
  const pulseOpenTodayCount = useMemo(
    () => pulseTodayItems.filter((task) => !task.completedForDate).length,
    [pulseTodayItems],
  );
  const pulseRecommendationItems = useMemo(
    () => recommendations
      .map((text, index) => ({ id: `${index}-${text}`, text, meta: getPulseRecommendationMeta(text) }))
      .filter((item) => item.meta.target !== 'finance'),
    [recommendations],
  );
  const pulseAttentionItems = useMemo(
    () => pulseRecommendationItems.filter((item) => item.meta.group === 'attention'),
    [pulseRecommendationItems],
  );
  const pulseSecondarySignal = useMemo(() => {
    const rankedAttention = [...pulseAttentionItems].sort((left, right) => {
      const leftPriority =
        (isMentalEnabled && (pulseDay?.dayScore ?? 0) < 55 && left.meta.target === 'health' ? 5 : 0)
        + (isTasksEnabled && pulseOpenTodayCount > 0 && left.meta.target === 'tasks' ? 3 : 0)
        + (left.meta.tone === 'danger' ? 2 : 0);
      const rightPriority =
        (isMentalEnabled && (pulseDay?.dayScore ?? 0) < 55 && right.meta.target === 'health' ? 5 : 0)
        + (isTasksEnabled && pulseOpenTodayCount > 0 && right.meta.target === 'tasks' ? 3 : 0)
        + (right.meta.tone === 'danger' ? 2 : 0);
      return rightPriority - leftPriority;
    });

    if (rankedAttention.length) {
      return {
        ...rankedAttention[0],
        label: 'Проверить',
      };
    }

    if (isTasksEnabled && pulseOpenTodayCount > 0) {
      return {
        id: 'pulse-next-focus',
        label: 'Дальше',
        text: pulseOpenTodayCount === 1 ? 'Осталась 1 активная задача' : `Осталось ${pulseOpenTodayCount} активных задач`,
        meta: {
          tone: 'neutral' as const,
          group: 'suggestion' as const,
          action: 'Открыть',
          icon: 'check' as const,
          target: 'tasks' as const,
        },
      };
    }

    if (isFinanceEnabled && paymentsToday.length) {
      return {
        id: 'pulse-payments-focus',
        label: 'Финансы',
        text: paymentsToday.length === 1 ? 'Есть 1 платёж на сегодня' : `Есть ${paymentsToday.length} платежа на сегодня`,
        meta: {
          tone: 'warning' as const,
          group: 'attention' as const,
          action: 'Открыть',
          icon: 'wallet' as const,
          target: 'finance' as const,
        },
      };
    }

    return null;
  }, [isMentalEnabled, isTasksEnabled, pulseAttentionItems, pulseDay?.dayScore, pulseOpenTodayCount]);
  const pulseStateSummary = useMemo(() => {
    const score = pulseDay?.dayScore ?? 0;
    if (score >= 80) {
      return {
        value: 'Спокойный ритм',
        meta: 'Запас по нагрузке есть',
      };
    }
    if (score >= 65) {
      return {
        value: 'День под контролем',
        meta: 'Темп выглядит устойчивым',
      };
    }
    if (score >= 50) {
      return {
        value: 'Темп лучше умерить',
        meta: 'Лучше оставить только важное',
      };
    }
    return {
      value: 'Нагрузка выше нормы',
      meta: 'День лучше упростить',
    };
  }, [pulseDay?.dayScore]);
  const pulseHeadline = useMemo(() => {
    const score = pulseDay?.dayScore ?? 0;
    if (isMentalEnabled) {
      if (score >= 80) return 'День идёт ровно';
      if (score >= 65) return 'День под контролем';
      if (score >= 50) return 'Лучше не разгонять темп';
      return 'Сегодня лучше снизить нагрузку';
    }

    if (isTasksEnabled && (pulseDay?.tasksTotal ?? 0) > 0) {
      return (pulseDay?.tasksDone ?? 0) >= Math.max(1, Math.ceil((pulseDay?.tasksTotal ?? 0) / 2))
        ? 'Ключевые задачи уже под контролем'
        : 'День лучше собрать вокруг нескольких важных задач';
    }

    return 'День собран в одном месте';
  }, [isMentalEnabled, isTasksEnabled, pulseDay?.dayScore, pulseDay?.tasksDone, pulseDay?.tasksTotal]);
  const pulseSummaryText = useMemo(() => {
    const pulseNutritionConsumed = nutritionData?.totalCalories ?? 0;
    const pulseNutritionRemaining =
      nutritionData?.remainingCalories != null ? Math.max(0, nutritionData.remainingCalories) : Math.max(0, caloriesTarget - pulseNutritionConsumed);
    const details: string[] = [];

    if (isTasksEnabled && (pulseDay?.tasksTotal ?? 0) > 0) {
      details.push(`${pulseDay?.tasksDone ?? 0} из ${pulseDay?.tasksTotal ?? 0} задач закрыто`);
    }

    if (isNutritionEnabled && caloriesTarget > 0) {
      details.push(`${pulseNutritionRemaining} ккал до цели`);
    }

    if (isFinanceEnabled && paymentsToday.length) {
      details.push(paymentsToday.length === 1 ? '1 платёж на сегодня' : `${paymentsToday.length} платежа на сегодня`);
    }

    if (details.length > 2) {
      return details.slice(0, 2).join(' · ');
    }

    return details.join(' · ') || 'Критичных отклонений сегодня не видно.';
  }, [
    caloriesTarget,
    isFinanceEnabled,
    isNutritionEnabled,
    isTasksEnabled,
    nutritionData?.remainingCalories,
    nutritionData?.totalCalories,
    paymentsToday.length,
    pulseDay?.tasksDone,
    pulseDay?.tasksTotal,
  ]);
  const trendAverage = analyticsData?.healthRows?.length
    ? Math.round(analyticsData.healthRows.reduce((sum, row) => sum + row.todayScore, 0) / analyticsData.healthRows.length)
    : pulseDay?.mental7Score ?? 0;
  const allDiaryItems = useMemo(
    () => sortTasksByPlannerOrder(tasksData?.items ?? []),
    [tasksData?.items],
  );
  const scheduledDiaryItems = useMemo(
    () => allDiaryItems.filter((task) => Boolean(task.hasTime && task.dueDate)),
    [allDiaryItems],
  );
  const diaryTaskItems = useMemo(
    () => allDiaryItems.filter((task) => task.taskType !== 'HABIT'),
    [allDiaryItems],
  );
  const diaryHabitItems = useMemo(
    () => allDiaryItems.filter((task) => task.taskType === 'HABIT'),
    [allDiaryItems],
  );
  const listedDiaryTaskItems = useMemo(() => {
    if (showScheduledTasksInList) return diaryTaskItems;
    return diaryTaskItems.filter((task) => !(task.hasTime && task.dueDate));
  }, [diaryTaskItems, showScheduledTasksInList]);
  const filteredTasks = useMemo(() => {
    const source = [...(tasksData?.items ?? [])];
    const filtered = source.filter((task) => {
      if (taskFilter === 'HABITS') return task.taskType === 'HABIT';
      if (taskFilter === 'TASKS') return task.taskType !== 'HABIT';
      return true;
    });

    return sortTasksByPlannerOrder(filtered);
  }, [taskFilter, tasksData?.items]);
  const timedTasks = useMemo(
    () => filteredTasks.filter((task) => Boolean(task.hasTime && task.dueDate)),
    [filteredTasks],
  );
  const untimedTasks = useMemo(
    () => filteredTasks.filter((task) => !(task.hasTime && task.dueDate)),
    [filteredTasks],
  );
  const timedOpenTasks = useMemo(
    () => timedTasks.filter((task) => !task.completedForDate),
    [timedTasks],
  );
  const untimedOpenTasks = useMemo(
    () => untimedTasks.filter((task) => !task.completedForDate),
    [untimedTasks],
  );
  const completedTasks = useMemo(
    () => filteredTasks.filter((task) => task.completedForDate),
    [filteredTasks],
  );
  const pulseTimedOpenItems = useMemo(
    () => pulseTodayItems.filter((task) => task.hasTime && task.dueDate && !task.completedForDate),
    [pulseTodayItems],
  );
  const pulseUntimedOpenItems = useMemo(
    () => pulseTodayItems.filter((task) => !(task.hasTime && task.dueDate) && !task.completedForDate),
    [pulseTodayItems],
  );
  const pulseCompletedItems = useMemo(
    () => pulseTodayItems.filter((task) => task.completedForDate),
    [pulseTodayItems],
  );
  const habitStreakMap = useMemo(() => {
    const next = new Map<string, number>();
    (analyticsData?.habitStreaks ?? []).forEach((item) => {
      next.set(item.id, item.streak);
    });
    diaryHabitItems.forEach((task) => {
      if (!next.has(task.id)) {
        next.set(task.id, task.completedForDate ? 1 : 0);
      }
    });
    return next;
  }, [analyticsData?.habitStreaks, diaryHabitItems]);
  const filteredCompletionPercent = filteredTasks.length ? Math.round((completedTasks.length / filteredTasks.length) * 100) : 0;
  const taskLayoutMode: 'list' | 'day' | 'week' = taskViewMode === 'list' ? 'list' : plannerMode;
  const isTimelineMode = taskLayoutMode !== 'list';
  const taskWorkspaceTitle =
    taskLayoutMode === 'list'
      ? 'Список задач'
      : taskLayoutMode === 'day'
        ? 'План на день'
        : 'План на неделю';
  const plannerTasks = useMemo(() => {
    const source = plannerMode === 'week' ? [...(tasksRangeData?.items ?? [])] : filteredTasks;
    const filtered = source.filter((task) => {
      if (taskFilter === 'HABITS') return task.taskType === 'HABIT';
      if (taskFilter === 'TASKS') return task.taskType !== 'HABIT';
      return true;
    });
    return sortTasksByPlannerOrder(filtered).filter((task) => Boolean(task.hasTime && task.dueDate));
  }, [filteredTasks, plannerMode, taskFilter, tasksRangeData?.items]);
  const plannerAllTasks = useMemo(() => {
    const source = plannerMode === 'week' ? [...(tasksRangeData?.items ?? [])] : filteredTasks;
    const filtered = source.filter((task) => {
      if (taskFilter === 'HABITS') return task.taskType === 'HABIT';
      if (taskFilter === 'TASKS') return task.taskType !== 'HABIT';
      return true;
    });
    return sortTasksByPlannerOrder(filtered);
  }, [filteredTasks, plannerMode, taskFilter, tasksRangeData?.items]);

  function handleTaskLayoutChange(value: 'list' | 'day' | 'week') {
    if (value === 'list') {
      setTaskViewMode('list');
      return;
    }
    setTaskViewMode('timeline');
    setPlannerMode(value);
  }

  const renderTaskRow = (task: PulseTaskItem, options?: { compact?: boolean; context?: 'tasks' | 'pulse' }) => {
    const compact = Boolean(options?.compact);
    const context = options?.context ?? 'tasks';
    const visualMeta = getTaskVisualMeta(task);
    const timeLabel = getTaskPrimaryTime(task);

    return (
      <article
        key={task.occurrenceKey ?? task.id}
        className={[
          styles.taskRowCard,
          task.completedForDate ? styles.taskRowCardDone : '',
          compact ? styles.taskRowCardCompact : '',
          context === 'pulse' ? styles.pulseTaskRowSurface : '',
          context === 'pulse' && task.completedForDate ? styles.pulseTaskRowDone : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={[styles.taskToggle, task.completedForDate ? styles.taskToggleDone : ''].filter(Boolean).join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            void togglePulseTaskDate({ taskId: task.id, date: selectedDate });
          }}
          aria-label={task.completedForDate ? 'Снять выполнение' : 'Отметить выполненной'}
        >
          {task.completedForDate ? <Check className={styles.taskToggleCheckIcon} strokeWidth={3} /> : null}
        </button>

        <button
          type="button"
          className={[styles.taskRowMainButton, context === 'pulse' ? styles.pulseTodayRowButton : ''].filter(Boolean).join(' ')}
          onClick={() => setTaskDetailsItem(task)}
          aria-label={`Открыть задачу ${task.title}`}
        >
          <div className={[styles.taskRowContent, context === 'pulse' ? styles.pulseTodayRowMain : ''].filter(Boolean).join(' ')}>
            <div className={styles.taskRowTitleLine}>
              <span
                className={[
                  styles.taskIndicatorDot,
                  visualMeta.tone === 'finance'
                    ? styles.taskIndicatorDotFinance
                    : visualMeta.tone === 'debt'
                      ? styles.taskIndicatorDotDebt
                      : visualMeta.tone === 'program'
                        ? styles.taskIndicatorDotProgram
                        : visualMeta.tone === 'event'
                          ? styles.taskIndicatorDotEvent
                          : visualMeta.tone === 'habit'
                            ? styles.taskIndicatorDotHabit
                            : visualMeta.tone === 'regular'
                              ? styles.taskIndicatorDotRegular
                              : styles.taskIndicatorDotPersonal,
                ].filter(Boolean).join(' ')}
                aria-hidden="true"
              />
              <strong className={[styles.taskRowTitle, context === 'pulse' ? styles.pulseTodayRowTitle : ''].filter(Boolean).join(' ')}>{task.title}</strong>
            </div>

            <div className={[styles.taskRowMetaLine, context === 'pulse' ? styles.pulseTodayRowMeta : ''].filter(Boolean).join(' ')}>
              <span className={[styles.taskMetaPrimary, task.hasTime ? styles.taskMetaPrimaryTimed : styles.taskMetaPrimaryUntimed].join(' ')}>{timeLabel}</span>
              <span className={styles.taskMetaDivider} aria-hidden="true">•</span>
              <span
                className={[
                  styles.taskMetaSecondary,
                  visualMeta.tone === 'finance'
                    ? styles.taskMetaSecondaryFinance
                    : visualMeta.tone === 'debt'
                      ? styles.taskMetaSecondaryDebt
                      : visualMeta.tone === 'program'
                        ? styles.taskMetaSecondaryProgram
                        : visualMeta.tone === 'event'
                          ? styles.taskMetaSecondaryEvent
                          : visualMeta.tone === 'habit'
                            ? styles.taskMetaSecondaryHabit
                            : visualMeta.tone === 'regular'
                              ? styles.taskMetaSecondaryRegular
                              : styles.taskMetaSecondaryPersonal,
                ].filter(Boolean).join(' ')}
              >
                {visualMeta.label}
              </span>
            </div>
          </div>
        </button>

        <div className={styles.taskRowSide}>
          <button
            type="button"
            className={styles.taskRowChevron}
            onClick={() => setTaskDetailsItem(task)}
            aria-label={`Открыть детали задачи ${task.title}`}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </article>
    );
  };

  const renderDiaryTaskRow = (task: PulseTaskItem) => {
    const visualMeta = getTaskVisualMeta(task);
    const hasSchedule = Boolean(task.hasTime && task.dueDate);

    return (
      <article
        key={getDiaryTaskKey(task)}
        className={[
          styles.diaryListItem,
          task.completedForDate ? styles.diaryListItemDone : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={[styles.diaryListToggle, task.completedForDate ? styles.diaryListToggleDone : ''].filter(Boolean).join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            void togglePulseTaskDate({ taskId: task.id, date: selectedDate });
          }}
          aria-label={task.completedForDate ? 'Снять выполнение задачи' : 'Отметить задачу выполненной'}
        >
          {task.completedForDate ? <Check className={styles.diaryListToggleIcon} strokeWidth={3} /> : null}
        </button>

        <button
          type="button"
          className={styles.diaryListButton}
          onClick={() => setTaskDetailsItem(task)}
          aria-label={`Открыть задачу ${task.title}`}
        >
          <div className={styles.diaryListContent}>
            <strong className={styles.diaryListTitle}>{task.title}</strong>
            {hasSchedule ? (
              <span className={styles.diaryListMeta}>
                {getDiaryTaskWindowLabel(task)} · {visualMeta.label}
              </span>
            ) : null}
          </div>
        </button>
      </article>
    );
  };

  const renderDiaryHabitRow = (task: PulseTaskItem) => {
    const streak = habitStreakMap.get(task.id) ?? 0;
    const baseDate = parseDate(selectedDate) ?? new Date();
    const todayNoon = new Date();
    todayNoon.setHours(0, 0, 0, 0);
    const miniCalendar = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(baseDate);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - 6 + i);
      const daysUntilBase = Math.floor((baseDate.getTime() - day.getTime()) / 86400000);
      const isFuture = day.getTime() > todayNoon.getTime();
      const isDone = !isFuture && daysUntilBase >= 0 && daysUntilBase < streak;
      return { key: fmtDate(day), isFuture, isDone };
    });

    return (
      <article
        key={getDiaryTaskKey(task)}
        className={[
          styles.diaryListItem,
          styles.diaryHabitItem,
          task.completedForDate ? styles.diaryListItemDone : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={[styles.diaryListToggle, task.completedForDate ? styles.diaryListToggleDone : ''].filter(Boolean).join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            void togglePulseTaskDate({ taskId: task.id, date: selectedDate });
          }}
          aria-label={task.completedForDate ? 'Снять выполнение привычки' : 'Отметить привычку выполненной'}
        >
          {task.completedForDate ? <Check className={styles.diaryListToggleIcon} strokeWidth={3} /> : null}
        </button>

        <button
          type="button"
          className={styles.diaryListButton}
          onClick={() => setTaskDetailsItem(task)}
          aria-label={`Открыть привычку ${task.title}`}
        >
          <div className={styles.diaryListContent}>
            <strong className={styles.diaryListTitle}>{task.title}</strong>
            <div className={styles.habitMiniCal} aria-hidden="true">
              {miniCalendar.map((day) => (
                <span
                  key={day.key}
                  className={[
                    styles.habitMiniCalDot,
                    day.isDone ? styles.habitMiniCalDone : '',
                    day.isFuture ? styles.habitMiniCalFuture : '',
                  ].filter(Boolean).join(' ')}
                />
              ))}
            </div>
          </div>
        </button>

        <span className={styles.diaryHabitStreak}>
          <Flame className={styles.diaryHabitStreakIcon} />
          {streak}
        </span>
      </article>
    );
  };

  const preparedGoals = useMemo(() => {
    return [...(tasksData?.goals ?? [])]
      .map((goal) => decorateGoal(goal))
      .sort((a, b) => Number(a.achieved) - Number(b.achieved) || a.title.localeCompare(b.title, 'ru'));
  }, [tasksData?.goals]);
  const activeGoals = useMemo(() => preparedGoals.filter((goal) => !goal.achieved), [preparedGoals]);
  const achievedGoals = useMemo(() => preparedGoals.filter((goal) => goal.achieved), [preparedGoals]);

  const financeEntries = financeData?.entries ?? [];
  const expenseEntries = useMemo(
    () => [...financeEntries].filter((entry) => entry.type === 'EXPENSE').sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0)),
    [financeEntries],
  );
  const incomeEntries = useMemo(
    () => [...financeEntries].filter((entry) => entry.type === 'INCOME').sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0)),
    [financeEntries],
  );
  const periodExpenseTotal = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const periodIncomeTotal = incomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const financeRangeLabel = financeRange === 'DAY' ? 'день' : financeRange === 'MONTH' ? 'месяц' : 'год';
  const financeRangeLabelPlural = financeRange === 'DAY' ? 'за день' : financeRange === 'MONTH' ? 'за месяц' : 'за год';
  const expenseOperationsLabel = formatOperationsCountLabel(expenseEntries.length, financeRange);
  const incomeOperationsLabel = formatOperationsCountLabel(incomeEntries.length, financeRange);
  const primaryIncomeEntry = incomeEntries[0] ?? null;
  const averageExpenseAmount = expenseEntries.length ? Math.round(periodExpenseTotal / expenseEntries.length) : 0;
  const monthlyIncome = financeOverview?.monthIncome ?? 0;
  const monthlyExpenses = financeOverview?.monthExpenses ?? 0;
  const monthlyBalance = financeOverview?.balance ?? monthlyIncome - monthlyExpenses;
  const savingsTotal = (financeData?.goals ?? []).reduce((sum, goal) => sum + goal.savedAmount, 0);
  const debtRemainingTotal = (financeData?.debts ?? []).reduce((sum, debt) => sum + Math.max(0, debt.totalAmount - debt.paidAmount), 0);
  const financeCategoriesView = useMemo(() => {
    const dailySpentMap = new Map<string, number>();
    expenseEntries.forEach((entry) => {
      const key = entry.categoryId ?? entry.categoryName ?? 'other';
      dailySpentMap.set(key, (dailySpentMap.get(key) ?? 0) + entry.amount);
    });

    const source = (financeData?.categories ?? []).map((category) => {
      const spent = dailySpentMap.get(category.id) ?? 0;
      const limit = category.limitAmount ?? 0;
      const percent = clampPercent(spent, limit || Math.max(spent, 1));
      const overBy = limit > 0 && spent > limit ? spent - limit : 0;
      return {
        ...category,
        spent,
        percent,
        overBy,
      };
    });

    if (!source.length && expenseEntries.length) {
      return Array.from(dailySpentMap.entries()).map(([key, spent]) => ({
        id: key,
        name: key === 'other' ? 'Другое' : key,
        limitAmount: 0,
        spent,
        percent: 100,
        overBy: 0,
      }));
    }

    return source.sort((a, b) => (b.spent ?? 0) - (a.spent ?? 0));
  }, [expenseEntries, financeData?.categories]);
  const financeStatsRows = financeCategoriesView.filter((item) => (item.spent ?? 0) > 0 || (item.limitAmount ?? 0) > 0).slice(0, 6);
  const primaryExpenseCategory = financeStatsRows[0] ?? null;
  const upcomingPayments = useMemo(
    () => [...(financeOverview?.upcomingPayments ?? [])].sort((a, b) => (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0)),
    [financeOverview?.upcomingPayments],
  );
  const debtExpenseCategoryId = findCategoryIdByKeywords(financeData?.categories ?? [], [/(долг|кредит|ипотек|рассроч)/, /(платеж)/]);
  const savingsExpenseCategoryId = findCategoryIdByKeywords(financeData?.categories ?? [], [/(копил|накоп|сбереж|цель)/]);

  const savingsGoalsView = useMemo(
    () => [...(financeData?.goals ?? [])].map((goal) => ({
      ...goal,
      progress: clampPercent(goal.savedAmount, goal.targetAmount),
      remaining: Math.max(0, goal.targetAmount - goal.savedAmount),
    })),
    [financeData?.goals],
  );
  const debtsView = useMemo(
    () => [...(financeData?.debts ?? [])]
      .map((debt) => ({
        ...debt,
        progress: clampPercent(debt.paidAmount, debt.totalAmount),
        remaining: Math.max(0, debt.totalAmount - debt.paidAmount),
        isClosed: debt.paidAmount >= debt.totalAmount,
      }))
      .sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || ((parseDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER))),
    [financeData?.debts],
  );
  const activeDebt = debtsView.find((debt) => debt.id === activeDebtId) ?? null;
  const activeSavingsGoal = savingsGoalsView.find((goal) => goal.id === activeSavingsGoalId) ?? null;
  const activeFinanceCategory = financeCategoriesView.find((category) => category.id === activeFinanceCategoryId) ?? null;
  const activeFinanceCategoryEntries = useMemo(() => financeEntries
    .filter((entry) => entry.type === 'EXPENSE' && entry.categoryId === activeFinanceCategoryId)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [activeFinanceCategoryId, financeEntries]);
  const previousMonthOverview = previousMonthFinanceData?.overview?.finance;
  const previousMonthIncome = previousMonthOverview?.monthIncome ?? 0;
  const previousMonthExpenses = previousMonthOverview?.monthExpenses ?? 0;
  const previousMonthBalance = previousMonthOverview?.balance ?? previousMonthIncome - previousMonthExpenses;
  const financeEntryModalBusy = financeSaving || financeUpdating;

  const debtMonthlyLoad = debtsView.reduce((sum, debt) => sum + (debt.paymentAmount ?? 0), 0);
  const financeActiveModules = [
    config?.healthEnabled ? 'Здоровье' : null,
    config?.mentalEnabled ? 'Ментальное' : null,
    config?.nutritionEnabled ? 'Питание' : null,
    config?.tasksEnabled ? 'Задачи' : null,
    config?.financeEnabled ? 'Финансы' : null,
    'Аналитика',
  ].filter(Boolean) as string[];
  const financeCompositionItems: FinanceCompositionItem[] = [
    { key: 'income', label: 'Доходы', value: monthlyIncome, tone: 'income' },
    { key: 'expense', label: 'Расходы', value: monthlyExpenses, tone: 'expense' },
    { key: 'savings', label: 'Накопления', value: savingsTotal, tone: 'accent' },
    { key: 'debt', label: 'Платежи по долгам', value: debtMonthlyLoad, tone: 'neutral' },
  ];
  const financeCompositionMax = Math.max(...financeCompositionItems.map((item) => item.value), 1);
  const financeTrendPoints = useMemo(() => {
    return [...financeEntries]
      .sort((a, b) => (parseDate(a.createdAt)?.getTime() ?? 0) - (parseDate(b.createdAt)?.getTime() ?? 0))
      .slice(-8)
      .map((entry) => ({
        label: entry.title.length > 12 ? `${entry.title.slice(0, 12)}…` : entry.title,
        income: entry.type === 'INCOME' ? entry.amount : 0,
        expense: entry.type === 'EXPENSE' ? entry.amount : 0,
      }));
  }, [financeEntries]);
  const financeExpenseShareData = useMemo(
    () => financeStatsRows
      .filter((category) => (category.spent ?? 0) > 0)
      .slice(0, 6)
      .map((category) => ({
        id: category.id,
        name: category.name,
        value: category.spent ?? 0,
        limitAmount: category.limitAmount,
        percentOfExpenses: monthlyExpenses > 0 ? Math.round(((category.spent ?? 0) / monthlyExpenses) * 100) : 0,
      })),
    [financeStatsRows, monthlyExpenses],
  );
  const financeInsights = useMemo(() => {
    const insights: Array<{ title: string; text: string; tone: 'success' | 'danger' | 'neutral' | 'accent' }> = [];
    const topCategory = financeStatsRows[0];
    if (topCategory?.spent) {
      insights.push({
        title: 'Главная категория месяца',
        text: `${topCategory.name} забирает ${Math.round(topCategory.percent ?? 0)}% лимита и уже составила ${formatMoney(topCategory.spent)}.`,
        tone: (topCategory.overBy ?? 0) > 0 ? 'danger' : 'accent',
      });
    }
    if (monthlyBalance >= 0) {
      insights.push({
        title: 'Баланс остаётся положительным',
        text: `После всех расходов в месяце сохраняется ${formatMoney(monthlyBalance)} свободного остатка.`,
        tone: 'success',
      });
    } else {
      insights.push({
        title: 'Баланс ушёл в минус',
        text: `Расходы уже превысили поступления на ${formatMoney(Math.abs(monthlyBalance))}. Стоит сократить траты или перенести часть платежей.`,
        tone: 'danger',
      });
    }
    if (debtMonthlyLoad > 0 && monthlyIncome > 0) {
      const loadPercent = Math.round((debtMonthlyLoad / monthlyIncome) * 100);
      insights.push({
        title: 'Нагрузка по кредитам',
        text: `Регулярные платежи по долгам съедают около ${loadPercent}% месячного дохода.`,
        tone: loadPercent >= 30 ? 'danger' : loadPercent >= 18 ? 'accent' : 'neutral',
      });
    }
    if (upcomingPayments[0]) {
      insights.push({
        title: 'Ближайший обязательный платёж',
        text: `${upcomingPayments[0].title} — ${formatMoney(upcomingPayments[0].amount)} ${getDaysUntilLabel(upcomingPayments[0].date, selectedDate)}.`,
        tone: 'neutral',
      });
    }
    if (!insights.length) {
      insights.push({
        title: 'Пока мало данных',
        text: 'Добавьте несколько доходов, расходов и финансовых целей — и Pulse соберёт живую статистику и полезные инсайты.',
        tone: 'neutral',
      });
    }
    return insights.slice(0, 4);
  }, [debtMonthlyLoad, financeStatsRows, monthlyBalance, monthlyIncome, selectedDate, upcomingPayments]);

  const mentalTodayScore = mentalData?.day?.todayScore ?? pulseDay?.dayScore ?? 0;
  const mentalWeekScore = mentalData?.day?.pulse7Score ?? pulseDay?.mental7Score ?? 0;
  const isMentalScoreDirty = useMemo(
    () => ([
      'sleepHours',
      'nutrition',
      'productivity',
      'stress',
      'wellbeing',
      'alcoholLevel',
      'activityLevel',
      'caffeineLevel',
    ] as const).some((key) => mentalForm[key] !== mentalBaselineForm[key]),
    [mentalBaselineForm, mentalForm],
  );
  const mentalPreviewTodayScore = useMemo(() => {
    if (!isMentalScoreDirty) return mentalTodayScore;

    const toNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return computeMentalScore({
      sleepHours: toNumber(mentalForm.sleepHours),
      nutrition: toNumber(mentalForm.nutrition),
      productivity: toNumber(mentalForm.productivity),
      stress: toNumber(mentalForm.stress),
      wellbeing: toNumber(mentalForm.wellbeing),
      alcoholLevel: toNumber(mentalForm.alcoholLevel),
      activityLevel: toNumber(mentalForm.activityLevel),
      caffeineLevel: toNumber(mentalForm.caffeineLevel),
      smoking: false,
    });
  }, [isMentalScoreDirty, mentalForm, mentalTodayScore]);
  const mentalPreviewWeekScore = useMemo(() => {
    if (!isMentalScoreDirty) return mentalWeekScore;

    const historyMap = new Map(
      (analyticsData?.healthRows ?? []).map((row) => [normalizeDateKey(row.date), row.todayScore] as const),
    );
    const previousScores = Array.from({ length: 6 }, (_, index) => historyMap.get(shiftDateKey(selectedDate, -(index + 1)) ?? ''))
      .filter((value): value is number => typeof value === 'number');

    return computeMentalPulse7(mentalPreviewTodayScore, previousScores);
  }, [analyticsData?.healthRows, isMentalScoreDirty, mentalPreviewTodayScore, mentalWeekScore, selectedDate]);
  const nutritionMeals = nutritionData?.meals ?? [];
  const nutritionConsumed = nutritionData?.totalCalories ?? 0;
  const nutritionRemaining = nutritionData?.remainingCalories != null ? Math.max(0, nutritionData.remainingCalories) : Math.max(0, caloriesTarget - nutritionConsumed);
  const nutritionProgress = caloriesTarget > 0 ? Math.min(100, Math.round((nutritionConsumed / caloriesTarget) * 100)) : 0;
  const nutritionRating = Math.max(0, Math.round(mentalData?.autoNutrition ?? (nutritionData as any)?.averageNutritionScore ?? 0));
  const nutritionCurrentWeight = profile?.currentWeightKg ?? profile?.startWeightKg ?? profile?.targetWeightKg ?? null;
  const nutritionHeightValue = profile?.heightCm ?? null;
  const nutritionGoalDeltaValue = useMemo(() => {
    if (profile?.currentWeightKg == null || profile?.targetWeightKg == null) return null;
    return Number((profile.targetWeightKg - profile.currentWeightKg).toFixed(1));
  }, [profile?.currentWeightKg, profile?.targetWeightKg]);
  const nutritionGoalDeltaLabel = useMemo(() => {
    if (nutritionGoalDeltaValue == null) return 'не задана';
    if (Math.abs(nutritionGoalDeltaValue) < 0.05) return 'поддержание';
    return `${nutritionGoalDeltaValue > 0 ? '+' : '-'}${formatNumericValue(Math.abs(nutritionGoalDeltaValue), 1)} кг`;
  }, [nutritionGoalDeltaValue]);
  const nutritionStartDeltaValue = useMemo(() => {
    if (profile?.startWeightKg == null || profile?.currentWeightKg == null) return null;
    return Number((profile.currentWeightKg - profile.startWeightKg).toFixed(1));
  }, [profile?.currentWeightKg, profile?.startWeightKg]);
  const nutritionStartDeltaLabel = useMemo(() => {
    if (nutritionStartDeltaValue == null) return 'Добавьте стартовый вес';
    if (Math.abs(nutritionStartDeltaValue) < 0.05) return 'Без изменений от старта';
    return `${nutritionStartDeltaValue > 0 ? '+' : '-'}${formatNumericValue(Math.abs(nutritionStartDeltaValue), 1)} кг от старта`;
  }, [nutritionStartDeltaValue]);
  const nutritionStartDeltaTone = useMemo(() => {
    if (weightDelta?.tone) return weightDelta.tone;
    if (nutritionStartDeltaValue == null || Math.abs(nutritionStartDeltaValue) < 0.05) return 'neutral';
    return nutritionStartDeltaValue > 0 ? 'success' : 'danger';
  }, [nutritionStartDeltaValue, weightDelta?.tone]);
  const nutritionHeightMarkerPosition = useMemo(() => {
    if (nutritionHeightValue == null) return 42;
    const min = 150;
    const max = 200;
    const ratio = (max - nutritionHeightValue) / (max - min);
    return Math.max(8, Math.min(92, ratio * 100));
  }, [nutritionHeightValue]);
  const nutritionMacroCards = useMemo(
    () => [
      {
        key: 'protein',
        label: 'Белки',
        value: nutritionData?.totalProtein ?? 0,
        target: nutritionGoal?.protein ?? profile?.proteinGoal ?? profileSuggestion?.protein ?? 0,
        fillClassName: styles.nutritionMacroFillProtein,
        valueClassName: styles.nutritionMacroValueProtein,
      },
      {
        key: 'fat',
        label: 'Жиры',
        value: nutritionData?.totalFat ?? 0,
        target: nutritionGoal?.fat ?? profile?.fatGoal ?? profileSuggestion?.fat ?? 0,
        fillClassName: styles.nutritionMacroFillFat,
        valueClassName: styles.nutritionMacroValueFat,
      },
      {
        key: 'carbs',
        label: 'Углеводы',
        value: nutritionData?.totalCarbs ?? 0,
        target: nutritionGoal?.carbs ?? profile?.carbsGoal ?? profileSuggestion?.carbs ?? 0,
        fillClassName: styles.nutritionMacroFillCarbs,
        valueClassName: styles.nutritionMacroValueCarbs,
      },
    ],
    [
      nutritionData?.totalCarbs,
      nutritionData?.totalFat,
      nutritionData?.totalProtein,
      nutritionGoal?.carbs,
      nutritionGoal?.fat,
      nutritionGoal?.protein,
      profile?.carbsGoal,
      profile?.fatGoal,
      profile?.proteinGoal,
      profileSuggestion?.carbs,
      profileSuggestion?.fat,
      profileSuggestion?.protein,
    ],
  );

  const mentalInsights = useMemo(() => {
    const source = (analyticsData?.suggestions?.length ? analyticsData.suggestions : pulseDay?.recommendations ?? []).slice(0, 4);
    const fallback = [
      (Number(mentalForm.alcoholLevel || 0) > 0 ? 'Много алкоголя за 3 дня' : ''),
      (Number(mentalForm.activityLevel || 0) <= 1 ? 'Мало движения' : 'Активность держится стабильно'),
      (Number(mentalForm.sleepHours || 0) >= 7 ? 'Сон стал стабильнее' : 'Сон ниже комфортной нормы'),
      (Number(mentalForm.productivity || 0) <= 5 ? 'Продуктивность просела' : 'Продуктивность держится ровно'),
    ].filter(Boolean) as string[];

    return (source.length ? source : fallback).map((text) => {
      const meta = getRecommendationMeta(text);
      const iconMap: Record<string, PulseIconName> = {
        heart: 'heart',
        meal: 'meal',
        wallet: 'wallet',
        spark: 'bolt',
      };
      return {
        text,
        tone: meta.tone,
        icon: iconMap[meta.icon] ?? 'spark',
      };
    });
  }, [analyticsData?.suggestions, mentalForm.activityLevel, mentalForm.alcoholLevel, mentalForm.productivity, mentalForm.sleepHours, pulseDay?.recommendations]);

  const overviewScoreValue = Math.max(0, Math.min(100, Math.round(trendAverage || pulseDay?.dayScore || 0)));
  const financePulseScore = 0;
  const weightProgressSummary = useMemo(() => {
    const height = profile?.heightCm ?? null;
    const age = profile?.age ?? null;
    const start = profile?.startWeightKg ?? null;
    const current = profile?.currentWeightKg ?? null;
    const target = profile?.targetWeightKg ?? null;

    const startValue = start ?? current ?? target;
    const currentValue = current ?? start ?? target;
    const targetValue = target ?? current ?? start;
    const delta = startValue != null && currentValue != null ? Number((currentValue - startValue).toFixed(1)) : null;
    const distance = startValue != null && targetValue != null ? Math.abs(targetValue - startValue) : 0;
    const moved = delta != null ? Math.abs(delta) : 0;
    const progressPercent = distance > 0 ? Math.max(0, Math.min(100, Math.round((moved / distance) * 100))) : 0;
    const progressWidth = progressPercent > 0 ? Math.max(progressPercent, 8) : 0;
    const deltaSign = delta == null || Math.abs(delta) < 0.05 ? '' : delta > 0 ? '+' : '−';
    const progressLabel = delta == null
      ? 'Добавьте стартовый вес'
      : `${deltaSign}${formatNumericValue(Math.abs(delta), 1)} кг${distance > 0 ? ` (${progressPercent}%)` : ''}`;

    return {
      age,
      currentValue,
      hasFullWeightProfile: start != null && current != null && target != null,
      height,
      progressLabel,
      progressPercent,
      progressWidth,
      startValue,
      targetValue,
    };
  }, [profile?.age, profile?.currentWeightKg, profile?.heightCm, profile?.startWeightKg, profile?.targetWeightKg]);

  const overviewProgressRows = useMemo(() => {
    const rows: Array<{
      key: string;
      label: string;
      tone: 'tasks' | 'mental' | 'nutrition' | 'finance';
      target: 'tasks' | 'health-mental' | 'health-nutrition' | 'finance';
      value: number;
    }> = [];

    if (isTasksEnabled) {
      rows.push({ key: 'tasks', label: 'Задачи', value: tasksProgress, tone: 'tasks', target: 'tasks' });
    }
    if (isMentalEnabled) {
      rows.push({ key: 'mental', label: 'Ментальное здоровье', value: mentalTodayScore, tone: 'mental', target: 'health-mental' });
    }
    if (isNutritionEnabled) {
      rows.push({
        key: 'nutrition',
        label: 'Питание',
        value: caloriesTarget > 0 ? nutritionProgress : Math.max(0, Math.min(100, nutritionRating * 10)),
        tone: 'nutrition',
        target: 'health-nutrition',
      });
    }
    if (showFinancePulseSummary && isFinanceEnabled) {
      rows.push({ key: 'finance', label: 'Финансы', value: financePulseScore, tone: 'finance', target: 'finance' });
    }

    return rows;
  }, [caloriesTarget, financePulseScore, isFinanceEnabled, isMentalEnabled, isNutritionEnabled, isTasksEnabled, mentalTodayScore, nutritionProgress, nutritionRating, showFinancePulseSummary, tasksProgress]);

  const overviewInsightItems = useMemo(() => {
    if (pulseRecommendationItems.length) {
      return pulseRecommendationItems.slice(0, 3).map((item) => ({
        id: item.id,
        target: item.meta.target,
        text: item.text,
        tone: item.meta.tone,
      }));
    }

    return mentalInsights.slice(0, 3).map((item, index) => ({
      id: `mental-insight-${index}`,
      target: 'health' as const,
      text: item.text,
      tone: item.tone,
    }));
  }, [mentalInsights, pulseRecommendationItems]);

  const overviewReminderItems = useMemo(() => {
    const items: Array<{ id: string; text: string; target: 'finance' | 'tasks' | 'health' }> = [];
    const financeReminderSource = showFinancePulseSummary ? upcomingPayments : [];

    financeReminderSource.slice(0, 2).forEach((payment, index) => {
      const relative = getDaysUntilLabel(payment.date, selectedDate);
      const prefix = relative === 'сегодня' ? 'Сегодня' : relative === 'через 1 день' ? 'Завтра' : formatShortDate(payment.date);
      items.push({
        id: `payment-${index}-${payment.title}`,
        text: `${prefix} списание: ${payment.title}${payment.amount ? ` — ${formatMoney(payment.amount)}` : ''}`,
        target: 'finance',
      });
    });

    const openTasks = pulseTimedOpenItems.length ? pulseTimedOpenItems : pulseUntimedOpenItems;
    openTasks.slice(0, Math.max(0, 3 - items.length)).forEach((task) => {
      const taskLead = task.hasTime && task.dueDate ? `${getTaskPrimaryTime(task)} · ` : '';
      items.push({
        id: `task-${task.id}`,
        text: `${taskLead}${task.title}`,
        target: 'tasks',
      });
    });

    if (!items.length) {
      pulseAttentionItems.slice(0, 3).forEach((item) => {
        items.push({
          id: `attention-${item.id}`,
          text: item.text,
          target: item.meta.target === 'health' ? 'health' : item.meta.target === 'finance' ? 'finance' : 'tasks',
        });
      });
    }

    return items.slice(0, 3);
  }, [pulseAttentionItems, pulseTimedOpenItems, pulseUntimedOpenItems, selectedDate, showFinancePulseSummary, upcomingPayments]);

  const overviewHabitStreaks = useMemo(() => {
    const source = analyticsData?.habitStreaks?.length
      ? analyticsData.habitStreaks
      : (tasksData?.items ?? [])
        .filter((task) => task.taskType === 'HABIT')
        .map((task) => ({
          id: task.id,
          title: task.title,
          streak: task.completedForDate ? 1 : 0,
        }));

    return source.slice(0, 3).map((item) => ({
      ...item,
      ...getHabitOverviewMeta(item.title),
    }));
  }, [analyticsData?.habitStreaks, tasksData?.items]);
  const overviewRingSize = 196;
  const overviewRingStroke = 12;
  const overviewRingRadius = (overviewRingSize - overviewRingStroke) / 2;
  const overviewRingCircumference = 2 * Math.PI * overviewRingRadius;
  const overviewRingOffset = overviewRingCircumference * (1 - overviewScoreValue / 100);

  const impactPills = useMemo(() => {
    const sleepValue = Number(mentalForm.sleepHours || 0);
    const nutritionValue = Number(mentalForm.nutrition || 0);
    const stressValue = Number(mentalForm.stress || 0);
    const activityValue = Number(mentalForm.activityLevel || 0);
    const items = [
      { icon: 'moon' as PulseIconName, label: 'Сон', value: sleepValue >= 8 ? 8 : sleepValue >= 7 ? 5 : sleepValue >= 6 ? 2 : -4 },
      { icon: 'meal' as PulseIconName, label: 'Питание', value: Math.round((nutritionValue - 5) * 1.4) },
      { icon: 'warning' as PulseIconName, label: 'Стресс', value: stressValue ? -Math.round(stressValue * 3) : 0 },
      { icon: 'activity' as PulseIconName, label: 'Активность', value: Math.round(activityValue * 2) },
    ];
    return items;
  }, [mentalForm.activityLevel, mentalForm.nutrition, mentalForm.sleepHours, mentalForm.stress]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    const current = profile?.currentWeightKg;
    const target = profile?.targetWeightKg;
    const goalDelta = current != null && target != null ? Math.abs(current - target) : null;
    const goalDirection = goalDelta == null ? 'Цель' : goalDelta === 0 ? 'Поддерживать' : (current ?? 0) > (target ?? 0) ? 'Сбросить' : 'Набрать';
    const goalSuffix = goalDelta == null ? 'заполни профиль' : goalDelta === 0 ? 'цель достигнута' : `ещё ${goalDelta.toFixed(1)} кг`;
    const cards: SummaryCard[] = [];

    if (isHealthEnabled) {
      cards.push(
        { key: 'height', icon: 'ruler' as const, label: 'Рост', value: profile?.heightCm ?? '—', unit: 'см' },
        { key: 'age', icon: 'calendar' as const, label: 'Возраст', value: profile?.age ?? '—', unit: 'лет' },
      );
    }

    if (isNutritionEnabled) {
      cards.push(
        { key: 'start', icon: 'scale' as const, label: 'Вес начальный', value: profile?.startWeightKg ?? '—', unit: 'кг' },
        { key: 'current', icon: 'scale' as const, label: 'Вес текущий', value: profile?.currentWeightKg ?? '—', unit: 'кг', tone: 'accent' as const },
        { key: 'target', icon: 'target' as const, label: 'Желаемый вес', value: profile?.targetWeightKg ?? '—', unit: 'кг' },
        { key: 'progress', icon: 'trend' as const, label: 'Прогресс', value: weightDelta ? `${weightDelta.delta > 0 ? '+' : ''}${weightDelta.delta}` : '—', unit: 'кг', tone: weightDelta?.tone ?? 'neutral' },
        { key: 'goal', icon: 'target' as const, label: 'Цель', value: goalDirection, description: goalSuffix, tone: 'goal' as const },
      );
    }

    return cards;
  }, [isHealthEnabled, isNutritionEnabled, profile?.age, profile?.currentWeightKg, profile?.heightCm, profile?.startWeightKg, profile?.targetWeightKg, weightDelta]);
  const profileQuickStats = useMemo(
    () => summaryCards.filter((card) => new Set(['height', 'age', 'current', 'target']).has(card.key)).slice(0, 4),
    [summaryCards],
  );

  const summaryPrimaryCards = useMemo(() => {
    const primaryKeys = new Set(['current', 'target', 'progress', 'goal']);
    return summaryCards.filter((card) => primaryKeys.has(card.key));
  }, [summaryCards]);

  const summarySecondaryCards = useMemo(() => {
    const secondaryKeys = new Set(['height', 'age', 'start']);
    return summaryCards.filter((card) => secondaryKeys.has(card.key));
  }, [summaryCards]);

  const goalSummary = useMemo(() => {
    const current = profile?.currentWeightKg;
    const target = profile?.targetWeightKg;
    if (current == null || target == null) {
      return { title: 'Цель', subtitle: 'заполни профиль' };
    }

    const delta = Math.abs(current - target);
    if (delta === 0) {
      return { title: 'Поддерживать', subtitle: 'цель достигнута' };
    }

    return {
      title: current > target ? 'Сбросить' : 'Набрать',
      subtitle: `ещё ${delta.toFixed(1)} кг`,
    };
  }, [profile?.currentWeightKg, profile?.targetWeightKg]);

  const profileCardsVisible = isHealthEnabled || isNutritionEnabled;

  function resetProfileForm() {
    setProfileForm({
      heightCm: profile?.heightCm?.toString() ?? '',
      startWeightKg: profile?.startWeightKg?.toString() ?? '',
      currentWeightKg: profile?.currentWeightKg?.toString() ?? '',
      targetWeightKg: profile?.targetWeightKg?.toString() ?? '',
      age: profile?.age?.toString() ?? '',
    });
  }

  function closeProfileEditor() {
    resetProfileForm();
    setProfileModalOpen(false);
  }

  function openProfileEditor() {
    resetProfileForm();
    setProfileModalOpen(true);
  }

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }
    input.click();
  }

  function openNutritionGoalModal() {
    setGoalForm({
      dailyCalories: String(nutritionData?.goal?.dailyCalories ?? profile?.dailyCaloriesGoal ?? ''),
      protein: String(nutritionData?.goal?.protein ?? profile?.proteinGoal ?? ''),
      fat: String(nutritionData?.goal?.fat ?? profile?.fatGoal ?? ''),
      carbs: String(nutritionData?.goal?.carbs ?? profile?.carbsGoal ?? ''),
    });
    setNutritionGoalModalOpen(true);
  }

  function closeNutritionGoalModal() {
    setNutritionGoalModalOpen(false);
  }

  function resetMealComposer() {
    setEditingMealId(null);
    setMealTitle('Приём пищи');
    setMealTime(getCurrentTimeInputValue());
    setMealNotes('');
    setFoodSearch('');
    setMealItems([]);
  }

  function openCreateCategoryModal() {
    setActiveFinanceCategoryId(null);
    setCategoryForm({ name: '', limitAmount: '' });
    setCategoryModalOpen(true);
  }

  function openFinanceCategoryModal(category: typeof financeCategoriesView[number]) {
    setActiveFinanceCategoryId(category.id);
    setCategoryForm({ name: category.name, limitAmount: category.limitAmount != null ? String(category.limitAmount) : '' });
    setCategoryModalOpen(true);
  }

  function openMealModal(meal?: PulseMeal) {
    if (meal) {
      const mealDate = parseDate(meal.date) ?? new Date();
      const fallbackTime = getCurrentTimeInputValue();
      const resolvedMealTime =
        mealDate.getHours() === 0 && mealDate.getMinutes() === 0
          ? fallbackTime
          : getCurrentTimeInputValue(mealDate);
      setEditingMealId(meal.id);
      setMealTitle(meal.title || 'Приём пищи');
      setMealTime(resolvedMealTime);
      setMealNotes(meal.notes ?? '');
      setFoodSearch('');
      setMealItems((meal.itemsJson ?? []).map((item) => ({ ...item })));
    } else {
      resetMealComposer();
    }
    setMealModalOpen(true);
  }

  function closeMealModal() {
    resetMealComposer();
    setMealModalOpen(false);
  }

  function handlePulseRecommendationOpen(target: ReturnType<typeof getRecommendationMeta>['target']) {
    if (target === 'meal') {
      openMealModal();
      return;
    }

    if (target === 'finance') {
      changeMainTab('finance');
      return;
    }

    if (target === 'tasks') {
      changeMainTab('tasks');
      return;
    }

    if (target === 'health') {
      changeMainTab('health');
    }
  }

  async function handleProfileSave() {
    await updateProfile({
      heightCm: num(profileForm.heightCm),
      startWeightKg: num(profileForm.startWeightKg),
      currentWeightKg: num(profileForm.currentWeightKg),
      targetWeightKg: num(profileForm.targetWeightKg),
      age: intNum(profileForm.age),
    }).unwrap();
    setProfileModalOpen(false);
  }

  async function handleMentalSave() {
    await saveMentalDay({
      date: selectedDate,
      sleepHours: num(mentalForm.sleepHours),
      nutrition: intNum(mentalForm.nutrition),
      productivity: intNum(mentalForm.productivity),
      stress: intNum(mentalForm.stress),
      wellbeing: intNum(mentalForm.wellbeing),
      alcoholLevel: intNum(mentalForm.alcoholLevel),
      activityLevel: intNum(mentalForm.activityLevel),
      caffeineLevel: intNum(mentalForm.caffeineLevel),
      comment: mentalForm.comment || null,
      weightKg: profile?.currentWeightKg ?? null,
    }).unwrap();
  }

  async function handleGoalSave() {
    const dailyCalories = intNum(goalForm.dailyCalories);
    if (!dailyCalories) return;
    await updateNutritionGoal({
      dailyCalories,
      protein: num(goalForm.protein),
      fat: num(goalForm.fat),
      carbs: num(goalForm.carbs),
    }).unwrap();
    setNutritionGoalModalOpen(false);
  }

  function addFoodToMeal(food: PulseFood) {
    const grams = Number(food.defaultGrams ?? 100);
    const factor = grams / 100;
    const defaultCalories = food.defaultGrams ? Number(food.calories) : Math.round(Number(food.calories) * factor);
    const item: PulseMealItem = {
      sourceFoodId: food.id,
      name: food.name,
      grams,
      calories: defaultCalories,
      protein: food.defaultGrams ? Number(food.protein ?? 0) : Number(food.protein ?? 0) * factor,
      fat: food.defaultGrams ? Number(food.fat ?? 0) : Number(food.fat ?? 0) * factor,
      carbs: food.defaultGrams ? Number(food.carbs ?? 0) : Number(food.carbs ?? 0) * factor,
      isHealthy: Boolean(food.isHealthy),
    };
    setMealItems((prev) => [...prev, item]);
  }

  function addFoodToCustomDish(food: PulseFood) {
    const grams = Number(food.defaultGrams ?? 100);
    const factor = grams / 100;
    const item: PulseMealItem = {
      sourceFoodId: food.id,
      name: food.name,
      grams,
      calories: food.defaultGrams ? Number(food.calories) : Math.round(Number(food.calories) * factor),
      protein: food.defaultGrams ? Number(food.protein ?? 0) : Number(food.protein ?? 0) * factor,
      fat: food.defaultGrams ? Number(food.fat ?? 0) : Number(food.fat ?? 0) * factor,
      carbs: food.defaultGrams ? Number(food.carbs ?? 0) : Number(food.carbs ?? 0) * factor,
      isHealthy: Boolean(food.isHealthy),
    };
    setCustomDishItems((prev) => [...prev, item]);
  }

  function addMealPortion(item: PulseMealItem) {
    setMealItems((prev) => [...prev, { ...item }]);
  }

  function removeMealPortion(key: string) {
    setMealItems((prev) => {
      const index = prev.findIndex((item) => getMealItemIdentity(item) === key);
      if (index < 0) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  }

  async function handleMealSave() {
    if (!mealItems.length) return;
    const currentMealCalories = editingMealId
      ? ((nutritionData?.meals ?? []).find((meal) => meal.id === editingMealId)?.totalCalories ?? 0)
      : 0;
    const futureTotal = (nutritionData?.totalCalories ?? 0) - currentMealCalories + mealPreviewCalories;
    if (!editingMealId && goalCalories && futureTotal > goalCalories) {
      const exceed = futureTotal - goalCalories;
      const accepted = window.confirm(`После этого приёма пищи цель будет превышена на ${Math.round(exceed)} ккал. Продолжить?`);
      if (!accepted) return;
    }
    const payload = {
      date: selectedDate,
      time: mealTime || null,
      title: mealTitle,
      notes: mealNotes || null,
      items: mealItems,
    };
    if (editingMealId) {
      await updateMeal({ mealId: editingMealId, body: payload }).unwrap();
    } else {
      await addMeal(payload).unwrap();
    }
    closeMealModal();
  }

  async function handleCreateFood() {
    const useDishComposition = customFoodForm.isDish && customDishItems.length > 0;
    await createFood({
      name: customFoodForm.name,
      calories: useDishComposition ? Math.round(customDishTotals.calories) : intNum(customFoodForm.calories),
      defaultGrams: useDishComposition ? customDishTotals.grams : num(customFoodForm.grams),
      protein: useDishComposition ? Number(customDishTotals.protein.toFixed(1)) : num(customFoodForm.protein),
      fat: useDishComposition ? Number(customDishTotals.fat.toFixed(1)) : num(customFoodForm.fat),
      carbs: useDishComposition ? Number(customDishTotals.carbs.toFixed(1)) : num(customFoodForm.carbs),
      isDish: customFoodForm.isDish,
      isHealthy: customFoodForm.isHealthy,
      isPublic: true,
    }).unwrap();
    setCustomFoodForm({ name: '', calories: '', grams: '100', protein: '', fat: '', carbs: '', isDish: false, isHealthy: true });
    setCustomFoodSearch('');
    setCustomDishItems([]);
    setFoodModalOpen(false);
  }

  function closeTaskModal() {
    setTaskModalOpen(false);
    setTaskEditingId(null);
    setTaskForm(createTaskDraft(selectedDate));
  }

  async function handleSaveTask() {
    const payload = buildTaskPayload(taskForm, selectedDate);

    if (taskEditingId) {
      await updatePulseTask({ taskId: taskEditingId, body: payload }).unwrap();
    } else {
      await createPulseTask(payload).unwrap();
    }

    closeTaskModal();
  }

  async function handleQuickAddTask(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmitTaskDraft(quickTaskForm)) return;

    await createPulseTask(buildTaskPayload(quickTaskForm, selectedDate)).unwrap();

    setQuickTaskExpanded(false);
    setQuickTaskForm(createTaskDraft(selectedDate));
  }

  function handleCreateTaskFromPlannerSlot(payload: { date: string; time: string; endTime?: string }) {
    openTaskModal({
      date: payload.date,
      time: payload.time,
      endTime: payload.endTime || '',
      hasEndTime: Boolean(payload.endTime),
    });
  }

  function openTaskModal(defaults?: Partial<TaskDraft>) {
    setTaskEditingId(null);
    setTaskForm(createTaskDraft(defaults?.date || selectedDate, defaults));
    setTaskModalOpen(true);
  }

  function openTaskEditModal(task: PulseTaskItem) {
    setTaskEditingId(task.id);
    setTaskForm(createTaskDraftFromItem(task, selectedDate));
    setTaskModalOpen(true);
  }

  async function handleCreateGoal() {
    const subtasks = createGoalSubtasksFromText(globalGoalForm.subtasks);
    const progress = subtasks.length ? 0 : intNum(globalGoalForm.progress) ?? 0;

    await createPulseGoal({
      title: globalGoalForm.title,
      description: buildGoalDescription(globalGoalForm.description, { subtasks, achieved: progress >= 100 }),
      progress,
      targetDate: globalGoalForm.targetDate || null,
    }).unwrap();
    setGlobalGoalForm({ title: '', description: '', progress: '0', targetDate: '', subtasks: '' });
    setGoalModalOpen(false);
  }

  function toggleGoalExpanded(goalId: string) {
    setExpandedGoalIds((prev) => (prev.includes(goalId) ? prev.filter((item) => item !== goalId) : [...prev, goalId]));
  }

  async function handleToggleGoalSubtask(goal: ReturnType<typeof decorateGoal>, subtaskId: string) {
    const subtasks = goal.subtasks.map((item) => (item.id === subtaskId ? { ...item, done: !item.done } : item));
    const doneCount = subtasks.filter((item) => item.done).length;
    const progress = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : goal.computedProgress;
    const achieved = subtasks.length ? doneCount === subtasks.length : progress >= 100;

    await updatePulseGoal({
      goalId: goal.id,
      body: {
        description: buildGoalDescription(goal.displayDescription, { subtasks, achieved }),
        progress,
      },
    }).unwrap();
  }

  async function handleToggleGoalAchieved(goal: ReturnType<typeof decorateGoal>) {
    const nextAchieved = !goal.achieved;
    const subtasks = goal.subtasks.length ? goal.subtasks.map((item) => ({ ...item, done: nextAchieved })) : goal.subtasks;
    const progress = subtasks.length ? (nextAchieved ? 100 : 0) : nextAchieved ? 100 : 0;

    await updatePulseGoal({
      goalId: goal.id,
      body: {
        description: buildGoalDescription(goal.displayDescription, { subtasks, achieved: nextAchieved }),
        progress,
      },
    }).unwrap();
  }

  function resetFinanceEntryForm(type: 'EXPENSE' | 'INCOME' = 'EXPENSE') {
    setEditingFinanceEntryId(null);
    setFinanceForm({ title: '', amount: '', type, categoryId: '', notes: '', recurring: false, scheduleType: 'MONTHLY', daysOfWeek: [0], daysOfMonth: [getDayOfMonthOrToday(selectedDate)] });
  }

  function openFinanceEntryEditor(entry: typeof financeEntries[number]) {
    const recurrence = (entry.recurrenceJson as any) ?? null;
    setEditingFinanceEntryId(entry.id);
    setFinanceForm({
      title: entry.title ?? '',
      amount: String(entry.amount ?? ''),
      type: entry.type,
      categoryId: entry.categoryId ?? '',
      notes: entry.notes ?? '',
      recurring: Boolean(recurrence),
      scheduleType: recurrence?.scheduleType === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY',
      daysOfWeek: Array.isArray(recurrence?.daysOfWeek) && recurrence.daysOfWeek.length ? recurrence.daysOfWeek : [0],
      daysOfMonth: Array.isArray(recurrence?.daysOfMonth) && recurrence.daysOfMonth.length ? recurrence.daysOfMonth : [getDayOfMonthOrToday(selectedDate)],
    });
    setFinanceModalOpen(true);
  }

  async function handleCreateCategory() {
    if (activeFinanceCategory) {
      await updateFinanceCategory({
        categoryId: activeFinanceCategory.id,
        body: {
          name: categoryForm.name.trim() || activeFinanceCategory.name,
          limitAmount: num(categoryForm.limitAmount),
        },
      }).unwrap();
    } else {
      await createFinanceCategory({ name: categoryForm.name, limitAmount: num(categoryForm.limitAmount) }).unwrap();
    }
    setCategoryForm({ name: '', limitAmount: '' });
    setActiveFinanceCategoryId(null);
    setCategoryModalOpen(false);
  }

  async function handleCreateFinanceEntry() {
    const payload = {
      date: selectedDate,
      title: financeForm.title,
      amount: num(financeForm.amount),
      type: financeForm.type,
      categoryId: financeForm.categoryId || null,
      notes: financeForm.notes || null,
      recurrenceJson: financeForm.recurring
        ? {
            scheduleType: financeForm.scheduleType,
            daysOfWeek: financeForm.scheduleType === 'WEEKLY' ? financeForm.daysOfWeek : [],
            daysOfMonth: financeForm.scheduleType === 'MONTHLY' ? financeForm.daysOfMonth : [],
          }
        : null,
    };

    if (editingFinanceEntryId) {
      await updateFinanceEntry({ entryId: editingFinanceEntryId, body: payload }).unwrap();
    } else {
      await createFinanceEntry(payload).unwrap();
    }

    resetFinanceEntryForm('EXPENSE');
    setFinanceModalOpen(false);
  }

  async function handleCreateSavingsGoal() {
    const items = savingsForm.items
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, amount] = line.split('-');
        return { title: title.trim(), amount: Number(amount?.trim() ?? 0) };
      });
    await createSavingsGoal({
      title: savingsForm.title,
      targetAmount: num(savingsForm.targetAmount),
      savedAmount: num(savingsForm.savedAmount) ?? 0,
      deadline: savingsForm.deadline || null,
      items,
    }).unwrap();
    setSavingsForm({ title: '', targetAmount: '', savedAmount: '', deadline: '', items: '' });
    setSavingsModalOpen(false);
  }


  async function handleCreateDebt() {
    await createDebt({
      title: debtForm.title,
      debtType: selectedDebtScenario.debtType,
      totalAmount: num(debtForm.totalAmount),
      paidAmount: num(debtForm.paidAmount) ?? 0,
      interestRate: selectedDebtScenario.requiresInterest ? num(debtForm.interestRate) : null,
      startedAt: debtForm.startedAt || selectedDate,
      dueDate: debtForm.dueDate || null,
      paymentDay: debtHasSchedule ? intNum(debtForm.paymentDay) : null,
      paymentAmount: debtHasSchedule ? num(debtForm.paymentAmount) : null,
      termMonths: selectedDebtScenario.requiresTerm ? intNum(debtForm.termMonths) : null,
      notes: debtForm.notes || null,
    }).unwrap();
    resetDebtForm();
    setDebtModalOpen(false);
  }

  function handleConfigToggle(key: keyof NonNullable<typeof config>) {
    if (!config) return;
    updateConfig({ [key]: !Boolean(config[key]) } as any);
  }

  function openDebtPaymentModal(debtId: string, suggestedAmount?: number | null) {
    setActiveDebtId(debtId);
    setDebtPaymentForm({ amount: suggestedAmount ? String(suggestedAmount) : '', note: '' });
    setDebtPaymentModalOpen(true);
  }

  function openSavingsContributionModal(goalId: string) {
    setActiveSavingsGoalId(goalId);
    setSavingsContributionForm({ amount: '', note: '' });
    setSavingsContributionModalOpen(true);
  }

  async function handleApplyDebtPayment() {
    if (!activeDebt) return;
    const paymentAmount = num(debtPaymentForm.amount) ?? 0;
    if (paymentAmount <= 0) return;
    const nextPaidAmount = Math.min(activeDebt.totalAmount, activeDebt.paidAmount + paymentAmount);
    const noteLine = `${formatFullDate(selectedDate)}: внесён платёж ${formatMoney(paymentAmount)}${debtPaymentForm.note.trim() ? ` — ${debtPaymentForm.note.trim()}` : ''}`;
    const nextNotes = [activeDebt.notes, noteLine].filter(Boolean).join('\n');

    await updateDebt({
      debtId: activeDebt.id,
      body: {
        paidAmount: nextPaidAmount,
        notes: nextNotes || null,
      },
    }).unwrap();

    await createFinanceEntry({
      date: selectedDate,
      title: `Платёж по долгу · ${activeDebt.title}`,
      amount: paymentAmount,
      type: 'EXPENSE',
      categoryId: debtExpenseCategoryId,
      notes: debtPaymentForm.note.trim() || `Автоматически создано после внесения платежа по долгу «${activeDebt.title}».`,
      recurrenceJson: null,
    }).unwrap();

    setDebtPaymentForm({ amount: '', note: '' });
    setDebtPaymentModalOpen(false);
    setActiveDebtId(null);
  }

  async function handleApplySavingsContribution() {
    if (!activeSavingsGoal) return;
    const amount = num(savingsContributionForm.amount) ?? 0;
    if (!amount) return;

    await updateSavingsGoal({
      goalId: activeSavingsGoal.id,
      body: {
        savedAmount: activeSavingsGoal.savedAmount + amount,
      },
    }).unwrap();

    await createFinanceEntry({
      date: selectedDate,
      title: `Пополнение накопления · ${activeSavingsGoal.title}`,
      amount,
      type: 'EXPENSE',
      categoryId: savingsExpenseCategoryId,
      notes: savingsContributionForm.note.trim() || `Автоматически создано после пополнения накопления «${activeSavingsGoal.title}».`,
      recurrenceJson: null,
    }).unwrap();

    setSavingsContributionForm({ amount: '', note: '' });
    setSavingsContributionModalOpen(false);
    setActiveSavingsGoalId(null);
  }

  const recommendationTargetLabels: Record<'pulse' | 'health' | 'meal' | 'finance' | 'tasks', string> = {
    pulse: 'Обзор',
    health: 'Здоровье',
    meal: 'Питание',
    finance: 'Финансы',
    tasks: 'Задачи',
  };

  return (
    <div className={styles.page}>
      <header className={styles.pulseShellHeader}>
        <div className={styles.pulseShellTitleWrap}>
          <h1 className={styles.pulseShellTitle}>{mainTabMeta.title}</h1>
          <div className={styles.pulseCalendarRail}>
            <input ref={dateInputRef} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={styles.hiddenDateInput} />
            <div ref={weekRowRef} className={styles.weekRow}>
              {weekDates.map((date, index) => {
                const isActive = selectedDate === date;

                return (
                  <button
                    key={date}
                    ref={(node) => {
                      weekButtonRefs.current[index] = node;
                    }}
                    type="button"
                    aria-pressed={isActive}
                    data-state={isActive ? 'active' : 'inactive'}
                    className={[styles.weekDay, isActive ? styles.weekDayActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      if (isActive) {
                        openDatePicker();
                        return;
                      }
                      setSelectedDate(date);
                    }}
                  >
                    <span>{weekdayLabels[index]}</span>
                    <strong>{(parseDate(date) ?? new Date()).getDate()}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <div className={styles.pulseCalendarRailLegacyHidden} aria-hidden="true">
        <div className={styles.weekRow}>
          {weekDates.map((date, index) => {
            const isActive = selectedDate === date;

            return (
              <button
                key={`${date}-legacy`}
                type="button"
                aria-pressed={isActive}
                data-state={isActive ? 'active' : 'inactive'}
                className={[styles.weekDay, isActive ? styles.weekDayActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  if (isActive) {
                    openDatePicker();
                    return;
                  }
                  setSelectedDate(date);
                }}
              >
                <span>{weekdayLabels[index]}</span>
                <strong>{(parseDate(date) ?? new Date()).getDate()}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <nav className={styles.pulseMainTabs} aria-label="Разделы Pulse">
        {visibleTabs.map((tab) => {
          const active = tab.value === mainTab;
          return (
            <button
              key={tab.value}
              type="button"
              className={[styles.pulseMainTab, active ? styles.pulseMainTabActive : ''].filter(Boolean).join(' ')}
              onClick={() => changeMainTab(tab.value)}
              aria-current={active ? 'page' : undefined}
            >
              <PulseIcon name={tab.icon} className={styles.pulseMainTabIcon} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {mainTab === 'pulse' ? (
        <div className={styles.pulseScene}>
          <section className={styles.overviewSection}>
            <div className={styles.overviewHeroCard}>
              <div className={styles.overviewHeroHeader}>
                <div className={styles.overviewHeroTitle}>Пульс</div>
                <button
                  type="button"
                  className={styles.overviewHeroEditButton}
                  onClick={openProfileEditor}
                  aria-label="Редактировать профиль"
                >
                  <Pencil className={styles.overviewHeroEditIcon} strokeWidth={1.8} />
                </button>
              </div>

              <div className={styles.overviewTopGrid}>
              <section className={styles.overviewScoreCard}>
                <div className={styles.overviewScoreRing} aria-label={`Средняя эффективность ${overviewScoreValue}`}>
                  <svg
                    width={overviewRingSize}
                    height={overviewRingSize}
                    viewBox={`0 0 ${overviewRingSize} ${overviewRingSize}`}
                    className={styles.overviewScoreSvg}
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="overview-score-gradient" x1="12%" y1="8%" x2="88%" y2="92%">
                        <stop offset="0%" stopColor="#ffc72d" />
                        <stop offset="100%" stopColor="#ff821d" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx={overviewRingSize / 2}
                      cy={overviewRingSize / 2}
                      r={overviewRingRadius}
                      className={styles.overviewScoreTrack}
                      strokeWidth={overviewRingStroke}
                      fill="none"
                    />
                    <circle
                      cx={overviewRingSize / 2}
                      cy={overviewRingSize / 2}
                      r={overviewRingRadius}
                      className={styles.overviewScoreProgress}
                      strokeWidth={overviewRingStroke}
                      fill="none"
                      stroke="url(#overview-score-gradient)"
                      strokeLinecap="round"
                      strokeDasharray={overviewRingCircumference}
                      strokeDashoffset={overviewRingOffset}
                      transform={`rotate(-78 ${overviewRingSize / 2} ${overviewRingSize / 2})`}
                    />
                  </svg>
                  <div className={styles.overviewScoreRingInner}>
                    <strong>{overviewScoreValue}</strong>
                  </div>
                </div>
                <span className={styles.overviewScoreLabel}>Средняя эффективность</span>
              </section>

              <section className={styles.overviewProfileCard}>
                {profileCardsVisible ? (
                  <>
                    <div className={styles.overviewProfileMetrics}>
                      {isHealthEnabled ? (
                        <div className={styles.overviewProfileMetric}>
                          <span className={styles.overviewProfileMetricIcon}>
                            <PulseIcon name="ruler" className={styles.overviewProfileMetricSvg} />
                          </span>
                          <strong>{formatNumericValue(weightProgressSummary.height, 0)}</strong>
                          <span>см</span>
                        </div>
                      ) : null}

                      {isHealthEnabled ? (
                        <div className={styles.overviewProfileMetric}>
                          <span className={styles.overviewProfileMetricIcon}>
                            <PulseIcon name="calendar" className={styles.overviewProfileMetricSvg} />
                          </span>
                          <strong>{formatNumericValue(weightProgressSummary.age, 0)}</strong>
                          <span>лет</span>
                        </div>
                      ) : null}

                      {isNutritionEnabled ? (
                        <div className={[styles.overviewProfileMetric, styles.overviewProfileMetricAccent].join(' ')}>
                          <span className={styles.overviewProfileMetricIcon}>
                            <PulseIcon name="trend" className={styles.overviewProfileMetricSvg} />
                          </span>
                          <strong>{formatNumericValue(weightProgressSummary.currentValue, 1)}</strong>
                          <span>кг</span>
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.overviewWeightBlock}>
                      <div className={styles.overviewWeightHead}>
                        <span>Прогресс веса</span>
                        <strong>
                          {weightProgressSummary.currentValue != null && weightProgressSummary.targetValue != null
                            ? `${formatNumericValue(weightProgressSummary.currentValue, 1)} / ${formatNumericValue(weightProgressSummary.targetValue, 1)} кг`
                            : 'Добавьте профиль'}
                        </strong>
                      </div>

                      <div className={styles.overviewWeightTrack}>
                        <span style={{ width: `${weightProgressSummary.progressWidth}%` }} />
                      </div>

                      <div className={styles.overviewWeightMeta}>
                        <span>{weightProgressSummary.startValue != null ? `${formatNumericValue(weightProgressSummary.startValue, 1)} кг` : '—'}</span>
                        <span>{weightProgressSummary.hasFullWeightProfile ? weightProgressSummary.progressLabel : 'Добавьте стартовый и целевой вес'}</span>
                        <span>{weightProgressSummary.targetValue != null ? `${formatNumericValue(weightProgressSummary.targetValue, 1)} кг` : '—'}</span>
                      </div>
                    </div>

                    <div className={styles.overviewProfileActions}>
                      <button type="button" className={styles.overviewActionButton} onClick={openProfileEditor}>
                        Редактировать профиль
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.overviewProfileFallback}>
                    <strong>{pulseHeadline}</strong>
                    <span>{pulseSummaryText}</span>
                  </div>
                )}
              </section>

              <section className={styles.overviewProgressCard}>
                {overviewProgressRows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    className={styles.overviewProgressRow}
                    data-tone={row.tone}
                    onClick={() => {
                      if (row.target === 'tasks') {
                        changeMainTab('tasks');
                        return;
                      }
                      if (row.target === 'health-mental') {
                        setHealthSubTab('mental');
                        changeMainTab('health');
                        return;
                      }
                      if (row.target === 'health-nutrition') {
                        setHealthSubTab('nutrition');
                        changeMainTab('health');
                        return;
                      }
                      changeMainTab('finance');
                    }}
                  >
                    <div className={styles.overviewProgressHead}>
                      <span>{row.label}</span>
                      <div className={styles.overviewProgressTail}>
                        <strong>{row.value}%</strong>
                        <ChevronRight size={16} strokeWidth={1.8} className={styles.overviewProgressChevron} aria-hidden="true" />
                      </div>
                    </div>
                    <div className={styles.overviewProgressTrack}>
                      <span style={{ width: `${row.value}%` }} />
                    </div>
                  </button>
                ))}
              </section>
            </div>
            </div>

            <section className={styles.overviewNotesCard}>
              <div className={styles.overviewNotesTitle}>Инсайты</div>

              <div className={styles.overviewBulletList}>
                {overviewInsightItems.length ? overviewInsightItems.map((item) => (
                  <button key={item.id} type="button" className={styles.overviewBulletRow} onClick={() => handlePulseRecommendationOpen(item.target)}>
                    <span className={styles.overviewBulletLead}>
                      <span className={styles.overviewBulletDot} aria-hidden="true" />
                      <span className={styles.overviewBulletText}>{item.text}</span>
                    </span>
                    <span className={styles.overviewBulletArrow} aria-hidden="true">
                      <ChevronRight size={16} strokeWidth={1.8} />
                    </span>
                  </button>
                )) : <div className={styles.emptyText}>Инсайты появятся, когда накопится больше данных за день.</div>}
              </div>

              <div className={styles.overviewNotesDivider} />

              <div className={styles.overviewNotesSubtitle}>Напоминания</div>
              <div className={styles.overviewBulletList}>
                {overviewReminderItems.length ? overviewReminderItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={[styles.overviewBulletRow, styles.overviewBulletRowMuted].join(' ')}
                    onClick={() => {
                      if (item.target === 'tasks') {
                        changeMainTab('tasks');
                        return;
                      }
                      if (item.target === 'health') {
                        setHealthSubTab('mental');
                        changeMainTab('health');
                        return;
                      }
                      changeMainTab('finance');
                    }}
                  >
                    <span className={styles.overviewBulletLead}>
                      <span className={styles.overviewBulletDot} aria-hidden="true" />
                      <span className={styles.overviewBulletText}>{item.text}</span>
                    </span>
                    <span className={styles.overviewBulletArrow} aria-hidden="true">
                      <ChevronRight size={16} strokeWidth={1.8} />
                    </span>
                  </button>
                )) : <div className={styles.emptyText}>На выбранный день напоминаний нет.</div>}
              </div>
            </section>

            <section className={styles.overviewStreaksCard}>
              <div className={styles.overviewStreaksHeader}>
                <div className={styles.overviewNotesTitle}>Стрики привычек</div>
                <button type="button" className={styles.overviewStreaksLink} onClick={() => changeMainTab('tasks')}>
                  Все привычки
                </button>
              </div>

              <div className={styles.overviewStreaksList}>
                {overviewHabitStreaks.length ? overviewHabitStreaks.map((item) => (
                  <button key={item.id} type="button" className={styles.overviewStreakRow} onClick={() => changeMainTab('tasks')}>
                    <span className={styles.overviewStreakLead}>
                      <span className={styles.overviewStreakIcon} data-tone={item.tone}>
                        <PulseIcon name={item.icon} className={styles.overviewStreakIconSvg} />
                      </span>
                      <strong>{item.title}</strong>
                    </span>
                    <span className={styles.overviewStreakValue} data-tone={item.tone}>
                      <PulseIcon name="flame" className={styles.overviewStreakValueIcon} />
                      <strong>{item.streak}</strong>
                      <span>дней</span>
                    </span>
                  </button>
                )) : <div className={styles.emptyText}>Стрики появятся после нескольких дней отметок по привычкам.</div>}
              </div>
            </section>

          </section>

          <section className={[styles.pulseSection, styles.overviewProgramsSection].join(' ')}>
            <div className={styles.overviewProgramsCard}>
              <div className={styles.overviewProgramsHeader}>
                <div className={styles.pulseSectionCopy}>
                  <span className={styles.pulseSectionEyebrow}>Программы</span>
                  <h2 className={styles.pulseSectionHeading}>Программы сегодня</h2>
                </div>
                <button type="button" className={styles.overviewProgramsLink} onClick={() => changeMainTab('programs')}>
                  Открыть
                </button>
              </div>

              <ProgramTodayWidget compact variant="pulse" />
            </div>
          </section>

        </div>
      ) : null}
      {mainTab === 'health' ? (
        <div className={styles.healthScene}>
          <div className={styles.healthSubnav}>
            <button
              type="button"
              className={[styles.healthSubnavButton, healthSubTab === 'mental' ? styles.healthSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setHealthSubTab('mental')}
            >
              <PulseIcon name="brain" className={styles.healthSubnavIcon} />
              <span>Ментальное здоровье</span>
            </button>
            <button
              type="button"
              className={[styles.healthSubnavButton, healthSubTab === 'nutrition' ? styles.healthSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setHealthSubTab('nutrition')}
            >
              <PulseIcon name="meal" className={styles.healthSubnavIcon} />
              <span>Питание</span>
            </button>
          </div>

          {healthSubTab === 'mental' ? (
            <>
              <div className={styles.healthTopGrid}>
                <section className={styles.healthSurface}>
                  <div className={styles.healthSectionHeader}>
                    <div className={styles.healthSectionTitle}><PulseIcon name="brain" className={styles.sectionIconAccent} />Состояние</div>
                  </div>

                  <div className={styles.healthRingsRow}>
                    <div className={styles.healthRingMetric}>
                      <MiniRing value={mentalPreviewTodayScore} tone="accent" size={108} stroke={7} />
                      <div className={styles.healthRingMeta}>
                        <strong>Сегодня</strong>
                        <span>{describeScore(mentalPreviewTodayScore)}</span>
                      </div>
                    </div>

                    <div className={styles.healthRingMetric}>
                      <MiniRing value={mentalPreviewWeekScore} tone="success" size={108} stroke={7} />
                      <div className={styles.healthRingMeta}>
                        <strong>За 7 дней</strong>
                        <span>{describeTrend(mentalPreviewWeekScore)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <aside className={styles.healthSurface}>
                  <div className={styles.healthSectionHeader}>
                    <div className={styles.healthSectionTitle}><PulseIcon name="spark" className={styles.sectionIconAccent} />Инсайты</div>
                  </div>

                  <div className={styles.healthInsightList}>
                    {mentalInsights.map((item) => (
                      <div
                        key={`${item.text}-${item.tone}`}
                        className={[
                          styles.healthInsightItem,
                          item.tone === 'danger' ? styles.healthInsightDanger : '',
                          item.tone === 'info' ? styles.healthInsightInfo : '',
                          item.tone === 'warning' ? styles.healthInsightWarning : '',
                          item.tone === 'neutral' ? styles.healthInsightSuccess : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <PulseIcon name={item.icon} className={styles.healthInsightIcon} />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>

              <section className={[styles.healthSurface, styles.healthParametersSection, mentalParametersOpen ? styles.healthParametersSectionOpen : ''].filter(Boolean).join(' ')}>
                <div className={styles.healthSectionHeader}>
                  <div className={styles.healthSectionTitle}><PulseIcon name="pulse" className={styles.sectionIconAccent} />Оценка дня</div>
                  <div className={[styles.healthActionGroup, styles.healthParametersActions].join(' ')}>
                    <button
                      type="button"
                      className={[styles.healthGhostButton, styles.healthDisclosureButton, mentalParametersOpen ? styles.healthDisclosureButtonOpen : ''].filter(Boolean).join(' ')}
                      aria-expanded={mentalParametersOpen}
                      onClick={() => setMentalParametersOpen((prev) => !prev)}
                    >
                      <span>Параметры дня</span>
                      <ChevronDown className={styles.healthDisclosureIcon} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.healthPrimaryButton}
                      onClick={handleMentalSave}
                      disabled={mentalSaving}
                    >
                      <PulseIcon name="check" className={styles.healthButtonIcon} />
                      <span>{mentalSaving ? 'Сохраняем…' : 'Сохранить'}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.healthGhostButton}
                      onClick={() => setMentalForm((prev) => ({ ...prev, nutrition: String(mentalData?.autoNutrition ?? 7), productivity: String(mentalData?.autoProductivity ?? 7) }))}
                    >
                      Применить автооценки
                    </button>
                  </div>
                </div>

                <div className={styles.healthSliderGrid}>
                  <HealthSlider icon="moon" label="Сон" value={mentalForm.sleepHours} onChange={(value) => setMentalForm((prev) => ({ ...prev, sleepHours: value }))} min={0} max={12} step={0.5} suffix=" ч" helper="7–9 ч — оптимально" tone="info" />
                  <HealthSlider icon="meal" label="Питание" value={mentalForm.nutrition} onChange={(value) => setMentalForm((prev) => ({ ...prev, nutrition: value }))} min={1} max={10} asideLabel="Из питания" tone="success" />
                  <HealthSlider icon="bolt" label="Продуктивность" value={mentalForm.productivity} onChange={(value) => setMentalForm((prev) => ({ ...prev, productivity: value }))} min={1} max={10} asideLabel="Из задач" tone="accent" />
                  <HealthSlider icon="warning" label="Стресс" value={mentalForm.stress} onChange={(value) => setMentalForm((prev) => ({ ...prev, stress: value }))} min={1} max={10} helper="1–2 — норма, >4 — высокий" tone="danger" />
                  <HealthSlider icon="heart" label="Самочувствие" value={mentalForm.wellbeing} onChange={(value) => setMentalForm((prev) => ({ ...prev, wellbeing: value }))} min={1} max={10} tone="purple" />
                  <HealthSlider icon="wine" label="Алкоголь" value={mentalForm.alcoholLevel} onChange={(value) => setMentalForm((prev) => ({ ...prev, alcoholLevel: value }))} min={0} max={3} tone="danger" />
                  <HealthSlider icon="activity" label="Физ. активность" value={mentalForm.activityLevel} onChange={(value) => setMentalForm((prev) => ({ ...prev, activityLevel: value }))} min={0} max={3} tone="accent" />
                  <HealthSlider icon="coffee" label="Кофеин" value={mentalForm.caffeineLevel} onChange={(value) => setMentalForm((prev) => ({ ...prev, caffeineLevel: value }))} min={0} max={3} tone="warning" />
                </div>

                <div className={styles.healthCommentBlock}>
                  <label className={styles.healthCommentLabel}>Комментарий дня</label>
                  <textarea
                    rows={4}
                    value={mentalForm.comment}
                    onChange={(event) => setMentalForm((prev) => ({ ...prev, comment: event.target.value }))}
                    className={styles.healthCommentInput}
                    placeholder="Как прошёл день?"
                  />
                </div>

                <div className={styles.healthImpactBox}>
                  <div className={styles.healthImpactTitle}><PulseIcon name="info" className={styles.healthInlineIcon} />Влияние на общий балл</div>
                  <div className={styles.healthImpactPills}>
                    {impactPills.map((item) => (
                      <span key={item.label} className={[styles.healthImpactPill, item.value >= 0 ? styles.healthImpactPositive : styles.healthImpactNegative].join(' ')}>
                        <PulseIcon name={item.icon} className={styles.healthImpactIcon} />
                        <span>{item.label} {item.value >= 0 ? `+${item.value}` : item.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {healthSubTab === 'nutrition' ? (
            <div className={styles.nutritionScene}>
              <section className={[styles.healthSurface, styles.nutritionHeroCard].join(' ')}>
                <div className={styles.nutritionHeroGrid}>
                  <div className={styles.nutritionHeroVisual}>
                    <div className={styles.nutritionGoalLine}>
                      <PulseIcon name="target" className={styles.nutritionGoalIcon} />
                      <span>Цель:</span>
                      <strong>{nutritionGoalDeltaLabel}</strong>
                    </div>

                    <div className={styles.nutritionVisualBody}>
                      <div className={styles.nutritionFigureScene}>
                        <div className={styles.nutritionHeightScale} aria-hidden="true">
                          {NUTRITION_HEIGHT_SCALE.map((mark) => {
                            const isMajor = mark % 10 === 0;
                            return (
                              <div
                                key={mark}
                                className={[
                                  styles.nutritionHeightTick,
                                  isMajor ? styles.nutritionHeightTickMajor : styles.nutritionHeightTickMinor,
                                ].filter(Boolean).join(' ')}
                              >
                                <span>{isMajor ? mark : ''}</span>
                                <i />
                              </div>
                            );
                          })}
                          {nutritionHeightValue != null ? (
                            <div className={styles.nutritionHeightMarker} style={{ top: `${nutritionHeightMarkerPosition}%` }}>
                              <span>{formatNumericValue(nutritionHeightValue, 0)} см</span>
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.nutritionFigureWrap}>
                          <NutritionFigureIllustration />
                        </div>
                      </div>

                      <div className={styles.nutritionWeightCard}>
                        <div className={styles.nutritionWeightValue}>
                          <strong>{formatNumericValue(nutritionCurrentWeight, 1)}</strong>
                          <span>кг</span>
                        </div>
                        <div
                          className={[
                            styles.nutritionWeightDelta,
                            nutritionStartDeltaTone === 'success' ? styles.nutritionWeightDeltaPositive : '',
                            nutritionStartDeltaTone === 'danger' ? styles.nutritionWeightDeltaNegative : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {nutritionStartDeltaLabel}
                        </div>
                        <button type="button" className={styles.nutritionWeightEditButton} onClick={openProfileEditor}>
                          <Pencil className={styles.nutritionWeightEditIcon} strokeWidth={1.8} />
                          <span>Редактировать</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.nutritionHeroPanels}>
                    <section className={styles.nutritionHeroPanel}>
                      <div className={styles.nutritionPanelHeader}>
                        <div className={styles.nutritionPanelTitle}>
                          <PulseIcon name="flame" className={styles.sectionIconAccent} />
                          <span>Калории</span>
                        </div>

                        <div className={styles.nutritionPanelActions}>
                          <span className={styles.nutritionGoalChip}>
                            {caloriesTarget > 0 ? `${formatNumericValue(caloriesTarget, 0)} ккал` : 'Без цели'}
                          </span>
                          <button type="button" className={styles.nutritionPanelAction} onClick={openNutritionGoalModal}>
                            <Settings2 className={styles.nutritionPanelActionIcon} strokeWidth={1.8} />
                            <span>{nutritionGoal ? 'Изменить' : 'Задать'}</span>
                          </button>
                        </div>
                      </div>

                      <div className={styles.nutritionMetricsRow}>
                        <div className={styles.nutritionMetric}>
                          <strong className={styles.nutritionMetricValueAccent}>{formatNumericValue(nutritionConsumed, 0)}</strong>
                          <span>Потреблено</span>
                        </div>
                        <div className={styles.nutritionMetricDivider} />
                        <div className={styles.nutritionMetric}>
                          <strong>{formatNumericValue(nutritionRemaining, 0)}</strong>
                          <span>Осталось</span>
                        </div>
                        <div className={styles.nutritionMetricDivider} />
                        <div className={styles.nutritionMetric}>
                          <strong>{formatNumericValue(caloriesTarget || 0, 0)}</strong>
                          <span>Цель</span>
                        </div>
                      </div>

                      <div className={styles.nutritionProgressWrap}>
                        <div className={styles.nutritionProgressBar}><span style={{ width: `${nutritionProgress}%` }} /></div>
                        <div className={styles.nutritionProgressCaption}>{nutritionProgress}% от дневной нормы</div>
                      </div>
                    </section>

                    <section className={[styles.nutritionHeroPanel, styles.nutritionHeroPanelSeparated].join(' ')}>
                      <div className={styles.nutritionPanelHeader}>
                        <div className={styles.nutritionPanelTitle}>
                          <PulseIcon name="gear" className={styles.sectionIconMuted} />
                          <span>БЖУ</span>
                        </div>
                      </div>

                      <div className={styles.nutritionMacroGrid}>
                        {nutritionMacroCards.map((macro) => {
                          const maxTarget = Math.max(macro.target || 0, macro.value || 0, 1);
                          const percent = Math.min(100, Math.round((macro.value / maxTarget) * 100));
                          const fillWidth = macro.value > 0 ? Math.max(percent, 8) : 0;
                          return (
                            <div key={macro.key} className={styles.nutritionMacroCard}>
                              <strong className={macro.valueClassName}>{formatNumericValue(macro.value, 0)}</strong>
                              <span className={styles.nutritionMacroTarget}>из {formatNumericValue(macro.target, 1)} г</span>
                              <div className={styles.nutritionMacroTrack}>
                                <span className={macro.fillClassName} style={{ width: `${fillWidth}%` }} />
                              </div>
                              <span className={styles.nutritionMacroLabel}>{macro.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </div>
                <div className={styles.nutritionSectionDivider} />
                <section className={styles.nutritionMealsSection}>
                  <div className={styles.nutritionMealsHeader}>
                    <div className={styles.nutritionMealsHeaderGroup}>
                      <div className={styles.nutritionMealsTitle}>Приёмы пищи</div>
                      <button type="button" className={styles.nutritionAddButton} onClick={() => openMealModal()} aria-label="Добавить приём пищи">
                        <PulseIcon name="plus" className={styles.healthButtonIcon} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.mealListSurface}>
                    {nutritionMeals.map((meal) => {
                      const expanded = expandedMealId === meal.id;
                      return (
                        <article key={meal.id} className={[styles.mealRowCard, expanded ? styles.mealRowCardExpanded : ''].filter(Boolean).join(' ')}>
                          <div className={styles.mealRowHead}>
                            <button
                              type="button"
                              className={styles.mealHeaderButton}
                              onClick={() => setExpandedMealId(expanded ? null : meal.id)}
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} ${meal.title}`}
                            >
                              <span className={styles.mealMetaRow}>
                                <span className={styles.mealTimeBadge}>{formatMealTime(meal.date)}</span>
                                <span className={styles.mealCaloriesBadge}>{formatNumericValue(meal.totalCalories, 0)} ккал</span>
                              </span>
                              <span className={styles.mealHeadlineBlock}>
                                <span className={styles.mealTitleRow}>
                                  <strong>{meal.title}</strong>
                                  <ChevronDown className={[styles.mealChevron, expanded ? styles.mealChevronExpanded : ''].filter(Boolean).join(' ')} />
                                </span>
                              </span>
                            </button>

                            <div className={styles.mealActions}>
                              <details className={styles.mealOverflow}>
                                <summary className={styles.mealOverflowTrigger} aria-label="Действия с приёмом пищи">
                                  <Ellipsis size={16} strokeWidth={1.9} aria-hidden="true" />
                                </summary>
                                <div className={styles.mealOverflowMenu}>
                                  <button
                                    type="button"
                                    className={styles.mealOverflowItem}
                                    onClick={(event) => {
                                      const details = event.currentTarget.closest('details');
                                      if (details instanceof HTMLDetailsElement) details.open = false;
                                      openMealModal(meal);
                                    }}
                                  >
                                    <PulseIcon name="pencil" className={styles.mealOverflowItemIcon} />
                                    <span>Редактировать</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={[styles.mealOverflowItem, styles.mealOverflowItemDanger].filter(Boolean).join(' ')}
                                    onClick={(event) => {
                                      const details = event.currentTarget.closest('details');
                                      if (details instanceof HTMLDetailsElement) details.open = false;
                                      deleteMeal(meal.id);
                                    }}
                                  >
                                    <Trash2 className={styles.mealOverflowItemIcon} strokeWidth={1.8} />
                                    <span>Удалить</span>
                                  </button>
                                </div>
                              </details>
                            </div>
                          </div>

                          {expanded ? (
                            <div className={styles.mealDetails}>
                              {meal.notes ? <div className={styles.mealExpandedNote}>{meal.notes}</div> : null}
                              <div className={styles.mealTable}>
                                <div className={styles.mealTableHead}>
                                  <span>Продукт</span>
                                  <span>ккал</span>
                                  <span>Б</span>
                                  <span>Ж</span>
                                  <span>У</span>
                                </div>
                                <div className={styles.mealTableBody}>
                                  {meal.itemsJson.map((item, index) => (
                                    <div key={`${meal.id}-${item.name}-${index}`} className={styles.mealItemRow}>
                                      <div className={styles.mealItemName}>
                                        <strong>{item.name}</strong>
                                        <span>{formatNumericValue(item.grams, 0)} г</span>
                                      </div>
                                      <span data-label="ккал">{formatNumericValue(item.calories, 0)}</span>
                                      <span className={styles.mealValueProtein} data-label="Б">{formatNumericValue(item.protein ?? 0, 1)}</span>
                                      <span className={styles.mealValueFat} data-label="Ж">{formatNumericValue(item.fat ?? 0, 1)}</span>
                                      <span className={styles.mealValueCarbs} data-label="У">{formatNumericValue(item.carbs ?? 0, 1)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}

                    {!nutritionMeals.length ? <div className={styles.emptyText}>На выбранный день приёмы пищи ещё не добавлены.</div> : null}
                  </div>
                </section>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      {mainTab === 'tasks' ? (
        <div className={styles.tasksScene}>
          <section className={styles.diarySurface}>
            <div className={styles.diarySurfaceHeader}>
              <h2 className={styles.diarySurfaceTitle}>Ежедневник</h2>
              <button type="button" className={styles.diarySurfaceAction} onClick={() => openTaskModal()} aria-label="Добавить задачу">
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>

            {filteredTasks.length > 0 ? (
              <div className={styles.diaryProgressStrip}>
                <div className={styles.diaryProgressMeta}>
                  <span>{completedTasks.length} / {filteredTasks.length} выполнено</span>
                  <span>{filteredCompletionPercent}%</span>
                </div>
                <div className={styles.diaryProgressTrack} style={{ ['--dp-fill' as string]: getTaskProgressGradient(filteredCompletionPercent) }}>
                  <span style={{ width: `${filteredCompletionPercent}%` }} />
                </div>
              </div>
            ) : null}

            <DiaryTimelineBoard
              date={selectedDate}
              tasks={scheduledDiaryItems}
              onCreateTaskAtSlot={handleCreateTaskFromPlannerSlot}
              onOpenTask={openTaskEditModal}
              onUpdateTask={async (taskId, body) => {
                await updatePulseTask({ taskId, body }).unwrap();
              }}
            />

            <div className={styles.diarySectionStack}>
              <section className={styles.diarySection}>
                <div className={styles.diarySectionHeader}>
                  <h3 className={styles.diarySectionTitle}>Список задач</h3>
                  <label className={styles.diarySectionToggle}>
                    <input
                      type="checkbox"
                      checked={showScheduledTasksInList}
                      onChange={(event) => setShowScheduledTasksInList(event.target.checked)}
                    />
                    <span className={styles.diarySectionToggleBox}>
                      {showScheduledTasksInList ? <Check className={styles.diarySectionToggleIcon} strokeWidth={3} /> : null}
                    </span>
                    <span>Показывать задачи из ежедневника</span>
                  </label>
                </div>

                <div className={styles.diaryList}>
                  {listedDiaryTaskItems.length ? (
                    listedDiaryTaskItems.map((task) => renderDiaryTaskRow(task))
                  ) : (
                    <div className={styles.emptyText}>
                      {diaryTaskItems.length
                        ? 'Все задачи этого дня уже вынесены на ленту времени.'
                        : 'На выбранный день пока нет задач.'}
                    </div>
                  )}
                </div>
              </section>

              <section className={styles.diarySection}>
                <div className={styles.diarySectionHeader}>
                  <h3 className={styles.diarySectionTitle}>Привычки</h3>
                </div>

                <div className={styles.diaryList}>
                  {diaryHabitItems.length ? (
                    diaryHabitItems.map((task) => renderDiaryHabitRow(task))
                  ) : (
                    <div className={styles.emptyText}>На выбранный день пока нет привычек.</div>
                  )}
                </div>
              </section>
            </div>
          </section>

          <div className={styles.diaryLegacyHidden}>
          <section className={styles.taskWorkspaceSurface}>
            <div className={styles.taskWorkspaceHeader}>
              <div className={styles.taskWorkspaceCopy}>
                <span className={styles.taskWorkspaceEyebrow}>Ежедневник</span>
                <h2 className={styles.taskWorkspaceTitle}>{taskWorkspaceTitle}</h2>
              </div>
            </div>

            <section className={styles.taskSummaryStrip}>
              <div className={styles.taskSummaryHeader}>
                <div className={styles.taskSummaryMetrics}>
                  <div className={styles.taskSummaryMetric}>
                    <span>Открыто</span>
                    <strong>{timedOpenTasks.length + untimedOpenTasks.length}</strong>
                  </div>
                  <div className={styles.taskSummaryMetric}>
                    <span>Выполнено</span>
                    <strong>{completedTasks.length}</strong>
                  </div>
                  <div className={styles.taskSummaryMetric}>
                    <span>Всего</span>
                    <strong>{filteredTasks.length}</strong>
                  </div>
                </div>
                <div className={styles.taskSummaryCaption}>{filteredCompletionPercent}% за день</div>
              </div>
              <div
                className={styles.taskSummaryProgressTrack}
                style={{
                  ['--task-progress-fill' as any]: getTaskProgressGradient(filteredCompletionPercent),
                  ['--task-progress-accent' as any]: getTaskProgressAccent(filteredCompletionPercent),
                }}
              >
                <span style={{ width: `${filteredCompletionPercent}%` }} />
              </div>
              <div className={styles.taskSummaryLegend}>Завершено {completedTasks.length} из {filteredTasks.length || 0} задач на выбранный день.</div>
            </section>

            <div className={styles.taskToolbar}>
              <div className={styles.taskLayoutTabs}>
                <Segmented
                  value={taskLayoutMode}
                  onChange={(value) => handleTaskLayoutChange(value as 'list' | 'day' | 'week')}
                  options={[
                    { value: 'list', label: 'Список задач' },
                    { value: 'day', label: 'День' },
                    { value: 'week', label: 'Неделя' },
                  ]}
                />
              </div>
              <div className={styles.taskFilterSelectWrap}>
                <span className={styles.taskModeSelectLabel}>Показывать</span>
                <label className={styles.taskModeSelectShell}>
                  <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as 'ALL' | 'TASKS' | 'HABITS')}>
                    <option value="ALL">Все</option>
                    <option value="TASKS">Задачи</option>
                    <option value="HABITS">Привычки</option>
                  </select>
                  <ChevronDown className={styles.taskModeSelectIcon} strokeWidth={2.2} />
                </label>
              </div>
            </div>

            <form
              className={[styles.taskQuickAddForm, quickTaskExpanded ? styles.taskQuickAddFormExpanded : ''].filter(Boolean).join(' ')}
              onSubmit={(event) => {
                void handleQuickAddTask(event);
              }}
            >
              <div className={styles.taskQuickAddTop}>
                <PulseIcon name="plus" className={styles.taskQuickAddIcon} />
                <input
                  value={quickTaskForm.title}
                  onChange={(event) => setQuickTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder={quickTaskExpanded ? 'Название задачи' : 'Быстро добавить задачу'}
                  aria-label="Быстро добавить задачу"
                />
                <button
                  type="button"
                  className={[styles.taskQuickAddToggle, quickTaskExpanded ? styles.taskQuickAddToggleOpen : ''].filter(Boolean).join(' ')}
                  onClick={() => setQuickTaskExpanded((value) => !value)}
                  aria-expanded={quickTaskExpanded}
                >
                  <span>{quickTaskExpanded ? 'Скрыть детали' : 'Детали'}</span>
                  <ChevronDown className={styles.taskQuickAddToggleIcon} strokeWidth={2.2} />
                </button>
                <button type="submit" className={styles.taskQuickAddSubmit} disabled={taskSaving || !canSubmitTaskDraft(quickTaskForm)}>
                  Добавить
                </button>
              </div>

              {quickTaskExpanded ? (
                <div className={styles.taskQuickAddAdvanced}>
                  <div className={styles.taskQuickAddBlock}>
                    <div className={styles.taskQuickAddBlockTitle}>Когда</div>
                    <div className={styles.taskTimeModeRow}>
                      <Segmented
                        value={quickTaskForm.timeMode}
                        onChange={(value) =>
                          setQuickTaskForm((prev) =>
                            normalizeTaskDraft({
                              ...prev,
                              timeMode: value as TaskDraft['timeMode'],
                            }))}
                        options={[
                          { value: 'NONE', label: 'Без времени' },
                          { value: 'SINGLE', label: 'Одно время' },
                          { value: 'RANGE', label: 'Интервал' },
                        ]}
                      />
                    </div>
                    <div className={styles.inlineFields}>
                      <Field label="Дата">
                        <input
                          type="date"
                          value={quickTaskForm.date}
                          onChange={(event) => setQuickTaskForm((prev) => ({ ...prev, date: event.target.value }))}
                        />
                      </Field>
                      {quickTaskForm.timeMode !== 'NONE' ? (
                        <Field label={quickTaskForm.timeMode === 'RANGE' ? 'Начало' : 'Время'}>
                          <input
                            type="time"
                            value={quickTaskForm.time}
                            onChange={(event) =>
                              setQuickTaskForm((prev) =>
                                normalizeTaskDraft({
                                  ...prev,
                                  time: event.target.value,
                                  endTime:
                                    event.target.value && prev.timeMode === 'RANGE'
                                      ? (prev.endTime || addMinutesToTime(event.target.value))
                                      : prev.endTime,
                                }))}
                          />
                        </Field>
                      ) : (
                        <div className={styles.taskTimeHint}>Задача попадёт в список без времени.</div>
                      )}
                      {quickTaskForm.timeMode === 'RANGE' ? (
                        <Field label="Окончание">
                          <input
                            type="time"
                            value={quickTaskForm.endTime}
                            min={quickTaskForm.time || undefined}
                            disabled={!quickTaskForm.time}
                            onChange={(event) => setQuickTaskForm((prev) => ({ ...prev, endTime: event.target.value }))}
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.taskQuickAddBlock}>
                    <div className={styles.taskQuickAddBlockTitle}>Тип задачи</div>
                    <Segmented
                      value={quickTaskForm.taskType}
                      onChange={(value) =>
                        setQuickTaskForm((prev) => ({
                          ...prev,
                          taskType: value as TaskDraft['taskType'],
                          scheduleType:
                            value === 'REGULAR'
                              ? (prev.scheduleType === 'NONE' ? 'WEEKLY' : prev.scheduleType)
                              : 'NONE',
                        }))}
                      options={[
                        { value: 'ONE_TIME', label: 'Один раз' },
                        { value: 'REGULAR', label: 'Повтор' },
                        { value: 'HABIT', label: 'Привычка' },
                      ]}
                    />
                  </div>

                  {quickTaskForm.taskType === 'REGULAR' ? (
                    <div className={styles.taskQuickAddBlock}>
                      <div className={styles.taskQuickAddBlockTitle}>Повтор</div>
                      <Segmented
                        value={quickTaskForm.scheduleType}
                        onChange={(value) => setQuickTaskForm((prev) => ({ ...prev, scheduleType: value as TaskDraft['scheduleType'] }))}
                        options={[
                          { value: 'WEEKLY', label: 'По дням недели' },
                          { value: 'MONTHLY', label: 'По дням месяца' },
                        ]}
                      />
                      {quickTaskForm.scheduleType === 'WEEKLY' ? (
                        <div className={styles.weekSelector}>
                          {weekdayLabels.map((label, index) => (
                            <button
                              key={label}
                              type="button"
                              className={[styles.weekMini, quickTaskForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')}
                              onClick={() =>
                                setQuickTaskForm((prev) => ({
                                  ...prev,
                                  daysOfWeek: prev.daysOfWeek.includes(index)
                                    ? prev.daysOfWeek.filter((item) => item !== index)
                                    : [...prev.daysOfWeek, index],
                                }))}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {quickTaskForm.scheduleType === 'MONTHLY' ? (
                        <Field label="Дни месяца через запятую">
                          <input
                            placeholder="Например, 1, 15, 28"
                            value={quickTaskForm.daysOfMonth.join(',')}
                            onChange={(event) =>
                              setQuickTaskForm((prev) => ({
                                ...prev,
                                daysOfMonth: event.target.value
                                  .split(',')
                                  .map((item) => Number(item.trim()))
                                  .filter((item) => Number.isFinite(item) && item > 0 && item < 32),
                              }))}
                          />
                        </Field>
                      ) : null}
                    </div>
                  ) : null}

                  <Field label="Описание (опционально)">
                    <textarea
                      rows={3}
                      placeholder="Короткий контекст или детали"
                      value={quickTaskForm.notes}
                      onChange={(event) => setQuickTaskForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </Field>
                </div>
              ) : null}
            </form>
            {!isTimelineMode ? (
              <div className={styles.taskListStack}>
                {timedOpenTasks.length ? (
                  <section className={styles.taskSectionGroup}>
                    <div className={styles.taskSectionHeader}>
                      <span className={styles.taskSectionTitle}>Со временем</span>
                      <span className={styles.taskSectionCount}>{timedOpenTasks.length}</span>
                    </div>
                    <div className={styles.taskSectionList}>
                      {timedOpenTasks.map((task) => renderTaskRow(task))}
                    </div>
                  </section>
                ) : null}

                {untimedOpenTasks.length ? (
                  <section className={styles.taskSectionGroup}>
                    <div className={styles.taskSectionHeader}>
                      <span className={styles.taskSectionTitle}>Без времени</span>
                      <span className={styles.taskSectionCount}>{untimedOpenTasks.length}</span>
                    </div>
                    <div className={styles.taskSectionList}>
                      {untimedOpenTasks.map((task) => renderTaskRow(task))}
                    </div>
                  </section>
                ) : null}

                {completedTasks.length ? (
                  <section className={styles.taskSectionGroup}>
                    <button type="button" className={styles.taskSectionCollapse} onClick={() => setShowCompletedTasks((prev) => !prev)}>
                      <span className={styles.taskSectionCollapseLabel}>{`Выполнено (${completedTasks.length})`}</span>
                      <ChevronDown
                        size={16}
                        className={[styles.taskSectionCollapseIcon, showCompletedTasks ? styles.taskSectionCollapseIconOpen : ''].filter(Boolean).join(' ')}
                        aria-hidden="true"
                      />
                    </button>
                    {showCompletedTasks ? (
                      <div className={styles.taskSectionList}>
                        {completedTasks.map((task) => renderTaskRow(task, { compact: true }))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {!filteredTasks.length ? <div className={styles.emptyText}>На выбранный день пока нет задач этого типа.</div> : null}
              </div>
            ) : (
              <div className={styles.timelineScene}>
                <DailyPlanner
                  mode={plannerMode}
                  date={selectedDate}
                  weekDates={weekDates}
                  tasks={plannerTasks}
                  allTasks={plannerAllTasks}
                  onCreateTaskAtSlot={handleCreateTaskFromPlannerSlot}
                  onToggleTask={(taskId, date) => {
                    void togglePulseTaskDate({ taskId, date });
                  }}
                  onUpdateTask={async (taskId, body) => {
                    await updatePulseTask({ taskId, body }).unwrap();
                  }}
                  showHeader={false}
                  compact
                />

                <section className={styles.taskBacklogSurface}>
                  <div className={styles.taskSectionHeader}>
                    <span className={styles.taskSectionEyebrow}>Без времени</span>
                    <span className={styles.taskSectionCount}>{untimedOpenTasks.length}</span>
                  </div>

                  {untimedOpenTasks.length ? (
                    <div className={styles.taskSectionList}>
                      {untimedOpenTasks.map((task) => renderTaskRow(task, { compact: true }))}
                    </div>
                  ) : (
                    <div className={styles.emptyText}>Все открытые задачи уже распределены по времени.</div>
                  )}
                </section>
              </div>
            )}
          </section>
          </div>

          <section className={styles.goalSummarySurface}>
            <div className={styles.goalSummaryHeader}>
              <div className={styles.goalSummaryCopy}>
                <span className={styles.taskWorkspaceEyebrow}>Глобальные цели</span>
                <h2 className={styles.goalSummaryTitle}>Отдельно от сценария дня</h2>
              </div>

              <div className={styles.goalSummaryActions}>
                <button type="button" className={styles.taskSecondaryButton} onClick={() => setGoalModalOpen(true)}>
                  <PulseIcon name="plus" className={styles.healthButtonIcon} />
                  <span>Новая цель</span>
                </button>
              </div>
            </div>

            <div className={styles.goalSummaryStats}>
              <div className={styles.goalSummaryStatCompact}>
                <span className={styles.goalSummaryStatLabel}>Всего</span>
                <div className={styles.goalSummaryStatCompactRow}>
                  <span className={styles.goalSummaryStatIcon}><PulseIcon name="target" className={styles.goalSummaryStatSvg} /></span>
                  <strong>{preparedGoals.length}</strong>
                </div>
              </div>
              <div className={styles.goalSummaryStatCompact}>
                <span className={styles.goalSummaryStatLabel}>В работе</span>
                <div className={styles.goalSummaryStatCompactRow}>
                  <span className={styles.goalSummaryStatIcon}><PulseIcon name="spark" className={styles.goalSummaryStatSvg} /></span>
                  <strong>{activeGoals.length}</strong>
                </div>
              </div>
              <div className={styles.goalSummaryStatCompact}>
                <span className={styles.goalSummaryStatLabel}>Достигнуто</span>
                <div className={styles.goalSummaryStatCompactRow}>
                  <span className={styles.goalSummaryStatIcon}><PulseIcon name="check" className={styles.goalSummaryStatSvg} /></span>
                  <strong>{achievedGoals.length}</strong>
                </div>
              </div>
            </div>

            {preparedGoals.length ? (
              <div className={styles.goalSummaryList}>
                {preparedGoals.map((goal) => {
                  const expanded = expandedGoalIds.includes(goal.id);
                  return (
                  <article key={goal.id} className={[styles.goalSummaryRow, goal.achieved ? styles.goalSummaryRowDone : ''].filter(Boolean).join(' ')}>
                    <div className={styles.goalSummaryRowTop}>
                      <div className={styles.goalSummaryRowMain}>
                        <strong>{goal.title}</strong>
                        <span>
                          {goal.achieved
                            ? 'Достигнуто'
                            : goal.subtaskCount
                              ? `${goal.doneCount} из ${goal.subtaskCount} шагов`
                              : goal.targetDate
                                ? `До ${formatShortDate(goal.targetDate)}`
                                : goal.displayDescription || 'Без срока'}
                        </span>
                      </div>

                      <div className={styles.goalSummaryRowActions}>
                        <button
                          type="button"
                          className={[styles.goalMiniCheck, goal.achieved ? styles.goalMiniCheckDone : ''].filter(Boolean).join(' ')}
                          onClick={() => handleToggleGoalAchieved(goal)}
                          disabled={pulseGoalUpdating}
                          aria-label={goal.achieved ? 'Снять достижение цели' : 'Отметить цель выполненной'}
                        >
                          {goal.achieved ? <Check className={styles.goalCheckIcon} strokeWidth={3} /> : null}
                        </button>
                        <button
                          type="button"
                          className={[styles.goalMiniAction, styles.destructiveIconAction].filter(Boolean).join(' ')}
                          onClick={() => deletePulseGoal(goal.id)}
                          disabled={pulseGoalUpdating}
                          aria-label="Удалить цель"
                        >
                          <PulseIcon name="trash" className={styles.taskDeleteIcon} />
                        </button>
                        {goal.subtaskCount ? (
                          <button
                            type="button"
                            className={[styles.goalExpandButton, expanded ? styles.goalExpandButtonOpen : ''].filter(Boolean).join(' ')}
                            onClick={() => toggleGoalExpanded(goal.id)}
                            aria-label={expanded ? 'Свернуть подзадачи' : 'Показать подзадачи'}
                          >
                            <ChevronDown className={styles.goalExpandIcon} strokeWidth={2.2} />
                          </button>
                        ) : null}
                        <div className={styles.goalSummaryRowSide}>
                          <strong>{goal.achieved ? '100%' : `${goal.computedProgress}%`}</strong>
                        </div>
                      </div>
                    </div>
                    <div className={styles.goalSummaryProgress}><span style={{ width: `${goal.computedProgress}%` }} /></div>
                    {goal.subtaskCount && expanded ? (
                      <div className={styles.goalSubtaskListMinimal}>
                        {goal.subtasks.map((subtask) => (
                          <button
                            key={subtask.id}
                            type="button"
                            className={[styles.goalSubtaskRow, subtask.done ? styles.goalSubtaskRowDone : ''].filter(Boolean).join(' ')}
                            onClick={() => handleToggleGoalSubtask(goal, subtask.id)}
                            disabled={pulseGoalUpdating}
                          >
                            <span className={[styles.goalSubtaskToggle, subtask.done ? styles.goalSubtaskToggleDone : ''].filter(Boolean).join(' ')}>{subtask.done ? <Check className={styles.goalCheckIcon} strokeWidth={3} /> : null}</span>
                            <span className={styles.goalSubtaskTitle}>{subtask.title}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyText}>Добавьте одну большую цель и держите её как тихий фон, а не как второй главный экран дня.</div>
            )}
          </section>
        </div>
      ) : null}

      {mainTab === 'finance' ? (
        <div className={styles.financeScene}>
          <div ref={financeSubnavRef} className={styles.financeSubnav}>
            <button ref={(node) => { financeSubnavButtonRefs.current.expenses = node; }} type="button" className={[styles.financeSubnavButton, financeSubTab === 'expenses' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceSubTab('expenses')}>
              <PulseIcon name="wallet" className={styles.healthSubnavIcon} />
              <span>Расходы</span>
            </button>
            <button ref={(node) => { financeSubnavButtonRefs.current.income = node; }} type="button" className={[styles.financeSubnavButton, financeSubTab === 'income' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceSubTab('income')}>
              <PulseIcon name="trend" className={styles.healthSubnavIcon} />
              <span>Доходы</span>
            </button>
            <button ref={(node) => { financeSubnavButtonRefs.current.savings = node; }} type="button" className={[styles.financeSubnavButton, financeSubTab === 'savings' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceSubTab('savings')}>
              <PulseIcon name="target" className={styles.healthSubnavIcon} />
              <span>Накопления</span>
            </button>
            <button ref={(node) => { financeSubnavButtonRefs.current.debts = node; }} type="button" className={[styles.financeSubnavButton, financeSubTab === 'debts' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceSubTab('debts')}>
              <PulseIcon name="card" className={styles.healthSubnavIcon} />
              <span>Долги</span>
            </button>
            <button ref={(node) => { financeSubnavButtonRefs.current.stats = node; }} type="button" className={[styles.financeSubnavButton, financeSubTab === 'stats' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceSubTab('stats')}>
              <PulseIcon name="trend" className={styles.healthSubnavIcon} />
              <span>Статистика</span>
            </button>
          </div>

          {financeSubTab === 'expenses' ? (
            <>
              <section className={[styles.financeHeroSurface, styles.financeHeroSurfaceClean, styles.financeSectionFirst, styles.financeHeroSurfaceFlat].join(' ')}>
                <div className={styles.financeHeroTopRow}>
                  <div className={styles.financeRangeTabs}>
                    {(['DAY', 'MONTH', 'YEAR'] as const).map((range) => (
                      <button
                        key={range}
                        type="button"
                        className={[styles.financeRangeTab, financeRange === range ? styles.financeRangeTabActive : ''].filter(Boolean).join(' ')}
                        onClick={() => setFinanceRange(range)}
                      >
                        {range === 'DAY' ? 'День' : range === 'MONTH' ? 'Месяц' : 'Год'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={[styles.financeHeroLead, styles.financeHeroLeadSimple, styles.financeHeroLeadInline].join(' ')}>
                  <span className={[styles.financeHeroIconWrap, styles.financeHeroIconExpense].join(' ')}>
                    <PulseIcon name="wallet" className={styles.financeHeroIcon} />
                  </span>
                  <strong className={styles.financeAmountNeutral}>{formatMoney(periodExpenseTotal)}</strong>
                  <button type="button" className={styles.financeInlinePlusButton} onClick={() => { resetFinanceEntryForm('EXPENSE'); setFinanceModalOpen(true); }} aria-label="Добавить расход">
                    <PulseIcon name="plus" className={styles.financeInlineAddIcon} />
                  </button>
                </div>
                <div className={styles.financeHeroMetaRow}>
                  <span>{expenseOperationsLabel}</span>
                  {averageExpenseAmount > 0 ? <span>Средний чек {formatMoney(averageExpenseAmount)}</span> : null}
                  {primaryExpenseCategory?.spent ? <span>Больше всего уходит на {primaryExpenseCategory.name}</span> : null}
                </div>
              </section>

              <section className={[styles.financePanelSurface, styles.financePanelSurfaceCompact, styles.financeSectionSurfaceFlat].join(' ')}>
                <div className={styles.financePanelHeader}>
                  <div className={styles.financePanelTitle}>{expenseOperationsLabel}</div>
                </div>
                <div className={styles.financeEntryList}>
                  {expenseEntries.map((entry) => (
                    <FinanceEntryCompactRow
                      key={entry.id}
                      entry={entry}
                      onEdit={openFinanceEntryEditor}
                      onDelete={deleteFinanceEntry}
                    />
                  ))}
                  {!expenseEntries.length ? <div className={styles.emptyText}>На выбранный {financeRangeLabel} расходов пока нет.</div> : null}
                </div>
              </section>

              <section className={[styles.financeSectionSurface, styles.financeSectionSurfaceFlat].join(' ')}>
                <div className={styles.financePanelHeader}>
                  <div className={styles.financePanelTitle}>Траты по категориям</div>
                  <span className={styles.financePanelHint}>{financeRangeLabelPlural}</span>
                </div>
                <div className={styles.financeCategoryGrid}>
                  {financeCategoriesView.map((category) => {
                    const meta = getFinanceCategoryMeta(category.name);
                    const over = (category.overBy ?? 0) > 0;
                    return (
                      <article key={category.id} className={[styles.financeCategoryCard, styles.financeCategoryCardInteractive].join(' ')} role="button" tabIndex={0} onClick={() => openFinanceCategoryModal(category)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFinanceCategoryModal(category); } }}>
                        <div className={styles.financeCategoryHead}>
                          <div className={styles.financeCategoryLead}>
                            <span className={[styles.financeCategoryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                              <PulseIcon name={meta.icon} className={styles.financeCategoryIcon} />
                            </span>
                            <strong>{category.name}</strong>
                          </div>
                          {over ? <span className={styles.financeWarningPill}><PulseIcon name="warning" className={styles.financeInlinePillIcon} /></span> : null}
                        </div>
                        <div className={[styles.financeProgress, over ? styles.financeProgressDanger : ''].filter(Boolean).join(' ')}><span style={{ width: `${(category.percent ?? 0) > 0 ? Math.max(10, category.percent ?? 0) : 0}%` }} /></div>
                        <div className={styles.financeCategoryMeta}>
                          <strong className={over ? styles.financeAmountExpense : ''}>{formatMoney(category.spent ?? 0)}</strong>
                          <span>из {formatMoney(category.limitAmount ?? 0)}</span>
                        </div>
                      </article>
                    );
                  })}
                  {!financeCategoriesView.length ? <div className={styles.emptyText}>Сначала добавь категории и расходы — тогда здесь появится наглядная разбивка.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'income' ? (
            <>
              <section className={[styles.financeHeroSurface, styles.financeHeroSurfaceClean, styles.financeSectionFirst, styles.financeHeroSurfaceFlat].join(' ')}>
                <div className={styles.financeHeroTopRow}>
                  <div className={styles.financeRangeTabs}>
                    {(['DAY', 'MONTH', 'YEAR'] as const).map((range) => (
                      <button
                        key={range}
                        type="button"
                        className={[styles.financeRangeTab, financeRange === range ? styles.financeRangeTabActive : ''].filter(Boolean).join(' ')}
                        onClick={() => setFinanceRange(range)}
                      >
                        {range === 'DAY' ? 'День' : range === 'MONTH' ? 'Месяц' : 'Год'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={[styles.financeHeroLead, styles.financeHeroLeadSimple, styles.financeHeroLeadInline].join(' ')}>
                  <span className={[styles.financeHeroIconWrap, styles.financeToneGreen].join(' ')}>
                    <PulseIcon name="trend" className={styles.financeHeroIcon} />
                  </span>
                  <strong className={styles.financeAmountNeutral}>{formatMoney(periodIncomeTotal)}</strong>
                  <button type="button" className={styles.financeInlinePlusButton} onClick={() => { resetFinanceEntryForm('INCOME'); setFinanceModalOpen(true); }} aria-label="Добавить доход">
                    <PulseIcon name="plus" className={styles.financeInlineAddIcon} />
                  </button>
                </div>
                <div className={styles.financeHeroMetaRow}>
                  <span>{incomeOperationsLabel}</span>
                  {primaryIncomeEntry ? <span>Последнее поступление — {primaryIncomeEntry.title}</span> : null}
                </div>
              </section>

              <section className={[styles.financePanelSurface, styles.financePanelSurfaceCompact, styles.financeSectionSurfaceFlat].join(' ')}>
                <div className={styles.financePanelHeader}>
                  <div className={styles.financePanelTitle}>{incomeOperationsLabel}</div>
                </div>
                <div className={styles.financeEntryList}>
                  {incomeEntries.map((entry) => (
                    <FinanceEntryCompactRow
                      key={entry.id}
                      entry={entry}
                      onEdit={openFinanceEntryEditor}
                      onDelete={deleteFinanceEntry}
                    />
                  ))}
                  {!incomeEntries.length ? <div className={styles.emptyText}>На выбранный {financeRangeLabel} доходов пока нет.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'savings' ? (
            <>
              <section className={[styles.financeSectionSurface, styles.financeSectionFirst].join(' ')}>
                <div className={styles.financeSectionHeaderBar}>
                  <div className={styles.financeSectionTitleWithAction}>
                    <div className={styles.financeSectionTitle}><PulseIcon name="target" className={styles.sectionIconAccent} />Накопления</div>
                    <button type="button" className={styles.financeInlineAddButton} onClick={() => setSavingsModalOpen(true)} aria-label="Добавить цель накопления">
                      <PulseIcon name="plus" className={styles.financeInlineAddIcon} />
                    </button>
                  </div>
                </div>
                <div className={styles.financeSavingsList}>
                  {savingsGoalsView.map((goal) => (
                    <article key={goal.id} className={styles.financeSavingsCard}>
                      <div className={styles.financeSavingsHead}>
                        <div className={styles.financeEntryLead}>
                          <span className={[styles.financeEntryIconWrap, styles.financeToneOrange].join(' ')}><PulseIcon name="target" className={styles.financeEntryIcon} /></span>
                          <div className={styles.financeEntryText}>
                            <strong>{goal.title}</strong>
                            <span>Осталось: {formatMoney(goal.remaining)}</span>
                          </div>
                        </div>
                        <div className={styles.financeSavingsSide}>
                          <span className={styles.financeBadgePill}>{goal.progress}%</span>
                          <div className={styles.financeSavingsActions}>
                            <button type="button" className={styles.financeActionButtonPrimary} onClick={() => openSavingsContributionModal(goal.id)}>Пополнить</button>
                            <button type="button" className={styles.taskDeleteButton} onClick={() => deleteSavingsGoal(goal.id)}>Удалить</button>
                          </div>
                        </div>
                      </div>
                      <div className={styles.financeSavingsProgressBlock}>
                        <div className={styles.financeSavingsProgressMeta}>
                          <span>Накоплено</span>
                          <strong>{formatMoney(goal.savedAmount)} из {formatMoney(goal.targetAmount)}</strong>
                        </div>
                        <div className={styles.financeProgress}><span style={{ width: `${goal.progress}%` }} /></div>
                      </div>
                      {goal.shareArtifact ? (
                        <FinanceShareParticipants
                          shareMeta={goal.shareArtifact}
                          title={goal.shareArtifact.sharingScope === 'SHARED' ? 'Кто сколько внёс' : 'Участники накопления'}
                        />
                      ) : null}
                    </article>
                  ))}
                  {!savingsGoalsView.length ? <div className={styles.emptyText}>Добавь финансовую цель, чтобы видеть движение к крупным покупкам отдельно от ежедневных трат.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'debts' ? (
            <>
              <section className={[styles.financeSectionSurface, styles.financeSectionFirst].join(' ')}>
                <div className={styles.financeSectionHeaderBar}>
                  <div className={styles.financeSectionTitleWithAction}>
                    <div className={styles.financeSectionTitle}><PulseIcon name="card" className={styles.sectionIconAccent} />Кредиты и долги</div>
                    <button type="button" className={styles.financeInlineAddButton} onClick={() => { resetDebtForm(); setDebtModalOpen(true); }} aria-label="Добавить долг">
                      <PulseIcon name="plus" className={styles.financeInlineAddIcon} />
                    </button>
                  </div>
                </div>
                <div className={styles.financeDebtList}>
                  {debtsView.map((debt) => (
                    <article key={debt.id} className={[styles.financeDebtCard, debt.isClosed ? styles.financeDebtCardClosed : ''].filter(Boolean).join(' ')}>
                      <div className={styles.financeDebtHead}>
                        <div className={styles.financeEntryLead}>
                          <span className={[styles.financeEntryIconWrap, debt.isClosed ? styles.financeToneGreen : styles.financeTonePink].join(' ')}><PulseIcon name="card" className={styles.financeEntryIcon} /></span>
                          <div className={styles.financeEntryText}>
                            <strong>{debt.title}</strong>
                            <span>{debt.debtType}</span>
                          </div>
                        </div>
                        <div className={styles.financeDebtHeadBadges}>
                          {debt.paymentDay ? <span className={styles.financeDebtDate}>{debt.paymentDay} число</span> : debt.dueDate ? <span className={styles.financeDebtDate}>{formatShortDate(debt.dueDate)}</span> : null}
                          <span className={[styles.financeDebtStatusBadge, debt.isClosed ? styles.financeDebtStatusClosed : styles.financeDebtStatusActive].join(' ')}>{debt.isClosed ? 'Погашено' : debt.debtType}</span>
                        </div>
                      </div>
                      <div className={styles.financeDebtMetricsEnhanced}>
                        <div><span>Выплачено</span><strong className={styles.financeAmountIncome}>{formatMoney(debt.paidAmount)}</strong></div>
                        <div><span>Осталось</span><strong className={styles.financeAmountExpense}>{formatMoney(debt.remaining)}</strong></div>
                        <div><span>{debt.paymentAmount ? 'Плановый платёж' : 'Следующий шаг'}</span><strong>{debt.paymentAmount ? formatMoney(debt.paymentAmount) : debt.isClosed ? 'Завершено' : 'Внести платёж'}</strong></div>
                        <div><span>{debt.interestRate ? 'Ставка' : debt.termMonths ? 'Срок' : 'Статус'}</span><strong>{debt.interestRate ? `${debt.interestRate}%` : debt.termMonths ? `${debt.termMonths} мес.` : debt.isClosed ? 'Закрыт' : 'Активен'}</strong></div>
                      </div>
                      <div className={[styles.financeProgress, debt.isClosed ? styles.financeProgressSuccess : ''].filter(Boolean).join(' ')}><span style={{ width: `${debt.progress}%` }} /></div>
                      {debt.shareArtifact ? (
                        <FinanceShareParticipants
                          shareMeta={debt.shareArtifact}
                          title={debt.shareArtifact.sharingScope === 'SHARED' ? 'Кто сколько погасил' : 'Участники долга'}
                        />
                      ) : null}
                      <div className={styles.financeDebtFooter}>
                        <span>{debt.isClosed ? 'Достигнуто: долг полностью закрыт.' : `${debt.progress}% уже выплачено`}</span>
                        <span>{debt.termMonths ? `Осталось примерно ${Math.max(debt.termMonths - Math.round((debt.paidAmount / Math.max(debt.paymentAmount || 1, 1))), 0)} мес.` : debt.paymentAmount ? 'Можно вносить платёж больше плана — остаток пересчитается автоматически.' : 'Без фиксированного графика — внеси платёж в удобный момент.'}</span>
                      </div>
                      <div className={styles.financeDebtActions}>
                        <button type="button" className={styles.financeActionButtonPrimary} onClick={() => openDebtPaymentModal(debt.id, debt.paymentAmount ?? debt.remaining)} disabled={debt.isClosed || debtUpdating}>
                          <PulseIcon name="plus" className={styles.financeInlinePillIcon} />
                          <span>{debt.isClosed ? 'Погашено' : 'Внести платёж'}</span>
                        </button>
                        <button type="button" className={styles.financeActionButton} onClick={() => deleteDebt(debt.id)} disabled={debtUpdating}>Удалить</button>
                      </div>
                    </article>
                  ))}
                  {!debtsView.length ? <div className={styles.emptyText}>Когда появятся кредиты или долги, здесь будет полный контроль по платежам и срокам.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'stats' ? (
            <>
              <section className={[styles.financeComparisonSurface, styles.financeSectionFirst].join(' ')}>
                <div className={styles.financeSectionTitle}><PulseIcon name="trend" className={styles.sectionIconAccent} />Финансовый обзор</div>
                <div className={styles.financeComparisonGrid}>
                  <article className={[styles.financeComparisonCard, styles.financeComparisonCardDetailed].join(' ')}>
                    <span>Доходы месяца</span>
                    <strong>{formatMoney(monthlyIncome)}</strong>
                    <em className={styles.financeAmountIncome}>{monthlyIncome > monthlyExpenses ? 'Поступления покрывают расходы' : 'Нужен контроль входящего потока'}</em>
                  </article>
                  <article className={[styles.financeComparisonCard, styles.financeComparisonCardDetailed].join(' ')}>
                    <span>Расходы месяца</span>
                    <strong>{formatMoney(monthlyExpenses)}</strong>
                    <em className={styles.financeAmountExpense}>{financeStatsRows[0]?.name ? `Главная категория: ${financeStatsRows[0].name}` : 'Появится после первых расходов'}</em>
                  </article>
                  <article className={[styles.financeComparisonCard, styles.financeComparisonCardDetailed].join(' ')}>
                    <span>Чистый баланс</span>
                    <strong>{formatMoney(monthlyBalance)}</strong>
                    <em className={monthlyBalance >= 0 ? styles.financeAmountIncome : styles.financeAmountExpense}>{monthlyBalance >= 0 ? 'Есть финансовая подушка' : 'Баланс требует внимания'}</em>
                  </article>
                </div>
              </section>

              <div className={styles.financeStatsDashboard}>
                <section className={styles.financeSectionSurface}>
                  <div className={styles.financeSectionTitle}><PulseIcon name="calendar" className={styles.sectionIconAccent} />Сравнение с прошлым месяцем</div>
                  <div className={styles.financeComparisonGrid}>
                    <FinanceComparisonMetricCard label="Доходы" current={monthlyIncome} previous={previousMonthIncome} positiveTrend="up" />
                    <FinanceComparisonMetricCard label="Расходы" current={monthlyExpenses} previous={previousMonthExpenses} positiveTrend="down" />
                    <FinanceComparisonMetricCard label="Баланс" current={monthlyBalance} previous={previousMonthBalance} positiveTrend="up" />
                  </div>
                </section>

                <section className={styles.financeSectionSurface}>
                  <div className={styles.financeSectionTitle}><PulseIcon name="wallet" className={styles.sectionIconAccent} />Структура денежного потока</div>
                  <div className={styles.financeProfileStack}>
                    {financeCompositionItems.map((item) => (
                      <div key={item.key} className={styles.financeLaneRow}>
                        <div className={styles.financeLaneHead}>
                          <span>{item.label}</span>
                          <strong className={item.tone === 'income' ? styles.financeAmountIncome : item.tone === 'expense' ? styles.financeAmountExpense : ''}>{formatMoney(item.value)}</strong>
                        </div>
                        <div className={styles.financeLaneTrack}>
                          <span className={[styles.financeLaneFill, item.tone === 'income' ? styles.financeLaneFillIncome : item.tone === 'expense' ? styles.financeLaneFillExpense : item.tone === 'neutral' ? styles.financeLaneFillNeutral : styles.financeLaneFillAccent].join(' ')} style={{ width: `${Math.max(10, Math.round((item.value / financeCompositionMax) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className={styles.financeSplitGrid}>
                <div className={styles.financeStatsSideStack}>
                  <section className={styles.financeSectionSurface}>
                    <div className={styles.financeSectionTitle}><PulseIcon name="spark" className={styles.sectionIconAccent} />Инсайты</div>
                    <div className={styles.financeInsightsList}>
                      {financeInsights.map((item) => (
                        <article key={item.title} className={[styles.financeInsightCard, styles[`financeInsight${item.tone[0].toUpperCase() + item.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                          <strong>{item.title}</strong>
                          <span>{item.text}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <section className={styles.financeSectionSurface}>
                  <div className={styles.financeSectionTitle}><PulseIcon name="wallet" className={styles.sectionIconAccent} />Расходы по категориям</div>
                  <div className={styles.financeStatsList}>
                    {financeExpenseShareData.map((category) => {
                      const meta = getFinanceCategoryMeta(category.name);
                      const width = category.limitAmount ? Math.max(8, Math.round((category.value / Math.max(category.limitAmount, 1)) * 100)) : Math.max(8, category.percentOfExpenses);
                      return (
                        <div key={category.id} className={styles.financeStatsRowCard}>
                          <div className={styles.financeStatsLead}>
                            <span className={[styles.financeEntryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}><PulseIcon name={meta.icon} className={styles.financeEntryIcon} /></span>
                            <div className={styles.financeStatsLeadText}>
                              <strong>{category.name}</strong>
                              <span>{category.limitAmount ? `Лимит ${formatMoney(category.limitAmount)}` : `${category.percentOfExpenses}% от всех расходов`}</span>
                            </div>
                          </div>
                          <div className={styles.financeStatsBarWrapWide}>
                            <div className={[styles.financeProgress, category.limitAmount && category.value > category.limitAmount ? styles.financeProgressDanger : ''].filter(Boolean).join(' ')}><span style={{ width: `${width}%` }} /></div>
                            <div className={styles.financeStatsAmounts}>
                              <strong>{formatMoney(category.value ?? 0)}</strong>
                              <span>{category.limitAmount ? `${Math.round((category.value / Math.max(category.limitAmount, 1)) * 100)}%` : `${category.percentOfExpenses}%`}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!financeExpenseShareData.length ? <div className={styles.emptyText}>Категории появятся после первых расходов.</div> : null}
                  </div>
                </section>

              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {mainTab === 'programs' ? (
        <div className={styles.pulseScene}>
          <ProgramsPulseTab />
        </div>
      ) : null}

      {mainTab === 'analytics' ? (<AnalyticsTab analyticsData={analyticsData} pulseDay={pulseDay} />) : null}

      {mainTab === 'config' ? (
        <ConfigTab
          config={config}
          configSaving={configSaving}
          financeActiveModules={financeActiveModules}
          handleConfigToggle={handleConfigToggle as any}
        />
      ) : null}

      <Modal
        open={profileModalOpen}
        onClose={closeProfileEditor}
        title="Параметры профиля"
        subtitle="Обновите рост, возраст и веса. Эти данные используются в обзоре, питании и расчётах прогресса."
        icon={<PulseIcon name="scale" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <div className={styles.profileModalGrid}>
            {isHealthEnabled ? (
              <Field label="Рост">
                <input
                  autoFocus
                  value={profileForm.heightCm}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, heightCm: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Например, 187"
                />
              </Field>
            ) : null}
            {isHealthEnabled ? (
              <Field label="Возраст">
                <input
                  autoFocus={!isHealthEnabled && !isNutritionEnabled}
                  value={profileForm.age}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, age: e.target.value }))}
                  inputMode="numeric"
                  placeholder="Например, 29"
                />
              </Field>
            ) : null}
            {isNutritionEnabled ? (
              <Field label="Вес на старте">
                <input
                  autoFocus={!isHealthEnabled}
                  value={profileForm.startWeightKg}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, startWeightKg: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Например, 70"
                />
              </Field>
            ) : null}
            {isNutritionEnabled ? (
              <Field label="Вес сейчас">
                <input
                  value={profileForm.currentWeightKg}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Например, 73"
                />
              </Field>
            ) : null}
            {isNutritionEnabled ? (
              <Field label="Желаемый вес">
                <input
                  value={profileForm.targetWeightKg}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, targetWeightKg: e.target.value }))}
                  inputMode="decimal"
                  placeholder="Например, 82"
                />
              </Field>
            ) : null}
          </div>

          <div className={styles.profileModalHint}>
            Чем точнее профиль, тем аккуратнее рассчитываются цель по весу, визуал прогресса и рекомендации по питанию.
          </div>

          <div className={styles.modalFooterSummary}>
            <strong>
              {profile?.currentWeightKg != null
                ? `Сейчас: ${formatNumericValue(profile?.currentWeightKg, 1)} кг`
                : 'Профиль ещё не заполнен'}
            </strong>
            <div className={styles.modalActions}>
              <Button onClick={closeProfileEditor}>Отмена</Button>
              <Button variant="primary" onClick={handleProfileSave} loading={profileSaving}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={nutritionGoalModalOpen}
        onClose={closeNutritionGoalModal}
        title="Цель питания"
        subtitle="Измени дневную цель по калориям и БЖУ без перехода на отдельный экран."
        icon={<PulseIcon name="target" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <div className={styles.modalInlineActions}>
            <button
              type="button"
              className={styles.modalSecondaryButton}
              onClick={() => setGoalForm({
                dailyCalories: String(profileSuggestion?.dailyCalories ?? ''),
                protein: String(profileSuggestion?.protein ?? ''),
                fat: String(profileSuggestion?.fat ?? ''),
                carbs: String(profileSuggestion?.carbs ?? ''),
              })}
            >
              Подставить подсказку
            </button>
          </div>
          <div className={styles.compactGrid}>
            <Field label="Ккал / день"><input value={goalForm.dailyCalories} onChange={(event) => setGoalForm((prev) => ({ ...prev, dailyCalories: event.target.value }))} /></Field>
            <Field label="Белки"><input value={goalForm.protein} onChange={(event) => setGoalForm((prev) => ({ ...prev, protein: event.target.value }))} /></Field>
            <Field label="Жиры"><input value={goalForm.fat} onChange={(event) => setGoalForm((prev) => ({ ...prev, fat: event.target.value }))} /></Field>
            <Field label="Углеводы"><input value={goalForm.carbs} onChange={(event) => setGoalForm((prev) => ({ ...prev, carbs: event.target.value }))} /></Field>
          </div>
          <div className={styles.modalFooterSummary}>
            <strong>{nutritionGoal ? `Текущая цель: ${nutritionGoal.dailyCalories} ккал` : 'Цель будет сохранена в профиль питания'}</strong>
            <div className={styles.modalActions}>
              <Button onClick={closeNutritionGoalModal}>Отмена</Button>
              <Button variant="primary" onClick={handleGoalSave} disabled={goalSaving} loading={goalSaving}>Сохранить</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={mealModalOpen}
        onClose={closeMealModal}
        title={editingMealId ? 'Изменить приём пищи' : 'Добавить приём пищи'}
        subtitle="Найдите продукты или соберите свой приём пищи из популярных вариантов."
        icon={<PulseIcon name="meal" className={styles.modalHeaderSvg} />}
        size="lg"
        bodyClassName={styles.mealComposerModalBody}
      >
        <div className={styles.mealComposerModal}>
          <div className={styles.mealComposerScroll}>
            <div className={styles.modalStack}>
              <div className={styles.compactGrid}>
                <Field label="Название приёма пищи"><input placeholder="Например, Обед или Перекус" value={mealTitle} onChange={(e) => setMealTitle(e.target.value)} /></Field>
                <Field label="Время"><input type="time" value={mealTime} onChange={(e) => setMealTime(e.target.value)} /></Field>
              </div>
              <Field label="Комментарий (опционально)"><textarea rows={3} placeholder="Короткая заметка о приёме пищи" value={mealNotes} onChange={(e) => setMealNotes(e.target.value)} /></Field>
              <Field label="Поиск продукта или блюда"><input value={foodSearch} onChange={(e) => setFoodSearch(e.target.value)} placeholder="Овсянка, курица, йогурт..." /></Field>

              {(nutritionData?.recentItems ?? []).length ? (
                <div className={styles.modalBlock}>
                  <div className={styles.modalBlockTitle}>Недавние</div>
                  <div className={styles.modalChipRow}>
                    {(nutritionData?.recentItems ?? []).slice(0, 6).map((item, index) => (
                      <button key={`${item.name}-${index}`} type="button" className={styles.modalChip} onClick={() => setMealItems((prev) => [...prev, { ...item }])}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.mealComposerPanel}>
                <div className={styles.mealComposerPanelHeader}>
                  <div className={styles.modalBlockTitle}>Результаты поиска</div>
                  {foodSearch.trim() ? <span className={styles.mealComposerPanelMeta}>{Math.min((foodSearchData?.items ?? []).length, 8)} вариантов</span> : null}
                </div>
                <div className={styles.modalSearchResults}>
                  {(foodSearchData?.items ?? []).slice(0, 8).map((food) => {
                    const selectedCount = mealItemCountMap.get(getFoodIdentity(food)) ?? 0;
                    return (
                      <div key={food.id} className={styles.modalSearchRow}>
                        <button type="button" className={styles.modalSearchButton} onClick={() => addFoodToMeal(food)}>
                          <div className={styles.modalSearchCopy}>
                            <strong>{food.name}</strong>
                            <span>{food.calories} ккал · {food.defaultGrams ?? 100} г · {formatUsageCountLabel(food.usageCount)}</span>
                          </div>
                        </button>
                        {selectedCount ? (
                          <div className={[styles.modalSearchAction, styles.modalSearchActionCounter].join(' ')}>
                            <span className={styles.modalInlineCounter}>
                              <button type="button" className={styles.modalInlineCounterButton} onClick={() => removeMealPortion(getFoodIdentity(food))} aria-label="Уменьшить количество">−</button>
                              <span className={styles.modalSearchCount}>{selectedCount}</span>
                              <button type="button" className={styles.modalInlineCounterButton} onClick={() => addFoodToMeal(food)} aria-label="Увеличить количество">+</button>
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={[styles.modalSearchAction, styles.modalSearchActionButton].join(' ')}
                            onClick={() => addFoodToMeal(food)}
                            aria-label={`Добавить ${food.name}`}
                          >
                            <PulseIcon name="plus" className={styles.modalInlineIcon} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!((foodSearchData?.items ?? []).length) && foodSearch.trim() ? <div className={styles.emptyText}>Ничего не найдено. Можно добавить свой продукт ниже.</div> : null}
                </div>
              </div>

              <div className={styles.modalInlineActions}>
                <button type="button" className={styles.modalSecondaryButton} onClick={() => setFoodModalOpen(true)}>Создать свой продукт</button>
              </div>

              <div className={[styles.modalBlock, styles.mealComposerPanel].join(' ')}>
                <div className={styles.mealComposerPanelHeader}>
                  <div className={styles.modalBlockTitle}>Что войдёт в приём пищи</div>
                  <span className={styles.mealComposerPanelMeta}>{groupedMealItems.length ? `${groupedMealItems.length} поз.` : 'Пусто'}</span>
                </div>
                <div className={styles.modalSelectionList}>
                  {groupedMealItems.map((group) => (
                    <div key={group.key} className={styles.modalSelectionRow}>
                      <div className={styles.modalSelectionCopy}>
                        <strong>{group.item.name}</strong>
                        <span>{group.totalGrams} г · {Math.round(group.totalCalories)} ккал</span>
                      </div>
                      <div className={styles.modalCounterGroup}>
                        <button type="button" className={styles.modalCounterButton} onClick={() => removeMealPortion(group.key)} aria-label="Уменьшить количество">−</button>
                        <span className={styles.modalCounterValue}>{group.count}</span>
                        <button type="button" className={styles.modalCounterButton} onClick={() => addMealPortion(group.item)} aria-label="Увеличить количество">+</button>
                      </div>
                    </div>
                  ))}
                  {!mealItems.length ? <div className={styles.emptyText}>Добавь хотя бы один продукт или блюдо.</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.mealComposerFooter}>
            <div className={styles.mealComposerTotal}>
              <span>Итого</span>
              <strong>{mealPreviewCalories} ккал</strong>
            </div>
            <div className={styles.modalActions}>
              <Button onClick={closeMealModal}>Отмена</Button>
              <Button variant="primary" onClick={handleMealSave} disabled={mealSaving || !mealItems.length} loading={mealSaving}>{editingMealId ? 'Сохранить' : 'Добавить'}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={foodModalOpen}
        onClose={() => {
          setFoodModalOpen(false);
          setCustomFoodSearch('');
          setCustomDishItems([]);
        }}
        title="Добавить своё блюдо"
        subtitle="Если готового продукта нет в базе, создай его и используй дальше повторно."
        icon={<PulseIcon name="meal" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название"><input placeholder="Например, Домашняя гранола" value={customFoodForm.name} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Ккал"><input value={customDishUsesComposition ? String(Math.round(customDishTotals.calories)) : customFoodForm.calories} readOnly={customDishUsesComposition} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, calories: e.target.value }))} /></Field>
            <Field label="Порция, г"><input value={customDishUsesComposition ? String(Math.round(customDishTotals.grams)) : customFoodForm.grams} readOnly={customDishUsesComposition} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, grams: e.target.value }))} /></Field>
            <Field label="Белки"><input value={customDishUsesComposition ? String(Number(customDishTotals.protein.toFixed(1))) : customFoodForm.protein} readOnly={customDishUsesComposition} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, protein: e.target.value }))} /></Field>
            <Field label="Жиры"><input value={customDishUsesComposition ? String(Number(customDishTotals.fat.toFixed(1))) : customFoodForm.fat} readOnly={customDishUsesComposition} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, fat: e.target.value }))} /></Field>
            <Field label="Углеводы"><input value={customDishUsesComposition ? String(Number(customDishTotals.carbs.toFixed(1))) : customFoodForm.carbs} readOnly={customDishUsesComposition} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, carbs: e.target.value }))} /></Field>
          </div>

          <div className={styles.modalOptionGrid}>
            <button type="button" className={[styles.modalOptionCard, customFoodForm.isDish ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setCustomFoodForm((prev) => ({ ...prev, isDish: !prev.isDish }))}>
              <PulseIcon name="meal" className={styles.modalOptionIcon} />
              <strong>Готовое блюдо</strong>
              <span>Добавлять как собранный приём пищи</span>
            </button>
            <button type="button" className={[styles.modalOptionCard, customFoodForm.isHealthy ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setCustomFoodForm((prev) => ({ ...prev, isHealthy: !prev.isHealthy }))}>
              <PulseIcon name="heart" className={styles.modalOptionIcon} />
              <strong>Полезный продукт</strong>
              <span>Учитывать в полезном балле питания</span>
            </button>
          </div>

          {customFoodForm.isDish ? (
            <div className={styles.modalBlock}>
              <div className={styles.modalBlockTitle}>Состав блюда</div>
              <Field label="Найти ингредиент"><input value={customFoodSearch} onChange={(e) => setCustomFoodSearch(e.target.value)} placeholder="Рис, курица, овощи..." /></Field>
              <div className={styles.modalSearchResults}>
                {(customFoodSearchData?.items ?? []).slice(0, 6).map((food) => {
                  const selectedCount = customDishItemCountMap.get(getFoodIdentity(food)) ?? 0;
                  return (
                  <button key={`dish-${food.id}`} type="button" className={styles.modalSearchRow} onClick={() => addFoodToCustomDish(food)}>
                    <div>
                      <strong>{food.name}</strong>
                      <span>{food.calories} ккал · {food.defaultGrams ?? 100} г</span>
                    </div>
                    <span className={styles.modalSearchAction}>
                      {selectedCount ? <span className={styles.modalSearchCount}>{selectedCount}x</span> : null}
                      <PulseIcon name="plus" className={styles.modalInlineIcon} />
                    </span>
                  </button>
                  );
                })}
              </div>
              <div className={styles.modalSelectionList}>
                {customDishItems.map((item, index) => (
                  <div key={`${item.name}-${index}`} className={styles.modalSelectionRow}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.grams} г · {item.calories} ккал</span>
                    </div>
                    <button type="button" className={styles.taskDeleteButton} onClick={() => setCustomDishItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>Убрать</button>
                  </div>
                ))}
                {!customDishItems.length ? <div className={styles.emptyText}>Добавь ингредиенты, и блюдо соберётся автоматически по КБЖУ.</div> : null}
              </div>
            </div>
          ) : null}

          <div className={styles.modalActions}>
            <Button onClick={() => {
              setFoodModalOpen(false);
              setCustomFoodSearch('');
              setCustomDishItems([]);
            }}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateFood} disabled={foodSaving} loading={foodSaving}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(taskDetailsItem)}
        onClose={() => setTaskDetailsItem(null)}
        title={taskDetailsItem?.title ?? 'Задача'}
        subtitle={taskDetailsItem?.dueDate ? formatLongDate(taskDetailsItem.dueDate) : formatLongDate(selectedDate)}
        icon={<PulseIcon name="check" className={styles.modalHeaderSvg} />}
        headerActions={taskDetailsItem ? (
          <>
            <button
              type="button"
              className={styles.modalHeaderBtn}
              onClick={() => {
                const taskToEdit = taskDetailsItem;
                setTaskDetailsItem(null);
                if (taskToEdit) openTaskEditModal(taskToEdit);
              }}
              aria-label="Редактировать"
            >
              <Pencil size={16} strokeWidth={1.8} />
            </button>
            <details className={styles.modalHeaderOverflow}>
              <summary className={styles.modalHeaderBtn} aria-label="Ещё">
                <Ellipsis size={16} strokeWidth={1.9} />
              </summary>
              <div className={styles.modalHeaderOverflowMenu}>
                <button
                  type="button"
                  className={styles.modalHeaderOverflowDanger}
                  onClick={() => {
                    const taskToDelete = taskDetailsItem;
                    setTaskDetailsItem(null);
                    if (taskToDelete) void deletePulseTask(taskToDelete.id);
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                  Удалить задачу
                </button>
              </div>
            </details>
          </>
        ) : undefined}
      >
        {taskDetailsItem ? (
          <div className={styles.modalStack}>
            <div className={styles.taskDetailsGrid}>
              <div className={styles.taskDetailsCard}>
                <span className={styles.taskDetailsLabel}>Статус</span>
                <strong>{getTaskStatusLabel(taskDetailsItem)}</strong>
                <span>{taskDetailsItem.completedForDate ? 'Задача уже отмечена выполненной на выбранный день.' : 'Задача ещё находится в работе.'}</span>
              </div>
              <div className={styles.taskDetailsCard}>
                <span className={styles.taskDetailsLabel}>Когда</span>
                <strong>{getTaskPrimaryTime(taskDetailsItem)}</strong>
                <span>{taskDetailsItem.dueDate ? formatLongDate(taskDetailsItem.dueDate) : 'На выбранный день'}</span>
              </div>
              <div className={styles.taskDetailsCard}>
                <span className={styles.taskDetailsLabel}>Тип</span>
                <strong>{getTaskTypeLabel(taskDetailsItem)}</strong>
                <span>{getTaskRepeatSummary(taskDetailsItem)}</span>
              </div>
              <div className={styles.taskDetailsCard}>
                <span className={styles.taskDetailsLabel}>Источник</span>
                <strong>{taskDetailsItem.programMeta?.title ?? taskDetailsItem.sourceEventTitle ?? 'Личная задача'}</strong>
                <span>{taskDetailsItem.programMeta ? 'Связана с программой.' : taskDetailsItem.sourceEventTitle ? 'Создана из события.' : 'Создана вручную.'}</span>
              </div>
            </div>

            <div className={styles.taskDetailsBody}>
              <div className={styles.taskDetailsSection}>
                <span className={styles.taskDetailsLabel}>Описание</span>
                <p>{taskDetailsItem.notes?.trim() || 'Описание пока не добавлено.'}</p>
              </div>
              {taskDetailsItem.tags?.length ? (
                <div className={styles.taskDetailsSection}>
                  <span className={styles.taskDetailsLabel}>Теги</span>
                  <div className={styles.taskDetailsTags}>
                    {taskDetailsItem.tags.map((tag) => (
                      <span key={tag} className={styles.taskDetailsTag}>{tag}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              variant="primary"
              className={styles.taskDetailsMainAction}
              onClick={() => {
                void togglePulseTaskDate({ taskId: taskDetailsItem.id, date: selectedDate });
                setTaskDetailsItem(null);
              }}
            >
              {taskDetailsItem.completedForDate ? 'Снять выполнение' : 'Отметить выполненной'}
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={taskModalOpen}
        onClose={closeTaskModal}
        title={taskEditingId ? 'Редактировать задачу' : 'Добавить задачу'}
        subtitle={taskEditingId ? 'Обновите поля и сохраните изменения.' : 'Время можно добавить сразу или оставить задачу без времени.'}
        icon={<PulseIcon name="check" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название задачи"><input placeholder="Что нужно сделать?" value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>

          {!taskEditingId ? (
            <div className={styles.modalChipRow}>
              {['Утренняя зарядка', 'Выпить воды', 'Прогулка', 'Медитация', 'Чтение'].map((template) => (
                <button key={template} type="button" className={styles.modalChip} onClick={() => setTaskForm((prev) => ({ ...prev, title: template }))}>
                  {template}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Тип задачи</div>
            <Segmented
              value={taskForm.taskType}
              onChange={(value) =>
                setTaskForm((prev) => ({
                  ...prev,
                  taskType: value as typeof prev.taskType,
                  scheduleType: value === 'REGULAR' ? (prev.scheduleType === 'NONE' ? 'WEEKLY' : prev.scheduleType) : 'NONE',
                }))}
              options={[
                { value: 'ONE_TIME', label: 'Один раз' },
                { value: 'REGULAR', label: 'Повтор' },
                { value: 'HABIT', label: 'Привычка' },
              ]}
            />
          </div>

          {taskForm.taskType === 'REGULAR' ? (
            <div className={styles.modalBlock}>
              <div className={styles.modalBlockTitle}>Как повторять</div>
              <Segmented value={taskForm.scheduleType} onChange={(value) => setTaskForm((prev) => ({ ...prev, scheduleType: value as any }))} options={[{ value: 'WEEKLY', label: 'По дням недели' }, { value: 'MONTHLY', label: 'По дням месяца' }]} />
              {taskForm.scheduleType === 'WEEKLY' ? <div className={styles.weekSelector}>{weekdayLabels.map((label, index) => <button key={label} type="button" className={[styles.weekMini, taskForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')} onClick={() => setTaskForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(index) ? prev.daysOfWeek.filter((item) => item !== index) : [...prev.daysOfWeek, index] }))}>{label}</button>)}</div> : null}
              {taskForm.scheduleType === 'MONTHLY' ? <Field label="Дни месяца через запятую"><input placeholder="Например, 1, 15, 28" value={taskForm.daysOfMonth.join(',')} onChange={(e) => setTaskForm((prev) => ({ ...prev, daysOfMonth: e.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0 && item < 32) }))} /></Field> : null}
            </div>
          ) : null}

          <div className={styles.taskQuickAddBlock}>
            <div className={styles.taskQuickAddBlockTitle}>Когда</div>
            <div className={styles.inlineFields}>
              <Field label="Дата"><input type="date" value={taskForm.date} onChange={(e) => setTaskForm((prev) => ({ ...prev, date: e.target.value }))} /></Field>
              <Field label="Время">
                <input
                  type="time"
                  value={taskForm.time}
                  placeholder="Без времени"
                  onChange={(e) =>
                    setTaskForm((prev) =>
                      normalizeTaskDraft({
                        ...prev,
                        time: e.target.value,
                        endTime: e.target.value && prev.hasEndTime
                          ? (prev.endTime || addMinutesToTime(e.target.value))
                          : prev.endTime,
                      }))}
                />
              </Field>
              {taskForm.time ? (
                <Field label="Окончание">
                  <input
                    type="time"
                    value={taskForm.endTime}
                    min={taskForm.time || undefined}
                    placeholder="Необязательно"
                    onChange={(e) => setTaskForm((prev) => normalizeTaskDraft({ ...prev, endTime: e.target.value, hasEndTime: Boolean(e.target.value) }))}
                  />
                </Field>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={[styles.accordionToggle, taskAdvancedOpen ? styles.accordionToggleOpen : ''].filter(Boolean).join(' ')}
            onClick={() => setTaskAdvancedOpen((prev) => !prev)}
          >
            <ChevronDown size={14} />
            Дополнительно
          </button>
          {taskAdvancedOpen ? (
            <Field label="Описание"><textarea rows={3} placeholder="Добавьте детали, чтобы задача была понятнее" value={taskForm.notes} onChange={(e) => setTaskForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>
          ) : null}

          <div className={styles.modalActions}>
            <Button onClick={closeTaskModal}>Отмена</Button>
            <Button variant="primary" onClick={handleSaveTask} disabled={taskSaving || !canSubmitTaskDraft(taskForm)} loading={taskSaving}>
              {taskEditingId ? 'Сохранить изменения' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="Добавить глобальную цель"
        subtitle="Разбей большую цель на небольшие шаги — так прогресс будет считаться автоматически."
        icon={<PulseIcon name="target" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название цели"><input placeholder="Например, Подготовиться к марафону" value={globalGoalForm.title} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <Field label="Краткое описание"><textarea rows={3} placeholder="Зачем эта цель важна и что будет результатом" value={globalGoalForm.description} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, description: e.target.value }))} /></Field>
          <Field label="Подзадачи (каждая с новой строки)"><textarea rows={5} placeholder={`Например:
Составить план
Купить абонемент
Сделать 3 тренировки`} value={globalGoalForm.subtasks} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, subtasks: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Целевая дата"><input type="date" value={globalGoalForm.targetDate} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, targetDate: e.target.value }))} /></Field>
            <Field label="Стартовый прогресс, %"><input value={globalGoalForm.progress} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, progress: e.target.value }))} disabled={Boolean(globalGoalForm.subtasks.trim())} /></Field>
          </div>
          {globalGoalForm.subtasks.trim() ? <div className={styles.goalEmptyHint}>Подзадачи добавлены — прогресс будет считаться автоматически.</div> : null}
          <div className={styles.modalActions}>
            <Button onClick={() => setGoalModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateGoal} disabled={pulseGoalSaving || !globalGoalForm.title.trim()} loading={pulseGoalSaving}>Добавить цель</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryModalOpen}
        onClose={() => { setCategoryModalOpen(false); setActiveFinanceCategoryId(null); }}
        title={activeFinanceCategory ? activeFinanceCategory.name : 'Добавить категорию'}
        subtitle={activeFinanceCategory ? 'Здесь можно поправить лимит и быстро редактировать расходы категории.' : 'Отдельные категории помогают не терять структуру расходов и доходов.'}
        icon={<PulseIcon name="wallet" className={styles.modalHeaderSvg} />}
        size="lg"
      >
        <div className={styles.modalStack}>
          <div className={styles.compactGrid}>
            <Field label="Название категории"><input placeholder="Например, Подписки или Подарки" value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
            <Field label="Месячный лимит, ₽"><input placeholder="0" value={categoryForm.limitAmount} onChange={(e) => setCategoryForm((prev) => ({ ...prev, limitAmount: e.target.value }))} /></Field>
          </div>

          {activeFinanceCategory ? (
            <div className={styles.modalBlock}>
              <div className={styles.modalBlockTitle}>Расходы в категории</div>
              <div className={styles.financeEntryList}>
                {activeFinanceCategoryEntries.map((entry) => (
                  <FinanceEntryCompactRow
                    key={entry.id}
                    entry={entry}
                    onEdit={(targetEntry) => { setCategoryModalOpen(false); openFinanceEntryEditor(targetEntry); }}
                    onDelete={deleteFinanceEntry}
                  />
                ))}
                {!activeFinanceCategoryEntries.length ? <div className={styles.emptyText}>В этой категории пока нет расходов.</div> : null}
              </div>
            </div>
          ) : null}

          <div className={styles.modalActions}>
            <Button onClick={() => { setCategoryModalOpen(false); setActiveFinanceCategoryId(null); }}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateCategory} disabled={(categorySaving || categoryUpdating) || !categoryForm.name.trim()} loading={categorySaving || categoryUpdating}>{activeFinanceCategory ? 'Сохранить изменения' : 'Сохранить'}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={financeModalOpen}
        onClose={() => setFinanceModalOpen(false)}
        title={editingFinanceEntryId ? (financeForm.type === 'INCOME' ? 'Редактировать доход' : 'Редактировать расход') : (financeForm.type === 'INCOME' ? 'Добавить доход' : 'Добавить расход')}
        subtitle="Запиши движение денег в удобном компактном формате и при необходимости сразу отметь регулярность."
        icon={<PulseIcon name="wallet" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Сумма"><input placeholder="0" value={financeForm.amount} onChange={(e) => setFinanceForm((prev) => ({ ...prev, amount: e.target.value }))} /></Field>
          <Field label="Название"><input placeholder={financeForm.type === 'INCOME' ? 'Например, Зарплата' : 'Например, Обед в кафе'} value={financeForm.title} onChange={(e) => setFinanceForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Тип записи</div>
            <div className={styles.modalOptionGridWide}>
              <button type="button" className={[styles.modalOptionCard, financeForm.type === 'EXPENSE' ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, type: 'EXPENSE' }))}>
                <PulseIcon name="wallet" className={styles.modalOptionIcon} />
                <strong>Расход</strong>
                <span>Траты, подписки, обязательные платежи</span>
              </button>
              <button type="button" className={[styles.modalOptionCard, financeForm.type === 'INCOME' ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, type: 'INCOME' }))}>
                <PulseIcon name="trend" className={styles.modalOptionIcon} />
                <strong>Доход</strong>
                <span>Зарплата, премии, подарки, любые поступления</span>
              </button>
            </div>
          </div>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Категория</div>
            <div className={styles.financeModalCategoryGrid}>
              {(financeData?.categories ?? []).map((category) => {
                const meta = getFinanceCategoryMeta(category.name);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={[styles.financeModalCategoryCard, financeForm.categoryId === category.id ? styles.financeModalCategoryCardActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setFinanceForm((prev) => ({ ...prev, categoryId: category.id }))}
                  >
                    <span className={[styles.financeEntryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                      <PulseIcon name={meta.icon} className={styles.financeEntryIcon} />
                    </span>
                    <span>{category.name}</span>
                  </button>
                );
              })}
              <button type="button" className={styles.financeModalCategoryCard} onClick={() => setCategoryModalOpen(true)}>
                <span className={[styles.financeEntryIconWrap, styles.financeToneBlue].join(' ')}><PulseIcon name="plus" className={styles.financeEntryIcon} /></span>
                <span>Новая категория</span>
              </button>
              <button type="button" className={[styles.financeModalCategoryCard, !financeForm.categoryId ? styles.financeModalCategoryCardActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, categoryId: '' }))}>
                <span className={[styles.financeEntryIconWrap, styles.financeToneOrange].join(' ')}><PulseIcon name="spark" className={styles.financeEntryIcon} /></span>
                <span>Другое</span>
              </button>
            </div>
          </div>

          <Field label="Описание (необязательно)"><textarea rows={3} placeholder="Коротко о платеже или поступлении" value={financeForm.notes} onChange={(e) => setFinanceForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Повторение</div>
            <button type="button" className={[styles.modalOptionCard, financeForm.recurring ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, recurring: !prev.recurring }))}>
              <PulseIcon name="calendar" className={styles.modalOptionIcon} />
              <strong>{financeForm.recurring ? 'Регулярный платёж включён' : 'Отметить как регулярный платёж'}</strong>
              <span>Подходит для подписок, кредитов, коммуналки и повторяющихся доходов.</span>
            </button>
          </div>

          {financeForm.recurring ? (
            <div className={styles.modalBlock}>
              <div className={styles.modalBlockTitle}>Как повторять</div>
              <Segmented value={financeForm.scheduleType} onChange={(value) => setFinanceForm((prev) => ({ ...prev, scheduleType: value as any }))} options={[{ value: 'MONTHLY', label: 'Ежемесячно' }, { value: 'WEEKLY', label: 'Еженедельно' }]} />
              {financeForm.scheduleType === 'MONTHLY' ? <Field label="Числа месяца"><input placeholder="Например, 1, 15" value={financeForm.daysOfMonth.join(',')} onChange={(e) => setFinanceForm((prev) => ({ ...prev, daysOfMonth: e.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0 && item < 32) }))} /></Field> : null}
              {financeForm.scheduleType === 'WEEKLY' ? <div className={styles.weekSelector}>{weekdayLabels.map((label, index) => <button key={label} type="button" className={[styles.weekMini, financeForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(index) ? prev.daysOfWeek.filter((item) => item !== index) : [...prev.daysOfWeek, index] }))}>{label}</button>)}</div> : null}
            </div>
          ) : null}

          <div className={styles.modalActions}>
            <Button onClick={() => { setFinanceModalOpen(false); resetFinanceEntryForm(financeForm.type as 'EXPENSE' | 'INCOME'); }}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateFinanceEntry} disabled={financeEntryModalBusy || !financeForm.title.trim() || !financeForm.amount.trim()} loading={financeEntryModalBusy}>{editingFinanceEntryId ? 'Сохранить' : 'Добавить'}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={savingsModalOpen}
        onClose={() => setSavingsModalOpen(false)}
        title="Добавить цель накопления"
        subtitle="Собери цель, сумму и этапы — тогда прогресс будет понятен сразу визуально."
        icon={<PulseIcon name="target" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название цели"><input placeholder="Например, Новый MacBook" value={savingsForm.title} onChange={(e) => setSavingsForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Цель, ₽"><input placeholder="0" value={savingsForm.targetAmount} onChange={(e) => setSavingsForm((prev) => ({ ...prev, targetAmount: e.target.value }))} /></Field>
            <Field label="Уже накоплено, ₽"><input placeholder="0" value={savingsForm.savedAmount} onChange={(e) => setSavingsForm((prev) => ({ ...prev, savedAmount: e.target.value }))} /></Field>
            <Field label="Дедлайн"><input type="date" value={savingsForm.deadline} onChange={(e) => setSavingsForm((prev) => ({ ...prev, deadline: e.target.value }))} /></Field>
          </div>
          <Field label="Подпункты (каждый с новой строки: название - сумма)"><textarea rows={5} placeholder={`Например:
Ноутбук - 120000
Чехол - 5000
Мышь - 7000`} value={savingsForm.items} onChange={(e) => setSavingsForm((prev) => ({ ...prev, items: e.target.value }))} /></Field>
          <div className={styles.modalActions}>
            <Button onClick={() => setSavingsModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateSavingsGoal} disabled={savingsSaving || !savingsForm.title.trim()} loading={savingsSaving}>Добавить цель</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={savingsContributionModalOpen}
        onClose={() => setSavingsContributionModalOpen(false)}
        title="Пополнить накопление"
        subtitle={activeSavingsGoal ? `Сумма попадёт в цель «${activeSavingsGoal.title}» и одновременно будет записана как расход.` : 'Пополнение накопления отражается и в цели, и в расходах — так баланс всегда сходится.'}
        icon={<PulseIcon name="target" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          {activeSavingsGoal ? (
            <div className={styles.financeDebtPaymentSummary}>
              <div>
                <span>Сейчас накоплено</span>
                <strong>{formatMoney(activeSavingsGoal.savedAmount)}</strong>
              </div>
              <div>
                <span>До цели осталось</span>
                <strong>{formatMoney(activeSavingsGoal.remaining)}</strong>
              </div>
            </div>
          ) : null}
          <Field label="Сумма пополнения"><input placeholder="0" value={savingsContributionForm.amount} onChange={(e) => setSavingsContributionForm((prev) => ({ ...prev, amount: e.target.value }))} /></Field>
          <Field label="Комментарий (необязательно)"><textarea rows={3} placeholder="Например, перевёл часть зарплаты в накопления." value={savingsContributionForm.note} onChange={(e) => setSavingsContributionForm((prev) => ({ ...prev, note: e.target.value }))} /></Field>
          {activeSavingsGoal ? <div className={styles.goalEmptyHint}>После сохранения в цели будет {formatMoney(activeSavingsGoal.savedAmount + (num(savingsContributionForm.amount) ?? 0))}.</div> : null}
          <div className={styles.modalActions}>
            <Button onClick={() => setSavingsContributionModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleApplySavingsContribution} disabled={savingsUpdating || !(num(savingsContributionForm.amount) ?? 0)} loading={savingsUpdating}>Сохранить пополнение</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={debtModalOpen}
        onClose={() => setDebtModalOpen(false)}
        title="Добавить кредит / долг"
        subtitle="Подберите удобный сценарий. Для личного долга не нужно заполнять банковские поля, а для кредита можно сразу настроить график платежей."
        icon={<PulseIcon name="card" className={styles.modalHeaderSvg} />}
        size="lg"
      >
        <div className={styles.modalStack}>
          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Сценарий</div>
            <div className={styles.modalOptionGridWide}>
              {debtScenarioOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={[styles.modalOptionCard, debtScenario === option.key ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setDebtScenario(option.key)}
                >
                  <PulseIcon name={option.icon} className={styles.modalOptionIcon} />
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Название"><input placeholder={selectedDebtScenario.titlePlaceholder} value={debtForm.title} onChange={(e) => setDebtForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>

          <div className={styles.compactGrid}>
            <Field label="Общая сумма"><input placeholder="0" value={debtForm.totalAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, totalAmount: e.target.value }))} /></Field>
            <Field label="Уже выплачено"><input placeholder="0" value={debtForm.paidAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, paidAmount: e.target.value }))} /></Field>
            <Field label="Дата старта"><input type="date" value={debtForm.startedAt} onChange={(e) => setDebtForm((prev) => ({ ...prev, startedAt: e.target.value }))} /></Field>
            <Field label={debtHasSchedule ? 'Следующий платёж' : 'Крайний срок'}><input type="date" value={debtForm.dueDate} onChange={(e) => setDebtForm((prev) => ({ ...prev, dueDate: e.target.value, paymentDay: e.target.value ? String((parseDate(e.target.value) ?? new Date()).getDate()) : prev.paymentDay }))} /></Field>
            {selectedDebtScenario.requiresInterest ? <Field label="Ставка, %"><input placeholder="0" value={debtForm.interestRate} onChange={(e) => setDebtForm((prev) => ({ ...prev, interestRate: e.target.value }))} /></Field> : null}
            {selectedDebtScenario.requiresTerm ? <Field label="Срок, мес."><input placeholder="0" value={debtForm.termMonths} onChange={(e) => setDebtForm((prev) => ({ ...prev, termMonths: e.target.value }))} /></Field> : null}
          </div>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>График погашения</div>
            <button type="button" className={[styles.modalOptionCard, debtHasSchedule ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')} onClick={() => setDebtHasSchedule((prev) => !prev)}>
              <PulseIcon name="calendar" className={styles.modalOptionIcon} />
              <strong>{debtHasSchedule ? 'Есть регулярный платёж' : 'Без фиксированного графика'}</strong>
              <span>{debtHasSchedule ? 'Pulse напомнит о дне оплаты и покажет плановый взнос.' : 'Подойдёт для личного долга, который хотите закрывать в свободном темпе.'}</span>
            </button>
          </div>

          {debtHasSchedule ? (
            <div className={styles.compactGrid}>
              <Field label="Плановый платёж"><input placeholder="0" value={debtForm.paymentAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, paymentAmount: e.target.value }))} /></Field>
              <Field label="День списания"><input placeholder="Определится из даты следующего платежа" value={debtForm.paymentDay} readOnly /></Field>
            </div>
          ) : null}

          <div className={styles.goalEmptyHint}>После создания вы сможете вносить платежи отдельной кнопкой прямо из карточки долга. Можно платить больше планового — остаток пересчитается автоматически.</div>
          <Field label="Комментарий"><textarea rows={3} placeholder={selectedDebtScenario.key === 'PERSONAL' ? 'Например, кому должны, за что и до какого срока хотите закрыть.' : 'Например, банк, условия, страховка, важные напоминания.'} value={debtForm.notes} onChange={(e) => setDebtForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>
          <div className={styles.modalActions}>
            <Button onClick={() => setDebtModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateDebt} disabled={debtSaving || !debtForm.title.trim() || !debtForm.totalAmount.trim()} loading={debtSaving}>Добавить долг</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={debtPaymentModalOpen}
        onClose={() => setDebtPaymentModalOpen(false)}
        title="Внести платёж"
        subtitle={activeDebt ? `Обновим остаток по «${activeDebt.title}» без лишней ручной правки.` : 'Запишите платёж, чтобы остаток и прогресс пересчитались автоматически.'}
        icon={<PulseIcon name="card" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          {activeDebt ? (
            <div className={styles.financeDebtPaymentSummary}>
              <div>
                <span>Текущий остаток</span>
                <strong>{formatMoney(activeDebt.remaining)}</strong>
              </div>
              <div>
                <span>Плановый платёж</span>
                <strong>{formatMoney(activeDebt.paymentAmount ?? 0)}</strong>
              </div>
            </div>
          ) : null}
          <Field label="Сумма платежа"><input placeholder="0" value={debtPaymentForm.amount} onChange={(e) => setDebtPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} /></Field>
          <Field label="Комментарий (необязательно)"><textarea rows={3} placeholder="Например, досрочно закрыл часть кредита или перевёл больше планового." value={debtPaymentForm.note} onChange={(e) => setDebtPaymentForm((prev) => ({ ...prev, note: e.target.value }))} /></Field>
          {activeDebt ? <div className={styles.goalEmptyHint}>После сохранения выплаченная сумма станет {formatMoney(Math.min(activeDebt.totalAmount, activeDebt.paidAmount + (num(debtPaymentForm.amount) ?? 0)))}.</div> : null}
          <div className={styles.modalActions}>
            <Button onClick={() => setDebtPaymentModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleApplyDebtPayment} disabled={debtUpdating || !(num(debtPaymentForm.amount) ?? 0)} loading={debtUpdating}>Сохранить платёж</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
