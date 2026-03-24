'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useCreateStoriesMutation } from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useGetMentalDayQuery, useGetNutritionQuery, useGetOverviewQuery, useGetTasksDayQuery } from '@/shared/api/pulseApi';
import { StoryEditorItem, StoryWidgetType } from '@/shared/types/story';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './Stories.module.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type LocalDraft = {
  id: string;
  file: File;
  url: string;
  mediaType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  items: StoryEditorItem[];
};

async function enrichFile(file: File): Promise<LocalDraft> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = URL.createObjectURL(file);

  const base: LocalDraft = {
    id,
    file,
    url,
    mediaType: file.type || 'image/*',
    items: [],
  };

  if (file.type.startsWith('image/')) {
    const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    return { ...base, width: size?.width ?? null, height: size?.height ?? null, durationMs: 8000 };
  }

  if (file.type.startsWith('video/')) {
    const meta = await new Promise<{ width: number; height: number; durationMs: number } | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          durationMs: Math.max(4000, Math.round((video.duration || 15) * 1000)),
        });
      };
      video.onerror = () => resolve(null);
      video.src = url;
    });
    return {
      ...base,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      durationMs: meta?.durationMs ?? 15000,
    };
  }

  return base;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function widgetPreset(type: StoryWidgetType, source: any) {
  const map: Record<StoryWidgetType, { title: string; primary: string; secondary: string }> = {
    pulse: {
      title: 'Индекс Pulse',
      primary: `${source?.overview?.today?.dayScore ?? source?.today?.dayScore ?? '—'}`,
      secondary: `Фокус: ${source?.overview?.today?.recommendations?.[0] ?? source?.today?.recommendations?.[0] ?? 'день в балансе'}`,
    },
    focus: {
      title: 'Фокус дня',
      primary: `${source?.overview?.today?.recommendations?.[0] ?? 'Одна главная задача'}`,
      secondary: `${source?.overview?.today?.tasksDone ?? 0} из ${source?.overview?.today?.tasksTotal ?? 0} задач`,
    },
    health: {
      title: 'Здоровье',
      primary: `${source?.mental?.day?.todayScore ?? source?.overview?.today?.mental7Score ?? '—'}`,
      secondary: `Сон ${source?.mental?.day?.sleepHours ?? '—'} ч · Стресс ${source?.mental?.day?.stress ?? '—'}`,
    },
    tasks: {
      title: 'Прогресс дня',
      primary: `${source?.tasks?.summary?.percent ?? source?.overview?.today?.tasksPercent ?? 0}%`,
      secondary: `${source?.tasks?.summary?.completed ?? 0}/${source?.tasks?.summary?.total ?? 0} выполнено`,
    },
    nutrition: {
      title: 'Питание',
      primary: `${source?.nutrition?.totalCalories ?? source?.overview?.nutrition?.totalCalories ?? 0} ккал`,
      secondary: `Осталось ${source?.nutrition?.remainingCalories ?? source?.overview?.nutrition?.remainingCalories ?? 0}`,
    },
  };
  return map[type];
}

export function StoryCreator({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (userId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [createStories, createState] = useCreateStoriesMutation();
  const { data: meData } = useGetMeQuery();
  const today = useMemo(() => todayIso(), []);
  const { data: overviewData } = useGetOverviewQuery(undefined, { skip: !open });
  const { data: mentalData } = useGetMentalDayQuery(today, { skip: !open });
  const { data: tasksData } = useGetTasksDayQuery(today, { skip: !open });
  const { data: nutritionData } = useGetNutritionQuery(today, { skip: !open });

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null;
  const selectedItem = activeDraft?.items.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!open) {
      setSelectedItemId(null);
      return;
    }
    if (!activeDraftId && drafts[0]) setActiveDraftId(drafts[0].id);
  }, [activeDraftId, drafts, open]);

  const draftUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    draftUrlsRef.current = drafts.map((draft) => draft.url);
  }, [drafts]);

  useEffect(() => {
    return () => {
      draftUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateDraft = (draftId: string, updater: (draft: LocalDraft) => LocalDraft) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === draftId ? updater(draft) : draft)));
  };

  const updateSelectedItem = (patch: Partial<any>) => {
    if (!activeDraft || !selectedItem) return;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: draft.items.map((item) => (item.id === selectedItem.id ? ({ ...item, ...patch } as StoryEditorItem) : item)),
    }));
  };

  const handleAddFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    const acceptable = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!acceptable.length) return;
    const nextDrafts = await Promise.all(acceptable.map((file) => enrichFile(file)));
    setDrafts((prev) => [...prev, ...nextDrafts]);
    setActiveDraftId((prev) => prev ?? nextDrafts[0]?.id ?? null);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleAddFiles(event.target.files);
    event.target.value = '';
  };


  const handleStickerInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeDraft || !file.type.startsWith('image/')) return;
    const src = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!src) return;
    const id = `item-${Date.now()}`;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, { id, type: 'image', x: 18, y: 22, w: 38, h: 24, src, radius: 18 }],
    }));
    setSelectedItemId(id);
  };

  const addText = () => {
    if (!activeDraft) return;
    const id = `item-${Date.now()}`;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, { id, type: 'text', x: 12, y: 16, w: 56, h: 18, text: 'Новый текст', color: '#ffffff', fontSize: 28, align: 'left' }],
    }));
    setSelectedItemId(id);
  };

  const addWidget = (type: StoryWidgetType) => {
    if (!activeDraft) return;
    const preset = widgetPreset(type, {
      overview: overviewData,
      mental: mentalData,
      tasks: tasksData,
      nutrition: nutritionData,
    });
    const id = `item-${Date.now()}`;
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, {
        id,
        type: 'widget',
        x: 10,
        y: 14,
        w: 78,
        h: 22,
        widgetType: type,
        title: preset.title,
        payload: { primary: preset.primary, secondary: preset.secondary },
      }],
    }));
    setSelectedItemId(id);
  };

  const removeSelected = () => {
    if (!activeDraft || !selectedItem) return;
    updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.filter((item) => item.id !== selectedItem.id) }));
    setSelectedItemId(null);
  };

  const removeDraft = (draftId: string) => {
    setDrafts((prev) => {
      const target = prev.find((draft) => draft.id === draftId);
      if (target) URL.revokeObjectURL(target.url);
      const next = prev.filter((draft) => draft.id !== draftId);
      if (activeDraftId === draftId) setActiveDraftId(next[0]?.id ?? null);
      if (!next.length) setSelectedItemId(null);
      return next;
    });
  };

  const beginTransform = (itemId: string, mode: 'move' | 'resize', origin: { clientX: number; clientY: number }) => {
    if (!activeDraft || !canvasRef.current) return;
    const target = activeDraft.items.find((item) => item.id === itemId);
    if (!target) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const start = { x: target.x, y: target.y, w: target.w, h: target.h };
    const onMove = (event: PointerEvent) => {
      const dx = ((event.clientX - origin.clientX) / rect.width) * 100;
      const dy = ((event.clientY - origin.clientY) / rect.height) * 100;
      updateDraft(activeDraft.id, (draft) => ({
        ...draft,
        items: draft.items.map((item) => {
          if (item.id !== itemId) return item;
          if (mode === 'move') {
            return {
              ...item,
              x: clamp(start.x + dx, 0, 100 - start.w),
              y: clamp(start.y + dy, 0, 100 - start.h),
            } as StoryEditorItem;
          }
          return {
            ...item,
            w: clamp(start.w + dx, 18, 100 - start.x),
            h: clamp(start.h + dy, 12, 100 - start.y),
          } as StoryEditorItem;
        }),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const widgetButtons: Array<{ type: StoryWidgetType; label: string; meta: string }> = [
    { type: 'pulse', label: 'Pulse дня', meta: 'Баллы и главная подсказка' },
    { type: 'focus', label: 'Фокус дня', meta: 'Главная цель и темп задач' },
    { type: 'health', label: 'Здоровье', meta: 'Сон, стресс, состояние' },
    { type: 'tasks', label: 'Задачи', meta: 'Прогресс и выполненные дела' },
    { type: 'nutrition', label: 'Питание', meta: 'Калории и остаток нормы' },
  ];

  const handleClose = () => {
    drafts.forEach((draft) => URL.revokeObjectURL(draft.url));
    setDrafts([]);
    setActiveDraftId(null);
    setSelectedItemId(null);
    onClose();
  };

  const publish = async () => {
    if (!drafts.length || !meData?.user?.id) return;
    const files = drafts.map((draft) => draft.file);
    const payloadDrafts = drafts.map((draft) => ({
      durationMs: draft.durationMs,
      width: draft.width,
      height: draft.height,
      itemsJson: draft.items,
    }));
    const result = await createStories({ files, drafts: payloadDrafts }).unwrap().catch(() => null);
    if (!result) return;
    onCreated(meData.user.id);
    drafts.forEach((draft) => URL.revokeObjectURL(draft.url));
    setDrafts([]);
    setActiveDraftId(null);
    setSelectedItemId(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className={styles.creatorBackdrop} role="dialog" aria-modal="true">
      <div className={styles.creator}>
        <div className={styles.creatorHeader}>
          <div>
            <div className={styles.creatorTitle}>Новая сторис</div>
            <div className={styles.creatorSectionMuted}>Добавьте несколько сторис, разместите текст и карточки Pulse, затем опубликуйте их одним нажатием.</div>
          </div>
          <div className={styles.creatorActions}>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Icon name="image" size={16} />
              Добавить медиа
            </Button>
            <Button variant="primary" onClick={publish} disabled={!drafts.length} loading={createState.isLoading}>
              Опубликовать
            </Button>
            <Button iconOnly onClick={handleClose} aria-label="Закрыть редактор">
              <Icon name="close" size={18} />
            </Button>
          </div>
        </div>

        <div className={styles.creatorBody}>
          <div className={styles.creatorTimeline}>
            {drafts.map((draft) => (
              <div key={draft.id} className={draft.id === activeDraftId ? styles.creatorThumbActive : styles.creatorThumb} onClick={() => setActiveDraftId(draft.id)}>
                {draft.mediaType.startsWith('video/') ? (
                  <video className={styles.creatorThumbPreview} src={draft.url} muted playsInline />
                ) : (
                  <img className={styles.creatorThumbPreview} src={draft.url} alt="Черновик сторис" />
                )}
                <div className={styles.creatorThumbMeta}>{draft.mediaType.startsWith('video/') ? 'Видео' : 'Фото'} · {draft.items.length} элементов</div>
              </div>
            ))}
            <div className={styles.creatorAddCard} onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={20} />
            </div>
          </div>

          <div className={styles.creatorCanvasWrap}>
            {activeDraft ? (
              <div
                ref={canvasRef}
                className={styles.creatorCanvas}
                onClick={() => setSelectedItemId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleAddFiles(event.dataTransfer.files);
                }}
              >
                {activeDraft.mediaType.startsWith('video/') ? (
                  <video className={styles.creatorCanvasVideo} src={activeDraft.url} muted autoPlay loop playsInline />
                ) : (
                  <img className={styles.creatorCanvasMedia} src={activeDraft.url} alt="Сторис" />
                )}

                {activeDraft.items.map((item) => {
                  const commonStyle = {
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    width: `${item.w}%`,
                    height: `${item.h}%`,
                  } as const;
                  const selected = item.id === selectedItemId;
                  return (
                    <div
                      key={item.id}
                      className={[
                        styles.creatorItem,
                        selected ? styles.creatorItemSelected : '',
                        item.type === 'text' ? styles.creatorTextItem : styles.creatorWidgetItem,
                      ].filter(Boolean).join(' ')}
                      style={commonStyle}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedItemId(item.id);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedItemId(item.id);
                        beginTransform(item.id, 'move', { clientX: event.clientX, clientY: event.clientY });
                      }}
                    >
                      {item.type === 'text' ? (
                        <div style={{ fontSize: item.fontSize ?? 28, color: item.color ?? '#fff', textAlign: item.align ?? 'left' }}>{item.text}</div>
                      ) : item.type === 'image' ? (
                        <div className={styles.creatorImageItem} style={{ width: '100%', height: '100%', borderRadius: `${item.radius ?? 18}px` }}>
                          <img src={item.src} alt="Элемент сторис" />
                        </div>
                      ) : (
                        <>
                          <div className={styles.viewerWidgetTitle}>{item.title}</div>
                          <div className={styles.viewerWidgetValue}>{String(item.payload?.primary ?? '—')}</div>
                          <div className={styles.viewerWidgetSub}>{String(item.payload?.secondary ?? '')}</div>
                        </>
                      )}
                      {selected ? (
                        <span
                          className={styles.creatorResizeHandle}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            beginTransform(item.id, 'resize', { clientX: event.clientX, clientY: event.clientY });
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={[styles.creatorCanvas, styles.creatorCanvasEmpty].join(' ')}>
                <div className={styles.creatorEmptyState}>
                  <Icon name="image" size={28} />
                  <div>Перетащите фото или видео сюда</div>
                  <Button onClick={() => fileInputRef.current?.click()}>Выбрать файлы</Button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.creatorPanel}>
            <div className={styles.creatorSection}>
              <div className={styles.creatorSectionTitle}>Быстрые инструменты</div>
              <div className={styles.creatorGrid}>
                <button type="button" className={styles.creatorTool} onClick={addText} disabled={!activeDraft}>
                  <Icon name="pencil" size={16} />
                  Текст
                </button>
                <button type="button" className={styles.creatorTool} onClick={() => stickerInputRef.current?.click()} disabled={!activeDraft}>
                  <Icon name="image" size={16} />
                  Стикер
                </button>
                <button type="button" className={styles.creatorTool} onClick={() => fileInputRef.current?.click()}>
                  <Icon name="plus" size={16} />
                  Ещё сторис
                </button>
              </div>
              <div className={styles.creatorSectionMuted}>Редактор базовой версии работает как drag-and-drop canvas: можно двигать элементы и менять размер, не ломая текущий media flow приложения.</div>
            </div>

            <div className={styles.creatorSection}>
              <div className={styles.creatorSectionTitle}>Виджеты Pulse</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {widgetButtons.map((button) => (
                  <button key={button.type} type="button" className={styles.creatorWidgetButton} onClick={() => addWidget(button.type)} disabled={!activeDraft}>
                    <div>
                      <div className={styles.creatorWidgetLabel}>{button.label}</div>
                      <div className={styles.creatorWidgetMeta}>{button.meta}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.creatorSection}>
              <div className={styles.creatorSectionTitle}>Свойства элемента</div>
              {!selectedItem ? <div className={styles.creatorSectionMuted}>Выберите текст или виджет на холсте, чтобы изменить его содержимое, размер и позицию.</div> : null}
              {selectedItem?.type === 'text' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <textarea className={styles.creatorTextarea} value={selectedItem.text} onChange={(event) => updateSelectedItem({ text: event.target.value })} />
                  <div className={styles.creatorRow}>
                    <input className={styles.creatorInput} type="color" value={selectedItem.color ?? '#ffffff'} onChange={(event) => updateSelectedItem({ color: event.target.value })} style={{ width: 56, padding: 4, minHeight: 44 }} />
                    <input className={styles.creatorRange} type="range" min={18} max={48} value={selectedItem.fontSize ?? 28} onChange={(event) => updateSelectedItem({ fontSize: Number(event.target.value) })} />
                  </div>
                </div>
              ) : null}
              {selectedItem?.type === 'widget' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input className={styles.creatorInput} value={selectedItem.title} onChange={(event) => updateSelectedItem({ title: event.target.value })} />
                  <input className={styles.creatorInput} value={String(selectedItem.payload?.primary ?? '')} onChange={(event) => updateSelectedItem({ payload: { ...selectedItem.payload, primary: event.target.value } })} />
                  <input className={styles.creatorInput} value={String(selectedItem.payload?.secondary ?? '')} onChange={(event) => updateSelectedItem({ payload: { ...selectedItem.payload, secondary: event.target.value } })} />
                </div>
              ) : null}
              {selectedItem?.type === 'image' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className={styles.creatorSectionMuted}>Стикер можно двигать и растягивать прямо на холсте.</div>
                  <input className={styles.creatorRange} type="range" min={0} max={28} value={selectedItem.radius ?? 18} onChange={(event) => updateSelectedItem({ radius: Number(event.target.value) })} />
                </div>
              ) : null}
              {selectedItem ? (
                <div style={{ marginTop: 10 }}>
                  <Button className={styles.creatorDanger} onClick={removeSelected}>
                    <Icon name="trash" size={16} />
                    Удалить элемент
                  </Button>
                </div>
              ) : null}
            </div>

            <div className={styles.creatorSection}>
              <div className={styles.creatorSectionTitle}>Черновик</div>
              {activeDraft ? (
                <div className={styles.compactMeta}>
                  <span>{activeDraft.mediaType.startsWith('video/') ? 'Видео' : 'Фото'}</span>
                  <span>·</span>
                  <span>{activeDraft.items.length} элементов</span>
                </div>
              ) : null}
              <div className={styles.creatorSectionMuted}>Можно добавить несколько сторис подряд и опубликовать их одной пачкой. Непросмотренные сторис друзей автоматически получат цветное кольцо по всему приложению.</div>
              {activeDraft ? (
                <div style={{ marginTop: 10 }}>
                  <Button className={styles.creatorDanger} onClick={() => removeDraft(activeDraft.id)}>
                    <Icon name="trash" size={16} />
                    Удалить текущую сторис
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <input ref={stickerInputRef} type="file" accept="image/*" hidden onChange={handleStickerInput} />
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileInput} />
    </div>
  );
}
