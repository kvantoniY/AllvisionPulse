'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { CardMuted } from '@/shared/ui/Card/Card';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { MediaPlaceholder } from '@/shared/ui/MediaPlaceholder/MediaPlaceholder';
import { StoryRingAvatar } from './StoryRingAvatar';
import {
  useAddStoryToHighlightMutation,
  useCreateHighlightMutation,
  useDeleteHighlightMutation,
  useDeleteStoryMutation,
  useGetStoriesArchiveQuery,
  useGetStoryHighlightsQuery,
  useGetStoryViewersQuery,
  useGetUserStoriesQuery,
  useRemoveStoryFromHighlightMutation,
  useUpdateHighlightMutation,
} from '@/shared/api/storiesApi';
import type { StoryEditorItem, StoryHighlight, StoryItem } from '@/shared/types/story';
import styles from './Stories.module.css';

function Preview({ item }: { item: StoryItem }) {
  if (item.mediaType.startsWith('video/')) {
    return <video src={item.mediaUrl} playsInline muted loop autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <img src={item.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}

function formatStoryTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}

function getDurationMs(story: StoryItem | null) {
  if (!story) return 8000;
  const start = Number(story.trimStartMs ?? 0);
  const end = Number(story.trimEndMs ?? story.durationMs ?? (story.mediaType.startsWith('video/') ? 15000 : 8000));
  return Math.max(1000, end - start);
}

function getMediaStyle(story: StoryItem | null): CSSProperties {
  const transform = story?.transformJson ?? {};
  const scale = Number(transform.scale ?? 1);
  const scaleX = Number(transform.scaleX ?? scale);
  const scaleY = Number(transform.scaleY ?? scale);
  const rotation = Number(transform.rotation ?? 0);
  const offsetX = Number(transform.offsetX ?? 0);
  const offsetY = Number(transform.offsetY ?? 0);
  return {
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
    objectFit: transform.fitMode === 'cover' ? ('cover' as const) : ('contain' as const),
  };
}

function renderStoryOverlay(item: StoryEditorItem) {
  const commonStyle = {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.w}%`,
    height: `${item.h}%`,
  } as const;

  if (item.type === 'text') {
    return (
      <div
        key={item.id}
        className={[styles.viewerOverlayItem, styles.viewerTextItem].join(' ')}
        style={{
          ...commonStyle,
          color: item.color ?? '#fff',
          fontSize: item.fontSize ?? 22,
          textAlign: (item.align ?? 'left') as CSSProperties['textAlign'],
        }}
      >
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

export function ProfileStoriesPanel({ userId, isSelf, embedded = false }: { userId: string; isSelf: boolean; embedded?: boolean }) {
  const { data: highlightsData } = useGetStoryHighlightsQuery({ userId }, { refetchOnFocus: true, refetchOnReconnect: true });
  const { data: archiveData } = useGetStoriesArchiveQuery(undefined, { skip: !isSelf, refetchOnFocus: true, refetchOnReconnect: true });
  const { data: liveStoriesData } = useGetUserStoriesQuery({ userId }, { skip: !isSelf, refetchOnFocus: true, refetchOnReconnect: true });
  const [createHighlight, createState] = useCreateHighlightMutation();
  const [updateHighlight] = useUpdateHighlightMutation();
  const [deleteHighlight] = useDeleteHighlightMutation();
  const [addToHighlight] = useAddStoryToHighlightMutation();
  const [removeFromHighlight] = useRemoveStoryFromHighlightMutation();
  const [deleteStory] = useDeleteStoryMutation();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedHighlight, setSelectedHighlight] = useState<StoryHighlight | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [manageHighlight, setManageHighlight] = useState(false);
  const [manageTab, setManageTab] = useState<'selected' | 'stories'>('selected');
  const [highlightProgress, setHighlightProgress] = useState(0);
  const [highlightPaused, setHighlightPaused] = useState(false);
  const [highlightUiHidden, setHighlightUiHidden] = useState(false);
  const [highlightViewersOpen, setHighlightViewersOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<StoryItem | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [manageTitle, setManageTitle] = useState('');
  const [archiveSelection, setArchiveSelection] = useState<Record<string, string>>({});
  const [createSelectedIds, setCreateSelectedIds] = useState<string[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdRef = useRef<{ timeoutId: number | null; held: boolean }>({ timeoutId: null, held: false });
  const cleanupRef = useRef<Set<string>>(new Set());
  const pendingPopulateRef = useRef<Set<string>>(new Set());
  const allHighlights = highlightsData?.items ?? [];
  const archiveItems = archiveData?.items ?? [];
  const liveStories = liveStoriesData?.items ?? [];
  const highlights = useMemo(() => allHighlights.filter((item) => item.count > 0 && item.items.length > 0), [allHighlights]);
  const emptyHighlights = useMemo(() => isSelf ? allHighlights.filter((item) => item.count === 0 || item.items.length === 0) : [], [allHighlights, isSelf]);
  const totalCount = useMemo(() => highlights.reduce((sum, item) => sum + item.count, 0), [highlights]);
  const availableCreateItems = useMemo(() => {
    const map = new Map<string, StoryItem>();
    for (const item of [...liveStories, ...archiveItems]) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [archiveItems, liveStories]);
  const currentHighlightItem = selectedHighlight?.items[highlightIndex] ?? null;
  const currentTrimStart = Number(currentHighlightItem?.trimStartMs ?? 0) / 1000;
  const currentTrimEnd = Number(currentHighlightItem?.trimEndMs ?? currentHighlightItem?.durationMs ?? getDurationMs(currentHighlightItem)) / 1000;
  const { data: highlightViewersData } = useGetStoryViewersQuery(
    { storyId: currentHighlightItem?.id ?? '' },
    { skip: !highlightViewersOpen || !currentHighlightItem || !isSelf, refetchOnFocus: true, refetchOnReconnect: true },
  );
  const manageCandidateItems = useMemo(() => {
    if (!selectedHighlight) return [];
    const selectedIds = new Set(selectedHighlight.items.map((item) => item.id));
    const map = new Map<string, StoryItem>();
    for (const item of [...archiveItems, ...liveStories]) {
      if (!selectedIds.has(item.id) && !map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [archiveItems, liveStories, selectedHighlight]);

  useEffect(() => {
    if (!selectedHighlight) return;
    const fresh = highlights.find((item) => item.id === selectedHighlight.id) ?? null;
    setSelectedHighlight(fresh);
    if (fresh && highlightIndex > fresh.items.length - 1) {
      setHighlightIndex(Math.max(0, fresh.items.length - 1));
    }
  }, [highlightIndex, highlights, selectedHighlight?.id]);

  useEffect(() => {
    if (!selectedHighlight) {
      setHighlightProgress(0);
      setHighlightPaused(false);
      setHighlightUiHidden(false);
      setHighlightViewersOpen(false);
      setManageHighlight(false);
      setManageTab('selected');
      setManageTitle('');
    }
  }, [selectedHighlight]);

  useEffect(() => {
    if (!isSelf || !emptyHighlights.length) return;
    emptyHighlights.forEach((highlight) => {
      if (cleanupRef.current.has(highlight.id) || pendingPopulateRef.current.has(highlight.id)) return;
      cleanupRef.current.add(highlight.id);
      deleteHighlight({ highlightId: highlight.id }).unwrap().catch(() => null).finally(() => {
        cleanupRef.current.delete(highlight.id);
      });
    });
  }, [deleteHighlight, emptyHighlights, isSelf]);

  useEffect(() => {
    setMediaLoaded(false);
  }, [currentHighlightItem?.id]);

  const goNext = useCallback(() => {
    if (!selectedHighlight) return;
    if (highlightIndex < selectedHighlight.items.length - 1) {
      setHighlightIndex((value) => value + 1);
      setHighlightProgress(0);
      return;
    }
    setHighlightProgress(1);
  }, [highlightIndex, selectedHighlight]);

  const goPrev = useCallback(() => {
    if (!selectedHighlight) return;
    if (highlightProgress > 0.12) {
      setHighlightProgress(0);
      if (videoRef.current && currentHighlightItem?.mediaType.startsWith('video/')) {
        videoRef.current.currentTime = currentTrimStart;
      }
      return;
    }
    if (highlightIndex > 0) {
      setHighlightIndex((value) => value - 1);
      setHighlightProgress(0);
    }
  }, [currentHighlightItem?.mediaType, currentTrimStart, highlightIndex, highlightProgress, selectedHighlight]);

  useEffect(() => {
    if (!currentHighlightItem || highlightPaused || manageHighlight || highlightViewersOpen || !mediaLoaded) return;
    const duration = getDurationMs(currentHighlightItem);
    const startedAt = performance.now() - highlightProgress * duration;
    let raf = 0;
    const tick = () => {
      const next = Math.min(1, (performance.now() - startedAt) / duration);
      setHighlightProgress(next);
      if (next >= 1) {
        if (selectedHighlight && highlightIndex < selectedHighlight.items.length - 1) {
          setHighlightIndex((value) => value + 1);
          setHighlightProgress(0);
        }
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [currentHighlightItem?.id, highlightIndex, highlightPaused, highlightProgress, highlightViewersOpen, manageHighlight, mediaLoaded, selectedHighlight]);

  useEffect(() => {
    if (!videoRef.current || !currentHighlightItem?.mediaType.startsWith('video/')) return;
    const video = videoRef.current;
    const syncStart = () => {
      if (Math.abs(video.currentTime - currentTrimStart) > 0.25) {
        video.currentTime = currentTrimStart;
      }
      if (!highlightPaused && !manageHighlight && !highlightViewersOpen && mediaLoaded) {
        const play = video.play();
        if (play && typeof play.catch === 'function') play.catch(() => null);
      } else {
        video.pause();
      }
    };
    syncStart();
  }, [currentHighlightItem?.id, currentHighlightItem?.mediaType, currentTrimStart, highlightPaused, highlightViewersOpen, manageHighlight, mediaLoaded]);

  useEffect(() => {
    if (!selectedHighlight) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedHighlight(null);
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, selectedHighlight]);

  const startHighlightHold = () => {
    if (holdRef.current.timeoutId) window.clearTimeout(holdRef.current.timeoutId);
    holdRef.current.held = false;
    holdRef.current.timeoutId = window.setTimeout(() => {
      holdRef.current.held = true;
      setHighlightPaused(true);
      setHighlightUiHidden(true);
    }, 160);
  };

  const releaseHighlightHold = (direction: 'prev' | 'next', shouldNavigate = true) => {
    if (holdRef.current.timeoutId) {
      window.clearTimeout(holdRef.current.timeoutId);
      holdRef.current.timeoutId = null;
    }
    const held = holdRef.current.held;
    holdRef.current.held = false;
    if (held) {
      setHighlightPaused(false);
      setHighlightUiHidden(false);
      return;
    }
    if (!shouldNavigate) return;
    if (direction === 'prev') goPrev();
    else goNext();
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateTitle('');
    setCreateSelectedIds([]);
  };

  const toggleCreateSelection = (storyId: string) => {
    setCreateSelectedIds((prev) => (
      prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId]
    ));
  };

  const handleCreateHighlight = async () => {
    const title = createTitle.trim();
    if (!title || !createSelectedIds.length) return;
    const result = await createHighlight({ title }).unwrap().catch(() => null);
    const highlightId = result?.highlight?.id;
    if (!highlightId) return;
    pendingPopulateRef.current.add(highlightId);
    try {
      for (const storyId of createSelectedIds) {
        await addToHighlight({ storyId, highlightId }).unwrap().catch(() => null);
      }
      closeCreateModal();
    } finally {
      pendingPopulateRef.current.delete(highlightId);
    }
  };

  const openManageHighlight = () => {
    if (!selectedHighlight) return;
    setManageTab('selected');
    setManageTitle(selectedHighlight.title);
    setManageHighlight(true);
  };

  const handleRenameHighlight = async () => {
    if (!selectedHighlight || !manageTitle.trim()) return;
    await updateHighlight({ highlightId: selectedHighlight.id, title: manageTitle.trim() }).unwrap().catch(() => null);
    setManageTitle('');
  };

  const handleDeleteHighlight = async () => {
    if (!selectedHighlight) return;
    await deleteHighlight({ highlightId: selectedHighlight.id }).unwrap().catch(() => null);
    setSelectedHighlight(null);
  };

  const currentAuthor = currentHighlightItem?.author ?? null;
  const highlightMeta = currentHighlightItem
    ? `${selectedHighlight?.title ?? ''} · ${formatStoryTime(currentHighlightItem.createdAt)}`
    : '';

  return (
    <div className={[styles.profilePanel, embedded ? styles.profilePanelEmbedded : ''].filter(Boolean).join(' ')}>
      <div className={[styles.profileSectionHeader, embedded ? styles.profileSectionHeaderEmbedded : ''].filter(Boolean).join(' ')}>
        <div className={styles.profileTitle}>Моменты {totalCount ? <span className={styles.profileCount}>{totalCount}</span> : null}</div>
        {isSelf ? (
          <div className={styles.profileSectionActions}>
            <Button size="sm" onClick={() => setArchiveOpen(true)}>Архив</Button>
          </div>
        ) : null}
      </div>

      <div className={[styles.profileRail, embedded ? styles.profileRailEmbedded : ''].filter(Boolean).join(' ')}>
        {isSelf ? (
          <button
            type="button"
            onClick={() => {
              setCreateTitle('');
              setCreateSelectedIds([]);
              setCreateOpen(true);
            }}
            className={styles.profileHighlightButton}
          >
            <span className={[styles.profileHighlightThumbOuter, styles.profileAddThumbOuter].join(' ')}>
              <span className={[styles.profileHighlightThumbInner, styles.profileAddThumbInner].join(' ')}>+</span>
            </span>
            <span className={styles.profileHighlightLabel}>Добавить</span>
          </button>
        ) : null}

        {highlights.map((highlight) => (
          <button
            key={highlight.id}
            type="button"
            onClick={() => {
              setSelectedHighlight(highlight);
              setHighlightIndex(0);
              setHighlightProgress(0);
              setManageHighlight(false);
              setManageTab('selected');
            }}
            className={styles.profileHighlightButton}
          >
            <span className={styles.profileHighlightThumbOuter}>
              <span className={styles.profileHighlightThumbInner}>
                {highlight.cover?.mediaUrl ? (
                  highlight.cover.mediaType.startsWith('video/')
                    ? <video src={highlight.cover.mediaUrl} playsInline muted className={styles.profileHighlightMedia} />
                    : <img src={highlight.cover.mediaUrl} alt={highlight.title} className={styles.profileHighlightMedia} />
                ) : null}
              </span>
            </span>
            <span className={styles.profileHighlightLabel}>{highlight.title}</span>
          </button>
        ))}
      </div>

      {!highlights.length ? (
        <div className={[styles.profileEmptyHint, embedded ? styles.profileEmptyHintEmbedded : ''].filter(Boolean).join(' ')}>
          <CardMuted>{isSelf ? 'После 24 часов сторис будут попадать в архив. Из архива можно собрать актуальное.' : 'Актуального пока нет.'}</CardMuted>
        </div>
      ) : null}

      <Modal open={createOpen} onClose={closeCreateModal} title="Новое актуальное" size="lg">
        <div className={styles.createHighlightBody}>
          <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Название" maxLength={80} className={styles.createHighlightInput} />
          <div className={styles.createHighlightSummary}>
            <span>Выбрано сторис: {createSelectedIds.length}</span>
            <span>{createSelectedIds.length ? 'Новый момент соберётся только из отмеченных карточек.' : 'Выберите сторис, которые войдут в актуальное.'}</span>
          </div>
          {availableCreateItems.length ? (
            <div className={styles.createHighlightGrid}>
              {availableCreateItems.map((item) => {
                const active = createSelectedIds.includes(item.id);
                const activeIndex = createSelectedIds.indexOf(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCreateSelection(item.id)}
                    className={[styles.createHighlightItem, active ? styles.createHighlightItemActive : ''].filter(Boolean).join(' ')}
                  >
                    <span className={[styles.createHighlightBadge, active ? styles.createHighlightBadgeActive : ''].filter(Boolean).join(' ')}>
                      {active ? activeIndex + 1 : ''}
                    </span>
                    <span className={styles.createHighlightPreview}>
                      <Preview item={item} />
                      {active ? <span className={styles.createHighlightOverlay} /> : null}
                    </span>
                    <span className={styles.createHighlightMeta}>
                      <span className={styles.createHighlightDate}>{new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                      <span className={[styles.createHighlightCheck, active ? styles.createHighlightCheckActive : ''].filter(Boolean).join(' ')}>
                        {active ? 'Выбрано' : 'Выбрать'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <CardMuted>Нет сторис, которые можно добавить в актуальное.</CardMuted>
          )}
          <Button variant="primary" onClick={handleCreateHighlight} loading={createState.isLoading} disabled={!createTitle.trim() || !createSelectedIds.length}>Создать актуальное</Button>
        </div>
      </Modal>

      <Modal open={archiveOpen} onClose={() => setArchiveOpen(false)} title="Архив сторис" size="xl">
        <div style={{ display: 'grid', gap: 14 }}>
          {!archiveItems.length ? <CardMuted>В архиве пока пусто.</CardMuted> : null}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {archiveItems.map((item) => {
              const selected = archiveSelection[item.id] ?? '';
              return (
                <div key={item.id} style={{ display: 'grid', gap: 10, borderRadius: 22, background: 'var(--panel)', border: '1px solid var(--stroke-soft)', boxShadow: 'var(--shadow-xs)', padding: 12 }}>
                  <button type="button" onClick={() => setPreviewItem(item)} style={{ border: 'none', padding: 0, background: 'transparent', borderRadius: 18, overflow: 'hidden', aspectRatio: '9 / 16' }}>
                    <Preview item={item} />
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
                  <select value={selected} onChange={(event) => setArchiveSelection((prev) => ({ ...prev, [item.id]: event.target.value }))} style={{ width: '100%', height: 40, borderRadius: 12, background: '#F1E6C5', color: 'var(--text)', border: '1px solid var(--stroke-soft)', padding: '0 10px' }}>
                    <option value="">Выбрать актуальное</option>
                    {highlights.map((highlight) => <option key={highlight.id} value={highlight.id}>{highlight.title}</option>)}
                  </select>
                  {item.highlightIds?.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item.highlightIds.map((highlightId) => {
                        const currentHighlight = highlights.find((highlight) => highlight.id === highlightId);
                        if (!currentHighlight) return null;
                        return (
                          <button key={highlightId} type="button" onClick={() => removeFromHighlight({ storyId: item.id, highlightId }).unwrap().catch(() => null)} style={{ border: '1px solid var(--stroke-soft)', background: 'rgba(255,255,255,.78)', color: 'var(--text-soft)', borderRadius: 999, padding: '4px 10px', fontSize: 11 }}>
                            {currentHighlight.title} · убрать
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={() => selected ? addToHighlight({ storyId: item.id, highlightId: selected }).unwrap().catch(() => null) : null} disabled={!selected}>В актуальное</Button>
                    <Button size="sm" onClick={() => deleteStory({ storyId: item.id }).unwrap().catch(() => null)}>Удалить</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {selectedHighlight && currentHighlightItem ? (
        <div className={styles.viewerBackdrop} role="dialog" aria-modal="true">
          <div className={styles.viewer}>
            <div className={styles.viewerInner}>
              <div key={currentHighlightItem.id} className={styles.viewerStage}>
                <div className={styles.viewerMediaBackdrop} style={{ background: currentHighlightItem.transformJson?.backgroundFill ?? 'var(--bg-canvas)' }} />
                <div className={styles.viewerMediaBlurFrame}>
                  {currentHighlightItem.mediaType.startsWith('video/') ? (
                    <video className={styles.viewerMediaBlurVideo} src={currentHighlightItem.mediaUrl} playsInline muted preload="auto" style={{ objectFit: 'cover' }} />
                  ) : (
                    <img className={styles.viewerMediaBlur} src={currentHighlightItem.mediaUrl} alt="Фон актуального" style={{ objectFit: 'cover' }} />
                  )}
                </div>
                <div className={styles.viewerMediaFrame}>
                  {currentHighlightItem.mediaType.startsWith('video/') ? (
                    <video
                      ref={videoRef}
                      className={styles.viewerMediaVideo}
                      src={currentHighlightItem.mediaUrl}
                      playsInline
                      muted={false}
                      preload="auto"
                      onLoadedMetadata={(event) => {
                        const target = event.currentTarget;
                        if (Math.abs(target.currentTime - currentTrimStart) > 0.25) target.currentTime = currentTrimStart;
                      }}
                      onCanPlay={() => setMediaLoaded(true)}
                      onTimeUpdate={(event) => {
                        if (event.currentTarget.currentTime >= currentTrimEnd - 0.05) {
                          goNext();
                        }
                      }}
                      style={getMediaStyle(currentHighlightItem)}
                    />
                  ) : (
                    <img
                      className={styles.viewerMedia}
                      src={currentHighlightItem.mediaUrl}
                      alt="Актуальное"
                      style={getMediaStyle(currentHighlightItem)}
                      ref={(node) => { if (node?.complete && node.naturalWidth > 0) setMediaLoaded(true); }}
                      onLoad={() => setMediaLoaded(true)}
                      onError={() => setMediaLoaded(true)}
                    />
                  )}
                  <MediaPlaceholder loaded={mediaLoaded} />
                </div>

                {(currentHighlightItem.itemsJson ?? []).map((item) => renderStoryOverlay(item as StoryEditorItem))}
              </div>

              <div className={[styles.viewerTop, highlightUiHidden ? styles.viewerUiHidden : ''].filter(Boolean).join(' ')}>
                <div className={styles.viewerProgress}>
                  {selectedHighlight.items.map((item, itemIndex) => {
                    const value = itemIndex < highlightIndex ? 1 : itemIndex === highlightIndex ? highlightProgress : 0;
                    return (
                      <div key={item.id} className={styles.viewerSegment}>
                        <div className={styles.viewerSegmentFill} style={{ transform: `scaleX(${value})` }} />
                      </div>
                    );
                  })}
                </div>
                <div className={styles.viewerMeta}>
                  <StoryRingAvatar userId={currentAuthor?.id ?? userId} url={currentAuthor?.avatarUrl ?? null} name={currentAuthor?.username ?? selectedHighlight.title} size={38} disableStoryClick />
                  <div className={styles.viewerMetaText}>
                    <div className={styles.viewerName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {currentAuthor?.username ?? selectedHighlight.title}
                      <AdminBadge role={currentAuthor?.role} username={currentAuthor?.username ?? selectedHighlight.title} />
                    </div>
                    <div className={styles.viewerTime}>{highlightMeta}</div>
                  </div>
                  {isSelf ? (
                    <button type="button" className={styles.viewerDeleteButton} onClick={openManageHighlight} aria-label="Управлять актуальным">
                      <Icon name="dots" size={18} />
                    </button>
                  ) : null}
                  <button type="button" className={styles.viewerClose} onClick={() => setSelectedHighlight(null)} aria-label="Закрыть актуальное">
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.viewerZones}>
                <button
                  type="button"
                  className={styles.viewerZone}
                  aria-label="Предыдущая сторис"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startHighlightHold();
                  }}
                  onPointerUp={() => releaseHighlightHold('prev')}
                  onPointerCancel={() => releaseHighlightHold('prev', false)}
                  onPointerLeave={() => releaseHighlightHold('prev', false)}
                />
                <button
                  type="button"
                  className={styles.viewerZone}
                  aria-label="Следующая сторис"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startHighlightHold();
                  }}
                  onPointerUp={() => releaseHighlightHold('next')}
                  onPointerCancel={() => releaseHighlightHold('next', false)}
                  onPointerLeave={() => releaseHighlightHold('next', false)}
                />
              </div>

              {isSelf ? (
                <button
                  type="button"
                  className={[styles.viewerStatButton, styles.viewerBottomStat, highlightUiHidden ? styles.viewerUiHidden : ''].filter(Boolean).join(' ')}
                  onClick={() => setHighlightViewersOpen(true)}
                  aria-label="Кто посмотрел актуальное"
                >
                  {currentHighlightItem.viewsCount}
                </button>
              ) : null}

              {highlightViewersOpen ? (
                <div className={styles.viewerSheet}>
                  <div className={styles.viewerSheetHeader}>
                    <div>
                      <div className={styles.viewerSheetTitle}>Просмотры актуального</div>
                      <div className={styles.viewerHint}>{highlightViewersData?.count ?? currentHighlightItem.viewsCount} пользователей</div>
                    </div>
                    <button type="button" className={styles.viewerClose} onClick={() => setHighlightViewersOpen(false)} aria-label="Закрыть список просмотров">
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                  {(highlightViewersData?.items ?? []).map((item) => (
                    <div key={item.id} className={styles.viewerViewerRow}>
                      <StoryRingAvatar userId={item.viewer.id} url={item.viewer.avatarUrl} name={item.viewer.username} size={40} disableStoryClick />
                      <div className={styles.viewerViewerMeta}>
                        <div className={styles.viewerViewerName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.viewer.username}
                          <AdminBadge role={item.viewer.role} username={item.viewer.username} />
                        </div>
                        <div className={styles.viewerViewerTime}>{formatStoryTime(item.viewedAt)}</div>
                      </div>
                      {item.reaction ? <div className={styles.viewerViewerReaction}>{item.reaction}</div> : null}
                    </div>
                  ))}
                  {!(highlightViewersData?.items ?? []).length ? <CardMuted>Просмотров пока нет.</CardMuted> : null}
                </div>
              ) : null}

              {manageHighlight && isSelf ? (
                <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay-scrim)', zIndex: 7, display: 'grid', placeItems: 'center', padding: 24 }}>
                  <div style={{ width: 'min(100%, 480px)', maxHeight: 'min(100%, 760px)', borderRadius: 28, background: 'var(--panel)', border: '1px solid var(--stroke)', color: 'var(--text)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto auto 1fr auto' }}>
                    <div style={{ padding: '18px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--stroke-soft)' }}>
                      <button type="button" onClick={() => setManageHighlight(false)} style={{ border: 'none', background: 'transparent', color: 'var(--text)' }}>
                        <Icon name="arrowLeft" size={20} />
                      </button>
                      <div style={{ fontWeight: 800, fontSize: 22 }}>Актуальное</div>
                      <button type="button" onClick={() => setManageHighlight(false)} style={{ border: 'none', background: 'transparent', color: 'var(--text)' }}>
                        <Icon name="close" size={20} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--stroke-soft)' }}>
                      <button type="button" onClick={() => setManageTab('selected')} style={{ minHeight: 48, color: manageTab === 'selected' ? 'var(--text)' : 'var(--muted)', background: 'transparent', border: 'none', borderBottom: manageTab === 'selected' ? '2px solid var(--accent-strong)' : '2px solid transparent', fontWeight: 700 }}>Выбранное</button>
                      <button type="button" onClick={() => setManageTab('stories')} style={{ minHeight: 48, color: manageTab === 'stories' ? 'var(--text)' : 'var(--muted)', background: 'transparent', border: 'none', borderBottom: manageTab === 'stories' ? '2px solid var(--accent-strong)' : '2px solid transparent', fontWeight: 700 }}>Сторис</button>
                    </div>
                    <div style={{ overflow: 'auto', padding: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                        {(manageTab === 'selected' ? selectedHighlight.items : manageCandidateItems).map((item) => {
                          const active = selectedHighlight.items.some((selected) => selected.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => active ? removeFromHighlight({ storyId: item.id, highlightId: selectedHighlight.id }).unwrap().catch(() => null) : addToHighlight({ storyId: item.id, highlightId: selectedHighlight.id }).unwrap().catch(() => null)}
                              style={{ position: 'relative', border: active ? '1px solid rgba(255,122,26,.4)' : '1px solid var(--stroke-soft)', padding: 0, borderRadius: 18, overflow: 'hidden', aspectRatio: '9 / 16', background: active ? '#F1E6C5' : 'var(--panel-white)', boxShadow: 'var(--shadow-xs)' }}
                            >
                              <Preview item={item} />
                              <span style={{ position: 'absolute', inset: 0, background: active ? 'rgba(255,122,26,.14)' : 'transparent' }} />
                              <span style={{ position: 'absolute', right: 8, top: 8, minWidth: 24, height: 24, borderRadius: '999px', border: '2px solid rgba(255,255,255,.92)', background: active ? 'var(--accent)' : 'rgba(60,42,18,.18)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 12, fontWeight: 700 }}>{active ? '✓' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderTop: '1px solid var(--stroke-soft)', display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input value={manageTitle} onChange={(event) => setManageTitle(event.target.value)} placeholder={selectedHighlight.title} maxLength={80} style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 12, border: '1px solid var(--stroke-soft)', background: '#F1E6C5', color: 'var(--text)', padding: '0 12px' }} />
                        <Button size="sm" onClick={handleRenameHighlight}>Переименовать</Button>
                        <Button size="sm" onClick={handleDeleteHighlight}>Удалить</Button>
                      </div>
                      <Button size="sm" onClick={() => setManageHighlight(false)}>Готово</Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={Boolean(previewItem)} onClose={() => setPreviewItem(null)} title="Просмотр момента" size="lg">
        {previewItem ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 22, overflow: 'hidden', background: 'var(--bg-canvas)' }}>
              <Preview item={previewItem} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Просмотров: {previewItem.viewsCount}</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
