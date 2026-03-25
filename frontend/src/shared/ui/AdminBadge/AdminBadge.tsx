import type { Role } from '@/shared/types/models';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './AdminBadge.module.css';

export function AdminBadge({ role, label = 'Администратор' }: { role?: Role | null; label?: string }) {
  if (role !== 'ADMIN') return null;

  return (
    <span className={styles.badge} title={label} aria-label={label}>
      <Icon name="check" size={11} className={styles.icon} />
    </span>
  );
}
