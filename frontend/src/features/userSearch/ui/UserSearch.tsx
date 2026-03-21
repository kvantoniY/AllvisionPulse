'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './UserSearch.module.css';
import { useLazySearchUsersQuery } from '@/shared/api/usersApi';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { ROUTES } from '@/shared/config/app';

export function UserSearch() {
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
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onPick = (username: string) => {
    setOpen(false);
    setQ('');
    router.push(ROUTES.app.profile(username));
  };

  return (
    <div ref={boxRef} className={styles.wrap}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search people…"
        className={styles.input}
      />

      {open && q.trim() ? (
        <div className={styles.dropdown}>
          {isFetching ? <div className={styles.loading}>Searching…</div> : null}
          {!isFetching && users.length === 0 ? <div className={styles.empty}>No users found</div> : null}
          {users.map((u) => (
            <button key={u.id} className={styles.item} onClick={() => onPick(u.username)}>
              <Avatar url={u.avatarUrl} name={u.username} size={30} />
              <div className={styles.meta}>
                <div className={styles.name}>{u.username}</div>
                <div className={styles.handle}>@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
