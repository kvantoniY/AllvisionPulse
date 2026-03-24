'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Health.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { ProgressRing } from '@/shared/ui/ProgressRing/ProgressRing';
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
  useUpdateNutritionGoalMutation,
  useUpdateProfileMutation,
} from '@/shared/api/pulseApi';
import type { PulseMealItem } from '@/shared/types/pulse';

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
  const makePolyline = (prop: string) => {
    const values = items.map((item) => Number(item[prop] ?? 0));
    const max = Math.max(...values, 1);
    return values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - (value / max) * 90}`).join(' ');
  };

  if (!items.length) {
    return <div className={styles.emptyText}>Пока мало данных для графика</div>;
  }

  return (
    <div className={styles.chartCard}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.chartSvg}>
        {secondaryKey ? <polyline points={makePolyline(secondaryKey)} className={`${styles.chartLine} ${styles.chartLineAlt}`} /> : null}
        <polyline points={makePolyline(keyProp)} className={styles.chartLine} />
      </svg>
      <div className={styles.chartLabels}>
        {items.map((item) => (
          <span key={String(item.date)}>{formatShortDate(String(item.date))}</span>
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

  return (
    <div className={styles.segmented}>
      {normalizedOptions.map((option, index) => (
        <button
          key={`${option.value}-${index}`}
          type="button"
          className={[styles.segment, value === option.value ? styles.segmentActive : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function HealthPage() {
  const today = useMemo(() => fmtDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [mainTab, setMainTab] = useState<'pulse' | 'health' | 'tasks' | 'finance' | 'analytics' | 'config'>('pulse');
  const [healthSubTab, setHealthSubTab] = useState<'mental' | 'nutrition'>('mental');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

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
  const [deletePulseGoal] = useDeletePulseGoalMutation();
  const [createFinanceCategory, { isLoading: categorySaving }] = useCreateFinanceCategoryMutation();
  const [createFinanceEntry, { isLoading: financeSaving }] = useCreateFinanceEntryMutation();
  const [deleteFinanceEntry] = useDeleteFinanceEntryMutation();
  const [createSavingsGoal, { isLoading: savingsSaving }] = useCreateSavingsGoalMutation();
  const [deleteSavingsGoal] = useDeleteSavingsGoalMutation();
  const [createDebt, { isLoading: debtSaving }] = useCreateDebtMutation();
  const [deleteDebt] = useDeleteDebtMutation();

  const config = overviewData?.config;
  const profile = profileData?.profile;
  const profileSuggestion = profileData?.suggestion;
  const weightDelta = profileData?.weightDelta;
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

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
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [debtModalOpen, setDebtModalOpen] = useState(false);

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
    daysOfMonth: [(parseDate(selectedDate) ?? new Date()).getDate()],
  });

  const [globalGoalForm, setGlobalGoalForm] = useState({
    title: '',
    description: '',
    progress: '0',
    targetDate: '',
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
  const [debtForm, setDebtForm] = useState({
    title: '',
    debtType: 'Кредит',
    totalAmount: '',
    paidAmount: '',
    interestRate: '',
    dueDate: '',
    paymentDay: '',
    paymentAmount: '',
    termMonths: '',
    notes: '',
  });

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ value: 'pulse' | 'health' | 'tasks' | 'finance' | 'analytics' | 'config'; label: string }> = [{ value: 'pulse', label: 'Пульс' }];
    if (config?.healthEnabled) tabs.push({ value: 'health', label: 'Здоровье' });
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

  const mealPreviewCalories = mealItems.reduce((sum, item) => sum + Number(item.calories || 0), 0);
  const goalCalories = nutritionData?.goal?.dailyCalories ?? null;

  const pulseDay = overviewData?.today;
  const nutritionGoal = nutritionData?.goal;
  const financeOverview = financeData?.overview.finance;
  const recommendations = pulseDay?.recommendations ?? [];

  async function handleProfileSave() {
    await updateProfile({
      heightCm: num(profileForm.heightCm),
      startWeightKg: num(profileForm.startWeightKg),
      currentWeightKg: num(profileForm.currentWeightKg),
      targetWeightKg: num(profileForm.targetWeightKg),
      age: intNum(profileForm.age),
    }).unwrap();
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
    setTaskForm({ title: '', notes: '', taskType: 'ONE_TIME', scheduleType: 'NONE', daysOfWeek: [0], daysOfMonth: [parseDate(selectedDate).getDate()] });
    setTaskModalOpen(false);
  }

  async function handleCreateGoal() {
    await createPulseGoal({
      title: globalGoalForm.title,
      description: globalGoalForm.description || null,
      progress: intNum(globalGoalForm.progress) ?? 0,
      targetDate: globalGoalForm.targetDate || null,
    }).unwrap();
    setGlobalGoalForm({ title: '', description: '', progress: '0', targetDate: '' });
    setGoalModalOpen(false);
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
    setFinanceForm({ title: '', amount: '', type: 'EXPENSE', categoryId: '', notes: '', recurring: false, scheduleType: 'MONTHLY', daysOfWeek: [0], daysOfMonth: [parseDate(selectedDate).getDate()] });
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
      debtType: debtForm.debtType,
      totalAmount: num(debtForm.totalAmount),
      paidAmount: num(debtForm.paidAmount) ?? 0,
      interestRate: num(debtForm.interestRate),
      dueDate: debtForm.dueDate || null,
      paymentDay: intNum(debtForm.paymentDay),
      paymentAmount: num(debtForm.paymentAmount),
      termMonths: intNum(debtForm.termMonths),
      notes: debtForm.notes || null,
    }).unwrap();
    setDebtForm({ title: '', debtType: 'Кредит', totalAmount: '', paidAmount: '', interestRate: '', dueDate: '', paymentDay: '', paymentAmount: '', termMonths: '', notes: '' });
    setDebtModalOpen(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <div className={styles.kicker}>ALLVISION PULSE</div>
          <h1 className={styles.title}>Личный центр здоровья, питания, задач и финансов</h1>
          <p className={styles.subtitle}>Один экран для дневного pulse, метрик за неделю и точек внимания на сегодня.</p>
        </div>
        <div className={styles.heroActions}>
          <Button onClick={() => setSelectedDate(today)}>Вернуться к сегодня</Button>
          <Button variant="primary" onClick={() => setShowCalendar((value) => !value)}>{showCalendar ? 'Скрыть календарь' : 'Открыть календарь'}</Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div>
          <div className={styles.dateLabel}>{formatLongDate(selectedDate)}</div>
          <div className={styles.weekRow}>
            {weekDates.map((date, index) => (
              <button
                key={date}
                type="button"
                className={[styles.weekDay, selectedDate === date ? styles.weekDayActive : ''].filter(Boolean).join(' ')}
                onClick={() => setSelectedDate(date)}
              >
                <span>{weekdayLabels[index]}</span>
                <strong>{(parseDate(date) ?? new Date()).getDate()}</strong>
              </button>
            ))}
          </div>
          {showCalendar ? <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={styles.dateInput} /> : null}
        </div>
        <Segmented value={mainTab} onChange={(value) => setMainTab(value as any)} options={visibleTabs} />
      </div>

      {mainTab === 'pulse' ? (
        <div className={styles.pulseScene}>
          <section className={styles.pulseMain}>
            <div className={styles.surfaceHeader}>
              <div>
                <div className={styles.sectionEyebrow}>Обзор дня</div>
                <h2 className={styles.sectionTitle}>Пульс, питание, задачи и базовые ориентиры</h2>
                <p className={styles.sectionText}>Крупные метрики сверху, детали — только по необходимости.</p>
              </div>
              <div className={styles.inlineActions}>
                <Button onClick={() => setShowProfileEditor((value) => !value)}>{showProfileEditor ? 'Скрыть данные' : 'Редактировать данные'}</Button>
                {showProfileEditor ? (
                  <Button variant="primary" onClick={handleProfileSave} loading={profileSaving}>Сохранить профиль</Button>
                ) : null}
              </div>
            </div>

            <div className={styles.pulseHeroGrid}>
              <div className={styles.pulseMetricBlock}>
                <div className={styles.ringsRow}>
                  <ProgressRing value={pulseDay?.dayScore ?? 0} label="Сегодня" size={136} caption="дневной pulse" />
                  <ProgressRing value={pulseDay?.mental7Score ?? 0} label="7 дней" size={136} caption="общая динамика" />
                </div>
                <div className={styles.metricRail}>
                  <div className={styles.metricStripItem}>
                    <span>Калории</span>
                    <strong>{pulseDay?.caloriesConsumed ?? 0}</strong>
                    <small>{pulseDay?.caloriesRemaining != null ? `осталось ${Math.max(0, pulseDay.caloriesRemaining)}` : 'цель не задана'}</small>
                  </div>
                  <div className={styles.metricStripItem}>
                    <span>Задачи</span>
                    <strong>{pulseDay?.tasksPercent ?? 0}%</strong>
                    <small>{pulseDay?.tasksDone ?? 0} из {pulseDay?.tasksTotal ?? 0}</small>
                  </div>
                  <div className={styles.metricStripItem}>
                    <span>Баланс дня</span>
                    <strong>{formatMoney((pulseDay?.todaysIncome ?? 0) - (pulseDay?.todaysExpenses ?? 0))}</strong>
                    <small>{formatMoney(pulseDay?.todaysIncome ?? 0)} / {formatMoney(pulseDay?.todaysExpenses ?? 0)}</small>
                  </div>
                  <div className={styles.metricStripItem}>
                    <span>Платежи</span>
                    <strong>{pulseDay?.hasPaymentsToday ? 'Есть' : 'Нет'}</strong>
                    <small>{selectedDate === today ? 'на сегодня' : formatShortDate(selectedDate)}</small>
                  </div>
                </div>
              </div>

              <div className={styles.profileSummary}>
                <div className={styles.profileSummaryHeader}>
                  <div>
                    <div className={styles.sectionEyebrow}>База</div>
                    <h3 className={styles.sectionTitleSm}>Ключевые данные профиля</h3>
                  </div>
                  <span className={styles.badgeSoft}>без лишних полей</span>
                </div>
                <div className={styles.profileStatGrid}>
                  <div className={styles.profileStat}><span>Текущий вес</span><strong>{profile?.currentWeightKg ?? '—'} кг</strong></div>
                  <div className={styles.profileStat}><span>Цель</span><strong>{profile?.targetWeightKg ?? '—'} кг</strong></div>
                  <div className={styles.profileStat}><span>ИМТ</span><strong>{profileSuggestion?.bmi ?? '—'}</strong></div>
                  <div className={[styles.profileStat, weightDelta?.tone === 'success' ? styles.profileStatSuccess : weightDelta?.tone === 'danger' ? styles.profileStatDanger : ''].filter(Boolean).join(' ')}><span>Δ от старта</span><strong>{weightDelta ? `${weightDelta.delta > 0 ? '+' : ''}${weightDelta.delta} кг` : '—'}</strong></div>
                </div>
                <div className={styles.profileHint}>
                  {profileSuggestion ? `Ориентир: ${profileSuggestion.dailyCalories} ккал · Б ${profileSuggestion.protein} · Ж ${profileSuggestion.fat} · У ${profileSuggestion.carbs}` : 'Заполни профиль, чтобы получить ориентир по калориям и БЖУ.'}
                </div>
              </div>
            </div>

            {showProfileEditor ? (
              <div className={styles.editorPanel}>
                <div className={styles.compactGrid}>
                  <Field label="Рост, см"><input value={profileForm.heightCm} onChange={(e) => setProfileForm((prev) => ({ ...prev, heightCm: e.target.value }))} /></Field>
                  <Field label="Вес на старте, кг"><input value={profileForm.startWeightKg} onChange={(e) => setProfileForm((prev) => ({ ...prev, startWeightKg: e.target.value }))} /></Field>
                  <Field label="Текущий вес, кг"><input value={profileForm.currentWeightKg} onChange={(e) => setProfileForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))} /></Field>
                  <Field label="Целевой вес, кг"><input value={profileForm.targetWeightKg} onChange={(e) => setProfileForm((prev) => ({ ...prev, targetWeightKg: e.target.value }))} /></Field>
                  <Field label="Возраст"><input value={profileForm.age} onChange={(e) => setProfileForm((prev) => ({ ...prev, age: e.target.value }))} /></Field>
                </div>
              </div>
            ) : null}
          </section>

          <aside className={styles.pulseAside}>
            <div className={styles.surfaceHeader}>
              <div>
                <div className={styles.sectionEyebrow}>Фокус дня</div>
                <h3 className={styles.sectionTitleSm}>Что важно не пропустить</h3>
              </div>
              <span className={styles.badgeSoft}>{selectedDate === today ? 'сегодня' : formatShortDate(selectedDate)}</span>
            </div>

            <div className={styles.focusList}>
              {(showAllRecommendations ? recommendations : recommendations.slice(0, 3)).map((item) => (
                <div key={item} className={styles.focusItem}>{item}</div>
              ))}
              {!recommendations.length ? <div className={styles.emptyText}>Пока нет рекомендаций на этот день.</div> : null}
            </div>

            {recommendations.length > 3 ? (
              <button type="button" className={styles.inlineLink} onClick={() => setShowAllRecommendations((value) => !value)}>
                {showAllRecommendations ? 'Скрыть детали' : 'Показать все рекомендации'}
              </button>
            ) : null}

            <div className={styles.focusStats}>
              <div className={styles.focusStatBox}>
                <span>Рост</span>
                <strong>{profile?.heightCm ?? '—'} см</strong>
              </div>
              <div className={styles.focusStatBox}>
                <span>Возраст</span>
                <strong>{profile?.age ?? '—'}</strong>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {mainTab === 'health' ? (
        <div className={styles.stack}>
          <Segmented
            value={healthSubTab}
            onChange={(value) => setHealthSubTab(value as any)}
            options={[
              { value: 'mental', label: 'Ментальное здоровье' },
              { value: 'nutrition', label: 'Питание' },
            ]}
          />

          {healthSubTab === 'mental' ? (
            <div className={styles.grid}>
              <Card className={styles.span4}>
                <CardHeader title="Ментальное здоровье" action={<Button onClick={() => setMentalForm((prev) => ({ ...prev, nutrition: String(mentalData?.autoNutrition ?? 7) }))}>Применить питание</Button>} />
                <div className={styles.ringsRow}>
                  <ProgressRing value={mentalData?.day?.todayScore ?? pulseDay?.dayScore ?? 0} label="Сегодня" size={130} caption="1–100" />
                  <ProgressRing value={mentalData?.day?.pulse7Score ?? pulseDay?.mental7Score ?? 0} label="7 дней" size={130} caption="общее состояние" />
                </div>
                <div className={styles.compactGrid}>
                  <Field label="Сон, часов"><input value={mentalForm.sleepHours} onChange={(e) => setMentalForm((prev) => ({ ...prev, sleepHours: e.target.value }))} /></Field>
                  <Field label="Питание, 1–10"><input value={mentalForm.nutrition} onChange={(e) => setMentalForm((prev) => ({ ...prev, nutrition: e.target.value }))} /></Field>
                  <Field label="Продуктивность, 1–10"><input value={mentalForm.productivity} onChange={(e) => setMentalForm((prev) => ({ ...prev, productivity: e.target.value }))} /></Field>
                  <Field label="Стресс, 1–10"><input value={mentalForm.stress} onChange={(e) => setMentalForm((prev) => ({ ...prev, stress: e.target.value }))} /></Field>
                  <Field label="Самочувствие, 1–10"><input value={mentalForm.wellbeing} onChange={(e) => setMentalForm((prev) => ({ ...prev, wellbeing: e.target.value }))} /></Field>
                  <Field label="Алкоголь, 0–3"><input value={mentalForm.alcoholLevel} onChange={(e) => setMentalForm((prev) => ({ ...prev, alcoholLevel: e.target.value }))} /></Field>
                  <Field label="Физ. активность, 0–3"><input value={mentalForm.activityLevel} onChange={(e) => setMentalForm((prev) => ({ ...prev, activityLevel: e.target.value }))} /></Field>
                  <Field label="Кофеин, 0–3"><input value={mentalForm.caffeineLevel} onChange={(e) => setMentalForm((prev) => ({ ...prev, caffeineLevel: e.target.value }))} /></Field>
                </div>
                <Field label="Комментарий дня">
                  <textarea rows={4} value={mentalForm.comment} onChange={(e) => setMentalForm((prev) => ({ ...prev, comment: e.target.value }))} />
                </Field>
                <div className={styles.actionsRow}>
                  <Button onClick={() => setMentalForm((prev) => ({ ...prev, nutrition: String(mentalData?.autoNutrition ?? 7), productivity: String(mentalData?.autoProductivity ?? 7) }))}>Применить автооценки</Button>
                  <Button variant="primary" onClick={handleMentalSave} disabled={mentalSaving}>{mentalSaving ? 'Сохраняем…' : 'Сохранить чек-ин'}</Button>
                </div>
              </Card>

              <Card className={styles.span4}>
                <CardHeader title="Подсказки фокуса" />
                <div className={styles.recommendations}>
                  {(analyticsData?.suggestions ?? pulseDay?.recommendations ?? []).map((item) => (
                    <div key={item} className={styles.tipItem}>• {item}</div>
                  ))}
                </div>
                <div className={styles.miniStats}>
                  <div className={styles.metricCard}><span>Автооценка питания</span><strong>{mentalData?.autoNutrition ?? '—'} / 10</strong></div>
                  <div className={styles.metricCard}><span>Автооценка продуктивности</span><strong>{mentalData?.autoProductivity ?? '—'} / 10</strong></div>
                </div>
              </Card>
            </div>
          ) : null}

          {healthSubTab === 'nutrition' ? (
            <div className={styles.grid}>
              <Card className={styles.span4}>
                <CardHeader title="Цель питания" action={<Button onClick={() => setGoalForm({
                  dailyCalories: String(profileSuggestion?.dailyCalories ?? ''),
                  protein: String(profileSuggestion?.protein ?? ''),
                  fat: String(profileSuggestion?.fat ?? ''),
                  carbs: String(profileSuggestion?.carbs ?? ''),
                })}>Подставить подсказку</Button>} />
                <div className={styles.compactGrid}>
                  <Field label="Ккал / день"><input value={goalForm.dailyCalories} onChange={(e) => setGoalForm((prev) => ({ ...prev, dailyCalories: e.target.value }))} /></Field>
                  <Field label="Белки"><input value={goalForm.protein} onChange={(e) => setGoalForm((prev) => ({ ...prev, protein: e.target.value }))} /></Field>
                  <Field label="Жиры"><input value={goalForm.fat} onChange={(e) => setGoalForm((prev) => ({ ...prev, fat: e.target.value }))} /></Field>
                  <Field label="Углеводы"><input value={goalForm.carbs} onChange={(e) => setGoalForm((prev) => ({ ...prev, carbs: e.target.value }))} /></Field>
                </div>
                <div className={styles.actionsRow}>
                  <CardMuted>{nutritionGoal ? `Подсказка на основе профиля: ${nutritionGoal.dailyCalories} ккал` : 'Заполни профиль, чтобы получить подсказку по цели.'}</CardMuted>
                  <Button variant="primary" onClick={handleGoalSave} disabled={goalSaving}>{goalSaving ? 'Сохраняем…' : 'Задать цель'}</Button>
                </div>
              </Card>

              <Card className={styles.span3}>
                <CardHeader title="Сегодня по питанию" action={<Button variant="primary" onClick={() => setMealModalOpen(true)}>Добавить приём пищи</Button>} />
                <div className={styles.metricList}>
                  <div><span>Набрано</span><strong>{nutritionData?.totalCalories ?? 0} ккал</strong></div>
                  <div><span>Осталось</span><strong>{nutritionData?.remainingCalories != null ? Math.max(0, nutritionData.remainingCalories) : '—'}</strong></div>
                  <div><span>Белки</span><strong>{nutritionData?.totalProtein ?? 0} г</strong></div>
                  <div><span>Жиры</span><strong>{nutritionData?.totalFat ?? 0} г</strong></div>
                  <div><span>Углеводы</span><strong>{nutritionData?.totalCarbs ?? 0} г</strong></div>
                  <div><span>Оценка питания</span><strong>{nutritionData?.averageNutritionScore ?? 0} / 10</strong></div>
                </div>
              </Card>

              <Card className={styles.span5}>
                <CardHeader title="Приёмы пищи" action={<span className={styles.badgeSoft}>{formatLongDate(selectedDate)}</span>} />
                <div className={styles.list}>
                  {(nutritionData?.meals ?? []).map((meal) => (
                    <div key={meal.id} className={styles.listItem}>
                      <div>
                        <strong>{meal.title}</strong>
                        <div className={styles.helperText}>{meal.totalCalories} ккал · Б {meal.totalProtein ?? 0} / Ж {meal.totalFat ?? 0} / У {meal.totalCarbs ?? 0}</div>
                        <div className={styles.helperText}>{meal.itemsJson.map((item) => `${item.name} ${item.grams} г`).join(', ')}</div>
                      </div>
                      <div className={styles.inlineActions}>
                        <span className={styles.badgeSoft}>Оценка {meal.nutritionScore}/10</span>
                        <button className={styles.dangerBtn} onClick={() => deleteMeal(meal.id)}>Удалить</button>
                      </div>
                    </div>
                  ))}
                  {!nutritionData?.meals?.length ? <div className={styles.emptyText}>На выбранный день приёмы пищи ещё не добавлены.</div> : null}
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {mainTab === 'tasks' ? (
        <div className={styles.grid}>
          <Card className={styles.span4}>
            <CardHeader title="Трекер задач" action={<Button variant="primary" onClick={() => setTaskModalOpen(true)}>Новая задача</Button>} />
            <div className={styles.metricRow}>
              <div className={styles.metricCard}><span>Выполнено</span><strong>{tasksData?.summary.completed ?? 0} / {tasksData?.summary.total ?? 0}</strong></div>
              <div className={styles.metricCard}><span>Процент</span><strong>{tasksData?.summary.percent ?? 0}%</strong></div>
              <div className={styles.metricCard}><span>Продуктивность</span><strong>{tasksData?.summary.productivityScore ?? 0} / 10</strong></div>
            </div>
            <div className={styles.list}>
              {(tasksData?.items ?? []).map((task) => (
                <div key={task.id} className={styles.listItem}>
                  <div>
                    <strong>{task.title}</strong>
                    <div className={styles.helperText}>{task.taskType === 'HABIT' ? 'Привычка' : task.taskType === 'REGULAR' ? 'Регулярная задача' : 'Одноразовая задача'} · приоритет {task.priority}</div>
                    {task.notes ? <div className={styles.helperText}>{task.notes}</div> : null}
                  </div>
                  <div className={styles.inlineActions}>
                    <button className={task.completedForDate ? styles.successBtn : styles.secondaryBtn} onClick={() => togglePulseTaskDate({ taskId: task.id, date: selectedDate })}>{task.completedForDate ? 'Сделано' : 'Отметить'}</button>
                    <button className={styles.dangerBtn} onClick={() => deletePulseTask(task.id)}>Удалить</button>
                  </div>
                </div>
              ))}
              {!tasksData?.items?.length ? <div className={styles.emptyText}>На этот день задач и привычек нет.</div> : null}
            </div>
          </Card>

          <Card className={styles.span4}>
            <CardHeader title="Глобальные цели" action={<Button onClick={() => setGoalModalOpen(true)}>Добавить цель</Button>} />
            <div className={styles.list}>
              {(tasksData?.goals ?? []).map((goal) => (
                <div key={goal.id} className={styles.listItem}>
                  <div>
                    <strong>{goal.title}</strong>
                    <div className={styles.helperText}>{goal.description ?? 'Без описания'}</div>
                    <div className={styles.progressBar}><span style={{ width: `${goal.progress}%` }} /></div>
                    <div className={styles.helperText}>{goal.progress}% {goal.targetDate ? `· до ${formatShortDate(goal.targetDate)}` : ''}</div>
                  </div>
                  <button className={styles.dangerBtn} onClick={() => deletePulseGoal(goal.id)}>Удалить</button>
                </div>
              ))}
              {!tasksData?.goals?.length ? <div className={styles.emptyText}>Добавь глобальные цели, чтобы видеть прогресс отдельно от ежедневных задач.</div> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {mainTab === 'finance' ? (
        <div className={styles.grid}>
          <Card className={styles.span4}>
            <CardHeader title="Финансы" action={<div className={styles.inlineActions}><Button onClick={() => setCategoryModalOpen(true)}>Категория</Button><Button variant="primary" onClick={() => setFinanceModalOpen(true)}>Расход / доход</Button></div>} />
            <div className={styles.metricRow}>
              <div className={styles.metricCard}><span>Доходы за месяц</span><strong>{formatMoney(financeOverview?.monthIncome ?? 0)}</strong></div>
              <div className={styles.metricCard}><span>Расходы за месяц</span><strong>{formatMoney(financeOverview?.monthExpenses ?? 0)}</strong></div>
              <div className={styles.metricCard}><span>Остаток</span><strong>{formatMoney(financeOverview?.balance ?? 0)}</strong></div>
            </div>
            <div className={styles.list}>
              {(financeData?.entries ?? []).map((entry) => (
                <div key={entry.id} className={styles.listItem}>
                  <div>
                    <strong>{entry.title}</strong>
                    <div className={styles.helperText}>{entry.categoryName ?? 'Без категории'} · {entry.type === 'EXPENSE' ? 'Расход' : 'Доход'}</div>
                    {entry.notes ? <div className={styles.helperText}>{entry.notes}</div> : null}
                  </div>
                  <div className={styles.inlineActions}>
                    <span className={[styles.badgeSoft, entry.type === 'INCOME' ? styles.metricSuccess : ''].filter(Boolean).join(' ')}>{formatMoney(entry.amount)}</span>
                    <button className={styles.dangerBtn} onClick={() => deleteFinanceEntry(entry.id)}>Удалить</button>
                  </div>
                </div>
              ))}
              {!financeData?.entries?.length ? <div className={styles.emptyText}>На выбранный день расходов и доходов нет.</div> : null}
            </div>
          </Card>

          <Card className={styles.span4}>
            <CardHeader title="Категории и лимиты" action={<span className={styles.badgeSoft}>месяц</span>} />
            <div className={styles.list}>
              {(financeData?.overview.finance.overLimitCategories ?? []).map((category) => (
                <div key={category.id} className={styles.listItem}>
                  <div>
                    <strong>{category.name}</strong>
                    <div className={styles.helperText}>Потрачено {formatMoney(category.spent)} · лимит {formatMoney(category.limitAmount ?? 0)}</div>
                  </div>
                  <span className={styles.badgeDanger}>+{formatMoney(category.overBy)}</span>
                </div>
              ))}
              {!financeData?.overview.finance.overLimitCategories?.length ? <div className={styles.emptyText}>Превышений по лимитам пока нет.</div> : null}
            </div>
            <CardHeader title="Ближайшие платежи" />
            <div className={styles.list}>
              {(financeData?.overview.finance.upcomingPayments ?? []).map((payment, index) => (
                <div key={`${payment.title}-${index}`} className={styles.listItem}>
                  <div>
                    <strong>{payment.title}</strong>
                    <div className={styles.helperText}>{formatShortDate(payment.date)}</div>
                  </div>
                  <span className={styles.badgeSoft}>{formatMoney(payment.amount)}</span>
                </div>
              ))}
              {!financeData?.overview.finance.upcomingPayments?.length ? <div className={styles.emptyText}>На завтра регулярных платежей не найдено.</div> : null}
            </div>
          </Card>

          <Card className={styles.span4}>
            <CardHeader title="Накопления и задолженности" action={<div className={styles.inlineActions}><Button onClick={() => setSavingsModalOpen(true)}>Накопление</Button><Button onClick={() => setDebtModalOpen(true)}>Долг</Button></div>} />
            <div className={styles.list}>
              {(financeData?.goals ?? []).map((goal) => (
                <div key={goal.id} className={styles.listItem}>
                  <div>
                    <strong>{goal.title}</strong>
                    <div className={styles.helperText}>{formatMoney(goal.savedAmount)} из {formatMoney(goal.targetAmount)}</div>
                    {goal.itemsJson?.length ? <div className={styles.helperText}>{goal.itemsJson.map((item) => `${item.title}: ${formatMoney(item.amount)}`).join(' · ')}</div> : null}
                  </div>
                  <button className={styles.dangerBtn} onClick={() => deleteSavingsGoal(goal.id)}>Удалить</button>
                </div>
              ))}
              {(financeData?.debts ?? []).map((debt) => (
                <div key={debt.id} className={styles.listItem}>
                  <div>
                    <strong>{debt.title}</strong>
                    <div className={styles.helperText}>{debt.debtType} · оплачено {formatMoney(debt.paidAmount)} из {formatMoney(debt.totalAmount)}</div>
                    <div className={styles.helperText}>{debt.paymentDay ? `Платёж ${debt.paymentDay} числа` : ''} {debt.paymentAmount ? `· ${formatMoney(debt.paymentAmount)}` : ''}</div>
                  </div>
                  <button className={styles.dangerBtn} onClick={() => deleteDebt(debt.id)}>Удалить</button>
                </div>
              ))}
              {!financeData?.goals?.length && !financeData?.debts?.length ? <div className={styles.emptyText}>Добавь цели накопления, кредиты или долги, чтобы видеть обязательства в одном месте.</div> : null}
            </div>
          </Card>
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
        <div className={styles.grid}>
          <Card className={styles.span5}>
            <CardHeader title="Конфигурация Allvision Pulse" />
            <div className={styles.configList}>
              {[
                ['healthEnabled', 'Трекер здоровья'],
                ['mentalEnabled', 'Ментальное здоровье'],
                ['nutritionEnabled', 'Питание'],
                ['tasksEnabled', 'Трекер задач'],
                ['financeEnabled', 'Трекер финансов'],
                ['duplicateRecurringExpensesToTasks', 'Дублировать регулярные расходы в задачи'],
                ['duplicateDebtPaymentsToTasks', 'Дублировать платежи по долгам в задачи'],
              ].map(([key, label]) => (
                <label key={key} className={styles.switchRow}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean((config as any)?.[key])}
                    onChange={(event) => updateConfig({ [key]: event.target.checked } as any)}
                    disabled={configSaving}
                  />
                </label>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <Modal open={mealModalOpen} onClose={() => setMealModalOpen(false)} title="Добавить приём пищи" size="lg">
        <div className={styles.modalStack}>
          <Field label="Название приёма пищи"><input value={mealTitle} onChange={(e) => setMealTitle(e.target.value)} /></Field>
          <Field label="Комментарий"><textarea rows={3} value={mealNotes} onChange={(e) => setMealNotes(e.target.value)} /></Field>
          <Field label="Поиск блюда или продукта"><input value={foodSearch} onChange={(e) => setFoodSearch(e.target.value)} placeholder="Например, карбонара или курица" /></Field>
          <div className={styles.foodGrid}>
            {(foodSearchData?.items ?? []).map((food) => (
              <button key={food.id} type="button" className={styles.foodCard} onClick={() => addFoodToMeal(food)}>
                <strong>{food.name}</strong>
                <span>{food.calories} ккал · {food.defaultGrams ?? 100} г</span>
              </button>
            ))}
          </div>
          <div className={styles.actionsRow}>
            <Button onClick={() => setFoodModalOpen(true)}>Добавить своё блюдо</Button>
            <CardMuted>Недавние: {(nutritionData?.recentItems ?? []).slice(0, 3).map((item) => item.name).join(', ') || 'пока нет'}</CardMuted>
          </div>
          <div className={styles.list}>
            {mealItems.map((item, index) => (
              <div key={`${item.name}-${index}`} className={styles.listItem}>
                <div>
                  <strong>{item.name}</strong>
                  <div className={styles.helperText}>{item.grams} г · {item.calories} ккал</div>
                </div>
                <button className={styles.dangerBtn} onClick={() => setMealItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>Убрать</button>
              </div>
            ))}
          </div>
          <div className={styles.actionsRow}>
            <strong>Итого: {mealPreviewCalories} ккал</strong>
            <Button variant="primary" onClick={handleMealSave} disabled={mealSaving || !mealItems.length}>{mealSaving ? 'Сохраняем…' : 'Сохранить приём пищи'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={foodModalOpen} onClose={() => setFoodModalOpen(false)} title="Добавить своё блюдо">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={customFoodForm.name} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Ккал"><input value={customFoodForm.calories} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, calories: e.target.value }))} /></Field>
            <Field label="Средняя порция, г"><input value={customFoodForm.grams} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, grams: e.target.value }))} /></Field>
            <Field label="Белки"><input value={customFoodForm.protein} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, protein: e.target.value }))} /></Field>
            <Field label="Жиры"><input value={customFoodForm.fat} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, fat: e.target.value }))} /></Field>
            <Field label="Углеводы"><input value={customFoodForm.carbs} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, carbs: e.target.value }))} /></Field>
          </div>
          <label className={styles.switchRow}><span>Это готовое блюдо</span><input type="checkbox" checked={customFoodForm.isDish} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, isDish: e.target.checked }))} /></label>
          <label className={styles.switchRow}><span>Считать полезным</span><input type="checkbox" checked={customFoodForm.isHealthy} onChange={(e) => setCustomFoodForm((prev) => ({ ...prev, isHealthy: e.target.checked }))} /></label>
          <Button variant="primary" onClick={handleCreateFood} disabled={foodSaving}>{foodSaving ? 'Сохраняем…' : 'Добавить в базу'}</Button>
        </div>
      </Modal>

      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="Добавить задачу / привычку">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <Field label="Комментарий"><textarea rows={3} value={taskForm.notes} onChange={(e) => setTaskForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>
          <Segmented value={taskForm.taskType} onChange={(value) => setTaskForm((prev) => ({ ...prev, taskType: value as any, scheduleType: value === 'ONE_TIME' ? 'NONE' : prev.scheduleType }))} options={[{ value: 'REGULAR', label: 'Регулярная' }, { value: 'ONE_TIME', label: 'Одноразовая' }, { value: 'HABIT', label: 'Привычка' }]} />
          {taskForm.taskType === 'REGULAR' ? (
            <>
              <Segmented value={taskForm.scheduleType} onChange={(value) => setTaskForm((prev) => ({ ...prev, scheduleType: value as any }))} options={[{ value: 'WEEKLY', label: 'По дням недели' }, { value: 'MONTHLY', label: 'По дням месяца' }]} />
              {taskForm.scheduleType === 'WEEKLY' ? <div className={styles.weekSelector}>{weekdayLabels.map((label, index) => <button key={label} type="button" className={[styles.weekMini, taskForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')} onClick={() => setTaskForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(index) ? prev.daysOfWeek.filter((item) => item !== index) : [...prev.daysOfWeek, index] }))}>{label}</button>)}</div> : null}
              {taskForm.scheduleType === 'MONTHLY' ? <Field label="Дни месяца через запятую"><input value={taskForm.daysOfMonth.join(',')} onChange={(e) => setTaskForm((prev) => ({ ...prev, daysOfMonth: e.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0 && item < 32) }))} /></Field> : null}
            </>
          ) : null}
          <Button variant="primary" onClick={handleCreateTask} disabled={taskSaving}>{taskSaving ? 'Сохраняем…' : 'Создать'}</Button>
        </div>
      </Modal>

      <Modal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Добавить глобальную цель">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={globalGoalForm.title} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <Field label="Описание"><textarea rows={3} value={globalGoalForm.description} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, description: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Прогресс, %"><input value={globalGoalForm.progress} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, progress: e.target.value }))} /></Field>
            <Field label="Целевая дата"><input type="date" value={globalGoalForm.targetDate} onChange={(e) => setGlobalGoalForm((prev) => ({ ...prev, targetDate: e.target.value }))} /></Field>
          </div>
          <Button variant="primary" onClick={handleCreateGoal} disabled={pulseGoalSaving}>{pulseGoalSaving ? 'Сохраняем…' : 'Добавить цель'}</Button>
        </div>
      </Modal>

      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="Добавить категорию расходов">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} /></Field>
          <Field label="Лимит, ₽"><input value={categoryForm.limitAmount} onChange={(e) => setCategoryForm((prev) => ({ ...prev, limitAmount: e.target.value }))} /></Field>
          <Button variant="primary" onClick={handleCreateCategory} disabled={categorySaving}>{categorySaving ? 'Сохраняем…' : 'Сохранить категорию'}</Button>
        </div>
      </Modal>

      <Modal open={financeModalOpen} onClose={() => setFinanceModalOpen(false)} title="Добавить расход или доход">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={financeForm.title} onChange={(e) => setFinanceForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Сумма"><input value={financeForm.amount} onChange={(e) => setFinanceForm((prev) => ({ ...prev, amount: e.target.value }))} /></Field>
            <Field label="Тип"><select value={financeForm.type} onChange={(e) => setFinanceForm((prev) => ({ ...prev, type: e.target.value }))}><option value="EXPENSE">Расход</option><option value="INCOME">Доход</option></select></Field>
            <Field label="Категория"><select value={financeForm.categoryId} onChange={(e) => setFinanceForm((prev) => ({ ...prev, categoryId: e.target.value }))}><option value="">Без категории</option>{(financeData?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
          </div>
          <Field label="Комментарий"><textarea rows={3} value={financeForm.notes} onChange={(e) => setFinanceForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>
          <label className={styles.switchRow}><span>Это регулярный платёж</span><input type="checkbox" checked={financeForm.recurring} onChange={(e) => setFinanceForm((prev) => ({ ...prev, recurring: e.target.checked }))} /></label>
          {financeForm.recurring ? (
            <>
              <Segmented value={financeForm.scheduleType} onChange={(value) => setFinanceForm((prev) => ({ ...prev, scheduleType: value as any }))} options={[{ value: 'MONTHLY', label: 'Ежемесячно' }, { value: 'WEEKLY', label: 'Еженедельно' }]} />
              {financeForm.scheduleType === 'MONTHLY' ? <Field label="Число месяца"><input value={financeForm.daysOfMonth.join(',')} onChange={(e) => setFinanceForm((prev) => ({ ...prev, daysOfMonth: e.target.value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0 && item < 32) }))} /></Field> : null}
              {financeForm.scheduleType === 'WEEKLY' ? <div className={styles.weekSelector}>{weekdayLabels.map((label, index) => <button key={label} type="button" className={[styles.weekMini, financeForm.daysOfWeek.includes(index) ? styles.weekMiniActive : ''].filter(Boolean).join(' ')} onClick={() => setFinanceForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(index) ? prev.daysOfWeek.filter((item) => item !== index) : [...prev.daysOfWeek, index] }))}>{label}</button>)}</div> : null}
            </>
          ) : null}
          <Button variant="primary" onClick={handleCreateFinanceEntry} disabled={financeSaving}>{financeSaving ? 'Сохраняем…' : 'Сохранить запись'}</Button>
        </div>
      </Modal>

      <Modal open={savingsModalOpen} onClose={() => setSavingsModalOpen(false)} title="Добавить цель накопления">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={savingsForm.title} onChange={(e) => setSavingsForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Цель, ₽"><input value={savingsForm.targetAmount} onChange={(e) => setSavingsForm((prev) => ({ ...prev, targetAmount: e.target.value }))} /></Field>
            <Field label="Уже отложено, ₽"><input value={savingsForm.savedAmount} onChange={(e) => setSavingsForm((prev) => ({ ...prev, savedAmount: e.target.value }))} /></Field>
            <Field label="Дедлайн"><input type="date" value={savingsForm.deadline} onChange={(e) => setSavingsForm((prev) => ({ ...prev, deadline: e.target.value }))} /></Field>
          </div>
          <Field label="Подпункты (каждый с новой строки: название - сумма)"><textarea rows={5} value={savingsForm.items} onChange={(e) => setSavingsForm((prev) => ({ ...prev, items: e.target.value }))} /></Field>
          <Button variant="primary" onClick={handleCreateSavingsGoal} disabled={savingsSaving}>{savingsSaving ? 'Сохраняем…' : 'Добавить цель'}</Button>
        </div>
      </Modal>

      <Modal open={debtModalOpen} onClose={() => setDebtModalOpen(false)} title="Добавить кредит / долг">
        <div className={styles.modalStack}>
          <Field label="Название"><input value={debtForm.title} onChange={(e) => setDebtForm((prev) => ({ ...prev, title: e.target.value }))} /></Field>
          <div className={styles.compactGrid}>
            <Field label="Тип"><input value={debtForm.debtType} onChange={(e) => setDebtForm((prev) => ({ ...prev, debtType: e.target.value }))} /></Field>
            <Field label="Сумма"><input value={debtForm.totalAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, totalAmount: e.target.value }))} /></Field>
            <Field label="Уже оплачено"><input value={debtForm.paidAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, paidAmount: e.target.value }))} /></Field>
            <Field label="Процент"><input value={debtForm.interestRate} onChange={(e) => setDebtForm((prev) => ({ ...prev, interestRate: e.target.value }))} /></Field>
            <Field label="Дата дедлайна"><input type="date" value={debtForm.dueDate} onChange={(e) => setDebtForm((prev) => ({ ...prev, dueDate: e.target.value }))} /></Field>
            <Field label="День платежа"><input value={debtForm.paymentDay} onChange={(e) => setDebtForm((prev) => ({ ...prev, paymentDay: e.target.value }))} /></Field>
            <Field label="Сумма платежа"><input value={debtForm.paymentAmount} onChange={(e) => setDebtForm((prev) => ({ ...prev, paymentAmount: e.target.value }))} /></Field>
            <Field label="Срок, мес."><input value={debtForm.termMonths} onChange={(e) => setDebtForm((prev) => ({ ...prev, termMonths: e.target.value }))} /></Field>
          </div>
          <Field label="Комментарий"><textarea rows={3} value={debtForm.notes} onChange={(e) => setDebtForm((prev) => ({ ...prev, notes: e.target.value }))} /></Field>
          <Button variant="primary" onClick={handleCreateDebt} disabled={debtSaving}>{debtSaving ? 'Сохраняем…' : 'Добавить долг'}</Button>
        </div>
      </Modal>
    </div>
  );
}
