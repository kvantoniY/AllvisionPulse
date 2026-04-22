'use client';

import { useMemo } from 'react';
import {
  useGetAnalyticsQuery,
  useGetFinanceOverviewQuery,
  useGetMentalDayQuery,
  useGetNutritionQuery,
  useGetOverviewQuery,
  useGetProfileQuery,
  useGetTasksDayQuery,
  useGetTasksRangeQuery,
} from '@/shared/api/pulseApi';
import type { PulseTaskItem } from '@/shared/types/pulse';
import {
  PILLAR_LABELS,
  PILLAR_WEIGHTS,
  combineStateScore,
  computeActivityLevel,
  computeStreak,
  statusFromScore,
} from '../lib/score';
import {
  bootstrapHintsFor,
  computeSignals,
  isBootstrapping,
} from '../lib/bootstrap';
import {
  computeAvatarState,
  computeBmi,
  pickScenario,
} from '../lib/scenario';
import type { PillarKey, PillarState, StreakSummary, WeightSummary } from '../lib/types';
import { useAvatarCustomization } from './useAvatarCustomization';

function fmtToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeDateKey(value?: string | null): string | null {
  if (!value) return null;
  return value.split('T')[0] ?? null;
}

function getWeekRange(base: string): { from: string; to: string; days: string[] } {
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const jsDay = date.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
  }
  return { from: days[0]!, to: days[6]!, days };
}

export type GameHabit = {
  task: PulseTaskItem;
  completionByDate: Record<string, boolean>;
  streak: number;
};

export function useGameState(selectedDate?: string) {
  const today = useMemo(() => selectedDate ?? fmtToday(), [selectedDate]);
  const weekRange = useMemo(() => getWeekRange(today), [today]);
  const { gender } = useAvatarCustomization();

  const { data: overviewData, isLoading: loadingOverview } = useGetOverviewQuery(today);
  const { data: profileData } = useGetProfileQuery();
  const { data: mentalData } = useGetMentalDayQuery(today);
  const { data: nutritionData } = useGetNutritionQuery(today);
  const { data: tasksData } = useGetTasksDayQuery(today);
  const { data: tasksRangeData } = useGetTasksRangeQuery({ from: weekRange.from, to: weekRange.to });
  const { data: financeData } = useGetFinanceOverviewQuery({ date: today, period: 'month' });
  const { data: analyticsData } = useGetAnalyticsQuery(7);
  const { data: streakAnalyticsData } = useGetAnalyticsQuery(45);

  const overview = overviewData;
  const profile = profileData?.profile ?? null;

  const mealsCount = nutritionData?.meals?.length ?? 0;
  const financeEntries = financeData?.entries ?? [];
  const tasksTotal = overview?.today?.tasksTotal ?? 0;
  const tasksDone = overview?.today?.tasksDone ?? 0;
  const actualToday = useMemo(() => fmtToday(), []);
  const streakAnchorDate = useMemo(
    () => (today > actualToday ? actualToday : today),
    [actualToday, today],
  );

  const streakActiveDates = useMemo(() => {
    const dates = new Set<string>();

    (streakAnalyticsData?.healthRows ?? []).forEach((row) => {
      const date = normalizeDateKey(row.date);
      if (date) dates.add(date);
    });

    (streakAnalyticsData?.calorieLine ?? []).forEach((row) => {
      const date = normalizeDateKey(row.date);
      if (date && row.calories > 0) dates.add(date);
    });

    (streakAnalyticsData?.taskSeries ?? []).forEach((row) => {
      const date = normalizeDateKey(row.date);
      if (date && row.completed > 0) dates.add(date);
    });

    financeEntries.forEach((entry) => {
      const date = normalizeDateKey(entry.date);
      if (date) dates.add(date);
    });

    return dates;
  }, [
    streakAnalyticsData?.calorieLine,
    streakAnalyticsData?.healthRows,
    streakAnalyticsData?.taskSeries,
    financeEntries,
  ]);

  const rangeTasks = tasksRangeData?.items ?? [];
  const habitTasks = useMemo(
    () => rangeTasks.filter((task) => task.taskType === 'HABIT'),
    [rangeTasks],
  );

  const habitMap = useMemo(() => {
    const map = new Map<string, GameHabit>();
    const streakInput = new Map<string, number>();
    (analyticsData?.habitStreaks ?? []).forEach((item) => streakInput.set(item.id, item.streak));

    habitTasks.forEach((task) => {
      const existing = map.get(task.id);
      const day = task.dueDate ? task.dueDate.split('T')[0]! : '';
      const completion = Boolean(task.completedForDate);
      if (existing) {
        if (day) existing.completionByDate[day] = completion;
      } else {
        map.set(task.id, {
          task,
          completionByDate: day ? { [day]: completion } : {},
          streak: streakInput.get(task.id) ?? 0,
        });
      }
    });

    // Also include today-only habit tasks so the user sees their freshly created ones
    (tasksData?.items ?? []).filter((task) => task.taskType === 'HABIT').forEach((task) => {
      if (!map.has(task.id)) {
        const day = task.dueDate ? task.dueDate.split('T')[0]! : today;
        map.set(task.id, {
          task,
          completionByDate: { [day]: Boolean(task.completedForDate) },
          streak: streakInput.get(task.id) ?? 0,
        });
      }
    });

    return map;
  }, [habitTasks, tasksData?.items, analyticsData?.habitStreaks, today]);

  const habits = useMemo(() => Array.from(habitMap.values()), [habitMap]);

  const mentalFilled = Boolean(mentalData?.day);
  const signals = useMemo(
    () => computeSignals(
      overview,
      profile,
      mealsCount,
      tasksTotal,
      habits.length,
      financeEntries.length,
      mentalFilled,
    ),
    [overview, profile, mealsCount, tasksTotal, habits.length, financeEntries.length, mentalFilled],
  );

  const bootstrap = isBootstrapping(signals);

  const mentalScore = mentalFilled ? (mentalData?.day?.todayScore ?? null) : null;
  const nutritionScore: number | null = signals.hasMeals ? Math.round(nutritionData?.averageNutritionScore ?? 0) * 10 : null;

  const tasksScore: number | null = signals.hasTasks
    ? Math.round(overview?.today?.tasksPercent ?? overview?.tasks?.percent ?? 0)
    : null;

  const habitsScore: number | null = (() => {
    if (!habits.length) return null;
    const total = habits.length;
    const completedToday = habits.filter((h) => h.completionByDate[today]).length;
    return Math.round((completedToday / total) * 100);
  })();

  const financeScore: number | null = (() => {
    if (!signals.hasFinance) return null;
    const over = overview?.finance?.overLimitCategories?.length ?? 0;
    const upcoming = overview?.finance?.upcomingPayments?.length ?? 0;
    if (over === 0 && upcoming === 0) return 90;
    if (over === 0) return 75;
    if (over <= 1) return 60;
    return 40;
  })();

  const pillars: PillarState[] = useMemo(() => [
    {
      key: 'mental',
      label: PILLAR_LABELS.mental,
      score: mentalScore,
      status: statusFromScore(mentalScore, bootstrap),
      hint: bootstrapHintsFor(signals).mental,
      weightShare: PILLAR_WEIGHTS.mental,
    },
    {
      key: 'nutrition',
      label: PILLAR_LABELS.nutrition,
      score: nutritionScore,
      status: statusFromScore(nutritionScore, bootstrap),
      hint: bootstrapHintsFor(signals).nutrition,
      weightShare: PILLAR_WEIGHTS.nutrition,
    },
    {
      key: 'tasks',
      label: PILLAR_LABELS.tasks,
      score: tasksScore,
      status: statusFromScore(tasksScore, bootstrap),
      hint: bootstrapHintsFor(signals).tasks,
      weightShare: PILLAR_WEIGHTS.tasks,
    },
    {
      key: 'habits',
      label: PILLAR_LABELS.habits,
      score: habitsScore,
      status: statusFromScore(habitsScore, bootstrap),
      hint: bootstrapHintsFor(signals).habits,
      weightShare: PILLAR_WEIGHTS.habits,
    },
    {
      key: 'finance',
      label: PILLAR_LABELS.finance,
      score: financeScore,
      status: statusFromScore(financeScore, bootstrap),
      hint: bootstrapHintsFor(signals).finance,
      weightShare: PILLAR_WEIGHTS.finance,
    },
  ], [mentalScore, nutritionScore, tasksScore, habitsScore, financeScore, bootstrap, signals]);

  const stateScore = combineStateScore(pillars, bootstrap);
  const knownPillars = pillars.filter((p) => p.score != null).length;
  const activity = bootstrap
    ? Math.max(3, computeActivityLevel(stateScore, knownPillars, pillars.length))
    : computeActivityLevel(stateScore, knownPillars, pillars.length);

  const streak: StreakSummary = {
    ...computeStreak(streakActiveDates, streakAnchorDate, 30),
    anchorDate: streakAnchorDate,
  };

  const bmi = computeBmi(profile?.currentWeightKg ?? null, profile?.heightCm ?? null);

  const scenario = pickScenario({
    bootstrap,
    stateScore,
    mentalScore,
    sleepHours: mentalData?.day?.sleepHours ?? null,
    activity,
  });

  const weight: WeightSummary = {
    current: profile?.currentWeightKg ?? null,
    target: profile?.targetWeightKg ?? null,
    start: profile?.startWeightKg ?? null,
    deltaToGoal:
      profile?.currentWeightKg != null && profile?.targetWeightKg != null
        ? Number((profile.currentWeightKg - profile.targetWeightKg).toFixed(1))
        : null,
    weekDelta: profileData?.weightDelta?.delta ?? null,
  };

  const avatar = computeAvatarState({
    scenario,
    stateScore,
    mentalScore,
    bmi,
    deltaToGoal: weight.deltaToGoal,
    gender,
  });

  const hints = bootstrapHintsFor(signals);

  return {
    today,
    weekRange,
    loading: loadingOverview,
    bootstrap,
    signals,
    hints,
    overview,
    profile,
    profileSuggestion: profileData?.suggestion,
    mentalDay: mentalData?.day ?? null,
    mental: {
      score: mentalScore,
      autoProductivity: mentalData?.autoProductivity ?? null,
      autoNutrition: mentalData?.autoNutrition ?? null,
    },
    nutrition: {
      meals: nutritionData?.meals ?? [],
      totalCalories: nutritionData?.totalCalories ?? 0,
      totalProtein: nutritionData?.totalProtein ?? 0,
      totalFat: nutritionData?.totalFat ?? 0,
      totalCarbs: nutritionData?.totalCarbs ?? 0,
      goal: nutritionData?.goal ?? null,
      remainingCalories: nutritionData?.remainingCalories ?? null,
      averageScore: nutritionData?.averageNutritionScore ?? 0,
      recentItems: nutritionData?.recentItems ?? [],
    },
    tasks: {
      items: tasksData?.items ?? [],
      summary: tasksData?.summary ?? { total: 0, completed: 0, percent: 0, productivityScore: 0 },
      goals: tasksData?.goals ?? [],
    },
    habits,
    weekRangeDays: weekRange.days,
    finance: {
      entries: financeEntries,
      overview: financeData?.overview ?? overviewData ?? null,
      categories: financeData?.categories ?? [],
      goals: financeData?.goals ?? [],
      debts: financeData?.debts ?? [],
      monthIncome: overview?.finance?.monthIncome ?? 0,
      monthExpenses: overview?.finance?.monthExpenses ?? 0,
      balance: overview?.finance?.balance ?? 0,
      todaysExpenses: overview?.today?.todaysExpenses ?? 0,
      todaysIncome: overview?.today?.todaysIncome ?? 0,
      overLimitCategories: overview?.finance?.overLimitCategories ?? [],
      upcomingPayments: overview?.finance?.upcomingPayments ?? [],
    },
    pillars,
    stateScore,
    activity,
    streak,
    bmi,
    scenario,
    avatar,
    weight,
    analytics: analyticsData,
  };
}

export type GameState = ReturnType<typeof useGameState>;

export const pillarKeys: PillarKey[] = ['mental', 'nutrition', 'tasks', 'habits', 'finance'];
