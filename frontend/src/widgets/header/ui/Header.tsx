'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';
import { ROUTES } from '@/shared/config/app';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { UserSearch } from '@/features/userSearch/ui/UserSearch';
import { NotificationsBell } from '@/widgets/notificationsBell/ui/NotificationsBell';

function titleFromPath(path: string) {
  if (path.startsWith('/health')) return 'Health';
  if (path.startsWith('/messages')) return 'Messages';
  if (path.startsWith('/friends')) return 'Friends';
  if (path.startsWith('/profile')) return 'Profile';
  if (path.startsWith('/feed') || path === '/') return 'Feed';
  if (path.startsWith('/game')) return 'Game';
  if (path.startsWith('/settings')) return 'Settings';
  return 'Allvision Pulse';
}

export function Header() {
  const pathname = usePathname();
  const { data } = useGetMeQuery();
  const me = data?.user;
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.title}>{titleFromPath(pathname)}</div>
        <UserSearch />
        <div className={styles.right}>
          <NotificationsBell />
          <Link href={ROUTES.app.settings} className={styles.settings} aria-label="settings">
            ⚙
          </Link>
          {me ? (
            <Link href={ROUTES.app.profile(me.username)} className={styles.me}>
              <Avatar url={me.avatarUrl} name={me.username} size={32} />
              <div className={styles.meText}>
                <div className={styles.meName}>{me.username}</div>
                <div className={styles.meHandle}>@{me.username}</div>
              </div>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
