'use client';

import { useRouter } from 'next/navigation';
import { useAppExperience } from '@/app/providers/AppExperienceProvider';
import styles from './NotificationStatusPill.module.css';

type Props = {
  compact?: boolean;
};

type Indicator = {
  key: string;
  label: string;
  toneClass: string;
  onClick?: () => void;
};

export function NotificationStatusPill({ compact = false }: Props) {
  const router = useRouter();
  const experience = useAppExperience();

  const openAppGuide = () => {
    router.push('/settings?tab=app');
  };

  const indicators: Indicator[] = [];

  if (experience.notificationIssue === 'permission_required') {
    indicators.push({
      key: 'notifications',
      label: experience.pushCapability.installRequiredForPush ? 'Установите приложение и включите уведомления' : 'Включите уведомления',
      toneClass: styles.warn,
      onClick: experience.canRequestNotifications ? () => void experience.requestNotifications() : openAppGuide,
    });
  } else if (experience.notificationIssue === 'permission_blocked') {
    indicators.push({
      key: 'notifications',
      label: 'Уведомления отключены',
      toneClass: styles.warn,
      onClick: openAppGuide,
    });
  } else if (experience.notificationIssue === 'unsupported') {
    indicators.push({
      key: 'notifications',
      label: experience.pushCapability.installRequiredForPush ? 'Push станут доступны после установки приложения' : 'Push недоступны в браузере',
      toneClass: styles.warn,
      onClick: openAppGuide,
    });
  } else if (experience.notificationIssue === 'config_missing') {
    indicators.push({
      key: 'notifications',
      label: 'Push временно недоступны',
      toneClass: styles.warn,
      onClick: openAppGuide,
    });
  } else if (experience.notificationIssue === 'syncing') {
    indicators.push({
      key: 'notifications',
      label: 'Подключаем push',
      toneClass: styles.info,
    });
  } else if (experience.notificationIssue === 'subscription_error') {
    indicators.push({
      key: 'notifications',
      label: 'Не удалось подключить push',
      toneClass: styles.warn,
      onClick: openAppGuide,
    });
  }

  if (experience.installRecommended) {
    indicators.push({
      key: 'install',
      label: 'Скачать приложение',
      toneClass: styles.info,
      onClick: openAppGuide,
    });
  }

  if (!indicators.length) return null;

  return (
    <div className={[styles.stack, compact ? styles.stackCompact : ''].filter(Boolean).join(' ')}>
      {indicators.map((indicator) => {
        const className = [styles.pill, styles.clickable, indicator.toneClass, compact ? styles.compact : '']
          .filter(Boolean)
          .join(' ');

        return indicator.onClick ? (
          <button key={indicator.key} type="button" className={className} onClick={indicator.onClick}>
            {indicator.label}
          </button>
        ) : (
          <span key={indicator.key} className={className}>
            {indicator.label}
          </span>
        );
      })}
    </div>
  );
}
