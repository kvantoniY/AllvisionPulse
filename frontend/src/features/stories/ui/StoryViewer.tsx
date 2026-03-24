'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeleteStoryMutation, useGetStoriesRailQuery, useGetStoryViewersQuery, useGetUserStoriesQuery, useMarkStoryViewedMutation } from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import { StoryRingAvatar } from './StoryRingAvatar';
import styles from './Stories.module.css';

function formatStoryTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}

function renderStoryOverlay(item: any) {
  const commonStyle = {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.w}%`,
    height: `${item.h}%`,
  } as const;

  if (item.type === 'text') {
    return (
      <div key={item.id} className={[styles.viewerOverlayItem, styles.viewerTextItem].join(' ')} style={{ ...commonStyle, color: item.color ?? '#fff', fontSize: item.fontSize ?? 22, textAlign: item.align ?? 'left' as any }}>
        {item.text}
      </div>
    );
  }

  if (item.type === 'widget') {
    return (
      <div key={item.id} className={[styles.viewerOverlayItem, styles.viewerWidgetItem].join(' ')} style={commonStyle}>
        <div className={styles.viewerWidgetTitle}>{item.title}</div>
        <div className={styles.viewerWidgetValue}>{String(item.payload?.primary ?? item.payload?.score ?? '—')}</div>
        <div className={styles.viewerWidgetSub}>{String(item.payload?.secondary ?? item.payload?.hint ?? '')}</div>
      </div>
    );
  }

  if (item.type === 'image') {
    return (
      <div key={item.id} className={[styles.viewerOverlayItem, styles.viewerImageItem].join(' ')} style={{ ...commonStyle, borderRadius: `${item.radius ?? 22}px` }}>
        <img src={item.src} alt="Элемент сторис" />
      </div>
    );
  }

  return null;
}

export function StoryViewer({
  viewer,
  onChangeViewer,
  onClose,
}: {
  viewer: { userId: string; storyId?: string | null } | null;
  onChangeViewer: (next: { userId: string; storyId?: string | null } | null) => void;
  onClose: () => void;
}) {
  const open = Boolean(viewer?.userId);
  const { data: meData } = useGetMeQuery();
  const { data: railData } = useGetStoriesRailQuery(undefined, { skip: !open });
  const { data, isFetching } = useGetUserStoriesQuery({ userId: viewer?.userId ?? '' }, { skip: !open || !viewer?.userId, pollingInterval: 30000 });
  const [markViewed] = useMarkStoryViewedMutation();
  const [deleteStory, deleteState] = useDeleteStoryMutation();
  const me = meData?.user;
  const items = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const current = items[index] ?? null;
  const isOwn = current?.authorId === me?.id;
  const { data: viewersData } = useGetStoryViewersQuery({ storyId: current?.id ?? '' }, { skip: !viewersOpen || !current || !isOwn });

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setProgress(0);
      setPaused(false);
      setViewersOpen(false);
      return;
    }
    const targetIndex = viewer?.storyId ? items.findIndex((item) => item.id === viewer.storyId) : 0;
    setIndex(targetIndex >= 0 ? targetIndex : 0);
    setProgress(0);
    setViewersOpen(false);
  }, [open, viewer?.storyId, viewer?.userId, items]);

  useEffect(() => {
    if (!current || !open || !viewer?.userId) return;
    if (current.authorId === me?.id || current.viewedByMe) return;
    void markViewed({ storyId: current.id }).unwrap().catch(() => null);
  }, [current?.id, current?.authorId, current?.viewedByMe, markViewed, me?.id, open, viewer?.userId]);

  const goToUser = useCallback((direction: 1 | -1) => {
    if (!viewer?.userId) return onClose();
    const rail = railData?.items ?? [];
    const currentUserIndex = rail.findIndex((item) => item.author.id === viewer.userId);
    if (currentUserIndex === -1) return onClose();
    const nextEntry = rail[currentUserIndex + direction];
    if (!nextEntry) return onClose();
    const targetStoryId = direction === -1 ? nextEntry.storyIds[nextEntry.storyIds.length - 1] : nextEntry.storyIds[0];
    onChangeViewer({ userId: nextEntry.author.id, storyId: targetStoryId });
  }, [onChangeViewer, onClose, railData?.items, viewer?.userId]);

  const goNext = useCallback(() => {
    if (!items.length) return;
    if (index < items.length - 1) {
      setIndex((prev) => prev + 1);
      setProgress(0);
      return;
    }
    goToUser(1);
  }, [goToUser, index, items.length]);

  const goPrev = useCallback(() => {
    if (!items.length) return;
    if (progress > 0.12) {
      setProgress(0);
      return;
    }
    if (index > 0) {
      setIndex((prev) => prev - 1);
      setProgress(0);
      return;
    }
    goToUser(-1);
  }, [goToUser, index, items.length, progress]);

  useEffect(() => {
    if (!open || !current || paused || viewersOpen) return;
    if (current.mediaType?.startsWith('video/') && videoRef.current) {
      const play = videoRef.current.play();
      if (play && typeof play.catch === 'function') play.catch(() => null);
    }
    const duration = Math.max(1200, Number(current.durationMs ?? (current.mediaType?.startsWith('video/') ? 15000 : 8000)));
    const startedAt = performance.now() - progress * duration;
    let raf = 0;
    const tick = () => {
      const next = Math.min(1, (performance.now() - startedAt) / duration);
      setProgress(next);
      if (next >= 1) {
        goNext();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [current?.id, current?.durationMs, current?.mediaType, goNext, open, paused, progress, viewersOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose, open]);

  const handleDelete = async () => {
    if (!current) return;
    await deleteStory({ storyId: current.id }).unwrap().catch(() => null);
    if (items.length > 1 && index < items.length - 1) {
      setIndex((prev) => prev + 1);
      setProgress(0);
      return;
    }
    if (items.length > 1 && index > 0) {
      setIndex((prev) => Math.max(0, prev - 1));
      setProgress(0);
      return;
    }
    goToUser(1);
  };

  if (!open) return null;

  return (
    <div className={styles.viewerBackdrop} role="dialog" aria-modal="true">
      <div className={styles.viewer}>
        <div className={styles.viewerInner}>
          <div className={styles.viewerTop}>
            <div className={styles.viewerProgress}>
              {items.map((item, itemIndex) => {
                const value = itemIndex < index ? 1 : itemIndex === index ? progress : 0;
                return (
                  <div key={item.id} className={styles.viewerSegment}>
                    <div className={styles.viewerSegmentFill} style={{ transform: `scaleX(${value})` }} />
                  </div>
                );
              })}
            </div>

            <div className={styles.viewerMeta}>
              <StoryRingAvatar userId={current?.author.id} url={current?.author.avatarUrl} name={current?.author.username} size={40} disableStoryClick />
              <div className={styles.viewerMetaText}>
                <div className={styles.viewerName}>{current?.author.username ?? 'Сторис'}</div>
                <div className={styles.viewerTime}>{current ? formatStoryTime(current.createdAt) : 'Загрузка…'}</div>
              </div>
              {isOwn ? (
                <button type="button" className={styles.viewerDeleteButton} onClick={handleDelete} disabled={deleteState.isLoading} aria-label="Удалить сторис">
                  <Icon name="trash" size={18} />
                </button>
              ) : null}
              <button type="button" className={styles.viewerClose} onClick={onClose} aria-label="Закрыть">
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>

          {current?.mediaType?.startsWith('video/') ? (
            <video
              ref={videoRef}
              key={current.id}
              className={styles.viewerMediaVideo}
              src={current.mediaUrl}
              autoPlay
              muted={false}
              playsInline
              onEnded={goNext}
            />
          ) : current ? (
            <img key={current.id} className={styles.viewerMedia} src={current.mediaUrl} alt="Сторис" />
          ) : (
            <div className={styles.creatorCanvasEmpty}>{isFetching ? 'Загрузка сторис…' : 'Сторис недоступны'}</div>
          )}

          {(current?.itemsJson ?? []).map((item: any) => renderStoryOverlay(item))}

          <div className={styles.viewerZones}>
            <button
              type="button"
              className={styles.viewerZone}
              onClick={goPrev}
              onMouseDown={() => setPaused(true)}
              onMouseUp={() => setPaused(false)}
              onTouchStart={() => setPaused(true)}
              onTouchEnd={() => setPaused(false)}
              aria-label="Предыдущая сторис"
            />
            <button
              type="button"
              className={styles.viewerZone}
              onClick={goNext}
              onMouseDown={() => setPaused(true)}
              onMouseUp={() => setPaused(false)}
              onTouchStart={() => setPaused(true)}
              onTouchEnd={() => setPaused(false)}
              aria-label="Следующая сторис"
            />
          </div>

          <div className={styles.viewerFooter}>
            <div className={styles.viewerHint}>Нажмите слева или справа для навигации</div>
            {isOwn && current ? (
              <div className={styles.viewerStats}>
                <button type="button" className={styles.viewerStatButton} onClick={() => setViewersOpen((prev) => !prev)} aria-label="Кто посмотрел">
                  <Icon name="users" size={16} />
                </button>
                <div className={styles.viewerHint}>{current.viewsCount} просмотров</div>
              </div>
            ) : null}
          </div>

          {viewersOpen && current ? (
            <div className={styles.viewerSheet}>
              <div className={styles.viewerSheetHeader}>
                <div className={styles.viewerSheetTitle}>Просмотры · {viewersData?.count ?? current.viewsCount}</div>
                <button type="button" className={styles.viewerClose} onClick={() => setViewersOpen(false)} aria-label="Закрыть список просмотров">
                  <Icon name="close" size={16} />
                </button>
              </div>
              {(viewersData?.items ?? []).map((item) => (
                <div key={item.id} className={styles.viewerViewerRow}>
                  <StoryRingAvatar userId={item.viewer.id} url={item.viewer.avatarUrl} name={item.viewer.username} size={40} />
                  <div className={styles.viewerViewerMeta}>
                    <div className={styles.viewerViewerName}>{item.viewer.username}</div>
                    <div className={styles.viewerViewerTime}>{formatStoryTime(item.viewedAt)}</div>
                  </div>
                </div>
              ))}
              {viewersData && !viewersData.items.length ? <div className={styles.viewerHint}>Пока никто не посмотрел.</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
