import styles from './ProgressRing.module.css';

export function ProgressRing({
  value,
  label,
  size = 120,
  color,
}: {
  value: number;
  label: string;
  size?: number;
  color?: 'accent' | 'teal' | 'amber';
}) {
  const v = Math.max(0, Math.min(100, value));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  const id = `ring-${label.replace(/\s/g, '')}`;

  const gradients: Record<string, [string, string]> = {
    accent: ['#8a78ff', '#b4a0ff'],
    teal: ['#3ee0c8', '#70f0e0'],
    amber: ['#f0b060', '#f8d090'],
  };
  const [c1, c2] = gradients[color ?? 'accent'];

  return (
    <div className={styles.wrap}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className={styles.text}>{v}%</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
