import styles from './Spinner.module.css';

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <span className={[styles.spinner, className].filter(Boolean).join(' ')} style={{ width: size, height: size }} aria-hidden="true" />;
}
