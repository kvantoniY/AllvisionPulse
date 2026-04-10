'use client';

import { useSyncExternalStore } from 'react';
import { useGetMeQuery } from '@/shared/api/usersApi';

export type PulseProPlanKey = 'month' | 'quarter' | 'year';

export type PulseProPlan = {
  key: PulseProPlanKey;
  title: string;
  months: number;
  totalPrice: number;
  monthlyPrice: number;
  badge?: string;
  note: string;
};

export type PulseProSubscriptionRecord = {
  username: string;
  planKey: PulseProPlanKey;
  activatedAt: string;
  expiresAt: string;
};

export const PULSE_PRO_PLANS: PulseProPlan[] = [
  {
    key: 'month',
    title: '1 месяц',
    months: 1,
    totalPrice: 217,
    monthlyPrice: 217,
    badge: 'Старт',
    note: '217 руб. за 1 месяц',
  },
  {
    key: 'quarter',
    title: '3 месяца',
    months: 3,
    totalPrice: 534,
    monthlyPrice: 178,
    badge: 'Выгоднее',
    note: 'по 178 руб. в месяц при оплате сразу',
  },
  {
    key: 'year',
    title: '12 месяцев',
    months: 12,
    totalPrice: 1908,
    monthlyPrice: 159,
    badge: 'Максимум',
    note: 'по 159 руб. в месяц при оплате года сразу',
  },
];

const STORAGE_KEY = 'allvision.pulse.pro.stub.v1';
const CHANGE_EVENT = 'av:pulse-pro-change';

let cachedRaw: string | null | undefined;
let cachedRecord: PulseProSubscriptionRecord | null = null;

function isPlanKey(value: unknown): value is PulseProPlanKey {
  return value === 'month' || value === 'quarter' || value === 'year';
}

function parseRecord(raw: string | null): PulseProSubscriptionRecord | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<PulseProSubscriptionRecord> | null;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.username !== 'string' || !value.username.trim()) return null;
    if (!isPlanKey(value.planKey)) return null;
    if (typeof value.activatedAt !== 'string' || Number.isNaN(new Date(value.activatedAt).getTime())) return null;
    if (typeof value.expiresAt !== 'string' || Number.isNaN(new Date(value.expiresAt).getTime())) return null;

    return {
      username: value.username,
      planKey: value.planKey,
      activatedAt: value.activatedAt,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

function getSnapshot(): PulseProSubscriptionRecord | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedRecord;

  cachedRaw = raw;
  cachedRecord = parseRecord(raw);
  return cachedRecord;
}

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const notify = () => onStoreChange();
  window.addEventListener('storage', notify);
  window.addEventListener(CHANGE_EVENT, notify);

  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

function saveRecord(record: PulseProSubscriptionRecord | null) {
  if (typeof window === 'undefined') return;

  if (!record) {
    cachedRaw = null;
    cachedRecord = null;
    window.localStorage.removeItem(STORAGE_KEY);
    emitChange();
    return;
  }

  const raw = JSON.stringify(record);
  cachedRaw = raw;
  cachedRecord = record;
  window.localStorage.setItem(STORAGE_KEY, raw);
  emitChange();
}

export function clearPulseProSubscription() {
  saveRecord(null);
}

function addMonths(base: Date, months: number) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getPulseProPlan(planKey: PulseProPlanKey) {
  return PULSE_PRO_PLANS.find((plan) => plan.key === planKey) ?? PULSE_PRO_PLANS[0];
}

export function formatPulseProPrice(value: number) {
  return `${new Intl.NumberFormat('ru-RU').format(value)} руб.`;
}

export function formatPulseProExpiry(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatPulseProRemaining(value?: string | null) {
  if (!value) return null;

  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return null;

  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'срок закончился';

  const totalDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  if (totalDays < 31) return `${totalDays} дн.`;

  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (!days) return `${months} мес.`;
  return `${months} мес. ${days} дн.`;
}

export function isPulseProActive(record?: PulseProSubscriptionRecord | null) {
  if (!record) return false;
  return new Date(record.expiresAt).getTime() > Date.now();
}

export function activatePulseProForUser(username: string, planKey: PulseProPlanKey) {
  const current = getSnapshot();
  const plan = getPulseProPlan(planKey);
  const now = new Date();
  const baseDate = current?.username === username && isPulseProActive(current) ? new Date(current.expiresAt) : now;
  const expiresAt = addMonths(baseDate, plan.months);

  const record: PulseProSubscriptionRecord = {
    username,
    planKey,
    activatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  saveRecord(record);
  return record;
}

export function usePulseProSubscription() {
  const { data } = useGetMeQuery();
  const currentUser = data?.user ?? null;
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const isOwnedByCurrentUser = Boolean(currentUser?.username && stored?.username === currentUser.username);
  const record = isOwnedByCurrentUser ? stored : null;
  const isActive = isPulseProActive(record);
  const plan = record ? getPulseProPlan(record.planKey) : null;

  return {
    currentUser,
    record,
    plan,
    isActive,
    status: !record ? 'inactive' : isActive ? 'active' : 'expired',
    expiresAt: record?.expiresAt ?? null,
    expiresAtLabel: formatPulseProExpiry(record?.expiresAt),
    remainingLabel: isActive ? formatPulseProRemaining(record?.expiresAt) : null,
    activate: (planKey: PulseProPlanKey) => {
      if (!currentUser?.username) return null;
      return activatePulseProForUser(currentUser.username, planKey);
    },
    clear: () => {
      clearPulseProSubscription();
    },
  } as const;
}

export function usePulseProBadge(username?: string | null) {
  const { data } = useGetMeQuery();
  const currentUser = data?.user ?? null;
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!username || !currentUser?.username) return false;
  if (username !== currentUser.username) return false;
  if (stored?.username !== currentUser.username) return false;

  return isPulseProActive(stored);
}
