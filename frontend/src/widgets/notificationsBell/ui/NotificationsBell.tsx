'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './NotificationsBell.module.css';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { useGetFriendRequestsQuery } from '@/shared/api/friendsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';

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

  useEffect(() => {
    if (isMobile) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isMobile]);

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
      <button className={styles.btn} onClick={() => setOpen((v) => !v)} aria-label="Уведомления">
        <Icon name="bell" size={18} />
        {count > 0 ? <span className={styles.badge}>{count}</span> : null}
      </button>
      {isMobile ? (
        <MobileSheet open={open} onClose={() => setOpen(false)} title="Уведомления">
          <div className={styles.mobileBody}>{content}</div>
        </MobileSheet>
      ) : open ? (
        <div className={styles.popover}>
          <div className={styles.popTitle}>Уведомления</div>
          {content}
        </div>
      ) : null}
    </div>
  );
}
