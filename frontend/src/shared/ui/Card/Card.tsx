import { PropsWithChildren, ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={[styles.card, className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.cardHeader}>
      <div className={styles.title}>{title}</div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export const CardMuted = ({ children }: PropsWithChildren) => <div className={styles.muted}>{children}</div>;
