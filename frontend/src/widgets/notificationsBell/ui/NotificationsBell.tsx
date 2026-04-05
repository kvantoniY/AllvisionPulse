'use client';

import { CSSProperties, UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import styles from './NotificationsBell.module.css';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { useGetFriendRequestsQuery } from '@/shared/api/friendsApi';
import {
  useClearNotificationsMutation,
  useGetNotificationsQuery,
  useLazyGetNotificationsQuery,
  useReadAllNotificationsMutation,
  useReadNotificationsMutation,
} from '@/shared/api/notificationsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { NotificationStatusPill } from '@/features/notifications/ui/NotificationStatusPill';

const PAGE_SIZE = 12;
const LOAD_MORE_THRESHOLD = 96;

function formatRelativeTime(value: string) {
  const target = new Date(value).getTime();
  const diffMs = target - Date.now();
  const absMinutes = Math.abs(diffMs) / 60000;
  const formatter = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

  if (absMinutes < 1) return 'только что';
  if (absMinutes < 60) return formatter.format(Math.round(diffMs / 60000), 'minute');
  if (absMinutes < 60 * 24) return formatter.format(Math.round(diffMs / 3600000), 'hour');
  return formatter.format(Math.round(diffMs / 86400000), 'day');
}

export function NotificationsBell() {
  const dispatch = useAppDispatch();
  const { data: requestsData } = useGetFriendRequestsQuery();
  const { data: notificationsData } = useGetNotificationsQuery({ take: PAGE_SIZE });
  const [loadMoreNotifications, loadMoreState] = useLazyGetNotificationsQuery();
  const [readAllNotifications] = useReadAllNotificationsMutation();
  const [readNotifications] = useReadNotificationsMutation();
  const [clearNotifications, { isLoading: isClearing }] = useClearNotificationsMutation();
  const incoming = requestsData?.incoming ?? [];
  const reqCount = incoming.length;

  const unseen = useAppSelector((state) => state.notifications.unseenCount);
  const items = useAppSelector((state) => state.notifications.items);
  const isMobile = useIsMobile();

  const nextCursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const count = reqCount + unseen;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!notificationsData?.items) return;
    dispatch(notificationsActions.hydrate(notificationsData.items));
    nextCursorRef.current = notificationsData.nextCursor ?? null;
    setHasMore(Boolean(notificationsData.nextCursor));
  }, [dispatch, notificationsData]);

  useEffect(() => {
    if (isMobile) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
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
      const width = Math.min(380, window.innerWidth - 32);
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

  const unreadIds = useMemo(() => items.filter((item) => !item.readAt && !item.seen).map((item) => item.id), [items]);

  useEffect(() => {
    if (!open) return;
    dispatch(notificationsActions.markAllSeen());
    if (unreadIds.length) {
      void readAllNotifications();
    }
  }, [dispatch, open, readAllNotifications, unreadIds.length]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadMoreState.isFetching) return;

    const response = await loadMoreNotifications({ take: PAGE_SIZE, cursor })
      .unwrap()
      .catch(() => null);

    if (!response) return;
    dispatch(notificationsActions.hydrate(response.items));
    nextCursorRef.current = response.nextCursor ?? null;
    setHasMore(Boolean(response.nextCursor));
  }, [dispatch, loadMoreNotifications, loadMoreState.isFetching]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceToBottom <= LOAD_MORE_THRESHOLD) {
        void loadMore();
      }
    },
    [loadMore],
  );

  const handleClear = useCallback(async () => {
    const cleared = await clearNotifications().unwrap().catch(() => null);
    if (!cleared) return;
    nextCursorRef.current = null;
    setHasMore(false);
    dispatch(notificationsActions.clearAll());
  }, [clearNotifications, dispatch]);

  const preview = useMemo(() => items, [items]);

  const content = (
    <>
      <div className={styles.toolbar}>
        <NotificationStatusPill compact />
        {preview.length ? (
          <button type="button" className={styles.clearBtn} onClick={() => void handleClear()} disabled={isClearing}>
            {isClearing ? 'Очищаем...' : 'Очистить'}
          </button>
        ) : null}
      </div>

      <div className={styles.scrollArea} onScroll={handleScroll}>
        {reqCount > 0 ? <div className={styles.row}>Новых запросов на подписку: {reqCount}</div> : null}
        {preview.length ? (
          <div className={styles.list}>
            {preview.map((notification) => (
              <Link
                key={notification.id}
                href={notification.href}
                className={[styles.item, !notification.readAt && !notification.seen ? styles.itemUnread : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  dispatch(notificationsActions.markSeen({ id: notification.id }));
                  void readNotifications({ ids: [notification.id] });
                  setOpen(false);
                }}
              >
                <div className={styles.itemAvatar}>
                  <Avatar
                    url={notification.imageUrl ?? notification.actor?.avatarUrl}
                    name={notification.actor?.username ?? notification.title}
                    size={40}
                  />
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTop}>
                    <div className={styles.itemType}>{notification.category === 'message' ? 'Сообщения' : 'Уведомление'}</div>
                    <time className={styles.itemTime} dateTime={notification.createdAt}>
                      {formatRelativeTime(notification.createdAt)}
                    </time>
                  </div>
                  <div className={styles.itemTitle}>{notification.title}</div>
                  <div className={styles.itemMsg}>{notification.message}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Пока ничего нового</div>
        )}

        {loadMoreState.isFetching ? <div className={styles.footerNote}>Загружаем еще...</div> : null}
        {!loadMoreState.isFetching && hasMore ? <div className={styles.footerNote}>Прокрутите ниже, чтобы загрузить еще</div> : null}
      </div>
    </>
  );

  return (
    <div className={styles.wrap} ref={ref}>
      <button ref={btnRef} className={styles.btn} onClick={() => setOpen((value) => !value)} aria-label="Уведомления">
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
