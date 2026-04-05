'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useArchiveProgramRunMutation,
  useCancelProgramRunMutation,
  useCompleteProgramActionMutation,
  useGetProgramQuery,
  useGetProgramRunQuery,
  usePauseProgramRunMutation,
  useRecoverProgramRunMutation,
  useRescheduleProgramActionMutation,
  useResumeProgramRunMutation,
  useSkipProgramActionMutation,
} from '@/shared/api/programsApi';
import type { ProgramRecoveryResolution, ProgramRunAction } from '@/shared/types/programs';
import {
  actionStatusLabel,
  actionTypeLabel,
  dayStatusLabel,
  formatProgramDate,
  memberRoleLabel,
  memberStatusLabel,
  ProgramsContextBar,
  buildHealthProgramsHref,
  recoveryLabel,
  runStatusLabel,
  sessionStatusLabel,
  structureTypeLabel,
} from './programUi';
import styles from './ProgramsShell.module.css';
import { ProgramShareSheet } from './ProgramShareSheet';

function dateInputValue(date?: string | null) {
  if (!date) return '';
  return date.slice(0, 10);
}

function actionIconName(action: ProgramRunAction) {
  if (action.status === 'COMPLETED') return 'check';
  if (action.status === 'MISSED') return 'close';
  if (action.status === 'RESCHEDULED') return 'repeat';
  if (action.actionType === 'TASK') return 'checkDouble';
  if (action.actionType === 'HEALTH_CHECKIN') return 'heart';
  if (action.actionType === 'NUTRITION_TARGET') return 'pulse';
  if (action.actionType === 'FINANCE_TARGET') return 'sparkles';
  if (action.actionType === 'REFLECTION' || action.actionType === 'JOURNAL') return 'comment';
  if (action.actionType === 'REMINDER') return 'clock';
  return 'menu';
}

function actionToneClass(status: string) {
  if (status === 'COMPLETED') return styles.todayActionRowDone;
  if (status === 'MISSED') return styles.todayActionRowDanger;
  if (status === 'RESCHEDULED') return styles.todayActionRowMuted;
  return '';
}

export function ProgramRunPage({ runId, embedded = false }: { runId: string; embedded?: boolean }) {
  const { data, isLoading } = useGetProgramRunQuery(runId);
  const [shareOpen, setShareOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rescheduleActionId, setRescheduleActionId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(dateInputValue(new Date().toISOString()));
  const [completeAction, { isLoading: completing }] = useCompleteProgramActionMutation();
  const [skipAction, { isLoading: skipping }] = useSkipProgramActionMutation();
  const [rescheduleAction, { isLoading: rescheduling }] = useRescheduleProgramActionMutation();
  const [recoverRun, { isLoading: recovering }] = useRecoverProgramRunMutation();
  const [pauseRun, { isLoading: pausing }] = usePauseProgramRunMutation();
  const [resumeRun, { isLoading: resuming }] = useResumeProgramRunMutation();
  const [cancelRun, { isLoading: cancelling }] = useCancelProgramRunMutation();
  const [archiveRun, { isLoading: archiving }] = useArchiveProgramRunMutation();

  const payload = data;
  const run = payload?.run;
  const programsRootHref = buildHealthProgramsHref();
  const { data: programData } = useGetProgramQuery(run?.program.id ?? '', { skip: !run?.program.id });
  const today = payload?.today;
  const currentActions = useMemo(() => today?.actions ?? [], [today?.actions]);
  const completedActions = useMemo(
    () =>
      (payload?.history ?? [])
        .flatMap((day) =>
          day.actions
            .filter((action) => action.status === 'COMPLETED')
            .map((action) => ({
              id: action.id,
              title: action.title,
              dayLabel: `День ${day.programDayNumber ?? day.sequenceNumber}`,
              date: day.scheduledDate,
              actionType: action.actionType,
            })),
        )
        .slice(-8)
        .reverse(),
    [payload?.history],
  );

  const todayCompletedCount = currentActions.filter((action) => action.status === 'COMPLETED').length;
  const todayRequiredPending = currentActions.filter((action) => action.required && !['COMPLETED', 'SKIPPED'].includes(action.status)).length;

  const runAction = async (job: () => Promise<unknown>) => {
    try {
      await job();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const handleRecovery = async (resolution: ProgramRecoveryResolution) => {
    await runAction(() => recoverRun({ runId, resolution }).unwrap());
  };

  const handleStopProgram = async () => {
    await runAction(async () => {
      await cancelRun({ runId, reason: 'USER_STOPPED' }).unwrap();
      await archiveRun(runId).unwrap();
    });
  };

  if (isLoading || !run) {
    return (
      <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
        <ProgramsContextBar active="run" backHref={programsRootHref} backLabel={embedded ? 'Назад' : 'К программам'} hideNav={embedded} />
        <Card className={styles.sectionCard}>
          <div className={styles.emptyState}>Загружаю прохождение...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
      <ProgramsContextBar active="run" backHref={programsRootHref} backLabel="Назад" hideNav={embedded} />

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Icon name="checkDouble" size={14} />
              <span>Моё прохождение</span>
            </div>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>{runStatusLabel(run.status)}</span>
              <span className={styles.pill}>{`День ${today?.programDayNumber ?? run.currentDayNumber}`}</span>
              {run.currentStage ? <span className={styles.pill}>{run.currentStage.title}</span> : null}
              <span className={styles.pill}>{structureTypeLabel(run.program.structureType)}</span>
            </div>
            <h1 className={styles.heroTitle}>{run.program.title}</h1>
            <p className={styles.heroSubtitle}>{run.program.description || 'Текущий этап, главное действие и недавний прогресс без лишних деталей.'}</p>
          </div>

          <div className={styles.heroActions}>
            {run.status === 'ACTIVE' ? (
              <Button size="sm" loading={pausing} onClick={() => runAction(() => pauseRun(runId).unwrap())}>
                <Icon name="clock" size={14} />
                Пауза
              </Button>
            ) : null}
            {run.status === 'PAUSED' ? (
              <Button size="sm" variant="primary" loading={resuming} onClick={() => runAction(() => resumeRun(runId).unwrap())}>
                <Icon name="play" size={14} />
                Продолжить
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Icon name="forward" size={14} />
              Поделиться
            </Button>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Выполнение</div>
            <div className={styles.summaryValue}>{payload.summary.completion}%</div>
            <div className={styles.progressLine}>
              <span className={styles.progressFill} style={{ width: `${payload.summary.completion}%` }} />
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Следование</div>
            <div className={styles.summaryValue}>{payload.summary.adherence}%</div>
            <div className={styles.progressLine}>
              <span className={styles.progressFill} style={{ width: `${payload.summary.adherence}%` }} />
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Ритм</div>
            <div className={styles.summaryValue}>{payload.summary.consistency}%</div>
            <div className={styles.progressLine}>
              <span className={styles.progressFill} style={{ width: `${payload.summary.consistency}%` }} />
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Серия</div>
            <div className={styles.summaryValue}>
              <span className={styles.summaryValueInline}>
                <Icon name="flame" size={18} />
                {payload.summary.streak}
              </span>
            </div>
            <div className={styles.sectionHint}>Без разрывов подряд</div>
          </div>
        </div>
      </section>

      {errorMessage ? <div className={styles.dangerState}>{errorMessage}</div> : null}

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Сегодня</h2>
            <div className={styles.sectionHint}>Что нужно сделать сейчас и как идёт прогресс.</div>
          </div>
          {today ? (
            <div className={styles.metaRow}>
              <span className={styles.pill}>{dayStatusLabel(today.status)}</span>
              <span className={styles.pill}>{formatProgramDate(today.scheduledDate)}</span>
              <span className={[styles.pill, styles.pillSuccess].join(' ')}>{`${todayCompletedCount}/${currentActions.length || 0} готово`}</span>
              {todayRequiredPending > 0 ? <span className={styles.pill}>{`Осталось ${todayRequiredPending}`}</span> : null}
            </div>
          ) : null}
        </div>

        <div className={styles.storyPanel}>
          <div className={styles.storyMain}>
            <div className={styles.storyEyebrow}>
              <Icon name="sparkles" size={14} />
              {run.currentStage?.title ? `${run.currentStage.title} • ` : ''}
              {`День ${today?.programDayNumber ?? run.currentDayNumber}`}
            </div>
            {today?.dayTemplate?.dayText ? <div className={styles.storyText}>{today.dayTemplate.dayText}</div> : <div className={styles.sectionHint}>На этот день не добавлен отдельный текст.</div>}
          </div>
          <div className={styles.storyAside}>
            {today?.dayTemplate?.tipOfDay ? (
              <div className={styles.storyHintRow}>
                <span className={styles.iconBadge}>
                  <Icon name="sparkles" size={14} />
                </span>
                <span>{today.dayTemplate.tipOfDay}</span>
              </div>
            ) : null}
            {today?.dayTemplate?.motivationOfDay ? (
              <div className={styles.storyHintRow}>
                <span className={[styles.iconBadge, styles.iconBadgeSuccess].join(' ')}>
                  <Icon name="flame" size={14} />
                </span>
                <span>{today.dayTemplate.motivationOfDay}</span>
              </div>
            ) : null}
            {today?.dayTemplate?.reflectionPrompt ? (
              <div className={styles.storyHintRow}>
                <span className={styles.iconBadge}>
                  <Icon name="comment" size={14} />
                </span>
                <span>{today.dayTemplate.reflectionPrompt}</span>
              </div>
            ) : null}
          </div>
        </div>

        {!currentActions.length ? <div className={styles.emptyState}>На сегодня действий нет.</div> : null}
        <div className={styles.todayActionList}>
          {currentActions.map((action) => {
            const isCompleted = action.status === 'COMPLETED';
            const isClosed = ['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(action.status);
            return (
              <div key={action.id} className={[styles.todayActionRow, actionToneClass(action.status)].filter(Boolean).join(' ')}>
                <div className={styles.todayActionLead}>
                  <span
                    className={[
                      styles.iconBadge,
                      action.status === 'COMPLETED' ? styles.iconBadgeSuccess : action.status === 'MISSED' ? styles.iconBadgeDanger : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <Icon name={actionIconName(action)} size={14} />
                  </span>

                  <div className={styles.todayActionCopy}>
                    <div className={styles.actionTitle}>{action.title}</div>
                    <div className={styles.metaRow}>
                      <span className={isCompleted ? [styles.pill, styles.pillSuccess].join(' ') : styles.pill}>{actionStatusLabel(action.status)}</span>
                      <span className={styles.pill}>{actionTypeLabel(action.actionType)}</span>
                      {action.required ? <span className={styles.pill}>Важно</span> : <span className={styles.pill}>Можно пропустить</span>}
                      {action.estimatedMinutes ? <span className={styles.pill}>{`${action.estimatedMinutes} мин`}</span> : null}
                      {action.integrationType === 'TASK_TRACKER' || action.actionType === 'TASK' ? <span className={styles.pill}>Синхронно с задачами</span> : null}
                    </div>
                    {action.description ? <div className={styles.actionSub}>{action.description}</div> : null}
                  </div>
                </div>

                <div className={styles.todayActionTail}>
                  {isCompleted ? (
                    <span className={[styles.pill, styles.pillSuccess].join(' ')}>
                      <Icon name="check" size={13} />
                      Выполнено
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={completing}
                      onClick={() => runAction(() => completeAction({ runId, actionId: action.id }).unwrap())}
                    >
                      <Icon name="check" size={14} />
                      Готово
                    </Button>
                  )}

                  <details className={styles.actionMenu}>
                    <summary className={styles.actionMenuSummary}>
                      <Icon name="chevronDown" size={14} />
                    </summary>
                    <div className={styles.actionMenuBody}>
                      {!isClosed ? (
                        <Button size="sm" loading={skipping} onClick={() => runAction(() => skipAction({ runId, actionId: action.id }).unwrap())}>
                          <Icon name="close" size={14} />
                          Пропустить
                        </Button>
                      ) : null}
                      {!isCompleted ? (
                        <Button size="sm" onClick={() => setRescheduleActionId(action.id)}>
                          <Icon name="repeat" size={14} />
                          Отложить
                        </Button>
                      ) : null}
                      {action.openPath ? (
                        <Link href={action.openPath} className={styles.linkButton}>
                          <Button size="sm">
                            <Icon name="chevronRight" size={14} />
                            Открыть
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>

        {rescheduleActionId ? (
          <div className={styles.inlineEditor}>
            <div className={styles.sectionHint}>Новая дата для переноса шага</div>
            <div className={styles.inlineEditorRow}>
              <label className={styles.field}>
                <span>Дата</span>
                <input type="date" value={rescheduleTarget} onChange={(event) => setRescheduleTarget(event.target.value)} />
              </label>
              <div className={styles.inlineActions}>
                <Button
                  size="sm"
                  variant="primary"
                  loading={rescheduling}
                  onClick={() =>
                    runAction(async () => {
                      await rescheduleAction({ runId, actionId: rescheduleActionId, targetDate: rescheduleTarget }).unwrap();
                      setRescheduleActionId(null);
                    })
                  }
                >
                  Применить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRescheduleActionId(null)}>
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.sectionDivider} />

        {payload.session ? (
          <div className={styles.stack}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Участники</h2>
                <div className={styles.sectionHint}>
                  {payload.session.host?.username ? `Владелец @${payload.session.host.username}` : 'Совместное прохождение'}
                  {` • ${sessionStatusLabel(payload.session.status)}`}
                </div>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.pill}>{payload.session.title}</span>
                <Link href={buildHealthProgramsHref({ screen: 'session', sessionId: payload.session.id })} className={styles.linkButton}>
                  <Button size="sm">
                    <Icon name="users" size={14} />
                    Открыть сессию
                  </Button>
                </Link>
              </div>
            </div>

            <div className={styles.participantsBlock}>
              {payload.session.members.map((member) => (
                <div key={member.id} className={styles.participantRow}>
                  <div className={styles.participantHeader}>
                    <div className={styles.participantIdentity}>
                      <span className={styles.avatarBadge}>{member.user?.username?.slice(0, 1).toUpperCase() ?? 'У'}</span>
                      <div className={styles.participantCopy}>
                        <div className={styles.actionTitle}>{member.user?.username ? `@${member.user.username}` : 'Участник'}</div>
                        <div className={styles.sectionHint}>
                          {memberRoleLabel(member.role)} • {memberStatusLabel(member.status)}
                          {member.run?.today?.dayNumber ? ` • День ${member.run.today.dayNumber}` : ''}
                          {member.run?.today?.stageTitle ? ` • ${member.run.today.stageTitle}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className={styles.participantMetrics}>
                      {member.run ? (
                        <>
                          <span className={[styles.pill, styles.pillAccent].join(' ')}>
                            <Icon name="flame" size={13} />
                            {member.run.streakCount}
                          </span>
                          <span className={styles.pill}>{`${member.run.completionPercent}%`}</span>
                        </>
                      ) : (
                        <span className={styles.pill}>Ждёт запуска</span>
                      )}
                    </div>
                  </div>

                  {member.run ? (
                    <>
                      <div className={styles.progressLine}>
                        <span className={styles.progressFill} style={{ width: `${member.run.completionPercent}%` }} />
                      </div>
                      <div className={styles.participantTodayMeta}>
                        <span className={styles.pill}>{`Сегодня ${member.run.today?.completedTodayCount ?? 0}/${member.run.today?.totalTodayCount ?? 0}`}</span>
                        {(member.run.today?.requiredPendingCount ?? 0) > 0 ? <span className={styles.pill}>{`Осталось ${member.run.today?.requiredPendingCount}`}</span> : <span className={[styles.pill, styles.pillSuccess].join(' ')}>День закрыт</span>}
                      </div>
                      <div className={styles.participantTaskList}>
                        {member.run.today?.completedToday?.length ? (
                          member.run.today.completedToday.map((item) => (
                            <span key={item.id} className={[styles.pill, styles.pillSuccess].join(' ')}>
                              <Icon name="check" size={12} />
                              {item.title}
                            </span>
                          ))
                        ) : (
                          <span className={styles.sectionHint}>Сегодня ещё без отмеченных шагов.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={styles.sectionHint}>Прохождение создастся после запуска владельцем или после принятия приглашения.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.stack}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Уже выполнено</h2>
                <div className={styles.sectionHint}>Ваши последние шаги по этой программе.</div>
              </div>
              <span className={styles.pill}>{completedActions.length}</span>
            </div>
            {!completedActions.length ? <div className={styles.emptyState}>Пока нет завершённых шагов. Они появятся здесь по мере прохождения.</div> : null}
            <div className={styles.compactList}>
              {completedActions.map((action) => (
                <div key={action.id} className={styles.compactListRow}>
                  <div className={styles.actionCompactLead}>
                    <span className={[styles.iconBadge, styles.iconBadgeSuccess].join(' ')}>
                      <Icon name="check" size={14} />
                    </span>
                    <div className={styles.actionCompactCopy}>
                      <strong>{action.title}</strong>
                      <span>{`${action.dayLabel} • ${formatProgramDate(action.date)}`}</span>
                    </div>
                  </div>
                  <span className={styles.pill}>{actionTypeLabel(action.actionType)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Путь программы</h2>
            <div className={styles.sectionHint}>Этап, история и общая логика собраны в одном месте без лишних боковых блоков.</div>
          </div>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.infoPanel}>
            <div className={styles.sectionHint}>О программе</div>
            <div className={styles.programText}>{run.program.description || 'Описание программы не добавлено.'}</div>
            <div className={styles.metaRow}>
              {run.program.owner?.username ? <span className={styles.pill}>{`Автор @${run.program.owner.username}`}</span> : null}
              <span className={styles.pill}>{`Старт ${formatProgramDate(run.startDate)}`}</span>
              {run.program.durationDays ? <span className={styles.pill}>{`${run.program.durationDays} дн.`}</span> : null}
            </div>
            {run.currentStage?.description ? (
              <div className={styles.noticeInline}>
                <Icon name="sparkles" size={15} />
                <span>{run.currentStage.description}</span>
              </div>
            ) : null}
          </div>

          <div className={styles.infoPanel}>
            <div className={styles.sectionHint}>Короткие метрики</div>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span>Пропущено дней</span>
                <strong>{payload.summary.missedDays}</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Пропущено действий</span>
                <strong>{payload.summary.skippedActions}</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Переносов</span>
                <strong>{payload.summary.rescheduledActions}</strong>
              </div>
              <div className={styles.metricRow}>
                <span>Этап закрыт</span>
                <strong>{payload.summary.stageCompletion}%</strong>
              </div>
            </div>
          </div>
        </div>

        {programData?.program.stages?.length ? (
          <>
            <div className={styles.sectionDivider} />
            <div className={styles.stack}>
              <div className={styles.sectionHead}>
                <div>
                  <h2 className={styles.sectionTitle}>Этапы</h2>
                  <div className={styles.sectionHint}>Текущий этап и следующие шаги программы.</div>
                </div>
              </div>
              <div className={styles.compactList}>
                {programData.program.stages.map((stage) => (
                  <div key={stage.id} className={styles.compactListRow}>
                    <div className={styles.actionCompactLead}>
                      <span className={[styles.iconBadge, run.currentStage?.id === stage.id ? styles.iconBadgeSuccess : ''].filter(Boolean).join(' ')}>
                        <Icon name={run.currentStage?.id === stage.id ? 'flame' : 'menu'} size={14} />
                      </span>
                      <div className={styles.actionCompactCopy}>
                        <strong>{stage.title}</strong>
                        <span>{stage.description || stage.milestoneText || 'Без дополнительного описания.'}</span>
                      </div>
                    </div>
                    <div className={styles.metaRow}>
                      {run.currentStage?.id === stage.id ? <span className={[styles.pill, styles.pillAccent].join(' ')}>Текущий</span> : null}
                      {stage.startDay || stage.endDay ? <span className={styles.pill}>{`${stage.startDay ?? 1}-${stage.endDay ?? '∞'} день`}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <div className={styles.sectionDivider} />

        <div className={styles.stack}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>История</h2>
              <div className={styles.sectionHint}>Последние дни и их статусы.</div>
            </div>
          </div>
          <div className={styles.detailsList}>
            {payload.history.slice(-10).reverse().map((day) => (
              <details key={day.id} className={styles.detailsCard}>
                <summary>{`День ${day.sequenceNumber} • ${dayStatusLabel(day.status)}`}</summary>
                <div className={styles.sectionHint}>{formatProgramDate(day.scheduledDate)}</div>
                <div className={styles.compactList}>
                  {day.actions.map((action: ProgramRunAction) => (
                    <div key={action.id} className={styles.compactListRow}>
                      <div className={styles.actionCompactLead}>
                        <span className={[styles.iconBadge, action.status === 'COMPLETED' ? styles.iconBadgeSuccess : action.status === 'MISSED' ? styles.iconBadgeDanger : ''].filter(Boolean).join(' ')}>
                          <Icon name={actionIconName(action)} size={14} />
                        </span>
                        <div className={styles.actionCompactCopy}>
                          <strong>{action.title}</strong>
                          <span>{actionTypeLabel(action.actionType)}</span>
                        </div>
                      </div>
                      <div className={styles.pill}>{actionStatusLabel(action.status)}</div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.split}>
          <div className={styles.stack}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Возврат</h2>
                <div className={styles.sectionHint}>Мягкий recovery, если появились пропуски.</div>
              </div>
            </div>
            {!payload.recovery.needed ? <div className={styles.emptyState}>Сейчас восстановление не требуется.</div> : null}
            {payload.recovery.needed ? (
              <div className={styles.inlineActions}>
                {payload.recovery.options.map((option) => (
                  <Button key={option} size="sm" loading={recovering} onClick={() => handleRecovery(option)}>
                    {recoveryLabel(option)}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.stack}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>Управление</h2>
                <div className={styles.sectionHint}>В любой момент можно поставить на паузу, отказаться или убрать в архив.</div>
              </div>
            </div>
            <div className={styles.inlineActions}>
              <Button size="sm" variant="primary" loading={cancelling || archiving} onClick={handleStopProgram}>
                <Icon name="close" size={14} />
                Отказаться
              </Button>
              <Button size="sm" variant="ghost" loading={cancelling} onClick={() => runAction(() => cancelRun({ runId }).unwrap())}>
                <Icon name="trash" size={14} />
                Отменить
              </Button>
              <Button size="sm" variant="ghost" loading={archiving} onClick={() => runAction(() => archiveRun(runId).unwrap())}>
                <Icon name="menu" size={14} />
                В архив
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <ProgramShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        sourceType="PROGRAM_RUN"
        sourceId={run.id}
        defaultKind="PROGRAM_PROGRESS"
        title={run.program.title}
        description={run.program.description}
      />
    </div>
  );
}
