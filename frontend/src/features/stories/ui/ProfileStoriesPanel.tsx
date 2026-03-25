'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { CardMuted } from '@/shared/ui/Card/Card';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { StoryRingAvatar } from './StoryRingAvatar';
import {
  useAddStoryToHighlightMutation,
  useCreateHighlightMutation,
  useDeleteHighlightMutation,
  useDeleteStoryMutation,
  useGetStoriesArchiveQuery,
  useGetStoryHighlightsQuery,
  useRemoveStoryFromHighlightMutation,
  useUpdateHighlightMutation,
  useGetStoryViewersQuery,
  useGetUserStoriesQuery,
} from '@/shared/api/storiesApi';
import type { StoryHighlight, StoryItem } from '@/shared/types/story';
import styles from './Stories.module.css';

function Preview({ item }: { item: StoryItem }) {
  if (item.mediaType.startsWith('video/')) {
    return <video src={item.mediaUrl} playsInline muted loop autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <img src={item.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}

export function ProfileStoriesPanel({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { data: highlightsData } = useGetStoryHighlightsQuery({ userId }, { pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const { data: archiveData } = useGetStoriesArchiveQuery(undefined, { skip: !isSelf, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
  const { data: liveStoriesData } = useGetUserStoriesQuery({ userId }, { skip: !isSelf, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });
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
  const holdRef = useRef<{ timeoutId: number | null; held: boolean }>({ timeoutId: null, held: false });
  const [previewItem, setPreviewItem] = useState<StoryItem | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [archiveSelection, setArchiveSelection] = useState<Record<string, string>>({});
  const highlights = highlightsData?.items ?? [];
  const archiveItems = archiveData?.items ?? [];
  const liveStories = liveStoriesData?.items ?? [];
  const totalCount = useMemo(() => highlights.reduce((sum, item) => sum + item.count, 0), [highlights]);
  const currentHighlightItem = selectedHighlight?.items[highlightIndex] ?? null;
  const { data: highlightViewersData } = useGetStoryViewersQuery({ storyId: currentHighlightItem?.id ?? '' }, { skip: !Boolean(currentHighlightItem), pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });

  useEffect(() => {
    if (!selectedHighlight) return;
    const fresh = highlights.find((item) => item.id === selectedHighlight.id) ?? null;
    setSelectedHighlight(fresh);
    if (fresh && highlightIndex > fresh.items.length - 1) setHighlightIndex(Math.max(0, fresh.items.length - 1));
  }, [highlights, selectedHighlight?.id, highlightIndex]);

  useEffect(() => {
    if (!selectedHighlight) {
      setHighlightProgress(0);
      setHighlightPaused(false);
      setHighlightUiHidden(false);
      setHighlightViewersOpen(false);
    }
  }, [selectedHighlight]);

  useEffect(() => {
    if (!currentHighlightItem || highlightPaused || manageHighlight) return;
    const duration = Math.max(3000, Number(currentHighlightItem.durationMs ?? 8000));
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
  }, [currentHighlightItem?.id, highlightPaused, manageHighlight, highlightProgress, highlightIndex, selectedHighlight]);

  const startHighlightHold = () => {
    if (holdRef.current.timeoutId) window.clearTimeout(holdRef.current.timeoutId);
    holdRef.current.held = false;
    holdRef.current.timeoutId = window.setTimeout(() => {
      holdRef.current.held = true;
      setHighlightPaused(true);
      setHighlightUiHidden(true);
    }, 150);
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
    if (!shouldNavigate || !selectedHighlight) return;
    setHighlightProgress(0);
    setHighlightIndex((value) => direction === 'prev' ? Math.max(0, value - 1) : Math.min(selectedHighlight.items.length - 1, value + 1));
  };

  const handleCreateHighlight = async () => {
    const title = titleInput.trim();
    if (!title) return;
    const result = await createHighlight({ title }).unwrap().catch(() => null);
    if (result) {
      setCreateOpen(false);
      setTitleInput('');
    }
  };

  return (
    <div style={{ margin: '18px 0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Моменты {totalCount ? <span style={{ color: 'rgba(255,255,255,.52)' }}>{totalCount}</span> : null}</div>
        {isSelf ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => setArchiveOpen(true)}>Архив</Button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', paddingBottom: 4 }}>
        {isSelf ? (
          <button type="button" onClick={() => setCreateOpen(true)} style={{ background: 'transparent', border: 'none', color: 'inherit', display: 'grid', gap: 10, justifyItems: 'center', minWidth: 92 }}>
            <span style={{ width: 78, height: 78, borderRadius: '999px', padding: 3, background: 'rgba(255,255,255,.12)', display: 'inline-flex' }}>
              <span style={{ width: '100%', height: '100%', borderRadius: '999px', overflow: 'hidden', background: '#191a1d', display: 'grid', placeItems: 'center', color: 'white', fontSize: 30 }}>+</span>
            </span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.78)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 86 }}>Добавить</span>
          </button>
        ) : null}

        {highlights.map((highlight) => (
          <button key={highlight.id} type="button" onClick={() => { setSelectedHighlight(highlight); setHighlightIndex(0); setManageHighlight(false); setManageTab('selected'); }} style={{ background: 'transparent', border: 'none', color: 'inherit', display: 'grid', gap: 10, justifyItems: 'center', minWidth: 92 }}>
            <span style={{ width: 78, height: 78, borderRadius: '999px', padding: 3, background: 'rgba(255,255,255,.16)', display: 'inline-flex' }}>
              <span style={{ width: '100%', height: '100%', borderRadius: '999px', overflow: 'hidden', background: '#191a1d', display: 'block' }}>
                {highlight.cover?.mediaUrl ? (
                  highlight.cover.mediaType.startsWith('video/') ? <video src={highlight.cover.mediaUrl} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={highlight.cover.mediaUrl} alt={highlight.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : null}
              </span>
            </span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.78)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 86 }}>{highlight.title}</span>
          </button>
        ))}
      </div>

      {!highlights.length ? (
        <div style={{ marginTop: 12 }}>
          <CardMuted>{isSelf ? 'После 24 часов сторис будут попадать в архив. Из архива можно собирать актуальное.' : 'Актуального пока нет.'}</CardMuted>
        </div>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новое актуальное">
        <div style={{ display: 'grid', gap: 12 }}>
          <input value={titleInput} onChange={(event) => setTitleInput(event.target.value)} placeholder="Название" maxLength={80} style={{ width: '100%', height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: 'white', padding: '0 14px' }} />
          <Button variant="primary" onClick={handleCreateHighlight} loading={createState.isLoading}>Создать</Button>
        </div>
      </Modal>

      <Modal open={archiveOpen} onClose={() => setArchiveOpen(false)} title="Архив сторис" size="xl">
        <div style={{ display: 'grid', gap: 14 }}>
          {!archiveItems.length ? <CardMuted>В архиве пока пусто.</CardMuted> : null}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {archiveItems.map((item) => {
              const selected = archiveSelection[item.id] ?? '';
              return (
                <div key={item.id} style={{ display: 'grid', gap: 10, borderRadius: 22, background: 'rgba(255,255,255,.03)', padding: 12 }}>
                  <button type="button" onClick={() => setPreviewItem(item)} style={{ border: 'none', padding: 0, background: 'transparent', borderRadius: 18, overflow: 'hidden', aspectRatio: '9 / 16' }}>
                    <Preview item={item} />
                  </button>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.56)' }}>{new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
                  <select value={selected} onChange={(event) => setArchiveSelection((prev) => ({ ...prev, [item.id]: event.target.value }))} style={{ width: '100%', height: 40, borderRadius: 12, background: '#141518', color: 'white', border: '1px solid rgba(255,255,255,.08)', padding: '0 10px' }}>
                    <option value="">Выбрать актуальное</option>
                    {highlights.map((highlight) => <option key={highlight.id} value={highlight.id}>{highlight.title}</option>)}
                  </select>
                  {item.highlightIds?.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item.highlightIds.map((hid) => {
                        const currentHighlight = highlights.find((highlight) => highlight.id === hid);
                        if (!currentHighlight) return null;
                        return (
                          <button key={hid} type="button" onClick={() => removeFromHighlight({ storyId: item.id, highlightId: hid }).unwrap().catch(() => null)} style={{ border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.06)', color: 'white', borderRadius: 999, padding: '4px 10px', fontSize: 11 }}>
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
        <div className={styles.viewerBackdrop}>
          <div className={styles.viewer}>
            <div className={styles.viewerInner} style={{ background: '#050506' }}>
              <div className={styles.viewerStage}>
                <div style={{ position: 'absolute', inset: 0, background: currentHighlightItem.transformJson?.backgroundFill ?? '#0b0b0e' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, opacity: .4, filter: 'blur(32px)', transform: 'scale(1.08)' }}><Preview item={currentHighlightItem} /></div>
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}><Preview item={currentHighlightItem} /></div>
                </div>

                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <button type="button" aria-label="Предыдущая история" onPointerDown={(e) => { e.preventDefault(); startHighlightHold(); }} onPointerUp={() => releaseHighlightHold('prev')} onPointerCancel={() => releaseHighlightHold('prev', false)} onPointerLeave={() => releaseHighlightHold('prev', false)} style={{ border: 'none', background: 'transparent' }} />
                  <button type="button" aria-label="Следующая история" onPointerDown={(e) => { e.preventDefault(); startHighlightHold(); }} onPointerUp={() => releaseHighlightHold('next')} onPointerCancel={() => releaseHighlightHold('next', false)} onPointerLeave={() => releaseHighlightHold('next', false)} style={{ border: 'none', background: 'transparent' }} />
                </div>

                <div className={[styles.viewerTop, highlightUiHidden ? styles.viewerUiHidden : ''].filter(Boolean).join(' ')}>
                  <div className={styles.viewerProgress}>
                    {selectedHighlight.items.map((item, idx) => (
                      <div key={item.id} className={styles.viewerSegment}>
                        <div style={{ width: '100%', height: '100%', transformOrigin: 'left center', transform: `scaleX(${idx < highlightIndex ? 1 : idx === highlightIndex ? highlightProgress : 0})`, background: '#fff', transition: 'transform .08s linear' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StoryRingAvatar userId={userId} url={selectedHighlight.cover?.mediaUrl ?? null} name={selectedHighlight.title} size={38} disableStoryClick />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800 }}>{selectedHighlight.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.62)' }}>{new Date(currentHighlightItem.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
                    </div>
                    <button type="button" onClick={() => setHighlightViewersOpen(true)} style={{ border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.08)', color: 'white', borderRadius: 999, minWidth: 42, height: 34 }}>{currentHighlightItem.viewsCount}</button>
                    {isSelf ? <button type="button" onClick={() => { setManageTab('selected'); setManageHighlight(true); }} style={{ border: 'none', background: 'transparent', color: 'white', width: 34, height: 34 }}><Icon name="dots" size={20} /></button> : null}
                    <button type="button" onClick={() => setSelectedHighlight(null)} style={{ border: 'none', background: 'transparent', color: 'white', width: 34, height: 34 }}><Icon name="close" size={20} /></button>
                  </div>
                </div>

                {highlightViewersOpen ? (
                  <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, borderRadius: 22, background: 'rgba(8,8,10,.92)', border: '1px solid rgba(255,255,255,.08)', padding: 14, display: 'grid', gap: 10, zIndex: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><strong>Кто посмотрел</strong><button type="button" onClick={() => setHighlightViewersOpen(false)} style={{ border: 'none', background: 'transparent', color: 'white' }}><Icon name="close" size={18} /></button></div>
                    <div style={{ display: 'grid', gap: 10, maxHeight: 220, overflow: 'auto' }}>
                      {(highlightViewersData?.items ?? []).map((item) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <StoryRingAvatar userId={item.viewer.id} url={item.viewer.avatarUrl} name={item.viewer.username} size={38} disableStoryClick />
                          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>{item.viewer.username}<AdminBadge role={item.viewer.role} /></div><div style={{ fontSize: 12, color: 'rgba(255,255,255,.58)' }}>{new Date(item.viewedAt).toLocaleString('ru-RU')}</div></div>
                          {item.reaction ? <div style={{ fontSize: 22 }}>{item.reaction}</div> : null}
                        </div>
                      ))}
                      {!(highlightViewersData?.items ?? []).length ? <CardMuted>Просмотров пока нет.</CardMuted> : null}
                    </div>
                  </div>
                ) : null}

                {manageHighlight && isSelf ? (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,6,.92)', zIndex: 7, display: 'grid', placeItems: 'center', padding: 24 }}>
                    <div style={{ width: 'min(100%, 480px)', maxHeight: 'min(100%, 760px)', borderRadius: 28, background: '#111215', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto auto 1fr auto' }}>
                      <div style={{ padding: '18px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                        <button type="button" onClick={() => setManageHighlight(false)} style={{ border: 'none', background: 'transparent', color: 'white' }}><Icon name="arrowLeft" size={20} /></button>
                        <div style={{ fontWeight: 800, fontSize: 22 }}>Истории</div>
                        <button type="button" onClick={() => setManageHighlight(false)} style={{ border: 'none', background: 'transparent', color: 'white' }}><Icon name="close" size={20} /></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                        <button type="button" onClick={() => setManageTab('selected')} style={{ minHeight: 48, color: manageTab === 'selected' ? 'white' : 'rgba(255,255,255,.58)', background: 'transparent', border: 'none', borderBottom: manageTab === 'selected' ? '2px solid white' : '2px solid transparent', fontWeight: 700 }}>Выбранное</button>
                        <button type="button" onClick={() => setManageTab('stories')} style={{ minHeight: 48, color: manageTab === 'stories' ? 'white' : 'rgba(255,255,255,.58)', background: 'transparent', border: 'none', borderBottom: manageTab === 'stories' ? '2px solid white' : '2px solid transparent', fontWeight: 700 }}>Истории</button>
                      </div>
                      <div style={{ overflow: 'auto', padding: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                          {(manageTab === 'selected' ? selectedHighlight.items : [...archiveItems.filter((item) => !selectedHighlight.items.some((selected) => selected.id === item.id)), ...liveStories.filter((item) => !selectedHighlight.items.some((selected) => selected.id === item.id) && !archiveItems.some((archive) => archive.id === item.id))]).map((item) => {
                            const active = selectedHighlight.items.some((selected) => selected.id === item.id);
                            return (
                              <button key={item.id} type="button" onClick={() => active ? removeFromHighlight({ storyId: item.id, highlightId: selectedHighlight.id }).unwrap().catch(() => null) : addToHighlight({ storyId: item.id, highlightId: selectedHighlight.id }).unwrap().catch(() => null)} style={{ position: 'relative', border: 'none', padding: 0, borderRadius: 0, overflow: 'hidden', aspectRatio: '9 / 16', background: '#18191d' }}>
                                <Preview item={item} />
                                <span style={{ position: 'absolute', right: 8, bottom: 8, width: 22, height: 22, borderRadius: '999px', border: '2px solid white', background: active ? '#0ea5e9' : 'rgba(0,0,0,.2)', display: 'grid', placeItems: 'center', color: 'white', fontSize: 12 }}>{active ? '✓' : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.06)', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input value={titleInput} onChange={(event) => setTitleInput(event.target.value)} placeholder={selectedHighlight.title} maxLength={80} style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: 'white', padding: '0 12px' }} />
                          <Button size="sm" onClick={() => titleInput.trim() ? updateHighlight({ highlightId: selectedHighlight.id, title: titleInput.trim() }).unwrap().then(() => setTitleInput('')).catch(() => null) : null}>Переименовать</Button>
                          <Button size="sm" onClick={() => deleteHighlight({ highlightId: selectedHighlight.id }).unwrap().then(() => setSelectedHighlight(null)).catch(() => null)}>Удалить</Button>
                        </div>
                        <Button size="sm" onClick={() => setManageHighlight(false)}>Готово</Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={Boolean(previewItem)} onClose={() => setPreviewItem(null)} title="Просмотр момента" size="lg">
        {previewItem ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 22, overflow: 'hidden', background: '#09090b' }}>
              <Preview item={previewItem} />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.64)' }}>Просмотров: {previewItem.viewsCount}</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
