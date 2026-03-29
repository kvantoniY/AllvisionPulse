'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';
import { APP_NAME, ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { UserSearch } from '@/features/userSearch/ui/UserSearch';
import { NotificationsBell } from '@/widgets/notificationsBell/ui/NotificationsBell';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { Avatar } from '@/shared/ui/Avatar/Avatar';

function getMobileTitle(pathname: string) {
  if (pathname === '/' || pathname.startsWith('/feed')) return 'Лента';
  if (pathname.startsWith('/messages')) return 'Сообщения';
  if (pathname.startsWith('/health')) return 'Пульс';
  if (pathname.startsWith('/friends')) return 'Подписки';
  if (pathname.startsWith('/support')) return 'Поддержка';
  if (pathname.startsWith('/settings')) return 'Настройки';
  if (pathname.startsWith('/admin')) return 'Админ';
  if (pathname.startsWith('/profile')) return 'Профиль';
  return 'Allvision Pulse';
}

export function Header() {
  const { data } = useGetMeQuery();
  const me = data?.user;
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const mobileTitle = useMemo(() => getMobileTitle(pathname), [pathname]);
  const canOpenComposer = pathname === '/' || pathname.startsWith('/feed');

  if (isMobile) {
    return (
      <header className={[styles.header, styles.headerMobile].join(' ')}>
        <div className={[styles.inner, styles.innerMobile].join(' ')}>
          <div className={styles.mobileLeft}>
            {me ? (
              <Link href={ROUTES.app.profile(me.username)} className={styles.mobileAvatar} aria-label="Открыть профиль">
                <Avatar url={me.avatarUrl} name={me.username} size={40} />
              </Link>
            ) : null}
            <div className={styles.mobileTitleRow}>
              <span className={styles.mobileTitle}>{mobileTitle}</span>
            </div>
          </div>

          <div className={styles.mobileActions}>
            {canOpenComposer ? (
              <button
                type="button"
                className={styles.mobileCircleBtn}
                aria-label="Новый пост"
                onClick={() => window.dispatchEvent(new CustomEvent('av:open-post-composer'))}
              >
                <Icon name="plus" size={22} />
              </button>
            ) : null}
            <NotificationsBell />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <Link href={ROUTES.app.feed} className={styles.brand} aria-label={APP_NAME}>
            <span className={styles.brandLogo} aria-hidden />
            <span className={styles.brandText}>{APP_NAME}</span>
          </Link>

          <div className={styles.searchWrap}>
            <UserSearch />
          </div>
        </div>

        <div className={styles.right}>
          <NotificationsBell />
          <Link href={ROUTES.app.settings} className={styles.settings} aria-label="Настройки">
            <Icon name="settings" size={18} />
          </Link>
          {me ? (
            <Link href={ROUTES.app.profile(me.username)} className={styles.me}>
              <Avatar url={me.avatarUrl} name={me.username} size={34} />
              <div className={styles.meText}>
                <div className={styles.meName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{me.username}<AdminBadge role={me.role} /></div>
                <div className={styles.meHandle}>@{me.username}</div>
              </div>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
