'use client';

import { PropsWithChildren, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './Modal.module.css';

type ModalProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'game';
  bodyClassName?: string;
  headerActions?: ReactNode;
  appearance?: 'default' | 'pulse';
  hideHeader?: boolean;
}>;

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
  hideHeader = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const shouldHideHeader = hideHeader || size === 'game';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
          shouldHideHeader ? styles.modalWithoutHeader : '',
          size === 'lg' ? styles.modalLg : '',
          size === 'xl' ? styles.modalXl : '',
          size === 'game' ? styles.modalGame : '',
          appearance === 'pulse' ? styles.modalPulse : '',
        ].filter(Boolean).join(' ')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {shouldHideHeader ? (
          <button type="button" className={[styles.close, styles.closeFloating].join(' ')} onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        ) : (
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
              <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>
        )}
        <div className={[styles.body, size === 'game' ? styles.bodyGame : '', bodyClassName].filter(Boolean).join(' ')}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
