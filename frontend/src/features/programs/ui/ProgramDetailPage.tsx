'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import { useGetFollowersQuery, useGetFollowingQuery } from '@/shared/api/friendsApi';
import {
  useCreateProgramSessionMutation,
  useGetProgramQuery,
  usePublishProgramMutation,
  useStartProgramRunMutation,
} from '@/shared/api/programsApi';
import {
  ProgramsContextBar,
  buildHealthProgramsHref,
  accessModeHint,
  accessModeLabel,
  accessSourceLabel,
  actionTypeLabel,
  formatProgramDate,
  integrationTypeLabel,
  lifecycleStatusLabel,
  memberRoleLabel,
  memberStatusLabel,
  sessionStatusLabel,
  startModeHint,
  startModeLabel,
  structureTypeLabel,
} from './programUi';
import styles from './ProgramsShell.module.css';
import { ProgramShareSheet } from './ProgramShareSheet';

type SessionCandidate = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  source: 'mutual' | 'access';
};

export function ProgramDetailPage({ programId, embedded = false }: { programId: string; embedded?: boolean }) {
  const router = useRouter();
  const { data, isLoading } = useGetProgramQuery(programId);
  const [shareOpen, setShareOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [sessionStartMode, setSessionStartMode] = useState<'HOST_MANUAL' | 'NOW' | 'SCHEDULED'>('HOST_MANUAL');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [shareStatus, setShareStatus] = useState(true);
  const [shareNumbers, setShareNumbers] = useState(false);
  const [shareMisses, setShareMisses] = useState(false);
  const [shareMilestones, setShareMilestones] = useState(true);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startProgramRun, { isLoading: starting }] = useStartProgramRunMutation();
  const [createSession, { isLoading: creatingSession }] = useCreateProgramSessionMutation();
  const [publishProgram, { isLoading: publishing }] = usePublishProgramMutation();

  const program = data?.program;
  const programsRootHref = buildHealthProgramsHref();
  const shouldLoadMutuals = collabOpen && program?.accessMode === 'PUBLIC';
  const { data: followingData } = useGetFollowingQuery(undefined, { skip: !shouldLoadMutuals });
  const { data: followersData } = useGetFollowersQuery(undefined, { skip: !shouldLoadMutuals });

  const sessionCandidates = useMemo(() => {
    if (!program) return [] as SessionCandidate[];
    if (program.accessMode === 'RESTRICTED') {
      return program.accessUsers.map((user) => ({
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        source: 'access' as const,
      }));
    }

    if (program.accessMode === 'PUBLIC') {
      const following = new Map<string, SessionCandidate>();
      const followers = new Set<string>();

      for (const record of followingData?.following ?? []) {
        const user = record.receiver;
        if (user?.id) {
          following.set(user.id, {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            source: 'mutual',
          });
        }
      }

      for (const record of followersData?.followers ?? []) {
        const user = record.sender;
        if (user?.id) followers.add(user.id);
      }

      return [...following.values()]
        .filter((user) => followers.has(user.id))
        .sort((a, b) => a.username.localeCompare(b.username, 'ru'));
    }

    return [] as SessionCandidate[];
  }, [followersData?.followers, followingData?.following, program]);

  const selectedUsers = useMemo(
    () => sessionCandidates.filter((candidate) => selectedParticipants.includes(candidate.username)),
    [selectedParticipants, sessionCandidates],
  );

  useEffect(() => {
    if (!collabOpen) {
      setSelectedParticipants([]);
      setSessionStartMode('HOST_MANUAL');
      setScheduledStartAt('');
      setShareStatus(true);
      setShareNumbers(false);
      setShareMisses(false);
      setShareMilestones(true);
    }
  }, [collabOpen]);

  if (isLoading || !program) {
    return (
      <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
        <ProgramsContextBar active="programs" backHref={programsRootHref} backLabel={embedded ? 'Назад' : 'К программам'} hideNav={embedded} />
        <Card className={styles.sectionCard}>
          <div className={styles.emptyState}>Загружаю программу...</div>
        </Card>
      </div>
    );
  }

  const isPublished = program.lifecycleStatus === 'PUBLISHED' && Boolean(program.currentVersion?.id);
  const shareBlockedReason = isPublished
    ? null
    : 'Шаринг, личный старт и совместный режим доступны после публикации программы.';
  const openPersonalRunId = program.entryState.activePersonalRunId ?? null;
  const openSessionId = program.entryState.activeSessionId ?? null;
  const canInviteTogether = isPublished && program.entryState.canStartTogether;
  const personalReason = program.entryState.personalBlockedReason;
  const collaborativeReason = program.entryState.collaborativeBlockedReason;
  const collaborativeCtaLabel = openSessionId ? 'Открыть сессию' : 'Начать совместно';
  const personalCtaLabel = openPersonalRunId ? 'Продолжить' : 'Начать';

  const toggleParticipant = (username: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(username) ? prev.filter((item) => item !== username) : [...prev, username],
    );
  };

  return (
    <div className={[styles.page, embedded ? styles.pageInset : ''].filter(Boolean).join(' ')}>
      <ProgramsContextBar active="programs" backHref={programsRootHref} backLabel={embedded ? 'Назад' : 'К программам'} hideNav={embedded} />

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Icon name="sparkles" size={14} />
              <span>Программа</span>
            </div>
            <div className={styles.metaRow}>
              {program.category ? <span className={styles.pill}>{program.category}</span> : null}
              <span className={[styles.pill, styles.pillAccent].join(' ')}>
                {lifecycleStatusLabel(program.lifecycleStatus)}
              </span>
              <span className={styles.pill}>{accessModeLabel(program.accessMode)}</span>
              <span className={styles.pill}>{structureTypeLabel(program.structureType)}</span>
                          </div>
            <h1 className={styles.heroTitle}>{program.title}</h1>
            <p className={styles.heroSubtitle}>
              {program.description || 'Коротко о результате, формате и сценарии программы до запуска.'}
            </p>
          </div>

          <div className={styles.heroActions}>
            {!isPublished ? (
              <Button
                size="sm"
                variant="primary"
                loading={publishing}
                onClick={async () => {
                  try {
                    await publishProgram(program.id).unwrap();
                    setErrorMessage(null);
                  } catch (error) {
                    setErrorMessage(extractApiError(error).message);
                  }
                }}
              >
                <Icon name="check" size={14} />
                Опубликовать
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={starting}
                  disabled={!openPersonalRunId && !program.entryState.canStartPersonal}
                  onClick={async () => {
                    try {
                      if (openPersonalRunId) {
                        router.push(buildHealthProgramsHref({ screen: 'run', runId: openPersonalRunId }));
                        return;
                      }
                      const run = await startProgramRun({ programId }).unwrap();
                      setErrorMessage(null);
                      if (run?.run?.id) router.push(buildHealthProgramsHref({ screen: 'run', runId: run.run.id }));
                    } catch (error) {
                      setErrorMessage(extractApiError(error).message);
                    }
                  }}
                >
                  <Icon name="play" size={14} />
                  {personalCtaLabel}
                </Button>

                <Button
                  size="sm"
                  disabled={!openSessionId && !canInviteTogether}
                  onClick={() => {
                    if (openSessionId) {
                      router.push(buildHealthProgramsHref({ screen: 'session', sessionId: openSessionId }));
                      return;
                    }
                    setCollabOpen(true);
                  }}
                >
                  <Icon name="users" size={14} />
                  {collaborativeCtaLabel}
                </Button>

                <Button size="sm" onClick={() => setShareOpen(true)}>
                  <Icon name="forward" size={14} />
                  Поделиться
                </Button>
              </>
            )}
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Доступ</div>
            <div className={styles.summaryValue}>{accessModeLabel(program.accessMode)}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Этапов</div>
            <div className={styles.summaryValue}>{program.stages.length}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Моих запусков</div>
            <div className={styles.summaryValue}>{program.myRuns.length}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Совместный режим</div>
            <div className={styles.summaryValue}>{program.collaborativeEnabled ? 'Да' : 'Нет'}</div>
          </div>
        </div>
      </section>

      {!isPublished ? (
        <div className={styles.noticeCard}>
          <div className={styles.sectionTitle}>Это черновик</div>
          <div className={styles.sectionHint}>
            Пока программа не опубликована, её нельзя запустить для себя, использовать в сессии или
            отправить приглашение.
          </div>
        </div>
      ) : null}

      {errorMessage ? <div className={styles.dangerState}>{errorMessage}</div> : null}

      <div className={styles.grid}>
        <div className={styles.stack}>
          <Card className={styles.sectionCard}>
            <CardHeader title="Что можно сделать сейчас" />
            <div className={styles.list}>
              <div className={styles.actionRow}>
                <div className={styles.actionMeta}>
                  <div className={styles.actionTitle}>
                    <Icon name="play" size={14} />
                    Личное прохождение
                  </div>
                  <div className={styles.actionSub}>
                    {openPersonalRunId
                      ? 'У вас уже есть активное личное прохождение этой программы.'
                      : personalReason || 'Программа готова к личному старту.'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!openPersonalRunId && !program.entryState.canStartPersonal}
                  onClick={async () => {
                    try {
                      if (openPersonalRunId) {
                        router.push(buildHealthProgramsHref({ screen: 'run', runId: openPersonalRunId }));
                        return;
                      }
                      const run = await startProgramRun({ programId }).unwrap();
                      setErrorMessage(null);
                      if (run?.run?.id) router.push(buildHealthProgramsHref({ screen: 'run', runId: run.run.id }));
                    } catch (error) {
                      setErrorMessage(extractApiError(error).message);
                    }
                  }}
                >
                  {personalCtaLabel}
                </Button>
              </div>

              <div className={styles.actionRow}>
                <div className={styles.actionMeta}>
                  <div className={styles.actionTitle}>
                    <Icon name="users" size={14} />
                    Совместное прохождение
                  </div>
                  <div className={styles.actionSub}>
                    {openSessionId
                      ? 'Вы уже участвуете в совместной сессии этой программы.'
                      : collaborativeReason ||
                        'Можно собрать участников и стартовать вместе по готовности.'}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!openSessionId && !canInviteTogether}
                  onClick={() => {
                    if (openSessionId) {
                      router.push(buildHealthProgramsHref({ screen: 'session', sessionId: openSessionId }));
                      return;
                    }
                    setCollabOpen(true);
                  }}
                >
                  {collaborativeCtaLabel}
                </Button>
              </div>
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <CardHeader title="О программе" />
            <div className={styles.programText}>
              {program.description || 'Подробное описание пока не заполнено.'}
            </div>
            <div className={styles.metaRow}>
              {program.theme ? <span className={styles.pill}>{program.theme}</span> : null}
              {program.durationDays ? <span className={styles.pill}>{program.durationDays} дн.</span> : null}
              {program.currentVersion ? (
                <span className={styles.pill}>v{program.currentVersion.versionNumber}</span>
              ) : null}
              {program.owner?.username ? (
                <span className={styles.pill}>Автор @{program.owner.username}</span>
              ) : null}
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <CardHeader title="Этапы" />
            <div className={styles.list}>
              {program.stages.length ? (
                program.stages.map((stage) => (
                  <div key={stage.id} className={styles.detailsCard}>
                    <div className={styles.sectionTitle}>{stage.title}</div>
                    <div className={styles.sectionHint}>
                      {stage.description || 'Описание этапа пока не добавлено.'}
                    </div>
                    <div className={styles.metaRow}>
                      {stage.startDay != null ? (
                        <span className={styles.pill}>с {stage.startDay} дня</span>
                      ) : null}
                      {stage.endDay != null ? (
                        <span className={styles.pill}>до {stage.endDay} дня</span>
                      ) : null}
                      {stage.milestoneText ? (
                        <span className={[styles.pill, styles.pillAccent].join(' ')}>
                          {stage.milestoneText}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyState}>Этапы пока не заданы.</div>
              )}
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <CardHeader title="Примеры дней" />
            <div className={styles.detailsList}>
              {program.sampleDays.length ? (
                program.sampleDays.map((day) => (
                  <details key={day.id} className={styles.detailsCard}>
                    <summary>
                      День {day.dayNumber ?? 'шаблон'}
                      {day.title ? ` • ${day.title}` : ''}
                    </summary>
                    <div className={styles.sectionHint}>
                      {day.dayText || 'Текст дня пока не добавлен.'}
                    </div>
                    <div className={styles.metaRow}>
                      {day.tipOfDay ? <span className={styles.pill}>Совет: {day.tipOfDay}</span> : null}
                      {day.motivationOfDay ? (
                        <span className={[styles.pill, styles.pillAccent].join(' ')}>
                          Мотивация: {day.motivationOfDay}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.list}>
                      {day.actions.map((action) => (
                        <div key={action.id} className={styles.actionRow}>
                          <div className={styles.actionMeta}>
                            <div className={styles.actionTitle}>{action.title}</div>
                            <div className={styles.actionSub}>
                              {actionTypeLabel(action.actionType)} •{' '}
                              {integrationTypeLabel(action.integrationType)}
                            </div>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.pill}>
                              {action.required ? 'Обязательное' : 'Опциональное'}
                            </span>
                            {action.estimatedMinutes ? (
                              <span className={styles.pill}>{action.estimatedMinutes} мин</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              ) : (
                <div className={styles.emptyState}>Примеры дней пока не добавлены.</div>
              )}
            </div>
          </Card>
        </div>

        <div className={styles.stack}>
          <Card className={styles.sectionCard}>
            <CardHeader title="Доступ и правила" />
            <div className={styles.sectionHint}>{accessModeHint(program.accessMode)}</div>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>
                {accessModeLabel(program.accessMode)}
              </span>
                          </div>
            {program.accessUsers.length ? (
              <div className={styles.metaRow}>
                {program.accessUsers.map((user) => (
                  <span key={user.id} className={styles.pill}>
                    @{user.username}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className={styles.sectionCard}>
            <CardHeader title="Интеграции" />
            <div className={styles.metaRow}>
              {program.integrations.length ? (
                program.integrations.map((integration) => (
                  <span key={integration} className={styles.pill}>
                    {integrationTypeLabel(integration)}
                  </span>
                ))
              ) : (
                <div className={styles.emptyState}>Интеграции пока не настроены.</div>
              )}
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <CardHeader title="Моя активность" />
            {!program.myRuns.length ? (
              <div className={styles.emptyState}>Вы ещё не запускали эту программу.</div>
            ) : null}
            <div className={styles.list}>
              {program.myRuns.map((run) => (
                <Link key={run.id} href={buildHealthProgramsHref({ screen: 'run', runId: run.id })} className={styles.linkButton}>
                  <div className={styles.actionRow}>
                    <div className={styles.actionMeta}>
                      <div className={styles.actionTitle}>
                        {run.sessionId ? 'Совместное прохождение' : 'Личное прохождение'}
                      </div>
                      <div className={styles.actionSub}>
                        {formatProgramDate(run.updatedAt, true)} • Выполнение {run.completionPercent}% •
                        Следование {run.adherenceScore}%
                      </div>
                    </div>
                    <div className={styles.pill}>{run.streakCount} дн. подряд</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {program.relatedSessions.length ? (
            <Card className={styles.sectionCard}>
              <CardHeader title="Мои сессии" />
              <div className={styles.list}>
                {program.relatedSessions.map((session) => (
                  <Link
                    key={session.id}
                    href={buildHealthProgramsHref({ screen: 'session', sessionId: session.id })}
                    className={styles.linkButton}
                  >
                    <div className={styles.actionRow}>
                      <div className={styles.actionMeta}>
                        <div className={styles.actionTitle}>
                          {session.title || 'Совместная сессия'}
                        </div>
                        <div className={styles.actionSub}>
                          {session.host?.username
                            ? `Владелец @${session.host.username}`
                            : 'Владелец не указан'}
                          {session.viewerRole ? ` • ${memberRoleLabel(session.viewerRole)}` : ''}
                          {session.viewerStatus ? ` • ${memberStatusLabel(session.viewerStatus)}` : ''}
                        </div>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={styles.pill}>{sessionStatusLabel(session.status)}</span>
                        {session.startedAt ? (
                          <span className={styles.pill}>
                            Старт {formatProgramDate(session.startedAt, true)}
                          </span>
                        ) : null}
                        {session.scheduledStartAt ? (
                          <span className={styles.pill}>
                            План {formatProgramDate(session.scheduledStartAt, true)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal open={collabOpen} onClose={() => setCollabOpen(false)} title="Совместное прохождение">
        <div className={styles.formCard}>
          <div className={styles.noticeCard}>
            <div className={styles.sectionTitle}>Как это работает</div>
            <div className={styles.sectionHint}>
              У каждого участника будет своё прохождение. Сессия нужна, чтобы собраться, дождаться
              готовности и видеть прогресс друг друга.
            </div>
          </div>

          <div className={styles.field}>
            <span>Кого пригласить</span>
            {program.accessMode === 'PRIVATE' ? (
              <div className={styles.emptyState}>Приватную программу нельзя проходить вместе.</div>
            ) : sessionCandidates.length ? (
              <div className={styles.metaRow}>
                {sessionCandidates.map((candidate) => {
                  const selected = selectedParticipants.includes(candidate.username);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      className={[styles.tab, selected ? styles.tabActive : ''].filter(Boolean).join(' ')}
                      onClick={() => toggleParticipant(candidate.username)}
                    >
                      @{candidate.username}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                {program.accessMode === 'PUBLIC'
                  ? 'Для публичной программы можно приглашать взаимных подписчиков. Пока таких кандидатов нет.'
                  : 'В этой программе пока нет приглашённых пользователей.'}
              </div>
            )}
          </div>

          {selectedUsers.length ? (
            <div className={styles.noticeCard}>
              <div className={styles.sectionTitle}>Выбраны участники</div>
              <div className={styles.metaRow}>
                {selectedUsers.map((user) => (
                  <span key={user.id} className={styles.pill}>
                    @{user.username}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.inlineActions}>
            <Button
              size="sm"
              variant={sessionStartMode === 'HOST_MANUAL' ? 'primary' : 'default'}
              onClick={() => setSessionStartMode('HOST_MANUAL')}
            >
              {startModeLabel('HOST_MANUAL')}
            </Button>
            <Button
              size="sm"
              variant={sessionStartMode === 'NOW' ? 'primary' : 'default'}
              onClick={() => setSessionStartMode('NOW')}
            >
              {startModeLabel('NOW')}
            </Button>
            <Button
              size="sm"
              variant={sessionStartMode === 'SCHEDULED' ? 'primary' : 'default'}
              onClick={() => setSessionStartMode('SCHEDULED')}
            >
              {startModeLabel('SCHEDULED')}
            </Button>
          </div>

          <div className={styles.sectionHint}>{startModeHint(sessionStartMode)}</div>

          {sessionStartMode === 'SCHEDULED' ? (
            <label className={styles.field}>
              <span>Когда стартовать</span>
              <input
                type="datetime-local"
                value={scheduledStartAt}
                onChange={(event) => setScheduledStartAt(event.target.value)}
              />
            </label>
          ) : null}

          <div className={styles.field}>
            <span>Что участники видят друг у друга</span>
            <div className={styles.inlineActions}>
              <Button
                size="sm"
                variant={shareStatus ? 'primary' : 'default'}
                onClick={() => setShareStatus((value) => !value)}
              >
                Статус
              </Button>
              <Button
                size="sm"
                variant={shareNumbers ? 'primary' : 'default'}
                onClick={() => setShareNumbers((value) => !value)}
              >
                Цифры
              </Button>
              <Button
                size="sm"
                variant={shareMilestones ? 'primary' : 'default'}
                onClick={() => setShareMilestones((value) => !value)}
              >
                Этапы
              </Button>
              <Button
                size="sm"
                variant={shareMisses ? 'primary' : 'default'}
                onClick={() => setShareMisses((value) => !value)}
              >
                Пропуски
              </Button>
            </div>
            <div className={styles.sectionHint}>
              По умолчанию видны статус и этапы. Числовой прогресс и пропуски лучше раскрывать только
              там, где это помогает, а не давит.
            </div>
          </div>

          <div className={styles.inlineActions}>
            <Button
              size="sm"
              variant="primary"
              loading={creatingSession}
              onClick={async () => {
                try {
                  if (sessionStartMode === 'SCHEDULED' && !scheduledStartAt) {
                    setErrorMessage('Выберите дату и время старта.');
                    return;
                  }
                  const normalizedScheduledStartAt =
                    sessionStartMode === 'SCHEDULED' && scheduledStartAt
                      ? new Date(scheduledStartAt).toISOString()
                      : null;
                  const session = await createSession({
                    programId,
                    participantUsernames: selectedParticipants,
                    startMode: sessionStartMode,
                    scheduledStartAt: normalizedScheduledStartAt,
                    shareStatus,
                    shareNumbers,
                    shareMisses,
                    shareMilestones,
                  }).unwrap();

                  setErrorMessage(null);
                  setCollabOpen(false);
                  if (session?.session?.id) router.push(buildHealthProgramsHref({ screen: 'session', sessionId: session.session.id }));
                } catch (error) {
                  setErrorMessage(extractApiError(error).message);
                  setCollabOpen(false);
                }
              }}
            >
              Создать сессию
            </Button>
            <Button size="sm" onClick={() => setCollabOpen(false)}>
              Закрыть
            </Button>
          </div>
        </div>
      </Modal>

      <ProgramShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        sourceType="PROGRAM"
        sourceId={program.id}
        defaultKind={program.accessMode === 'RESTRICTED' ? 'PROGRAM_INVITE' : 'PROGRAM'}
        title={program.title}
        description={program.description}
        disabledReason={shareBlockedReason}
        initialMode={program.accessMode === 'RESTRICTED' ? 'INVITE' : 'REFERENCE'}
      />
    </div>
  );
}
