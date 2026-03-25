'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAddStoryToHighlightMutation,
  useDeleteStoryMutation,
  useGetStoriesRailQuery,
  useGetStoryHighlightsQuery,
  useGetStoryViewersQuery,
  useGetUserStoriesQuery,
  useMarkStoryViewedMutation,
  useReactToStoryMutation,
  useRemoveStoryFromHighlightMutation,
} from '@/shared/api/storiesApi';
import { useCreateDirectChatMutation, useSendMessageMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { StoryEditorItem, StoryItem } from '@/shared/types/story';
import { StoryRingAvatar } from './StoryRingAvatar';
import styles from './Stories.module.css';

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏', '😍'];

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

function getMediaStyle(story: StoryItem | null) {
  const transform = story?.transformJson ?? {};
  const scale = Number(transform.scale ?? 1);
  const scaleX = Number(transform.scaleX ?? scale);
  const scaleY = Number(transform.scaleY ?? scale);
  const rotation = Number(transform.rotation ?? 0);
  const offsetX = Number(transform.offsetX ?? 0);
  const offsetY = Number(transform.offsetY ?? 0);
  return {
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`,
    objectFit: transform.fitMode === 'cover' ? 'cover' : 'contain',
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
          textAlign: (item.align ?? 'left') as any,
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
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const { data: railData } = useGetStoriesRailQuery(undefined, { skip: !open, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const { data, isFetching } = useGetUserStoriesQuery({ userId: viewer?.userId ?? '' }, { skip: !open || !viewer?.userId, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const [markViewed] = useMarkStoryViewedMutation();
  const [reactToStory, reactState] = useReactToStoryMutation();
  const [deleteStory, deleteState] = useDeleteStoryMutation();
  const [addToHighlight] = useAddStoryToHighlightMutation();
  const [removeFromHighlight] = useRemoveStoryFromHighlightMutation();
  const [createDirectChat] = useCreateDirectChatMutation();
  const [sendMessage] = useSendMessageMutation();
  const me = meData?.user;
  const items = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [highlightSheetOpen, setHighlightSheetOpen] = useState(false);
  const [newHighlightTitle, setNewHighlightTitle] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdRef = useRef<{ timeoutId: number | null; held: boolean }>({ timeoutId: null, held: false });
  const current = items[index] ?? null;
  const isOwn = current?.authorId === me?.id;
  const storyDurationMs = getDurationMs(current);
  const currentTrimStart = Number(current?.trimStartMs ?? 0) / 1000;
  const currentTrimEnd = Number(current?.trimEndMs ?? current?.durationMs ?? storyDurationMs) / 1000;
  const { data: viewersData } = useGetStoryViewersQuery({ storyId: current?.id ?? '' }, { skip: !viewersOpen || !current || !isOwn, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const { data: highlightsData } = useGetStoryHighlightsQuery({ userId: me?.id ?? '' }, { skip: !open || !isOwn || !me?.id, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });

  useEffect(() => {
    setMyReaction(current?.myReaction ?? null);
  }, [current?.id, current?.myReaction]);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setProgress(0);
      setPaused(false);
      setUiHidden(false);
      setViewersOpen(false);
      setHighlightSheetOpen(false);
      setReplyText('');
      setMyReaction(null);
      return;
    }
    const targetIndex = viewer?.storyId ? items.findIndex((item) => item.id === viewer.storyId) : 0;
    setIndex(targetIndex >= 0 ? targetIndex : 0);
    setProgress(0);
    setViewersOpen(false);
    setHighlightSheetOpen(false);
    setUiHidden(false);
  }, [open, viewer?.storyId, viewer?.userId, items]);

  useEffect(() => {
    if (!open || isFetching) return;
    if (!items.length) {
      const rail = railData?.items ?? [];
      const currentUserIndex = rail.findIndex((item) => item.author.id === viewer?.userId);
      const nextEntry = rail[currentUserIndex + 1] ?? rail[currentUserIndex - 1] ?? null;
      if (nextEntry) {
        onChangeViewer({ userId: nextEntry.author.id, storyId: nextEntry.storyIds[0] });
      } else {
        onClose();
      }
    }
  }, [data, isFetching, items.length, onChangeViewer, onClose, open, railData?.items, viewer?.userId]);

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
      if (videoRef.current && current?.mediaType.startsWith('video/')) {
        videoRef.current.currentTime = currentTrimStart;
      }
      return;
    }
    if (index > 0) {
      setIndex((prev) => prev - 1);
      setProgress(0);
      return;
    }
    goToUser(-1);
  }, [current?.mediaType, currentTrimStart, goToUser, index, items.length, progress]);

  useEffect(() => {
    if (!open || !current || paused || viewersOpen) return;
    const duration = storyDurationMs;
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
  }, [current?.id, goNext, open, paused, progress, storyDurationMs, viewersOpen]);

  useEffect(() => {
    if (!videoRef.current || !current?.mediaType.startsWith('video/')) return;
    const video = videoRef.current;
    const syncStart = () => {
      if (Math.abs(video.currentTime - currentTrimStart) > 0.25) {
        video.currentTime = currentTrimStart;
      }
      if (!paused && !viewersOpen) {
        const play = video.play();
        if (play && typeof play.catch === 'function') play.catch(() => null);
      } else {
        video.pause();
      }
    };
    syncStart();
  }, [current?.id, current?.mediaType, currentTrimStart, paused, viewersOpen]);

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

  const handleReact = async (emoji: string) => {
    if (!current || isOwn) return;
    const nextEmoji = myReaction === emoji ? null : emoji;
    const previous = myReaction;
    setMyReaction(nextEmoji);
    const ok = await reactToStory({ storyId: current.id, emoji: nextEmoji }).unwrap().catch(() => null);
    if (!ok) setMyReaction(previous);
  };

  const handleReply = async () => {
    const text = replyText.trim();
    if (!current || !text || isOwn) return;
    setSendingReply(true);
    try {
      const direct = await createDirectChat({ userId: current.authorId }).unwrap();
      await sendMessage({
        chatId: direct.chat.id,
        text,
        type: 'TEXT',
        metaJson: {
          kind: 'storyReply',
          storyId: current.id,
          storyAuthorId: current.authorId,
          storyAuthorName: current.author.username,
          storyImageUrl: current.mediaUrl,
          storyMediaType: current.mediaType,
          storyCreatedAt: current.createdAt,
        },
      }).unwrap();
      setReplyText('');
      onClose();
      router.push(`/messages/${direct.chat.id}`);
    } catch {
      // noop
    } finally {
      setSendingReply(false);
    }
  };

  const toggleHighlight = async (highlightId: string) => {
    if (!current) return;
    const inHighlight = (current.highlightIds ?? []).includes(highlightId);
    if (inHighlight) await removeFromHighlight({ storyId: current.id, highlightId }).unwrap().catch(() => null);
    else await addToHighlight({ storyId: current.id, highlightId }).unwrap().catch(() => null);
  };

  const handleCreateHighlight = async () => {
    const title = newHighlightTitle.trim();
    if (!current || !title) return;
    await addToHighlight({ storyId: current.id, title }).unwrap().catch(() => null);
    setNewHighlightTitle('');
  };

  const startHold = () => {
    if (holdRef.current.timeoutId) window.clearTimeout(holdRef.current.timeoutId);
    holdRef.current.held = false;
    holdRef.current.timeoutId = window.setTimeout(() => {
      holdRef.current.held = true;
      setPaused(true);
      setUiHidden(true);
    }, 160);
  };

  const releaseHold = (direction: 'prev' | 'next', shouldNavigate = true) => {
    if (holdRef.current.timeoutId) {
      window.clearTimeout(holdRef.current.timeoutId);
      holdRef.current.timeoutId = null;
    }
    const held = holdRef.current.held;
    holdRef.current.held = false;
    if (held) {
      setPaused(false);
      setUiHidden(false);
      return;
    }
    if (!shouldNavigate) return;
    if (direction === 'prev') goPrev();
    else goNext();
  };

  if (!open || !current) return null;

  return (
    <div className={styles.viewerBackdrop} role="dialog" aria-modal="true">
      <div className={styles.viewer}>
        <div className={styles.viewerInner}>
          <div key={current.id} className={styles.viewerStage}>
            <div className={styles.viewerMediaBackdrop} style={{ background: current.transformJson?.backgroundFill ?? '#0b0b0e' }} />
            <div className={styles.viewerMediaBlurFrame}>
              {current.mediaType.startsWith('video/') ? (
                <video className={styles.viewerMediaBlurVideo} src={current.mediaUrl} playsInline muted preload="auto" style={{ objectFit: 'cover' }} />
              ) : (
                <img className={styles.viewerMediaBlur} src={current.mediaUrl} alt="Фон сторис" style={{ objectFit: 'cover' }} />
              )}
            </div>
            <div className={styles.viewerMediaFrame}>
              {current.mediaType.startsWith('video/') ? (
                <video
                  ref={videoRef}
                  className={styles.viewerMediaVideo}
                  src={current.mediaUrl}
                  playsInline
                  muted={false}
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    const target = event.currentTarget;
                    if (Math.abs(target.currentTime - currentTrimStart) > 0.25) target.currentTime = currentTrimStart;
                  }}
                  onTimeUpdate={(event) => {
                    if (event.currentTarget.currentTime >= currentTrimEnd - 0.05) {
                      goNext();
                    }
                  }}
                  style={getMediaStyle(current)}
                />
              ) : (
                <img className={styles.viewerMedia} src={current.mediaUrl} alt="Сторис" style={getMediaStyle(current)} />
              )}
            </div>

            {(current.itemsJson ?? []).map((item) => renderStoryOverlay(item as StoryEditorItem))}
          </div>

          <div className={[styles.viewerTop, uiHidden ? styles.viewerUiHidden : ''].filter(Boolean).join(' ')}>
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
              <StoryRingAvatar userId={current.author.id} url={current.author.avatarUrl} name={current.author.username} size={38} disableStoryClick />
              <div className={styles.viewerMetaText}>
                <div className={styles.viewerName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{current.author.username}<AdminBadge role={current.author.role} /></div>
                <div className={styles.viewerTime}>{formatStoryTime(current.createdAt)}</div>
              </div>
              {isOwn ? (
                <button type="button" className={styles.viewerStatButton} onClick={() => setViewersOpen(true)} aria-label="Кто посмотрел сторис">
                  {current.viewsCount}
                </button>
              ) : null}
              {isOwn ? (
                <button type="button" className={styles.viewerDeleteButton} onClick={() => setHighlightSheetOpen(true)} aria-label="Добавить в актуальное">
                  <Icon name="plus" size={18} />
                </button>
              ) : null}
              {isOwn ? (
                <button type="button" className={styles.viewerDeleteButton} onClick={handleDelete} disabled={deleteState.isLoading} aria-label="Удалить сторис">
                  <Icon name="trash" size={18} />
                </button>
              ) : null}
              <button type="button" className={styles.viewerClose} onClick={onClose} aria-label="Закрыть сторис">
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
                startHold();
              }}
              onPointerUp={() => releaseHold('prev')}
              onPointerCancel={() => releaseHold('prev', false)}
              onPointerLeave={() => releaseHold('prev', false)}
            />
            <button
              type="button"
              className={styles.viewerZone}
              aria-label="Следующая сторис"
              onPointerDown={(event) => {
                event.preventDefault();
                startHold();
              }}
              onPointerUp={() => releaseHold('next')}
              onPointerCancel={() => releaseHold('next', false)}
              onPointerLeave={() => releaseHold('next', false)}
            />
          </div>

          <div className={[styles.viewerFooter, uiHidden ? styles.viewerUiHidden : ''].filter(Boolean).join(' ')}>
            {isOwn ? (
              <div>
                <div className={styles.viewerHint}>Удерживай, чтобы поставить сторис на паузу без оверлея.</div>
                <div className={styles.viewerHint}>Просмотры и реакции доступны в списке зрителей.</div>
              </div>
            ) : (
              <div className={styles.viewerReplyArea}>
                <div className={styles.viewerReactionRow}>
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={[styles.viewerReactionButton, myReaction === emoji ? styles.viewerReactionButtonActive : ''].filter(Boolean).join(' ')}
                      onClick={() => handleReact(emoji)}
                      disabled={reactState.isLoading}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className={styles.viewerReplyBar}>
                  <input
                    className={styles.viewerReplyInput}
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder={`Ответить ${current.author.username}`}
                    maxLength={500}
                  />
                  <Button variant="primary" iconOnly loading={sendingReply} onClick={handleReply} aria-label="Отправить ответ на сторис">
                    <Icon name="send" size={18} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {viewersOpen ? (
            <div className={styles.viewerSheet}>
              <div className={styles.viewerSheetHeader}>
                <div>
                  <div className={styles.viewerSheetTitle}>Просмотры сторис</div>
                  <div className={styles.viewerHint}>{viewersData?.count ?? current.viewsCount} пользователей</div>
                </div>
                <button type="button" className={styles.viewerClose} onClick={() => setViewersOpen(false)} aria-label="Закрыть список просмотров">
                  <Icon name="close" size={18} />
                </button>
              </div>
              {(viewersData?.items ?? []).map((item) => (
                <div key={item.id} className={styles.viewerViewerRow}>
                  <StoryRingAvatar userId={item.viewer.id} url={item.viewer.avatarUrl} name={item.viewer.username} size={40} disableStoryClick />
                  <div className={styles.viewerViewerMeta}>
                    <div className={styles.viewerViewerName}>{item.viewer.username}</div>
                    <div className={styles.viewerViewerTime}>{formatStoryTime(item.viewedAt)}</div>
                  </div>
                  {item.reaction ? <div className={styles.viewerViewerReaction}>{item.reaction}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {highlightSheetOpen && isOwn && current ? (
            <div className={styles.viewerSheet}>
              <div className={styles.viewerSheetHeader}>
                <div>
                  <div className={styles.viewerSheetTitle}>Актуальное</div>
                  <div className={styles.viewerHint}>Можно сохранить сторис в подборку профиля.</div>
                </div>
                <button type="button" className={styles.viewerClose} onClick={() => setHighlightSheetOpen(false)} aria-label="Закрыть актуальное">
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className={styles.viewerHighlightList}>
                {(highlightsData?.items ?? []).map((highlight) => {
                  const active = (current.highlightIds ?? []).includes(highlight.id);
                  return (
                    <button key={highlight.id} type="button" className={[styles.viewerHighlightRow, active ? styles.viewerHighlightRowActive : ''].filter(Boolean).join(' ')} onClick={() => void toggleHighlight(highlight.id)}>
                      <span>{highlight.title}</span>
                      <span>{active ? 'Убрать' : 'Добавить'}</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.viewerReplyBar}>
                <input className={styles.viewerReplyInput} value={newHighlightTitle} onChange={(event) => setNewHighlightTitle(event.target.value)} placeholder="Новое актуальное" maxLength={80} />
                <Button variant="primary" onClick={handleCreateHighlight}>Создать</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
