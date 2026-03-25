'use client';

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  useCreateHighlightMutation,
  useCreateStoriesMutation,
  useGetStoryHighlightsQuery,
} from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useGetMentalDayQuery, useGetNutritionQuery, useGetOverviewQuery, useGetTasksDayQuery } from '@/shared/api/pulseApi';
import { StoryEditorItem, StoryHighlight, StoryMediaTransform, StoryWidgetType } from '@/shared/types/story';
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
  sourceDurationMs?: number | null;
  durationMs?: number | null;
  trimStartMs?: number | null;
  trimEndMs?: number | null;
  transform: StoryMediaTransform;
  items: StoryEditorItem[];
};

type DraftHistoryState = Pick<LocalDraft, 'items' | 'transform' | 'durationMs' | 'trimStartMs' | 'trimEndMs'>;
type DrawingPoint = { x: number; y: number };
type ToolKey = 'text' | 'stickers' | 'widgets' | 'brush' | 'background' | 'media';
type MediaHandle = 'nw' | 'ne' | 'sw' | 'se';

type EnrichOptions = {
  trimStartMs?: number;
  trimEndMs?: number;
  durationMs?: number;
  transform?: StoryMediaTransform;
  items?: StoryEditorItem[];
};

const BACKGROUND_COLORS = ['#0b0b0e', '#111214', '#17181b', '#1b1d22', '#244d8f', '#2bbf8f', '#f59e0b', '#f43f5e', '#8b5cf6'];
const TOOL_BUTTONS: Array<{ key: ToolKey; label: string; icon: any }> = [
  { key: 'text', label: 'Текст', icon: 'pencil' },
  { key: 'stickers', label: 'Стикеры', icon: 'image' },
  { key: 'widgets', label: 'Виджеты', icon: 'pulse' },
  { key: 'brush', label: 'Кисть', icon: 'sparkles' },
  { key: 'background', label: 'Фон', icon: 'image' },
  { key: 'media', label: 'Медиа', icon: 'settings' },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix = 'story') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setUniformScale(transform: StoryMediaTransform, nextScale: number): StoryMediaTransform {
  return { ...transform, scale: nextScale, scaleX: nextScale, scaleY: nextScale, fitMode: 'manual' };
}

function defaultTransform(): StoryMediaTransform {
  return {
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    fitMode: 'contain',
    backgroundFill: '#111214',
    blurFill: true,
  };
}

function mediaTransformStyle(transform: StoryMediaTransform) {
  const scale = Number(transform.scale ?? 1);
  const scaleX = Number(transform.scaleX ?? scale);
  const scaleY = Number(transform.scaleY ?? scale);
  const rotation = Number(transform.rotation ?? 0);
  const offsetX = Number(transform.offsetX ?? 0);
  const offsetY = Number(transform.offsetY ?? 0);
  const fitMode = transform.fitMode ?? 'contain';
  const manual = fitMode === 'manual';
  return {
    transform: manual
      ? `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`
      : `rotate(${rotation}deg)`,
    objectFit: manual ? 'contain' : (fitMode === 'cover' ? 'cover' : 'contain') as 'contain' | 'cover',
  };
}

function getManualMediaRect(draft: LocalDraft | null, canvasWidth: number, canvasHeight: number) {
  if (!draft || !canvasWidth || !canvasHeight) return null;
  const mediaWidth = Math.max(1, Number(draft.width ?? canvasWidth));
  const mediaHeight = Math.max(1, Number(draft.height ?? canvasHeight));
  const baseScale = Math.min(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
  const baseWidth = mediaWidth * baseScale;
  const baseHeight = mediaHeight * baseScale;
  const scaleX = Number(draft.transform.scaleX ?? draft.transform.scale ?? 1);
  const scaleY = Number(draft.transform.scaleY ?? draft.transform.scale ?? 1);
  const width = baseWidth * scaleX;
  const height = baseHeight * scaleY;
  const left = (canvasWidth - width) / 2 + Number(draft.transform.offsetX ?? 0);
  const top = (canvasHeight - height) / 2 + Number(draft.transform.offsetY ?? 0);
  return { left, top, width, height };
}

function cloneHistoryState(draft: LocalDraft): DraftHistoryState {
  return JSON.parse(JSON.stringify({
    items: draft.items,
    transform: draft.transform,
    durationMs: draft.durationMs,
    trimStartMs: draft.trimStartMs,
    trimEndMs: draft.trimEndMs,
  }));
}

async function enrichFile(file: File, options: EnrichOptions = {}): Promise<LocalDraft> {
  const id = makeId();
  const url = URL.createObjectURL(file);
  const base: LocalDraft = {
    id,
    file,
    url,
    mediaType: file.type || 'image/*',
    transform: { ...defaultTransform(), ...(options.transform ?? {}) },
    items: options.items ?? [],
  };

  if (file.type.startsWith('image/')) {
    const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    return {
      ...base,
      width: size?.width ?? null,
      height: size?.height ?? null,
      sourceDurationMs: 30000,
      trimStartMs: 0,
      trimEndMs: options.durationMs ?? 8000,
      durationMs: options.durationMs ?? 8000,
    };
  }

  if (file.type.startsWith('video/')) {
    const meta = await new Promise<{ width: number; height: number; durationMs: number } | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          durationMs: Math.max(1000, Math.round((video.duration || 15) * 1000)),
        });
      };
      video.onerror = () => resolve(null);
      video.src = url;
    });
    const sourceDurationMs = meta?.durationMs ?? 15000;
    const trimStartMs = options.trimStartMs ?? 0;
    const trimEndMs = options.trimEndMs ?? Math.min(sourceDurationMs, trimStartMs + 30000);
    return {
      ...base,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      sourceDurationMs,
      trimStartMs,
      trimEndMs,
      durationMs: options.durationMs ?? Math.min(30000, trimEndMs - trimStartMs),
    };
  }

  return base;
}

async function extractVideoFrames(url: string, durationMs: number, count = 10) {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 214;
  const ctx = canvas.getContext('2d');
  const frames: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = Math.min(Math.max((durationMs / 1000) * (index / Math.max(1, count - 1)), 0), Math.max(0, video.duration - 0.15));
    await new Promise<void>((resolve) => {
      video.currentTime = time;
      video.onseeked = () => {
        try {
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.72));
        } catch {
          frames.push('');
        }
        resolve();
      };
    });
  }
  return frames;
}

function widgetPreset(type: StoryWidgetType, source: any) {
  const map: Record<StoryWidgetType, { title: string; primary: string; secondary: string }> = {
    pulse: { title: 'Pulse дня', primary: `${source?.overview?.today?.dayScore ?? '—'}`, secondary: `Фокус: ${source?.overview?.today?.recommendations?.[0] ?? 'день в балансе'}` },
    focus: { title: 'Фокус дня', primary: `${source?.overview?.today?.recommendations?.[0] ?? 'Одна главная задача'}`, secondary: `${source?.overview?.today?.tasksDone ?? 0} из ${source?.overview?.today?.tasksTotal ?? 0} задач` },
    health: { title: 'Здоровье', primary: `${source?.mental?.day?.todayScore ?? source?.overview?.today?.mental7Score ?? '—'}`, secondary: `Сон ${source?.mental?.day?.sleepHours ?? '—'} ч · Стресс ${source?.mental?.day?.stress ?? '—'}` },
    tasks: { title: 'Прогресс дня', primary: `${source?.tasks?.summary?.percent ?? source?.overview?.today?.tasksPercent ?? 0}%`, secondary: `${source?.tasks?.summary?.completed ?? 0}/${source?.tasks?.summary?.total ?? 0} выполнено` },
    nutrition: { title: 'Питание', primary: `${source?.nutrition?.totalCalories ?? source?.overview?.nutrition?.totalCalories ?? 0} ккал`, secondary: `Осталось ${source?.nutrition?.remainingCalories ?? source?.overview?.nutrition?.remainingCalories ?? 0}` },
  };
  return map[type];
}

function makeSvgOverlay(points: DrawingPoint[], stroke = '#ffffff') {
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatMs(value: number) {
  return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} с`;
}

export function StoryCreator({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (userId: string) => void; }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickerInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const trimTrackRef = useRef<HTMLDivElement | null>(null);
  const previousUrlsRef = useRef<string[]>([]);
  const [canvasMetrics, setCanvasMetrics] = useState({ width: 0, height: 0 });
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [history, setHistory] = useState<Record<string, DraftHistoryState[]>>({});
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mediaSelected, setMediaSelected] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolKey>('text');
  const [toolOpen, setToolOpen] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<DrawingPoint[]>([]);
  const [drawColor, setDrawColor] = useState('#ffffff');
  const [highlightId, setHighlightId] = useState('');
  const [newHighlightTitle, setNewHighlightTitle] = useState('');
  const [videoFrames, setVideoFrames] = useState<Record<string, string[]>>({});
  const drawActiveRef = useRef(false);

  const [createStories, createState] = useCreateStoriesMutation();
  const [createHighlight] = useCreateHighlightMutation();
  const { data: meData } = useGetMeQuery();
  const today = useMemo(() => todayIso(), []);
  const { data: overviewData } = useGetOverviewQuery(undefined, { skip: !open });
  const { data: mentalData } = useGetMentalDayQuery(today, { skip: !open });
  const { data: tasksData } = useGetTasksDayQuery(today, { skip: !open });
  const { data: nutritionData } = useGetNutritionQuery(today, { skip: !open });
  const { data: highlightsData } = useGetStoryHighlightsQuery({ userId: meData?.user?.id ?? '' }, { skip: !open || !meData?.user?.id, pollingInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true });

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null;
  const selectedItem = activeDraft?.items.find((item) => item.id === selectedItemId) ?? null;
  const highlightItems = highlightsData?.items ?? [];

  useEffect(() => {
    const enableBrush = activeTool === 'brush' && toolOpen;
    setDrawMode(enableBrush);
    if (!enableBrush) {
      drawActiveRef.current = false;
      setDrawPoints([]);
    }
  }, [activeTool, toolOpen]);

  useEffect(() => {
    if (!open) return;
    if (!activeDraftId && drafts[0]) setActiveDraftId(drafts[0].id);
  }, [open, activeDraftId, drafts]);

  useEffect(() => {
    const target = activeDraft;
    if (!target || !target.mediaType.startsWith('video/') || videoFrames[target.id]?.length) return;
    let cancelled = false;
    extractVideoFrames(target.url, Number(target.sourceDurationMs ?? target.durationMs ?? 15000)).then((frames) => {
      if (!cancelled) setVideoFrames((prev) => ({ ...prev, [target.id]: frames.filter(Boolean) }));
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [activeDraft, videoFrames]);

  useEffect(() => {
    const previous = previousUrlsRef.current;
    const current = drafts.map((draft) => draft.url);
    previous.filter((url) => !current.includes(url)).forEach((url) => URL.revokeObjectURL(url));
    previousUrlsRef.current = current;
  }, [drafts]);

  useEffect(() => () => {
    previousUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const element = canvasRef.current;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setCanvasMetrics({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [activeDraftId, open]);

  const rememberDraft = (draftId: string) => {
    const current = drafts.find((entry) => entry.id === draftId);
    if (!current) return;
    setHistory((prev) => ({ ...prev, [draftId]: [...(prev[draftId] ?? []), cloneHistoryState(current)].slice(-40) }));
  };

  const updateDraft = (draftId: string, updater: (draft: LocalDraft) => LocalDraft, recordHistory = true) => {
    if (recordHistory) rememberDraft(draftId);
    setDrafts((prev) => prev.map((draft) => (draft.id === draftId ? updater(draft) : draft)));
  };

  const undoDraft = (draftId: string) => {
    const stack = history[draftId] ?? [];
    const previous = stack[stack.length - 1];
    if (!previous) return;
    setHistory((prev) => ({ ...prev, [draftId]: (prev[draftId] ?? []).slice(0, -1) }));
    setDrafts((prev) => prev.map((draft) => draft.id === draftId ? {
      ...draft,
      items: previous.items,
      transform: previous.transform,
      durationMs: previous.durationMs,
      trimStartMs: previous.trimStartMs,
      trimEndMs: previous.trimEndMs,
    } : draft));
  };

  const resetDraft = (draftId: string) => {
    const current = drafts.find((entry) => entry.id === draftId);
    if (!current) return;
    updateDraft(draftId, (draft) => ({
      ...draft,
      items: [],
      transform: defaultTransform(),
      trimStartMs: 0,
      trimEndMs: Math.min(Number(draft.sourceDurationMs ?? draft.durationMs ?? 8000), draft.mediaType.startsWith('video/') ? 30000 : Number(draft.durationMs ?? 8000)),
      durationMs: Math.min(draft.mediaType.startsWith('video/') ? 30000 : Number(draft.durationMs ?? 8000), Number(draft.sourceDurationMs ?? draft.durationMs ?? 8000)),
    }));
    setSelectedItemId(null);
    setMediaSelected(true);
  };

  const handleAddFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    const acceptable = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!acceptable.length) return;
    setErrorText(null);
    const nextDrafts: LocalDraft[] = [];
    for (const file of acceptable) {
      if (file.size > 1000 * 1024 * 1024) {
        setErrorText(`Файл ${file.name} превышает лимит 1000 МБ.`);
        continue;
      }
      const draft = await enrichFile(file);
      if (draft.mediaType.startsWith('video/') && Number(draft.sourceDurationMs ?? 0) > 120000) {
        setErrorText(`Видео ${file.name} длиннее 2 минут.`);
        URL.revokeObjectURL(draft.url);
        continue;
      }
      nextDrafts.push(draft);
    }
    if (!nextDrafts.length) return;
    setDrafts((prev) => [...prev, ...nextDrafts]);
    setActiveDraftId(nextDrafts[nextDrafts.length - 1]?.id ?? null);
    setSelectedItemId(null);
    setMediaSelected(true);
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
    const id = makeId('item');
    updateDraft(activeDraft.id, (draft) => ({ ...draft, items: [...draft.items, { id, type: 'image', x: 20, y: 18, w: 36, h: 22, src, radius: 18 }] }));
    setSelectedItemId(id);
    setActiveTool('stickers');
    setToolOpen(true);
  };

  const addText = () => {
    if (!activeDraft) return;
    const id = makeId('item');
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, { id, type: 'text', x: 12, y: 16, w: 76, h: 18, text: 'Введите текст', color: '#ffffff', fontSize: 30, align: 'left' }],
    }));
    setSelectedItemId(id);
    setActiveTool('text');
    setToolOpen(true);
  };

  const addTextAt = (x: number, y: number) => {
    if (!activeDraft) return;
    const id = makeId('item');
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, { id, type: 'text', x: clamp(x - 20, 4, 76), y: clamp(y - 6, 4, 82), w: 40, h: 12, text: 'Текст', color: '#ffffff', fontSize: 30, align: 'left' }],
    }));
    setSelectedItemId(id);
    setMediaSelected(false);
    setToolOpen(true);
  };

  const addWidget = (type: StoryWidgetType) => {
    if (!activeDraft) return;
    const preset = widgetPreset(type, { overview: overviewData, mental: mentalData, tasks: tasksData, nutrition: nutritionData });
    const id = makeId('item');
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, { id, type: 'widget', x: 10, y: 18, w: 78, h: 22, widgetType: type, title: preset.title, payload: { primary: preset.primary, secondary: preset.secondary } }],
    }));
    setSelectedItemId(id);
    setActiveTool('widgets');
    setToolOpen(true);
  };

  const removeSelected = () => {
    if (!activeDraft || !selectedItem) return;
    updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.filter((item) => item.id !== selectedItem.id) }));
    setSelectedItemId(null);
  };

  const removeDraft = (draftId: string) => {
    const target = drafts.find((entry) => entry.id === draftId);
    if (target) URL.revokeObjectURL(target.url);
    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    setHistory((prev) => { const copy = { ...prev }; delete copy[draftId]; return copy; });
    if (activeDraftId === draftId) {
      const rest = drafts.filter((draft) => draft.id !== draftId);
      setActiveDraftId(rest[0]?.id ?? null);
      setSelectedItemId(null);
      setMediaSelected(Boolean(rest[0]));
    }
  };

  const beginTransform = (itemId: string, mode: 'move' | 'resize', origin: { clientX: number; clientY: number }) => {
    if (!activeDraft || !canvasRef.current) return;
    const target = activeDraft.items.find((item) => item.id === itemId);
    if (!target) return;
    rememberDraft(activeDraft.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const start = { x: target.x, y: target.y, w: target.w, h: target.h };
    const onMove = (event: PointerEvent) => {
      const dx = ((event.clientX - origin.clientX) / rect.width) * 100;
      const dy = ((event.clientY - origin.clientY) / rect.height) * 100;
      setDrafts((prev) => prev.map((draft) => draft.id !== activeDraft.id ? draft : {
        ...draft,
        items: draft.items.map((item) => {
          if (item.id !== itemId) return item;
          if (mode === 'move') return { ...item, x: clamp(start.x + dx, 0, 100 - start.w), y: clamp(start.y + dy, 0, 100 - start.h) } as StoryEditorItem;
          return { ...item, w: clamp(start.w + dx, 12, 100 - start.x), h: clamp(start.h + dy, 10, 100 - start.y) } as StoryEditorItem;
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

  const beginMediaTransform = (mode: 'move' | 'resize', origin: { clientX: number; clientY: number }, handle: MediaHandle = 'se') => {
    if (!activeDraft || !canvasRef.current) return;
    rememberDraft(activeDraft.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const start = {
      offsetX: Number(activeDraft.transform.offsetX ?? 0),
      offsetY: Number(activeDraft.transform.offsetY ?? 0),
      scale: Number(activeDraft.transform.scaleX ?? activeDraft.transform.scale ?? 1),
    };
    const onMove = (event: PointerEvent) => {
      const dxPx = event.clientX - origin.clientX;
      const dyPx = event.clientY - origin.clientY;
      setDrafts((prev) => prev.map((draft) => draft.id !== activeDraft.id ? draft : {
        ...draft,
        transform: mode === 'move'
          ? { ...draft.transform, fitMode: 'manual', offsetX: start.offsetX + dxPx, offsetY: start.offsetY + dyPx }
          : (() => {
              const dirX = handle === 'ne' || handle === 'se' ? 1 : -1;
              const dirY = handle === 'sw' || handle === 'se' ? 1 : -1;
              const influence = Math.abs(dxPx) > Math.abs(dyPx) ? (dxPx / rect.width) * dirX : (dyPx / rect.height) * dirY;
              const nextScale = clamp(start.scale + influence, 0.35, 3.4);
              return setUniformScale(draft.transform, nextScale);
            })(),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleClose = () => {
    drafts.forEach((draft) => URL.revokeObjectURL(draft.url));
    setDrafts([]);
    setHistory({});
    setActiveDraftId(null);
    setSelectedItemId(null);
    setMediaSelected(false);
    setDrawMode(false);
    setDrawPoints([]);
    setHighlightId('');
    setNewHighlightTitle('');
    setErrorText(null);
    onClose();
  };

  const setTrimRange = (startMs: number, endMs: number) => {
    if (!activeDraft) return;
    const source = Number(activeDraft.sourceDurationMs ?? 0);
    let start = clamp(startMs, 0, Math.max(0, source - 1000));
    let end = clamp(endMs, start + 1000, source || endMs);
    if (end - start > 30000) {
      if (start !== Number(activeDraft.trimStartMs ?? 0)) end = start + 30000;
      else start = end - 30000;
    }
    updateDraft(activeDraft.id, (draft) => ({ ...draft, trimStartMs: start, trimEndMs: end, durationMs: end - start }));
  };

  const beginTrimDrag = (edge: 'start' | 'end', originClientX: number) => {
    if (!activeDraft || !trimTrackRef.current) return;
    const sourceDuration = Number(activeDraft.sourceDurationMs ?? 0);
    if (!sourceDuration) return;
    rememberDraft(activeDraft.id);
    const rect = trimTrackRef.current.getBoundingClientRect();
    const initialStart = Number(activeDraft.trimStartMs ?? 0);
    const initialEnd = Number(activeDraft.trimEndMs ?? activeDraft.durationMs ?? sourceDuration);
    const onMove = (event: PointerEvent) => {
      const deltaMs = ((event.clientX - originClientX) / Math.max(1, rect.width)) * sourceDuration;
      if (edge === 'start') setTrimRange(initialStart + deltaMs, initialEnd);
      else setTrimRange(initialStart, initialEnd + deltaMs);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const splitActiveVideo = async () => {
    if (!activeDraft || !activeDraft.mediaType.startsWith('video/') || !(activeDraft.sourceDurationMs && activeDraft.sourceDurationMs > 30000)) return;
    const segments: LocalDraft[] = [];
    for (let start = 0; start < activeDraft.sourceDurationMs; start += 30000) {
      const end = Math.min(activeDraft.sourceDurationMs, start + 30000);
      segments.push(await enrichFile(activeDraft.file, {
        trimStartMs: start,
        trimEndMs: end,
        durationMs: end - start,
        transform: activeDraft.transform,
        items: [],
      }));
    }
    removeDraft(activeDraft.id);
    setDrafts((prev) => [...prev, ...segments]);
    setActiveDraftId(segments[0]?.id ?? null);
    setSelectedItemId(null);
    setMediaSelected(true);
  };

  const publish = async () => {
    if (!drafts.length || !meData?.user?.id) return;
    let resolvedHighlightId = highlightId || null;
    if (!resolvedHighlightId && newHighlightTitle.trim()) {
      const created = await createHighlight({ title: newHighlightTitle.trim() }).unwrap().catch(() => null);
      resolvedHighlightId = created?.highlight?.id ?? null;
    }
    const files = drafts.map((draft) => draft.file);
    const payloadDrafts = drafts.map((draft) => ({
      durationMs: draft.durationMs,
      width: draft.width,
      height: draft.height,
      itemsJson: draft.items,
      trimStartMs: draft.trimStartMs,
      trimEndMs: draft.trimEndMs,
      sourceDurationMs: draft.sourceDurationMs,
      transformJson: draft.transform,
    }));
    const result = await createStories({
      files,
      drafts: payloadDrafts,
      highlightTarget: resolvedHighlightId ? { highlightId: resolvedHighlightId } : (newHighlightTitle.trim() ? { title: newHighlightTitle.trim() } : null),
    }).unwrap().catch(() => null);
    if (!result) return;
    const meId = meData.user.id;
    handleClose();
    onCreated(meId);
  };

  const startDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    drawActiveRef.current = true;
    setSelectedItemId(null);
    setMediaSelected(false);
    setDrawPoints([{ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }]);
  };

  const moveDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawMode || !drawActiveRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrawPoints((prev) => [...prev, { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 }]);
  };

  const endDrawing = () => {
    if (!drawMode || !drawActiveRef.current || !activeDraft) return;
    drawActiveRef.current = false;
    if (drawPoints.length < 2) {
      setDrawPoints([]);
      return;
    }
    const id = makeId('item');
    const src = makeSvgOverlay(drawPoints, drawColor);
    updateDraft(activeDraft.id, (draft) => ({ ...draft, items: [...draft.items, { id, type: 'image', x: 0, y: 0, w: 100, h: 100, src, radius: 0 }] }));
    setSelectedItemId(id);
    setDrawPoints([]);
    setDrawMode(false);
  };

  const mediaSelectionRect = getManualMediaRect(activeDraft, canvasMetrics.width, canvasMetrics.height);

  if (!open) return null;

  const currentFrames = activeDraft ? (videoFrames[activeDraft.id] ?? []) : [];
  const trimStart = Number(activeDraft?.trimStartMs ?? 0);
  const trimEnd = Number(activeDraft?.trimEndMs ?? activeDraft?.durationMs ?? 0);
  const trimLength = Math.max(0, trimEnd - trimStart);
  const selectedIsVector = selectedItem?.type === 'image' && selectedItem.src.startsWith('data:image/svg+xml');
  const selectedInspector = selectedItem ? selectedItem.type : null;

  return (
    <div className={styles.creatorBackdrop} role="dialog" aria-modal="true">
      <div className={styles.creatorModern}>
        <div className={styles.creatorHeaderModern}>
          <div className={styles.creatorLeftMeta}>
            <Button variant="ghost" onClick={handleClose} iconOnly aria-label="Назад"><Icon name="arrowLeft" size={18} /></Button>
            <div>
              <div className={styles.creatorTitle}>Новая сторис</div>
              <div className={styles.creatorSub}>До 2 минут исходного видео · публикация фрагмента до 30 секунд</div>
            </div>
          </div>
          <div className={styles.creatorActions}>
            <Button variant="ghost" onClick={() => activeDraft ? undoDraft(activeDraft.id) : null} disabled={!activeDraft || !(history[activeDraft.id]?.length)} iconOnly aria-label="Вернуть назад"><Icon name="arrowLeft" size={18} /></Button>
            <Button variant="ghost" onClick={() => activeDraft ? resetDraft(activeDraft.id) : null} disabled={!activeDraft} aria-label="Сбросить всё">Сбросить</Button>
            <Button variant="primary" onClick={publish} loading={createState.isLoading} disabled={!drafts.length}>Опубликовать</Button>
          </div>
        </div>

        <div className={styles.creatorMainModern}>
          <section className={styles.creatorStageShell}>
            {!activeDraft ? (
              <label
                className={styles.creatorPhoneEmpty}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); void handleAddFiles(event.dataTransfer.files); }}
              >
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileInput} />
                <span className={styles.creatorBigPlus}><Icon name="plus" size={42} /></span>
                <div className={styles.creatorEmptyTitle}>Добавить сторис</div>
                <div className={styles.creatorEmptyText}>Нажми или перетащи файл в вертикальный кадр</div>
              </label>
            ) : (
              <>
              <div className={styles.creatorStageWrap}>
                <div
                  ref={canvasRef}
                  className={[styles.creatorPhoneCanvas, drawMode ? styles.creatorCanvasDrawing : '', activeTool === 'text' && toolOpen ? styles.creatorCanvasTextMode : ''].filter(Boolean).join(' ')}
                  style={{ background: activeDraft.transform.backgroundFill ?? '#111214' }}
                  onPointerDown={(event) => {
                    if (drawMode) return startDrawing(event);
                    if (activeTool === 'text' && toolOpen && canvasRef.current) {
                      const rect = canvasRef.current.getBoundingClientRect();
                      const x = ((event.clientX - rect.left) / rect.width) * 100;
                      const y = ((event.clientY - rect.top) / rect.height) * 100;
                      addTextAt(x, y);
                      return;
                    }
                    setSelectedItemId(null);
                    setMediaSelected(activeTool === 'media');
                  }}
                  onPointerMove={moveDrawing}
                  onPointerUp={endDrawing}
                  onPointerLeave={() => { if (drawActiveRef.current) endDrawing(); }}
                >
                  <div className={styles.creatorMediaBackdrop} style={{ background: activeDraft.transform.backgroundFill ?? '#111214' }} />
                  {activeDraft.transform.blurFill !== false && (activeDraft.transform.fitMode ?? 'contain') !== 'cover' ? (
                    <div className={styles.creatorMediaBlurFrame}>
                      {activeDraft.mediaType.startsWith('video/') ? (
                        <video src={activeDraft.url} className={styles.creatorMediaBlurVideo} playsInline muted autoPlay loop style={{ objectFit: 'cover' }} draggable={false} />
                      ) : (
                        <img src={activeDraft.url} alt="Фон сторис" className={styles.creatorMediaBlur} style={{ objectFit: 'cover' }} draggable={false} />
                      )}
                    </div>
                  ) : null}
                  <div className={styles.creatorMediaFrame}>
                    {activeDraft.mediaType.startsWith('video/') ? (
                      <video src={activeDraft.url} className={styles.creatorMediaVideo} playsInline muted autoPlay loop style={mediaTransformStyle(activeDraft.transform)} draggable={false} />
                    ) : (
                      <img src={activeDraft.url} alt="Черновик сторис" className={styles.creatorMedia} style={mediaTransformStyle(activeDraft.transform)} draggable={false} />
                    )}
                  </div>

                  {(mediaSelected || activeTool === 'media') && activeDraft.transform.fitMode === 'manual' && mediaSelectionRect ? (
                    <div
                      className={styles.creatorMediaSelection}
                      style={{ left: mediaSelectionRect.left, top: mediaSelectionRect.top, width: mediaSelectionRect.width, height: mediaSelectionRect.height }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setMediaSelected(true);
                        beginMediaTransform('move', { clientX: event.clientX, clientY: event.clientY });
                      }}
                    >
                      {(['nw', 'ne', 'sw', 'se'] as MediaHandle[]).map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          className={[styles.creatorCornerHandle, handle === 'nw' ? styles.creatorCornerHandleNW : handle === 'ne' ? styles.creatorCornerHandleNE : handle === 'sw' ? styles.creatorCornerHandleSW : styles.creatorCornerHandleSE].filter(Boolean).join(' ')}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setMediaSelected(true);
                            beginMediaTransform('resize', { clientX: event.clientX, clientY: event.clientY }, handle);
                          }}
                          aria-label="Изменить размер медиа"
                        />
                      ))}
                    </div>
                  ) : null}

                  {activeDraft.items.map((item) => {
                    const commonStyle = { left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` } as const;
                    const selected = item.id === selectedItemId;
                    const isDraw = item.type === 'image' && item.src.startsWith('data:image/svg+xml');
                    return (
                      <div
                        key={item.id}
                        className={[
                          styles.creatorItem,
                          selected ? styles.creatorItemSelected : '',
                          item.type === 'text' ? styles.creatorTextItem : '',
                          item.type === 'widget' ? styles.creatorWidgetItem : '',
                          item.type === 'image' ? styles.creatorImageItem : '',
                          isDraw ? styles.creatorStrokeItem : '',
                        ].filter(Boolean).join(' ')}
                        style={{ ...commonStyle, borderRadius: item.type === 'image' ? `${item.radius ?? 18}px` : undefined }}
                        onPointerDown={(event) => {
                          if (drawMode) return;
                          event.stopPropagation();
                          setMediaSelected(false);
                          setSelectedItemId(item.id);
                          beginTransform(item.id, 'move', { clientX: event.clientX, clientY: event.clientY });
                        }}
                      >
                        {item.type === 'text' ? <div style={{ color: item.color ?? '#fff', fontSize: item.fontSize ?? 28, textAlign: (item.align ?? 'left') as any }}>{item.text}</div> : null}
                        {item.type === 'widget' ? <><div className={styles.viewerWidgetTitle}>{item.title}</div><div className={styles.viewerWidgetValue}>{String(item.payload?.primary ?? '—')}</div><div className={styles.viewerWidgetSub}>{String(item.payload?.secondary ?? '')}</div></> : null}
                        {item.type === 'image' ? <img src={item.src} alt="Элемент сторис" draggable={false} /> : null}
                        {!isDraw ? (
                          <button
                            type="button"
                            className={styles.creatorResizeHandle}
                            onPointerDown={(event) => { event.stopPropagation(); setSelectedItemId(item.id); beginTransform(item.id, 'resize', { clientX: event.clientX, clientY: event.clientY }); }}
                            aria-label="Изменить размер элемента"
                          />
                        ) : null}
                      </div>
                    );
                  })}

                  {drawPoints.length > 1 ? (
                    <svg className={styles.creatorDrawLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d={drawPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} fill="none" stroke={drawColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>

                {activeDraft.mediaType.startsWith('video/') ? (
                  <div className={styles.creatorTrimPanel}>
                    <div ref={trimTrackRef} className={styles.creatorTrimFrames}>
                      {(currentFrames.length ? currentFrames : Array.from({ length: 10 }).map(() => '')).map((frame, index) => frame ? <img key={`${frame}-${index}`} src={frame} alt="" draggable={false} /> : <div key={`frame-${index}`} className={styles.creatorVideoFramePlaceholder} />)}
                      <div
                        className={styles.creatorVideoSelection}
                        style={{
                          left: `${(trimStart / Math.max(1, Number(activeDraft.sourceDurationMs ?? 1))) * 100}%`,
                          width: `${(trimLength / Math.max(1, Number(activeDraft.sourceDurationMs ?? 1))) * 100}%`,
                        }}
                      >
                        <button type="button" className={[styles.creatorTrimHandle, styles.creatorTrimHandleStart].join(' ')} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); beginTrimDrag('start', event.clientX); }} aria-label="Сдвинуть начало видео" />
                        <button type="button" className={[styles.creatorTrimHandle, styles.creatorTrimHandleEnd].join(' ')} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); beginTrimDrag('end', event.clientX); }} aria-label="Сдвинуть конец видео" />
                      </div>
                    </div>
                    <div className={styles.creatorTrimMeta}>{formatMs(trimStart)} — {formatMs(trimEnd)} · итог {formatMs(trimLength)} / максимум 30 с</div>
                    {(activeDraft.sourceDurationMs ?? 0) > 30000 ? <Button size="sm" onClick={() => void splitActiveVideo()}>Разбить длинное видео на сторис</Button> : null}
                  </div>
                ) : null}
              </div>

            <div className={styles.creatorBottomStrip}>
              {drafts.map((draft, index) => (
                <div key={draft.id} className={[styles.creatorThumbBottom, activeDraft?.id === draft.id ? styles.creatorThumbActive : ''].filter(Boolean).join(' ')}>
                  <button type="button" className={styles.creatorThumbButton} onClick={() => { setActiveDraftId(draft.id); setSelectedItemId(null); setMediaSelected(true); }}>
                    {draft.mediaType.startsWith('video/') ? <video src={draft.url} muted playsInline className={styles.creatorThumbMedia} draggable={false} /> : <img src={draft.url} alt={`Черновик ${index + 1}`} className={styles.creatorThumbMedia} draggable={false} />}
                  </button>
                  <button type="button" className={styles.creatorThumbRemove} onClick={() => removeDraft(draft.id)} aria-label="Удалить черновик сторис"><Icon name="close" size={14} /></button>
                </div>
              ))}
              <button
                type="button"
                className={styles.creatorAddBottom}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); void handleAddFiles(event.dataTransfer.files); }}
                aria-label="Добавить ещё сторис"
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {errorText ? <div className={styles.creatorError}>{errorText}</div> : null}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileInput} />
            <input ref={stickerInputRef} type="file" accept="image/*" hidden onChange={handleStickerInput} />
              </>
            )}
          </section>

          <aside className={styles.creatorSideWrapModern}>
            {toolOpen ? (
              <div className={styles.creatorInspectorPanel}>
                {selectedInspector === 'text' && selectedItem?.type === 'text' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>Текст</div><Button variant="ghost" size="sm" onClick={removeSelected}>Удалить</Button></div>
                    <textarea className={styles.creatorTextarea} value={selectedItem.text} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, text: event.target.value } : item) }))} />
                    <div className={styles.creatorField}><span>Размер текста</span><input type="range" min="18" max="72" step="1" value={Number(selectedItem.fontSize ?? 28)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, fontSize: Number(event.target.value) } : item) }))} /></div>
                    <div className={styles.creatorField}><span>Цвет текста</span><input type="color" value={selectedItem.color ?? '#ffffff'} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, color: event.target.value } : item) }))} /></div>
                  </div>
                ) : selectedInspector === 'widget' && selectedItem?.type === 'widget' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>Виджет</div><Button variant="ghost" size="sm" onClick={removeSelected}>Удалить</Button></div>
                    <div className={styles.creatorField}><span>Заголовок</span><input className={styles.creatorInput} value={selectedItem.title} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, title: event.target.value } : item) }))} /></div>
                    <div className={styles.creatorField}><span>Ширина</span><input type="range" min="28" max="90" step="1" value={Number(selectedItem.w)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, w: Number(event.target.value) } : item) }))} /></div>
                    <div className={styles.creatorField}><span>Высота</span><input type="range" min="14" max="42" step="1" value={Number(selectedItem.h)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, h: Number(event.target.value) } : item) }))} /></div>
                  </div>
                ) : selectedInspector === 'image' && selectedItem?.type === 'image' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>{selectedIsVector ? 'Рисунок' : 'Стикер'}</div><Button variant="ghost" size="sm" onClick={removeSelected}>Удалить</Button></div>
                    {!selectedIsVector ? <div className={styles.creatorField}><span>Скругление</span><input type="range" min="0" max="40" step="1" value={Number(selectedItem.radius ?? 18)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, radius: Number(event.target.value) } : item) }))} /></div> : null}
                    <div className={styles.creatorField}><span>Ширина</span><input type="range" min="10" max="100" step="1" value={Number(selectedItem.w)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, w: Number(event.target.value) } : item) }))} /></div>
                    <div className={styles.creatorField}><span>Высота</span><input type="range" min="10" max="100" step="1" value={Number(selectedItem.h)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, h: Number(event.target.value) } : item) }))} /></div>
                  </div>
                ) : activeTool === 'text' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>Текст</div><Button variant={activeTool === 'text' ? 'primary' : 'ghost'} size="sm" onClick={() => { setActiveTool('text'); setToolOpen(true); }}>Курсор текста</Button></div>
                    <div className={styles.creatorPanelMuted}>Нажми на любую точку кадра, чтобы поставить текст именно туда. После смены инструмента режим ввода отключится.</div>
                  </div>
                ) : activeTool === 'stickers' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>Стикеры</div><Button variant="ghost" size="sm" onClick={() => stickerInputRef.current?.click()}>Добавить</Button></div>
                    <div className={styles.creatorPanelMuted}>Добавляй изображения как стикеры и меняй их размер прямо на холсте.</div>
                  </div>
                ) : activeTool === 'widgets' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelTitle}>Виджеты Pulse</div>
                    <div className={styles.creatorWidgetGrid}>
                      {(['pulse', 'focus', 'health', 'tasks', 'nutrition'] as StoryWidgetType[]).map((type) => (
                        <button key={type} type="button" className={styles.creatorChip} onClick={() => addWidget(type)}>
                          <span>{widgetPreset(type, { overview: overviewData, mental: mentalData, tasks: tasksData, nutrition: nutritionData }).title}</span>
                          <small>Добавить виджет</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : activeTool === 'brush' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelHeader}><div className={styles.creatorPanelTitle}>Кисть</div><Button variant={drawMode ? 'primary' : 'ghost'} size="sm" onClick={() => { setActiveTool(drawMode ? 'media' : 'brush'); setToolOpen(true); }}>{drawMode ? 'Выключить' : 'Рисовать'}</Button></div>
                    <div className={styles.creatorField}><span>Цвет</span><input type="color" value={drawColor} onChange={(event) => setDrawColor(event.target.value)} /></div>
                    <div className={styles.creatorPanelMuted}>После выбора кисти сразу рисуй поверх сторис. Смена инструмента автоматически отключит рисование.</div>
                  </div>
                ) : activeTool === 'background' ? (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelTitle}>Фон</div>
                    <div className={styles.creatorColorGrid}>{BACKGROUND_COLORS.map((color) => <button key={color} type="button" className={[styles.creatorColorSwatch, (activeDraft?.transform.backgroundFill ?? '#111214') === color ? styles.creatorColorSwatchActive : ''].filter(Boolean).join(' ')} style={{ background: color }} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, backgroundFill: color } }))} />)}</div>
                    <div className={styles.creatorField}><span>Размытый фон</span><div className={styles.creatorToggleRow}><button type="button" className={[styles.creatorModeButton, activeDraft?.transform.blurFill !== false ? styles.creatorModeButtonActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, blurFill: true } }))}>Вкл</button><button type="button" className={[styles.creatorModeButton, activeDraft?.transform.blurFill === false ? styles.creatorModeButtonActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, blurFill: false } }))}>Выкл</button></div></div>
                  </div>
                ) : (
                  <div className={styles.creatorPanel}>
                    <div className={styles.creatorPanelTitle}>Медиа</div>
                    <div className={styles.creatorField}><span>Режим</span><div className={styles.creatorToggleRow}><button type="button" className={[styles.creatorModeButton, (activeDraft?.transform.fitMode ?? 'contain') === 'contain' ? styles.creatorModeButtonActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: 'contain' } }))}>Вписать</button><button type="button" className={[styles.creatorModeButton, activeDraft?.transform.fitMode === 'cover' ? styles.creatorModeButtonActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: 'cover' } }))}>Во весь кадр</button><button type="button" className={[styles.creatorModeButton, activeDraft?.transform.fitMode === 'manual' ? styles.creatorModeButtonActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: 'manual' } }))}>Вручную</button></div></div>
                    <div className={styles.creatorField}><span>Поворот</span><input type="range" min="-45" max="45" step="1" value={Number(activeDraft?.transform.rotation ?? 0)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, rotation: Number(event.target.value) } }))} /></div>
                    <div className={styles.creatorField}><span>Масштаб</span><input type="range" min="0.4" max="3" step="0.01" value={Number(activeDraft?.transform.scaleX ?? activeDraft?.transform.scale ?? 1)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: setUniformScale(draft.transform, Number(event.target.value)) }))} /></div>
                    <div className={styles.creatorField}><span>Смещение X</span><input type="range" min="-220" max="220" step="1" value={Number(activeDraft?.transform.offsetX ?? 0)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: 'manual', offsetX: Number(event.target.value) } }))} /></div>
                    <div className={styles.creatorField}><span>Смещение Y</span><input type="range" min="-320" max="320" step="1" value={Number(activeDraft?.transform.offsetY ?? 0)} onChange={(event) => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: 'manual', offsetY: Number(event.target.value) } }))} /></div>
                  </div>
                )}

                <div className={styles.creatorPanel}>
                  <div className={styles.creatorPanelTitle}>Актуальное</div>
                  <div className={styles.creatorField}><span>Сохранить после публикации</span><select className={styles.creatorSelect} value={highlightId} onChange={(event) => setHighlightId(event.target.value)}><option value="">Не добавлять</option>{highlightItems.map((highlight: StoryHighlight) => <option key={highlight.id} value={highlight.id}>{highlight.title}</option>)}</select></div>
                  <div className={styles.creatorField}><span>Или создать новое</span><input className={styles.creatorInput} value={newHighlightTitle} onChange={(event) => setNewHighlightTitle(event.target.value)} placeholder="Название актуального" maxLength={80} /></div>
                </div>
              </div>
            ) : <div className={styles.creatorToolPanelPlaceholder} />}

            <div className={styles.creatorDockModern}>
              {TOOL_BUTTONS.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  className={[styles.creatorDockButton, activeTool === tool.key ? styles.creatorDockButtonActive : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (activeTool === tool.key) {
                      setToolOpen((value) => !value);
                    } else {
                      setActiveTool(tool.key);
                      setToolOpen(true);
                      setSelectedItemId(null);
                      setMediaSelected(tool.key === 'media');
                    }
                  }}
                >
                  <Icon name={tool.icon} size={18} />
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
