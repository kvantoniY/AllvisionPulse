'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from './BottomNav.module.css';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { Icon } from '@/shared/ui/Icon/Icon';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';

function Item({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href?: string;
  label: string;
  icon: ComponentProps<typeof Icon>['name'];
  active: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={styles.icon}>
        <Icon name={icon} size={20} />
        {badge && badge > 0 ? <span className={styles.badgeDot} /> : null}
      </div>
      <div className={styles.label}>{label}</div>
    </>
  );

  if (!href) {
    return <button type="button" className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}>{content}</button>;
  }

  return (
    <Link href={href} className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}>
      {content}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { data } = useGetMeQuery();
  const me = data?.user;
  const unreadMsgs = useAppSelector((s) => s.chatUi.unreadTotal);
  const [menuOpen, setMenuOpen] = useState(false);

  const hideNav = /^\/messages\/[^/]+/.test(pathname) || pathname.startsWith('/call') || pathname.startsWith('/game');

  if (hideNav) return null;

  const menuItems = [
    { href: ROUTES.app.subscriptions, label: 'Подписки', icon: 'users' as const, active: pathname.startsWith('/subscriptions') },
    { href: ROUTES.app.support, label: 'Поддержка', icon: 'support' as const, active: pathname.startsWith('/support') },
    { href: ROUTES.app.settings, label: 'Настройки', icon: 'settings' as const, active: pathname.startsWith('/settings') },
    { href: ROUTES.app.game, label: 'Игра', icon: 'game' as const, active: pathname.startsWith('/game') },
    ...(me ? [{ href: ROUTES.app.profile(me.username), label: 'Профиль', icon: 'user' as const, active: pathname.startsWith('/profile') }] : []),
    ...(me?.role === 'ADMIN' ? [{ href: ROUTES.app.admin, label: 'Админ', icon: 'shield' as const, active: pathname.startsWith('/admin') }] : []),
  ];

  return (
    <>
      <div className={styles.nav}>
        <div className={styles.inner}>
          <Item href={ROUTES.app.feed} label="Лента" icon="home" active={pathname === '/' || pathname.startsWith('/feed')} />
          <Item href={ROUTES.app.messages} label="Сообщения" icon="messages" active={pathname.startsWith('/messages')} badge={unreadMsgs} />
          <Item href={ROUTES.app.health} label="Пульс" icon="pulse" active={pathname.startsWith('/health')} />
          <button type="button" className={[styles.item, menuOpen ? styles.active : ''].filter(Boolean).join(' ')} onClick={() => setMenuOpen(true)}>
            <div className={styles.icon}><Icon name="menu" size={20} /></div>
            <div className={styles.label}>Меню</div>
          </button>
        </div>
      </div>

      <MobileSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Навигация">
        <div className={styles.menuList}>
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href} className={[styles.menuRow, item.active ? styles.menuRowActive : ''].filter(Boolean).join(' ')} onClick={() => setMenuOpen(false)}>
              <div className={styles.menuRowIcon}><Icon name={item.icon} size={18} /></div>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </MobileSheet>
    </>
  );
}
