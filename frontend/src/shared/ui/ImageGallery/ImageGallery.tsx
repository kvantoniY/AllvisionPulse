'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import styles from './ImageGallery.module.css';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';

export type GalleryImage = { id: string; url: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const ratioCache = new Map<string, number>();

function useImageRatios(images: GalleryImage[], enabled = false) {
  const [ratios, setRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    const pending = images.filter((img) => !ratios[img.id] && !ratioCache.has(img.url));
    if (!pending.length) {
      const cached = images.reduce<Record<string, number>>((acc, img) => {
        const ratio = ratioCache.get(img.url);
        if (ratio) acc[img.id] = ratio;
        return acc;
      }, {});
      if (Object.keys(cached).length) setRatios((prev) => ({ ...cached, ...prev }));
      return;
    }
    if (!pending.length) return;

    const loaders = pending.map((img) => {
      const probe = new window.Image();
      const commit = (ratio: number) => {
        const safeRatio = ratio > 0 ? ratio : 1;
        ratioCache.set(img.url, safeRatio);
        if (cancelled) return;
        setRatios((prev) => (prev[img.id] ? prev : { ...prev, [img.id]: safeRatio }));
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
  }, [enabled, images, ratios]);

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
  const lb = useLightbox();
  const ratios = useImageRatios(list, mode === 'modal' || adaptive);

  useEffect(() => {
    setIdx(0);
  }, [list.map((i) => i.id).join('|')]);

  const safeIdx = useMemo(() => clamp(idx, 0, Math.max(0, list.length - 1)), [idx, list.length]);
  useEffect(() => {
    if (safeIdx !== idx) setIdx(safeIdx);
  }, [safeIdx, idx]);

  const activeImage = list[safeIdx] ?? list[0] ?? null;
  const activeRatio = activeImage ? ratios[activeImage.id] ?? 1 : 1;

  if (!list.length) return null;

  const modalStyle = mode === 'modal'
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
        style={mode === 'modal' ? modalStyle : adaptive ? ({ ['--gallery-height' as string]: `${maxHeight}px` } as CSSProperties) : { aspectRatio: aspect, maxHeight }}
      >
        <img
          src={img.url}
          alt=""
          className={[styles.img, fit === 'contain' ? styles.imgContain : '', mode === 'modal' ? styles.imgModal : ''].filter(Boolean).join(' ')}
          loading={mode === 'modal' ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onClick={(event) => { event.stopPropagation(); lb?.openLightbox([{ id: img.id, url: img.url }], 0); }}
          onLoad={() => onActiveImageLoad?.(0)}
          style={{ cursor: 'pointer' }}
        />
      </div>
    );
  }

  return (
    <div
      className={[styles.slider, adaptive ? styles.adaptive : '', mode === 'modal' ? styles.modal : '', !rounded ? styles.noRadius : ''].filter(Boolean).join(' ')}
      style={mode === 'modal' ? modalStyle : adaptive ? ({ ['--gallery-height' as string]: `${maxHeight}px` } as CSSProperties) : { aspectRatio: aspect, maxHeight }}
    >
      <div className={styles.track} style={{ transform: `translateX(-${safeIdx * 100}%)` }}>
        {list.map((img, i) => (
          <div key={img.id} className={styles.slide}>
            <img
              src={img.url}
              alt=""
              className={[styles.img, fit === 'contain' ? styles.imgContain : '', mode === 'modal' ? styles.imgModal : ''].filter(Boolean).join(' ')}
              loading={mode === 'modal' ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              onClick={(event) => { event.stopPropagation(); lb?.openLightbox(list.map((it) => ({ id: it.id, url: it.url })), i); }}
              onLoad={() => {
                if (i === safeIdx) onActiveImageLoad?.(i);
              }}
              style={{ cursor: 'pointer' }}
            />
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
          <span className={styles.navIcon}>‹</span>
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
          <span className={styles.navIcon}>›</span>
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
