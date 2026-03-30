'use client';

import { PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';
import styles from './AppShell.module.css';
import { Sidebar } from '@/widgets/sidebar/ui/Sidebar';
import { BottomNav } from '@/widgets/bottomNav/ui/BottomNav';
import { Header } from '@/widgets/header/ui/Header';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isMobileImmersiveRoute = /^\/messages\/[^/]+$/.test(pathname);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <div className={[styles.content, isMobileImmersiveRoute ? styles.contentMobileImmersive : ''].filter(Boolean).join(' ')}>{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}
