'use client';

import { Card, CardHeader } from '@/shared/ui/Card/Card';
import type { PulseAchievement } from '@/shared/types/programs';
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

export function ProgramAchievementGrid({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: PulseAchievement[];
  emptyText: string;
}) {
  return (
    <Card className={styles.sectionCard}>
      <CardHeader title={title} />
      {!items.length ? <div className={styles.emptyState}>{emptyText}</div> : null}
      <div className={styles.achievementsGrid}>
        {items.map((item) => (
          <Card key={item.id} className={styles.achievementCard}>
            <div className={styles.achievementTone}>{toneLabel(item.definition.kind)}</div>
            <div className={styles.summaryLabel}>{achievementKindLabel(item.definition.kind)}</div>
            <div className={styles.sectionTitle}>{item.titleSnapshot ?? item.definition.title}</div>
            <div className={styles.sectionHint}>{item.descriptionSnapshot ?? item.definition.description ?? 'Достижение Pulse'}</div>
            {item.progressValue != null && item.progressMax != null ? (
              <div className={styles.pill}>
                {item.progressValue}/{item.progressMax}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </Card>
  );
}
