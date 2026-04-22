'use client';

import { useState } from 'react';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { useListAchievementsQuery } from '@/shared/api/programsApi';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { achievementKindLabel } from './programUi';
import styles from './ProgramsShell.module.css';

function toneLabel(kind: string) {
  if (kind === 'PROGRAM_COMPLETION') return 'PC';
  if (kind === 'STAGE_COMPLETION') return 'ET';
  if (kind === 'STREAK') return 'SR';
  if (kind === 'ADHERENCE') return 'AD';
  if (kind === 'RECOVERY') return 'RC';
  if (kind === 'COLLABORATIVE') return 'CO';
  return 'PL';
}

export function ProfileAchievementsSection({ username }: { username: string }) {
  const { data, isLoading } = useListAchievementsQuery({ username });
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [];

  const emptyText = data?.canView === false
    ? 'Достижения скрыты настройками приватности.'
    : 'У пользователя пока нет достижений Pulse.';

  return (
    <>
      <Card className={[styles.sectionCard, styles.profileSectionCard].join(' ')}>
        <CardHeader
          title="Достижения Pulse"
          action={
            <Button size="sm" className={styles.profileAllButton} onClick={() => setOpen(true)}>
              Все
            </Button>
          }
        />

        {!isLoading && data?.canView === false ? (
          <div className={[styles.emptyState, styles.profileAchievementsHint].join(' ')}>
            {emptyText}
          </div>
        ) : null}

        {!isLoading && data?.canView !== false && !items.length ? (
          <div className={[styles.emptyState, styles.profileAchievementsHint].join(' ')}>
            {emptyText}
          </div>
        ) : null}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Достижения Pulse" size="xl">
        {isLoading ? <div className={styles.emptyState}>Загружаю достижения...</div> : null}

        {!isLoading && data?.canView === false ? <div className={styles.emptyState}>{emptyText}</div> : null}

        {!isLoading && data?.canView !== false && !items.length ? <div className={styles.emptyState}>{emptyText}</div> : null}

        {!isLoading && data?.canView !== false && items.length ? (
          <div className={styles.profileAchievementsModalGrid}>
            {items.map((item) => (
              <div key={item.id} className={[styles.achievementCard, styles.profileAchievementModalCard].join(' ')}>
                <div className={styles.achievementTone}>{toneLabel(item.definition.kind)}</div>
                <div className={styles.summaryLabel}>{achievementKindLabel(item.definition.kind)}</div>
                <div className={styles.profileAchievementModalTitle}>{item.titleSnapshot ?? item.definition.title}</div>
                <div className={styles.profileAchievementModalSub}>
                  {item.descriptionSnapshot ?? item.definition.description ?? 'Достижение Pulse'}
                </div>
                {item.progressValue != null && item.progressMax != null ? (
                  <div className={[styles.pill, styles.profileAchievementModalPill].join(' ')}>
                    {item.progressValue}/{item.progressMax}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
