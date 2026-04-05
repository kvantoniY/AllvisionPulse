'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useCreateProgramMutation, useLazySearchProgramAccessUsersQuery, usePublishProgramMutation } from '@/shared/api/programsApi';
import type { ProgramBuilderAction, ProgramBuilderInput, ProgramBuilderDay, ProgramBuilderStage } from '@/shared/types/programs';
import { ProgramsContextBar, accessModeLabel, buildHealthProgramsHref, integrationTypeLabel, structureTypeLabel } from './programUi';
import styles from './ProgramsShell.module.css';

const steps = ['Основное', 'Доступ', 'Структура', 'Дни и шаги', 'Правила', 'Превью'] as const;

const stepIcons = ['pulse', 'shield', 'menu', 'checkDouble', 'settings', 'sparkles'] as const;

const actionPresets: Array<{
  type: ProgramBuilderAction['actionType'];
  label: string;
  icon: 'checkDouble' | 'heart' | 'pulse' | 'sparkles' | 'comment' | 'clock' | 'menu' | 'pencil';
  description: string;
}> = [
  { type: 'TASK', label: 'Задача', icon: 'checkDouble', description: 'Связать с Task Tracker' },
  { type: 'HEALTH_CHECKIN', label: 'Чек-ин', icon: 'heart', description: 'Самочувствие и состояние' },
  { type: 'NUTRITION_TARGET', label: 'Питание', icon: 'pulse', description: 'Калории или БЖУ' },
  { type: 'FINANCE_TARGET', label: 'Финансы', icon: 'sparkles', description: 'Накопления, лимиты, долги' },
  { type: 'REFLECTION', label: 'Рефлексия', icon: 'comment', description: 'Короткий вопрос дня' },
  { type: 'REMINDER', label: 'Напоминание', icon: 'clock', description: 'Мягкий сигнал без задачи' },
  { type: 'INFO_ONLY', label: 'Подсказка', icon: 'menu', description: 'Инфо-блок без обязательств' },
  { type: 'CUSTOM', label: 'Свой шаг', icon: 'pencil', description: 'Произвольное действие' },
];

function buildActionPreset(type: ProgramBuilderAction['actionType'], index = 0): ProgramBuilderAction {
  if (type === 'HEALTH_CHECKIN') {
    return {
      actionType: 'HEALTH_CHECKIN',
      integrationType: 'HEALTH',
      title: 'Отметить самочувствие',
      description: 'Коротко отметить состояние, сон и настроение.',
      required: true,
      estimatedMinutes: 3,
      completionPolicy: 'Достаточно одного короткого чек-ина.',
      reschedulePolicy: 'Можно перенести на вечер.',
      payloadJson: { checkinType: 'daily' },
    };
  }
  if (type === 'NUTRITION_TARGET') {
    return {
      actionType: 'NUTRITION_TARGET',
      integrationType: 'NUTRITION',
      title: 'Удержать цель по питанию',
      description: 'Открыть Nutrition и проверить цель на день.',
      required: true,
      estimatedMinutes: 10,
      completionPolicy: 'Засчитывается после контроля цели.',
      reschedulePolicy: 'Лучше выполнять вечером.',
      payloadJson: { metric: 'calories' },
    };
  }
  if (type === 'FINANCE_TARGET') {
    return {
      actionType: 'FINANCE_TARGET',
      integrationType: 'FINANCE',
      title: 'Проверить финансовую цель',
      description: 'Открыть финансы и отметить прогресс.',
      required: true,
      estimatedMinutes: 8,
      completionPolicy: 'Засчитывается после проверки или записи.',
      reschedulePolicy: 'Можно перенести внутри дня.',
      payloadJson: { metric: 'savings' },
    };
  }
  if (type === 'REFLECTION') {
    return {
      actionType: 'REFLECTION',
      integrationType: 'JOURNAL',
      title: 'Короткая рефлексия',
      description: 'Подвести итог дня одной заметкой.',
      required: false,
      estimatedMinutes: 7,
      completionPolicy: 'Хватает короткого ответа.',
      reschedulePolicy: 'Можно перенести на вечер.',
      payloadJson: { mode: 'reflection' },
    };
  }
  if (type === 'REMINDER') {
    return {
      actionType: 'REMINDER',
      integrationType: 'REMINDER',
      title: 'Напомнить себе о главном',
      description: 'Ненавязчивое действие на день.',
      required: false,
      estimatedMinutes: 1,
      completionPolicy: 'Достаточно увидеть и подтвердить.',
      reschedulePolicy: 'Можно свободно перенести.',
      payloadJson: { tone: 'gentle' },
    };
  }
  if (type === 'INFO_ONLY') {
    return {
      actionType: 'INFO_ONLY',
      integrationType: 'NONE',
      title: 'Подсказка дня',
      description: 'Показать важный блок без отдельной задачи.',
      required: false,
      estimatedMinutes: 2,
      completionPolicy: 'Засчитывается после просмотра.',
      reschedulePolicy: 'Перенос не обязателен.',
      payloadJson: { presentation: 'card' },
    };
  }
  if (type === 'CUSTOM') {
    return {
      actionType: 'CUSTOM',
      integrationType: 'NONE',
      title: `Свой шаг ${index + 1}`,
      description: '',
      required: true,
      estimatedMinutes: 15,
      completionPolicy: 'Определяется автором программы.',
      reschedulePolicy: 'Можно перенести вручную.',
      payloadJson: {},
    };
  }
  return {
    actionType: 'TASK',
    integrationType: 'TASK_TRACKER',
    title: 'Главный шаг дня',
    description: 'Создаст связанную задачу и будет синхронизироваться с Task Tracker.',
    required: true,
    estimatedMinutes: 20,
    completionPolicy: 'Засчитывается при выполнении задачи.',
    reschedulePolicy: 'Можно перенести на другой день.',
    payloadJson: {},
  };
}

const defaultDay: ProgramBuilderDay = {
  dayNumber: 1,
  title: 'День 1',
  dayText: '',
  tipOfDay: '',
  motivationOfDay: '',
  reflectionPrompt: '',
  actions: [buildActionPreset('TASK')],
  milestones: [],
};

const defaultStage: ProgramBuilderStage = {
  title: 'Этап 1',
  description: '',
  startDay: 1,
  endDay: 7,
  milestoneText: '',
};

export function ProgramBuilderPage({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [allowedQuery, setAllowedQuery] = useState('');
  const [publishAfterSave, setPublishAfterSave] = useState(false);
  const [program, setProgram] = useState<ProgramBuilderInput>({
    title: '',
    description: '',
    theme: '',
    coverUrl: '',
    durationDays: 30,
    accessMode: 'PRIVATE',
    structureType: 'FIXED_DURATION',
    collaborativeEnabled: true,
    allowedUsernames: [],
    rules: {
      allowSkip: true,
      allowPause: true,
      allowResume: true,
      allowCancel: true,
      allowRecovery: true,
      maxReschedulesPerAction: 3,
      recoveryConfigJson: {},
      progressConfigJson: {},
      integrationConfigJson: {},
    },
    stages: [defaultStage],
    days: [defaultDay],
  });

  const [createProgram, { isLoading: creating }] = useCreateProgramMutation();
  const [publishProgram, { isLoading: publishing }] = usePublishProgramMutation();
  const [searchUsers, searchState] = useLazySearchProgramAccessUsersQuery();

  useEffect(() => {
    const value = allowedQuery.trim();
    if (value.length < 2) return;
    const timer = window.setTimeout(() => {
      searchUsers(value);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allowedQuery, searchUsers]);

  const updateDay = (index: number, patch: Partial<ProgramBuilderDay>) => {
    setProgram((prev) => ({
      ...prev,
      days: (prev.days ?? []).map((day, dayIndex) => (dayIndex === index ? { ...day, ...patch } : day)),
    }));
  };

  const updateStage = (index: number, patch: Partial<ProgramBuilderStage>) => {
    setProgram((prev) => ({
      ...prev,
      stages: (prev.stages ?? []).map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
    }));
  };

  const updateAction = (dayIndex: number, actionIndex: number, patch: Partial<ProgramBuilderAction>) => {
    setProgram((prev) => ({
      ...prev,
      days: (prev.days ?? []).map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              actions: (day.actions ?? []).map((action, currentActionIndex) => (currentActionIndex === actionIndex ? { ...action, ...patch } : action)),
            }
          : day,
      ),
    }));
  };

  const addAction = (dayIndex: number, type: ProgramBuilderAction['actionType']) => {
    setProgram((prev) => ({
      ...prev,
      days: (prev.days ?? []).map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              actions: [...(day.actions ?? []), buildActionPreset(type, day.actions?.length ?? 0)],
            }
          : day,
      ),
    }));
  };

  const removeAction = (dayIndex: number, actionIndex: number) => {
    setProgram((prev) => ({
      ...prev,
      days: (prev.days ?? []).map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              actions: (day.actions ?? []).filter((_, currentActionIndex) => currentActionIndex !== actionIndex),
            }
          : day,
      ),
    }));
  };

  const activeStep = steps[stepIndex];

  const submit = async () => {
    const created = await createProgram(program).unwrap().catch(() => null);
    if (!created?.program) return;
    if (publishAfterSave) {
      await publishProgram(created.program.id).unwrap().catch(() => null);
    }
    router.push(buildHealthProgramsHref({ screen: 'detail', programId: created.program.id }));
  };

  return (
    <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
      <ProgramsContextBar active="builder" backHref={buildHealthProgramsHref()} backLabel="Назад" hideNav={embedded} />
      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Icon name="sparkles" size={14} />
              <span>Конструктор программы</span>
            </div>
            <h1 className={styles.heroTitle}>Соберите сценарий программы</h1>
            <p className={styles.heroSubtitle}>Только нужные поля и пошаговая настройка без лишних блоков.</p>
          </div>


        </div>
      </section>

      <div className={styles.wizard}>
        <div className={styles.stepper}>
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              className={[styles.stepItem, index === stepIndex ? styles.stepItemActive : ''].filter(Boolean).join(' ')}
              onClick={() => setStepIndex(index)}
            >
              <span className={styles.iconBadge}>
                <Icon name={stepIcons[index]} size={15} />
              </span>
              <span className={styles.stepCopy}>
                <span className={styles.stepLabel}>Шаг {index + 1}</span>
                <span className={styles.stepTitle}>{step}</span>
              </span>
            </button>
          ))}
        </div>

        <Card className={styles.formCard}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{activeStep}</h2>
              <div className={styles.sectionHint}>
                {activeStep === 'Основное' ? 'Название и суть программы.' : null}
                {activeStep === 'Доступ' ? 'Кто увидит программу.' : null}
                {activeStep === 'Структура' ? 'Длительность и этапы.' : null}
                {activeStep === 'Дни и шаги' ? 'Настройка сценария по дням.' : null}
                {activeStep === 'Правила' ? 'Основные ограничения и recovery.' : null}
                {activeStep === 'Превью' ? 'Проверка перед сохранением.' : null}
              </div>
            </div>
          </div>

          {activeStep === 'Основное' ? (
            <div className={styles.formGrid}>
              <label className={[styles.field, styles.fieldWide].join(' ')}>
                <span>Название</span>
                <input value={program.title} onChange={(event) => setProgram((prev) => ({ ...prev, title: event.target.value }))} placeholder="30 дней спокойного сна" />
              </label>
              <label className={styles.field}>
                <span>Тема</span>
                <input value={program.theme ?? ''} onChange={(event) => setProgram((prev) => ({ ...prev, theme: event.target.value }))} placeholder="Сон, английский, накопления" />
              </label>
              <label className={[styles.field, styles.fieldWide].join(' ')}>
                <span>Описание</span>
                <textarea rows={4} value={program.description ?? ''} onChange={(event) => setProgram((prev) => ({ ...prev, description: event.target.value }))} placeholder="Что получит пользователь за время программы" />
              </label>
              <label className={[styles.field, styles.fieldWide].join(' ')}>
                <span>Обложка URL</span>
                <input value={program.coverUrl ?? ''} onChange={(event) => setProgram((prev) => ({ ...prev, coverUrl: event.target.value }))} placeholder="Необязательно" />
              </label>
            </div>
          ) : null}

          {activeStep === 'Доступ' ? (
            <div className={styles.stack}>
              <div className={styles.inlineActions}>
                {(['PRIVATE', 'RESTRICTED', 'PUBLIC'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={[styles.tab, program.accessMode === option ? styles.tabActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setProgram((prev) => ({ ...prev, accessMode: option }))}
                  >
                    {accessModeLabel(option)}
                  </button>
                ))}
              </div>

              <div className={styles.inlineActions}>
                <Button
                  size="sm"
                  variant={program.collaborativeEnabled && program.accessMode !== 'PRIVATE' ? 'primary' : 'default'}
                  disabled={program.accessMode === 'PRIVATE'}
                  onClick={() => setProgram((prev) => ({ ...prev, collaborativeEnabled: !prev.collaborativeEnabled }))}
                >
                  <Icon name="users" size={14} />
                  {program.collaborativeEnabled && program.accessMode !== 'PRIVATE' ? 'Совместное прохождение включено' : 'Только личное прохождение'}
                </Button>
              </div>

              {program.accessMode === 'RESTRICTED' ? (
                <div className={styles.stack}>
                  <label className={styles.field}>
                    <span>Поиск по логину</span>
                    <input value={allowedQuery} onChange={(event) => setAllowedQuery(event.target.value)} placeholder="Начните вводить username" />
                  </label>

                  {searchState.data?.items?.length ? (
                    <div className={styles.inlineActions}>
                      {searchState.data.items.map((item) => (
                        <Button
                          key={item.id}
                          size="sm"
                          onClick={() => {
                            setProgram((prev) => ({
                              ...prev,
                              allowedUsernames: Array.from(new Set([...(prev.allowedUsernames ?? []), item.username])),
                            }));
                            setAllowedQuery('');
                          }}
                        >
                          Добавить @{item.username}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.metaRow}>
                    {(program.allowedUsernames ?? []).map((username) => (
                      <span key={username} className={styles.pill}>
                        @{username}
                        <button
                          type="button"
                          className={styles.plainButton}
                          onClick={() => setProgram((prev) => ({ ...prev, allowedUsernames: (prev.allowedUsernames ?? []).filter((item) => item !== username) }))}
                        >
                          убрать
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStep === 'Структура' ? (
            <div className={styles.stack}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Длительность в днях</span>
                  <input
                    type="number"
                    value={program.durationDays ?? 30}
                    onChange={(event) => setProgram((prev) => ({ ...prev, durationDays: Number(event.target.value) || null }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Тип структуры</span>
                  <select value={program.structureType} onChange={(event) => setProgram((prev) => ({ ...prev, structureType: event.target.value as ProgramBuilderInput['structureType'] }))}>
                    <option value="FIXED_DURATION">Фиксированная</option>
                    <option value="ROLLING">Гибкая</option>
                    <option value="OPEN_ENDED">Без срока</option>
                  </select>
                </label>
              </div>
              <div className={styles.sectionHint}>Этапы помогают менять нагрузку и смысл программы по мере продвижения.</div>
            </div>
          ) : null}

          {activeStep === 'Структура' ? (
            <div className={styles.list}>
              {(program.stages ?? []).map((stage, index) => (
                <Card key={`${stage.title}-${index}`} className={styles.detailsCard}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Название этапа</span>
                      <input value={stage.title} onChange={(event) => updateStage(index, { title: event.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span>Майлстоун</span>
                      <input value={stage.milestoneText ?? ''} onChange={(event) => updateStage(index, { milestoneText: event.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span>Стартовый день</span>
                      <input type="number" value={stage.startDay ?? 1} onChange={(event) => updateStage(index, { startDay: Number(event.target.value) || null })} />
                    </label>
                    <label className={styles.field}>
                      <span>Последний день</span>
                      <input type="number" value={stage.endDay ?? 7} onChange={(event) => updateStage(index, { endDay: Number(event.target.value) || null })} />
                    </label>
                    <label className={[styles.field, styles.fieldWide].join(' ')}>
                      <span>Описание</span>
                      <textarea rows={3} value={stage.description ?? ''} onChange={(event) => updateStage(index, { description: event.target.value })} />
                    </label>
                  </div>
                  {(program.stages?.length ?? 0) > 1 ? (
                    <div className={styles.inlineActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setProgram((prev) => ({
                            ...prev,
                            stages: (prev.stages ?? []).filter((_, stageIndex) => stageIndex !== index),
                          }))
                        }
                      >
                        <Icon name="trash" size={14} />
                        Удалить этап
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ))}
              <Button size="sm" onClick={() => setProgram((prev) => ({ ...prev, stages: [...(prev.stages ?? []), { ...defaultStage, title: `Этап ${(prev.stages?.length ?? 1) + 1}` }] }))}>
                <Icon name="plus" size={14} />
                Добавить этап
              </Button>
            </div>
          ) : null}

          {activeStep === 'Дни и шаги' ? (
            <div className={styles.builderDayList}>
              {(program.days ?? []).map((day, dayIndex) => (
                <details key={`day-${dayIndex}`} className={styles.builderDaySummary} open={dayIndex === 0}>
                  <summary className={styles.builderDaySummaryRow}>
                    <div className={styles.builderDayHeadline}>
                      <span className={styles.builderDayNumber}>{day.dayNumber ?? dayIndex + 1}</span>
                      <div className={styles.builderDayCopy}>
                        <strong>{day.title?.trim() || `День ${day.dayNumber ?? dayIndex + 1}`}</strong>
                        <span className={styles.clamp2}>
                          {day.dayText?.trim() || 'Добавьте короткий смысл дня, чтобы пользователь сразу понял настроение и задачу.'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.pill}>{`${(day.actions ?? []).length} шаг.`}</span>
                      {day.tipOfDay ? <span className={styles.pill}>Есть подсказка</span> : null}
                      {day.motivationOfDay ? <span className={[styles.pill, styles.pillAccent].join(' ')}>Есть мотивация</span> : null}
                      <span className={styles.pill}>
                        <Icon name="chevronDown" size={14} />
                        Настроить
                      </span>
                    </div>
                  </summary>

                  <div className={styles.builderDayBody}>
                    <div className={styles.builderDaySection}>
                      <div className={styles.builderSectionLabel}>
                        <Icon name="sparkles" size={14} />
                        Смысл дня
                      </div>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Название дня</span>
                          <input value={day.title ?? ''} onChange={(event) => updateDay(dayIndex, { title: event.target.value })} />
                        </label>
                        <label className={styles.field}>
                          <span>Номер дня</span>
                          <input type="number" value={day.dayNumber ?? dayIndex + 1} onChange={(event) => updateDay(dayIndex, { dayNumber: Number(event.target.value) || null })} />
                        </label>
                        <label className={[styles.field, styles.fieldWide].join(' ')}>
                          <span>Текст дня</span>
                          <textarea rows={4} value={day.dayText ?? ''} onChange={(event) => updateDay(dayIndex, { dayText: event.target.value })} />
                        </label>
                        <label className={styles.field}>
                          <span>Подсказка</span>
                          <input value={day.tipOfDay ?? ''} onChange={(event) => updateDay(dayIndex, { tipOfDay: event.target.value })} />
                        </label>
                        <label className={styles.field}>
                          <span>Мотивация</span>
                          <input value={day.motivationOfDay ?? ''} onChange={(event) => updateDay(dayIndex, { motivationOfDay: event.target.value })} />
                        </label>
                        <label className={[styles.field, styles.fieldWide].join(' ')}>
                          <span>Рефлексия</span>
                          <textarea rows={2} value={day.reflectionPrompt ?? ''} onChange={(event) => updateDay(dayIndex, { reflectionPrompt: event.target.value })} />
                        </label>
                      </div>
                    </div>

                    <div className={styles.builderDaySection}>
                      <div className={styles.builderSectionLabel}>
                        <Icon name="plus" size={14} />
                        Добавить шаг
                      </div>
                      <div className={styles.presetChips}>
                        {actionPresets.map((preset) => (
                          <button key={`${dayIndex}-${preset.type}`} type="button" className={styles.presetChip} onClick={() => addAction(dayIndex, preset.type)}>
                            <Icon name={preset.icon} size={14} />
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.builderDaySection}>
                      <div className={styles.builderSectionLabel}>
                        <Icon name="checkDouble" size={14} />
                        Шаги дня
                      </div>
                      <div className={styles.builderActionList}>
                        {(day.actions ?? []).map((action, actionIndex) => (
                          <details key={`${action.title}-${actionIndex}`} className={styles.builderActionItem}>
                            <summary className={styles.builderActionSummary}>
                              <div className={styles.builderActionSummaryMain}>
                                <span className={styles.iconBadge}>
                                  <Icon name={actionPresets.find((preset) => preset.type === action.actionType)?.icon ?? 'menu'} size={14} />
                                </span>
                                <div className={styles.builderActionSummaryCopy}>
                                  <strong>{action.title || `Шаг ${actionIndex + 1}`}</strong>
                                  <span>
                                    {actionPresets.find((preset) => preset.type === action.actionType)?.label ?? 'Шаг'}
                                    {action.required ? ' • обязательный' : ' • можно пропустить'}
                                    {action.integrationType && action.integrationType !== 'NONE' ? ` • ${integrationTypeLabel(action.integrationType)}` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className={styles.metaRow}>
                                {action.estimatedMinutes ? <span className={styles.pill}>{`${action.estimatedMinutes} мин`}</span> : null}
                                <span className={styles.pill}>
                                  <Icon name="chevronDown" size={14} />
                                  Детали
                                </span>
                              </div>
                            </summary>

                            <div className={styles.builderActionBody}>
                              <div className={styles.formGrid}>
                                <label className={[styles.field, styles.fieldWide].join(' ')}>
                                  <span>Название шага</span>
                                  <input value={action.title} onChange={(event) => updateAction(dayIndex, actionIndex, { title: event.target.value })} />
                                </label>
                                <label className={styles.field}>
                                  <span>Тип шага</span>
                                  <select
                                    value={action.actionType}
                                    onChange={(event) => {
                                      const nextType = event.target.value as ProgramBuilderAction['actionType'];
                                      const preset = buildActionPreset(nextType, actionIndex);
                                      updateAction(dayIndex, actionIndex, {
                                        ...preset,
                                        title: action.title?.trim() ? action.title : preset.title,
                                        description: action.description?.trim() ? action.description : preset.description,
                                      });
                                    }}
                                  >
                                    {actionPresets.map((preset) => (
                                      <option key={preset.type} value={preset.type}>
                                        {preset.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Интеграция</span>
                                  <select value={action.integrationType ?? 'NONE'} onChange={(event) => updateAction(dayIndex, actionIndex, { integrationType: event.target.value as ProgramBuilderAction['integrationType'] })}>
                                    <option value="NONE">Без интеграции</option>
                                    <option value="TASK_TRACKER">Task Tracker</option>
                                    <option value="HEALTH">Health</option>
                                    <option value="NUTRITION">Nutrition</option>
                                    <option value="FINANCE">Finance</option>
                                    <option value="JOURNAL">Журнал</option>
                                    <option value="REMINDER">Напоминание</option>
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Минут</span>
                                  <input type="number" value={action.estimatedMinutes ?? 20} onChange={(event) => updateAction(dayIndex, actionIndex, { estimatedMinutes: Number(event.target.value) || null })} />
                                </label>
                                {action.actionType === 'TASK' ? (
                                  <>
                                    <label className={styles.field}>
                                      <span>Старт</span>
                                      <input
                                        type="time"
                                        value={typeof action.payloadJson?.scheduledTime === 'string' ? action.payloadJson.scheduledTime : ''}
                                        onChange={(event) =>
                                          updateAction(dayIndex, actionIndex, {
                                            payloadJson: {
                                              ...(action.payloadJson ?? {}),
                                              scheduledTime: event.target.value || null,
                                            },
                                          })
                                        }
                                      />
                                    </label>
                                    <label className={styles.field}>
                                      <span>Финиш</span>
                                      <input
                                        type="time"
                                        value={typeof action.payloadJson?.scheduledEndTime === 'string' ? action.payloadJson.scheduledEndTime : ''}
                                        onChange={(event) =>
                                          updateAction(dayIndex, actionIndex, {
                                            payloadJson: {
                                              ...(action.payloadJson ?? {}),
                                              scheduledEndTime: event.target.value || null,
                                            },
                                          })
                                        }
                                      />
                                    </label>
                                  </>
                                ) : null}
                                <label className={[styles.field, styles.fieldWide].join(' ')}>
                                  <span>Текст шага</span>
                                  <textarea rows={3} value={action.description ?? ''} onChange={(event) => updateAction(dayIndex, actionIndex, { description: event.target.value })} />
                                </label>
                              </div>

                              <div className={styles.inlineActions}>
                                <Button size="sm" variant={action.required ? 'primary' : 'default'} onClick={() => updateAction(dayIndex, actionIndex, { required: !action.required })}>
                                  <Icon name={action.required ? 'check' : 'clock'} size={14} />
                                  {action.required ? 'Обязательный' : 'Необязательный'}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => removeAction(dayIndex, actionIndex)}>
                                  <Icon name="trash" size={14} />
                                  Удалить
                                </Button>
                              </div>

                              <details className={styles.detailsCard}>
                                <summary>Дополнительно</summary>
                                <div className={styles.formGrid}>
                                  <label className={styles.field}>
                                    <span>Как считается выполненным</span>
                                    <input value={action.completionPolicy ?? ''} onChange={(event) => updateAction(dayIndex, actionIndex, { completionPolicy: event.target.value })} />
                                  </label>
                                  <label className={styles.field}>
                                    <span>Как переносится</span>
                                    <input value={action.reschedulePolicy ?? ''} onChange={(event) => updateAction(dayIndex, actionIndex, { reschedulePolicy: event.target.value })} />
                                  </label>
                                </div>
                              </details>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              ))}

              <Button
                onClick={() =>
                  setProgram((prev) => ({
                    ...prev,
                    days: [
                      ...(prev.days ?? []),
                      {
                        ...defaultDay,
                        dayNumber: (prev.days?.length ?? 0) + 1,
                        title: `День ${(prev.days?.length ?? 0) + 1}`,
                      },
                    ],
                  }))
                }
              >
                <Icon name="plus" size={14} />
                Добавить день
              </Button>
            </div>
          ) : null}

          {activeStep === 'Правила' ? (
            <div className={styles.stack}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Макс. переносов на шаг</span>
                  <input
                    type="number"
                    value={program.rules?.maxReschedulesPerAction ?? 3}
                    onChange={(event) =>
                      setProgram((prev) => ({
                        ...prev,
                        rules: {
                          ...(prev.rules ?? {}),
                          maxReschedulesPerAction: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className={styles.inlineActions}>
                {(['allowSkip', 'allowPause', 'allowResume', 'allowCancel', 'allowRecovery'] as const).map((key) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={program.rules?.[key] ? 'primary' : 'default'}
                    onClick={() =>
                      setProgram((prev) => ({
                        ...prev,
                        rules: {
                          ...(prev.rules ?? {}),
                          [key]: !prev.rules?.[key],
                        },
                      }))
                    }
                  >
                    <Icon name={program.rules?.[key] ? 'check' : 'close'} size={14} />
                    {key === 'allowSkip' ? 'Можно пропускать' : key === 'allowPause' ? 'Можно ставить на паузу' : key === 'allowResume' ? 'Можно продолжать' : key === 'allowCancel' ? 'Можно отказаться' : 'Есть recovery'}
                  </Button>
                ))}
              </div>

              <details className={styles.detailsCard}>
                <summary>Как это работает</summary>
                <div className={styles.helperList}>
                  <div className={styles.helperItem}>
                    <span className={styles.iconBadge}>
                      <Icon name="checkDouble" size={15} />
                    </span>
                    <span>
                      <strong>Задачи</strong>
                      <span>Шаги типа “Задача” синхронизируются с Task Tracker в обе стороны.</span>
                    </span>
                  </div>
                  <div className={styles.helperItem}>
                    <span className={styles.iconBadge}>
                      <Icon name="pulse" size={15} />
                    </span>
                    <span>
                      <strong>Питание, здоровье и финансы</strong>
                      <span>Открывают существующие инструменты Pulse и не создают отдельный движок.</span>
                    </span>
                  </div>
                  <div className={styles.helperItem}>
                    <span className={styles.iconBadge}>
                      <Icon name="shield" size={15} />
                    </span>
                    <span>
                      <strong>Отказ от прохождения</strong>
                      <span>При прекращении участия программа уходит в архив, а связанные задачи скрываются из активного дня.</span>
                    </span>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {activeStep === 'Превью' ? (
            <div className={styles.stack}>
              <div className={styles.sharePreview}>
                <div className={styles.summaryLabel}>{program.theme || 'Программа'}</div>
                <div className={styles.sectionTitle}>{program.title || 'Без названия'}</div>
                <div className={styles.sectionHint}>{program.description || 'Добавьте короткое описание, чтобы карточка в библиотеке была понятнее.'}</div>
              </div>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Доступ</div>
                  <div className={styles.summaryValue}>{accessModeLabel(program.accessMode)}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Структура</div>
                  <div className={styles.summaryValue}>{structureTypeLabel(program.structureType)}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Этапы</div>
                  <div className={styles.summaryValue}>{program.stages?.length ?? 0}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Дни</div>
                  <div className={styles.summaryValue}>{program.days?.length ?? 0}</div>
                </div>
              </div>
              <details className={styles.detailsCard}>
                <summary>Дни</summary>
                <div className={styles.detailsList}>
                  {(program.days ?? []).map((day, index) => (
                    <div key={`preview-day-${index}`} className={styles.historyRow}>
                      <div>
                        <div className={styles.actionTitle}>{day.title || `День ${day.dayNumber ?? index + 1}`}</div>
                        <div className={styles.sectionHint}>{day.dayText || 'Без текста дня'}</div>
                      </div>
                      <div className={styles.pill}>{day.actions?.length ?? 0} шаг.</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : null}

          <div className={styles.inlineActions}>
            <Button size="sm" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0}>
              <Icon name="arrowLeft" size={14} />
              Назад
            </Button>
            <Button size="sm" onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))} disabled={stepIndex === steps.length - 1}>
              Дальше
              <Icon name="chevronRight" size={14} />
            </Button>
            <Button size="sm" variant={publishAfterSave ? 'primary' : 'default'} onClick={() => setPublishAfterSave((value) => !value)}>
              <Icon name={publishAfterSave ? 'check' : 'pencil'} size={14} />
              {publishAfterSave ? 'Опубликуется после сохранения' : 'Сохранить как черновик'}
            </Button>
            <Button size="sm" variant="primary" loading={creating || publishing} onClick={submit} disabled={!program.title.trim()}>
              <Icon name="sparkles" size={14} />
              {publishAfterSave ? 'Сохранить и опубликовать' : 'Сохранить программу'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
