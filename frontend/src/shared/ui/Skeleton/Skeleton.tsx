import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

export function Skeleton({ className = '', circle = false, style }: { className?: string; circle?: boolean; style?: CSSProperties }) {
  return <span className={[styles.skeleton, circle ? styles.circle : '', className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={[styles.text, className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={styles.line} style={{ width: `${100 - index * 12}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '', header, footer }: { className?: string; header?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')} aria-hidden="true">
      {header}
      <SkeletonText lines={3} />
      {footer}
    </div>
  );
}
