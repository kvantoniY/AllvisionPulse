'use client';

import { useEffect, useState } from 'react';
import styles from './Avatar.module.css';

export function Avatar({
  url,
  name,
  size = 38,
  status,
  className,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  status?: 'online' | 'offline' | null;
  className?: string;
}) {
  const initials = (name ?? 'U').slice(0, 1).toUpperCase();
  const [hasImageError, setHasImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setHasImageError(false);
    setImageLoaded(false);
  }, [url]);

  const showImage = Boolean(url && !hasImageError);

  const statusSize = Math.max(10, Math.round(size * 0.15));
  const statusInset = Math.max(2, Math.round(size * 0.05));
  const statusBorder = Math.max(2, Math.round(size * 0.03));

  return (
    <div
      className={[styles.avatar, className ?? ''].filter(Boolean).join(' ')}
      style={{
        width: size,
        height: size,
        ['--avatar-status-size' as any]: `${statusSize}px`,
        ['--avatar-status-inset' as any]: `${statusInset}px`,
        ['--avatar-status-border' as any]: `${statusBorder}px`,
      }}
    >
      <div className={styles.inner}>
        {showImage ? (
          <>
            {!imageLoaded ? <span className={styles.shimmer} aria-hidden="true" /> : null}
            <img
              className={styles.img}
              src={url ?? undefined}
              alt=""
              ref={(node) => { if (node?.complete && node.naturalWidth > 0) setImageLoaded(true); }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setHasImageError(true)}
            />
          </>
        ) : (
          <span className={styles.fallback}>{initials}</span>
        )}
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
