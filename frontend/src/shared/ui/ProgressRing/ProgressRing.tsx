import styles from './ProgressRing.module.css';

export function ProgressRing({ value, label, size = 120, caption }: { value: number; label: string; size?: number; caption?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const stroke = Math.max(10, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  const gradId = `progress-gradient-${size}-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={styles.wrap}>
      <svg width={size} height={size} className={styles.svg}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} className={styles.track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${gradId})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} className={styles.progress} />
      </svg>
      <div className={styles.text}>{v}%</div>
      <div className={styles.label}>{label}</div>
      {caption ? <div className={styles.caption}>{caption}</div> : null}
    </div>
  );
}
