'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './ImageGallery.module.css';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';

export type GalleryImage = { id: string; url: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ImageGallery({
  images,
  aspect = '16 / 9',
  maxHeight = 520,
}: {
  images: GalleryImage[];
  aspect?: string;
  maxHeight?: number;
}) {
  const list = images ?? [];
  const many = list.length > 1;
  const [idx, setIdx] = useState(0);
  const lb = useLightbox();

  useEffect(() => {
    // reset when switching post
    setIdx(0);
  }, [list.map((i) => i.id).join('|')]);

  const safeIdx = useMemo(() => clamp(idx, 0, Math.max(0, list.length - 1)), [idx, list.length]);
  useEffect(() => {
    if (safeIdx !== idx) setIdx(safeIdx);
  }, [safeIdx, idx]);

  if (!list.length) return null;

  if (!many) {
    const img = list[0];
    return (
      <div className={styles.single} style={{ aspectRatio: aspect, maxHeight }}>
        <img
          src={img.url}
          alt=""
          className={styles.img}
          loading="lazy"
          draggable={false}
          onClick={() => lb?.openLightbox([{ id: img.id, url: img.url }], 0)}
          style={{ cursor: 'pointer' }}
        />
      </div>
    );
  }

  return (
    <div className={styles.slider} style={{ aspectRatio: aspect, maxHeight }}>
      <div className={styles.track} style={{ transform: `translateX(-${safeIdx * 100}%)` }}>
        {list.map((img, i) => (
          <div key={img.id} className={styles.slide}>
            <img
              src={img.url}
              alt=""
              className={styles.img}
              loading="lazy"
              draggable={false}
              onClick={() => lb?.openLightbox(list.map((it) => ({ id: it.id, url: it.url })), i)}
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
