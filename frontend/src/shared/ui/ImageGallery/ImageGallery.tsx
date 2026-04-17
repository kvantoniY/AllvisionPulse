'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './ImageGallery.module.css';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { Icon } from '@/shared/ui/Icon/Icon';
import { MediaPlaceholder } from '@/shared/ui/MediaPlaceholder/MediaPlaceholder';

export type GalleryImage = { id: string; url: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const ratioCache = new Map<string, number>();

function useImageRatios(images: GalleryImage[], enabled = false) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const imagesKey = useMemo(() => images.map((img) => `${img.id}:${img.url}`).join('|'), [images]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    setRatios((prev) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const img of images) {
        const cachedRatio = ratioCache.get(img.url);
        const currentRatio = cachedRatio ?? prev[img.id];
        if (currentRatio) next[img.id] = currentRatio;
        if (prev[img.id] !== currentRatio) changed = true;
      }

      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }

      return next;
    });

    let cancelled = false;
    const pending = images.filter((img) => !ratioCache.has(img.url));
    if (!pending.length) return;

    const loaders = pending.map((img) => {
      const probe = new window.Image();
      const commit = (ratio: number) => {
        const safeRatio = ratio > 0 ? ratio : 1;
        ratioCache.set(img.url, safeRatio);
        if (cancelled) return;
        setRatios((prev) => (prev[img.id] === safeRatio ? prev : { ...prev, [img.id]: safeRatio }));
      };
      probe.onload = () => {
        const nextRatio = probe.naturalWidth > 0 && probe.naturalHeight > 0 ? probe.naturalWidth / probe.naturalHeight : 1;
        commit(nextRatio);
      };
      probe.onerror = () => commit(1);
      probe.src = img.url;
      return probe;
    });

    return () => {
      cancelled = true;
      for (const probe of loaders) {
        probe.onload = null;
        probe.onerror = null;
      }
    };
  }, [enabled, imagesKey]);

  return ratios;
}


export function ImageGallery({
  images,
  aspect = '16 / 9',
  maxHeight = 520,
  rounded = true,
  fit = 'cover',
  adaptive = false,
  mode = 'default',
  onActiveImageLoad,
}: {
  images: GalleryImage[];
  aspect?: string;
  maxHeight?: number;
  rounded?: boolean;
  fit?: 'cover' | 'contain';
  adaptive?: boolean;
  mode?: 'default' | 'modal';
  onActiveImageLoad?: (index: number) => void;
}) {
  const list = images ?? [];
  const many = list.length > 1;
  const [idx, setIdx] = useState(0);
  const [loadedSet, setLoadedSet] = useState<Set<number>>(new Set());
  const lb = useLightbox();
  const ratios = useImageRatios(list, mode === 'modal' || adaptive);

  const markLoaded = useCallback((i: number) => {
    setLoadedSet((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, []);

  useEffect(() => {
    setIdx(0);
    setLoadedSet(new Set());
  }, [list.map((i) => i.id).join('|')]);

  const safeIdx = useMemo(() => clamp(idx, 0, Math.max(0, list.length - 1)), [idx, list.length]);
  useEffect(() => {
    if (safeIdx !== idx) setIdx(safeIdx);
  }, [safeIdx, idx]);

  const activeImage = list[safeIdx] ?? list[0] ?? null;
  const activeRatio = activeImage ? ratios[activeImage.id] ?? 1 : 1;

  if (!list.length) return null;

  const galleryStyle = mode === 'modal'
    ? ({
        ['--gallery-height' as string]: `${maxHeight}px`,
        ['--gallery-ratio' as string]: `${activeRatio}`,
      } as CSSProperties)
    : adaptive
      ? ({
          ['--gallery-height' as string]: `${maxHeight}px`,
          ['--gallery-ratio' as string]: `${activeRatio}`,
        } as CSSProperties)
      : undefined;

  if (!many) {
    const img = list[0];
    return (
      <div
        className={[
          styles.single,
          adaptive ? styles.adaptive : '',
          mode === 'modal' ? styles.modal : '',
          !rounded ? styles.noRadius : '',
        ].filter(Boolean).join(' ')}
        style={{ ...galleryStyle ?? { aspectRatio: aspect, maxHeight }, position: 'relative' as const }}
      >
        <img
          src={img.url}
          alt=""
          className={[styles.img, fit === 'contain' ? styles.imgContain : '', mode === 'modal' ? styles.imgModal : ''].filter(Boolean).join(' ')}
          loading={mode === 'modal' ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          ref={(node) => { if (node?.complete && node.naturalWidth > 0) { markLoaded(0); onActiveImageLoad?.(0); } }}
          onClick={(event) => { event.stopPropagation(); lb?.openLightbox([{ id: img.id, url: img.url }], 0); }}
          onLoad={() => { markLoaded(0); onActiveImageLoad?.(0); }}
          onError={() => markLoaded(0)}
          style={{ cursor: 'pointer' }}
        />
        <MediaPlaceholder loaded={loadedSet.has(0)} />
      </div>
    );
  }

  return (
    <div
      className={[styles.slider, adaptive ? styles.adaptive : '', mode === 'modal' ? styles.modal : '', !rounded ? styles.noRadius : ''].filter(Boolean).join(' ')}
      style={galleryStyle ?? { aspectRatio: aspect, maxHeight }}
    >
      <div className={styles.track} style={{ transform: `translateX(-${safeIdx * 100}%)` }}>
        {list.map((img, i) => (
          <div key={img.id} className={styles.slide} style={{ position: 'relative' }}>
            <img
              src={img.url}
              alt=""
              className={[styles.img, fit === 'contain' ? styles.imgContain : '', mode === 'modal' ? styles.imgModal : ''].filter(Boolean).join(' ')}
              loading={mode === 'modal' ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              ref={(node) => { if (node?.complete && node.naturalWidth > 0) { markLoaded(i); if (i === safeIdx) onActiveImageLoad?.(i); } }}
              onClick={(event) => { event.stopPropagation(); lb?.openLightbox(list.map((it) => ({ id: it.id, url: it.url })), i); }}
              onLoad={() => {
                markLoaded(i);
                if (i === safeIdx) onActiveImageLoad?.(i);
              }}
              onError={() => markLoaded(i)}
              style={{ cursor: 'pointer' }}
            />
            {i === safeIdx ? <MediaPlaceholder loaded={loadedSet.has(i)} /> : null}
          </div>
        ))}
      </div>

      {safeIdx > 0 ? (
        <button
          type="button"
          className={styles.navLeft}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIdx((v) => clamp(v - 1, 0, list.length - 1));
          }}
          aria-label="Предыдущая картинка"
        >
          <Icon name="chevronLeft" size={18} className={styles.navIcon} />
        </button>
      ) : null}
      {safeIdx < list.length - 1 ? (
        <button
          type="button"
          className={styles.navRight}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIdx((v) => clamp(v + 1, 0, list.length - 1));
          }}
          aria-label="Следующая картинка"
        >
          <Icon name="chevronRight" size={18} className={styles.navIcon} />
        </button>
      ) : null}

      <div className={styles.dots} aria-label="gallery dots">
        {list.map((_, i) => (
          <button
            key={i}
            type="button"
            className={[styles.dot, i === safeIdx ? styles.dotActive : ''].filter(Boolean).join(' ')}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIdx(i);
            }}
            aria-label={`go to ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
