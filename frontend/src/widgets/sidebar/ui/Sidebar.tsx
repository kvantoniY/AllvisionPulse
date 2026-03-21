'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './Sidebar.module.css';
import { APP_NAME, ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useLogoutMutation } from '@/shared/api/authApi';
import { useFriendBadge } from '@/features/friendBadge/useFriendBadge';
import { useAppSelector } from '@/shared/lib/storeHooks';

function NavItem({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link href={href} className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}>
      <span aria-hidden>{icon}</span>
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
      <div className={styles.brand}>
        <div className={styles.logo} />
        {APP_NAME}
      </div>

      <nav className={styles.nav}>
        <NavItem href={ROUTES.app.feed} label="Feed" icon="🏠" active={pathname === '/' || pathname.startsWith('/feed')} />
        <NavItem href={ROUTES.app.health} label="Health" icon="♡" active={pathname.startsWith('/health')} />
        <NavItem
          href={ROUTES.app.friends}
          label="Friends"
          icon="🤝"
          active={pathname.startsWith('/friends')}
          badge={incomingCount}
        />
        <NavItem href={ROUTES.app.game} label="Game" icon="🎮" active={pathname.startsWith('/game')} />
        <NavItem
          href={ROUTES.app.messages}
          label="Messages"
          icon="💬"
          active={pathname.startsWith('/messages')}
          badge={unreadMsgs}
        />
        {me ? <NavItem href={ROUTES.app.profile(me.username)} label="Profile" icon="👤" active={pathname.startsWith('/profile')} /> : null}
      </nav>

      <div className={styles.footer}>
        <div className={styles.me}>
          <Avatar url={me?.avatarUrl} name={me?.username ?? 'User'} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name}>{me?.username ?? '—'}</div>
            <div className={styles.handle}>{me ? `@${me.username}` : ''}</div>
          </div>
        </div>
        <button className={styles.logout} onClick={onLogout} disabled={isLoading}>
          ⎋
        </button>
      </div>
    </aside>
  );
}
