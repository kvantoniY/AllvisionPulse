'use client';

import styles from './MediaPlaceholder.module.css';

/**
 * Telegram-style media loading overlay.
 * Renders a shimmer + spinner over the media container.
 * Fades out once `loaded` becomes true.
 *
 * Place inside a `position: relative` parent that wraps your <img> / <video>.
 */
export function MediaPlaceholder({
  loaded = false,
  small = false,
  className,
}: {
  loaded?: boolean;
  small?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[styles.wrap, loaded ? styles.wrapHidden : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <div className={styles.blur} />
      <div className={styles.scrim} />
      {!loaded ? <div className={styles.shimmer} /> : null}
      <span className={[styles.spinner, small ? styles.spinnerSmall : ''].filter(Boolean).join(' ')} />
    </div>
  );
}
