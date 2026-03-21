'use client';

import { PropsWithChildren } from 'react';
import styles from './AppShell.module.css';
import { Sidebar } from '@/widgets/sidebar/ui/Sidebar';
import { BottomNav } from '@/widgets/bottomNav/ui/BottomNav';
import { Header } from '@/widgets/header/ui/Header';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <div className={styles.content}>{children}</div>
      </div>
      <BottomNav />
    </div>
  );
}
