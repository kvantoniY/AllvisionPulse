'use client';

import styles from './Messages.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { ChatSidebar } from '@/features/messages';

export default function MessagesPage() {
  return (
    <div className="container">
      <div className={styles.grid}>
        <Card className={styles.listCard}>
          <ChatSidebar activeChatId={null} />
        </Card>

        <div className={styles.right}>
          <Card>
            <CardHeader title="Select a chat" />
            <CardMuted>Open a dialog from the list.</CardMuted>
          </Card>
        </div>
      </div>
    </div>
  );
}
