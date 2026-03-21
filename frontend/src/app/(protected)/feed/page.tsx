'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { useGetFeedQuery, useLazyGetFeedQuery } from '@/shared/api/postsApi';
import { PostCard } from '@/entities/post/ui/PostCard';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { PostComposer } from '@/features/postComposer/ui/PostComposer';
import { PostModal } from '@/features/postModal/ui/PostModal';

export default function FeedPage() {
  // Infinite feed is stored in RTKQ cache under a single key
  const { data, isFetching, isError } = useGetFeedQuery(undefined);
  const [fetchPage] = useLazyGetFeedQuery();

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nearEnd = useIntersection(sentinelRef, { rootMargin: '900px' });

  const [openPostId, setOpenPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!nearEnd) return;
    if (isFetching) return;
    if (!nextCursor) return;
    fetchPage({ cursor: nextCursor, take: 20 });
  }, [nearEnd, isFetching, nextCursor, fetchPage]);

  return (
    <div className="container">
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} />
      <div style={{ display: 'grid', gap: 12 }}>
        <Card>
          <CardHeader title="Feed" />
          <CardMuted>Latest posts</CardMuted>
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
          <Card>
            <CardMuted>Loading…</CardMuted>
          </Card>
        ) : null}

        {!nextCursor && items.length ? (
          <Card>
            <CardMuted>End of feed</CardMuted>
          </Card>
        ) : null}

        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}
