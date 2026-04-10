import styles from './Switch.module.css';

export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.copy}>
        <div className={styles.label}>{label}</div>
        {description ? <div className={styles.muted}>{description}</div> : null}
      </div>
      <label className={styles.wrap}>
        <input className={styles.input} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.track}>
          <span className={styles.thumb} />
        </span>
      </label>
    </div>
  );
}
