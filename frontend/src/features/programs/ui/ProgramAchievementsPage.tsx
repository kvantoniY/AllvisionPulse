'use client';

import Link from 'next/link';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useListAchievementsQuery } from '@/shared/api/programsApi';
import { ProgramsContextBar } from './programUi';
import styles from './ProgramsShell.module.css';
import { ProgramAchievementGrid } from './ProgramAchievementGrid';

export function ProgramAchievementsPage() {
  const { data, isLoading } = useListAchievementsQuery();
  const items = data?.items ?? [];

  return (
    <div className={styles.page}>
      <ProgramsContextBar active="achievements" backHref="/health?tab=programs" backLabel="К программам" />

      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <div className={styles.metaRow}>
              <span className={[styles.pill, styles.pillAccent].join(' ')}>Pulse</span>
              <span className={styles.pill}>Профиль</span>
            </div>
            <h1 className={styles.heroTitle}>Достижения Pulse</h1>
            <p className={styles.heroSubtitle}>Здесь собираются завершения программ, серии, recovery-возвраты и совместные результаты. По желанию их можно показывать в профиле.</p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/health?tab=programs" className={styles.linkButton}>
              <Button size="sm">
                <Icon name="pulse" size={14} />
                Программы
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {isLoading ? <div className={styles.emptyState}>Загружаю достижения...</div> : null}
      {!isLoading ? (
        <ProgramAchievementGrid title="Лента достижений" items={items} emptyText={data?.canView === false ? 'Достижения скрыты настройками приватности.' : 'Достижений Pulse пока нет.'} />
      ) : null}
    </div>
  );
}
