'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useFriendBadge } from '@/features/friendBadge/useFriendBadge';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { Icon } from '@/shared/ui/Icon/Icon';

function Item({
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
      <div className={styles.icon}>
        <Icon name={icon} size={19} />
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
        <Item href={ROUTES.app.feed} label="Лента" icon="home" active={pathname === '/' || pathname.startsWith('/feed')} />
        <Item href={ROUTES.app.health} label="Пульс" icon="pulse" active={pathname.startsWith('/health')} />
        <Item href={ROUTES.app.friends} label="Подписки" icon="users" active={pathname.startsWith('/friends')} badge={incomingCount} />
        <Item href={ROUTES.app.messages} label="Чаты" icon="messages" active={pathname.startsWith('/messages')} badge={unreadMsgs} />
        <Item href={ROUTES.app.support} label="Поддержка" icon="support" active={pathname.startsWith('/support')} />
        {me?.role === 'ADMIN' ? <Item href={ROUTES.app.admin} label="Админ" icon="shield" active={pathname.startsWith('/admin')} /> : null}
        {me ? <Item href={ROUTES.app.profile(me.username)} label="Профиль" icon="user" active={pathname.startsWith('/profile')} /> : <Item href={ROUTES.app.feed} label="Профиль" icon="user" active={false} />}
      </div>
    </div>
  );
}
