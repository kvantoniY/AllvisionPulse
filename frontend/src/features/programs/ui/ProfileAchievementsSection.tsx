'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { useListAchievementsQuery } from '@/shared/api/programsApi';
import { Button } from '@/shared/ui/Button/Button';
import { achievementKindLabel } from './programUi';
import styles from './ProgramsShell.module.css';

export function ProfileAchievementsSection({ username }: { username: string }) {
  const { data, isLoading } = useListAchievementsQuery({ username });
  const items = (data?.items ?? []).slice(0, 4);

  return (
    <Card className={styles.sectionCard}>
      <CardHeader
        title="Достижения Pulse"
        action={
          <Link href="/health/achievements" className={styles.linkButton}>
            <Button size="sm">Все</Button>
          </Link>
        }
      />

      {isLoading ? <div className={styles.emptyState}>Загружаю достижения...</div> : null}
      {!isLoading && data?.canView === false ? <div className={styles.emptyState}>Достижения скрыты настройками приватности.</div> : null}
      {!isLoading && data?.canView !== false && !items.length ? <div className={styles.emptyState}>У пользователя пока нет достижений Pulse.</div> : null}

      <div className={styles.list}>
        {items.map((item) => (
          <div key={item.id} className={styles.actionRow}>
            <div className={styles.actionMeta}>
              <div className={styles.actionTitle}>{item.titleSnapshot ?? item.definition.title}</div>
              <div className={styles.actionSub}>{item.descriptionSnapshot ?? item.definition.description ?? 'Достижение Pulse'}</div>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.pill}>{achievementKindLabel(item.definition.kind)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
