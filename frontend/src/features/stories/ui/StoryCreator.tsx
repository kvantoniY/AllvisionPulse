'use client';

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useCreateHighlightMutation,
  useCreateStoriesMutation,
  useGetStoryHighlightsQuery,
} from '@/shared/api/storiesApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useGetMentalDayQuery, useGetNutritionQuery, useGetOverviewQuery, useGetTasksDayQuery } from '@/shared/api/pulseApi';
import { useListShareArtifactsQuery } from '@/shared/api/programsApi';
import { StoryEditorItem, StoryHighlight, StoryMediaTransform, StoryWidgetType } from '@/shared/types/story';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import type { ShareArtifact } from '@/shared/types/programs';
import { toPulseShareEmbedArtifact } from '@/shared/lib/pulseShare';
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
const MOBILE_PRIMARY_KEYS: ToolKey[] = ['text', 'widgets', 'media'];
const MOBILE_OVERFLOW_KEYS: ToolKey[] = ['stickers', 'brush', 'background'];

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
    transform: manual ? `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)` : `rotate(${rotation}deg)`,
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
  const base: LocalDraft = { id, file, url, mediaType: file.type || 'image/*', transform: { ...defaultTransform(), ...(options.transform ?? {}) }, items: options.items ?? [] };
  if (file.type.startsWith('image/')) {
    const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    return { ...base, width: size?.width ?? null, height: size?.height ?? null, sourceDurationMs: 30000, trimStartMs: 0, trimEndMs: options.durationMs ?? 8000, durationMs: options.durationMs ?? 8000 };
  }
  if (file.type.startsWith('video/')) {
    const meta = await new Promise<{ width: number; height: number; durationMs: number } | null>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, durationMs: Math.max(1000, Math.round((video.duration || 15) * 1000)) });
      video.onerror = () => resolve(null);
      video.src = url;
    });
    const sourceDurationMs = meta?.durationMs ?? 15000;
    const trimStartMs = options.trimStartMs ?? 0;
    const trimEndMs = options.trimEndMs ?? Math.min(sourceDurationMs, trimStartMs + 30000);
    return { ...base, width: meta?.width ?? null, height: meta?.height ?? null, sourceDurationMs, trimStartMs, trimEndMs, durationMs: options.durationMs ?? Math.min(30000, trimEndMs - trimStartMs) };
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
  const map: Record<string, { title: string; primary: string; secondary: string }> = {
    pulse: { title: 'Pulse дня', primary: `${source?.overview?.today?.dayScore ?? '—'}`, secondary: `Фокус: ${source?.overview?.today?.recommendations?.[0] ?? 'день в балансе'}` },
    focus: { title: 'Фокус дня', primary: `${source?.overview?.today?.recommendations?.[0] ?? 'Одна главная задача'}`, secondary: `${source?.overview?.today?.tasksDone ?? 0} из ${source?.overview?.today?.tasksTotal ?? 0} задач` },
    health: { title: 'Здоровье', primary: `${source?.mental?.day?.todayScore ?? source?.overview?.today?.mental7Score ?? '—'}`, secondary: `Сон ${source?.mental?.day?.sleepHours ?? '—'} ч · Стресс ${source?.mental?.day?.stress ?? '—'}` },
    tasks: { title: 'Прогресс дня', primary: `${source?.tasks?.summary?.percent ?? source?.overview?.today?.tasksPercent ?? 0}%`, secondary: `${source?.tasks?.summary?.completed ?? 0}/${source?.tasks?.summary?.total ?? 0} выполнено` },
    nutrition: { title: 'Питание', primary: `${source?.nutrition?.totalCalories ?? source?.overview?.nutrition?.totalCalories ?? 0} ккал`, secondary: `Осталось ${source?.nutrition?.remainingCalories ?? source?.overview?.nutrition?.remainingCalories ?? 0}` },
  };
  return map[type] ?? { title: 'Pulse share', primary: 'Artifact', secondary: 'Recent Pulse item' };
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
  const isMobile = useIsMobile(768);
  const [canvasMetrics, setCanvasMetrics] = useState({ width: 0, height: 0 });
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [history, setHistory] = useState<Record<string, DraftHistoryState[]>>({});
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mediaSelected, setMediaSelected] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolKey>('text');
  const [toolOpen, setToolOpen] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<DrawingPoint[]>([]);
  const [drawColor, setDrawColor] = useState('#ffffff');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [highlightId, setHighlightId] = useState('');
  const [newHighlightTitle, setNewHighlightTitle] = useState('');
  const [videoFrames, setVideoFrames] = useState<Record<string, string[]>>({});
  const drawActiveRef = useRef(false);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const [addMenuRect, setAddMenuRect] = useState<{ left: number; top: number } | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const [moreMenuRect, setMoreMenuRect] = useState<{ left: number; bottom: number } | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const [createStories, createState] = useCreateStoriesMutation();
  const [createHighlight] = useCreateHighlightMutation();
  const { data: meData } = useGetMeQuery();
  const today = useMemo(() => todayIso(), []);
  const { data: overviewData } = useGetOverviewQuery(undefined, { skip: !open });
  const { data: mentalData } = useGetMentalDayQuery(today, { skip: !open });
  const { data: tasksData } = useGetTasksDayQuery(today, { skip: !open });
  const { data: nutritionData } = useGetNutritionQuery(today, { skip: !open });
  const { data: shareArtifactsData } = useListShareArtifactsQuery(8, { skip: !open });
  const { data: highlightsData } = useGetStoryHighlightsQuery(
    { userId: meData?.user?.id ?? '' },
    { skip: !open || !meData?.user?.id, refetchOnFocus: true, refetchOnReconnect: true },
  );

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null;
  const selectedItem = activeDraft?.items.find((item) => item.id === selectedItemId) ?? null;
  const highlightItems = highlightsData?.items ?? [];
  const shareArtifacts = shareArtifactsData?.items ?? [];

  useEffect(() => {
    if (activeTool !== 'brush') {
      setDrawMode(false);
      drawActiveRef.current = false;
      setDrawPoints([]);
    }
  }, [activeTool]);

  useEffect(() => {
    if (!open) return;
    setToolOpen(!isMobile);
  }, [isMobile, open]);

  useEffect(() => {
    if (!open || !toolOpen) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sidebarRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-keep-panel]')) return;
      setToolOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open, toolOpen]);

  useEffect(() => {
    if (!open) return;
    if (!activeDraftId && drafts[0]) setActiveDraftId(drafts[0].id);
  }, [open, activeDraftId, drafts]);

  useEffect(() => {
    const target = activeDraft;
    if (!target || !target.mediaType.startsWith('video/') || videoFrames[target.id]?.length) return;
    let cancelled = false;
    extractVideoFrames(target.url, Number(target.sourceDurationMs ?? target.durationMs ?? 15000))
      .then((frames) => {
        if (!cancelled) setVideoFrames((prev) => ({ ...prev, [target.id]: frames.filter(Boolean) }));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
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

  const openFilePicker = () => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // Fallback for browsers that block showPicker outside direct support.
    }
    input.click();
  };

  const createBackgroundDraft = async (color: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `background-${Date.now()}.png`, { type: 'image/png' });
    const draft = await enrichFile(file);
    draft.transform = { ...draft.transform, backgroundFill: color, blurFill: false };
    setDrafts((prev) => [...prev, draft]);
    setActiveDraftId(draft.id);
    setSelectedItemId(null);
    setMediaSelected(true);
    setAddMenuOpen(false);
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
    if (isMobile) setToolOpen(false);
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
    if (isMobile) setToolOpen(false);
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
    if (isMobile) setToolOpen(false);
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
    if (isMobile) setToolOpen(false);
  };

  const addShareWidget = (artifact: ShareArtifact) => {
    if (!activeDraft) return;
    const id = makeId('item');
    const snapshot = artifact.resolvedSnapshot ?? artifact.snapshotJson ?? {};
    const title = typeof (snapshot as any)?.title === 'string' ? String((snapshot as any).title) : artifact.title ?? 'Pulse share';
    const primary = typeof (snapshot as any)?.primary === 'string' ? String((snapshot as any).primary) : String((snapshot as any)?.primary ?? artifact.kind);
    const secondary = typeof (snapshot as any)?.secondary === 'string' ? String((snapshot as any).secondary) : String((snapshot as any)?.description ?? artifact.mode);
    updateDraft(activeDraft.id, (draft) => ({
      ...draft,
      items: [
        ...draft.items,
        { id, type: 'widget', x: 10, y: 18, w: 78, h: 22, widgetType: 'pulse_share', title, payload: { primary, secondary, artifactId: artifact.id, artifact: toPulseShareEmbedArtifact(artifact) } },
      ],
    }));
    setSelectedItemId(id);
    setActiveTool('widgets');
    if (isMobile) setToolOpen(false);
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
    setHistory((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    if (activeDraftId === draftId) {
      const rest = drafts.filter((draft) => draft.id !== draftId);
      setActiveDraftId(rest[0]?.id ?? null);
      setSelectedItemId(null);
      setMediaSelected(Boolean(rest[0]));
    }
  };

  const beginTransform = (
    itemId: string,
    mode: 'move' | 'resize',
    origin: { clientX: number; clientY: number; pointerId?: number; target?: Element },
    handle: 'nw' | 'ne' | 'sw' | 'se' = 'se',
  ) => {
    if (!activeDraft || !canvasRef.current) return;
    const target = activeDraft.items.find((item) => item.id === itemId);
    if (!target) return;
    rememberDraft(activeDraft.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const start = { x: target.x, y: target.y, w: target.w, h: target.h };
    const itemEl = canvasRef.current.querySelector(`[data-item-id="${itemId}"]`) as HTMLElement | null;
    let minWPct = target.type === 'widget' ? 18 : 10;
    let minHPct = target.type === 'widget' ? 10 : 8;
    let naturalWPct = minWPct;
    let naturalHPct = minHPct;
    if (itemEl && rect.width > 0 && rect.height > 0) {
      const contentEl = (itemEl.querySelector('[data-item-content]') as HTMLElement) ?? itemEl;
      const prevTransform = contentEl.style.transform;
      const prevWidth = contentEl.style.width;
      const prevHeight = contentEl.style.height;
      if (prevTransform) {
        contentEl.style.transform = 'none';
        contentEl.style.width = '100%';
        contentEl.style.height = '100%';
      }
      const naturalW = contentEl.scrollWidth;
      const naturalH = contentEl.scrollHeight;
      if (prevTransform) {
        contentEl.style.transform = prevTransform;
        contentEl.style.width = prevWidth;
        contentEl.style.height = prevHeight;
      }
      naturalWPct = (naturalW / rect.width) * 100;
      naturalHPct = (naturalH / rect.height) * 100;
      if (target.type !== 'widget') {
        minWPct = Math.max(minWPct, naturalWPct);
        minHPct = Math.max(minHPct, naturalHPct);
      }
    }
    if (origin.pointerId !== undefined && origin.target && 'setPointerCapture' in origin.target) {
      try { (origin.target as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(origin.pointerId); } catch { /* noop */ }
    }
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      const dxPct = ((event.clientX - origin.clientX) / rect.width) * 100;
      const dyPct = ((event.clientY - origin.clientY) / rect.height) * 100;
      setDrafts((prev) => prev.map((draft) => draft.id !== activeDraft.id ? draft : {
        ...draft,
        items: draft.items.map((item) => {
          if (item.id !== itemId) return item;
          if (mode === 'move') return { ...item, x: clamp(start.x + dxPct, 0, 100 - start.w), y: clamp(start.y + dyPct, 0, 100 - start.h) } as StoryEditorItem;
          const east = handle === 'ne' || handle === 'se';
          const south = handle === 'sw' || handle === 'se';
          let newX = start.x;
          let newY = start.y;
          let newW = start.w;
          let newH = start.h;
          if (east) newW = start.w + dxPct;
          else { newW = start.w - dxPct; newX = start.x + dxPct; }
          if (south) newH = start.h + dyPct;
          else { newH = start.h - dyPct; newY = start.y + dyPct; }
          if (newW < minWPct) {
            if (!east) newX = start.x + (start.w - minWPct);
            newW = minWPct;
          }
          if (newH < minHPct) {
            if (!south) newY = start.y + (start.h - minHPct);
            newH = minHPct;
          }
          newX = clamp(newX, 0, 100 - newW);
          newY = clamp(newY, 0, 100 - newH);
          newW = Math.min(newW, 100 - newX);
          newH = Math.min(newH, 100 - newY);
          if (item.type === 'widget') {
            const scale = Math.min(1, newW / Math.max(0.1, naturalWPct), newH / Math.max(0.1, naturalHPct));
            return { ...item, x: newX, y: newY, w: newW, h: newH, contentScale: scale } as StoryEditorItem;
          }
          return { ...item, x: newX, y: newY, w: newW, h: newH } as StoryEditorItem;
        }),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const beginMediaTransform = (mode: 'move' | 'resize', origin: { clientX: number; clientY: number; pointerId?: number; target?: Element }, handle: MediaHandle = 'se') => {
    if (!activeDraft || !canvasRef.current) return;
    rememberDraft(activeDraft.id);
    const rect = canvasRef.current.getBoundingClientRect();
    const start = { offsetX: Number(activeDraft.transform.offsetX ?? 0), offsetY: Number(activeDraft.transform.offsetY ?? 0), scale: Number(activeDraft.transform.scaleX ?? activeDraft.transform.scale ?? 1) };
    if (origin.pointerId !== undefined && origin.target && 'setPointerCapture' in origin.target) {
      try { (origin.target as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(origin.pointerId); } catch { /* noop */ }
    }
    const onMove = (event: PointerEvent) => {
      event.preventDefault();
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
              return setUniformScale(draft.transform, clamp(start.scale + influence, 0.35, 3.4));
            })(),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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
    setToolOpen(false);
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
      segments.push(await enrichFile(activeDraft.file, { trimStartMs: start, trimEndMs: end, durationMs: end - start, transform: activeDraft.transform, items: [] }));
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
    handleClose();
    onCreated(meData.user.id);
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
    setDrawPoints([]);
  };

  const mediaSelectionRect = getManualMediaRect(activeDraft, canvasMetrics.width, canvasMetrics.height);
  if (!open) return null;
  const currentFrames = activeDraft ? (videoFrames[activeDraft.id] ?? []) : [];
  const trimStart = Number(activeDraft?.trimStartMs ?? 0);
  const trimEnd = Number(activeDraft?.trimEndMs ?? activeDraft?.durationMs ?? 0);
  const trimLength = Math.max(0, trimEnd - trimStart);
  const selectedIsVector = selectedItem?.type === 'image' && selectedItem.src.startsWith('data:image/svg+xml');
  const selectedInspector = selectedItem ? selectedItem.type : null;

  const renderToolContent = () => {
    if (selectedItem && activeDraft) {
      return (
        <div className={styles.panelContent}>
          {selectedInspector === 'text' && selectedItem.type === 'text' && (
            <div className={styles.panelGroup}>
              <div className={styles.panelGroupHead}>
                <span className={styles.panelGroupTitle}>Текст</span>
                <button type="button" className={styles.panelDeleteBtn} onClick={removeSelected}><Icon name="trash" size={14} /></button>
              </div>
              <textarea className={styles.panelTextarea} value={selectedItem.text} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, text: e.target.value } : item) }))} />
              <div className={styles.panelField}>
                <span>Размер</span>
                <input type="range" min="18" max="72" step="1" value={Number(selectedItem.fontSize ?? 28)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, fontSize: Number(e.target.value) } : item) }))} />
              </div>
              <div className={styles.panelField}>
                <span>Цвет</span>
                <input type="color" className={styles.panelColorInput} value={selectedItem.color ?? '#ffffff'} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, color: e.target.value } : item) }))} />
              </div>
            </div>
          )}

          {selectedInspector === 'widget' && selectedItem.type === 'widget' && (
            <div className={styles.panelGroup}>
              <div className={styles.panelGroupHead}>
                <span className={styles.panelGroupTitle}>Виджет</span>
                <button type="button" className={styles.panelDeleteBtn} onClick={removeSelected}><Icon name="trash" size={14} /></button>
              </div>
              <div className={styles.panelField}>
                <span>Заголовок</span>
                <input className={styles.panelInput} value={selectedItem.title} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, title: e.target.value } : item) }))} />
              </div>
              <div className={styles.panelField}>
                <span>Ширина %</span>
                <input type="range" min="28" max="90" step="1" value={Number(selectedItem.w)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, w: Number(e.target.value) } : item) }))} />
              </div>
            </div>
          )}

          {selectedInspector === 'image' && selectedItem.type === 'image' && (
            <div className={styles.panelGroup}>
              <div className={styles.panelGroupHead}>
                <span className={styles.panelGroupTitle}>{selectedIsVector ? 'Рисунок' : 'Стикер'}</span>
                <button type="button" className={styles.panelDeleteBtn} onClick={removeSelected}><Icon name="trash" size={14} /></button>
              </div>
              {!selectedIsVector && (
                <div className={styles.panelField}>
                  <span>Скругление</span>
                  <input type="range" min="0" max="40" step="1" value={Number(selectedItem.radius ?? 18)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, radius: Number(e.target.value) } : item) }))} />
                </div>
              )}
              <div className={styles.panelField}>
                <span>Ширина %</span>
                <input type="range" min="10" max="100" step="1" value={Number(selectedItem.w)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, items: draft.items.map((item) => item.id === selectedItem.id ? { ...selectedItem, w: Number(e.target.value) } : item) }))} />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (mediaSelected && activeDraft) {
      return (
        <div className={styles.panelContent}>
          <div className={styles.panelGroup}>
            <div className={styles.panelGroupHead}><span className={styles.panelGroupTitle}>Медиа</span></div>
            <div className={styles.panelField}>
              <span>Режим</span>
              <div className={styles.panelToggleRow}>
                {(['contain', 'cover', 'manual'] as const).map((mode) => (
                  <button key={mode} type="button" className={[styles.panelToggleBtn, (activeDraft.transform.fitMode ?? 'contain') === mode ? styles.panelToggleBtnActive : ''].filter(Boolean).join(' ')} onClick={() => updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, fitMode: mode } }))}>
                    {mode === 'contain' ? 'Вписать' : mode === 'cover' ? 'Заполнить' : 'Вручную'}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.panelField}>
              <span>Поворот</span>
              <input type="range" min="-45" max="45" step="1" value={Number(activeDraft.transform.rotation ?? 0)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, rotation: Number(e.target.value) } }))} />
            </div>
            <div className={styles.panelField}>
              <span>Масштаб</span>
              <input type="range" min="0.4" max="3" step="0.01" value={Number(activeDraft.transform.scaleX ?? activeDraft.transform.scale ?? 1)} onChange={(e) => updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: setUniformScale(draft.transform, Number(e.target.value)) }))} />
            </div>
          </div>
        </div>
      );
    }

    if (activeTool === 'text') return <div className={styles.panelContent}><div className={styles.panelGroup}><button type="button" className={styles.panelActionBtn} onClick={addText} disabled={!activeDraft}><Icon name="pencil" size={16} />Добавить текст</button><p className={styles.panelHint}>Нажми на холсте, чтобы разместить текст в нужном месте</p></div></div>;
    if (activeTool === 'stickers') return <div className={styles.panelContent}><div className={styles.panelGroup}><button type="button" className={styles.panelActionBtn} onClick={() => stickerInputRef.current?.click()} disabled={!activeDraft}><Icon name="image" size={16} />Добавить стикер</button><p className={styles.panelHint}>Загрузи изображение как стикер</p></div></div>;

    if (activeTool === 'widgets') {
      return (
        <div className={styles.panelContent}>
          <div className={styles.panelGroup}>
            <p className={styles.panelLabel}>Виджеты Pulse</p>
            <div className={styles.panelWidgetGrid}>
              {(['pulse', 'focus', 'health', 'tasks', 'nutrition'] as StoryWidgetType[]).map((type) => {
                const preset = widgetPreset(type, { overview: overviewData, mental: mentalData, tasks: tasksData, nutrition: nutritionData });
                return <button key={type} type="button" className={styles.panelWidgetCard} onClick={() => addWidget(type)} disabled={!activeDraft}><span className={styles.panelWidgetName}>{preset.title}</span><span className={styles.panelWidgetVal}>{preset.primary}</span></button>;
              })}
            </div>
            {shareArtifacts.length > 0 && <>
              <p className={styles.panelLabel} style={{ marginTop: 14 }}>Pulse Share</p>
              <div className={styles.panelWidgetGrid}>
                {shareArtifacts.map((artifact) => <button key={artifact.id} type="button" className={styles.panelWidgetCard} onClick={() => addShareWidget(artifact)} disabled={!activeDraft}><span className={styles.panelWidgetName}>{String((artifact.snapshotJson as any)?.title ?? artifact.title ?? 'Pulse share')}</span><span className={styles.panelWidgetVal}>{artifact.kind}</span></button>)}
              </div>
            </>}
          </div>
        </div>
      );
    }

    if (activeTool === 'background') {
      return (
        <div className={styles.panelContent}>
          <div className={styles.panelGroup}>
            <p className={styles.panelLabel}>Цвет фона</p>
            <div className={styles.panelColorGrid}>
              {BACKGROUND_COLORS.map((color) => <button key={color} type="button" className={[styles.panelColorSwatch, (activeDraft?.transform.backgroundFill ?? '#111214') === color ? styles.panelColorSwatchActive : ''].filter(Boolean).join(' ')} style={{ background: color }} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, backgroundFill: color } }))} />)}
            </div>
            <p className={styles.panelLabel} style={{ marginTop: 14 }}>Размытый фон</p>
            <div className={styles.panelToggleRow}>
              <button type="button" className={[styles.panelToggleBtn, activeDraft?.transform.blurFill !== false ? styles.panelToggleBtnActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, blurFill: true } }))}>Вкл</button>
              <button type="button" className={[styles.panelToggleBtn, activeDraft?.transform.blurFill === false ? styles.panelToggleBtnActive : ''].filter(Boolean).join(' ')} onClick={() => activeDraft && updateDraft(activeDraft.id, (draft) => ({ ...draft, transform: { ...draft.transform, blurFill: false } }))}>Выкл</button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTool === 'brush') return <div className={styles.panelContent}><div className={styles.panelGroup}><p className={styles.panelLabel} style={{ marginTop: 0 }}>Цвет кисти</p><input type="color" className={styles.panelColorInput} value={drawColor} onChange={(e) => setDrawColor(e.target.value)} /><button type="button" className={styles.panelActionBtn} style={{ marginTop: 8 }} onClick={() => { setDrawMode(true); setToolOpen(false); }} disabled={!activeDraft}><Icon name="sparkles" size={16} />Начать рисовать</button><p className={styles.panelHint}>Нажми «Начать» и рисуй пальцем по холсту</p></div></div>;

    return <div className={styles.panelContent}><div className={styles.panelGroup}><button type="button" className={styles.panelUploadBtn} onClick={openFilePicker}><Icon name="image" size={22} /><span>Загрузить медиа</span></button><p className={styles.panelHint}>Или перетащи файл на холст</p></div></div>;
  };

  const currentToolLabel = TOOL_BUTTONS.find((tool) => tool.key === activeTool)?.label ?? 'Медиа';

  return (
    <div className={styles.editorRoot} role="dialog" aria-modal="true">
      <header className={styles.editorTopBar}>
        <div className={styles.topBarStart}>
          <Button variant="ghost" onClick={handleClose} iconOnly aria-label="Назад"><Icon name="arrowLeft" size={18} /></Button>
          <Button variant="ghost" onClick={() => activeDraft ? undoDraft(activeDraft.id) : null} disabled={!activeDraft || !(history[activeDraft.id]?.length)} iconOnly aria-label="Отменить"><Icon name="repeat" size={16} /></Button>
        </div>
        <div className={styles.topBarCenter}>
          <span className={styles.topBarLabel}>{drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'кадр' : drafts.length < 5 ? 'кадра' : 'кадров'}` : 'Новая сторис'}</span>
        </div>
        <div className={styles.topBarEnd}>
          <Button variant="ghost" onClick={() => activeDraft ? resetDraft(activeDraft.id) : null} disabled={!activeDraft}>Сбросить</Button>
        </div>
      </header>

      <div className={styles.editorMain}>
        <section className={styles.editorCanvasSection}>
          <div className={styles.editorFrameStrip}>
            <div className={styles.frameAddWrap}>
              <button ref={addBtnRef} type="button" className={styles.frameAddBtn} onClick={() => {
                const rect = addBtnRef.current?.getBoundingClientRect();
                if (rect) setAddMenuRect({ left: rect.left, top: rect.bottom + 6 });
                setAddMenuOpen((value) => !value);
              }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleAddFiles(e.dataTransfer.files); }} aria-label="Добавить еще один кадр"><Icon name="plus" size={18} /></button>
            </div>
            <div className={styles.frameStripScroller}>
              {drafts.map((draft, index) => <div key={draft.id} className={[styles.frameThumb, activeDraft?.id === draft.id ? styles.frameThumbActive : ''].filter(Boolean).join(' ')}><button type="button" className={styles.frameThumbBtn} onClick={() => { setActiveDraftId(draft.id); setSelectedItemId(null); setMediaSelected(true); }}>{draft.mediaType.startsWith('video/') ? <video src={draft.url} muted playsInline className={styles.frameThumbMedia} draggable={false} /> : <img src={draft.url} alt={`${index + 1}`} className={styles.frameThumbMedia} draggable={false} />}<span className={styles.frameThumbNum}>{index + 1}</span></button><button type="button" className={styles.frameThumbDel} onClick={() => removeDraft(draft.id)} aria-label="Удалить"><Icon name="close" size={11} /></button></div>)}
            </div>
          </div>

          <div className={styles.editorCanvasWrap}>
            {!activeDraft ? (
              <button type="button" className={styles.editorEmptyCanvas} onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setAddMenuRect({ left: rect.left + rect.width / 2 - 110, top: rect.top + rect.height / 2 });
                setAddMenuOpen(true);
              }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleAddFiles(e.dataTransfer.files); }}>
                <span className={styles.emptyCanvasIcon}><Icon name="plus" size={32} /></span>
                <span className={styles.emptyCanvasTitle}>Создай сторис</span>
                <span className={styles.emptyCanvasSub}>Загрузи фото или видео, а затем настрой кадр и инструменты</span>
              </button>
            ) : (
              <div ref={canvasRef} className={[styles.editorCanvas, drawMode ? styles.editorCanvasDrawMode : '', activeTool === 'text' && toolOpen ? styles.editorCanvasTextMode : ''].filter(Boolean).join(' ')} onPointerDown={(e) => {
                if (drawMode) return startDrawing(e);
                if (activeTool === 'text' && toolOpen && canvasRef.current) {
                  const rect = canvasRef.current.getBoundingClientRect();
                  addTextAt(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
                  return;
                }
                setSelectedItemId(null);
                setMediaSelected(activeTool === 'media');
                setToolOpen(false);
                setAddMenuOpen(false);
              }} onPointerMove={moveDrawing} onPointerUp={endDrawing} onPointerLeave={() => { if (drawActiveRef.current) endDrawing(); }}>
                <div className={styles.creatorMediaBackdrop} style={{ background: activeDraft.transform.backgroundFill ?? '#111214' }} />
                {activeDraft.transform.blurFill !== false && (activeDraft.transform.fitMode ?? 'contain') !== 'cover' && <div className={styles.creatorMediaBlurFrame}>{activeDraft.mediaType.startsWith('video/') ? <video src={activeDraft.url} className={styles.creatorMediaBlurVideo} playsInline muted autoPlay loop style={{ objectFit: 'cover' }} draggable={false} /> : <img src={activeDraft.url} alt="" className={styles.creatorMediaBlur} style={{ objectFit: 'cover' }} draggable={false} />}</div>}
                <div className={styles.creatorMediaFrame}>{activeDraft.mediaType.startsWith('video/') ? <video src={activeDraft.url} className={styles.creatorMediaVideo} playsInline muted autoPlay loop style={mediaTransformStyle(activeDraft.transform)} draggable={false} /> : <img src={activeDraft.url} alt="Сторис" className={styles.creatorMedia} style={mediaTransformStyle(activeDraft.transform)} draggable={false} />}</div>
                {(mediaSelected || activeTool === 'media') && activeDraft.transform.fitMode === 'manual' && mediaSelectionRect && <div className={styles.creatorMediaSelection} style={{ left: mediaSelectionRect.left, top: mediaSelectionRect.top, width: mediaSelectionRect.width, height: mediaSelectionRect.height }} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setMediaSelected(true); beginMediaTransform('move', { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, target: e.currentTarget }); }}>{(['nw', 'ne', 'sw', 'se'] as MediaHandle[]).map((handle) => <button key={handle} type="button" className={[styles.creatorCornerHandle, handle === 'nw' ? styles.creatorCornerHandleNW : handle === 'ne' ? styles.creatorCornerHandleNE : handle === 'sw' ? styles.creatorCornerHandleSW : styles.creatorCornerHandleSE].filter(Boolean).join(' ')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setMediaSelected(true); beginMediaTransform('resize', { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, target: e.currentTarget }, handle); }} aria-label="Размер" />)}</div>}
                {activeDraft.items.map((item) => {
                  const itemStyle = { left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` } as const;
                  const selected = item.id === selectedItemId;
                  const isDraw = item.type === 'image' && item.src.startsWith('data:image/svg+xml');
                  return (
                    <div key={item.id} data-item-id={item.id} className={[styles.creatorItem, selected ? styles.creatorItemSelected : '', item.type === 'text' ? styles.creatorTextItem : '', item.type === 'widget' ? styles.creatorWidgetItem : '', item.type === 'image' ? styles.creatorImageItem : '', isDraw ? styles.creatorStrokeItem : ''].filter(Boolean).join(' ')} style={{ ...itemStyle, borderRadius: item.type === 'image' ? `${item.radius ?? 18}px` : undefined }} onPointerDown={(e) => {
                      if (drawMode) return;
                      e.stopPropagation(); e.preventDefault();
                      setMediaSelected(false); setSelectedItemId(item.id);
                      const sx = e.clientX; const sy = e.clientY;
                      let moved = false;
                      const move = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) moved = true; };
                      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) setToolOpen(true); };
                      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
                      beginTransform(item.id, 'move', { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, target: e.currentTarget });
                    }}>
                      <div data-item-content className={styles.creatorItemContent} style={item.type === 'widget' && item.contentScale && item.contentScale < 1 ? { transform: `scale(${item.contentScale})`, transformOrigin: 'top left', width: `${100 / item.contentScale}%`, height: `${100 / item.contentScale}%` } : undefined}>
                        {item.type === 'text' && <div style={{ color: item.color ?? '#fff', fontSize: item.fontSize ?? 28, textAlign: (item.align ?? 'left') as any }}>{item.text}</div>}
                        {item.type === 'widget' && <><div className={styles.viewerWidgetTitle}>{item.title}</div><div className={styles.viewerWidgetValue}>{String(item.payload?.primary ?? '—')}</div><div className={styles.viewerWidgetSub}>{String(item.payload?.secondary ?? '')}</div></>}
                        {item.type === 'image' && <img src={item.src} alt="" draggable={false} />}
                      </div>
                      {!isDraw && selected && <div className={styles.canvasItemBar} onPointerDown={(e) => e.stopPropagation()}><button type="button" data-keep-panel className={styles.canvasItemBarBtn} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeSelected(); }}><Icon name="trash" size={13} /></button></div>}
                      {!isDraw && selected && (['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          className={[styles.creatorCornerHandle, handle === 'nw' ? styles.creatorCornerHandleNW : handle === 'ne' ? styles.creatorCornerHandleNE : handle === 'sw' ? styles.creatorCornerHandleSW : styles.creatorCornerHandleSE].join(' ')}
                          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedItemId(item.id); beginTransform(item.id, 'resize', { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, target: e.currentTarget }, handle); }}
                          aria-label="Размер"
                        />
                      ))}
                    </div>
                  );
                })}
                {drawPoints.length > 1 && <svg className={styles.creatorDrawLayer} viewBox="0 0 100 100" preserveAspectRatio="none"><path d={drawPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} fill="none" stroke={drawColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
            )}
          </div>

          {activeDraft?.mediaType.startsWith('video/') && <div className={styles.editorTrimBar}><div ref={trimTrackRef} className={styles.creatorTrimFrames}>{(currentFrames.length ? currentFrames : Array.from({ length: 10 }).map(() => '')).map((frame, index) => frame ? <img key={`${frame}-${index}`} src={frame} alt="" draggable={false} /> : <div key={`fp-${index}`} className={styles.creatorVideoFramePlaceholder} />)}<div className={styles.creatorVideoSelection} style={{ left: `${(trimStart / Math.max(1, Number(activeDraft.sourceDurationMs ?? 1))) * 100}%`, width: `${(trimLength / Math.max(1, Number(activeDraft.sourceDurationMs ?? 1))) * 100}%` }}><button type="button" className={[styles.creatorTrimHandle, styles.creatorTrimHandleStart].join(' ')} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); beginTrimDrag('start', e.clientX); }} aria-label="Начало" /><button type="button" className={[styles.creatorTrimHandle, styles.creatorTrimHandleEnd].join(' ')} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); beginTrimDrag('end', e.clientX); }} aria-label="Конец" /></div></div><div className={styles.creatorTrimMeta}>{formatMs(trimStart)} — {formatMs(trimEnd)} · {formatMs(trimLength)} / макс 30с</div>{(activeDraft.sourceDurationMs ?? 0) > 30000 && <Button size="sm" onClick={() => void splitActiveVideo()}>Разбить на кадры</Button>}</div>}

          {errorText && <div className={styles.creatorError}>{errorText}</div>}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFileInput} />
          <input ref={stickerInputRef} type="file" accept="image/*" hidden onChange={handleStickerInput} />
        </section>

        {drafts.length > 0 && <aside ref={sidebarRef} className={styles.editorSidebar}>
          <nav className={styles.editorToolNav}>
            {TOOL_BUTTONS.map((tool) => <button key={tool.key} type="button" className={[styles.toolNavBtn, activeTool === tool.key ? styles.toolNavBtnActive : ''].filter(Boolean).join(' ')} onClick={() => { if (activeTool === tool.key) setToolOpen((value) => !value); else { setActiveTool(tool.key); setToolOpen(true); setSelectedItemId(null); setMediaSelected(tool.key === 'media'); } }} title={tool.label}><Icon name={tool.icon as any} size={20} /></button>)}
          </nav>
          <div className={[styles.editorToolPanel, toolOpen ? styles.editorToolPanelOpen : ''].filter(Boolean).join(' ')}>
            <div className={styles.toolPanelHeader}><span className={styles.toolPanelTitle}>{selectedItem ? 'Свойства' : currentToolLabel}</span>{selectedItem && <button type="button" className={styles.toolPanelBack} onClick={() => setSelectedItemId(null)}><Icon name="close" size={16} /></button>}</div>
            <div className={styles.toolPanelScroll}>{renderToolContent()}{activeDraft && <div className={styles.panelGroup} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 8, paddingTop: 16 }}><p className={styles.panelLabel}>Актуальное</p><select className={styles.panelSelect} value={highlightId} onChange={(e) => setHighlightId(e.target.value)}><option value="">Не добавлять</option>{highlightItems.map((highlight: StoryHighlight) => <option key={highlight.id} value={highlight.id}>{highlight.title}</option>)}</select><input className={styles.panelInput} style={{ marginTop: 6 }} value={newHighlightTitle} onChange={(e) => setNewHighlightTitle(e.target.value)} placeholder="Создать новое актуальное" maxLength={80} /></div>}</div>
            <div className={styles.toolPanelFooter}><Button variant="primary" onClick={publish} loading={createState.isLoading} disabled={!drafts.length}>Опубликовать</Button></div>
          </div>
        </aside>}
      </div>

      <nav className={styles.editorMobileNav}>
        <button type="button" className={styles.mobileNavClose} onClick={handleClose}><Icon name="close" size={18} /></button>
        {drafts.length > 0 && MOBILE_PRIMARY_KEYS.map((key) => {
          const tool = TOOL_BUTTONS.find((entry) => entry.key === key);
          if (!tool) return null;
          return <button key={tool.key} type="button" data-keep-panel className={[styles.mobileNavTool, activeTool === tool.key && toolOpen ? styles.mobileNavToolActive : ''].filter(Boolean).join(' ')} onClick={() => { setMobileMoreOpen(false); if (activeTool === tool.key) setToolOpen((value) => !value); else { setActiveTool(tool.key); setToolOpen(true); setSelectedItemId(null); setMediaSelected(tool.key === 'media'); } }}><Icon name={tool.icon as any} size={20} /><span>{tool.label}</span></button>;
        })}
        {drafts.length > 0 && <div className={styles.mobileNavMoreWrap}>
          <button ref={moreBtnRef} type="button" data-keep-panel className={[styles.mobileNavTool, mobileMoreOpen || MOBILE_OVERFLOW_KEYS.includes(activeTool) && toolOpen ? styles.mobileNavToolActive : ''].filter(Boolean).join(' ')} onClick={() => {
            const rect = moreBtnRef.current?.getBoundingClientRect();
            if (rect) setMoreMenuRect({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 8 });
            setMobileMoreOpen((value) => !value);
          }} aria-label="Ещё">
            <Icon name="dots" size={20} />
            <span>Ещё</span>
          </button>
        </div>}
        <Button className={styles.mobileNavAction} variant="primary" onClick={publish} loading={createState.isLoading} disabled={!drafts.length} size="sm">Далее</Button>
      </nav>

      {mobileMoreOpen && moreMenuRect && typeof document !== 'undefined' && createPortal(
        <>
          <div className={styles.frameAddMenuBackdrop} onClick={() => setMobileMoreOpen(false)} />
          <div className={styles.mobileNavMorePopover} style={{ position: 'fixed', left: moreMenuRect.left, bottom: moreMenuRect.bottom, transform: 'translateX(-50%)', zIndex: 201 }}>
            {MOBILE_OVERFLOW_KEYS.map((key) => {
              const tool = TOOL_BUTTONS.find((entry) => entry.key === key);
              if (!tool) return null;
              return <button key={tool.key} type="button" className={[styles.mobileNavMoreItem, activeTool === tool.key && toolOpen ? styles.mobileNavMoreItemActive : ''].filter(Boolean).join(' ')} onClick={() => { setActiveTool(tool.key); setToolOpen(true); setSelectedItemId(null); setMediaSelected(false); setMobileMoreOpen(false); }}>
                <Icon name={tool.icon as any} size={18} />
                <span>{tool.label}</span>
              </button>;
            })}
          </div>
        </>,
        document.body,
      )}

      {addMenuOpen && addMenuRect && typeof document !== 'undefined' && createPortal(
        <>
          <div className={styles.frameAddMenuBackdrop} onClick={() => setAddMenuOpen(false)} />
          <div className={styles.frameAddMenu} style={{ left: addMenuRect.left, top: addMenuRect.top }}>
            <button type="button" className={styles.frameAddMenuItem} onClick={() => { setAddMenuOpen(false); openFilePicker(); }}>
              <Icon name="image" size={16} /><span>Добавить картинку</span>
            </button>
            <div className={styles.frameAddMenuLabel}>Выбрать фон</div>
            <div className={styles.frameAddMenuSwatches}>
              {BACKGROUND_COLORS.map((color) => (
                <button key={color} type="button" className={styles.frameAddMenuSwatch} style={{ background: color }} onClick={() => void createBackgroundDraft(color)} aria-label={`Фон ${color}`} />
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      {toolOpen && isMobile && <div ref={sheetRef} className={styles.editorMobileSheet}><div className={styles.mobileSheetHandle} onClick={() => setToolOpen(false)} onPointerDown={(e) => {
  const startY = e.clientY;
  const move = (ev: PointerEvent) => { if (ev.clientY - startY > 30) { setToolOpen(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); } };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}} /><div className={styles.mobileSheetInner}><div className={styles.mobileSheetHeader}><span className={styles.mobileSheetTitle}>{selectedItem ? 'Свойства' : currentToolLabel}</span><button type="button" className={styles.mobileSheetClose} onClick={() => setToolOpen(false)} aria-label="Скрыть настройки"><Icon name="close" size={16} /></button></div>{renderToolContent()}{activeDraft && <div className={styles.panelGroup} style={{ marginTop: 16 }}><select className={styles.panelSelect} value={highlightId} onChange={(e) => setHighlightId(e.target.value)}><option value="">Актуальное: не добавлять</option>{highlightItems.map((highlight: StoryHighlight) => <option key={highlight.id} value={highlight.id}>{highlight.title}</option>)}</select></div>}</div></div>}
    </div>
  );
}
