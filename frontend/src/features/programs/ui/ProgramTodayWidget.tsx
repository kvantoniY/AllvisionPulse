'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpRight, CircleCheckBig, Clock3, Ellipsis, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { extractApiError } from '@/shared/lib/apiError';
import {
  useCompleteProgramActionMutation,
  useGetProgramTodayActionsQuery,
  useRescheduleProgramActionMutation,
  useSkipProgramActionMutation,
} from '@/shared/api/programsApi';
import styles from './ProgramsShell.module.css';
import { buildHealthProgramsHref } from './programUi';

type ProgramTodayWidgetProps = {
  compact?: boolean;
  variant?: 'default' | 'pulse';
};

function getPulseProgramContext(item: {
  programTitle: string;
  required: boolean;
  stageTitle?: string | null;
}) {
  const rawStage = item.stageTitle?.trim() ?? '';
  const stage = rawStage.toLowerCase();
  const genericStage = !rawStage || /^(stage|этап)\s*\d+$/i.test(rawStage) || /^(start|старт)$/i.test(stage);
  const humanStage = genericStage ? null : rawStage;
  const statusNote = item.required ? 'на сегодня' : 'можно позже';
  return [item.programTitle, humanStage ?? statusNote].filter(Boolean).join(' · ');
}

export function ProgramTodayWidget({ compact = false, variant = 'default' }: ProgramTodayWidgetProps) {
  const { data, isLoading } = useGetProgramTodayActionsQuery();
  const [completeAction, { isLoading: completing }] = useCompleteProgramActionMutation();
  const [skipAction, { isLoading: skipping }] = useSkipProgramActionMutation();
  const [rescheduleAction, { isLoading: rescheduling }] = useRescheduleProgramActionMutation();
  const isPulse = variant === 'pulse';
  const items = data?.items ?? [];
  const visibleItems = compact ? items.slice(0, isPulse ? 3 : 4) : items.slice(0, isPulse ? 5 : 8);
  const tomorrow = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    return value.toISOString().slice(0, 10);
  }, []);

  const handleAction = async (job: () => Promise<unknown>) => {
    try {
      await job();
    } catch (error) {
      console.error('[programs:today-widget]', extractApiError(error).message);
    }
  };

  if (isPulse) {
    return (
      <div className={styles.pulseWidget}>
        {isLoading ? <div className={styles.emptyState}>Собираю действия на сегодня...</div> : null}
        {!isLoading && !visibleItems.length ? <div className={styles.emptyState}>Сегодня активных действий по программам нет.</div> : null}

        <div className={[styles.list, styles.pulseList].join(' ')}>
          {visibleItems.map((item) => {
            const primaryOpenHref = item.openPath ?? buildHealthProgramsHref({ screen: 'run', runId: item.runId });

            return (
              <div key={item.id} className={styles.pulseActionRow}>
                <Link href={primaryOpenHref} className={[styles.linkButton, styles.pulseActionMain, styles.pulseActionMainLink].join(' ')}>
                  <span className={[styles.iconBadge, styles.pulseActionBadge].join(' ')}>
                    {item.required ? <Sparkles className={styles.pulseActionBadgeIcon} strokeWidth={1.9} aria-hidden="true" /> : <Clock3 className={styles.pulseActionBadgeIcon} strokeWidth={1.9} aria-hidden="true" />}
                  </span>

                  <div className={styles.pulseActionCopy}>
                    <strong>{item.title}</strong>
                    <span>{getPulseProgramContext(item)}</span>
                  </div>
                </Link>

                <div className={styles.pulseActionControls}>
                  <Button
                    size="sm"
                    iconOnly
                    className={styles.pulseActionCheckButton}
                    variant={item.required ? 'primary' : 'ghost'}
                    loading={completing}
                    aria-label="Отметить выполненным"
                    onClick={() => handleAction(() => completeAction({ runId: item.runId, actionId: item.id }).unwrap())}
                  >
                    <CircleCheckBig className={styles.pulseActionControlIcon} strokeWidth={1.9} aria-hidden="true" />
                  </Button>

                  <Link href={primaryOpenHref} className={styles.linkButton}>
                    <span className={styles.pulseActionChevron} aria-label="Открыть действие">
                      <ArrowUpRight className={styles.pulseActionControlIcon} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {items.length > visibleItems.length ? (
          <Link href="/health?tab=programs" className={styles.pulseMoreLink}>
            Ещё действия из программ
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={styles.sectionCard}>
      <CardHeader
        title="Сегодня по программам"
        action={(
          <Link href="/health?tab=programs" className={styles.linkButton}>
            <Button size="sm">Открыть</Button>
          </Link>
        )}
      />

      {isLoading ? <div className={styles.emptyState}>Собираю действия на сегодня...</div> : null}
      {!isLoading && !visibleItems.length ? <div className={styles.emptyState}>Сегодня активных действий по программам нет.</div> : null}

      <div className={styles.widgetActionList}>
        {visibleItems.map((item) => (
          <div key={item.id} className={styles.widgetActionRow}>
            <div className={styles.widgetActionLead}>
              <span className={styles.iconBadge}>
                <Icon name={item.required ? 'checkDouble' : 'clock'} size={14} />
              </span>
              <div className={styles.widgetActionCopy}>
                <strong>{item.title}</strong>
                <span>{getPulseProgramContext(item)}</span>
                <div className={styles.metaRow}>
                  <span className={[styles.pill, styles.pillAccent].join(' ')}>{`День ${item.dayNumber}`}</span>
                  <span className={styles.pill}>{item.required ? 'Обязательно' : 'Опционально'}</span>
                </div>
              </div>
            </div>

            <div className={styles.widgetActionTail}>
              <Button
                size="sm"
                variant="primary"
                loading={completing}
                aria-label="Отметить выполненным"
                onClick={() => handleAction(() => completeAction({ runId: item.runId, actionId: item.id }).unwrap())}
              >
                <Icon name="check" size={14} />
              </Button>

              {item.openPath ? (
                <Link href={item.openPath} className={styles.linkButton}>
                  <Button size="sm" aria-label="Открыть связанный инструмент">
                    <Icon name="forward" size={14} />
                  </Button>
                </Link>
              ) : null}

              <details className={styles.pulseOverflow}>
                <summary className={styles.pulseOverflowTrigger} aria-label="Ещё действия">
                  <Ellipsis size={14} strokeWidth={1.9} aria-hidden="true" />
                </summary>
                <div className={styles.pulseOverflowMenu}>
                  <button
                    type="button"
                    className={styles.pulseOverflowItem}
                    onClick={() => handleAction(() => skipAction({ runId: item.runId, actionId: item.id }).unwrap())}
                    disabled={skipping}
                  >
                    Пропустить
                  </button>
                  <button
                    type="button"
                    className={styles.pulseOverflowItem}
                    onClick={() => handleAction(() => rescheduleAction({ runId: item.runId, actionId: item.id, targetDate: tomorrow }).unwrap())}
                    disabled={rescheduling}
                  >
                    На завтра
                  </button>
                  <Link href={buildHealthProgramsHref({ screen: 'run', runId: item.runId })} className={[styles.pulseOverflowItem, styles.linkButton].join(' ')}>
                    Открыть программу
                  </Link>
                </div>
              </details>
            </div>
          </div>
        ))}
      </div>

      {items.length > visibleItems.length ? <div className={styles.sectionHint}>Показываем только ближайшие действия, остальное внутри программы.</div> : null}
      {Boolean(data?.recoveryRuns.length) ? <div className={styles.sectionHint}>Для {data?.recoveryRuns.length} прохождений доступен мягкий recovery.</div> : null}
    </Card>
  );
}
