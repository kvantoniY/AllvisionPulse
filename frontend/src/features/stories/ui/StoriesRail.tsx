'use client';

import { useGetStoriesRailQuery } from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import styles from './Stories.module.css';
import { StoryRingAvatar } from './StoryRingAvatar';
import { useStoriesUi } from './StoriesContext';

export function StoriesRail() {
  const { data, isFetching } = useGetStoriesRailQuery(undefined, { refetchOnFocus: true, refetchOnReconnect: true });
  const { data: meData } = useGetMeQuery();
  const { openCreator, openViewer } = useStoriesUi();
  const me = meData?.user;
  const items = data?.items ?? [];
  const meEntry = me ? items.find((item) => item.author.id === me.id) : null;
  const others = items.filter((item) => !item.isOwn);

  if (!me && !isFetching && !items.length) return null;

  return (
    <div className={styles.rail} aria-label="Сторис" role="group">
        {me ? (
          <div className={styles.railItem}>
            <StoryRingAvatar
              userId={me.id}
              url={me.avatarUrl}
              name={me.username}
              size={64}
              onClickOverride={() => (meEntry ? openViewer(me.id) : openCreator())}
              onAddBadgeClick={openCreator}
              showAddBadge
            />
            <span className={[styles.railName, styles.railNameActive].join(' ')}>{meEntry ? 'Мои истории' : 'Добавить'}</span>
          </div>
        ) : null}

        {isFetching && !items.length
          ? Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.railItem} aria-hidden="true">
                <Skeleton circle style={{ width: 64, height: 64 }} />
                <Skeleton style={{ width: 56, height: 12, borderRadius: 999 }} />
              </div>
            ))
          : null}

        {others.map((item) => (
          <div key={item.author.id} className={styles.railItem}>
            <StoryRingAvatar userId={item.author.id} url={item.author.avatarUrl} name={item.author.username} size={64} />
            <span
              className={[styles.railName, item.hasUnviewed ? styles.railNameActive : ''].filter(Boolean).join(' ')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {item.author.username}
              <AdminBadge role={item.author.role} />
            </span>
          </div>
        ))}
    </div>
  );
}
