'use client';

import { useGetStoriesRailQuery } from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton';
import styles from './Stories.module.css';
import { StoryRingAvatar } from './StoryRingAvatar';
import { useStoriesUi } from './StoriesContext';

export function StoriesRail() {
  const { data, isFetching } = useGetStoriesRailQuery(undefined, { pollingInterval: 30000, refetchOnFocus: true });
  const { data: meData } = useGetMeQuery();
  const { openCreator, openViewer } = useStoriesUi();
  const me = meData?.user;
  const items = data?.items ?? [];
  const meEntry = me ? items.find((item) => item.author.id === me.id) : null;
  const others = items.filter((item) => !item.isOwn);

  if (!me && !isFetching && !items.length) return null;

  return (
    <div className={styles.railWrap}>
      <div className={styles.rail}>
        {me ? (
          <button type="button" className={styles.railItem} onClick={() => (meEntry ? openViewer(me.id) : openCreator())}>
            <StoryRingAvatar
              userId={me.id}
              url={me.avatarUrl}
              name={me.username}
              size={62}
              disableStoryClick
              showAddBadge={!meEntry}
            />
            <span className={[styles.railName, styles.railNameActive].join(' ')}>{meEntry ? 'Мои сторис' : 'Добавить'}</span>
          </button>
        ) : null}

        {isFetching && !items.length ? Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={styles.railItem}>
            <Skeleton circle style={{ width: 68, height: 68 }} />
            <Skeleton style={{ width: 58, height: 12, borderRadius: 999 }} />
          </div>
        )) : null}

        {others.map((item) => (
          <button key={item.author.id} type="button" className={styles.railItem} onClick={() => openViewer(item.author.id)}>
            <StoryRingAvatar userId={item.author.id} url={item.author.avatarUrl} name={item.author.username} size={62} disableStoryClick />
            <span className={[styles.railName, item.hasUnviewed ? styles.railNameActive : ''].filter(Boolean).join(' ')}>{item.author.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
