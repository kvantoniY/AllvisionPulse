'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { useGetFeedQuery, useLazyGetFeedQuery } from '@/shared/api/postsApi';
import { PostCard } from '@/entities/post/ui/PostCard';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { PostComposer } from '@/features/postComposer/ui/PostComposer';
import { PostModal } from '@/features/postModal/ui/PostModal';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

function FeedCardSkeleton() {
  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Skeleton circle style={{ width: 42, height: 42 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
          <SkeletonText lines={2} />
          <Skeleton style={{ width: '100%', aspectRatio: '16 / 10' }} />
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
    <div className="container">
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} />
      <div style={{ display: 'grid', gap: 14 }}>
        <Card>
          <CardHeader title="Лента" />
          <CardMuted>Публикации друзей, обновления и контент сообщества в одном потоке.</CardMuted>
        </Card>

        <PostComposer context="feed" />

        {isError ? (
          <Card>
            <CardMuted>Не удалось загрузить ленту.</CardMuted>
          </Card>
        ) : null}

        {items.map((p) => (
          <PostCard key={p.id} post={p} onOpen={() => setOpenPostId(p.id)} />
        ))}

        {isFetching && !items.length ? (
          <>
            <FeedCardSkeleton />
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </>
        ) : null}

        {!nextCursor && items.length ? (
          <Card>
            <CardMuted>Вы дошли до конца ленты.</CardMuted>
          </Card>
        ) : null}

        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}
