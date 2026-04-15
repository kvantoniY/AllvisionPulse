'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './FeedPage.module.css';
import { Card, CardMuted } from '@/shared/ui/Card/Card';
import type { FeedScope } from '@/shared/api/postsApi';
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
    <Card className={styles.flatCard}>
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
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();

  const paramScope = searchParams.get('scope');
  const scope: FeedScope = paramScope === 'all' ? 'all' : 'following';
  const { data, isFetching, isError } = useGetFeedQuery({ scope });
  const [fetchPage] = useLazyGetFeedQuery();

  const items = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nearEnd = useIntersection(sentinelRef, { rootMargin: '900px' });
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const setScope = (nextScope: FeedScope) => {
    if (nextScope === scope) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextScope === 'following') params.delete('scope');
    else params.set('scope', nextScope);
    const qs = params.toString();
    router.replace(qs ? `/feed?${qs}` : '/feed', { scroll: false });
  };

  useEffect(() => {
    const requestedPostId = searchParams.get('post');
    if (requestedPostId) setOpenPostId(requestedPostId);
  }, [searchParams]);

  useEffect(() => {
    if (!nearEnd || isFetching || !nextCursor) return;
    fetchPage({ cursor: nextCursor, take: 20, scope });
  }, [nearEnd, isFetching, nextCursor, fetchPage, scope]);

  const emptyFollowingHint = useMemo(() => (
    scope === 'following' && !isFetching && items.length === 0
  ), [scope, isFetching, items.length]);

  const closePostModal = () => {
    setOpenPostId(null);
    if (!searchParams.get('post')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('post');
    const next = params.toString();
    router.replace(next ? `/feed?${next}` : '/feed', { scroll: false });
  };

  return (
    <div className={["container", "appPage", isMobile ? styles.pageMobile : styles.pageDesktop].join(' ')}>
      <PostModal postId={openPostId} open={!!openPostId} onClose={closePostModal} onOpenPost={setOpenPostId} />

      <div className={styles.stack}>
        {!isMobile ? <div className={styles.eyebrow}>Главная лента</div> : null}

        <div className={styles.storiesSection}>
          <StoriesRail />
        </div>

        <div className={styles.composerSection}>
          <PostComposer context="feed" hideMobileTrigger={isMobile} surface={isMobile ? 'card' : 'flat'} />
        </div>

        <div className={styles.scopeTabs} role="tablist" aria-label="Лента">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'following'}
            className={[styles.scopeTab, scope === 'following' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setScope('following')}
          >
            Подписки
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            className={[styles.scopeTab, scope === 'all' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setScope('all')}
          >
            Лента
          </button>
        </div>

        {emptyFollowingHint ? (
          <div className={styles.messageSection}>
            <Card className={styles.flatCard}>
              <CardMuted>
                Пока нет постов от ваших подписок. <Link href="/subscriptions" className={styles.inlineLink}>Найти людей</Link> или переключитесь на «Ленту».
              </CardMuted>
            </Card>
          </div>
        ) : null}

        {isError ? (
          <div className={styles.messageSection}>
            <Card className={styles.flatCard}>
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
