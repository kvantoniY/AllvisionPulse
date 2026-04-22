'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Apple, Coffee, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import styles from './PanelFrame.module.css';
import modalStyles from '../workspace/PulseWorkspaceForms.module.css';
import type { GameState } from '../../model/useGameState';
import type { WorkspaceSection } from '../../lib/types';
import type { PulseFood, PulseMeal, PulseMealItem } from '@/shared/types/pulse';
import {
  useAddMealMutation,
  useCreateFoodMutation,
  useDeleteMealMutation,
  useSearchFoodsQuery,
  useUpdateMealMutation,
  useUpdateNutritionGoalMutation,
} from '@/shared/api/pulseApi';
import { Modal } from '@/shared/ui/Modal/Modal';
import {
  buildMealItemFromFood,
  formatUsageCountLabel,
  getCurrentTimeInputValue,
  getFoodIdentity,
  getMealItemIdentity,
  intNum,
  num,
  parseDate,
} from '../workspace/pulseWorkspaceUtils';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  onNavigate?: (section: WorkspaceSection) => void;
};

type NutritionTab = 'today' | 'week' | 'plan';

function mealMeta(title: string) {
  const lower = title.toLowerCase();
  if (/кофе|чай|напит/.test(lower)) {
    return {
      icon: <Coffee width={20} height={20} strokeWidth={1.8} />,
      className: styles.mealIconCircleCool,
    };
  }
  if (/ябл|фрукт|ягод|овощ/.test(lower)) {
    return {
      icon: <Apple width={20} height={20} strokeWidth={1.8} />,
      className: styles.mealIconCircleFruit,
    };
  }
  return {
    icon: <UtensilsCrossed width={20} height={20} strokeWidth={1.8} />,
    className: styles.mealIconCircleWarm,
  };
}

function formatMealTime(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function formatDayLabel(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(parsed);
}

function groupMealItems(items: PulseMealItem[]) {
  const map = new Map<
    string,
    {
      key: string;
      item: PulseMealItem;
      count: number;
      totalGrams: number;
      totalCalories: number;
      totalProtein: number;
      totalFat: number;
      totalCarbs: number;
    }
  >();

  items.forEach((item) => {
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
}

export function NutritionPanel({ game, onToast, onNavigate }: Props) {
  const isMobile = useIsMobile();
  const [addMeal, { isLoading: addingMeal }] = useAddMealMutation();
  const [updateMeal, { isLoading: updatingMeal }] = useUpdateMealMutation();
  const [deleteMeal] = useDeleteMealMutation();
  const [updateGoal, { isLoading: savingGoal }] = useUpdateNutritionGoalMutation();
  const [createFood, { isLoading: foodSaving }] = useCreateFoodMutation();

  const [tab, setTab] = useState<NutritionTab>('today');
  const [goalForm, setGoalForm] = useState({
    dailyCalories: '',
    protein: '',
    fat: '',
    carbs: '',
  });

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [foodModalOpen, setFoodModalOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealTitle, setMealTitle] = useState('Приём пищи');
  const [mealTime, setMealTime] = useState(getCurrentTimeInputValue());
  const [mealNotes, setMealNotes] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [mealItems, setMealItems] = useState<PulseMealItem[]>([]);

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

  const { data: foodSearchData } = useSearchFoodsQuery(foodSearch, {
    skip: !mealModalOpen && !foodModalOpen,
  });
  const { data: customFoodSearchData } = useSearchFoodsQuery(customFoodSearch, {
    skip: !foodModalOpen || !customFoodForm.isDish,
  });

  const goal = game.nutrition.goal?.dailyCalories ?? null;
  const consumed = game.nutrition.totalCalories;
  const percent = goal ? Math.min(100, Math.round((consumed / goal) * 100)) : 0;
  const remaining = goal != null ? Math.max(0, goal - consumed) : null;
  const mealSaving = addingMeal || updatingMeal;

  const meals = useMemo(
    () => [...game.nutrition.meals].sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
    [game.nutrition.meals],
  );

  const weekLine = useMemo(() => [...(game.analytics?.calorieLine ?? [])].slice(-7), [game.analytics?.calorieLine]);

  const mealPreviewGroups = useMemo(() => groupMealItems(mealItems), [mealItems]);
  const customDishGroups = useMemo(() => groupMealItems(customDishItems), [customDishItems]);

  const mealPreviewTotals = useMemo(
    () =>
      mealItems.reduce(
        (acc, item) => ({
          calories: acc.calories + Number(item.calories || 0),
          protein: acc.protein + Number(item.protein || 0),
          fat: acc.fat + Number(item.fat || 0),
          carbs: acc.carbs + Number(item.carbs || 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbs: 0 },
      ),
    [mealItems],
  );

  const customDishTotals = useMemo(
    () =>
      customDishItems.reduce(
        (acc, item) => ({
          grams: acc.grams + Number(item.grams || 0),
          calories: acc.calories + Number(item.calories || 0),
          protein: acc.protein + Number(item.protein || 0),
          fat: acc.fat + Number(item.fat || 0),
          carbs: acc.carbs + Number(item.carbs || 0),
        }),
        { grams: 0, calories: 0, protein: 0, fat: 0, carbs: 0 },
      ),
    [customDishItems],
  );

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

  useEffect(() => {
    setGoalForm({
      dailyCalories: String(game.nutrition.goal?.dailyCalories ?? game.profile?.dailyCaloriesGoal ?? ''),
      protein: String(game.nutrition.goal?.protein ?? game.profile?.proteinGoal ?? ''),
      fat: String(game.nutrition.goal?.fat ?? game.profile?.fatGoal ?? ''),
      carbs: String(game.nutrition.goal?.carbs ?? game.profile?.carbsGoal ?? ''),
    });
  }, [
    game.nutrition.goal?.dailyCalories,
    game.nutrition.goal?.protein,
    game.nutrition.goal?.fat,
    game.nutrition.goal?.carbs,
    game.profile?.dailyCaloriesGoal,
    game.profile?.proteinGoal,
    game.profile?.fatGoal,
    game.profile?.carbsGoal,
  ]);

  const resetMealComposer = () => {
    setEditingMealId(null);
    setMealTitle('Приём пищи');
    setMealTime(getCurrentTimeInputValue());
    setMealNotes('');
    setFoodSearch('');
    setMealItems([]);
  };

  const closeMealModal = () => {
    resetMealComposer();
    setMealModalOpen(false);
  };

  const openMealModal = (meal?: PulseMeal) => {
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
  };

  const addFoodToMeal = (food: PulseFood) => {
    setMealItems((prev) => [...prev, buildMealItemFromFood(food)]);
  };

  const addFoodToCustomDish = (food: PulseFood) => {
    setCustomDishItems((prev) => [...prev, buildMealItemFromFood(food)]);
  };

  const addMealPortion = (item: PulseMealItem) => {
    setMealItems((prev) => [...prev, { ...item }]);
  };

  const removeMealPortion = (key: string) => {
    setMealItems((prev) => {
      const index = prev.findIndex((item) => getMealItemIdentity(item) === key);
      if (index < 0) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const addCustomDishPortion = (item: PulseMealItem) => {
    setCustomDishItems((prev) => [...prev, { ...item }]);
  };

  const removeCustomDishPortion = (key: string) => {
    setCustomDishItems((prev) => {
      const index = prev.findIndex((item) => getMealItemIdentity(item) === key);
      if (index < 0) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleDelete = async (mealId: string) => {
    try {
      await deleteMeal(mealId).unwrap();
      onToast('Приём удалён');
      if (editingMealId === mealId) {
        closeMealModal();
      }
    } catch {
      onToast('Не удалось удалить приём');
    }
  };

  const handleSaveGoal = async () => {
    const dailyCalories =
      intNum(goalForm.dailyCalories) ??
      game.nutrition.goal?.dailyCalories ??
      game.profile?.dailyCaloriesGoal ??
      null;
    const protein = num(goalForm.protein);
    const fat = num(goalForm.fat);
    const carbs = num(goalForm.carbs);

    if (dailyCalories == null) {
      onToast('Укажи дневную цель по калориям');
      return;
    }

    try {
      await updateGoal({
        dailyCalories,
        ...(protein != null ? { protein } : {}),
        ...(fat != null ? { fat } : {}),
        ...(carbs != null ? { carbs } : {}),
      }).unwrap();
      onToast('Цель по питанию обновлена');
    } catch {
      onToast('Не удалось обновить цель');
    }
  };

  const handleMealSave = async () => {
    const title = mealTitle.trim();
    if (!title) {
      onToast('Укажи название приёма пищи');
      return;
    }
    if (!mealItems.length) {
      onToast('Добавь хотя бы один продукт');
      return;
    }

    const currentMealCalories = editingMealId
      ? meals.find((meal) => meal.id === editingMealId)?.totalCalories ?? 0
      : 0;
    const futureTotal = consumed - currentMealCalories + mealPreviewTotals.calories;

    if (goal && futureTotal > goal) {
      const exceed = futureTotal - goal;
      const accepted = window.confirm(
        `После этого приёма пищи цель будет превышена на ${Math.round(exceed)} ккал. Продолжить?`,
      );
      if (!accepted) return;
    }

    try {
      const payload = {
        date: game.today,
        time: mealTime || null,
        title,
        notes: mealNotes.trim() || null,
        items: mealItems,
      };

      if (editingMealId) {
        await updateMeal({ mealId: editingMealId, body: payload }).unwrap();
        onToast('Приём обновлён');
      } else {
        await addMeal(payload).unwrap();
        onToast('Приём добавлен');
      }

      closeMealModal();
    } catch {
      onToast('Не удалось сохранить приём');
    }
  };

  const handleCreateFood = async () => {
    const title = customFoodForm.name.trim();
    const useDishComposition = customFoodForm.isDish && customDishItems.length > 0;
    const calories = useDishComposition ? Math.round(customDishTotals.calories) : intNum(customFoodForm.calories);

    if (!title) {
      onToast('Укажи название продукта');
      return;
    }
    if (calories == null || calories < 0) {
      onToast('Укажи калории продукта');
      return;
    }

    try {
      const response = await createFood({
        name: title,
        calories,
        defaultGrams: useDishComposition ? Math.round(customDishTotals.grams) : num(customFoodForm.grams),
        protein: useDishComposition ? Number(customDishTotals.protein.toFixed(1)) : num(customFoodForm.protein),
        fat: useDishComposition ? Number(customDishTotals.fat.toFixed(1)) : num(customFoodForm.fat),
        carbs: useDishComposition ? Number(customDishTotals.carbs.toFixed(1)) : num(customFoodForm.carbs),
        isDish: customFoodForm.isDish,
        isHealthy: customFoodForm.isHealthy,
        isPublic: true,
      }).unwrap();

      addFoodToMeal(response.food);
      setFoodSearch(title);
      setCustomFoodForm({
        name: '',
        calories: '',
        grams: '100',
        protein: '',
        fat: '',
        carbs: '',
        isDish: false,
        isHealthy: true,
      });
      setCustomFoodSearch('');
      setCustomDishItems([]);
      setFoodModalOpen(false);
      onToast('Продукт сохранён и добавлен в приём');
    } catch {
      onToast('Не удалось сохранить продукт');
    }
  };

  return (
    <>
      <div className={styles.frame}>
        <section className={styles.ringCard}>
          <div className={styles.ringHeader}>
            <Donut percent={percent} />

            <div className={styles.ringStat}>
              <div className={styles.heroLabel}>Сегодня</div>
              <div className={styles.ringStatValue}>
                {Math.round(consumed)}
                <span className={styles.ringStatMuted}>{goal ? ` / ${goal} ккал` : ' ккал'}</span>
              </div>
              <div className={styles.heroHint}>
                {remaining != null
                  ? `Осталось ${remaining} ккал`
                  : 'Добавь цель в профиле, чтобы видеть остаток по дню.'}
              </div>
            </div>
          </div>

          <div className={styles.macroGrid}>
            <MacroCard label="Белки" value={game.nutrition.totalProtein} goal={game.profile?.proteinGoal ?? null} suffix="г" color="oklch(0.7 0.15 48)" />
            <MacroCard label="Жиры" value={game.nutrition.totalFat} goal={game.profile?.fatGoal ?? null} suffix="г" color="oklch(0.78 0.14 80)" />
            <MacroCard label="Углеводы" value={game.nutrition.totalCarbs} goal={game.profile?.carbsGoal ?? null} suffix="г" color="oklch(0.72 0.12 145)" />
          </div>
        </section>

        <div className={styles.segmentRail}>
          <button type="button" className={styles.segment} data-active={tab === 'today'} onClick={() => setTab('today')}>
            Сегодня
          </button>
          <button type="button" className={styles.segment} data-active={tab === 'week'} onClick={() => setTab('week')}>
            Неделя
          </button>
          <button type="button" className={styles.segment} data-active={tab === 'plan'} onClick={() => setTab('plan')}>
            План
          </button>
        </div>

        {tab === 'today' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meals.length ? (
              meals.map((meal) => {
                const meta = mealMeta(meal.title);
                return (
                  <div key={meal.id} className={styles.rowItem}>
                    <div className={styles.rowItemMain}>
                      <span className={`${styles.mealIconCircle} ${meta.className}`}>{meta.icon}</span>
                      <div className={styles.rowItemTitle}>
                        <strong>{meal.title}</strong>
                        <span>{formatMealTime(meal.date)} · {meal.itemsJson.length} поз.</span>
                      </div>
                    </div>

                    <div className={styles.rowItemMeta} data-inline="true">
                      <strong>{Math.round(meal.totalCalories)} ккал</strong>
                      <button
                        type="button"
                        className={styles.ghostIconButton}
                        onClick={() => openMealModal(meal)}
                        aria-label="Редактировать приём"
                      >
                        <Pencil width={16} height={16} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className={styles.ghostIconButton}
                        onClick={() => void handleDelete(meal.id)}
                        aria-label="Удалить приём"
                      >
                        <Trash2 width={16} height={16} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.empty}>
                <strong>Пока нет записей</strong>
                <span>Запиши первый приём пищи, и дневник сразу заполнится.</span>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'week' ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Калории за неделю</div>
              <div className={styles.sectionMeta}>по данным Pulse</div>
            </div>

            {weekLine.length ? (
              <div className={styles.weekGrid}>
                {weekLine.map((day) => {
                  const target = day.target ?? goal ?? 0;
                  const width = target ? Math.min(100, Math.round((day.calories / target) * 100)) : 0;
                  return (
                    <div key={day.date} className={styles.weekDay}>
                      <div className={styles.weekDayLabel}>{formatDayLabel(day.date)}</div>
                      <div className={styles.weekDayValue}>{Math.round(day.calories)} ккал</div>
                      <div className={styles.weekDayBar}>
                        <div className={styles.weekDayFill} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Недельная сводка появится позже</strong>
                <span>Нужно ещё немного истории, чтобы Pulse собрал тренд.</span>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'plan' ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Текущая цель</div>
              <div className={styles.sectionMeta}>ориентир по питанию</div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Калории</span>
                <span className={styles.statValue}>{goal != null ? `${goal}` : '—'}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Белки</span>
                <span className={styles.statValue}>{game.profile?.proteinGoal ?? '—'}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Жиры</span>
                <span className={styles.statValue}>{game.profile?.fatGoal ?? '—'}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Углеводы</span>
                <span className={styles.statValue}>{game.profile?.carbsGoal ?? '—'}</span>
              </div>
            </div>

            <div className={styles.heroHint}>
              {goal != null
                ? 'Если цель изменилась, обнови её прямо здесь — остаток и недельный тренд пересчитаются автоматически.'
                : 'Пока цель не задана. После настройки Pulse начнёт точнее показывать остаток и недельную динамику.'}
            </div>

            <section className={styles.form} style={{ marginTop: 6 }}>
              <div className={styles.statLabel}>Редактировать цель</div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <label className={styles.field}>
                  <span>Калории</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.dailyCalories}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, dailyCalories: event.target.value }))}
                    placeholder="2100"
                  />
                </label>
                <label className={styles.field}>
                  <span>Белки, г</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.protein}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, protein: event.target.value }))}
                    placeholder="120"
                  />
                </label>
                <label className={styles.field}>
                  <span>Жиры, г</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.fat}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, fat: event.target.value }))}
                    placeholder="70"
                  />
                </label>
                <label className={styles.field}>
                  <span>Углеводы, г</span>
                  <input
                    inputMode="decimal"
                    value={goalForm.carbs}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, carbs: event.target.value }))}
                    placeholder="240"
                  />
                </label>
              </div>

              <div className={styles.actionRow}>
                <button type="button" className={styles.primary} onClick={handleSaveGoal} disabled={savingGoal}>
                  {savingGoal ? 'Сохраняю…' : 'Сохранить цель'}
                </button>
                {onNavigate ? (
                  <button type="button" className={styles.secondary} onClick={() => onNavigate('weight')}>
                    Профиль и форма
                  </button>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        <button type="button" className={styles.footerPrimary} onClick={() => openMealModal()}>
          <Plus width={18} height={18} strokeWidth={2.2} />
          Добавить приём
        </button>
      </div>

      <Modal
        open={mealModalOpen}
        onClose={closeMealModal}
        title={editingMealId ? 'Редактировать приём пищи' : 'Добавить приём пищи'}
        subtitle="Поиск, БЖУ, ккал, несколько порций и сборка приёма из нескольких продуктов."
        appearance="pulse"
        size="lg"
      >
        <div className={modalStyles.stack}>
          <div className={modalStyles.gridTwo}>
            <Field label="Название приёма пищи">
              <input
                placeholder="Например, Обед или Перекус"
                value={mealTitle}
                onChange={(event) => setMealTitle(event.target.value)}
              />
            </Field>
            <Field label="Время">
              <input type="time" value={mealTime} onChange={(event) => setMealTime(event.target.value)} />
            </Field>
          </div>

          <Field label="Комментарий">
            <textarea
              rows={3}
              placeholder="Короткая заметка о приёме пищи"
              value={mealNotes}
              onChange={(event) => setMealNotes(event.target.value)}
            />
          </Field>

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitleRow}>
              <div className={modalStyles.sectionTitle}>Поиск продукта или блюда</div>
              <button type="button" className={modalStyles.textButton} onClick={() => setFoodModalOpen(true)}>
                Свой продукт
              </button>
            </div>

            <Field label="Поиск">
              <input
                value={foodSearch}
                onChange={(event) => setFoodSearch(event.target.value)}
                placeholder="Овсянка, курица, йогурт..."
              />
            </Field>

            {game.nutrition.recentItems.length ? (
              <div className={modalStyles.chipRow}>
                {game.nutrition.recentItems.slice(0, 8).map((item, index) => (
                  <button
                    key={`${item.name}-${index}`}
                    type="button"
                    className={modalStyles.chip}
                    data-active={false}
                    onClick={() => setMealItems((prev) => [...prev, { ...item }])}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={modalStyles.searchResults}>
              {(foodSearchData?.items ?? []).slice(0, 8).map((food) => {
                const selectedCount = mealItemCountMap.get(getFoodIdentity(food)) ?? 0;
                return (
                  <div key={food.id} className={modalStyles.searchRow}>
                    <button type="button" className={modalStyles.searchButton} onClick={() => addFoodToMeal(food)}>
                      <div className={modalStyles.searchCopy}>
                        <strong>{food.name}</strong>
                        <span>
                          {food.calories} ккал · {food.defaultGrams ?? 100} г · Б {Math.round(Number(food.protein ?? 0))}
                          {' '}· Ж {Math.round(Number(food.fat ?? 0))} · У {Math.round(Number(food.carbs ?? 0))}
                        </span>
                        <span>{formatUsageCountLabel(food.usageCount)}</span>
                      </div>
                    </button>

                    <div className={modalStyles.counter}>
                      <button
                        type="button"
                        className={modalStyles.counterButton}
                        onClick={() => removeMealPortion(getFoodIdentity(food))}
                        aria-label="Уменьшить количество"
                        disabled={!selectedCount}
                      >
                        −
                      </button>
                      <span className={modalStyles.counterValue}>{selectedCount}</span>
                      <button
                        type="button"
                        className={modalStyles.counterButton}
                        onClick={() => addFoodToMeal(food)}
                        aria-label="Увеличить количество"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}

              {!((foodSearchData?.items ?? []).length) ? (
                <div className={modalStyles.emptyText}>
                  Ничего не найдено. Можно создать свой продукт и сразу добавить его в приём.
                </div>
              ) : null}
            </div>
          </section>

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitleRow}>
              <div className={modalStyles.sectionTitle}>Что войдёт в приём</div>
              <div className={modalStyles.sectionMeta}>{mealPreviewGroups.length ? `${mealPreviewGroups.length} поз.` : 'Пусто'}</div>
            </div>

            <div className={modalStyles.selectionList}>
              {mealPreviewGroups.map((group) => (
                <div key={group.key} className={modalStyles.selectionRow}>
                  <div className={modalStyles.selectionCopy}>
                    <strong>{group.item.name}</strong>
                    <span>
                      {Math.round(group.totalGrams)} г · {Math.round(group.totalCalories)} ккал · Б {Math.round(group.totalProtein)}
                      {' '}· Ж {Math.round(group.totalFat)} · У {Math.round(group.totalCarbs)}
                    </span>
                  </div>

                  <div className={modalStyles.counter}>
                    <button
                      type="button"
                      className={modalStyles.counterButton}
                      onClick={() => removeMealPortion(group.key)}
                      aria-label="Уменьшить количество"
                    >
                      −
                    </button>
                    <span className={modalStyles.counterValue}>{group.count}</span>
                    <button
                      type="button"
                      className={modalStyles.counterButton}
                      onClick={() => addMealPortion(group.item)}
                      aria-label="Увеличить количество"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {!mealItems.length ? (
                <div className={modalStyles.emptyText}>Добавь хотя бы один продукт или блюдо.</div>
              ) : null}
            </div>

            <div className={modalStyles.summaryGrid}>
              <SummaryCard label="Ккал" value={Math.round(mealPreviewTotals.calories)} />
              <SummaryCard label="Белки" value={Math.round(mealPreviewTotals.protein)} suffix="г" />
              <SummaryCard label="Жиры" value={Math.round(mealPreviewTotals.fat)} suffix="г" />
              <SummaryCard label="Углеводы" value={Math.round(mealPreviewTotals.carbs)} suffix="г" />
            </div>
          </section>

          <div className={modalStyles.actions}>
            {editingMealId ? (
              <button
                type="button"
                className={modalStyles.dangerButton}
                onClick={() => void handleDelete(editingMealId)}
              >
                Удалить
              </button>
            ) : null}
            <button type="button" className={modalStyles.secondaryButton} onClick={closeMealModal}>
              Отмена
            </button>
            <button
              type="button"
              className={modalStyles.primaryButton}
              onClick={handleMealSave}
              disabled={mealSaving || !mealItems.length}
            >
              {mealSaving ? 'Сохраняю…' : editingMealId ? 'Сохранить' : 'Добавить'}
            </button>
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
        title="Добавить свой продукт"
        subtitle="Если готового продукта нет в базе, создай его и сразу используй в приёме."
        appearance="pulse"
        size="lg"
      >
        <div className={modalStyles.stack}>
          <Field label="Название">
            <input
              placeholder="Например, Домашняя гранола"
              value={customFoodForm.name}
              onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>

          <div className={modalStyles.gridThree}>
            <Field label="Ккал">
              <input
                inputMode="decimal"
                value={customFoodForm.isDish && customDishItems.length ? String(Math.round(customDishTotals.calories)) : customFoodForm.calories}
                readOnly={customFoodForm.isDish && customDishItems.length > 0}
                onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, calories: event.target.value }))}
              />
            </Field>
            <Field label="Порция, г">
              <input
                inputMode="decimal"
                value={customFoodForm.isDish && customDishItems.length ? String(Math.round(customDishTotals.grams)) : customFoodForm.grams}
                readOnly={customFoodForm.isDish && customDishItems.length > 0}
                onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, grams: event.target.value }))}
              />
            </Field>
            <Field label="Белки">
              <input
                inputMode="decimal"
                value={customFoodForm.isDish && customDishItems.length ? String(Number(customDishTotals.protein.toFixed(1))) : customFoodForm.protein}
                readOnly={customFoodForm.isDish && customDishItems.length > 0}
                onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, protein: event.target.value }))}
              />
            </Field>
            <Field label="Жиры">
              <input
                inputMode="decimal"
                value={customFoodForm.isDish && customDishItems.length ? String(Number(customDishTotals.fat.toFixed(1))) : customFoodForm.fat}
                readOnly={customFoodForm.isDish && customDishItems.length > 0}
                onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, fat: event.target.value }))}
              />
            </Field>
            <Field label="Углеводы">
              <input
                inputMode="decimal"
                value={customFoodForm.isDish && customDishItems.length ? String(Number(customDishTotals.carbs.toFixed(1))) : customFoodForm.carbs}
                readOnly={customFoodForm.isDish && customDishItems.length > 0}
                onChange={(event) => setCustomFoodForm((prev) => ({ ...prev, carbs: event.target.value }))}
              />
            </Field>
          </div>

          <div className={modalStyles.optionGrid}>
            <button
              type="button"
              className={modalStyles.optionCard}
              data-active={customFoodForm.isDish}
              onClick={() => setCustomFoodForm((prev) => ({ ...prev, isDish: !prev.isDish }))}
            >
              <strong>Готовое блюдо</strong>
              <span>Собрать блюдо из ингредиентов и считать БЖУ автоматически.</span>
            </button>
            <button
              type="button"
              className={modalStyles.optionCard}
              data-active={customFoodForm.isHealthy}
              onClick={() => setCustomFoodForm((prev) => ({ ...prev, isHealthy: !prev.isHealthy }))}
            >
              <strong>Полезный продукт</strong>
              <span>Учитывать его как полезный в общей оценке питания.</span>
            </button>
          </div>

          {customFoodForm.isDish ? (
            <section className={modalStyles.section}>
              <div className={modalStyles.sectionTitle}>Состав блюда</div>

              <Field label="Найти ингредиент">
                <input
                  value={customFoodSearch}
                  onChange={(event) => setCustomFoodSearch(event.target.value)}
                  placeholder="Рис, курица, овощи..."
                />
              </Field>

              <div className={modalStyles.searchResults}>
                {(customFoodSearchData?.items ?? []).slice(0, 6).map((food) => {
                  const selectedCount = customDishItemCountMap.get(getFoodIdentity(food)) ?? 0;
                  return (
                    <div key={`dish-${food.id}`} className={modalStyles.searchRow}>
                      <button type="button" className={modalStyles.searchButton} onClick={() => addFoodToCustomDish(food)}>
                        <div className={modalStyles.searchCopy}>
                          <strong>{food.name}</strong>
                          <span>{food.calories} ккал · {food.defaultGrams ?? 100} г</span>
                        </div>
                      </button>

                      <div className={modalStyles.counter}>
                        <button
                          type="button"
                          className={modalStyles.counterButton}
                          onClick={() => removeCustomDishPortion(getFoodIdentity(food))}
                          aria-label="Уменьшить количество"
                          disabled={!selectedCount}
                        >
                          −
                        </button>
                        <span className={modalStyles.counterValue}>{selectedCount}</span>
                        <button
                          type="button"
                          className={modalStyles.counterButton}
                          onClick={() => addFoodToCustomDish(food)}
                          aria-label="Увеличить количество"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={modalStyles.selectionList}>
                {customDishGroups.map((group) => (
                  <div key={group.key} className={modalStyles.selectionRow}>
                    <div className={modalStyles.selectionCopy}>
                      <strong>{group.item.name}</strong>
                      <span>{Math.round(group.totalGrams)} г · {Math.round(group.totalCalories)} ккал</span>
                    </div>

                    <div className={modalStyles.counter}>
                      <button
                        type="button"
                        className={modalStyles.counterButton}
                        onClick={() => removeCustomDishPortion(group.key)}
                        aria-label="Уменьшить количество"
                      >
                        −
                      </button>
                      <span className={modalStyles.counterValue}>{group.count}</span>
                      <button
                        type="button"
                        className={modalStyles.counterButton}
                        onClick={() => addCustomDishPortion(group.item)}
                        aria-label="Увеличить количество"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                {!customDishItems.length ? (
                  <div className={modalStyles.emptyText}>
                    Добавь ингредиенты, и блюдо соберётся автоматически по КБЖУ.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className={modalStyles.actions}>
            <button
              type="button"
              className={modalStyles.secondaryButton}
              onClick={() => {
                setFoodModalOpen(false);
                setCustomFoodSearch('');
                setCustomDishItems([]);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className={modalStyles.primaryButton}
              onClick={handleCreateFood}
              disabled={foodSaving}
            >
              {foodSaving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={modalStyles.field}>
      <span className={modalStyles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className={modalStyles.summaryCard}>
      <span className={modalStyles.summaryLabel}>{label}</span>
      <strong className={modalStyles.summaryValue}>
        {value}
        <span className={modalStyles.summaryValueMuted}>{suffix}</span>
      </strong>
    </div>
  );
}

function MacroCard({
  label,
  value,
  goal,
  suffix,
  color,
}: {
  label: string;
  value: number;
  goal: number | null;
  suffix: string;
  color: string;
}) {
  const percent = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;

  return (
    <div className={styles.macroCard}>
      <div className={styles.macroLabel}>
        <span>{label}</span>
        <span className={styles.macroValue}>
          {Math.round(value)}
          {goal ? `/${goal}${suffix}` : suffix}
        </span>
      </div>
      <div className={styles.macroTrack}>
        <div className={styles.macroFill} style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

function Donut({ percent }: { percent: number }) {
  const size = 96;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(183, 145, 97, 0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.7 0.15 48)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong
        style={{
          position: 'absolute',
          inset: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "var(--font-pulse-display), 'Comfortaa', ui-sans-serif, system-ui, sans-serif",
          fontSize: '1.6rem',
          color: 'oklch(0.3 0.04 45)',
        }}
      >
        {percent}%
      </strong>
    </div>
  );
}
