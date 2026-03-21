'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useFriendBadge } from '@/features/friendBadge/useFriendBadge';
import { useAppSelector } from '@/shared/lib/storeHooks';

function Item({
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
      <div className={styles.icon}>
        {icon}
        {badge && badge > 0 ? <span className={styles.badgeDot} /> : null}
      </div>
      <div className={styles.label}>{label}</div>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { data } = useGetMeQuery();
  const me = data?.user;
  const { incomingCount } = useFriendBadge();
  const unreadMsgs = useAppSelector((s) => s.chatUi.unreadTotal);

  return (
    <div className={styles.nav}>
      <div className={styles.inner}>
        <Item href={ROUTES.app.feed} label="Feed" icon="🏠" active={pathname === '/' || pathname.startsWith('/feed')} />
        <Item href={ROUTES.app.health} label="Health" icon="♡" active={pathname.startsWith('/health')} />
        <Item href={ROUTES.app.game} label="Game" icon="🎮" active={pathname.startsWith('/game')} />
        <Item href={ROUTES.app.friends} label="Friends" icon="🤝" active={pathname.startsWith('/friends')} badge={incomingCount} />
        <Item href={ROUTES.app.messages} label="Messages" icon="💬" active={pathname.startsWith('/messages')} badge={unreadMsgs} />
        {me ? <Item href={ROUTES.app.profile(me.username)} label="Profile" icon="👤" active={pathname.startsWith('/profile')} /> : <Item href={ROUTES.app.feed} label="Profile" icon="👤" active={false} />}
      </div>
    </div>
  );
}
