'use client';

import styles from './Messages.module.css';
import { ChatSidebar } from '@/features/messages';

export default function MessagesPage() {
  return (
    <div className={["container", "appPage", styles.page].join(' ')}>
      <div className={styles.grid}>
        <section className={styles.listPanel}>
          <ChatSidebar activeChatId={null} />
        </section>

        <section className={styles.right}>
          <div className={styles.placeholder}>
            <div className={styles.placeholderTitle}>Выберите чат</div>
            <div className={styles.placeholderText}>Откройте диалог из списка слева, чтобы продолжить переписку.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
