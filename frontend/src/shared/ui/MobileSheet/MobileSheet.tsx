'use client';

import { PropsWithChildren, ReactNode, useEffect } from 'react';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './MobileSheet.module.css';

export function MobileSheet({
  open,
  onClose,
  title,
  action,
  children,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title?: string;
  action?: ReactNode;
}>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const unlock = lockBodyScroll();
    document.addEventListener('keydown', onKey);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.sheet} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={22} />
          </button>
          <div className={styles.title}>{title ?? ''}</div>
          <div className={styles.action}>{action ?? <span />}</div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
