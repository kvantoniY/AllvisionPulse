'use client';

import { useGetStoriesRailQuery } from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import styles from './Stories.module.css';
import { StoryRingAvatar } from './StoryRingAvatar';
import { useStoriesUi } from './StoriesContext';

export function StoriesRail() {
  const { data, isFetching } = useGetStoriesRailQuery(undefined, { pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const { data: meData } = useGetMeQuery();
  const { openCreator, openViewer } = useStoriesUi();
  const me = meData?.user;
  const items = data?.items ?? [];
  const meEntry = me ? items.find((item) => item.author.id === me.id) : null;
  const others = items.filter((item) => !item.isOwn);

  if (!me && !isFetching && !items.length) return null;

  return (
    <section className={styles.railWrap} aria-label="Сторис">
      <div className={styles.rail}>
        {me ? (
          <div className={styles.railOwnGroup}>
            {meEntry ? (
              <button type="button" className={styles.railAddSupplement} onClick={() => openCreator()} aria-label="Дополнить сторис">
                <Icon name="plus" size={18} />
              </button>
            ) : null}
            <button type="button" className={styles.railItem} onClick={() => (meEntry ? openViewer(me.id) : openCreator())}>
              <StoryRingAvatar
                userId={me.id}
                url={me.avatarUrl}
                name={me.username}
                size={64}
                disableStoryClick
                showAddBadge={!meEntry}
              />
              <span className={[styles.railName, styles.railNameActive].join(' ')}>{meEntry ? 'Мои сторис' : 'Добавить'}</span>
            </button>
          </div>
        ) : null}

        {isFetching && !items.length ? Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={styles.railItem}>
            <Skeleton circle style={{ width: 72, height: 72 }} />
            <Skeleton style={{ width: 58, height: 12, borderRadius: 999 }} />
          </div>
        )) : null}

        {others.map((item) => (
          <button key={item.author.id} type="button" className={styles.railItem} onClick={() => openViewer(item.author.id)}>
            <StoryRingAvatar userId={item.author.id} url={item.author.avatarUrl} name={item.author.username} size={64} disableStoryClick />
            <span className={[styles.railName, item.hasUnviewed ? styles.railNameActive : ''].filter(Boolean).join(' ')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{item.author.username}<AdminBadge role={item.author.role} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
