'use client';

import { PropsWithChildren, ReactNode, useEffect, useState } from 'react';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';
import styles from './Modal.module.css';
import { Icon } from '@/shared/ui/Icon/Icon';
import { createPortal } from 'react-dom';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  subtitle,
  icon,
  bodyClassName = '',
  headerActions,
  appearance = 'default',
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string; subtitle?: string; icon?: ReactNode; size?: 'md' | 'lg' | 'xl' | 'game'; bodyClassName?: string; headerActions?: ReactNode; appearance?: 'default' | 'pulse' }>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={[styles.backdrop, appearance === 'pulse' ? styles.backdropPulse : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className={[
          styles.modal,
          size === 'lg' ? styles.modalLg : '',
          size === 'xl' ? styles.modalXl : '',
          size === 'game' ? styles.modalGame : '',
          appearance === 'pulse' ? styles.modalPulse : '',
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
          <div className={styles.headerRight}>
            {headerActions ?? null}
            <button className={styles.close} onClick={onClose} aria-label="Закрыть">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className={[styles.body, size === 'game' ? styles.bodyGame : '', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
