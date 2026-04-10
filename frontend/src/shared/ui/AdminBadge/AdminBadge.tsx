'use client';

import type { Role } from '@/shared/types/models';
import { usePulseProBadge } from '@/shared/lib/pulsePro';
import { Icon } from '@/shared/ui/Icon/Icon';
import { PulseProBadge } from '@/shared/ui/PulseProBadge/PulseProBadge';
import styles from './AdminBadge.module.css';

export function AdminBadge({
  role,
  username,
  label = 'Администратор',
  proLabel = 'Пульс Про',
}: {
  role?: Role | null;
  username?: string | null;
  label?: string;
  proLabel?: string;
}) {
  const hasPulsePro = usePulseProBadge(username);
  if (role === 'ADMIN') {
    return (
      <span className={styles.badge} title={label} aria-label={label}>
        <Icon name="check" size={11} className={styles.icon} />
      </span>
    );
  }

  if (!hasPulsePro) return null;

  return (
    <PulseProBadge label={proLabel} />
  );
}
