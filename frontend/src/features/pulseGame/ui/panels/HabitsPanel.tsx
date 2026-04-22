'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Plus, Sprout, Trash2 } from 'lucide-react';
import styles from './PanelFrame.module.css';
import grid from './HabitsPanel.module.css';
import modalStyles from '../workspace/PulseWorkspaceForms.module.css';
import type { GameState, GameHabit } from '../../model/useGameState';
import {
  useCreatePulseTaskMutation,
  useDeletePulseTaskMutation,
  useTogglePulseTaskDateMutation,
} from '@/shared/api/pulseApi';
import { Modal } from '@/shared/ui/Modal/Modal';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  isMobile: boolean;
};

const WEEK_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function toggleKey(taskId: string, date: string) {
  return `${taskId}:${date}`;
}

function formatDayNumber(iso: string): string {
  const parts = iso.split('-');
  return parts[2] ?? iso;
}

export function HabitsPanel({ game, onToast, isMobile }: Props) {
  const [createTask, { isLoading: creating }] = useCreatePulseTaskMutation();
  const [toggleTask] = useTogglePulseTaskDateMutation();
  const [deleteTask] = useDeletePulseTaskMutation();

  const [optimisticMap, setOptimisticMap] = useState<Record<string, boolean>>({});
  const [pendingToggleKeys, setPendingToggleKeys] = useState<Record<string, boolean>>({});
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [habitTitle, setHabitTitle] = useState('');
  const [habitNotes, setHabitNotes] = useState('');

  const days = game.weekRangeDays;
  const today = game.today;

  useEffect(() => {
    setOptimisticMap((prev) => {
      if (!Object.keys(prev).length) return prev;

      const serverState = new Map<string, boolean>();
      game.habits.forEach((habit) => {
        Object.entries(habit.completionByDate).forEach(([date, value]) => {
          serverState.set(toggleKey(habit.task.id, date), Boolean(value));
        });
      });

      let changed = false;
      const next = { ...prev };

      Object.entries(prev).forEach(([key, value]) => {
        if (serverState.get(key) === value) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [game.habits]);

  const habits = useMemo(() => {
    return game.habits.map((habit) => {
      const completionByDate = { ...habit.completionByDate };

      days.forEach((day) => {
        const key = toggleKey(habit.task.id, day);
        if (key in optimisticMap) {
          completionByDate[day] = optimisticMap[key]!;
        }
      });

      return {
        ...habit,
        completionByDate,
      };
    });
  }, [days, game.habits, optimisticMap]);

  const doneToday = habits.filter((habit) => habit.completionByDate[today]).length;
  const bestStreak = Math.max(0, ...habits.map((habit) => habit.streak));

  const closeHabitModal = () => {
    setHabitModalOpen(false);
    setHabitTitle('');
    setHabitNotes('');
  };

  const handleCreate = async () => {
    const title = habitTitle.trim();
    if (!title) {
      onToast('Название привычки не может быть пустым');
      return;
    }

    try {
      await createTask({
        title,
        notes: habitNotes.trim() || null,
        priority: 1,
        taskType: 'HABIT',
        scheduleType: 'DAILY',
        date: game.today,
        tags: [],
      }).unwrap();
      closeHabitModal();
      onToast('Привычка добавлена');
    } catch {
      onToast('Не удалось создать привычку');
    }
  };

  const handleToggle = async (taskId: string, date: string, currentDone: boolean) => {
    if (date > today) {
      onToast('Будущие дни пока не отмечаем');
      return;
    }

    const key = toggleKey(taskId, date);
    if (pendingToggleKeys[key]) return;

    setPendingToggleKeys((prev) => ({ ...prev, [key]: true }));
    setOptimisticMap((prev) => ({ ...prev, [key]: !currentDone }));

    try {
      await toggleTask({ taskId, date }).unwrap();
    } catch {
      setOptimisticMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      onToast('Не удалось обновить отметку');
    } finally {
      setPendingToggleKeys((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId).unwrap();
      onToast('Привычка удалена');
    } catch {
      onToast('Не удалось удалить привычку');
    }
  };

  return (
    <>
      <div className={styles.frame}>
        <section className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroMain}>
              <span className={styles.heroLabel}>Ритм привычек</span>
              <div className={styles.heroValue}>
                {doneToday}
                <span className={styles.heroValueMuted}> / {habits.length || 0}</span>
              </div>
            </div>

            <div className={styles.heroMiniGrid}>
              <div className={styles.heroMiniStat}>
                <span className={styles.heroMiniLabel}>Всего</span>
                <div className={styles.heroMiniValue}>{habits.length}</div>
              </div>
              <div className={styles.heroMiniStat}>
                <span className={styles.heroMiniLabel}>Стрик</span>
                <div className={styles.heroMiniValue}>{bestStreak}</div>
              </div>
              <button
                type="button"
                className={styles.ghostIconButton}
                onClick={() => setHabitModalOpen(true)}
                aria-label="Добавить привычку"
                style={{ width: 44, height: 44, alignSelf: 'center' }}
              >
                <Plus width={18} height={18} strokeWidth={2.1} />
              </button>
            </div>
          </div>

          <div className={styles.progressBar} style={{ height: 12 }}>
            <span
              className={`${styles.progressFill} ${styles.progressFillSuccess}`}
              style={{ width: `${habits.length ? Math.round((doneToday / habits.length) * 100) : 0}%` }}
            />
          </div>
        </section>

        {habits.length === 0 ? (
          <div className={styles.empty}>
            <strong>Ещё нет привычек</strong>
            <span>Добавь одно простое повторяющееся действие и начни отмечать его по дням.</span>
          </div>
        ) : isMobile ? (
          <HabitsMobile
            habits={habits}
            days={days}
            today={today}
            pendingToggleKeys={pendingToggleKeys}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ) : (
          <HabitsGrid
            habits={habits}
            days={days}
            today={today}
            pendingToggleKeys={pendingToggleKeys}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Modal
        open={habitModalOpen}
        onClose={closeHabitModal}
        title="Новая привычка"
        subtitle="Создай повторяющееся действие и отмечай его по дням недели в новом Pulse."
        appearance="pulse"
        size="md"
      >
        <div className={modalStyles.stack}>
          <label className={modalStyles.field}>
            <span className={modalStyles.fieldLabel}>Название</span>
            <input
              value={habitTitle}
              onChange={(event) => setHabitTitle(event.target.value)}
              placeholder="Например, стакан воды утром"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </label>

          <label className={modalStyles.field}>
            <span className={modalStyles.fieldLabel}>Комментарий</span>
            <textarea
              rows={3}
              value={habitNotes}
              onChange={(event) => setHabitNotes(event.target.value)}
              placeholder="Короткое описание, если хочешь уточнить привычку"
            />
          </label>

          <div className={modalStyles.actions}>
            <button type="button" className={modalStyles.secondaryButton} onClick={closeHabitModal}>
              Отмена
            </button>
            <button
              type="button"
              className={modalStyles.primaryButton}
              onClick={() => void handleCreate()}
              disabled={creating || !habitTitle.trim()}
            >
              {creating ? 'Сохраняю…' : 'Создать'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type InnerProps = {
  habits: GameHabit[];
  days: string[];
  today: string;
  pendingToggleKeys: Record<string, boolean>;
  onToggle: (taskId: string, date: string, currentDone: boolean) => void;
  onDelete: (taskId: string) => void;
};

function HabitsGrid({ habits, days, today, pendingToggleKeys, onToggle, onDelete }: InnerProps) {
  return (
    <div className={grid.gridWrap}>
      <div className={grid.grid}>
        <div className={grid.gridHead}>
          <div className={`${grid.gridHeadCell} ${grid.first}`}>Привычка</div>
          {days.map((day, index) => (
            <div key={day} className={`${grid.gridHeadCell} ${day === today ? grid.today : ''}`}>
              {WEEK_LABELS[index]}
              <span className={grid.gridHeadDate}>{formatDayNumber(day)}</span>
            </div>
          ))}
        </div>

        {habits.map((habit) => (
          <div key={habit.task.id} className={grid.gridRow}>
            <div className={`${grid.gridCell} ${grid.titleCell}`}>
              <Sprout strokeWidth={1.8} width={18} height={18} color="#6fa24a" />
              <div className={grid.titleText}>
                <strong>{habit.task.title}</strong>
                <span>{habit.streak > 0 ? `стрик ${habit.streak} дн.` : 'без серии'}</span>
              </div>
              <button
                type="button"
                onClick={() => onDelete(habit.task.id)}
                aria-label="Удалить привычку"
                style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: '#9a8b6e', cursor: 'pointer', padding: 4 }}
              >
                <Trash2 strokeWidth={1.6} width={15} height={15} />
              </button>
            </div>

            {days.map((day) => {
              const done = Boolean(habit.completionByDate[day]);
              const isFuture = day > today;
              const isPastUnchecked = day < today && !done;
              const isPending = Boolean(pendingToggleKeys[toggleKey(habit.task.id, day)]);
              const state = isFuture ? 'future' : done ? 'done' : isPastUnchecked ? 'missed' : 'pending';

              return (
                <div key={day} className={`${grid.gridCell} ${day === today ? grid.today : ''}`}>
                  <button
                    type="button"
                    className={grid.checkCell}
                    data-state={state}
                    disabled={isFuture || isPending}
                    onClick={() => onToggle(habit.task.id, day, done)}
                    aria-label={done ? 'Снять отметку' : 'Отметить выполненной'}
                    aria-busy={isPending || undefined}
                  >
                    {done ? <Check strokeWidth={2.4} width={16} height={16} /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitsMobile({ habits, days, today, pendingToggleKeys, onToggle, onDelete }: InnerProps) {
  return (
    <div className={grid.cardList}>
      {habits.map((habit) => {
        const doneToday = Boolean(habit.completionByDate[today]);
        const todayTogglePending = Boolean(pendingToggleKeys[toggleKey(habit.task.id, today)]);

        return (
          <div key={habit.task.id} className={grid.card}>
            <div className={grid.cardHead}>
              <div className={grid.cardTitle}>
                <strong>{habit.task.title}</strong>
                <span>{doneToday ? 'Сегодня отмечено' : 'Ждёт отметки'}</span>
              </div>
              {habit.streak > 0 ? (
                <span className={grid.streakBadge}>
                  <Flame strokeWidth={1.8} width={14} height={14} /> {habit.streak}
                </span>
              ) : null}
            </div>

            <div className={grid.cardWeek}>
              {days.map((day, index) => {
                const done = Boolean(habit.completionByDate[day]);
                const isFuture = day > today;
                const isToday = day === today;
                const isPending = Boolean(pendingToggleKeys[toggleKey(habit.task.id, day)]);
                const state = isFuture ? 'future' : isToday ? 'today' : done ? 'done' : 'pending';

                return (
                  <div key={day} className={grid.cardDay}>
                    <span className={grid.cardDayLabel}>{WEEK_LABELS[index]}</span>
                    <button
                      type="button"
                      className={grid.cardDayBtn}
                      data-state={state}
                      data-done={done ? 'true' : 'false'}
                      disabled={isFuture || isPending}
                      onClick={() => onToggle(habit.task.id, day, done)}
                      aria-label={done ? 'Снять отметку' : 'Отметить'}
                      aria-busy={isPending || undefined}
                    >
                      {done ? (
                        <Check strokeWidth={2.4} width={14} height={14} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{formatDayNumber(day)}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className={grid.cardActions}>
              <button
                type="button"
                className={styles.secondary}
                style={{ flex: 1 }}
                onClick={() => onToggle(habit.task.id, today, doneToday)}
                disabled={todayTogglePending}
              >
                {doneToday ? 'Снять сегодня' : 'Отметить сегодня'}
              </button>
              <button
                type="button"
                className={`${grid.cardGhost} ${grid.cardGhostDanger}`}
                onClick={() => onDelete(habit.task.id)}
              >
                <Trash2 strokeWidth={1.6} width={14} height={14} /> Удалить
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
