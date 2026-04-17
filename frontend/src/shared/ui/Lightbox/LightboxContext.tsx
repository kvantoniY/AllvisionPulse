'use client';

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MediaPlaceholder } from '@/shared/ui/MediaPlaceholder/MediaPlaceholder';
import styles from './LightboxContext.module.css';

export type LightboxImage = { id: string; url: string };

type LightboxState = {
  open: boolean;
  images: LightboxImage[];
  index: number;
};

type LightboxApi = {
  openLightbox: (images: LightboxImage[], index?: number) => void;
  closeLightbox: () => void;
};

const Ctx = createContext<LightboxApi | null>(null);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function LightboxProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<LightboxState>({ open: false, images: [], index: 0 });

  const openLightbox = useCallback((images: LightboxImage[], index: number = 0) => {
    const safeIndex = clamp(index, 0, Math.max(0, images.length - 1));
    setState({ open: true, images, index: safeIndex });
  }, []);

  const closeLightbox = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const api = useMemo(() => ({ openLightbox, closeLightbox }), [openLightbox, closeLightbox]);

  const images = state.images ?? [];
  const idx = clamp(state.index, 0, Math.max(0, images.length - 1));

  useEffect(() => {
    if (idx !== state.index) setState((s) => ({ ...s, index: idx }));
  }, [idx, state.index]);

  const many = images.length > 1;
  const current = images[idx];
  const [lbImgLoaded, setLbImgLoaded] = useState(false);

  useEffect(() => {
    setLbImgLoaded(false);
  }, [current?.url]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal open={state.open} onClose={closeLightbox} title="">
        {current ? (
          <div className={styles.wrap}>
            <div className={styles.stage} style={{ position: 'relative' }}>
              <img
                src={current.url}
                alt=""
                className={styles.img}
                draggable={false}
                ref={(node) => { if (node?.complete && node.naturalWidth > 0) setLbImgLoaded(true); }}
                onLoad={() => setLbImgLoaded(true)}
                onError={() => setLbImgLoaded(true)}
              />
              <MediaPlaceholder loaded={lbImgLoaded} />
            </div>

            {many ? (
              <>
                <button
                  type="button"
                  className={styles.navLeft}
                  onClick={() => setState((s) => ({ ...s, index: clamp(s.index - 1, 0, images.length - 1) }))}
                  aria-label="previous"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.navRight}
                  onClick={() => setState((s) => ({ ...s, index: clamp(s.index + 1, 0, images.length - 1) }))}
                  aria-label="next"
                >
                  ›
                </button>

                <div className={styles.dots} aria-label="dots">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={[styles.dot, i === idx ? styles.dotActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setState((s) => ({ ...s, index: i }))}
                      aria-label={`go to ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

export function useLightbox() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLightbox must be used within LightboxProvider');
  return ctx;
}
