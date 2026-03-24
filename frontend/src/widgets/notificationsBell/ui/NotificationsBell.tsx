'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './NotificationsBell.module.css';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { useGetFriendRequestsQuery } from '@/shared/api/friendsApi';
import { Icon } from '@/shared/ui/Icon/Icon';

export function NotificationsBell() {
  const dispatch = useAppDispatch();
  const { data } = useGetFriendRequestsQuery();
  const incoming = data?.incoming ?? [];
  const reqCount = incoming.length;

  const unseen = useAppSelector((s) => s.notifications.unseenCount);
  const items = useAppSelector((s) => s.notifications.items);

  const count = reqCount + unseen;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (open) dispatch(notificationsActions.markAllSeen());
  }, [open, dispatch]);

  const preview = useMemo(() => items.slice(0, 6), [items]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.btn} onClick={() => setOpen((v) => !v)} aria-label="Уведомления">
        <Icon name="bell" size={18} />
        {count > 0 ? <span className={styles.badge}>{count}</span> : null}
      </button>
      {open ? (
        <div className={styles.popover}>
          <div className={styles.popTitle}>Уведомления</div>
          {reqCount > 0 ? <div className={styles.row}>Новые заявки в друзья: {reqCount}</div> : null}
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
        </div>
      ) : null}
    </div>
  );
}
