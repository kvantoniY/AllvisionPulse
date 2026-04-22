'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Ellipsis, Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import styles from './PanelFrame.module.css';
import modalStyles from '../workspace/PulseWorkspaceForms.module.css';
import type { GameState } from '../../model/useGameState';
import type { WorkspaceSection } from '../../lib/types';
import type { PulseTaskItem } from '@/shared/types/pulse';
import {
  useCreatePulseGoalMutation,
  useCreatePulseTaskMutation,
  useDeletePulseTaskMutation,
  useGetTasksDayQuery,
  useGetTasksRangeQuery,
  useTogglePulseTaskDateMutation,
  useUpdatePulseTaskMutation,
} from '@/shared/api/pulseApi';
import { Modal } from '@/shared/ui/Modal/Modal';
import { TasksCalendarBoard } from './TasksCalendarBoard';
import {
  buildGoalDescription,
  buildTaskPayload,
  canSubmitTaskDraft,
  createTaskDraft,
  createTaskDraftFromItem,
  decorateGoal,
  getPriorityLabel,
  normalizeTaskDraft,
  parseDate,
  resolveTaskAreaFromTags,
  shiftDate,
  type TaskArea,
  type TaskDraft,
} from '../workspace/pulseWorkspaceUtils';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  onNavigate?: (section: WorkspaceSection) => void;
};

const TASK_TEMPLATES = ['Подготовить отчёт', 'Позвонить', 'Прогулка', 'Разобрать почту', 'Тренировка'];

const TASK_AREA_META: Record<Exclude<TaskArea, 'none'>, { label: string; className?: string }> = {
  work: { label: 'работа', className: styles.tagWork },
  home: { label: 'дом', className: styles.tagHome },
  health: { label: 'здоровье', className: styles.tagHealth },
  personal: { label: 'личное', className: styles.tagPersonal },
};

const TASK_AREA_OPTIONS: Array<{ value: TaskArea; label: string }> = [
  { value: 'none', label: 'Без категории' },
  { value: 'work', label: 'Работа' },
  { value: 'home', label: 'Дом' },
  { value: 'health', label: 'Здоровье' },
  { value: 'personal', label: 'Личное' },
];

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Низкий' },
  { value: 2, label: 'Обычный' },
  { value: 4, label: 'Высокий' },
];

function toDateKey(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function isTaskOverdue(task: PulseTaskItem, today: string) {
  const dueDate = toDateKey(task.dueDate);
  return Boolean(dueDate && dueDate < today && !task.completedForDate);
}

function formatShortDate(value: string | null | undefined) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function sortTasksForList(items: PulseTaskItem[], today: string) {
  return [...items].sort((left, right) => {
    const leftDone = Boolean(left.completedForDate);
    const rightDone = Boolean(right.completedForDate);
    if (leftDone !== rightDone) return leftDone ? 1 : -1;

    const leftDate = parseDate(left.dueDate ?? null);
    const rightDate = parseDate(right.dueDate ?? null);
    const leftHasTime = Boolean(left.hasTime && leftDate);
    const rightHasTime = Boolean(right.hasTime && rightDate);
    const leftTime =
      leftHasTime && leftDate ? leftDate.getHours() * 60 + leftDate.getMinutes() : Number.POSITIVE_INFINITY;
    const rightTime =
      rightHasTime && rightDate ? rightDate.getHours() * 60 + rightDate.getMinutes() : Number.POSITIVE_INFINITY;

    if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1;

    const leftDateKey = toDateKey(left.dueDate) ?? today;
    const rightDateKey = toDateKey(right.dueDate) ?? today;
    if (leftDateKey !== rightDateKey) return leftDateKey.localeCompare(rightDateKey);

    if (leftTime !== rightTime) return leftTime - rightTime;
    if ((right.priority ?? 0) !== (left.priority ?? 0)) return (right.priority ?? 0) - (left.priority ?? 0);
    return left.title.localeCompare(right.title, 'ru');
  });
}

function emptyCopy() {
  return {
    title: 'Список пока пустой',
    description: 'Добавь первую задачу, чтобы день собрался в понятный план.',
  };
}

function createGoalSubtasksFromText(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `goal-subtask-${Date.now()}-${index}`,
      title,
      done: false,
    }));
}

export function TasksPanel({ game, onToast, onNavigate: _onNavigate }: Props) {
  const [createGoal, { isLoading: creatingGoal }] = useCreatePulseGoalMutation();
  const [createTask, { isLoading: creating }] = useCreatePulseTaskMutation();
  const [updateTask, { isLoading: updating }] = useUpdatePulseTaskMutation();
  const [toggleTask] = useTogglePulseTaskDateMutation();
  const [deleteTask, { isLoading: deleting }] = useDeletePulseTaskMutation();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskEditingId, setTaskEditingId] = useState<string | null>(null);
  const [taskAdvancedOpen, setTaskAdvancedOpen] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<'LIST' | 'EXTENDED'>('LIST');
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [taskForm, setTaskForm] = useState<TaskDraft>(() => createTaskDraft(game.today));
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
    targetDate: '',
    subtasks: '',
  });
  const tomorrowDate = useMemo(() => shiftDate(game.today, 1), [game.today]);
  const { data: tomorrowTasksData } = useGetTasksDayQuery(tomorrowDate);
  const weekRangeStart = game.weekRangeDays[0] ?? game.today;
  const weekRangeEnd = game.weekRangeDays[game.weekRangeDays.length - 1] ?? game.today;
  const { data: weekTasksData, isFetching: weekTasksFetching } = useGetTasksRangeQuery(
    { from: weekRangeStart, to: weekRangeEnd },
    {
      skip: taskViewMode !== 'EXTENDED' || !weekRangeStart || !weekRangeEnd,
    },
  );

  const items = useMemo(
    () => (game.tasks.items ?? []).filter((task) => task.taskType !== 'HABIT'),
    [game.tasks.items],
  );
  const tomorrowItems = useMemo(
    () => (tomorrowTasksData?.items ?? []).filter((task) => task.taskType !== 'HABIT'),
    [tomorrowTasksData?.items],
  );
  const todayPendingItems = useMemo(
    () => sortTasksForList(items.filter((task) => !task.completedForDate), game.today),
    [game.today, items],
  );
  const completedTodayItems = useMemo(
    () => sortTasksForList(items.filter((task) => task.completedForDate), game.today),
    [game.today, items],
  );
  const tomorrowPendingItems = useMemo(
    () => sortTasksForList(tomorrowItems.filter((task) => !task.completedForDate), tomorrowDate),
    [tomorrowDate, tomorrowItems],
  );
  const calendarTaskItems = useMemo(
    () => (weekTasksData?.items ?? []).filter((task) => task.taskType !== 'HABIT'),
    [weekTasksData?.items],
  );
  const goalCards = useMemo(() => game.tasks.goals.map((goal) => decorateGoal(goal)), [game.tasks.goals]);
  const summary = game.tasks.summary;
  const completionPercent =
    summary.total > 0 ? Math.max(0, Math.min(100, Math.round((summary.completed / summary.total) * 100))) : 0;
  const taskSaving = creating || updating;
  const emptyState = emptyCopy();

  useEffect(() => {
    if (!taskModalOpen) {
      setTaskForm(createTaskDraft(game.today));
      setTaskEditingId(null);
      setTaskAdvancedOpen(false);
    }
  }, [game.today, taskModalOpen]);

  const closeTaskModal = () => {
    setTaskModalOpen(false);
    setTaskEditingId(null);
    setTaskAdvancedOpen(false);
    setTaskForm(createTaskDraft(game.today));
  };

  const closeGoalModal = () => {
    setGoalModalOpen(false);
    setGoalForm({
      title: '',
      description: '',
      targetDate: '',
      subtasks: '',
    });
  };

  const openTaskModal = (defaults?: Partial<TaskDraft>) => {
    setTaskEditingId(null);
    setTaskAdvancedOpen(Boolean(defaults?.notes));
    setTaskForm(createTaskDraft(defaults?.date || game.today, defaults));
    setTaskModalOpen(true);
  };

  const openTaskEditModal = (task: PulseTaskItem) => {
    setTaskEditingId(task.id);
    setTaskAdvancedOpen(Boolean(task.notes?.trim()));
    setTaskForm(createTaskDraftFromItem(task, game.today));
    setTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!canSubmitTaskDraft(taskForm)) {
      onToast('Заполни название и дату задачи');
      return;
    }

    try {
      const payload = buildTaskPayload(taskForm, game.today);

      if (taskEditingId) {
        await updateTask({ taskId: taskEditingId, body: payload }).unwrap();
        onToast('Задача обновлена');
      } else {
        await createTask(payload).unwrap();
        onToast('Задача добавлена');
      }

      closeTaskModal();
    } catch {
      onToast('Не удалось сохранить задачу');
    }
  };

  const handleToggle = async (taskId: string) => {
    try {
      await toggleTask({ taskId, date: game.today }).unwrap();
    } catch {
      onToast('Не удалось обновить задачу');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId).unwrap();
      onToast('Задача удалена');
      if (taskEditingId === taskId) {
        closeTaskModal();
      }
    } catch {
      onToast('Не удалось удалить задачу');
    }
  };

  const handleQuickCreate = async () => {
    const title = quickTaskTitle.trim();
    if (!title) {
      onToast('\u0412\u0432\u0435\u0434\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438');
      return;
    }

    try {
      const payload = buildTaskPayload(createTaskDraft(game.today, { title }), game.today);
      await createTask(payload).unwrap();
      setQuickTaskTitle('');
      onToast('\u0417\u0430\u0434\u0430\u0447\u0430 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430');
    } catch {
      onToast('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443');
    }
  };

  const handleOpenAdvancedCreate = () => {
    const defaults = quickTaskTitle.trim() ? { title: quickTaskTitle.trim() } : undefined;
    setTaskEditingId(null);
    setTaskAdvancedOpen(true);
    setTaskForm(createTaskDraft(game.today, defaults));
    setTaskModalOpen(true);
  };

  const handleOpenCalendarCreate = (defaults: {
    date: string;
    time?: string | null;
    endTime?: string | null;
    allDay: boolean;
  }) => {
    const seededTitle = quickTaskTitle.trim();
    openTaskModal({
      title: seededTitle,
      date: defaults.date,
      timeMode: defaults.allDay ? 'NONE' : defaults.endTime ? 'RANGE' : defaults.time ? 'SINGLE' : 'NONE',
      time: defaults.allDay ? '' : defaults.time ?? '',
      endTime: defaults.allDay ? '' : defaults.endTime ?? '',
      hasEndTime: !defaults.allDay && Boolean(defaults.endTime),
    });
  };

  const handleCalendarTaskUpdate = async (taskId: string, body: Record<string, unknown>) => {
    await updateTask({ taskId, body }).unwrap();
  };

  const handleCreateGoal = async () => {
    const title = goalForm.title.trim();
    if (!title) {
      onToast('\u0412\u0432\u0435\u0434\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0446\u0435\u043b\u0438');
      return;
    }

    try {
      const subtasks = createGoalSubtasksFromText(goalForm.subtasks);

      await createGoal({
        title,
        description: buildGoalDescription(goalForm.description, {
          subtasks,
          achieved: false,
        }),
        progress: 0,
        targetDate: goalForm.targetDate || null,
      }).unwrap();

      closeGoalModal();
      onToast('\u0411\u043e\u043b\u044c\u0448\u0430\u044f \u0446\u0435\u043b\u044c \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430');
    } catch {
      onToast('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0443\u044e \u0446\u0435\u043b\u044c');
    }
  };

  const renderTaskItem = (task: PulseTaskItem) => {
    const done = task.completedForDate;
    const resolvedArea = resolveTaskAreaFromTags(task.tags ?? []);
    const areaMeta =
      resolvedArea === 'none'
        ? { label: '\u043b\u0438\u0447\u043d\u043e\u0435', className: styles.tagOther }
        : TASK_AREA_META[resolvedArea];
    const dateKey = toDateKey(task.dueDate);
    const dateLabel = dateKey && dateKey !== game.today ? formatShortDate(task.dueDate) : null;
    const overdue = isTaskOverdue(task, game.today);

    return (
      <div key={task.id} className={[styles.rowItem, styles.taskRow].join(' ')}>
        <div className={[styles.rowItemMain, styles.taskRowMain].join(' ')}>
          <button
            type="button"
            className={[styles.taskCheck, done ? styles.taskCheckDone : ''].filter(Boolean).join(' ')}
            onClick={() => handleToggle(task.id)}
            aria-label={
              done
                ? '\u0421\u043d\u044f\u0442\u044c \u043e\u0442\u043c\u0435\u0442\u043a\u0443'
                : '\u041e\u0442\u043c\u0435\u0442\u0438\u0442\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u043e\u0439'
            }
          >
            {done ? <Check width={16} height={16} strokeWidth={2.4} /> : null}
          </button>

          <div className={[styles.rowItemTitle, styles.taskRowTitle].join(' ')}>
            <strong className={done ? styles.taskTitleDone : ''}>{task.title}</strong>
            {task.notes?.trim() ? <span>{task.notes.trim()}</span> : null}
            <div className={styles.taskMetaLine}>
              <span className={[styles.tag, areaMeta.className].filter(Boolean).join(' ')}>
                {areaMeta.label}
              </span>
              {task.timeLabel ? <span className={styles.priorityPill}>{task.timeLabel}</span> : null}
              {dateLabel ? <span className={styles.priorityPill}>{dateLabel}</span> : null}
              {overdue ? (
                <span className={`${styles.priorityPill} ${styles.priorityPillDanger}`}>
                  {'\u043f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e'}
                </span>
              ) : null}
              {task.taskType === 'REGULAR' ? (
                <span className={styles.priorityPill}>{'\u043f\u043e\u0432\u0442\u043e\u0440'}</span>
              ) : null}
              <span className={styles.priorityPill}>{getPriorityLabel(task.priority ?? 2)}</span>
            </div>
          </div>
        </div>

        <div className={[styles.rowItemMeta, styles.taskRowActions].join(' ')} data-inline="true">
          <button
            type="button"
            className={styles.ghostIconButton}
            onClick={() => openTaskEditModal(task)}
            aria-label={'\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443'}
          >
            <Pencil width={16} height={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.ghostIconButton}
            onClick={() => handleDelete(task.id)}
            aria-label={'\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443'}
          >
            <Trash2 width={16} height={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={styles.frame}>
        <section className={styles.heroCard}>
          <div className={styles.heroTop}>
            <div className={styles.heroMain}>
              <span className={styles.heroLabel}>{'\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f'}</span>
              <div className={styles.heroValue}>
                {summary.completed}
                <span className={styles.heroValueMuted}> / {summary.total}</span>
              </div>
            </div>
          </div>

          <div className={styles.progressBar} style={{ height: 12 }}>
            <span
              className={`${styles.progressFill} ${styles.progressFillSuccess}`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          <div className={styles.quickComposer}>
            <input
              className={styles.quickComposerInput}
              placeholder={'\u0411\u044b\u0441\u0442\u0440\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443'}
              value={quickTaskTitle}
              onChange={(event) => setQuickTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleQuickCreate();
                }
              }}
            />
            <div className={styles.quickComposerActions}>
              <button
                type="button"
                className={`${styles.quickComposerAction} ${styles.quickComposerActionPrimary}`}
                onClick={() => void handleQuickCreate()}
                aria-label={'\u0411\u044b\u0441\u0442\u0440\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443'}
                disabled={creating || !quickTaskTitle.trim()}
              >
                <Plus width={18} height={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className={styles.quickComposerAction}
                onClick={handleOpenAdvancedCreate}
                aria-label={'\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438'}
              >
                <Ellipsis width={18} height={18} strokeWidth={2.1} />
              </button>
            </div>
          </div>

          <div className={styles.segmentRail} aria-label="Режим отображения задач">
            <button
              type="button"
              className={styles.segment}
              data-active={taskViewMode === 'LIST'}
              onClick={() => setTaskViewMode('LIST')}
            >
              Списком
            </button>
            <button
              type="button"
              className={styles.segment}
              data-active={taskViewMode === 'EXTENDED'}
              onClick={() => setTaskViewMode('EXTENDED')}
            >
              Расширенный
            </button>
          </div>

          {taskViewMode === 'LIST' ? (
            <div className={styles.taskGroups}>
              <div className={styles.taskGroup}>
                <span className={styles.taskGroupLabel}>{'\u0421\u0435\u0433\u043e\u0434\u043d\u044f'}</span>
                <div className={styles.taskGroupList}>
                  {todayPendingItems.length ? (
                    todayPendingItems.map((task) => renderTaskItem(task))
                  ) : (
                    <div className={styles.taskGroupEmpty}>{'\u041d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447 \u043d\u0435\u0442.'}</div>
                  )}
                </div>
              </div>

              <div className={styles.taskGroup}>
                <span className={styles.taskGroupLabel}>{'\u0417\u0430\u0432\u0442\u0440\u0430'}</span>
                <div className={styles.taskGroupList}>
                  {tomorrowPendingItems.length ? (
                    tomorrowPendingItems.map((task) => renderTaskItem(task))
                  ) : (
                    <div className={styles.taskGroupEmpty}>{'\u041d\u0430 \u0437\u0430\u0432\u0442\u0440\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447.'}</div>
                  )}
                </div>
              </div>

              <div className={styles.taskGroup}>
                <span className={styles.taskGroupLabel}>{'\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e'}</span>
                <div className={styles.taskGroupList}>
                  {completedTodayItems.length ? (
                    completedTodayItems.map((task) => renderTaskItem(task))
                  ) : (
                    <div className={styles.taskGroupEmpty}>{'\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u0435\u0449\u0435 \u043d\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043d\u044b\u0445 \u0437\u0430\u0434\u0430\u0447.'}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <TasksCalendarBoard
              selectedDate={game.today}
              tasks={calendarTaskItems}
              loading={weekTasksFetching}
              onOpenTask={openTaskEditModal}
              onCreateTask={handleOpenCalendarCreate}
              onUpdateTask={handleCalendarTaskUpdate}
              onToast={onToast}
            />
          )}
        </section>

        <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Большие цели</div>
              <div className={styles.sectionMeta}>{goalCards.length} в фокусе</div>
              <button
                type="button"
                className={styles.ghostIconButton}
                style={{ marginLeft: 'auto' }}
                onClick={() => setGoalModalOpen(true)}
                aria-label={'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0443\u044e \u0446\u0435\u043b\u044c'}
              >
                <Plus width={18} height={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className={styles.goalList}>
              {goalCards.length ? (
                goalCards.map((goal) => {
                  const expanded = Boolean(expandedGoals[goal.id]);

                  return (
                    <div key={goal.id} className={styles.goalCard}>
                    <div className={styles.goalHead}>
                      <div className={styles.rowItemTitle}>
                        <strong>{goal.title}</strong>
                        <span>
                          {goal.displayDescription || (
                            goal.subtaskCount
                              ? `${goal.doneCount} из ${goal.subtaskCount} шагов закрыто`
                              : 'Без описания'
                          )}
                        </span>
                      </div>

                      <div className={styles.rowItemMeta}>
                        <strong>{goal.computedProgress}%</strong>
                        {goal.targetDate ? (
                          <span>до {formatShortDate(goal.targetDate)}</span>
                        ) : goal.subtaskCount ? (
                          <span>{goal.doneCount}/{goal.subtaskCount} шагов</span>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.progressBar}>
                      <span
                        className={styles.progressFill}
                        style={{ width: `${Math.min(100, goal.computedProgress)}%` }}
                      />
                    </div>

                    {goal.subtaskCount ? (
                      <>
                        <button
                          type="button"
                          className={styles.goalDisclosure}
                          onClick={() =>
                            setExpandedGoals((prev) => ({
                              ...prev,
                              [goal.id]: !prev[goal.id],
                            }))
                          }
                        >
                          <span>Подзадачи</span>
                          <span className={styles.goalDisclosureMeta}>
                            {goal.doneCount}/{goal.subtaskCount}
                          </span>
                          <ChevronDown
                            width={16}
                            height={16}
                            strokeWidth={1.9}
                            className={expanded ? styles.goalDisclosureIconOpen : undefined}
                          />
                        </button>

                        {expanded ? (
                          <div className={styles.subtaskList}>
                            {goal.subtasks.map((subtask) => (
                              <div key={subtask.id} className={styles.subtaskRow}>
                                <span className={styles.subtaskState} data-done={subtask.done}>
                                  {subtask.done ? <Check width={12} height={12} strokeWidth={2.2} /> : null}
                                </span>
                                <span className={subtask.done ? styles.taskTitleDone : ''}>{subtask.title}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    </div>
                  );
                })
              ) : (
                <div className={styles.taskGroupEmpty}>
                  {'\u0415\u0449\u0435 \u043d\u0435\u0442 \u0431\u043e\u043b\u044c\u0448\u0438\u0445 \u0446\u0435\u043b\u0435\u0439. \u041d\u0430\u0436\u043c\u0438 \u043d\u0430 \u043f\u043b\u044e\u0441, \u0447\u0442\u043e\u0431\u044b \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0446\u0435\u043b\u044c \u0441 \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0430\u043c\u0438.'}
                </div>
              )}
            </div>
          </section>

      </div>

      <Modal
        open={goalModalOpen}
        onClose={closeGoalModal}
        title={'\u041d\u043e\u0432\u0430\u044f \u0431\u043e\u043b\u044c\u0448\u0430\u044f \u0446\u0435\u043b\u044c'}
        subtitle={'\u0421\u043e\u0431\u0435\u0440\u0438 \u0446\u0435\u043b\u044c, \u0441\u0440\u043e\u043a \u0438 \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0438 \u0432 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435.'}
        appearance="pulse"
        size="md"
      >
        <div className={modalStyles.stack}>
          <Field label={'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0446\u0435\u043b\u0438'}>
            <input
              placeholder={'\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440, \u043f\u0440\u043e\u0439\u0442\u0438 \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0443 \u0434\u043e \u043a\u043e\u043d\u0446\u0430'}
              value={goalForm.title}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </Field>

          <Field label={'\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'}>
            <textarea
              rows={3}
              placeholder={'\u041a\u043e\u0440\u043e\u0442\u043a\u043e \u043e\u043f\u0438\u0448\u0438, \u0437\u0430\u0447\u0435\u043c \u0442\u0435\u0431\u0435 \u044d\u0442\u0430 \u0446\u0435\u043b\u044c'}
              value={goalForm.description}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </Field>

          <Field label={'\u0421\u0440\u043e\u043a'}>
            <input
              type="date"
              value={goalForm.targetDate}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
            />
          </Field>

          <Field label={'\u041f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0438'}>
            <textarea
              rows={6}
              placeholder={'\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u043e\u0434\u0437\u0430\u0434\u0430\u0447\u0430 \u0441 \u043d\u043e\u0432\u043e\u0439 \u0441\u0442\u0440\u043e\u043a\u0438'}
              value={goalForm.subtasks}
              onChange={(event) => setGoalForm((prev) => ({ ...prev, subtasks: event.target.value }))}
            />
          </Field>

          <div className={modalStyles.actions}>
            <button type="button" className={modalStyles.secondaryButton} onClick={closeGoalModal}>
              {'\u041e\u0442\u043c\u0435\u043d\u0430'}
            </button>
            <button
              type="button"
              className={modalStyles.primaryButton}
              onClick={() => void handleCreateGoal()}
              disabled={creatingGoal || !goalForm.title.trim()}
            >
              {creatingGoal ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u2026' : '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0446\u0435\u043b\u044c'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={taskModalOpen}
        onClose={closeTaskModal}
        title={taskEditingId ? 'Редактировать задачу' : 'Добавить задачу'}
        subtitle={
          taskEditingId
            ? 'Обнови поля и сохрани изменения.'
            : 'Все ключевые поля старого Pulse уже здесь: тип, повтор, дата, время и описание.'
        }
        appearance="pulse"
        size="lg"
      >
        <div className={modalStyles.stack}>
          <Field label="Название задачи">
            <input
              placeholder="Что нужно сделать?"
              value={taskForm.title}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </Field>

          {!taskEditingId ? (
            <div className={modalStyles.templateRow}>
              {TASK_TEMPLATES.map((template) => (
                <button
                  key={template}
                  type="button"
                  className={modalStyles.templateButton}
                  onClick={() => setTaskForm((prev) => ({ ...prev, title: template }))}
                >
                  {template}
                </button>
              ))}
            </div>
          ) : null}

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitle}>Тип задачи</div>
            <Segmented
              value={taskForm.taskType}
              options={[
                { value: 'ONE_TIME', label: 'Один раз' },
                { value: 'REGULAR', label: 'Повтор' },
                { value: 'HABIT', label: 'Привычка' },
              ]}
              onChange={(value) =>
                setTaskForm((prev) => ({
                  ...prev,
                  taskType: value as TaskDraft['taskType'],
                  scheduleType: value === 'REGULAR' ? (prev.scheduleType === 'NONE' ? 'WEEKLY' : prev.scheduleType) : 'NONE',
                }))
              }
            />
          </section>

          {taskForm.taskType === 'REGULAR' ? (
            <section className={modalStyles.section}>
              <div className={modalStyles.sectionTitle}>Как повторять</div>
              <Segmented
                value={taskForm.scheduleType}
                compact
                options={[
                  { value: 'WEEKLY', label: 'По дням недели' },
                  { value: 'MONTHLY', label: 'По дням месяца' },
                ]}
                onChange={(value) => setTaskForm((prev) => ({ ...prev, scheduleType: value as TaskDraft['scheduleType'] }))}
              />

              {taskForm.scheduleType === 'WEEKLY' ? (
                <div className={modalStyles.weekSelector}>
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      className={modalStyles.weekButton}
                      data-active={taskForm.daysOfWeek.includes(index)}
                      onClick={() =>
                        setTaskForm((prev) => ({
                          ...prev,
                          daysOfWeek: prev.daysOfWeek.includes(index)
                            ? prev.daysOfWeek.filter((item) => item !== index)
                            : [...prev.daysOfWeek, index].sort((left, right) => left - right),
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {taskForm.scheduleType === 'MONTHLY' ? (
                <Field label="Дни месяца через запятую">
                  <input
                    placeholder="Например, 1, 15, 28"
                    value={taskForm.daysOfMonth.join(', ')}
                    onChange={(event) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        daysOfMonth: event.target.value
                          .split(',')
                          .map((item) => Number(item.trim()))
                          .filter((item) => Number.isFinite(item) && item > 0 && item <= 31),
                      }))
                    }
                  />
                </Field>
              ) : null}
            </section>
          ) : null}

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitle}>Когда</div>
            <div className={modalStyles.gridTwo}>
              <Field label="Дата">
                <input
                  type="date"
                  value={taskForm.date}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, date: event.target.value }))}
                />
              </Field>
              <Field label="Время">
                <input
                  type="time"
                  value={taskForm.time}
                  onChange={(event) =>
                    setTaskForm((prev) =>
                      normalizeTaskDraft({
                        ...prev,
                        time: event.target.value,
                        endTime:
                          event.target.value && prev.hasEndTime
                            ? prev.endTime || ''
                            : prev.endTime,
                      }),
                    )
                  }
                />
              </Field>
            </div>

            {taskForm.time ? (
              <Field label="Окончание">
                <input
                  type="time"
                  value={taskForm.endTime}
                  min={taskForm.time || undefined}
                  onChange={(event) =>
                    setTaskForm((prev) =>
                      normalizeTaskDraft({
                        ...prev,
                        endTime: event.target.value,
                        hasEndTime: Boolean(event.target.value),
                      }),
                    )
                  }
                />
              </Field>
            ) : null}
          </section>

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitle}>Приоритет</div>
            <div className={modalStyles.chipRow}>
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={modalStyles.chip}
                  data-active={taskForm.priority === option.value}
                  onClick={() => setTaskForm((prev) => ({ ...prev, priority: option.value }))}
                >
                  <Flag width={12} height={12} strokeWidth={1.8} />
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitle}>Область</div>
            <div className={modalStyles.chipRow}>
              {TASK_AREA_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={modalStyles.chip}
                  data-active={taskForm.area === option.value}
                  onClick={() => setTaskForm((prev) => ({ ...prev, area: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={modalStyles.section}>
            <div className={modalStyles.sectionTitleRow}>
              <div className={modalStyles.sectionTitle}>Дополнительно</div>
              <button
                type="button"
                className={modalStyles.textButton}
                onClick={() => setTaskAdvancedOpen((prev) => !prev)}
              >
                {taskAdvancedOpen ? 'Скрыть' : 'Показать описание'}
              </button>
            </div>

            {taskAdvancedOpen ? (
              <Field label="Описание">
                <textarea
                  rows={4}
                  placeholder="Добавь детали, чтобы задача была понятнее"
                  value={taskForm.notes}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </Field>
            ) : (
              <div className={modalStyles.helper}>Описание можно оставить пустым или развернуть при необходимости.</div>
            )}
          </section>

          <div className={modalStyles.actions}>
            {taskEditingId ? (
              <button
                type="button"
                className={modalStyles.dangerButton}
                onClick={() => void handleDelete(taskEditingId)}
                disabled={deleting}
              >
                Удалить
              </button>
            ) : null}
            <button type="button" className={modalStyles.secondaryButton} onClick={closeTaskModal}>
              Отмена
            </button>
            <button
              type="button"
              className={modalStyles.primaryButton}
              onClick={handleSaveTask}
              disabled={taskSaving || !canSubmitTaskDraft(taskForm)}
            >
              {taskSaving ? 'Сохраняю…' : taskEditingId ? 'Сохранить изменения' : 'Добавить'}
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

function Segmented({
  value,
  options,
  onChange,
  compact = false,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={[modalStyles.segmented, compact ? modalStyles.segmentedCompact : ''].filter(Boolean).join(' ')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={modalStyles.segmentButton}
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
