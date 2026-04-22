'use client';

import { PropsWithChildren } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import styles from './AppShell.module.css';
import { Sidebar } from '@/widgets/sidebar/ui/Sidebar';
import { BottomNav } from '@/widgets/bottomNav/ui/BottomNav';
import { Header } from '@/widgets/header/ui/Header';
import { NotificationExperienceBanner } from '@/features/notifications/ui/NotificationExperienceBanner';

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMessagesRoute = pathname.startsWith('/messages');
  const isMobileImmersiveRoute = /^\/messages\/[^/]+$/.test(pathname);
  const isHealthRoute = pathname.startsWith('/health');
  const pulseTab = searchParams.get('tab');
  const isPulseGameRoute = isHealthRoute && (pulseTab == null || pulseTab === 'pulse');

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <div
          className={[
            styles.content,
            isMobileImmersiveRoute ? styles.contentMobileImmersive : '',
            isPulseGameRoute ? styles.contentPulseGame : '',
            isHealthRoute && !isPulseGameRoute ? styles.contentHealth : '',
          ].filter(Boolean).join(' ')}
        >
          {!isMessagesRoute && !isPulseGameRoute ? <NotificationExperienceBanner /> : null}
          {children}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
