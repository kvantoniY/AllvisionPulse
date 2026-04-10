'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Sidebar.module.css';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { StoryRingAvatar } from '@/features/stories';
import { useLogoutMutation } from '@/shared/api/authApi';
import { useFriendBadge } from '@/features/friendBadge/useFriendBadge';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: ComponentProps<typeof Icon>['name'];
  active: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}>
      <span className={styles.iconWrap} aria-hidden>
        <Icon name={icon} size={18} className={styles.icon} />
      </span>
      <span className={styles.label}>
        {label}
        {badge && badge > 0 ? <span className={styles.badge}>{badge}</span> : null}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useGetMeQuery();
  const me = data?.user;
  const [logout, { isLoading }] = useLogoutMutation();
  const { incomingCount } = useFriendBadge();
  const unreadMsgs = useAppSelector((s) => s.chatUi.unreadTotal);

  const onLogout = async () => {
    await logout().unwrap().catch(() => null);
    router.replace(ROUTES.auth.login);
  };

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        <NavItem href={ROUTES.app.feed} label="Лента" icon="home" active={pathname === '/' || pathname.startsWith('/feed')} />
        <NavItem href={ROUTES.app.health} label="Пульс" icon="pulse" active={pathname.startsWith('/health')} />
        <NavItem href={ROUTES.app.friends} label="Подписки" icon="users" active={pathname.startsWith('/friends')} badge={incomingCount} />
        <NavItem href={ROUTES.app.messages} label="Сообщения" icon="messages" active={pathname.startsWith('/messages')} badge={unreadMsgs} />
        <NavItem href={ROUTES.app.support} label="Тех поддержка" icon="support" active={pathname.startsWith('/support')} />
        {me?.role === 'ADMIN' ? <NavItem href={ROUTES.app.admin} label="Админ панель" icon="shield" active={pathname.startsWith('/admin')} /> : null}
        {me ? <NavItem href={ROUTES.app.profile(me.username)} label="Профиль" icon="user" active={pathname.startsWith('/profile')} /> : null}
      </nav>

      <div className={styles.footer}>
        <div className={styles.me}>
          <StoryRingAvatar userId={me?.id} url={me?.avatarUrl} name={me?.username ?? 'Пользователь'} size={38} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {me?.username ?? '—'}
              <AdminBadge role={me?.role} username={me?.username} />
            </div>
            <div className={styles.handle}>{me ? `@${me.username}` : ''}</div>
          </div>
        </div>
        <button className={styles.logout} onClick={onLogout} disabled={isLoading} aria-label="Выйти">
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
  );
}
