'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './UserSearch.module.css';
import { useLazySearchUsersQuery } from '@/shared/api/usersApi';
import { StoryRingAvatar } from '@/features/stories';
import { ROUTES } from '@/shared/config/app';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

type UserSearchProps = {
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  onPickUser?: () => void;
  onCloseRequest?: () => void;
  forceVisible?: boolean;
};

export function UserSearch({
  autoFocus = false,
  placeholder = 'Поиск людей',
  className,
  onPickUser,
  onCloseRequest,
  forceVisible = false,
}: UserSearchProps = {}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [trigger, { data, isFetching }] = useLazySearchUsersQuery();
  const boxRef = useRef<HTMLDivElement | null>(null);

  const users = useMemo(() => data?.users ?? [], [data]);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const t = setTimeout(() => {
      trigger({ q: query });
    }, 250);
    return () => clearTimeout(t);
  }, [q, trigger]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = boxRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setOpen(false);
        onCloseRequest?.();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onCloseRequest]);

  const onPick = (username: string) => {
    setOpen(false);
    setQ('');
    onPickUser?.();
    onCloseRequest?.();
    router.push(ROUTES.app.profile(username));
  };

  useEffect(() => {
    if (!autoFocus) return;
    const input = boxRef.current?.querySelector('input');
    if (input instanceof HTMLInputElement) input.focus();
  }, [autoFocus]);

  return (
    <div
      ref={boxRef}
      className={[styles.wrap, forceVisible ? styles.wrapForceVisible : '', className].filter(Boolean).join(' ')}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && boxRef.current?.contains(nextTarget)) return;
        setOpen(false);
        onCloseRequest?.();
      }}
    >
      <div className={styles.inputWrap}>
        <Icon name="search" size={16} className={styles.searchIcon} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={styles.input}
        />
      </div>

      {open && q.trim() ? (
        <div className={styles.dropdown}>
          {isFetching ? (
            <div className={styles.loading}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={styles.item}>
                  <Skeleton circle style={{ width: 32, height: 32 }} />
                  <div className={styles.meta}><SkeletonText lines={2} /></div>
                </div>
              ))}
            </div>
          ) : null}
          {!isFetching && users.length === 0 ? <div className={styles.empty}>Ничего не найдено</div> : null}
          {users.map((u) => (
            <button key={u.id} className={styles.item} onClick={() => onPick(u.username)}>
              <StoryRingAvatar userId={u.id} url={u.avatarUrl} name={u.username} size={32} />
              <div className={styles.meta}>
                <div className={styles.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{u.username}<AdminBadge role={u.role} username={u.username} /></div>
                <div className={styles.handle}>@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
