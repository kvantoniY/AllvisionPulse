'use client';

import { useRouter } from 'next/navigation';
import { ROUTES } from '@/shared/config/app';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './PulseProBadge.module.css';

export function PulseProBadge({ label = 'Пульс Про', className = '' }: { label?: string; className?: string }) {
  const router = useRouter();

  const openPulsePro = (event: React.MouseEvent<HTMLSpanElement> | React.KeyboardEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    router.push(ROUTES.app.pro);
  };

  return (
    <span
      className={[styles.badge, className].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
      role='link'
      tabIndex={0}
      onClick={openPulsePro}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openPulsePro(event);
      }}
    >
      <Icon name="pulse" size={11} className={styles.icon} />
    </span>
  );
}
