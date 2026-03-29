'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
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
  useGetFinanceOverviewQuery,
  useGetMentalDayQuery,
  useGetNutritionQuery,
  useGetOverviewQuery,
  useGetProfileQuery,
  useGetTasksDayQuery,
  useSaveMentalDayMutation,
  useSearchFoodsQuery,
  useTogglePulseTaskDateMutation,
  useUpdateConfigMutation,
  useUpdateDebtMutation,
  useUpdateNutritionGoalMutation,
  useUpdateProfileMutation,
  useUpdatePulseGoalMutation,
  useUpdateSavingsGoalMutation,
} from '@/shared/api/pulseApi';
import type { PulseMealItem, PulseTaskGoal } from '@/shared/types/pulse';

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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

function formatShortDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(parsed);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value ?? 0);
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

function shiftDate(value: string, delta: number) {
  const date = parseDate(value) ?? new Date();
  date.setDate(date.getDate() + delta);
  return fmtDate(date);
}

function getDayOfMonthOrToday(value?: string | Date | null) {
  return (parseDate(value) ?? new Date()).getDate();
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


function getWeightGoalSummary(current: number | null | undefined, target: number | null | undefined) {
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

function TinyLineChart({
  items,
  keyProp,
  secondaryKey,
}: {
  items: Array<Record<string, number | string | null>>;
  keyProp: string;
  secondaryKey?: string;
}) {
  if (!items.length) {
    return <div className={styles.emptyText}>Пока мало данных для графика</div>;
  }

  const chartData = items.map((item, index) => ({
    index,
    label: item.date ? formatChartTick(String(item.date)) : String(item.label ?? index + 1),
    primary: Number(item[keyProp] ?? 0),
    secondary: secondaryKey ? Number(item[secondaryKey] ?? 0) : null,
  }));

  return (
    <div className={styles.chartCard}>
      <div className={styles.rechartsCardShell}>
        <ResponsiveContainer width="100%" height={236}>
          <AreaChart data={chartData} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="pulsePrimaryArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9a2f" stopOpacity={0.36} />
                <stop offset="100%" stopColor="#ff9a2f" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pulseSecondaryArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2fd37b" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2fd37b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.64)', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.54)', fontSize: 12 }} tickFormatter={(value) => `${Math.round(Number(value))}`} width={40} />
            <RechartsTooltip
              cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
              contentStyle={{ background: '#0f141c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff' }}
              formatter={(value: number, _name: string, item: any) => [Math.round(value).toString(), item.dataKey === 'secondary' ? 'Базовая линия' : 'Значение']}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />
            {secondaryKey ? <Area type="monotone" dataKey="secondary" stroke="#2fd37b" fill="url(#pulseSecondaryArea)" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} /> : null}
            <Area type="monotone" dataKey="primary" stroke="#ff9a2f" fill="url(#pulsePrimaryArea)" strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type FinanceTrendPoint = {
  label: string;
  income: number;
  expense: number;
};

type FinanceCompositionItem = {
  key: string;
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'accent' | 'neutral';
};

function FinanceTrendChart({ items }: { items: FinanceTrendPoint[] }) {
  if (!items.length) {
    return <div className={styles.emptyText}>Статистика появится после первых операций за выбранный период.</div>;
  }

  const chartData = items.map((item) => ({
    ...item,
    expenseDisplay: item.expense > 0 ? -item.expense : 0,
  }));

  return (
    <div className={styles.financeTrendChart}>
      <div className={styles.rechartsCardShell}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barGap={10} margin={{ top: 16, right: 12, left: -6, bottom: 12 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.64)', fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,0.46)', fontSize: 11 }} tickFormatter={(value) => formatMoneyCompact(Math.abs(Number(value)))} width={58} />
            <RechartsTooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#0f141c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff' }}
              formatter={(value: number, name: string) => [formatMoney(Math.abs(value)), name === 'expenseDisplay' ? 'Расход' : 'Доход']}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />
            <Bar dataKey="income" name="Доход" radius={[8, 8, 0, 0]} fill="#1fdd80" />
            <Bar dataKey="expenseDisplay" name="Расход" radius={[8, 8, 0, 0]} fill="#ff6b73" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.financeChartHint}>Зелёные столбцы показывают поступления, красные — отток денег по выбранным операциям.</div>
    </div>
  );
}

function FinanceCompositionChart({ items }: { items: FinanceCompositionItem[] }) {
  const chartData = items.filter((item) => item.value > 0).map((item) => ({
    ...item,
    color: item.tone === 'income' ? '#1fdd80' : item.tone === 'expense' ? '#ff6b73' : item.tone === 'accent' ? '#ff9a2f' : '#63a5ff',
  }));

  if (!chartData.length) {
    return <div className={styles.emptyText}>Когда появятся реальные данные, здесь будет понятно, на что уходит и откуда приходит основная часть денег.</div>;
  }

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={styles.financeCompositionChart}>
      <div className={styles.financeCompositionDonut}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={64} outerRadius={94} paddingAngle={3} stroke="rgba(10,10,12,0.92)">
              {chartData.map((item) => <Cell key={item.key} fill={item.color} />)}
            </Pie>
            <RechartsTooltip
              contentStyle={{ background: '#0f141c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: '#fff' }}
              formatter={(value: number, _name: string, item: any) => [formatMoney(value), item.payload.label]}
              labelStyle={{ display: 'none' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.financeCompositionCenter}>
          <strong>{formatMoneyCompact(total)}</strong>
          <span>Общий поток</span>
        </div>
      </div>
      <div className={styles.financeCompositionLegend}>
        {chartData.map((item) => (
          <div key={item.key} className={styles.financeCompositionLegendRow}>
            <span className={styles.financeCompositionLegendLead}><i style={{ background: item.color }} />{item.label}</span>
            <div className={styles.financeCompositionLegendMeta}>
              <strong>{formatMoney(item.value)}</strong>
              <span>{Math.round((item.value / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value?: string; key?: string; label: string }>;
}) {
  const normalizedOptions = options
    .map((option) => ({
      value: option.value ?? option.key ?? '',
      label: option.label,
    }))
    .filter((option) => option.value);
  const optionValues = normalizedOptions.map((option) => option.value).join('|');
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const activeIndex = normalizedOptions.findIndex((option) => option.value === value);
    if (activeIndex < 0) return;

    const node = buttonRefs.current[activeIndex];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [optionValues, value]);

  return (
    <div className={styles.segmented} role="tablist" aria-orientation="horizontal">
      {normalizedOptions.map((option, index) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            data-state={isActive ? 'active' : 'inactive'}
            className={[styles.segment, isActive ? styles.segmentActive : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type PulseIconName =
  | 'pulse'
  | 'ruler'
  | 'scale'
  | 'calendar'
  | 'target'
  | 'trend'
  | 'flame'
  | 'check'
  | 'card'
  | 'spark'
  | 'meal'
  | 'wallet'
  | 'heart'
  | 'arrow'
  | 'brain'
  | 'moon'
  | 'bolt'
  | 'warning'
  | 'activity'
  | 'wine'
  | 'coffee'
  | 'info'
  | 'plus'
  | 'trash'
  | 'pencil'
  | 'alert'
  | 'walk'
  | 'utensils'
  | 'gear';

function PulseIcon({ name, className = '' }: { name: PulseIconName; className?: string }) {
  const cn = [styles.icon, className].filter(Boolean).join(' ');

  switch (name) {
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M3 12h4l2.2-5 3.3 10 2.2-5H21" />
        </svg>
      );
    case 'ruler':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 16 16 4a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L8 20H4v-4Z" />
          <path d="M13 7l4 4" />
          <path d="M10 10l1.5 1.5" />
        </svg>
      );
    case 'scale':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 4v15" />
          <path d="M5 7h14" />
          <path d="m5 7-3 6h6L5 7Z" />
          <path d="m19 7-3 6h6l-3-6Z" />
          <path d="M7 19h10" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M7 3v3" />
          <path d="M17 3v3" />
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16" />
        </svg>
      );
    case 'target':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'trend':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 16l5-5 4 4 7-8" />
          <path d="M15 7h5v5" />
        </svg>
      );
    case 'flame':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 3c1.2 2.1 4 4.5 4 8a4 4 0 1 1-8 0c0-2 1.1-3.6 2.4-5.2.9-1 1.4-1.8 1.6-2.8Z" />
          <path d="M12 12c.9 1 1.8 2 1.8 3.2A1.8 1.8 0 1 1 10.2 15c0-.8.4-1.6 1.8-3Z" />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 12 2.3 2.3 4.7-4.8" />
        </svg>
      );
    case 'card':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="m13 2-2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
        </svg>
      );
    case 'meal':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M6 4v7" />
          <path d="M9 4v7" />
          <path d="M6 8h3" />
          <path d="M8 11v9" />
          <path d="M15 4v8c0 1.2.8 2 2 2h1v6" />
          <path d="M18 4v16" />
        </svg>
      );
    case 'wallet':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v2H7a3 3 0 0 0 0 6h13v3a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 15.5v-8Z" />
          <path d="M20 9H7a2 2 0 0 0 0 4h13" />
          <circle cx="16.5" cy="11" r=".8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 20s-6-3.6-8.1-7A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8.1 6c-2.1 3.4-8.1 7-8.1 7Z" />
        </svg>
      );
    case 'brain':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M9.5 5.5a3 3 0 0 0-5 2.3 3 3 0 0 0 1 5.7A3.5 3.5 0 0 0 9 19h1v-4H8.8" />
          <path d="M14.5 5.5a3 3 0 0 1 5 2.3 3 3 0 0 1-1 5.7A3.5 3.5 0 0 1 15 19h-1v-4h1.2" />
          <path d="M10 7.5a2.5 2.5 0 0 0-4 2" />
          <path d="M14 7.5a2.5 2.5 0 0 1 4 2" />
          <path d="M10 12H8" />
          <path d="M16 12h-2" />
          <path d="M12 5v14" />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6.2 6.2 0 0 0 9.5 9.5Z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
        </svg>
      );
    case 'alert':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="m12 4 8 14H4l8-14Z" />
          <path d="M12 9v4" />
          <path d="M12 16h.01" />
        </svg>
      );
    case 'walk':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="13.5" cy="4.5" r="1.5" />
          <path d="M11.5 8.5 9 12l-3.5 2" />
          <path d="m11.5 8.5 2.5 2.5 3 1" />
          <path d="m10 13-1 6" />
          <path d="m14 11 1.5 8" />
        </svg>
      );
    case 'coffee':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M6 8h9v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8Z" />
          <path d="M15 10h1.5a2.5 2.5 0 0 1 0 5H15" />
          <path d="M8 3v2" />
          <path d="M12 3v2" />
        </svg>
      );
    case 'info':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 11v4" />
          <path d="M12 8h.01" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'trash':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M6 7l1 12h10l1-12" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case 'utensils':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M6 4v7" />
          <path d="M9 4v7" />
          <path d="M6 8h3" />
          <path d="M8 11v9" />
          <path d="M15 4v8c0 1.2.8 2 2 2h1v6" />
          <path d="M18 4v16" />
        </svg>
      );
    case 'gear':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6Z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );

    case 'brain':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M9 4.5a3 3 0 0 0-3 3V8a3 3 0 0 0-2 2.8A3 3 0 0 0 6.7 14 3 3 0 0 0 9 19h1v-5H9.2" />
          <path d="M15 4.5a3 3 0 0 1 3 3V8a3 3 0 0 1 2 2.8 3 3 0 0 1-2.7 3.2A3 3 0 0 1 15 19h-1v-5h.8" />
          <path d="M10 6.5v11" />
          <path d="M14 6.5v11" />
          <path d="M9.5 9.5c.4.6 1.1 1 2 1s1.6-.4 2-1" />
          <path d="M9.5 14.5c.4-.6 1.1-1 2-1s1.6.4 2 1" />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M19 13.8A7 7 0 1 1 10.2 5a6 6 0 0 0 8.8 8.8Z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="m13 2-7 11h5l-1 9 8-12h-5l0-8Z" />
        </svg>
      );
    case 'warning':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 4 3.5 19h17L12 4Z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'activity':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="17" cy="5" r="1.5" />
          <path d="M12 7 9 11l-3 2" />
          <path d="m13 6 3 3 3 1" />
          <path d="m10 12 2 3-1 5" />
          <path d="m13 12-2 3" />
        </svg>
      );
    case 'wine':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
          <path d="M12 12v7" />
          <path d="M9 19h6" />
        </svg>
      );
    case 'coffee':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
          <path d="M16 10h1.5A2.5 2.5 0 0 1 20 12.5v0A2.5 2.5 0 0 1 17.5 15H16" />
          <path d="M8 4v2" />
          <path d="M12 4v2" />
        </svg>
      );
    case 'info':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <path d="M12 7h.01" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'trash':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="m7 7-.6 10H8.6L8 7" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      );
    case 'pencil':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={cn} aria-hidden="true">
          <path d="M4 20h4l10-10a2.1 2.1 0 0 0-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      );
  }
}

function MiniRing({
  value,
  tone = 'accent',
  size = 64,
  stroke = 6,
}: {
  value: number;
  tone?: 'accent' | 'success';
  size?: number;
  stroke?: number;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);
  const strokeColor = tone === 'success' ? 'var(--success)' : 'var(--accent)';

  return (
    <div className={styles.miniRing} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className={styles.miniRingTrack} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={styles.miniRingProgress}
        />
      </svg>
      <span style={{ fontSize: Math.max(12, Math.round(size * 0.23)) }}>{safe}</span>
    </div>
  );
}


function SliderCard({
  title,
  icon,
  value,
  display,
  min,
  max,
  step = 1,
  helper,
  onChange,
}: {
  title: string;
  icon: PulseIconName;
  value: string;
  display: string;
  min: number;
  max: number;
  step?: number;
  helper?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.sliderCard}>
      <div className={styles.sliderCardHead}>
        <div className={styles.sliderCardLabel}>
          <PulseIcon name={icon} className={styles.sliderCardIcon} />
          <span>{title}</span>
        </div>
        <strong>{display}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={styles.sliderInput}
        style={{ ['--slider-progress' as any]: `${Math.max(0, Math.min(100, ((Number(value) - min) / Math.max(max - min, 1)) * 100))}%` }}
      />
      {helper ? <div className={styles.sliderHelper}>{helper}</div> : null}
    </div>
  );
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

type SummaryCard = {
  key: string;
  icon: PulseIconName;
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
  tone?: 'accent' | 'success' | 'danger' | 'neutral' | 'goal';
};


function HealthSlider({
  icon,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
  helper,
  asideLabel,
  tone = 'accent',
}: {
  icon: PulseIconName;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  helper?: string;
  asideLabel?: string;
  tone?: 'accent' | 'success' | 'info' | 'danger' | 'purple' | 'warning';
}) {
  const numericValue = Number(value || min);
  const percent = ((numericValue - min) / Math.max(max - min, 1)) * 100;
  const toneClassMap = {
    accent: styles.healthMiniIconAccent,
    success: styles.healthMiniIconSuccess,
    info: styles.healthMiniIconInfo,
    danger: styles.healthMiniIconDanger,
    purple: styles.healthMiniIconPurple,
    warning: styles.healthMiniIconAccent,
  };

  return (
    <div className={styles.healthSliderCard}>
      <div className={styles.healthSliderHead}>
        <div className={styles.healthSliderTitle}>
          <span className={[styles.healthMiniIcon, toneClassMap[tone]].filter(Boolean).join(' ')}>
            <PulseIcon name={icon} className={styles.healthMiniSvg} />
          </span>
          <span>{label}</span>
        </div>
        <div className={styles.healthSliderValueWrap}>
          {asideLabel ? <span>{asideLabel}</span> : null}
          <strong>{value || min}{suffix}</strong>
        </div>
      </div>
      <div className={styles.healthRangeWrap}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value || String(min)}
          onChange={(event) => onChange(event.target.value)}
          className={styles.healthRange}
          style={{ ['--range-progress' as any]: `${percent}%` }}
        />
      </div>
      {helper ? <div className={styles.healthSliderHelper}>{helper}</div> : null}
    </div>
  );
}

function formatTimeLabel(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

export default function HealthPage() {

  const today = useMemo(() => fmtDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [mainTab, setMainTab] = useState<'pulse' | 'health' | 'tasks' | 'finance' | 'analytics' | 'config'>('pulse');
  const [healthSubTab, setHealthSubTab] = useState<'mental' | 'nutrition'>('mental');
  const [financeSubTab, setFinanceSubTab] = useState<'expenses' | 'income' | 'savings' | 'stats'>('expenses');
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const weekButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [showNutritionGoalEditor, setShowNutritionGoalEditor] = useState(false);

  const { data: overviewData } = useGetOverviewQuery(selectedDate);
  const { data: profileData } = useGetProfileQuery();
  const { data: mentalData } = useGetMentalDayQuery(selectedDate);
  const { data: nutritionData } = useGetNutritionQuery(selectedDate);
  const { data: tasksData } = useGetTasksDayQuery(selectedDate);
  const { data: financeData } = useGetFinanceOverviewQuery(selectedDate);
  const { data: analyticsData } = useGetAnalyticsQuery(7);

  const [updateProfile, { isLoading: profileSaving }] = useUpdateProfileMutation();
  const [updateConfig, { isLoading: configSaving }] = useUpdateConfigMutation();
  const [saveMentalDay, { isLoading: mentalSaving }] = useSaveMentalDayMutation();
  const [updateNutritionGoal, { isLoading: goalSaving }] = useUpdateNutritionGoalMutation();
  const [addMeal, { isLoading: mealSaving }] = useAddMealMutation();
  const [deleteMeal] = useDeleteMealMutation();
  const [createFood, { isLoading: foodSaving }] = useCreateFoodMutation();
  const [createPulseTask, { isLoading: taskSaving }] = useCreatePulseTaskMutation();
  const [togglePulseTaskDate] = useTogglePulseTaskDateMutation();
  const [deletePulseTask] = useDeletePulseTaskMutation();
  const [createPulseGoal, { isLoading: pulseGoalSaving }] = useCreatePulseGoalMutation();
  const [updatePulseGoal, { isLoading: pulseGoalUpdating }] = useUpdatePulseGoalMutation();
  const [deletePulseGoal] = useDeletePulseGoalMutation();
  const [createFinanceCategory, { isLoading: categorySaving }] = useCreateFinanceCategoryMutation();
  const [createFinanceEntry, { isLoading: financeSaving }] = useCreateFinanceEntryMutation();
  const [deleteFinanceEntry] = useDeleteFinanceEntryMutation();
  const [createSavingsGoal, { isLoading: savingsSaving }] = useCreateSavingsGoalMutation();
  const [updateSavingsGoal, { isLoading: savingsUpdating }] = useUpdateSavingsGoalMutation();
  const [deleteSavingsGoal] = useDeleteSavingsGoalMutation();
  const [createDebt, { isLoading: debtSaving }] = useCreateDebtMutation();
  const [updateDebt, { isLoading: debtUpdating }] = useUpdateDebtMutation();
  const [deleteDebt] = useDeleteDebtMutation();

  const config = overviewData?.config;
  const profile = profileData?.profile;
  const profileSuggestion = profileData?.suggestion;
  const weightDelta = profileData?.weightDelta;
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  useEffect(() => {
    const activeIndex = weekDates.findIndex((date) => date === selectedDate);
    if (activeIndex < 0) return;

    const node = weekButtonRefs.current[activeIndex];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, weekDates]);

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

  const [mentalForm, setMentalForm] = useState({
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
    const day = mentalData?.day;
    setMentalForm({
      sleepHours: day?.sleepHours?.toString() ?? '7.5',
      nutrition: day?.nutrition?.toString() ?? String(mentalData?.autoNutrition ?? 7),
      productivity: day?.productivity?.toString() ?? String(mentalData?.autoProductivity ?? 7),
      stress: day?.stress?.toString() ?? '3',
      wellbeing: day?.wellbeing?.toString() ?? '7',
      alcoholLevel: day?.alcoholLevel?.toString() ?? '0',
      activityLevel: day?.activityLevel?.toString() ?? '1',
      caffeineLevel: day?.caffeineLevel?.toString() ?? '1',
      comment: day?.comment ?? '',
    });
  }, [mentalData?.day, mentalData?.autoNutrition, mentalData?.autoProductivity]);

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
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'TASKS' | 'HABITS'>('ALL');
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [savingsContributionModalOpen, setSavingsContributionModalOpen] = useState(false);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPaymentModalOpen, setDebtPaymentModalOpen] = useState(false);

  const [mealTitle, setMealTitle] = useState('Приём пищи');
  const [mealNotes, setMealNotes] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [mealItems, setMealItems] = useState<PulseMealItem[]>([]);
  const { data: foodSearchData } = useSearchFoodsQuery(foodSearch, { skip: !mealModalOpen && !foodModalOpen });

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

  const [taskForm, setTaskForm] = useState({
    title: '',
    notes: '',
    taskType: 'ONE_TIME',
    scheduleType: 'NONE',
    daysOfWeek: [0],
    daysOfMonth: [getDayOfMonthOrToday(selectedDate)],
  });

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
    daysOfMonth: [getDayOfMonthOrToday(selectedDate)],
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
    const tabs: Array<{ value: 'pulse' | 'health' | 'tasks' | 'finance' | 'analytics' | 'config'; label: string }> = [{ value: 'pulse', label: 'Пульс' }];
    if (config?.healthEnabled && (config?.mentalEnabled || config?.nutritionEnabled)) tabs.push({ value: 'health', label: 'Здоровье' });
    if (config?.tasksEnabled) tabs.push({ value: 'tasks', label: 'Задачи' });
    if (config?.financeEnabled) tabs.push({ value: 'finance', label: 'Финансы' });
    tabs.push({ value: 'analytics', label: 'Аналитика' });
    tabs.push({ value: 'config', label: 'Конфигурация' });
    return tabs;
  }, [config]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.value === mainTab)) {
      setMainTab('pulse');
    }
  }, [visibleTabs, mainTab]);

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
        description: 'План дня, привычки и выполнение задач без лишнего шума',
      };
    }

    if (mainTab === 'finance') {
      return {
        title: 'Финансы',
        description: 'Доходы, расходы, платежи и финансовые цели в одном месте',
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
        title: 'Конфигурация',
        description: 'Настройка модулей, целей и персональных параметров Pulse',
      };
    }

    return {
      title: 'Пульс',
      description: 'Ваш ежедневный центр контроля',
    };
  }, [mainTab, healthSubTab]);

  useEffect(() => {
    if (healthSubTab === 'mental' && !(isHealthEnabled && isMentalEnabled)) {
      setHealthSubTab(isHealthEnabled && isNutritionEnabled ? 'nutrition' : 'mental');
    }
    if (healthSubTab === 'nutrition' && !(isHealthEnabled && isNutritionEnabled)) {
      setHealthSubTab(isHealthEnabled && isMentalEnabled ? 'mental' : 'nutrition');
    }
  }, [healthSubTab, isHealthEnabled, isMentalEnabled, isNutritionEnabled]);

  const mealPreviewCalories = mealItems.reduce((sum, item) => sum + Number(item.calories || 0), 0);
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
  const paymentsToday = (financeOverview?.upcomingPayments ?? []).filter((item) => normalizeDateKey(item.date) === selectedDate);
  const paymentsPreview = (paymentsToday.length ? paymentsToday : financeOverview?.upcomingPayments ?? []).slice(0, 2);
  const focusItems = [...(tasksData?.items ?? [])].sort((a, b) => Number(a.completedForDate) - Number(b.completedForDate)).slice(0, 4);
  const trendAverage = analyticsData?.healthRows?.length
    ? Math.round(analyticsData.healthRows.reduce((sum, row) => sum + row.todayScore, 0) / analyticsData.healthRows.length)
    : pulseDay?.mental7Score ?? 0;
  const filteredTasks = useMemo(() => {
    const source = [...(tasksData?.items ?? [])];
    const filtered = source.filter((task) => {
      if (taskFilter === 'HABITS') return task.taskType === 'HABIT';
      if (taskFilter === 'TASKS') return task.taskType !== 'HABIT';
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.completedForDate !== b.completedForDate) return Number(a.completedForDate) - Number(b.completedForDate);
      if (a.taskType !== b.taskType) {
        if (a.taskType === 'HABIT') return 1;
        if (b.taskType === 'HABIT') return -1;
      }
      return a.title.localeCompare(b.title, 'ru');
    });
  }, [taskFilter, tasksData?.items]);

  const preparedGoals = useMemo(() => {
    return [...(tasksData?.goals ?? [])]
      .map((goal) => decorateGoal(goal))
      .sort((a, b) => Number(a.achieved) - Number(b.achieved) || a.title.localeCompare(b.title, 'ru'));
  }, [tasksData?.goals]);

  const financeEntries = financeData?.entries ?? [];
  const expenseEntries = useMemo(
    () => [...financeEntries].filter((entry) => entry.type === 'EXPENSE').sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0)),
    [financeEntries],
  );
  const incomeEntries = useMemo(
    () => [...financeEntries].filter((entry) => entry.type === 'INCOME').sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0)),
    [financeEntries],
  );
  const dayExpenseTotal = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const dayIncomeTotal = incomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
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
        name: key === 'other' ? 'Без категории' : key,
        limitAmount: 0,
        spent,
        percent: 100,
        overBy: 0,
      }));
    }

    return source.sort((a, b) => (b.spent ?? 0) - (a.spent ?? 0));
  }, [expenseEntries, financeData?.categories]);
  const financeStatsRows = financeCategoriesView.filter((item) => (item.spent ?? 0) > 0 || (item.limitAmount ?? 0) > 0).slice(0, 6);
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
  const averageIncome = monthlyIncome > 0 && incomeEntries.length ? Math.round(monthlyIncome / incomeEntries.length) : monthlyIncome;
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
  const nutritionConsumed = nutritionData?.totalCalories ?? 0;
  const nutritionRemaining = nutritionData?.remainingCalories != null ? Math.max(0, nutritionData.remainingCalories) : Math.max(0, caloriesTarget - nutritionConsumed);
  const nutritionProgress = caloriesTarget > 0 ? Math.min(100, Math.round((nutritionConsumed / caloriesTarget) * 100)) : 0;
  const nutritionRating = Math.max(0, Math.round(mentalData?.autoNutrition ?? (nutritionData as any)?.averageNutritionScore ?? 0));

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
    const goalSummary = getWeightGoalSummary(profile?.currentWeightKg, profile?.targetWeightKg);
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
        { key: 'goal', icon: 'target' as const, label: 'Цель', value: goalSummary.title, description: goalSummary.subtitle, tone: 'goal' as const },
      );
    }

    return cards;
  }, [isHealthEnabled, isNutritionEnabled, profile?.age, profile?.currentWeightKg, profile?.heightCm, profile?.startWeightKg, profile?.targetWeightKg, weightDelta]);

  const summaryPrimaryCards = useMemo(() => {
    const primaryKeys = new Set(['current', 'target', 'progress', 'goal']);
    return summaryCards.filter((card) => primaryKeys.has(card.key));
  }, [summaryCards]);

  const summarySecondaryCards = useMemo(() => {
    const secondaryKeys = new Set(['height', 'age', 'start']);
    return summaryCards.filter((card) => secondaryKeys.has(card.key));
  }, [summaryCards]);

  const goalSummary = useMemo(
    () => getWeightGoalSummary(profile?.currentWeightKg, profile?.targetWeightKg),
    [profile?.currentWeightKg, profile?.targetWeightKg],
  );

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
    setShowProfileEditor(false);
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

  async function handleProfileSave() {
    await updateProfile({
      heightCm: num(profileForm.heightCm),
      startWeightKg: num(profileForm.startWeightKg),
      currentWeightKg: num(profileForm.currentWeightKg),
      targetWeightKg: num(profileForm.targetWeightKg),
      age: intNum(profileForm.age),
    }).unwrap();
    setShowProfileEditor(false);
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
    setShowNutritionGoalEditor(false);
  }

  function addFoodToMeal(food: any) {
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

  async function handleMealSave() {
    if (!mealItems.length) return;
    const futureTotal = (nutritionData?.totalCalories ?? 0) + mealPreviewCalories;
    if (goalCalories && futureTotal > goalCalories) {
      const exceed = futureTotal - goalCalories;
      const accepted = window.confirm(`После этого приёма пищи цель будет превышена на ${Math.round(exceed)} ккал. Продолжить?`);
      if (!accepted) return;
    }
    await addMeal({ date: selectedDate, title: mealTitle, notes: mealNotes || null, items: mealItems }).unwrap();
    setMealItems([]);
    setMealTitle('Приём пищи');
    setMealNotes('');
    setFoodSearch('');
    setMealModalOpen(false);
  }

  async function handleCreateFood() {
    await createFood({
      name: customFoodForm.name,
      calories: intNum(customFoodForm.calories),
      defaultGrams: num(customFoodForm.grams),
      protein: num(customFoodForm.protein),
      fat: num(customFoodForm.fat),
      carbs: num(customFoodForm.carbs),
      isDish: customFoodForm.isDish,
      isHealthy: customFoodForm.isHealthy,
      isPublic: true,
    }).unwrap();
    setCustomFoodForm({ name: '', calories: '', grams: '100', protein: '', fat: '', carbs: '', isDish: false, isHealthy: true });
    setFoodModalOpen(false);
  }

  async function handleCreateTask() {
    await createPulseTask({
      title: taskForm.title,
      notes: taskForm.notes || null,
      taskType: taskForm.taskType,
      date: selectedDate,
      scheduleType: taskForm.taskType === 'ONE_TIME' ? 'NONE' : taskForm.scheduleType,
      daysOfWeek: taskForm.taskType === 'REGULAR' && taskForm.scheduleType === 'WEEKLY' ? taskForm.daysOfWeek : [],
      daysOfMonth: taskForm.taskType === 'REGULAR' && taskForm.scheduleType === 'MONTHLY' ? taskForm.daysOfMonth : [],
    }).unwrap();
    setTaskForm({ title: '', notes: '', taskType: 'ONE_TIME', scheduleType: 'NONE', daysOfWeek: [0], daysOfMonth: [getDayOfMonthOrToday(selectedDate)] });
    setTaskModalOpen(false);
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

  async function handleCreateCategory() {
    await createFinanceCategory({ name: categoryForm.name, limitAmount: num(categoryForm.limitAmount) }).unwrap();
    setCategoryForm({ name: '', limitAmount: '' });
    setCategoryModalOpen(false);
  }

  async function handleCreateFinanceEntry() {
    await createFinanceEntry({
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
    }).unwrap();
    setFinanceForm({ title: '', amount: '', type: 'EXPENSE', categoryId: '', notes: '', recurring: false, scheduleType: 'MONTHLY', daysOfWeek: [0], daysOfMonth: [getDayOfMonthOrToday(selectedDate)] });
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

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.pageTitle}>{mainTabMeta.title}</h1>
          <p className={styles.pageSubtitle}>{mainTabMeta.description}</p>
        </div>
      </div>
      <div className={styles.toolbarStack}>
        <div className={styles.toolbarHeadPanel}>
          <div className={styles.toolbarHead}>
          <div className={styles.dateSwitcher}>
            <button type="button" className={styles.dateNav} onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Предыдущий день">‹</button>
            <button type="button" className={styles.dateTrigger} onClick={openDatePicker}>
              {formatToolbarDate(selectedDate)}
            </button>
            <button type="button" className={styles.dateNav} onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="Следующий день">›</button>
            <input ref={dateInputRef} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={styles.hiddenDateInput} />
          </div>

          <div className={styles.weekRow}>
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
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{weekdayLabels[index]}</span>
                  <strong>{(parseDate(date) ?? new Date()).getDate()}</strong>
                </button>
              );
            })}
          </div>
          </div>
        </div>

        <div className={styles.toolbarTabsPanel}>
          <Segmented value={mainTab} onChange={(value) => setMainTab(value as any)} options={visibleTabs} />
        </div>
      </div>

      {mainTab === 'pulse' ? (
        <div className={styles.pulseScene}>
          {profileCardsVisible ? (
            <section className={styles.summarySurface}>
              <div className={styles.summarySurfaceHead}>
                <div className={styles.summarySurfaceCopy}>
                  <div className={styles.summarySectionTitle}>Обзор профиля</div>
                </div>

                <div className={styles.summaryRailActions}>
                  {showProfileEditor ? (
                    <>
                      <Button size="sm" onClick={closeProfileEditor}>Скрыть данные</Button>
                      <Button size="sm" variant="primary" onClick={handleProfileSave} loading={profileSaving}>
                        Сохранить профиль
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setShowProfileEditor(true)}>Редактировать данные</Button>
                  )}
                </div>
              </div>

              <div className={styles.summaryCombinedGrid}>
                {(isHealthEnabled || isNutritionEnabled) ? (
                  <div className={styles.summaryComboCard}>
                    <div className={styles.summaryComboTitle}>Параметры</div>
                    <div className={styles.summaryMetricStack}>
                      {isHealthEnabled ? (
                        <div className={styles.summaryMetricLine}>
                          <span>Рост</span>
                          {showProfileEditor ? (
                            <input
                              className={styles.summaryInlineInput}
                              value={profileForm.heightCm}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, heightCm: e.target.value }))}
                              inputMode="decimal"
                              aria-label="Рост, см"
                            />
                          ) : (
                            <strong>{profile?.heightCm ?? '—'}<small>см</small></strong>
                          )}
                        </div>
                      ) : null}
                      {isNutritionEnabled ? (
                        <div className={styles.summaryMetricLine}>
                          <span>Вес начальный</span>
                          {showProfileEditor ? (
                            <input
                              className={styles.summaryInlineInput}
                              value={profileForm.startWeightKg}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, startWeightKg: e.target.value }))}
                              inputMode="decimal"
                              aria-label="Вес на старте, кг"
                            />
                          ) : (
                            <strong>{profile?.startWeightKg ?? '—'}<small>кг</small></strong>
                          )}
                        </div>
                      ) : null}
                      {isHealthEnabled ? (
                        <div className={styles.summaryMetricLine}>
                          <span>Возраст</span>
                          {showProfileEditor ? (
                            <input
                              className={styles.summaryInlineInput}
                              value={profileForm.age}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, age: e.target.value }))}
                              inputMode="numeric"
                              aria-label="Возраст"
                            />
                          ) : (
                            <strong>{profile?.age ?? '—'}<small>лет</small></strong>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {isNutritionEnabled ? (
                  <div className={styles.summaryComboCard}>
                    <div className={styles.summaryComboTitle}>Вес</div>
                    <div className={styles.summaryMetricStack}>
                      <div className={styles.summaryMetricLine}>
                        <span>Текущий вес</span>
                        {showProfileEditor ? (
                          <input
                            className={styles.summaryInlineInput}
                            value={profileForm.currentWeightKg}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))}
                            inputMode="decimal"
                            aria-label="Текущий вес, кг"
                          />
                        ) : (
                          <strong>{profile?.currentWeightKg ?? '—'}<small>кг</small></strong>
                        )}
                      </div>
                      <div className={styles.summaryMetricLine}>
                        <span>Желаемый вес</span>
                        {showProfileEditor ? (
                          <input
                            className={styles.summaryInlineInput}
                            value={profileForm.targetWeightKg}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, targetWeightKg: e.target.value }))}
                            inputMode="decimal"
                            aria-label="Целевой вес, кг"
                          />
                        ) : (
                          <strong>{profile?.targetWeightKg ?? '—'}<small>кг</small></strong>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {isNutritionEnabled ? (
                  <div className={[styles.summaryComboCard, styles.summaryComboCardAccent].join(' ')}>
                    <div className={styles.summaryComboTitle}>Прогресс и цель</div>
                    <div className={styles.summaryMetricStack}>
                      <div className={styles.summaryMetricLine}><span>Прогресс</span><strong>{weightDelta ? `${weightDelta.delta > 0 ? '+' : ''}${weightDelta.delta}` : '—'}<small>кг</small></strong></div>
                      <div className={styles.summaryMetricLine}><span>Цель</span><strong>{goalSummary.title}</strong></div>
                      <div className={styles.summaryMetricHint}>{goalSummary.subtitle}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className={styles.pulseDaySurface}>
            <div className={styles.pulseDayHeader}>
              <div className={styles.pulseSectionTitle}>
                <PulseIcon name="pulse" className={styles.sectionIconAccent} />
                <h2>Пульс дня</h2>
              </div>
              <button type="button" className={styles.pulseDateChip} onClick={openDatePicker}>
                {formatToolbarDate(selectedDate)}
              </button>
            </div>

            <div className={styles.pulseStatsGrid}>
              {isMentalEnabled ? (
                <div className={styles.stateCard}>
                  <div className={styles.stateCardContent}>
                    <MiniRing value={pulseDay?.dayScore ?? 0} tone="accent" />
                    <div className={styles.stateMeta}>
                      <span>Состояние</span>
                      <strong>{describeScore(pulseDay?.dayScore ?? 0)}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {isMentalEnabled ? (
                <div className={styles.stateCard}>
                  <div className={styles.stateCardContent}>
                    <MiniRing value={pulseDay?.mental7Score ?? 0} tone="success" />
                    <div className={styles.stateMeta}>
                      <span>За 7 дней</span>
                      <strong>{describeTrend(pulseDay?.mental7Score ?? 0)}</strong>
                    </div>
                  </div>
                </div>
              ) : null}

              {isNutritionEnabled ? (
                <div className={styles.metricCompactCard}>
                  <div className={styles.metricCompactHeader}>
                    <div className={styles.metricCompactTitle}><PulseIcon name="flame" className={styles.metricIconAccent} />Калории</div>
                    <div className={styles.metricCompactValue}>{pulseDay?.caloriesConsumed ?? 0}{caloriesTarget ? ` / ${caloriesTarget}` : ''}</div>
                  </div>
                  <div className={styles.compactProgress}><span style={{ width: `${caloriesProgress}%` }} /></div>
                  <div className={styles.metricCompactAccent}>
                    <strong>{pulseDay?.caloriesRemaining != null ? Math.max(0, pulseDay.caloriesRemaining) : '—'}</strong>
                    <span>{pulseDay?.caloriesRemaining != null ? 'ккал осталось' : 'цель не задана'}</span>
                  </div>
                </div>
              ) : null}

              {isTasksEnabled ? (
                <div className={styles.metricCompactCard}>
                  <div className={styles.metricCompactHeader}>
                    <div className={styles.metricCompactTitle}><PulseIcon name="check" className={styles.metricIconSuccess} />Задачи</div>
                    <div className={styles.metricCompactValue}>{pulseDay?.tasksDone ?? 0} из {pulseDay?.tasksTotal ?? 0}</div>
                  </div>
                  <div className={[styles.compactProgress, styles.compactProgressSuccess].join(' ')}><span style={{ width: `${tasksProgress}%` }} /></div>
                  <div className={[styles.metricCompactAccent, styles.metricCompactAccentSuccess].join(' ')}>
                    <strong>{pulseDay?.tasksPercent ?? 0}%</strong>
                    <span>выполнено</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.recommendationsSection}>
              <div className={styles.recommendationsHeader}>
                <div className={styles.recommendationsTitle}><PulseIcon name="spark" className={styles.sectionIconMuted} />Рекомендации</div>
              </div>

              <div className={styles.recommendationList}>
                {(showAllRecommendations ? recommendations : recommendations.slice(0, 4)).map((item) => {
                  const meta = getRecommendationMeta(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={[
                        styles.recommendationRow,
                        meta.tone === 'warning' ? styles.recommendationWarning : '',
                        meta.tone === 'info' ? styles.recommendationInfo : '',
                        meta.tone === 'danger' ? styles.recommendationDanger : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        if (meta.target === 'meal') {
                          setMealModalOpen(true);
                          return;
                        }
                        if (meta.target === 'finance') {
                          setMainTab('finance');
                          return;
                        }
                        if (meta.target === 'tasks') {
                          setMainTab('tasks');
                          return;
                        }
                        if (meta.target === 'health') {
                          setMainTab('health');
                        }
                      }}
                    >
                      <span className={styles.recommendationLead}><PulseIcon name={meta.icon} className={styles.recommendationIcon} />{item}</span>
                      <span className={styles.recommendationAction}>{meta.action} <PulseIcon name="arrow" className={styles.arrowIcon} /></span>
                    </button>
                  );
                })}
                {!recommendations.length ? <div className={styles.emptyText}>Пока нет рекомендаций на этот день.</div> : null}
              </div>

              {recommendations.length > 4 ? (
                <button type="button" className={styles.inlineLink} onClick={() => setShowAllRecommendations((value) => !value)}>
                  {showAllRecommendations ? 'Скрыть рекомендации' : 'Показать все рекомендации'}
                </button>
              ) : null}
            </div>

            {(isTasksEnabled || isFinanceEnabled) ? (
              <div className={styles.pulseInlineGrid}>
                <div className={styles.inlineSection}>
                  {isTasksEnabled ? (
                    <>
                      <div className={styles.inlineSectionHead}>
                        <div className={styles.panelTitle}><PulseIcon name="spark" className={styles.sectionIconAccent} />Сегодня</div>
                        <div className={styles.quickActionsInline}>
                          {isNutritionEnabled ? (
                            <button type="button" className={styles.quickActionChip} onClick={() => setMealModalOpen(true)}>
                              <PulseIcon name="meal" className={styles.summaryIcon} />
                              <span>Приём пищи</span>
                            </button>
                          ) : null}
                          {isTasksEnabled ? (
                            <button type="button" className={styles.quickActionChip} onClick={() => setTaskModalOpen(true)}>
                              <PulseIcon name="check" className={styles.summaryIcon} />
                              <span>Задача</span>
                            </button>
                          ) : null}
                          {isFinanceEnabled ? (
                            <button type="button" className={styles.quickActionChip} onClick={() => { setFinanceForm((prev) => ({ ...prev, type: 'EXPENSE' })); setFinanceModalOpen(true); }}>
                              <PulseIcon name="wallet" className={styles.summaryIcon} />
                              <span>Расход</span>
                            </button>
                          ) : null}
                          {isMentalEnabled ? (
                            <button type="button" className={styles.quickActionChip} onClick={() => setMainTab('health')}>
                              <PulseIcon name="heart" className={styles.summaryIcon} />
                              <span>Состояние</span>
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.focusTaskList}>
                        {focusItems.map((task) => (
                          <div key={task.id} className={styles.focusTaskRow}>
                            <button
                              type="button"
                              className={[styles.taskToggle, task.completedForDate ? styles.taskToggleDone : ''].filter(Boolean).join(' ')}
                              onClick={() => togglePulseTaskDate({ taskId: task.id, date: selectedDate })}
                              aria-label={task.completedForDate ? 'Снять выполнение' : 'Отметить выполненным'}
                            >
                              {task.completedForDate ? '✓' : ''}
                            </button>
                            <div className={styles.focusTaskMeta}>
                              <strong>{task.title}</strong>
                              <span>{task.notes || (task.taskType === 'HABIT' ? 'Привычка' : task.taskType === 'REGULAR' ? 'Регулярная задача' : 'Разовая задача')}</span>
                            </div>
                          </div>
                        ))}
                        {!focusItems.length ? <div className={styles.emptyText}>На выбранный день задач пока нет.</div> : null}
                      </div>
                    </>
                  ) : null}

                  {isFinanceEnabled ? (
                    <>
                      <div className={styles.inlineDivider} />
                      <div className={styles.inlineSectionHead}>
                        <div className={styles.panelTitle}><PulseIcon name="calendar" className={styles.sectionIconAccent} />Финансы на сегодня</div>
                      </div>
                      <button type="button" className={[styles.paymentsBanner, styles.financeBanner].join(' ')} onClick={() => setMainTab('finance')}>
                        <div className={styles.bannerLead}>
                          <div className={styles.bannerIconWrap}><PulseIcon name="card" className={styles.bannerIcon} /></div>
                          <div>
                            <strong>Сегодня платежей: {paymentsToday.length}</strong>
                            <span>
                              {paymentsPreview.length
                                ? paymentsPreview.map((item) => `${item.title} — ${formatMoney(item.amount)}`).join(' · ')
                                : 'На выбранный день регулярных платежей нет.'}
                            </span>
                          </div>
                        </div>
                        <span className={styles.bannerAction}>Подробнее <PulseIcon name="arrow" className={styles.arrowIcon} /></span>
                      </button>
                      <div className={styles.inlineFinanceMeta}>
                        {(financeOverview?.upcomingPayments ?? []).slice(0, 2).map((item) => (
                          <div key={`${item.title}-${item.date}`} className={styles.inlineFinanceRow}>
                            <span>{item.title}</span>
                            <strong>{formatShortDate(item.date)} · {formatMoney(item.amount)}</strong>
                          </div>
                        ))}
                        {!financeOverview?.upcomingPayments?.length ? <div className={styles.emptyText}>Пока нет ближайших платежей.</div> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {mainTab === 'health' ? (
        <div className={styles.healthScene}>
          <div className={styles.healthSubnav}>
            {isMentalEnabled ? (
              <button
                type="button"
                className={[styles.healthSubnavButton, healthSubTab === 'mental' ? styles.healthSubnavButtonActive : ''].filter(Boolean).join(' ')}
                onClick={() => setHealthSubTab('mental')}
              >
                <PulseIcon name="brain" className={styles.healthSubnavIcon} />
                <span>Ментальное здоровье</span>
              </button>
            ) : null}
            {isNutritionEnabled ? (
              <button
                type="button"
                className={[styles.healthSubnavButton, healthSubTab === 'nutrition' ? styles.healthSubnavButtonActive : ''].filter(Boolean).join(' ')}
                onClick={() => setHealthSubTab('nutrition')}
              >
                <PulseIcon name="meal" className={styles.healthSubnavIcon} />
                <span>Питание</span>
              </button>
            ) : null}
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
                      <MiniRing value={mentalTodayScore} tone="accent" />
                      <div className={styles.healthRingMeta}>
                        <strong>Сегодня</strong>
                        <span>{describeScore(mentalTodayScore)}</span>
                      </div>
                    </div>

                    <div className={styles.healthRingMetric}>
                      <MiniRing value={mentalWeekScore} tone="success" />
                      <div className={styles.healthRingMeta}>
                        <strong>За 7 дней</strong>
                        <span>{describeTrend(mentalWeekScore)}</span>
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

              <section className={styles.healthSurface}>
                <div className={styles.healthSectionHeader}>
                  <div className={styles.healthSectionTitle}><PulseIcon name="pulse" className={styles.sectionIconAccent} />Параметры дня</div>
                  <div className={styles.healthActionGroup}>
                    <button
                      type="button"
                      className={styles.healthGhostButton}
                      onClick={() => setMentalForm((prev) => ({ ...prev, nutrition: String(mentalData?.autoNutrition ?? 7), productivity: String(mentalData?.autoProductivity ?? 7) }))}
                    >
                      Применить автооценки
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
            <>
              <div className={styles.healthActionRow}>
                <div className={styles.healthChip}>
                  <PulseIcon name="calendar" className={styles.healthInlineIcon} />
                  <span>{formatLongDate(selectedDate)}</span>
                </div>
                <button type="button" className={styles.healthGhostButton} onClick={() => setShowNutritionGoalEditor((value) => !value)}>
                  <PulseIcon name="gear" className={styles.healthButtonIcon} />
                  <span>{showNutritionGoalEditor ? 'Скрыть цель' : 'Задать цель'}</span>
                </button>
              </div>

              {showNutritionGoalEditor ? (
                <section className={styles.healthSurface}>
                  <div className={styles.healthSectionHeader}>
                    <div className={styles.healthSectionTitle}><PulseIcon name="target" className={styles.sectionIconAccent} />Цель питания</div>
                    <button
                      type="button"
                      className={styles.healthGhostButton}
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

                  <div className={styles.actionsRow}>
                    <CardMuted>{nutritionGoal ? `Текущая цель: ${nutritionGoal.dailyCalories} ккал` : 'Заполни профиль, чтобы получить расчёт цели.'}</CardMuted>
                    <Button variant="primary" onClick={handleGoalSave} disabled={goalSaving} loading={goalSaving}>Сохранить цель</Button>
                  </div>
                </section>
              ) : null}

              <div className={styles.nutritionTopGrid}>
                <section className={styles.healthSurface}>
                  <div className={styles.healthSectionHeader}>
                    <div className={styles.healthSectionTitle}><PulseIcon name="flame" className={styles.sectionIconAccent} />Калории</div>
                    <span className={styles.healthChip}>Цель: {caloriesTarget || '—'} ккал</span>
                  </div>

                  <div className={styles.nutritionMetricsRow}>
                    <div className={styles.nutritionMetric}><strong>{nutritionConsumed}</strong><span>Потреблено</span></div>
                    <div className={styles.nutritionMetricDivider} />
                    <div className={styles.nutritionMetric}><strong className={styles.nutritionAccentValue}>{nutritionRemaining}</strong><span>Осталось</span></div>
                    <div className={styles.nutritionMetricDivider} />
                    <div className={styles.nutritionMetric}><strong>{caloriesTarget || 0}</strong><span>Цель</span></div>
                  </div>

                  <div className={styles.nutritionProgressWrap}>
                    <div className={styles.nutritionProgressBar}><span style={{ width: `${nutritionProgress}%` }} /></div>
                    <div className={styles.nutritionProgressCaption}>{nutritionProgress}% от дневной нормы</div>
                  </div>
                </section>

                <aside className={styles.healthSurface}>
                  <div className={styles.healthSectionHeader}>
                    <div className={styles.healthSectionTitle}><PulseIcon name="target" className={styles.sectionIconAccent} />БЖУ</div>
                  </div>

                  <div className={styles.macroList}>
                    {[
                      { label: 'Белки', value: nutritionData?.totalProtein ?? 0, target: nutritionGoal?.protein ?? profile?.proteinGoal ?? profileSuggestion?.protein ?? 0, className: styles.macroFillProtein },
                      { label: 'Жиры', value: nutritionData?.totalFat ?? 0, target: nutritionGoal?.fat ?? profile?.fatGoal ?? profileSuggestion?.fat ?? 0, className: styles.macroFillFat },
                      { label: 'Углеводы', value: nutritionData?.totalCarbs ?? 0, target: nutritionGoal?.carbs ?? profile?.carbsGoal ?? profileSuggestion?.carbs ?? 0, className: styles.macroFillCarbs },
                    ].map((macro) => {
                      const maxTarget = Math.max(macro.target || 0, macro.value || 0, 1);
                      const percent = Math.min(100, Math.round((macro.value / maxTarget) * 100));
                      return (
                        <div key={macro.label} className={styles.macroItem}>
                          <div className={styles.macroHead}>
                            <span>{macro.label}</span>
                            <strong>{macro.value} / {macro.target || 0} г</strong>
                          </div>
                          <div className={styles.macroTrack}><span className={macro.className} style={{ width: `${percent}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              </div>

              <section className={[styles.healthSurface, styles.healthInfoSurface].join(' ')}>
                <div className={styles.healthInfoRow}>
                  <PulseIcon name="info" className={styles.healthInfoIcon} />
                  <div>
                    <strong>Влияние на ментальное здоровье</strong>
                    <span>Текущий показатель питания: <b>{nutritionRating}/10</b> — вносит <b>+{nutritionRating}</b> баллов в общее состояние</span>
                  </div>
                </div>
              </section>

              <section className={styles.healthSurface}>
                <div className={styles.healthSectionHeader}>
                  <div className={styles.healthSectionTitle}>Приёмы пищи</div>
                  <button type="button" className={styles.healthPrimaryButton} onClick={() => setMealModalOpen(true)}>
                    <PulseIcon name="plus" className={styles.healthButtonIcon} />
                    <span>Добавить</span>
                  </button>
                </div>

                <div className={styles.mealListSurface}>
                  {(nutritionData?.meals ?? []).map((meal) => (
                    <article key={meal.id} className={styles.mealRowCard}>
                      <div className={styles.mealTimeBadge}>{formatTimeLabel(meal.createdAt)}</div>
                      <div className={styles.mealMain}>
                        <strong>{meal.title}</strong>
                        <span>Б: {meal.totalProtein ?? 0}г &nbsp; Ж: {meal.totalFat ?? 0}г &nbsp; У: {meal.totalCarbs ?? 0}г</span>
                        <span>{meal.itemsJson.map((item) => item.name).join(' · ')}</span>
                      </div>
                      <div className={styles.mealSide}>
                        <strong>{meal.totalCalories} ккал</strong>
                        <div className={styles.mealActions}>
                          <button type="button" className={styles.mealIconButton} onClick={() => deleteMeal(meal.id)} aria-label="Удалить приём пищи">
                            <PulseIcon name="trash" className={styles.mealActionIcon} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!nutritionData?.meals?.length ? <div className={styles.emptyText}>На выбранный день приёмы пищи ещё не добавлены.</div> : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      ) : null}

      {mainTab === 'tasks' ? (
        <div className={styles.tasksScene}>
          <section className={styles.taskSummarySurface}>
            <div className={styles.taskSummaryLead}>
              <span className={styles.taskSummaryIcon}><PulseIcon name="check" className={styles.summaryIcon} /></span>
              <div className={styles.taskSummaryText}>
                <span>Выполнено сегодня</span>
                <strong>{tasksData?.summary.completed ?? 0} из {tasksData?.summary.total ?? 0}</strong>
              </div>
            </div>

            <div className={styles.taskSummaryProgressMeta}>
              <strong>{tasksData?.summary.percent ?? 0}%</strong>
              <div className={styles.taskSummaryBar}><span style={{ width: `${tasksData?.summary.percent ?? 0}%` }} /></div>
            </div>
          </section>

          <div className={styles.taskToolbar}>
            <div className={styles.taskFilters}>
              {[
                { value: 'ALL', label: 'Все' },
                { value: 'TASKS', label: 'Задачи' },
                { value: 'HABITS', label: 'Привычки' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={[styles.taskFilterButton, taskFilter === filter.value ? styles.taskFilterButtonActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setTaskFilter(filter.value as 'ALL' | 'TASKS' | 'HABITS')}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <button type="button" className={styles.healthPrimaryButton} onClick={() => setTaskModalOpen(true)}>
              <PulseIcon name="plus" className={styles.healthButtonIcon} />
              <span>Добавить</span>
            </button>
          </div>

          <section className={styles.tasksListSurface}>
            {filteredTasks.map((task) => {
              const typeLabel = task.taskType === 'HABIT' ? 'Привычка' : task.taskType === 'REGULAR' ? 'Регулярная' : 'Разовая';
              return (
                <article key={task.id} className={[styles.taskRowCard, task.completedForDate ? styles.taskRowCardDone : ''].filter(Boolean).join(' ')}>
                  <div className={styles.taskRowMain}>
                    <button
                      type="button"
                      className={[styles.taskToggle, task.completedForDate ? styles.taskToggleDone : ''].filter(Boolean).join(' ')}
                      onClick={() => togglePulseTaskDate({ taskId: task.id, date: selectedDate })}
                      aria-label={task.completedForDate ? 'Снять выполнение' : 'Отметить выполненным'}
                    >
                      {task.completedForDate ? '✓' : ''}
                    </button>

                    <div className={styles.taskRowContent}>
                      <strong className={styles.taskRowTitle}>{task.title}</strong>
                      {task.notes && task.notes.trim() && task.notes.trim().toLowerCase() !== `${typeLabel} задача`.toLowerCase() ? (
                        <div className={styles.taskRowNote}>{task.notes}</div>
                      ) : null}
                      <div className={styles.taskRowMeta}>
                        <span className={[styles.taskMetaChip, styles.taskMetaChipType, task.taskType === 'HABIT' ? styles.taskMetaChipTypeHabit : task.taskType === 'REGULAR' ? styles.taskMetaChipTypeRegular : styles.taskMetaChipTypeOneTime].join(' ')}>{`${typeLabel} задача`}</span>
                        {task.priority ? <span className={[styles.taskMetaChip, styles.taskMetaChipPriority].join(' ')}>Приоритет {task.priority}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.taskRowSide}>
                    <button type="button" className={[styles.taskDeleteButton, styles.taskDeleteButtonDesktop].join(' ')} onClick={() => deletePulseTask(task.id)}>Удалить</button>
                    <button type="button" className={[styles.taskDeleteIconButton, styles.taskDeleteIconButtonMobile].join(' ')} onClick={() => deletePulseTask(task.id)} aria-label="Удалить задачу">
                      <PulseIcon name="trash" className={styles.taskDeleteIcon} />
                    </button>
                  </div>
                </article>
              );
            })}

            {!filteredTasks.length ? <div className={styles.emptyText}>На выбранный день задач этого типа пока нет.</div> : null}
          </section>

          <section className={styles.goalPanelSurface}>
            <div className={styles.goalPanelHeader}>
              <div className={styles.goalPanelTitle}><PulseIcon name="target" className={styles.sectionIconAccent} />Глобальные цели</div>
              <button type="button" className={styles.goalAddButton} onClick={() => setGoalModalOpen(true)}>
                <PulseIcon name="plus" className={styles.goalAddIcon} />
                <span>Добавить</span>
              </button>
            </div>

            <div className={styles.goalList}>
              {preparedGoals.map((goal) => (
                <article key={goal.id} className={[styles.goalCard, goal.achieved ? styles.goalCardDone : ''].filter(Boolean).join(' ')}>
                  <div className={styles.goalCardHeader}>
                    <div className={styles.goalCardLead}>
                      <div className={styles.goalCardLeadCluster}>
                        <span className={styles.goalCardIcon}><PulseIcon name={goal.achieved ? 'check' : 'target'} className={styles.summaryIcon} /></span>
                        <button
                          type="button"
                          className={styles.goalDeleteIconButton}
                          onClick={() => deletePulseGoal(goal.id)}
                          disabled={pulseGoalUpdating}
                          aria-label="Удалить цель"
                        >
                          <PulseIcon name="trash" className={styles.taskDeleteIcon} />
                        </button>
                      </div>
                      <div className={styles.goalCardText}>
                        <strong>{goal.title}</strong>
                        <span>{goal.achieved ? 'Достигнуто!' : goal.displayDescription || 'Разбейте цель на шаги, и прогресс будет считаться автоматически.'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={[styles.goalCheckbar, goal.achieved ? styles.goalCheckbarDone : ''].filter(Boolean).join(' ')}
                    onClick={() => handleToggleGoalAchieved(goal)}
                    disabled={pulseGoalUpdating}
                  >
                    <span className={[styles.goalCheckbarToggle, goal.achieved ? styles.goalCheckbarToggleDone : ''].filter(Boolean).join(' ')}>{goal.achieved ? '✓' : ''}</span>
                    <span className={styles.goalCheckbarLabel}>{goal.achieved ? 'Цель достигнута' : 'Отметить достигнутой'}</span>
                  </button>

                  <div className={styles.goalProgressHead}>
                    <span>{goal.subtaskCount ? `${goal.doneCount} из ${goal.subtaskCount} подзадач` : 'Прогресс по цели'}</span>
                    <strong>{goal.achieved ? 'Достигнуто' : `${goal.computedProgress}%`}</strong>
                  </div>
                  <div className={styles.goalProgressBar}><span style={{ width: `${goal.computedProgress}%` }} /></div>

                  {goal.subtaskCount ? (
                    <div className={styles.goalSubtaskList}>
                      {goal.subtasks.map((subtask) => (
                        <button key={subtask.id} type="button" className={[styles.goalSubtaskRow, subtask.done ? styles.goalSubtaskRowDone : ''].filter(Boolean).join(' ')} onClick={() => handleToggleGoalSubtask(goal, subtask.id)} disabled={pulseGoalUpdating}>
                          <span className={[styles.goalSubtaskToggle, subtask.done ? styles.goalSubtaskToggleDone : ''].filter(Boolean).join(' ')}>{subtask.done ? '✓' : ''}</span>
                          <span className={styles.goalSubtaskTitle}>{subtask.title}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.goalEmptyHint}>Разбейте на мелкие подзадачи свою цель, чтобы прогресс считался автоматически и цель было проще довести до результата.</div>
                  )}

                  {goal.targetDate ? <div className={styles.goalMetaFoot}>Целевая дата: {formatShortDate(goal.targetDate)}</div> : null}
                </article>
              ))}

              {!preparedGoals.length ? <div className={styles.emptyText}>Добавь глобальную цель и разбей её на шаги — так прогресс будет заполняться понятно и без перегруза.</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {mainTab === 'finance' ? (
        <div className={styles.financeScene}>
          <div className={styles.financeSubnav}>
            <button
              type="button"
              className={[styles.financeSubnavButton, financeSubTab === 'expenses' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setFinanceSubTab('expenses')}
            >
              <PulseIcon name="wallet" className={styles.healthSubnavIcon} />
              <span>Расходы</span>
            </button>
            <button
              type="button"
              className={[styles.financeSubnavButton, financeSubTab === 'income' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setFinanceSubTab('income')}
            >
              <PulseIcon name="trend" className={styles.healthSubnavIcon} />
              <span>Доходы</span>
            </button>
            <button
              type="button"
              className={[styles.financeSubnavButton, financeSubTab === 'savings' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setFinanceSubTab('savings')}
            >
              <PulseIcon name="target" className={styles.healthSubnavIcon} />
              <span>Копилка</span>
            </button>
            <button
              type="button"
              className={[styles.financeSubnavButton, financeSubTab === 'stats' ? styles.financeSubnavButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setFinanceSubTab('stats')}
            >
              <PulseIcon name="trend" className={styles.healthSubnavIcon} />
              <span>Статистика</span>
            </button>
          </div>

          {financeSubTab === 'expenses' ? (
            <>
              <section className={styles.financeHeroSurface}>
                <div className={styles.financeHeroLead}>
                  <span className={[styles.financeHeroIconWrap, styles.financeHeroIconExpense].join(' ')}>
                    <PulseIcon name="wallet" className={styles.financeHeroIcon} />
                  </span>
                  <div className={styles.financeHeroText}>
                    <span>Расходы за день</span>
                    <strong className={styles.financeAmountExpense}>{formatMoney(-dayExpenseTotal)}</strong>
                  </div>
                </div>
                <div className={styles.financeHeroActions}>
                  <button type="button" className={styles.financeSecondaryAction} onClick={() => setCategoryModalOpen(true)}>
                    <PulseIcon name="spark" className={styles.financeInlinePillIcon} />
                    <span>Категория</span>
                  </button>
                  <button type="button" className={styles.financeSquareAction} onClick={() => {
                    setFinanceForm((prev) => ({ ...prev, type: 'EXPENSE' }));
                    setFinanceModalOpen(true);
                  }}>
                    <PulseIcon name="plus" className={styles.financeSquareActionIcon} />
                  </button>
                </div>
              </section>

              <div className={styles.financeCategoryGrid}>
                {financeCategoriesView.map((category) => {
                  const meta = getFinanceCategoryMeta(category.name);
                  const over = (category.overBy ?? 0) > 0;
                  return (
                    <article key={category.id} className={styles.financeCategoryCard}>
                      <div className={styles.financeCategoryHead}>
                        <div className={styles.financeCategoryLead}>
                          <span className={[styles.financeCategoryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                            <PulseIcon name={meta.icon} className={styles.financeCategoryIcon} />
                          </span>
                          <strong>{category.name}</strong>
                        </div>
                        {over ? <span className={styles.financeWarningPill}><PulseIcon name="warning" className={styles.financeInlinePillIcon} /></span> : null}
                      </div>
                      <div className={[styles.financeProgress, over ? styles.financeProgressDanger : ''].filter(Boolean).join(' ')}><span style={{ width: `${Math.max(6, category.percent ?? 0)}%` }} /></div>
                      <div className={styles.financeCategoryMeta}>
                        <strong className={over ? styles.financeAmountExpense : ''}>{formatMoney(category.spent ?? 0)}</strong>
                        <span>из {formatMoney(category.limitAmount ?? 0)}</span>
                      </div>
                    </article>
                  );
                })}
                {!financeCategoriesView.length ? <div className={styles.emptyText}>Сначала добавь категории и расходы — тогда здесь появится наглядная разбивка.</div> : null}
              </div>

              <section className={styles.financePanelSurface}>
                <div className={styles.financePanelHeader}>
                  <div className={styles.financePanelTitle}>Список расходов</div>
                </div>
                <div className={styles.financeEntryList}>
                  {expenseEntries.map((entry) => {
                    const meta = getFinanceCategoryMeta(entry.categoryName ?? entry.title);
                    const recurrenceLabel = getRecurrenceLabel(entry.recurrenceJson);
                    return (
                      <div key={entry.id} className={styles.financeEntryRow}>
                        <div className={styles.financeEntryLead}>
                          <span className={[styles.financeEntryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                            <PulseIcon name={meta.icon} className={styles.financeEntryIcon} />
                          </span>
                          <div className={styles.financeEntryText}>
                            <strong>{entry.title}</strong>
                            <span>{entry.categoryName ?? 'Без категории'} {recurrenceLabel ? <em className={styles.financeRecurringPill}>{recurrenceLabel}</em> : null}</span>
                          </div>
                        </div>
                        <div className={styles.financeEntrySide}>
                          <strong className={styles.financeAmountExpense}>{formatMoney(-entry.amount)}</strong>
                          <span>{formatTimeLabel(entry.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!expenseEntries.length ? <div className={styles.emptyText}>На выбранный день расходов пока нет.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'income' ? (
            <>
              <div className={styles.financeToolbarTop}>
                <button type="button" className={styles.goalAddButton} onClick={() => {
                  setFinanceForm((prev) => ({ ...prev, type: 'INCOME' }));
                  setFinanceModalOpen(true);
                }}>
                  <PulseIcon name="plus" className={styles.goalAddIcon} />
                  <span>Добавить доход</span>
                </button>
              </div>

              <div className={styles.financeMetricGrid}>
                <section className={styles.financeMetricCard}>
                  <div className={styles.financeMetricLead}>
                    <span className={[styles.financeMetricIconWrap, styles.financeToneGreen].join(' ')}><PulseIcon name="trend" className={styles.financeMetricIcon} /></span>
                    <div>
                      <span>Доход за месяц</span>
                      <strong className={styles.financeAmountIncome}>{formatMoney(monthlyIncome)}</strong>
                    </div>
                  </div>
                </section>
                <section className={styles.financeMetricCard}>
                  <div className={styles.financeMetricLead}>
                    <span className={[styles.financeMetricIconWrap, styles.financeToneOrange].join(' ')}><PulseIcon name="card" className={styles.financeMetricIcon} /></span>
                    <div>
                      <span>Средний доход</span>
                      <strong>{formatMoney(averageIncome)}</strong>
                    </div>
                  </div>
                </section>
              </div>

              <section className={styles.financePanelSurface}>
                <div className={styles.financePanelHeader}>
                  <div className={styles.financePanelTitle}>Список доходов</div>
                </div>
                <div className={styles.financeEntryList}>
                  {incomeEntries.map((entry) => {
                    const meta = getFinanceCategoryMeta(entry.categoryName ?? entry.title);
                    const recurrenceLabel = getRecurrenceLabel(entry.recurrenceJson);
                    return (
                      <div key={entry.id} className={styles.financeEntryRow}>
                        <div className={styles.financeEntryLead}>
                          <span className={[styles.financeEntryIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}>
                            <PulseIcon name={meta.icon} className={styles.financeEntryIcon} />
                          </span>
                          <div className={styles.financeEntryText}>
                            <strong>{entry.title}</strong>
                            <span>{entry.categoryName ?? 'Без категории'} {recurrenceLabel ? <em className={styles.financeRecurringPill}>{recurrenceLabel}</em> : null}</span>
                          </div>
                        </div>
                        <div className={styles.financeEntrySide}>
                          <strong className={styles.financeAmountIncome}>{formatMoney(entry.amount)}</strong>
                          <span>{formatShortDate(entry.date)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!incomeEntries.length ? <div className={styles.emptyText}>На выбранный день доходов пока нет.</div> : null}
                </div>
              </section>
            </>
          ) : null}

          {financeSubTab === 'savings' ? (
            <>
              <div className={styles.financeToolbarTop}>
                <button type="button" className={styles.goalAddButton} onClick={() => setSavingsModalOpen(true)}>
                  <PulseIcon name="plus" className={styles.goalAddIcon} />
                  <span>Добавить цель</span>
                </button>
              </div>

              <section className={styles.financeSectionSurface}>
                <div className={styles.financeSectionTitle}><PulseIcon name="target" className={styles.sectionIconAccent} />Накопления</div>
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
                      <div className={styles.financeSavingsMetrics}>
                        <span>Накоплено</span>
                        <strong>{formatMoney(goal.savedAmount)}</strong>
                      </div>
                      <div className={styles.financeProgress}><span style={{ width: `${goal.progress}%` }} /></div>
                      <div className={styles.financeSavingsFooter}>
                        <span>0 ₽</span>
                        <span>{formatMoney(goal.targetAmount)}</span>
                      </div>
                      {goal.itemsJson?.length ? <div className={styles.financeSubItems}>{goal.itemsJson.map((item) => `${item.title} — ${formatMoney(item.amount)}`).join(' · ')}</div> : null}
                    </article>
                  ))}
                  {!savingsGoalsView.length ? <div className={styles.emptyText}>Добавь финансовую цель, чтобы видеть движение к крупным покупкам отдельно от ежедневных трат.</div> : null}
                </div>
              </section>

              <div className={styles.financeToolbarTop}>
                <button type="button" className={styles.goalAddButton} onClick={() => { resetDebtForm(); setDebtModalOpen(true); }}>
                  <PulseIcon name="plus" className={styles.goalAddIcon} />
                  <span>Добавить долг</span>
                </button>
              </div>

              <section className={styles.financeSectionSurface}>
                <div className={styles.financeSectionTitle}><PulseIcon name="card" className={styles.sectionIconAccent} />Кредиты и долги</div>
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
              <section className={styles.financeComparisonSurface}>
                <div className={styles.financeSectionTitle}><PulseIcon name="trend" className={styles.sectionIconAccent} />Финансовый обзор</div>
                <div className={styles.financeComparisonGrid}>
                  <article className={styles.financeComparisonCard}>
                    <span>Доходы месяца</span>
                    <strong>{formatMoney(monthlyIncome)}</strong>
                    <em className={styles.financeAmountIncome}>{monthlyIncome > monthlyExpenses ? 'Поступления покрывают расходы' : 'Нужен контроль входящего потока'}</em>
                  </article>
                  <article className={styles.financeComparisonCard}>
                    <span>Расходы месяца</span>
                    <strong>{formatMoney(monthlyExpenses)}</strong>
                    <em className={styles.financeAmountExpense}>{financeStatsRows[0]?.name ? `Главная категория: ${financeStatsRows[0].name}` : 'Появится после первых расходов'}</em>
                  </article>
                  <article className={styles.financeComparisonCard}>
                    <span>Чистый баланс</span>
                    <strong>{formatMoney(monthlyBalance)}</strong>
                    <em className={monthlyBalance >= 0 ? styles.financeAmountIncome : styles.financeAmountExpense}>{monthlyBalance >= 0 ? 'Есть финансовая подушка' : 'Баланс требует внимания'}</em>
                  </article>
                </div>
              </section>

              <div className={styles.financeStatsDashboard}>
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
                          <span
                            className={[
                              styles.financeLaneFill,
                              item.tone === 'income'
                                ? styles.financeLaneFillIncome
                                : item.tone === 'expense'
                                  ? styles.financeLaneFillExpense
                                  : item.tone === 'neutral'
                                    ? styles.financeLaneFillNeutral
                                    : styles.financeLaneFillAccent,
                            ].join(' ')}
                            style={{ width: `${Math.max(10, Math.round((item.value / financeCompositionMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.financeSectionSurface}>
                  <div className={styles.financeSectionTitle}><PulseIcon name="trend" className={styles.sectionIconAccent} />Операции за выбранный день</div>
                  <FinanceTrendChart items={financeTrendPoints} />
                </section>
              </div>

              <div className={styles.financeSplitGrid}>
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

                  <section className={styles.financeSectionSurface}>
                    <div className={styles.financeSectionTitle}><PulseIcon name="calendar" className={styles.sectionIconAccent} />Ближайшие платежи</div>
                    <div className={styles.financePaymentsList}>
                      {upcomingPayments.map((payment, index) => (
                        <div key={`${payment.title}-${index}`} className={styles.financePaymentRow}>
                          <div>
                            <strong>{payment.title}</strong>
                            <span>{payment.kind}</span>
                          </div>
                          <div className={styles.financePaymentSide}>
                            <strong>{formatMoney(payment.amount)}</strong>
                            <span>{formatShortDate(payment.date)} ({getDaysUntilLabel(payment.date, selectedDate)})</span>
                          </div>
                        </div>
                      ))}
                      {!upcomingPayments.length ? <div className={styles.emptyText}>Ближайших обязательных платежей пока нет.</div> : null}
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {mainTab === 'analytics' ? (
        <div className={styles.grid}>
          <Card className={styles.span4}>
            <CardHeader title="Ментальное здоровье" action={<span className={styles.badgeSoft}>7 дней</span>} />
            <div className={styles.metricRow}>
              <div className={styles.metricCard}><span>Общее состояние</span><strong>{pulseDay?.mental7Score ?? 0}%</strong></div>
              <div className={styles.metricCard}><span>Сегодня</span><strong>{pulseDay?.dayScore ?? 0}%</strong></div>
            </div>
            <TinyLineChart items={(analyticsData?.healthRows ?? []).map((row) => ({ date: row.date, todayScore: row.todayScore, pulse7Score: row.pulse7Score }))} keyProp="todayScore" secondaryKey="pulse7Score" />
          </Card>

          <Card className={styles.span4}>
            <CardHeader title="Калории и вес" />
            <TinyLineChart items={(analyticsData?.calorieLine ?? []).map((row) => ({ date: row.date, calories: row.calories, target: row.target }))} keyProp="calories" secondaryKey="target" />
            <TinyLineChart items={(analyticsData?.weightLine ?? []).map((row) => ({ date: row.date, value: row.value }))} keyProp="value" />
          </Card>

          <Card className={styles.span4}>
            <CardHeader title="Привычки и задачи" />
            <TinyLineChart items={(analyticsData?.taskSeries ?? []).map((row) => ({ date: row.date, percent: row.percent }))} keyProp="percent" />
            <div className={styles.list}>
              {(analyticsData?.habitStreaks ?? []).map((habit) => (
                <div key={habit.id} className={styles.listItem}>
                  <strong>{habit.title}</strong>
                  <span className={styles.badgeSoft}>{habit.streak} дн. подряд</span>
                </div>
              ))}
              {!analyticsData?.habitStreaks?.length ? <div className={styles.emptyText}>Когда появятся привычки, здесь будут их стрики.</div> : null}
            </div>
          </Card>

          <Card className={styles.span8}>
            <CardHeader title="Подсказки по Pulse" />
            <div className={styles.recommendations}>
              {(analyticsData?.suggestions ?? []).map((item) => (
                <div key={item} className={styles.tipItem}>• {item}</div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {mainTab === 'config' ? (
        <div className={styles.configScene}>
          <section className={styles.configHeroCard}>
            <div>
              <div className={styles.configHeroTitle}><PulseIcon name="spark" className={styles.sectionIconAccent} />Конфигурация трекеров</div>
              <p className={styles.configHeroSubtitle}>Выберите, какие модули будут активны в вашем Pulse и как трекеры взаимодействуют между собой.</p>
            </div>
            <span className={styles.configHeroBadge}>{financeActiveModules.length} активно</span>
          </section>

          <section className={styles.configSectionCard}>
            <div className={styles.configSectionTitle}><PulseIcon name="heart" className={styles.healthSubnavIcon} />Трекер здоровья</div>
            <div className={styles.configModuleList}>
              {[
                { key: 'healthEnabled', title: 'Трекер здоровья', description: 'Общий модуль здоровья', icon: 'heart' as PulseIconName },
                { key: 'mentalEnabled', title: 'Ментальное здоровье', description: 'Отслеживание состояния, сна, стресса и продуктивности', icon: 'brain' as PulseIconName },
                { key: 'nutritionEnabled', title: 'Питание', description: 'Подсчёт калорий, БЖУ и приёмов пищи', icon: 'meal' as PulseIconName },
              ].map((item) => {
                const enabled = Boolean((config as any)?.[item.key]);
                return (
                  <article key={item.key} className={styles.configModuleRow}>
                    <div className={styles.configModuleLead}>
                      <span className={styles.configModuleIcon}><PulseIcon name={item.icon} className={styles.healthSubnavIcon} /></span>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </div>
                    </div>
                    <button type="button" className={[styles.configSwitch, enabled ? styles.configSwitchActive : ''].filter(Boolean).join(' ')} onClick={() => handleConfigToggle(item.key as keyof NonNullable<typeof config>)} disabled={configSaving} aria-pressed={enabled}>
                      <span />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.configSectionCard}>
            <div className={styles.configSectionTitle}><PulseIcon name="check" className={styles.healthSubnavIcon} />Трекер задач</div>
            <div className={styles.configModuleList}>
              {[{ key: 'tasksEnabled', title: 'Трекер задач', description: 'Задачи, привычки и глобальные цели', icon: 'check' as PulseIconName }].map((item) => {
                const enabled = Boolean((config as any)?.[item.key]);
                return (
                  <article key={item.key} className={styles.configModuleRow}>
                    <div className={styles.configModuleLead}>
                      <span className={styles.configModuleIcon}><PulseIcon name={item.icon} className={styles.healthSubnavIcon} /></span>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </div>
                    </div>
                    <button type="button" className={[styles.configSwitch, enabled ? styles.configSwitchActive : ''].filter(Boolean).join(' ')} onClick={() => handleConfigToggle(item.key as keyof NonNullable<typeof config>)} disabled={configSaving} aria-pressed={enabled}>
                      <span />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.configSectionCard}>
            <div className={styles.configSectionTitle}><PulseIcon name="wallet" className={styles.healthSubnavIcon} />Трекер финансов</div>
            <div className={styles.configModuleList}>
              {[
                { key: 'financeEnabled', title: 'Трекер финансов', description: 'Доходы, расходы, накопления и долги', icon: 'wallet' as PulseIconName },
                { key: 'duplicateRecurringExpensesToTasks', title: 'Дублировать регулярные расходы в задачи', description: 'Коммуналка, подписки и другие повторяющиеся платежи появятся в трекере задач', icon: 'calendar' as PulseIconName },
                { key: 'duplicateDebtPaymentsToTasks', title: 'Дублировать дни оплаты кредитов в задачи', description: 'Платежи по кредитам и долгам будут появляться в трекере задач', icon: 'card' as PulseIconName },
              ].map((item) => {
                const enabled = Boolean((config as any)?.[item.key]);
                return (
                  <article key={item.key} className={styles.configModuleRow}>
                    <div className={styles.configModuleLead}>
                      <span className={styles.configModuleIcon}><PulseIcon name={item.icon} className={styles.healthSubnavIcon} /></span>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </div>
                    </div>
                    <button type="button" className={[styles.configSwitch, enabled ? styles.configSwitchActive : ''].filter(Boolean).join(' ')} onClick={() => handleConfigToggle(item.key as keyof NonNullable<typeof config>)} disabled={configSaving} aria-pressed={enabled}>
                      <span />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.configActiveCard}>
            <div className={styles.configSectionTitle}><PulseIcon name="pulse" className={styles.healthSubnavIcon} />Активные модули</div>
            <div className={styles.configActiveTags}>
              {financeActiveModules.map((item) => (
                <span key={item} className={styles.configActiveTag}>{item}</span>
              ))}
            </div>
            <p className={styles.configHeroSubtitle}>Отключённые модули не будут отображаться в навигации и на странице Pulse.</p>
          </section>
        </div>
      ) : null}

      <Modal
        open={mealModalOpen}
        onClose={() => setMealModalOpen(false)}
        title="Добавить приём пищи"
        subtitle="Найдите продукты или соберите свой приём пищи из популярных вариантов."
        icon={<PulseIcon name="meal" className={styles.modalHeaderSvg} />}
        size="lg"
      >
        <div className={styles.modalStack}>
          <Field label="Название приёма пищи"><input placeholder="Например, Обед или Перекус" value={mealTitle} onChange={(e) => setMealTitle(e.target.value)} /></Field>
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

          <div className={styles.modalSearchResults}>
            {(foodSearchData?.items ?? []).slice(0, 8).map((food) => (
              <button key={food.id} type="button" className={styles.modalSearchRow} onClick={() => addFoodToMeal(food)}>
                <div>
                  <strong>{food.name}</strong>
                  <span>{food.calories} ккал · {food.defaultGrams ?? 100} г</span>
                </div>
                <span className={styles.modalSearchAction}><PulseIcon name="plus" className={styles.modalInlineIcon} /></span>
              </button>
            ))}
            {!((foodSearchData?.items ?? []).length) && foodSearch.trim() ? <div className={styles.emptyText}>Ничего не найдено. Можно добавить свой продукт ниже.</div> : null}
          </div>

          <div className={styles.modalInlineActions}>
            <button type="button" className={styles.modalSecondaryButton} onClick={() => setFoodModalOpen(true)}>Создать свой продукт</button>
          </div>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Что войдёт в приём пищи</div>
            <div className={styles.modalSelectionList}>
              {mealItems.map((item, index) => (
                <div key={`${item.name}-${index}`} className={styles.modalSelectionRow}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.grams} г · {item.calories} ккал</span>
                  </div>
                  <button type="button" className={styles.taskDeleteButton} onClick={() => setMealItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>Убрать</button>
                </div>
              ))}
              {!mealItems.length ? <div className={styles.emptyText}>Добавь хотя бы один продукт или блюдо.</div> : null}
            </div>
          </div>

          <div className={styles.modalFooterSummary}>
            <strong>Итого: {mealPreviewCalories} ккал</strong>
            <div className={styles.modalActions}>
              <Button onClick={() => setMealModalOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={handleMealSave} disabled={mealSaving || !mealItems.length} loading={mealSaving}>Добавить</Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={foodModalOpen}
        onClose={() => setFoodModalOpen(false)}
        title="Добавить своё блюдо"
        subtitle="Если готового продукта нет в базе, создай его и используй дальше повторно."
        icon={<PulseIcon name="meal" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название"><input placeholder="Например, Домашняя гранола" value={customFoodForm.name} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Ккал"><input value={customFoodForm.calories} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, calories: e.target.value }))} /></Field>
            <Field label="Порция, г"><input value={customFoodForm.grams} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, grams: e.target.value }))} /></Field>
            <Field label="Белки"><input value={customFoodForm.protein} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, protein: e.target.value }))} /></Field>
            <Field label="Жиры"><input value={customFoodForm.fat} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, fat: e.target.value }))} /></Field>
            <Field label="Углеводы"><input value={customFoodForm.carbs} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, carbs: e.target.value }))} /></Field>
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

          <div className={styles.modalActions}>
            <Button onClick={() => setFoodModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateFood} disabled={foodSaving} loading={foodSaving}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Добавить задачу"
        subtitle="Создайте новую задачу или привычку. Время пока не используем, поэтому только суть и тип."
        icon={<PulseIcon name="check" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название задачи"><input placeholder="Что нужно сделать?" value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Тип задачи</div>
            <div className={styles.modalOptionGridWide}>
              {[
                { value: 'ONE_TIME', label: 'Разовая', note: 'Один раз и готово', icon: 'calendar' as const },
                { value: 'REGULAR', label: 'Регулярная', note: 'Повторяется по графику', icon: 'trend' as const },
                { value: 'HABIT', label: 'Привычка', note: 'Закрепляем полезное действие', icon: 'flame' as const },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[styles.modalOptionCard, taskForm.taskType === option.value ? styles.modalOptionCardActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setTaskForm((prev) => ({ ...prev, taskType: option.value as typeof prev.taskType, scheduleType: option.value === 'ONE_TIME' ? 'NONE' : prev.scheduleType }))}
                >
                  <PulseIcon name={option.icon} className={styles.modalOptionIcon} />
                  <strong>{option.label}</strong>
                  <span>{option.note}</span>
                </button>
              ))}
            </div>
          </div>

          {taskForm.taskType === 'REGULAR' ? (
            <div className={styles.modalBlock}>
              <div className={styles.modalBlockTitle}>Как повторять</div>
              <Segmented value={taskForm.scheduleType} onChange={(value) => setTaskForm((prev) => ({ ...prev, scheduleType: value as any }))} options={[{ value: 'WEEKLY', label: 'По дням недели' }, { value: 'MONTHLY', label: 'По дням месяца' }]} />
              {taskForm.scheduleType === 'WEEKLY' ? <div className={styles.weekSelector}>{weekdayLabels.map((label, index) => <button key={label} type="button" className={[styles.weekMini, taskForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')} onClick={() => setTaskForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(index) ? prev.daysOfWeek.filter((item) => item !== index) : [...prev.daysOfWeek, index] }))}>{label}</button>)}</div> : null}
              {taskForm.scheduleType === 'MONTHLY' ? <Field label="Дни месяца через запятую"><input placeholder="Например, 1, 15, 28" value={taskForm.daysOfMonth.join(',')} onChange={(e) => setTaskForm((prev) => ({ ...prev, daysOfMonth: e.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0 && item < 32) }))} /></Field> : null}
            </div>
          ) : null}

          <Field label="Описание (опционально)"><textarea rows={4} placeholder="Добавьте детали, чтобы задача была понятнее" value={taskForm.notes} onChange={(e) => setTaskForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>

          <div className={styles.modalBlock}>
            <div className={styles.modalBlockTitle}>Быстрые шаблоны</div>
            <div className={styles.modalChipRow}>
              {['Утренняя зарядка', 'Выпить воды', 'Прогулка', 'Медитация', 'Чтение'].map((template) => (
                <button key={template} type="button" className={styles.modalChip} onClick={() => setTaskForm((prev) => ({ ...prev, title: template }))}>
                  {template}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <Button onClick={() => setTaskModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateTask} disabled={taskSaving || !taskForm.title.trim()} loading={taskSaving}>Добавить</Button>
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
        onClose={() => setCategoryModalOpen(false)}
        title="Добавить категорию"
        subtitle="Отдельные категории помогают не терять структуру расходов и доходов."
        icon={<PulseIcon name="wallet" className={styles.modalHeaderSvg} />}
      >
        <div className={styles.modalStack}>
          <Field label="Название категории"><input placeholder="Например, Подписки или Подарки" value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <Field label="Месячный лимит, ₽"><input placeholder="0" value={categoryForm.limitAmount} onChange={(e) => setCategoryForm((prev) => ({ ...prev, limitAmount: e.target.value }))} /></Field>
          <div className={styles.modalActions}>
            <Button onClick={() => setCategoryModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateCategory} disabled={categorySaving || !categoryForm.name.trim()} loading={categorySaving}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={financeModalOpen}
        onClose={() => setFinanceModalOpen(false)}
        title={financeForm.type === 'INCOME' ? 'Добавить доход' : 'Добавить расход'}
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
            <Button onClick={() => setFinanceModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleCreateFinanceEntry} disabled={financeSaving || !financeForm.title.trim() || !financeForm.amount.trim()} loading={financeSaving}>Добавить</Button>
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
