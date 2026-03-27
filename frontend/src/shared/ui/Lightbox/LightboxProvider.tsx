'use client';

import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './Lightbox.module.css';
import { Icon } from '@/shared/ui/Icon/Icon';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';

type LightboxImage = { url: string; id?: string };

type LightboxState = {
  open: boolean;
  images: LightboxImage[];
  index: number;
};

type LightboxApi = {
  openLightbox: (images: LightboxImage[], startIndex?: number) => void;
  closeLightbox: () => void;
};

const Ctx = createContext<LightboxApi | null>(null);

export function useLightbox() {
  const v = useContext(Ctx);
  return v;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function LightboxProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<LightboxState>({ open: false, images: [], index: 0 });

  const closeLightbox = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const openLightbox = useCallback((images: LightboxImage[], startIndex = 0) => {
    const list = (images ?? []).filter((i) => !!i?.url);
    if (!list.length) return;
    setState({ open: true, images: list, index: clamp(startIndex, 0, list.length - 1) });
  }, []);

  const api = useMemo<LightboxApi>(() => ({ openLightbox, closeLightbox }), [openLightbox, closeLightbox]);

  // keybinds
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') {
        setState((s) => ({ ...s, index: clamp(s.index - 1, 0, s.images.length - 1) }));
      }
      if (e.key === 'ArrowRight') {
        setState((s) => ({ ...s, index: clamp(s.index + 1, 0, s.images.length - 1) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, closeLightbox]);

  useEffect(() => {
    if (!state.open) return;
    return lockBodyScroll();
  }, [state.open]);

  const idx = clamp(state.index, 0, Math.max(0, state.images.length - 1));
  const img = state.images[idx];
  const many = state.images.length > 1;

  return (
    <Ctx.Provider value={api}>
      {children}
      {state.open ? (
        <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={closeLightbox}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <button className={styles.close} type="button" onClick={closeLightbox} aria-label="close">
              <Icon name="close" size={20} />
            </button>

            {many && idx > 0 ? (
              <button
                className={styles.navLeft}
                type="button"
                onClick={() => setState((s) => ({ ...s, index: clamp(idx - 1, 0, s.images.length - 1) }))}
                aria-label="Предыдущая картинка"
              >
                <Icon name="arrowLeft" size={18} />
              </button>
            ) : null}
            {many && idx < state.images.length - 1 ? (
              <button
                className={styles.navRight}
                type="button"
                onClick={() => setState((s) => ({ ...s, index: clamp(idx + 1, 0, s.images.length - 1) }))}
                aria-label="Следующая картинка"
              >
                <Icon name="arrowLeft" size={18} className={styles.navRightIcon} />
              </button>
            ) : null}

            <div className={styles.stage}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.img} src={img?.url} alt="" draggable={false} />
            </div>
            {many ? <div className={styles.counter}>{idx + 1} / {state.images.length}</div> : null}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
