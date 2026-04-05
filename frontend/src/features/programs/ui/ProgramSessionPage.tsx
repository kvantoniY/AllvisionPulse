'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useAcceptProgramInviteMutation,
  useDeclineProgramInviteMutation,
  useGetProgramRunQuery,
  useGetProgramSessionQuery,
  useLeaveProgramSessionMutation,
  useStartProgramSessionMutation,
} from '@/shared/api/programsApi';
import {
  ProgramsContextBar,
  buildHealthProgramsHref,
  actionStatusLabel,
  actionTypeLabel,
  dayStatusLabel,
  formatProgramDate,
  inviteStatusLabel,
  memberRoleLabel,
  memberStatusLabel,
  runStatusLabel,
  sessionReadinessLabel,
  sessionStatusLabel,
  startModeLabel,
} from './programUi';
import styles from './ProgramsShell.module.css';
import { ProgramShareSheet } from './ProgramShareSheet';

const tabs = ['Сегодня', 'Участники', 'Прогресс', 'Приглашения'] as const;

export function ProgramSessionPage({ sessionId, embedded = false }: { sessionId: string; embedded?: boolean }) {
  const router = useRouter();
  const { data, isLoading } = useGetProgramSessionQuery(sessionId);
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Сегодня');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startSession, { isLoading: starting }] = useStartProgramSessionMutation();
  const [leaveSession, { isLoading: leaving }] = useLeaveProgramSessionMutation();
  const [acceptInvite, { isLoading: acceptingInvite }] = useAcceptProgramInviteMutation();
  const [declineInvite, { isLoading: decliningInvite }] = useDeclineProgramInviteMutation();

  const session = data?.session;
  const viewerRunId = session?.viewer.runId ?? null;
  const programsRootHref = buildHealthProgramsHref();
  const { data: viewerRunData } = useGetProgramRunQuery(viewerRunId ?? '', { skip: !viewerRunId });
  const viewerToday = viewerRunData?.today ?? null;

  if (isLoading || !session) {
    return (
      <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
        <ProgramsContextBar active="session" backHref={programsRootHref} backLabel={embedded ? 'Назад' : 'К программам'} hideNav={embedded} />
        <Card className={styles.sectionCard}>
          <div className={styles.emptyState}>Загружаю сессию...</div>
        </Card>
      </div>
    );
  }

  const handleAction = async (job: () => Promise<unknown>, onSuccess?: () => void) => {
    try {
      await job();
      setErrorMessage(null);
      onSuccess?.();
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  return (
    <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
      <ProgramsContextBar active="session" backHref={programsRootHref} backLabel="Назад" hideNav={embedded} />

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Icon name="users" size={14} />
              <span>Совместная сессия</span>
            </div>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>{sessionStatusLabel(session.status)}</span>
              <span className={styles.pill}>{startModeLabel(session.startMode)}</span>
              {viewerToday ? <span className={styles.pill}>{`День ${viewerToday.programDayNumber ?? viewerToday.sequenceNumber}`}</span> : null}
              {viewerRunData?.run.currentStage?.title ? <span className={styles.pill}>{viewerRunData.run.currentStage.title}</span> : null}
              <span className={styles.pill}>{session.viewer.isHost ? 'Вы владелец' : session.viewer.status ? memberStatusLabel(session.viewer.status) : 'Участник'}</span>
            </div>
            <h1 className={styles.heroTitle}>{session.title}</h1>
            <p className={styles.heroSubtitle}>
              {session.host?.username ? `Владелец сессии @${session.host.username}. ` : 'У сессии есть владелец. '}
              Здесь видно участников, общий статус и то, как продвигается совместное прохождение.
            </p>
          </div>

          <div className={styles.heroActions}>
            {session.viewer.canRespondToInvite && session.viewer.inviteId ? (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={acceptingInvite}
                  onClick={() => handleAction(() => acceptInvite(session.viewer.inviteId as string).unwrap())}
                >
                  <Icon name="check" size={14} />
                  Принять
                </Button>
                <Button
                  size="sm"
                  loading={decliningInvite}
                  onClick={() =>
                    handleAction(
                      () => declineInvite(session.viewer.inviteId as string).unwrap(),
                      () => router.push('/health?tab=programs'),
                    )
                  }
                >
                  <Icon name="close" size={14} />
                  Отклонить
                </Button>
              </>
            ) : null}

            {session.viewer.canStart ? (
              <Button
                size="sm"
                variant="primary"
                loading={starting}
                onClick={() => handleAction(() => startSession(sessionId).unwrap())}
              >
                <Icon name="play" size={14} />
                {session.status === 'ACTIVE' ? 'Сессия уже идёт' : 'Запустить для всех готовых'}
              </Button>
            ) : null}

            {session.viewer.isHost ? (
              <Button size="sm" onClick={() => setShareOpen(true)}>
                <Icon name="forward" size={14} />
                Поделиться
              </Button>
            ) : null}

            {session.viewer.canLeave ? (
              <Button
                size="sm"
                loading={leaving}
                onClick={() =>
                  handleAction(
                    () => leaveSession(sessionId).unwrap(),
                    () => router.push(programsRootHref),
                  )
                }
              >
                <Icon name="close" size={14} />
                Отказаться от прохождения
              </Button>
            ) : null}
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Готовы</div>
            <div className={styles.summaryValue}>{session.readiness.accepted}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Ждём</div>
            <div className={styles.summaryValue}>{session.readiness.pending}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Активные прохождения</div>
            <div className={styles.summaryValue}>{session.summary.activeRuns}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Завершили</div>
            <div className={styles.summaryValue}>{session.summary.completedRuns}</div>
          </div>
        </div>
      </section>

      {errorMessage ? <div className={styles.dangerState}>{errorMessage}</div> : null}
      {session.viewer.canRespondToInvite ? (
        <div className={styles.noticeCard}>
          <div className={styles.sectionTitle}>Приглашение в сессию</div>
          <div className={styles.sectionHint}>После принятия вы попадёте в список готовых участников. Запуск делает владелец сессии.</div>
        </div>
      ) : null}
      {session.viewer.status === 'ACCEPTED' && session.status !== 'ACTIVE' ? (
        <div className={styles.successState}>Вы готовы к старту. Сессия начнётся, когда владелец запустит её для группы.</div>
      ) : null}
      {session.viewer.isHost && !session.viewer.canLeave ? (
        <div className={styles.noticeCard}>
          <div className={styles.sectionHint}>Пока в сессии есть другие участники, владелец не может просто выйти. Сначала дождитесь решения участников или завершите совместный сценарий позже.</div>
        </div>
      ) : null}

      <Card className={styles.sectionCard}>
        <div className={styles.list}>
          <div className={styles.actionRow}>
            <div className={styles.actionMeta}>
              <div className={styles.actionTitle}>Программа</div>
              <div className={styles.actionSub}>{session.program.title}</div>
            </div>
            <Link href={buildHealthProgramsHref({ screen: 'detail', programId: session.program.id })} className={styles.linkButton}>
              <Button size="sm">Открыть программу</Button>
            </Link>
          </div>

          <div className={styles.actionRow}>
            <div className={styles.actionMeta}>
              <div className={styles.actionTitle}>Кто запускает</div>
              <div className={styles.actionSub}>
                {session.startMode === 'HOST_MANUAL' || session.startMode === 'NOW'
                  ? session.host?.username
                    ? `Владелец @${session.host.username}`
                    : 'Владелец сессии'
                  : startModeLabel(session.startMode)}
              </div>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.pill}>{session.inviteLinkToken ? 'Ссылка готова' : 'Без ссылки'}</span>
              {session.startedAt ? <span className={styles.pill}>Старт {formatProgramDate(session.startedAt, true)}</span> : null}
              {session.scheduledStartAt ? <span className={styles.pill}>План {formatProgramDate(session.scheduledStartAt, true)}</span> : null}
            </div>
          </div>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <CardHeader title="Текущий день программы" action={viewerToday ? <span className={styles.pill}>{dayStatusLabel(viewerToday.status)}</span> : null} />
        {!viewerRunId ? <div className={styles.emptyState}>Когда вы примете участие и владелец запустит сессию, здесь появятся ваш день программы, этап и сегодняшние шаги.</div> : null}
        {viewerRunId && !viewerToday ? <div className={styles.emptyState}>Прохождение уже связано с сессией, но текущий день ещё не подготовлен.</div> : null}
        {viewerToday ? (
          <div className={styles.stack}>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>{`День ${viewerToday.programDayNumber ?? viewerToday.sequenceNumber}`}</span>
              {viewerRunData?.run.currentStage?.title ? <span className={styles.pill}>{viewerRunData.run.currentStage.title}</span> : null}
              <span className={styles.pill}>{formatProgramDate(viewerToday.scheduledDate)}</span>
            </div>

            {viewerToday.dayTemplate?.dayText ? <div className={styles.programText}>{viewerToday.dayTemplate.dayText}</div> : null}

            <div className={styles.metaRow}>
              {viewerToday.dayTemplate?.tipOfDay ? <span className={styles.pill}>Совет</span> : null}
              {viewerToday.dayTemplate?.motivationOfDay ? <span className={[styles.pill, styles.pillSuccess].join(' ')}>Мотивация</span> : null}
              {viewerToday.dayTemplate?.reflectionPrompt ? <span className={styles.pill}>Рефлексия</span> : null}
            </div>

            <div className={styles.actionCompactList}>
              {viewerToday.actions.map((action) => (
                <div key={action.id} className={styles.actionCompactRow}>
                  <div className={styles.actionCompactLead}>
                    <span className={[styles.iconBadge, action.status === 'COMPLETED' ? styles.iconBadgeSuccess : action.status === 'MISSED' ? styles.iconBadgeDanger : ''].filter(Boolean).join(' ')}>
                      <Icon name={action.status === 'COMPLETED' ? 'check' : action.required ? 'pulse' : 'clock'} size={14} />
                    </span>
                    <div className={styles.actionCompactCopy}>
                      <strong>{action.title}</strong>
                      <span>{actionTypeLabel(action.actionType)}</span>
                    </div>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.pill}>{actionStatusLabel(action.status)}</span>
                  </div>
                </div>
              ))}
            </div>

            <Link href={viewerRunId ? buildHealthProgramsHref({ screen: 'run', runId: viewerRunId }) : programsRootHref} className={styles.linkButton}>
              <Button size="sm" variant="primary">
                <Icon name="chevronRight" size={14} />
                Открыть моё прохождение
              </Button>
            </Link>
          </div>
        ) : null}
      </Card>

      <div className={styles.tabs}>
        {tabs.map((item) => (
          <button key={item} type="button" className={[styles.tab, tab === item ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'Сегодня' ? (
        <Card className={styles.sectionCard}>
          <CardHeader title="Сегодня в сессии" />
          <div className={styles.participantsBlock}>
            {session.members.map((member) => (
              <div key={member.id} className={styles.participantRow}>
                <div className={styles.participantHeader}>
                  <div className={styles.participantIdentity}>
                    <span className={styles.avatarBadge}>{member.user?.username?.slice(0, 1).toUpperCase() ?? 'У'}</span>
                    <div className={styles.participantCopy}>
                      <div className={styles.actionTitle}>@{member.user?.username ?? member.userId}</div>
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
                        <span className={styles.pill}>{runStatusLabel(member.run.status)}</span>
                      </>
                    ) : null}
                    {!member.run && member.status === 'ACCEPTED' ? <span className={styles.pill}>Ждёт запуска владельца</span> : null}
                  </div>
                </div>
                {member.run ? (
                  <>
                    <div className={styles.progressLine}>
                      <span className={styles.progressFill} style={{ width: `${member.run.completionPercent}%` }} />
                    </div>
                    <div className={styles.participantTodayMeta}>
                      <span className={styles.pill}>{`${member.run.completionPercent}% выполнено`}</span>
                      <span className={styles.pill}>{`Сегодня ${member.run.today?.completedTodayCount ?? 0}/${member.run.today?.totalTodayCount ?? 0}`}</span>
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
                        <span className={styles.sectionHint}>Сегодня ещё нет отмеченных шагов.</span>
                      )}
                    </div>
                  </>
                ) : null}
                {!member.run && member.status !== 'ACCEPTED' ? (
                  <div className={styles.sectionHint}>Пока нет активного прохождения.</div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'Участники' ? (
        <Card className={styles.sectionCard}>
          <CardHeader title="Участники" />
          <div className={styles.participantsBlock}>
            {session.members.map((member) => (
              <div key={member.id} className={styles.participantRow}>
                <div className={styles.participantHeader}>
                  <div className={styles.participantIdentity}>
                    <span className={styles.avatarBadge}>{member.user?.username?.slice(0, 1).toUpperCase() ?? 'У'}</span>
                    <div className={styles.participantCopy}>
                      <div className={styles.actionTitle}>@{member.user?.username ?? member.userId}</div>
                      <div className={styles.sectionHint}>
                        {memberRoleLabel(member.role)} • {memberStatusLabel(member.status)}
                      </div>
                    </div>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.pill}>{member.shareStatus ? 'Статус виден' : 'Статус скрыт'}</span>
                    <span className={styles.pill}>{member.shareNumbers ? 'Числа видны' : 'Только статус'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'Прогресс' ? (
        <Card className={styles.sectionCard}>
          <CardHeader title="Прогресс участников" />
          <div className={styles.participantsBlock}>
            {session.members.map((member) => (
              <div key={member.id} className={styles.participantRow}>
                <div className={styles.participantHeader}>
                  <div className={styles.participantIdentity}>
                    <span className={styles.avatarBadge}>{member.user?.username?.slice(0, 1).toUpperCase() ?? 'У'}</span>
                    <div className={styles.participantCopy}>
                      <div className={styles.actionTitle}>@{member.user?.username ?? member.userId}</div>
                      <div className={styles.sectionHint}>
                        {member.run
                          ? `Серия ${member.run.streakCount} • Следование ${member.run.adherenceScore}%`
                          : member.status === 'ACCEPTED'
                            ? 'Готов к общему старту'
                            : 'Ещё не участвует в активном прохождении'}
                      </div>
                    </div>
                  </div>
                  {member.run ? <span className={styles.pill}>{member.run.completionPercent}%</span> : <span className={styles.pill}>{memberStatusLabel(member.status)}</span>}
                </div>
                {member.run ? (
                  <>
                    <div className={styles.progressLine}>
                      <span className={styles.progressFill} style={{ width: `${member.run.completionPercent}%` }} />
                    </div>
                    <div className={styles.participantTodayMeta}>
                      <span className={styles.pill}>{`Не выполнено ${member.run.missedDaysCount}`}</span>
                      {(member.run.today?.requiredPendingCount ?? 0) > 0 ? <span className={styles.pill}>{`Осталось ${member.run.today?.requiredPendingCount}`}</span> : null}
                    </div>
                    <div className={styles.participantTaskList}>
                      <Link href={buildHealthProgramsHref({ screen: 'run', runId: member.run.id })} className={styles.linkButton}>
                        <Button size="sm">Открыть прохождение</Button>
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'Приглашения' ? (
        <Card className={styles.sectionCard}>
          <CardHeader title="Приглашения" />
          <div className={styles.sectionHint}>
            Готовность команды: {sessionReadinessLabel(session.readiness)}.
          </div>
          <div className={styles.list}>
            {session.invites.length ? (
              session.invites.map((invite) => (
                <div key={invite.id} className={styles.historyRow}>
                  <div>
                    <div className={styles.actionTitle}>{invite.recipientUsername ? `@${invite.recipientUsername}` : invite.recipientId ?? 'Ссылка-приглашение'}</div>
                    <div className={styles.sectionHint}>{formatProgramDate(invite.createdAt, true)}</div>
                  </div>
                  <div className={styles.pill}>{inviteStatusLabel(invite.status)}</div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>Приглашений пока нет.</div>
            )}
          </div>
        </Card>
      ) : null}

      <ProgramShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        sourceType="PROGRAM_SESSION"
        sourceId={session.id}
        defaultKind="SESSION_INVITE"
        title={session.title}
        description={session.program.description}
        initialMode="INVITE"
      />
    </div>
  );
}
