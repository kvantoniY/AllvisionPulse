'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './FeedPage.module.css';
import { Card, CardMuted } from '@/shared/ui/Card/Card';
import { useGetFeedQuery, useLazyGetFeedQuery } from '@/shared/api/postsApi';
import { PostCard } from '@/entities/post/ui/PostCard';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { PostComposer } from '@/features/postComposer/ui/PostComposer';
import { PostModal } from '@/features/postModal/ui/PostModal';
import { StoriesRail } from '@/features/stories';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';

function FeedCardSkeleton() {
  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Skeleton circle style={{ width: 42, height: 42 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
          <SkeletonText lines={2} />
          <Skeleton style={{ width: '100%', aspectRatio: '4 / 5' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton style={{ width: 36, height: 36 }} />
            <Skeleton style={{ width: 36, height: 36 }} />
            <Skeleton style={{ width: 36, height: 36 }} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function FeedPage() {
  const { data, isFetching, isError } = useGetFeedQuery(undefined);
  const [fetchPage] = useLazyGetFeedQuery();
  const isMobile = useIsMobile();

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nearEnd = useIntersection(sentinelRef, { rootMargin: '900px' });
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!nearEnd || isFetching || !nextCursor) return;
    fetchPage({ cursor: nextCursor, take: 20 });
  }, [nearEnd, isFetching, nextCursor, fetchPage]);

  return (
    <div className={["container", "appPage", isMobile ? styles.pageMobile : styles.pageDesktop].join(' ')}>
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} onOpenPost={setOpenPostId} />

      <div className={styles.stack}>
        {!isMobile ? <div className={styles.eyebrow}>Главная лента</div> : null}

        <div className={styles.storiesSection}>
          <StoriesRail />
        </div>

        <div className={styles.composerSection}>
          <PostComposer context="feed" hideMobileTrigger={isMobile} surface={isMobile ? 'card' : 'flat'} />
        </div>

        {isError ? (
          <div className={styles.messageSection}>
            <Card>
              <CardMuted>Не удалось загрузить ленту.</CardMuted>
            </Card>
          </div>
        ) : null}

        {items.map((p) => (
          <PostCard key={p.id} post={p} onOpenPost={setOpenPostId} surface={isMobile ? 'card' : 'flat'} />
        ))}

        {isFetching && !items.length ? (
          <>
            <FeedCardSkeleton />
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </>
        ) : null}

        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}
