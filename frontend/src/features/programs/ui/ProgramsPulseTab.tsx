'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useAcceptProgramInviteMutation,
  useAcceptProgramLinkInviteMutation,
  useAcceptProgramSessionLinkInviteMutation,
  useDeclineProgramInviteMutation,
  useGetProgramInvitePreviewQuery,
  useGetProgramInvitesInboxQuery,
  useGetProgramSessionInvitePreviewQuery,
  useListProgramsQuery,
} from '@/shared/api/programsApi';
import type { ProgramListItem } from '@/shared/types/programs';
import {
  accessModeLabel,
  buildHealthProgramsHref,
  lifecycleStatusLabel,
  runStatusLabel,
  sessionReadinessLabel,
  sessionStatusLabel,
  startModeHint,
} from './programUi';
import { ProgramTodayWidget } from './ProgramTodayWidget';
import { ProgramBuilderPage } from './ProgramBuilderPage';
import { ProgramDetailPage } from './ProgramDetailPage';
import { ProgramRunPage } from './ProgramRunPage';
import { ProgramSessionPage } from './ProgramSessionPage';
import styles from './ProgramsShell.module.css';

type ProgramsView = 'today' | 'active' | 'all';
type ActiveFilter = 'all' | 'personal' | 'collaborative';
type LibraryFilter = 'all' | 'mine' | 'favorites' | 'system';
type RowMode = 'today' | 'active' | 'library';

const favoriteStorageKey = 'pulse-program-favorites';

function clearInviteParams(searchParams: URLSearchParams, router: ReturnType<typeof useRouter>) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete('programInvite');
  next.delete('sessionInvite');
  next.delete('share');
  next.set('tab', 'programs');
  router.replace(`/health?${next.toString()}`, { scroll: false });
}

function cardHref(item: ProgramListItem) {
  if (item.runId) return buildHealthProgramsHref({ screen: 'run', runId: item.runId });
  if (item.session?.id) return buildHealthProgramsHref({ screen: 'session', sessionId: item.session.id });
  return buildHealthProgramsHref({ screen: 'detail', programId: item.id });
}

function dedupePrograms(items: ProgramListItem[]) {
  const seen = new Map<string, ProgramListItem>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
      continue;
    }
    const current = seen.get(item.id)!;
    if (item.runId && !current.runId) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values()).sort((a, b) => (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0));
}

function shortText(value?: string | null, max = 88) {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function rowStatusLabel(item: ProgramListItem) {
  if (item.status) {
    return item.session?.id ? sessionStatusLabel(item.status) : runStatusLabel(item.status);
  }
  return lifecycleStatusLabel(item.lifecycleStatus);
}

function todayCaption(item: ProgramListItem) {
  if (item.session?.id) {
    return item.session.host?.username ? `Совместная · @${item.session.host.username}` : 'Совместная программа';
  }
  if (item.today?.dayNumber) return `Личная · День ${item.today.dayNumber}`;
  return 'Личное прохождение';
}

function activeCaption(item: ProgramListItem) {
  if (item.session?.id) {
    const participants = (item.session.readiness?.accepted ?? 0) + (item.session.readiness?.pending ?? 0);
    const participantsText = participants ? `${participants} участн.` : 'совместно';
    const dayText = item.today?.dayNumber ? ` · День ${item.today.dayNumber}` : '';
    return `Совместная · ${participantsText}${dayText}`;
  }
  if (item.today?.dayNumber) return `Личная · День ${item.today.dayNumber}`;
  if (item.progress) return `Личная · ${item.progress.completion}% выполнено`;
  return 'Личное прохождение';
}

function libraryCaption(item: ProgramListItem) {
  if (item.sourceType === 'SYSTEM') return shortText(item.description, 96) || 'От сайта';
  if (item.accessSource === 'OWNER') return shortText(item.description, 96) || 'Моя программа';
  if (item.accessSource === 'INVITED') return 'Доступ по приглашению';
  return shortText(item.description, 96) || accessModeLabel(item.accessMode);
}

function matchesSearch(item: ProgramListItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [item.title, item.description, item.theme, item.category, item.owner?.username]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function ProgramRow({
  item,
  caption,
  mode,
  showFavorite = false,
  isFavorite = false,
  onToggleFavorite,
}: {
  item: ProgramListItem;
  caption: string;
  mode: RowMode;
  showFavorite?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const completion = item.today?.totalActions
    ? Math.round((item.today.completedActions / item.today.totalActions) * 100)
    : item.progress?.completion ?? item.myRun?.completionPercent ?? 0;
  const href = cardHref(item);
  const primaryLabel = mode === 'library' ? 'Открыть' : 'Продолжить';
  const menuOpenLabel = mode === 'library' ? 'Открыть программу' : 'Открыть прохождение';
  const titleSummary = mode === 'today' ? shortText(item.today?.dayText, 120) : '';
  const metaPills: string[] = [];

  if (mode === 'today') {
    if (item.today?.dayNumber) metaPills.push(`День ${item.today.dayNumber}`);
    if (item.today?.requiredPending) metaPills.push(`${item.today.requiredPending} действия сегодня`);
  }

  if (mode === 'active') {
    if (item.today?.stageTitle && !/^(stage|этап)\s*\d+$/i.test(item.today.stageTitle)) metaPills.push(item.today.stageTitle);
    if (!item.session?.id && item.status && item.status !== 'ACTIVE') metaPills.push(rowStatusLabel(item));
    if (item.session?.id && item.session.status && item.session.status !== 'ACTIVE') metaPills.push(rowStatusLabel(item));
  }

  if (mode === 'library') {
    if (item.sourceType === 'SYSTEM') metaPills.push('От сайта');
    else if (item.accessSource === 'OWNER') metaPills.push('Моя программа');
    if (item.lifecycleStatus === 'DRAFT') metaPills.push('Черновик');
  }

  return (
    <div className={styles.programRowStrip}>
      <div className={styles.programRowMain}>
        <Link href={href} className={[styles.linkButton, styles.programRowLink].join(' ')}>
          <span className={styles.iconBadge}>
            <Icon name={item.session?.id ? 'users' : item.sourceType === 'SYSTEM' ? 'sparkles' : 'pulse'} size={15} />
          </span>
          <div className={styles.compactProgramCopy}>
            <strong>{item.title}</strong>
            <span>{caption}</span>
            {metaPills.length ? (
              <div className={styles.metaRow}>
                {metaPills.slice(0, 2).map((label) => (
                  <span key={label} className={label.includes('сегодня') ? [styles.pill, styles.pillAccent].join(' ') : styles.pill}>
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Link>

        {titleSummary ? <div className={styles.programRowSummary}>{titleSummary}</div> : null}
        {mode === 'active' && completion > 0 ? (
          <div className={styles.programRowProgress}>
            <div className={styles.progressLine}>
              <span className={styles.progressFill} style={{ width: `${completion}%` }} />
            </div>
            <span className={styles.programRowMetric}>{completion}%</span>
          </div>
        ) : null}
      </div>

      <div className={styles.programRowAside}>
        <div className={styles.rowActions}>
          {showFavorite ? (
            <button
              type="button"
              className={[styles.favoriteButton, isFavorite ? styles.favoriteButtonActive : ''].filter(Boolean).join(' ')}
              aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              onClick={() => onToggleFavorite?.(item.id)}
            >
              <Icon name="heart" size={14} />
            </button>
          ) : null}

          <Link href={href} className={styles.linkButton}>
            <Button size="sm" variant={mode === 'library' ? 'primary' : 'default'}>{primaryLabel}</Button>
          </Link>

          <details className={styles.actionMenu}>
            <summary className={styles.actionMenuSummary} aria-label="Ещё действия">
              <Icon name="menu" size={14} />
            </summary>
            <div className={styles.actionMenuBody}>
              <Link href={href} className={[styles.linkButton, styles.programMenuItem].join(' ')}>{menuOpenLabel}</Link>
              {mode === 'library' && onToggleFavorite ? (
                <button type="button" className={styles.programMenuItem} onClick={() => onToggleFavorite(item.id)}>
                  {isFavorite ? 'Убрать из избранного' : 'В избранное'}
                </button>
              ) : null}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export function ProgramsPulseTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ProgramsView>('today');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const programInviteToken = searchParams.get('programInvite');
  const sessionInviteToken = searchParams.get('sessionInvite');
  const programScreen = searchParams.get('programScreen');
  const selectedProgramId = searchParams.get('programId');
  const selectedRunId = searchParams.get('runId');
  const selectedSessionId = searchParams.get('sessionId');

  const { data: activeData, isLoading: activeLoading } = useListProgramsQuery('active');
  const { data: collaborativeData, isLoading: collaborativeLoading } = useListProgramsQuery('collaborative');
  const { data: libraryData, isLoading: libraryLoading } = useListProgramsQuery('library');
  const { data: mineData } = useListProgramsQuery('mine');
  const { data: inboxData, isLoading: inboxLoading } = useGetProgramInvitesInboxQuery();
  const { data: programInviteData, isFetching: programInviteLoading } = useGetProgramInvitePreviewQuery(programInviteToken ?? '', {
    skip: !programInviteToken,
  });
  const { data: sessionInviteData, isFetching: sessionInviteLoading } = useGetProgramSessionInvitePreviewQuery(sessionInviteToken ?? '', {
    skip: !sessionInviteToken,
  });

  const [acceptProgramInvite, { isLoading: acceptingProgramInvite }] = useAcceptProgramLinkInviteMutation();
  const [acceptSessionInviteByLink, { isLoading: acceptingSessionLink }] = useAcceptProgramSessionLinkInviteMutation();
  const [acceptDirectInvite, { isLoading: acceptingDirectInvite }] = useAcceptProgramInviteMutation();
  const [declineDirectInvite, { isLoading: decliningDirectInvite }] = useDeclineProgramInviteMutation();

  useEffect(() => {
    const fromUrl = searchParams.get('programsView');
    if (fromUrl === 'today' || fromUrl === 'active' || fromUrl === 'all') {
      setView(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(favoriteStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoriteIds(parsed.filter((value): value is string => typeof value === 'string'));
      }
    } catch {
      // ignore broken local state
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  const activeItems = activeData?.items ?? [];
  const collaborativeItems = collaborativeData?.items ?? [];
  const libraryItems = libraryData?.items ?? [];
  const mineItems = mineData?.items ?? [];
  const inboxItems = inboxData?.items ?? [];

  const personalRuns = activeItems.filter((item) => !item.session?.id);
  const activeTodayPrograms = activeItems.filter((item) => item.today);
  const allLibraryItems = useMemo(() => dedupePrograms([...libraryItems, ...mineItems]), [libraryItems, mineItems]);

  const activeVisible = useMemo(() => {
    if (activeFilter === 'personal') return personalRuns;
    if (activeFilter === 'collaborative') return collaborativeItems;
    return [...personalRuns, ...collaborativeItems];
  }, [activeFilter, collaborativeItems, personalRuns]);

  const libraryVisible = useMemo(() => {
    let items = allLibraryItems;
    if (libraryFilter === 'mine') items = items.filter((item) => mineItems.some((mine) => mine.id === item.id));
    if (libraryFilter === 'favorites') items = items.filter((item) => favoriteIds.includes(item.id));
    if (libraryFilter === 'system') items = items.filter((item) => item.sourceType === 'SYSTEM');
    return items.filter((item) => matchesSearch(item, query));
  }, [allLibraryItems, favoriteIds, libraryFilter, mineItems, query]);

  if (programScreen === 'builder') {
    return <ProgramBuilderPage embedded />;
  }

  if (programScreen === 'detail' && selectedProgramId) {
    return <ProgramDetailPage programId={selectedProgramId} embedded />;
  }

  if (programScreen === 'run' && selectedRunId) {
    return <ProgramRunPage runId={selectedRunId} embedded />;
  }

  if (programScreen === 'session' && selectedSessionId) {
    return <ProgramSessionPage sessionId={selectedSessionId} embedded />;
  }

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  return (
    <div className={styles.stack}>
      {programInviteToken ? (
        <div className={styles.noticeCard}>
          <div className={styles.statusLine}>
            <span className={styles.iconBadge}>
              <Icon name="pulse" size={15} />
            </span>
            <span className={[styles.pill, styles.pillAccent].join(' ')}>Приглашение в программу</span>
            {programInviteData?.invite?.owner?.username ? <span className={styles.pill}>@{programInviteData.invite.owner.username}</span> : null}
          </div>
          <div>
            <div className={styles.sectionTitle}>{programInviteData?.invite?.title ?? 'Загружаю приглашение...'}</div>
            <div className={styles.sectionHint}>
              {programInviteData?.invite?.description || 'После принятия программа появится в библиотеке и её можно будет запустить или открыть совместно.'}
            </div>
          </div>
          <div className={styles.noticeActions}>
            {programInviteData?.invite?.alreadyGranted ? (
              <Button size="sm" variant="primary" onClick={() => router.push(buildHealthProgramsHref({ screen: 'detail', programId: programInviteData.invite.programId }))}>
                <Icon name="chevronRight" size={14} />
                Открыть программу
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                loading={acceptingProgramInvite}
                disabled={programInviteLoading || !programInviteData?.invite?.canAccept}
                onClick={async () => {
                  if (!programInviteToken) return;
                  try {
                    const response = await acceptProgramInvite(programInviteToken).unwrap();
                    setErrorMessage(null);
                    router.push(buildHealthProgramsHref({ screen: 'detail', programId: response.program.id }));
                  } catch (error) {
                    setErrorMessage(extractApiError(error).message);
                  }
                }}
              >
                <Icon name="check" size={14} />
                Принять доступ
              </Button>
            )}
            <Button size="sm" onClick={() => clearInviteParams(params, router)}>Закрыть</Button>
          </div>
        </div>
      ) : null}

      {sessionInviteToken ? (
        <div className={styles.noticeCard}>
          <div className={styles.statusLine}>
            <span className={styles.iconBadge}>
              <Icon name="users" size={15} />
            </span>
            <span className={[styles.pill, styles.pillAccent].join(' ')}>Приглашение в совместную сессию</span>
            {sessionInviteData?.invite?.host?.username ? <span className={styles.pill}>@{sessionInviteData.invite.host.username}</span> : null}
          </div>
          <div>
            <div className={styles.sectionTitle}>{sessionInviteData?.invite?.title ?? 'Загружаю приглашение...'}</div>
            <div className={styles.sectionHint}>{sessionInviteData?.invite ? startModeHint(sessionInviteData.invite.startMode) : 'После принятия вы попадёте в список готовых участников.'}</div>
          </div>
          {sessionInviteData?.invite?.joinBlockedReason ? <div className={styles.sectionHint}>{sessionInviteData.invite.joinBlockedReason}</div> : null}
          <div className={styles.noticeActions}>
            {sessionInviteData?.invite?.membershipStatus === 'ACCEPTED' ? (
              <Button size="sm" variant="primary" onClick={() => router.push(buildHealthProgramsHref({ screen: 'session', sessionId: sessionInviteData.invite.sessionId }))}>
                <Icon name="chevronRight" size={14} />
                Открыть сессию
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                loading={acceptingSessionLink}
                disabled={sessionInviteLoading || !sessionInviteData?.invite?.canJoin}
                onClick={async () => {
                  if (!sessionInviteToken) return;
                  try {
                    const response = await acceptSessionInviteByLink(sessionInviteToken).unwrap();
                    setErrorMessage(null);
                    router.push(buildHealthProgramsHref({ screen: 'session', sessionId: response.session.id }));
                  } catch (error) {
                    setErrorMessage(extractApiError(error).message);
                  }
                }}
              >
                <Icon name="check" size={14} />
                Принять участие
              </Button>
            )}
            <Button size="sm" onClick={() => clearInviteParams(params, router)}>Позже</Button>
          </div>
        </div>
      ) : null}

      {errorMessage ? <div className={styles.dangerState}>{errorMessage}</div> : null}

      <div className={styles.programsHeader}>
        <div>
          <div className={styles.sectionTitle}>Программы</div>
        </div>
        <div className={styles.inlineActions}>
          <Link href={buildHealthProgramsHref({ screen: 'builder' })} className={styles.linkButton}>
            <Button size="sm" variant="primary">
              <Icon name="plus" size={14} />
              Создать
            </Button>
          </Link>
          <Link href="/health/achievements" className={styles.linkButton}>
            <Button size="sm" variant="ghost">
              <Icon name="sparkles" size={14} />
              Достижения
            </Button>
          </Link>
        </div>
      </div>

      <div className={styles.subtabBar}>
        <button type="button" className={[styles.subtabButton, view === 'today' ? styles.subtabButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setView('today')}>
          Сегодня
        </button>
        <button type="button" className={[styles.subtabButton, view === 'active' ? styles.subtabButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setView('active')}>
          Активные
        </button>
        <button type="button" className={[styles.subtabButton, view === 'all' ? styles.subtabButtonActive : ''].filter(Boolean).join(' ')} onClick={() => setView('all')}>
          Все программы
        </button>
      </div>

      {view === 'today' ? (
        <div className={styles.stack}>
          <div className={styles.flatSection}>
            <div className={styles.flatSectionHead}>
              <div className={styles.sectionTitle}>На сегодня</div>
              <span className={styles.pill}>{activeTodayPrograms.length}</span>
            </div>
            {activeLoading ? <div className={styles.emptyState}>Загружаю сегодняшние программы...</div> : null}
            {!activeLoading && !activeTodayPrograms.length ? <div className={styles.emptyState}>Сегодня программных шагов нет.</div> : null}
            <div className={styles.list}>
              {activeTodayPrograms.map((item) => (
                <ProgramRow key={`today-${item.id}-${item.runId ?? item.updatedAt}`} item={item} caption={todayCaption(item)} mode="today" />
              ))}
            </div>
            <div className={styles.inlineProgramActions}>
              <div className={styles.sectionHint}>Быстрые действия</div>
              <ProgramTodayWidget compact variant="pulse" />
            </div>
          </div>

          <div className={styles.flatSection}>
            <div className={styles.flatSectionHead}>
              <div className={styles.sectionTitle}>Вас пригласили</div>
              <span className={styles.pill}>{inboxItems.length}</span>
            </div>
            {inboxLoading ? <div className={styles.emptyState}>Проверяю входящие приглашения...</div> : null}
            {!inboxLoading && !inboxItems.length ? <div className={styles.emptyState}>Новых приглашений нет.</div> : null}
            <div className={styles.list}>
              {inboxItems.map((invite) => (
                <div key={invite.id} className={styles.programRowStrip}>
                  <div className={styles.programRowMain}>
                    <Link href={buildHealthProgramsHref({ screen: 'session', sessionId: invite.session.id })} className={[styles.linkButton, styles.programRowLink].join(' ')}>
                      <span className={styles.iconBadge}><Icon name="users" size={15} /></span>
                      <div className={styles.compactProgramCopy}>
                        <strong>{invite.session.title}</strong>
                        <span>{invite.session.host?.username ? `Совместная · @${invite.session.host.username}` : 'Совместная сессия'} · {sessionReadinessLabel(invite.session.summary)}</span>
                      </div>
                    </Link>
                  </div>
                  <div className={styles.rowActions}>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={acceptingDirectInvite}
                      disabled={!invite.canAccept}
                      onClick={async () => {
                        try {
                          const response = await acceptDirectInvite(invite.id).unwrap();
                          setErrorMessage(null);
                          router.push(buildHealthProgramsHref({ screen: 'session', sessionId: response.session.id }));
                        } catch (error) {
                          setErrorMessage(extractApiError(error).message);
                        }
                      }}
                    >
                      Принять
                    </Button>
                    <Button
                      size="sm"
                      loading={decliningDirectInvite}
                      onClick={async () => {
                        try {
                          await declineDirectInvite(invite.id).unwrap();
                          setErrorMessage(null);
                        } catch (error) {
                          setErrorMessage(extractApiError(error).message);
                        }
                      }}
                    >
                      Отклонить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {view === 'active' ? (
        <div className={styles.flatSection}>
          <div className={styles.flatSectionHead}>
            <div className={styles.sectionTitle}>Активные программы</div>
            <div className={styles.filterRow}>
              <button type="button" className={[styles.filterChip, activeFilter === 'all' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setActiveFilter('all')}>Все</button>
              <button type="button" className={[styles.filterChip, activeFilter === 'personal' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setActiveFilter('personal')}>Личные</button>
              <button type="button" className={[styles.filterChip, activeFilter === 'collaborative' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setActiveFilter('collaborative')}>Совместные</button>
            </div>
          </div>
          {(activeLoading || collaborativeLoading) ? <div className={styles.emptyState}>Собираю активные программы...</div> : null}
          {!activeLoading && !collaborativeLoading && !activeVisible.length ? <div className={styles.emptyState}>Активных программ пока нет.</div> : null}
          <div className={styles.list}>
            {activeVisible.map((item) => (
              <ProgramRow key={`${item.id}:${item.runId ?? item.session?.id ?? item.updatedAt}`} item={item} caption={activeCaption(item)} mode="active" />
            ))}
          </div>
        </div>
      ) : null}

      {view === 'all' ? (
        <div className={styles.flatSection}>
          <div className={styles.flatSectionHead}>
            <div className={styles.sectionTitle}>Все программы</div>
            <div className={styles.filterRow}>
              <button type="button" className={[styles.filterChip, libraryFilter === 'all' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setLibraryFilter('all')}>Все</button>
              <button type="button" className={[styles.filterChip, libraryFilter === 'mine' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setLibraryFilter('mine')}>Мои программы</button>
              <button type="button" className={[styles.filterChip, libraryFilter === 'favorites' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setLibraryFilter('favorites')}>Избранное</button>
              <button type="button" className={[styles.filterChip, libraryFilter === 'system' ? styles.filterChipActive : ''].filter(Boolean).join(' ')} onClick={() => setLibraryFilter('system')}>От сайта</button>
            </div>
          </div>

          <div className={styles.searchBarInline}>
            <span className={styles.iconBadge}><Icon name="search" size={14} /></span>
            <input
              className={styles.inlineSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по программам"
            />
          </div>

          {libraryLoading ? <div className={styles.emptyState}>Подтягиваю библиотеку...</div> : null}
          {!libraryLoading && !libraryVisible.length ? <div className={styles.emptyState}>По текущему фильтру ничего не найдено.</div> : null}
          <div className={styles.list}>
            {libraryVisible.map((item) => (
              <ProgramRow
                key={`${item.id}:${item.updatedAt}`}
                item={item}
                caption={libraryCaption(item)}
                mode="library"
                showFavorite
                isFavorite={favoriteIds.includes(item.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
