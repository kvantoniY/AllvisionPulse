'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import styles from './NotificationsBell.module.css';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { useGetFriendRequestsQuery } from '@/shared/api/friendsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { createPortal } from 'react-dom';

export function NotificationsBell() {
  const dispatch = useAppDispatch();
  const { data } = useGetFriendRequestsQuery();
  const incoming = data?.incoming ?? [];
  const reqCount = incoming.length;

  const unseen = useAppSelector((s) => s.notifications.unseenCount);
  const items = useAppSelector((s) => s.notifications.items);
  const isMobile = useIsMobile();

  const count = reqCount + unseen;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (isMobile) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isMobile]);

  useEffect(() => {
    if (!open || isMobile || typeof window === 'undefined') return;
    const updatePosition = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 32);
      const right = Math.max(16, window.innerWidth - rect.right);
      const top = Math.min(window.innerHeight - 16, rect.bottom + 8);
      setPopoverStyle({ top: `${top}px`, right: `${right}px`, width: `${width}px` });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (open) dispatch(notificationsActions.markAllSeen());
  }, [open, dispatch]);

  const preview = useMemo(() => items.slice(0, 20), [items]);

  const content = (
    <>
      {reqCount > 0 ? <div className={styles.row}>Новые запросы на подписку: {reqCount}</div> : null}
      {preview.length ? (
        <div className={styles.list}>
          {preview.map((n) => (
            <div key={n.id} className={styles.item}>
              <div className={styles.itemType}>{n.type}</div>
              {n.title || n.message ? <div className={styles.itemMsg}>{n.title ?? n.message}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>Пока ничего нового</div>
      )}
    </>
  );

  return (
    <div className={styles.wrap} ref={ref}>
      <button ref={btnRef} className={styles.btn} onClick={() => setOpen((v) => !v)} aria-label="Уведомления">
        <Icon name="bell" size={18} />
        {count > 0 ? <span className={styles.badge}>{count}</span> : null}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            isMobile ? (
              <MobileSheet open={open} onClose={() => setOpen(false)} title="Уведомления">
                <div className={styles.mobileBody}>{content}</div>
              </MobileSheet>
            ) : (
              <div ref={popoverRef} className={styles.popover} style={popoverStyle}>
                <div className={styles.popTitle}>Уведомления</div>
                {content}
              </div>
            ),
            document.body,
          )
        : null}
    </div>
  );
}
