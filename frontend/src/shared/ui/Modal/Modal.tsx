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
  immersiveActive?: boolean;
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
  immersiveActive = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const shouldHideHeader = hideHeader || size === 'game';
  const canCloseFromShell = !immersiveActive;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !canCloseFromShell) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canCloseFromShell, open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={[
        styles.backdrop,
        appearance === 'pulse' ? styles.backdropPulse : '',
        immersiveActive ? styles.backdropImmersive : '',
      ].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      onMouseDown={canCloseFromShell ? onClose : undefined}
    >
      <div
        className={[
          styles.modal,
          shouldHideHeader ? styles.modalWithoutHeader : '',
          size === 'lg' ? styles.modalLg : '',
          size === 'xl' ? styles.modalXl : '',
          size === 'game' ? styles.modalGame : '',
          appearance === 'pulse' ? styles.modalPulse : '',
          immersiveActive ? styles.modalImmersive : '',
        ].filter(Boolean).join(' ')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {shouldHideHeader && canCloseFromShell ? (
          <button type="button" className={[styles.close, styles.closeFloating].join(' ')} onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        ) : shouldHideHeader ? null : (
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
        <div
          className={[styles.body, size === 'game' ? styles.bodyGame : '', immersiveActive ? styles.bodyImmersive : '', bodyClassName].filter(Boolean).join(' ')}
          data-modal-game-body={size === 'game' ? 'true' : undefined}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
