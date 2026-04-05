'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useAcceptProgramLinkInviteMutation,
  useAcceptProgramSessionLinkInviteMutation,
  useGetProgramInvitePreviewQuery,
  useGetProgramSessionInvitePreviewQuery,
  useListProgramsQuery,
} from '@/shared/api/programsApi';
import type { ProgramScope } from '@/shared/types/programs';
import {
  ProgramsContextBar,
  accessModeLabel,
  formatProgramDate,
  lifecycleStatusLabel,
  runStatusLabel,
  scopeHint,
  scopeLabel,
  sessionStatusLabel,
  structureTypeLabel,
} from './programUi';
import styles from './ProgramsShell.module.css';
import { ProgramTodayWidget } from './ProgramTodayWidget';

const tabs: ProgramScope[] = ['active', 'library', 'mine', 'collaborative', 'drafts'];

function clearQueryParam(searchParams: { toString(): string }, router: ReturnType<typeof useRouter>, key: string) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete(key);
  router.replace(next.toString() ? `/health/programs?${next.toString()}` : '/health/programs');
}

export function ProgramsLibraryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const scope = (searchParams.get('scope') as ProgramScope | null) ?? 'active';
  const programInviteToken = searchParams.get('programInvite');
  const sessionInviteToken = searchParams.get('sessionInvite');

  const { data, isLoading } = useListProgramsQuery(scope);
  const { data: programInviteData, isFetching: programInviteLoading, error: programInviteQueryError } = useGetProgramInvitePreviewQuery(programInviteToken ?? '', {
    skip: !programInviteToken,
  });
  const { data: sessionInviteData, isFetching: sessionInviteLoading, error: sessionInviteQueryError } = useGetProgramSessionInvitePreviewQuery(sessionInviteToken ?? '', {
    skip: !sessionInviteToken,
  });
  const [acceptProgramInvite, { isLoading: acceptingProgramInvite }] = useAcceptProgramLinkInviteMutation();
  const [acceptSessionInvite, { isLoading: joiningSession }] = useAcceptProgramSessionLinkInviteMutation();

  const items = data?.items ?? [];
  const currentLabel = scopeLabel(scope);
  const currentHint = scopeHint(scope);

  const heroStats = useMemo(() => {
    const activeRuns = items.filter((item) => item.status === 'ACTIVE' || item.status === 'PAUSED').length;
    const collaborative = items.filter((item) => item.session).length;
    const published = items.filter((item) => item.publishedAt).length;
    return { activeRuns, collaborative, published };
  }, [items]);

  return (
    <div className={styles.page}>
      <ProgramsContextBar active="programs" />

      {programInviteToken ? (
        <Card className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Приглашение в программу</h2>
              <div className={styles.sectionHint}>Эта ссылка даёт доступ к самой программе. После принятия можно пройти её лично или открыть совместную сессию.</div>
            </div>
          </div>

          {programInviteLoading ? <div className={styles.emptyState}>Загружаю приглашение...</div> : null}
          {!programInviteLoading && programInviteToken && !programInviteData?.invite && programInviteQueryError ? (
            <div className={styles.dangerState}>{extractApiError(programInviteQueryError).message}</div>
          ) : null}

          {!programInviteLoading && programInviteData?.invite ? (
            <div className={styles.noticeCard}>
              <div className={styles.statusLine}>
                <span className={styles.iconBadge}>
                  <Icon name="pulse" size={15} />
                </span>
                <span className={[styles.pill, styles.pillAccent].join(' ')}>{accessModeLabel(programInviteData.invite.accessMode)}</span>
                <span className={styles.pill}>{programInviteData.invite.owner?.username ? `Автор @${programInviteData.invite.owner.username}` : 'Автор программы'}</span>
              </div>

              <div>
                <div className={styles.sectionTitle}>{programInviteData.invite.title}</div>
                <div className={styles.sectionHint}>
                  {programInviteData.invite.description || programInviteData.invite.program.description || 'После принятия программа появится у вас в библиотеке.'}
                </div>
              </div>

              <div className={styles.metaRow}>
                {programInviteData.invite.program.category ? <span className={styles.pill}>{programInviteData.invite.program.category}</span> : null}
                {programInviteData.invite.program.theme ? <span className={styles.pill}>{programInviteData.invite.program.theme}</span> : null}
                <span className={styles.pill}>{programInviteData.invite.collaborativeEnabled ? 'Можно проходить вместе' : 'Только личный формат'}</span>
              </div>

              {inviteError ? <div className={styles.dangerState}>{inviteError}</div> : null}

              <div className={styles.noticeActions}>
                {programInviteData.invite.alreadyGranted ? (
                  <Button size="sm" variant="primary" onClick={() => router.push(`/health/programs/${programInviteData.invite.programId}`)}>
                    <Icon name="chevronRight" size={14} />
                    Открыть программу
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={acceptingProgramInvite}
                    disabled={!programInviteData.invite.canAccept}
                    onClick={async () => {
                      try {
                        const response = await acceptProgramInvite(programInviteToken).unwrap();
                        setInviteError(null);
                        router.push(`/health/programs/${response.program.id}`);
                      } catch (error) {
                        setInviteError(extractApiError(error).message);
                      }
                    }}
                  >
                    <Icon name="check" size={14} />
                    Принять доступ
                  </Button>
                )}

                <Button size="sm" onClick={() => clearQueryParam(searchParams, router, 'programInvite')}>
                  Закрыть
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {sessionInviteToken ? (
        <Card className={styles.sectionCard}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Приглашение в совместное прохождение</h2>
              <div className={styles.sectionHint}>У каждого участника будет своё личное прохождение, а сессия нужна для общего старта и видимого прогресса команды.</div>
            </div>
          </div>

          {sessionInviteLoading ? <div className={styles.emptyState}>Загружаю приглашение...</div> : null}
          {!sessionInviteLoading && sessionInviteToken && !sessionInviteData?.invite && sessionInviteQueryError ? (
            <div className={styles.dangerState}>{extractApiError(sessionInviteQueryError).message}</div>
          ) : null}

          {!sessionInviteLoading && sessionInviteData?.invite ? (
            <div className={styles.noticeCard}>
              <div className={styles.statusLine}>
                <span className={styles.iconBadge}>
                  <Icon name="users" size={15} />
                </span>
                <span className={[styles.pill, styles.pillAccent].join(' ')}>{sessionStatusLabel(sessionInviteData.invite.status)}</span>
                <span className={styles.pill}>{sessionInviteData.invite.host?.username ? `Владелец @${sessionInviteData.invite.host.username}` : 'Владелец сессии'}</span>
              </div>

              <div>
                <div className={styles.sectionTitle}>{sessionInviteData.invite.title}</div>
                <div className={styles.sectionHint}>
                  {sessionInviteData.invite.program.description || 'Совместное прохождение программы внутри Pulse.'}
                </div>
              </div>

              <div className={styles.metaRow}>
                <span className={styles.pill}>{sessionInviteData.invite.summary.participants} участников</span>
                <span className={styles.pill}>{sessionInviteData.invite.summary.activeRuns} активных прохождений</span>
                <span className={styles.pill}>{formatProgramDate(sessionInviteData.invite.startedAt ?? sessionInviteData.invite.scheduledStartAt)}</span>
              </div>

              {sessionInviteData.invite.joinBlockedReason ? <div className={styles.sectionHint}>{sessionInviteData.invite.joinBlockedReason}</div> : null}
              {inviteError ? <div className={styles.dangerState}>{inviteError}</div> : null}

              <div className={styles.noticeActions}>
                {sessionInviteData.invite.membershipStatus === 'ACCEPTED' ? (
                  <Button size="sm" variant="primary" onClick={() => router.push(`/health/program-sessions/${sessionInviteData.invite.sessionId}`)}>
                    <Icon name="chevronRight" size={14} />
                    Открыть сессию
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={joiningSession}
                    disabled={!sessionInviteData.invite.canJoin}
                    onClick={async () => {
                      try {
                        const response = await acceptSessionInvite(sessionInviteToken).unwrap();
                        setInviteError(null);
                        router.push(`/health/program-sessions/${response.session.id}`);
                      } catch (error) {
                        setInviteError(extractApiError(error).message);
                      }
                    }}
                  >
                    <Icon name="check" size={14} />
                    Вступить в сессию
                  </Button>
                )}

                <Button size="sm" onClick={() => clearQueryParam(searchParams, router, 'sessionInvite')}>
                  Закрыть
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>Pulse</span>
              <span className={styles.pill}>{currentLabel}</span>
            </div>
            <h1 className={styles.heroTitle}>Программы</h1>
            <p className={styles.heroSubtitle}>Личный старт, совместные сессии, приглашения и ежедневные действия в одном понятном разделе без лишней админки.</p>
          </div>

          <div className={styles.heroActions}>
            <Link href="/health/programs/new" className={styles.linkButton}>
              <Button size="sm" variant="primary">
                <Icon name="plus" size={14} />
                Новая программа
              </Button>
            </Link>
            <Link href="/health/achievements" className={styles.linkButton}>
              <Button size="sm">
                <Icon name="sparkles" size={14} />
                Достижения
              </Button>
            </Link>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Раздел</div>
            <div className={styles.summaryValue}>{currentLabel}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Активных</div>
            <div className={styles.summaryValue}>{heroStats.activeRuns}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Совместных</div>
            <div className={styles.summaryValue}>{heroStats.collaborative}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Опубликованных</div>
            <div className={styles.summaryValue}>{heroStats.published}</div>
          </div>
        </div>
      </section>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={[styles.tab, scope === tab ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => router.push(`/health/programs?scope=${tab}`)}
          >
            {scopeLabel(tab)}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>{currentLabel}</h2>
                <div className={styles.sectionHint}>{currentHint}</div>
              </div>
            </div>

            {isLoading ? <div className={styles.emptyState}>Загружаю программы...</div> : null}
            {!isLoading && !items.length ? <div className={styles.emptyState}>Пока пусто. Можно создать свою программу или открыть библиотеку опубликованных.</div> : null}

            <div className={styles.list}>
              {items.map((item) => (
                <Link
                  key={`${item.id}:${item.runId ?? item.session?.id ?? item.updatedAt}`}
                  href={
                    item.runId
                      ? `/health/program-runs/${item.runId}`
                      : item.session?.id
                        ? `/health/program-sessions/${item.session.id}`
                        : `/health/programs/${item.id}`
                  }
                  className={styles.linkButton}
                >
                  <Card className={styles.programCard}>
                    <div className={styles.programHead}>
                      <div>
                        <h3 className={styles.programTitle}>{item.title}</h3>
                        <p className={[styles.programText, styles.clamp2].join(' ')}>
                          {item.description || 'Описание пока не добавлено.'}
                        </p>
                      </div>
                      <div className={[styles.pill, styles.pillAccent].join(' ')}>
                        {item.status ? (item.session?.id ? sessionStatusLabel(item.status) : runStatusLabel(item.status)) : lifecycleStatusLabel(item.lifecycleStatus)}
                      </div>
                    </div>

                    <div className={styles.metaRow}>
                      {item.category ? <span className={styles.pill}>{item.category}</span> : null}
                      {item.theme ? <span className={styles.pill}>{item.theme}</span> : null}
                      <span className={styles.pill}>{accessModeLabel(item.accessMode)}</span>
                      <span className={styles.pill}>{structureTypeLabel(item.structureType)}</span>
                      {item.session?.status ? <span className={styles.pill}>{sessionStatusLabel(item.session.status)}</span> : null}
                    </div>

                    {item.progress ? (
                      <div className={styles.summaryGrid}>
                        <div className={styles.summaryCard}>
                          <div className={styles.summaryLabel}>Выполнение</div>
                          <div className={styles.summaryValue}>{item.progress.completion}%</div>
                        </div>
                        <div className={styles.summaryCard}>
                          <div className={styles.summaryLabel}>Следование</div>
                          <div className={styles.summaryValue}>{item.progress.adherence}%</div>
                        </div>
                        <div className={styles.summaryCard}>
                          <div className={styles.summaryLabel}>Ритм</div>
                          <div className={styles.summaryValue}>{item.progress.consistency}%</div>
                        </div>
                        <div className={styles.summaryCard}>
                          <div className={styles.summaryLabel}>Серия</div>
                          <div className={styles.summaryValue}>{item.progress.streak}</div>
                        </div>
                      </div>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.stack}>
          <ProgramTodayWidget compact />

          <Card className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>Быстрые действия</h2>
            <div className={styles.inlineActions}>
              <Link href="/health/programs/new" className={styles.linkButton}>
                <Button size="sm" variant="primary">
                  <Icon name="pencil" size={14} />
                  Конструктор
                </Button>
              </Link>
              <Link href="/health/achievements" className={styles.linkButton}>
                <Button size="sm">
                  <Icon name="sparkles" size={14} />
                  Достижения Pulse
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
