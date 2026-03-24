'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';
import { ROUTES } from '@/shared/config/app';
import { StoryRingAvatar, StoriesRail } from '@/features/stories';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { UserSearch } from '@/features/userSearch/ui/UserSearch';
import { NotificationsBell } from '@/widgets/notificationsBell/ui/NotificationsBell';
import { Icon } from '@/shared/ui/Icon/Icon';

function titleFromPath(path: string) {
  if (path.startsWith('/health')) return 'Пульс';
  if (path.startsWith('/messages')) return 'Сообщения';
  if (path.startsWith('/friends')) return 'Друзья';
  if (path.startsWith('/profile')) return 'Профиль';
  if (path.startsWith('/feed') || path === '/') return 'Лента';
  if (path.startsWith('/game')) return 'Игры';
  if (path.startsWith('/settings')) return 'Настройки';
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
          <Link href={ROUTES.app.settings} className={styles.settings} aria-label="Настройки">
            <Icon name="settings" size={18} />
          </Link>
          {me ? (
            <Link href={ROUTES.app.profile(me.username)} className={styles.me}>
              <StoryRingAvatar userId={me.id} url={me.avatarUrl} name={me.username} size={34} />
              <div className={styles.meText}>
                <div className={styles.meName}>{me.username}</div>
                <div className={styles.meHandle}>@{me.username}</div>
              </div>
            </Link>
          ) : null}
        </div>
      </div>
      <StoriesRail />
    </header>
  );
}
