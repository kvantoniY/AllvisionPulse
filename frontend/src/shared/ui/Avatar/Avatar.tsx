import styles from './Avatar.module.css';

export function Avatar({
  url,
  name,
  size = 38,
  status,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  status?: 'online' | 'offline' | null;
}) {
  const initials = (name ?? 'U').slice(0, 1).toUpperCase();
  return (
    <div className={styles.avatar} style={{ width: size, height: size }}>
      <div className={styles.inner}>
        {url ? <img className={styles.img} src={url} alt="avatar" /> : <span className={styles.fallback}>{initials}</span>}
      </div>
      {status ? (
        <span
          className={[styles.statusDot, status === 'online' ? styles.statusDotOnline : styles.statusDotOffline]
            .filter(Boolean)
            .join(' ')}
          aria-label={status}
        />
      ) : null}
    </div>
  );
}
