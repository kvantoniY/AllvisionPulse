'use client';

import styles from './Messages.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { ChatSidebar } from '@/features/messages';

export default function MessagesPage() {
  return (
    <div className="container appPage">
      <div className={styles.grid}>
        <Card className={styles.listCard}>
          <ChatSidebar activeChatId={null} />
        </Card>

        <div className={styles.right}>
          <Card className={styles.placeholder}>
            <CardHeader title="Выберите чат" />
            <CardMuted>Откройте диалог из списка слева, чтобы продолжить переписку.</CardMuted>
          </Card>
        </div>
      </div>
    </div>
  );
}
