import type { PulseOverview, PulseProfile } from '@/shared/types/pulse';

export type BootstrapSignals = {
  hasWeight: boolean;
  hasMeals: boolean;
  hasTasks: boolean;
  hasHabits: boolean;
  hasFinance: boolean;
  hasMental: boolean;
};

export function computeSignals(
  overview: PulseOverview | undefined,
  profile: PulseProfile | null | undefined,
  mealsCount: number,
  tasksCount: number,
  habitsCount: number,
  financeEntriesCount: number,
  mentalFilled: boolean,
): BootstrapSignals {
  return {
    hasWeight: Boolean(profile?.currentWeightKg),
    hasMeals: mealsCount > 0 || (overview?.today?.caloriesConsumed ?? 0) > 0,
    hasTasks: tasksCount > 0 || (overview?.today?.tasksTotal ?? 0) > 0,
    hasHabits: habitsCount > 0,
    hasFinance: financeEntriesCount > 0 || (overview?.today?.todaysExpenses ?? 0) > 0 || (overview?.today?.todaysIncome ?? 0) > 0,
    hasMental: mentalFilled,
  };
}

export function isBootstrapping(signals: BootstrapSignals): boolean {
  const filled = Object.values(signals).filter(Boolean).length;
  return filled < 3;
}

export function bootstrapHintsFor(signals: BootstrapSignals): Record<string, string | null> {
  return {
    weight: signals.hasWeight ? null : 'Укажи вес',
    nutrition: signals.hasMeals ? null : 'Запиши приём пищи',
    tasks: signals.hasTasks ? null : 'Добавь 1 задачу',
    habits: signals.hasHabits ? null : 'Создай первую привычку',
    finance: signals.hasFinance ? null : 'Запиши первую трату',
    mental: signals.hasMental ? null : 'Отметь самочувствие',
  };
}
