'use client';

import { useAppExperience } from '@/app/providers/AppExperienceProvider';
import styles from './NotificationExperienceBanner.module.css';

type Props = {
  compact?: boolean;
};

export function NotificationExperienceBanner({ compact = false }: Props) {
  const experience = useAppExperience();

  if (!experience.showNotificationBanner && !experience.showInstallBanner) return null;

  const installTitle =
    experience.installMode === 'ios_manual' ? 'Добавьте приложение на экран домой' : 'Установите приложение на экран домой';
  const installText =
    experience.installMode === 'ios_manual'
      ? 'На iPhone или iPad откройте меню "Поделиться" в Safari и выберите "На экран Домой". После установки Allvision Pulse будет открываться как отдельное приложение без панели браузера.'
      : 'После установки Allvision Pulse будет открываться как отдельное приложение без панели браузера. Так удобнее отвечать на сообщения, принимать звонки и получать push-уведомления.';

  return (
    <div className={[styles.stack, compact ? styles.stackCompact : ''].filter(Boolean).join(' ')}>
      {experience.showNotificationBanner ? (
        <section className={styles.banner}>
          <div className={styles.copy}>
            <div className={styles.title}>
              {experience.notificationPermission === 'denied' ? 'Уведомления отключены' : 'Включите уведомления'}
            </div>
            <p className={styles.text}>
              {experience.notificationPermission === 'denied'
                ? 'Сообщения, важные события и входящие звонки могут приходить только внутри открытого сайта, пока браузер блокирует уведомления.'
                : 'Разрешите уведомления, чтобы новые сообщения, события сайта и входящие звонки приходили даже когда приложение свернуто.'}
            </p>
          </div>
          <div className={styles.actions}>
            {experience.notificationPermission === 'default' ? (
              <button type="button" className={styles.primary} onClick={() => void experience.requestNotifications()}>
                Включить
              </button>
            ) : null}
            <button type="button" className={styles.secondary} onClick={experience.dismissNotificationBanner}>
              {experience.notificationPermission === 'denied' ? 'Понятно' : 'Позже'}
            </button>
          </div>
        </section>
      ) : null}

      {experience.showInstallBanner ? (
        <section className={styles.banner}>
          <div className={styles.copy}>
            <div className={styles.title}>{installTitle}</div>
            <p className={styles.text}>{installText}</p>
          </div>
          <div className={styles.actions}>
            {experience.installMode === 'prompt' ? (
              <button type="button" className={styles.primary} onClick={() => void experience.promptInstall()}>
                Установить
              </button>
            ) : null}
            <button type="button" className={styles.secondary} onClick={experience.dismissInstallBanner}>
              {experience.installMode === 'ios_manual' ? 'Понятно' : 'Позже'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
