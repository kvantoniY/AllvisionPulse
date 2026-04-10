'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useCreateShareArtifactMutation,
  useGetProgramTodayActionsQuery,
  useListAchievementsQuery,
  useListProgramsQuery,
  useListShareArtifactsQuery,
} from '@/shared/api/programsApi';
import {
  useGetFinanceOverviewQuery,
  useGetMentalDayQuery,
  useGetNutritionQuery,
  useGetOverviewQuery,
  useGetTasksDayQuery,
} from '@/shared/api/pulseApi';
import type {
  ProgramListItem,
  PulseAchievement,
  PulseShareArtifactKind,
  ShareArtifact,
} from '@/shared/types/programs';
import type {
  PulseDebt,
  PulseFinanceEntry,
  PulseSavingsGoal,
  PulseTaskItem,
} from '@/shared/types/pulse';
import { PulseShareCard } from '@/shared/ui/PulseShareCard/PulseShareCard';
import styles from './PulseSharePicker.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (artifact: ShareArtifact) => void;
  title?: string;
  subtitle?: string;
};

type PickerView = 'all' | 'overview' | 'tasks' | 'programs' | 'nutrition' | 'finance' | 'achievements' | 'recent';
type QuickCategory = Exclude<PickerView, 'all' | 'recent'>;
type SortMode = 'recent' | 'title' | 'kind';
type PickerIcon = 'pulse' | 'checkDouble' | 'clock' | 'heart' | 'shield' | 'sparkles' | 'paperclip' | 'flame';

type QuickShareOption = {
  id: string;
  category: QuickCategory;
  title: string;
  subtitle: string;
  meta?: string;
  badge?: string;
  icon: PickerIcon;
  priority: number;
  searchText: string;
  config: {
    sourceType: string;
    sourceId?: string | null;
    kind: PulseShareArtifactKind;
    mode: 'SNAPSHOT' | 'REFERENCE' | 'INVITE';
    title?: string | null;
    description?: string | null;
    visibilityScope?: 'PRIVATE' | 'RESTRICTED' | 'PUBLIC';
  };
};

const viewOptions: Array<{ key: PickerView; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'overview', label: 'Обзор' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'programs', label: 'Программы' },
  { key: 'nutrition', label: 'Питание' },
  { key: 'finance', label: 'Финансы' },
  { key: 'achievements', label: 'Достижения' },
  { key: 'recent', label: 'Недавние' },
];

const categoryLabels: Record<QuickCategory, string> = {
  overview: 'Обзор',
  tasks: 'Задачи',
  programs: 'Программы',
  nutrition: 'Питание',
  finance: 'Финансы',
  achievements: 'Достижения',
};

const sortOptions: Array<{ key: SortMode; label: string }> = [
  { key: 'recent', label: 'Новые' },
  { key: 'title', label: 'A-Я' },
  { key: 'kind', label: 'По типу' },
];

const sectionMeta: Record<QuickCategory, { title: string; hint: string }> = {
  overview: {
    title: 'Обзор дня',
    hint: 'Собранные карточки по самочувствию и общему состоянию.',
  },
  tasks: {
    title: 'Задачи',
    hint: 'Поделиться всем списком на день или выбрать одну конкретную задачу.',
  },
  programs: {
    title: 'Программы',
    hint: 'Прогресс по активным программам и план на сегодня.',
  },
  nutrition: {
    title: 'Питание',
    hint: 'Дневной баланс питания и калорий.',
  },
  finance: {
    title: 'Финансы',
    hint: 'Обзор дня, отдельные операции, долги и накопления.',
  },
  achievements: {
    title: 'Достижения',
    hint: 'Недавние достижения и важные вехи из Pulse.',
  },
};

function formatMoney(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0 ₽';
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function formatShortDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function taskMeta(task: PulseTaskItem) {
  const bits: string[] = [];
  if (task.timeLabel) bits.push(task.timeLabel);
  if (task.tags.length) bits.push(task.tags.slice(0, 2).join(' • '));
  if (task.completedForDate) bits.push('Выполнена');
  return bits.join(' · ');
}

function programMeta(item: ProgramListItem) {
  if (item.myRun) {
    const pieces = [`${Math.round(item.myRun.completionPercent ?? 0)}%`];
    if (item.today?.dayNumber) pieces.push(`день ${item.today.dayNumber}`);
    if (item.today?.stageTitle) pieces.push(item.today.stageTitle);
    return pieces.join(' · ');
  }
  if (item.session?.title) return item.session.title;
  return item.category || item.theme || 'Карточка программы';
}

function achievementMeta(item: PulseAchievement) {
  return [
    item.definition.kind,
    item.progressValue != null && item.progressMax != null ? `${item.progressValue}/${item.progressMax}` : '',
    formatShortDate(item.awardedAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

function artifactCategory(artifact: ShareArtifact): QuickCategory {
  const sourceType = String(artifact.sourceType ?? '');
  if (sourceType === 'ACHIEVEMENT') return 'achievements';
  if (sourceType === 'PROGRAM' || sourceType === 'PROGRAM_RUN' || sourceType === 'PROGRAM_SESSION' || sourceType === 'SESSION_INVITE' || sourceType === 'TODAY_ACTIONS') return 'programs';
  if (sourceType === 'TASK' || sourceType === 'TASK_DAY') return 'tasks';
  if (sourceType === 'NUTRITION_DAY') return 'nutrition';
  if (sourceType === 'FINANCE_OVERVIEW' || sourceType === 'FINANCE_ENTRY' || sourceType === 'DEBT' || sourceType === 'SAVINGS_GOAL') return 'finance';
  return 'overview';
}

function artifactTitle(artifact: ShareArtifact) {
  const snapshot = (artifact.resolvedSnapshot ?? artifact.snapshotJson ?? null) as Record<string, unknown> | null;
  if (typeof snapshot?.title === 'string' && snapshot.title.trim()) return snapshot.title.trim();
  if (typeof artifact.title === 'string' && artifact.title.trim()) return artifact.title.trim();
  return 'Pulse-виджет';
}

function artifactSearchText(artifact: ShareArtifact) {
  const snapshot = (artifact.resolvedSnapshot ?? artifact.snapshotJson ?? null) as Record<string, unknown> | null;
  return [
    artifactTitle(artifact),
    artifact.description ?? '',
    artifact.kind,
    artifact.sourceType,
    typeof snapshot?.description === 'string' ? snapshot.description : '',
    typeof snapshot?.primary === 'string' ? snapshot.primary : '',
    typeof snapshot?.secondary === 'string' ? snapshot.secondary : '',
  ]
    .join(' ')
    .toLowerCase();
}

function compareArtifacts(left: ShareArtifact, right: ShareArtifact, sort: SortMode) {
  if (sort === 'title') return artifactTitle(left).localeCompare(artifactTitle(right), 'ru');
  if (sort === 'kind') {
    const kindCompare = artifactCategory(left).localeCompare(artifactCategory(right), 'ru');
    if (kindCompare !== 0) return kindCompare;
    return artifactTitle(left).localeCompare(artifactTitle(right), 'ru');
  }
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function compareQuickOptions(left: QuickShareOption, right: QuickShareOption, sort: SortMode) {
  if (sort === 'title') return left.title.localeCompare(right.title, 'ru');
  if (sort === 'kind') {
    const categoryCompare = categoryLabels[left.category].localeCompare(categoryLabels[right.category], 'ru');
    if (categoryCompare !== 0) return categoryCompare;
    return left.title.localeCompare(right.title, 'ru');
  }
  return left.priority - right.priority || left.title.localeCompare(right.title, 'ru');
}

function QuickOptionCard({
  option,
  busy,
  onClick,
}: {
  option: QuickShareOption;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={[styles.quickCard, busy ? styles.quickCardBusy : ''].filter(Boolean).join(' ')} onClick={onClick} disabled={busy}>
      <span className={styles.quickIcon}>
        <Icon name={option.icon} size={18} />
      </span>
      <span className={styles.quickBody}>
        <span className={styles.quickTopLine}>
          <strong>{option.title}</strong>
          {option.badge ? <span className={styles.quickBadge}>{option.badge}</span> : null}
        </span>
        <span className={styles.quickSubtitle}>{option.subtitle}</span>
        {option.meta ? <span className={styles.quickMeta}>{option.meta}</span> : null}
      </span>
      <span className={styles.quickAction}>{busy ? 'Прикрепляю...' : 'Прикрепить'}</span>
    </button>
  );
}

export function PulseSharePicker({
  open,
  onClose,
  onPick,
  title = 'Виджет Pulse',
  subtitle = 'Выберите готовый виджет из Pulse или быстро создайте новый прямо из задач, программ, питания и финансов.',
}: Props) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<PickerView>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: shareData, isFetching: shareFetching } = useListShareArtifactsQuery(50, { skip: !open });
  const { data: overviewData, isFetching: overviewFetching } = useGetOverviewQuery(undefined, { skip: !open });
  const { data: mentalData, isFetching: mentalFetching } = useGetMentalDayQuery(undefined, { skip: !open });
  const { data: tasksData, isFetching: tasksFetching } = useGetTasksDayQuery(undefined, { skip: !open });
  const { data: todayActionsData, isFetching: todayActionsFetching } = useGetProgramTodayActionsQuery(undefined, { skip: !open });
  const { data: programsData, isFetching: programsFetching } = useListProgramsQuery('mine', { skip: !open });
  const { data: nutritionData, isFetching: nutritionFetching } = useGetNutritionQuery(undefined, { skip: !open });
  const { data: financeData, isFetching: financeFetching } = useGetFinanceOverviewQuery(undefined, { skip: !open });
  const { data: achievementsData, isFetching: achievementsFetching } = useListAchievementsQuery(undefined, { skip: !open });
  const [createShareArtifact] = useCreateShareArtifactMutation();

  useEffect(() => {
    if (!open) return;
    setView('all');
    setSortMode('recent');
    setSearch('');
    setActionBusyId(null);
    setErrorMessage(null);
  }, [open]);

  const query = deferredSearch.trim().toLowerCase();
  const recentArtifacts = shareData?.items ?? [];

  const quickOptions = useMemo<QuickShareOption[]>(() => {
    const options: QuickShareOption[] = [];
    const pulseDaySubtitle = [
      overviewData?.today?.dayScore != null ? `${Math.round(overviewData.today.dayScore)}% эффективности` : '',
      mentalData?.day?.sleepHours != null ? `сон ${mentalData.day.sleepHours} ч` : '',
      overviewData?.today?.recommendations?.[0] ?? '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Самочувствие, сон и дневной ритм.';

    options.push({
      id: 'overview-day',
      category: 'overview',
      title: 'Пульс дня',
      subtitle: pulseDaySubtitle,
      meta: 'Мгновенный виджет по состоянию на сегодня',
      badge: 'День',
      icon: 'pulse',
      priority: 10,
      searchText: `пульс дня самочувствие здоровье ${pulseDaySubtitle}`.toLowerCase(),
      config: {
        sourceType: 'MENTAL_DAY',
        kind: 'WIDGET',
        mode: 'SNAPSHOT',
        title: 'Пульс дня',
        visibilityScope: 'RESTRICTED',
      },
    });

    const taskSummary = tasksData?.summary;
    const taskDaySubtitle = taskSummary
      ? `${taskSummary.completed}/${taskSummary.total} выполнено · ${Math.round(taskSummary.percent)}% за день`
      : 'Список задач и прогресс за текущий день.';

    options.push({
      id: 'task-day',
      category: 'tasks',
      title: 'Задачи на день',
      subtitle: taskDaySubtitle,
      meta: 'Весь список задач одним виджетом',
      badge: 'День',
      icon: 'checkDouble',
      priority: 10,
      searchText: `задачи на день список задач ${taskDaySubtitle}`.toLowerCase(),
      config: {
        sourceType: 'TASK_DAY',
        kind: 'WIDGET',
        mode: 'SNAPSHOT',
        title: 'Задачи на день',
        visibilityScope: 'RESTRICTED',
      },
    });

    const programDaySubtitle = todayActionsData?.items?.length
      ? `${todayActionsData.items.length} действий · ${todayActionsData.items.slice(0, 2).map((item) => item.title).join(' • ')}`
      : 'План по активным программам на сегодня.';

    options.push({
      id: 'program-day',
      category: 'programs',
      title: 'План по программам',
      subtitle: programDaySubtitle,
      meta: 'Виджет с сегодняшними действиями по программам',
      badge: 'Сегодня',
      icon: 'clock',
      priority: 10,
      searchText: `план программы сегодня действия ${programDaySubtitle}`.toLowerCase(),
      config: {
        sourceType: 'TODAY_ACTIONS',
        kind: 'TODAY_ACTIONS',
        mode: 'SNAPSHOT',
        title: 'План по программам',
        visibilityScope: 'RESTRICTED',
      },
    });

    const nutritionSubtitle = nutritionData
      ? `${Math.round(nutritionData.totalCalories)} ккал · осталось ${nutritionData.remainingCalories == null ? 'без лимита' : Math.max(0, Math.round(nutritionData.remainingCalories))}`
      : 'Калории и баланс питания за день.';

    options.push({
      id: 'nutrition-day',
      category: 'nutrition',
      title: 'Питание за день',
      subtitle: nutritionSubtitle,
      meta: 'Калории, остаток и общий дневной баланс',
      badge: 'Итог',
      icon: 'heart',
      priority: 10,
      searchText: `питание калории еда рацион ${nutritionSubtitle}`.toLowerCase(),
      config: {
        sourceType: 'NUTRITION_DAY',
        kind: 'WIDGET',
        mode: 'SNAPSHOT',
        title: 'Питание за день',
        visibilityScope: 'RESTRICTED',
      },
    });

    const financeSubtitle = financeData
      ? `доход ${formatMoney(financeData.overview.today.todaysIncome)} · расход ${formatMoney(financeData.overview.today.todaysExpenses)}`
      : 'Доходы, расходы, долги и накопления за день.';

    options.push({
      id: 'finance-day',
      category: 'finance',
      title: 'Финансы дня',
      subtitle: financeSubtitle,
      meta: 'Операции, накопления и долги в одном виджете',
      badge: 'Итог',
      icon: 'shield',
      priority: 10,
      searchText: `финансы доход расход долг накопления ${financeSubtitle}`.toLowerCase(),
      config: {
        sourceType: 'FINANCE_OVERVIEW',
        kind: 'FINANCE',
        mode: 'SNAPSHOT',
        title: 'Финансы дня',
        visibilityScope: 'RESTRICTED',
      },
    });

    const taskItems = [...(tasksData?.items ?? [])]
      .sort((left, right) => {
        if (left.completedForDate !== right.completedForDate) return Number(left.completedForDate) - Number(right.completedForDate);
        if (left.priority !== right.priority) return right.priority - left.priority;
        return left.title.localeCompare(right.title, 'ru');
      })
      .slice(0, 6);

    for (const task of taskItems) {
      options.push({
        id: `task:${task.id}`,
        category: 'tasks',
        title: task.title,
        subtitle: task.notes?.trim() || (task.completedForDate ? 'Уже выполнена сегодня' : 'Отдельная задача из Pulse'),
        meta: taskMeta(task),
        badge: task.completedForDate ? 'Готово' : 'Задача',
        icon: 'paperclip',
        priority: task.completedForDate ? 50 : 20,
        searchText: `задача ${task.title} ${task.notes ?? ''} ${task.tags.join(' ')} ${taskMeta(task)}`.toLowerCase(),
        config: {
          sourceType: 'TASK',
          sourceId: task.id,
          kind: 'TASK',
          mode: 'REFERENCE',
          visibilityScope: 'RESTRICTED',
        },
      });
    }

    const programItems = [...(programsData?.items ?? [])]
      .sort((left, right) => {
        const leftRank = left.myRun?.status === 'ACTIVE' ? 0 : left.session?.status === 'ACTIVE' ? 1 : left.myRun ? 2 : 3;
        const rightRank = right.myRun?.status === 'ACTIVE' ? 0 : right.session?.status === 'ACTIVE' ? 1 : right.myRun ? 2 : 3;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, 6);

    for (const item of programItems) {
      const shareRun = item.myRun?.id ? true : false;
      options.push({
        id: `program:${shareRun ? item.myRun?.id : item.id}`,
        category: 'programs',
        title: item.title,
        subtitle: item.description?.trim() || (shareRun ? 'Поделиться текущим прогрессом программы' : 'Карточка программы из Pulse'),
        meta: programMeta(item),
        badge: shareRun ? 'Прогресс' : 'Программа',
        icon: shareRun ? 'sparkles' : 'pulse',
        priority: shareRun ? 20 : 40,
        searchText: `программа ${item.title} ${item.description ?? ''} ${programMeta(item)}`.toLowerCase(),
        config: shareRun
          ? {
              sourceType: 'PROGRAM_RUN',
              sourceId: item.myRun!.id,
              kind: 'PROGRAM_PROGRESS',
              mode: 'SNAPSHOT',
              visibilityScope: 'RESTRICTED',
            }
          : {
              sourceType: 'PROGRAM',
              sourceId: item.id,
              kind: 'PROGRAM',
              mode: 'REFERENCE',
              visibilityScope: 'RESTRICTED',
            },
      });
    }

    const financeEntries = [...(financeData?.entries ?? [])]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 4);

    for (const entry of financeEntries) {
      options.push({
        id: `finance-entry:${entry.id}`,
        category: 'finance',
        title: entry.title,
        subtitle: `${entry.type === 'INCOME' ? 'Доход' : 'Расход'} · ${formatMoney(entry.amount)}`,
        meta: [entry.categoryName, formatShortDate(entry.date)].filter(Boolean).join(' · '),
        badge: entry.type === 'INCOME' ? 'Доход' : 'Расход',
        icon: 'shield',
        priority: entry.type === 'EXPENSE' ? 20 : 25,
        searchText: `финансы ${entry.title} ${entry.categoryName ?? ''} ${entry.notes ?? ''}`.toLowerCase(),
        config: {
          sourceType: 'FINANCE_ENTRY',
          sourceId: entry.id,
          kind: 'FINANCE',
          mode: 'REFERENCE',
          visibilityScope: 'RESTRICTED',
        },
      });
    }

    const debts = [...(financeData?.debts ?? [])]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 3);
    for (const debt of debts) {
      options.push({
        id: `debt:${debt.id}`,
        category: 'finance',
        title: debt.title,
        subtitle: `${formatMoney(debt.paidAmount)} из ${formatMoney(debt.totalAmount)} погашено`,
        meta: debt.notes?.trim() || [debt.debtType, formatShortDate(debt.dueDate)].filter(Boolean).join(' · '),
        badge: 'Долг',
        icon: 'shield',
        priority: 30,
        searchText: `долг ${debt.title} ${debt.notes ?? ''} ${debt.debtType}`.toLowerCase(),
        config: {
          sourceType: 'DEBT',
          sourceId: debt.id,
          kind: 'DEBT',
          mode: 'REFERENCE',
          visibilityScope: 'RESTRICTED',
        },
      });
    }

    const goals = [...(financeData?.goals ?? [])]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 3);
    for (const goal of goals) {
      options.push({
        id: `savings:${goal.id}`,
        category: 'finance',
        title: goal.title,
        subtitle: `${formatMoney(goal.savedAmount)} из ${formatMoney(goal.targetAmount)} накоплено`,
        meta: goal.deadline ? `срок ${formatShortDate(goal.deadline)}` : 'Цель накопления',
        badge: 'Накопление',
        icon: 'flame',
        priority: 31,
        searchText: `накопление цель ${goal.title} ${goal.deadline ?? ''}`.toLowerCase(),
        config: {
          sourceType: 'SAVINGS_GOAL',
          sourceId: goal.id,
          kind: 'SAVINGS',
          mode: 'REFERENCE',
          visibilityScope: 'RESTRICTED',
        },
      });
    }

    const achievements = [...(achievementsData?.items ?? [])]
      .sort((left, right) => new Date(right.awardedAt).getTime() - new Date(left.awardedAt).getTime())
      .slice(0, 4);

    for (const achievement of achievements) {
      options.push({
        id: `achievement:${achievement.id}`,
        category: 'achievements',
        title: achievement.titleSnapshot || achievement.definition.title,
        subtitle: achievement.descriptionSnapshot || achievement.definition.description || 'Достижение из Pulse',
        meta: achievementMeta(achievement),
        badge: 'Веха',
        icon: 'sparkles',
        priority: 20,
        searchText: `достижение ${achievement.titleSnapshot ?? ''} ${achievement.definition.title} ${achievement.definition.description ?? ''}`.toLowerCase(),
        config: {
          sourceType: 'ACHIEVEMENT',
          sourceId: achievement.id,
          kind: 'ACHIEVEMENT',
          mode: 'SNAPSHOT',
          visibilityScope: 'RESTRICTED',
        },
      });
    }

    return options;
  }, [
    achievementsData?.items,
    financeData,
    mentalData?.day,
    nutritionData,
    overviewData?.today,
    programsData?.items,
    tasksData,
    todayActionsData?.items,
  ]);

  const loadingByCategory: Record<QuickCategory, boolean> = {
    overview: overviewFetching || mentalFetching,
    tasks: tasksFetching,
    programs: programsFetching || todayActionsFetching,
    nutrition: nutritionFetching,
    finance: financeFetching,
    achievements: achievementsFetching,
  };

  const filteredQuickOptions = useMemo(() => {
    return quickOptions
      .filter((option) => (view === 'all' || view === 'recent' ? true : option.category === view))
      .filter((option) => (query ? option.searchText.includes(query) : true))
      .sort((left, right) => compareQuickOptions(left, right, sortMode));
  }, [quickOptions, query, sortMode, view]);

  const filteredRecentArtifacts = useMemo(() => {
    return [...recentArtifacts]
      .filter((artifact) => (view === 'all' || view === 'recent' ? true : artifactCategory(artifact) === view))
      .filter((artifact) => (query ? artifactSearchText(artifact).includes(query) : true))
      .sort((left, right) => compareArtifacts(left, right, sortMode));
  }, [query, recentArtifacts, sortMode, view]);

  const quickSections = useMemo(() => {
    return (Object.keys(sectionMeta) as QuickCategory[])
      .map((key) => ({
        key,
        ...sectionMeta[key],
        loading: loadingByCategory[key],
        items: filteredQuickOptions.filter((option) => option.category === key),
      }))
      .filter((section) => view === 'recent' ? false : section.items.length || (view !== 'all' && view === section.key && section.loading));
  }, [filteredQuickOptions, loadingByCategory, view]);

  const totalQuickCount = quickOptions.length;
  const totalRecentCount = recentArtifacts.length;

  const attachCreatedArtifact = async (option: QuickShareOption) => {
    try {
      setActionBusyId(option.id);
      setErrorMessage(null);
      const response = await createShareArtifact(option.config).unwrap();
      onPick(response.artifact);
      onClose();
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    } finally {
      setActionBusyId(null);
    }
  };

  const content = (
    <div className={styles.shell}>
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.heroEyebrow}>Pulse Share</div>
          <div className={styles.heroTitle}>Каталог виджетов Pulse</div>
          <div className={styles.heroSubtitle}>{subtitle}</div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <strong>{totalQuickCount}</strong>
            <span>быстрых источников</span>
          </div>
          <div className={styles.heroStat}>
            <strong>{totalRecentCount}</strong>
            <span>недавних виджетов</span>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <Icon name="search" size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по задачам, программам, питанию и недавним виджетам"
          />
        </label>

        <div className={styles.sortGroup}>
          {sortOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={[styles.sortButton, sortMode === option.key ? styles.sortButtonActive : ''].filter(Boolean).join(' ')}
              onClick={() => setSortMode(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filters}>
        {viewOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={[styles.filterChip, view === option.key ? styles.filterChipActive : ''].filter(Boolean).join(' ')}
            onClick={() => setView(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {errorMessage ? <div className={styles.errorState}>{errorMessage}</div> : null}

      {quickSections.map((section) => (
        <section key={section.key} className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h3>{section.title}</h3>
              <p>{section.hint}</p>
            </div>
            <span className={styles.sectionCount}>
              {section.loading && !section.items.length ? 'Собираю...' : `${section.items.length}`}
            </span>
          </div>

          {section.items.length ? (
            <div className={styles.quickGrid}>
              {section.items.map((option) => (
                <QuickOptionCard
                  key={option.id}
                  option={option}
                  busy={actionBusyId === option.id}
                  onClick={() => void attachCreatedArtifact(option)}
                />
              ))}
            </div>
          ) : section.loading ? (
            <div className={styles.emptyState}>Подтягиваю актуальные данные из Pulse для этой секции...</div>
          ) : null}
        </section>
      ))}

      {(view === 'all' || view === 'recent' || filteredRecentArtifacts.length) ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h3>Недавние виджеты</h3>
              <p>Готовые Pulse-карточки, которые уже создавались раньше и доступны для быстрого прикрепления.</p>
            </div>
            <span className={styles.sectionCount}>{shareFetching && !recentArtifacts.length ? 'Собираю...' : `${filteredRecentArtifacts.length}`}</span>
          </div>

          {shareFetching && !recentArtifacts.length ? (
            <div className={styles.emptyState}>Загружаю недавние Pulse-виджеты...</div>
          ) : null}

          {!shareFetching && !filteredRecentArtifacts.length ? (
            <div className={styles.emptyState}>
              {query
                ? 'По вашему запросу пока ничего не нашлось. Попробуйте другой фильтр или создайте новый виджет выше.'
                : 'Пока нет недавних Pulse-виджетов. Сначала создайте и прикрепите один из быстрых вариантов выше.'}
            </div>
          ) : null}

          {filteredRecentArtifacts.length ? (
            <div className={styles.recentList}>
              {filteredRecentArtifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  className={styles.recentItem}
                  onClick={() => {
                    onPick(artifact);
                    onClose();
                  }}
                >
                  <PulseShareCard artifact={artifact} compact interactive={false} />
                  <span className={styles.recentMeta}>
                    <span>{formatShortDate(artifact.updatedAt) || 'сейчас'}</span>
                    <span>{categoryLabels[artifactCategory(artifact)]}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className={styles.actions}>
        <Button size="sm" onClick={onClose}>
          <Icon name="close" size={14} />
          Закрыть
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={onClose} title={title}>
        {content}
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} icon={<Icon name="sparkles" size={18} />} size="lg" bodyClassName={styles.modalBody}>
      {content}
    </Modal>
  );
}
