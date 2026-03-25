'use client';

import { PropsWithChildren, ReactNode, useEffect } from 'react';
import styles from './Modal.module.css';
import { Icon } from '@/shared/ui/Icon/Icon';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  subtitle,
  icon,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string; subtitle?: string; icon?: ReactNode; size?: 'md' | 'lg' | 'xl' | 'game' }>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className={[
          styles.modal,
          size === 'lg' ? styles.modalLg : '',
          size === 'xl' ? styles.modalXl : '',
          size === 'game' ? styles.modalGame : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerMain}>
            {icon ? <div className={styles.iconWrap}>{icon}</div> : null}
            <div className={styles.titleWrap}>
              <div className={styles.title}>{title ?? ''}</div>
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={[styles.body, size === 'game' ? styles.bodyGame : ''].filter(Boolean).join(' ')}>{children}</div>
      </div>
    </div>
  );
}
