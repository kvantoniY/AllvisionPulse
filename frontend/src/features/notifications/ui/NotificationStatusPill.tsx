'use client';

import { useAppExperience } from '@/app/providers/AppExperienceProvider';
import styles from './NotificationStatusPill.module.css';

type Props = {
  compact?: boolean;
};

export function NotificationStatusPill({ compact = false }: Props) {
  const experience = useAppExperience();

  let label = 'Уведомления недоступны';
  let toneClass = styles.warn;

  if (experience.notificationPermission === 'granted' && experience.pushEnabled) {
    label = 'Уведомления включены';
    toneClass = styles.ok;
  } else if (experience.notificationPermission === 'granted' && experience.pushSyncing) {
    label = 'Подключаем уведомления';
    toneClass = styles.warn;
  } else if (experience.notificationPermission === 'granted' && !experience.pushConfigured) {
    label = 'Push временно недоступны';
    toneClass = styles.warn;
  } else if (experience.notificationPermission === 'granted') {
    label = 'Завершаем подключение';
    toneClass = styles.warn;
  } else if (experience.notificationPermission === 'denied') {
    label = 'Уведомления выключены';
    toneClass = styles.warn;
  } else if (experience.notificationPermission === 'default') {
    label = 'Уведомления не настроены';
    toneClass = styles.warn;
  }

  return <span className={[styles.pill, toneClass, compact ? styles.compact : ''].filter(Boolean).join(' ')}>{label}</span>;
}
