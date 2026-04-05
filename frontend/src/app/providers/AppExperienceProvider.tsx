'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type PermissionState = NotificationPermission | 'unsupported';
type InstallMode = 'none' | 'prompt' | 'ios_manual';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type AppExperienceContextValue = {
  notificationPermission: PermissionState;
  notificationSupported: boolean;
  pushConfigured: boolean;
  pushEnabled: boolean;
  pushSyncing: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  installMode: InstallMode;
  requestNotifications: () => Promise<PermissionState>;
  dismissNotificationBanner: () => void;
  promptInstall: () => Promise<void>;
  dismissInstallBanner: () => void;
  showNotificationBanner: boolean;
  showInstallBanner: boolean;
};

const NOTIFICATION_BANNER_SNOOZE_KEY = 'av:notifications-banner-snooze-until';
const INSTALL_BANNER_SNOOZE_KEY = 'av:install-banner-snooze-until';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INSTALL_BANNER_SNOOZE_MS = 3 * ONE_DAY_MS;

const AppExperienceContext = createContext<AppExperienceContextValue>({
  notificationPermission: 'unsupported',
  notificationSupported: false,
  pushConfigured: false,
  pushEnabled: false,
  pushSyncing: false,
  isStandalone: false,
  canInstall: false,
  installMode: 'none',
  requestNotifications: async () => 'unsupported',
  dismissNotificationBanner: () => {},
  promptInstall: async () => {},
  dismissInstallBanner: () => {},
  showNotificationBanner: false,
  showInstallBanner: false,
});

function getNotificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosManualInstallAvailable() {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|yabrowser|ya(searchbrowser)?/.test(userAgent);
  return isIos && isSafari;
}

function getStoredTimestamp(key: string) {
  if (typeof window === 'undefined') return 0;
  const rawValue = window.localStorage.getItem(key);
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

function setStoredTimestamp(key: string, value: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

function isSnoozed(untilTimestamp: number) {
  return untilTimestamp > Date.now();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function fetchPushPublicKey() {
  const response = await fetch('/api/backend/notifications/push/public-key', {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    return { enabled: false, publicKey: null as string | null };
  }

  const data = await response.json().catch(() => null);
  return {
    enabled: Boolean(data?.enabled && typeof data?.publicKey === 'string' && data.publicKey.trim()),
    publicKey: typeof data?.publicKey === 'string' ? data.publicKey.trim() : null,
  };
}

async function saveSubscription(subscription: PushSubscriptionJSON) {
  await fetch('/api/backend/notifications/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });
}

async function deleteSubscription(endpoint: string) {
  await fetch('/api/backend/notifications/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export function AppExperienceProvider({ children }: { children: React.ReactNode }) {
  const [notificationPermission, setNotificationPermission] = useState<PermissionState>(() => getNotificationPermission());
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSyncing, setPushSyncing] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationBannerSnoozedUntil, setNotificationBannerSnoozedUntil] = useState(0);
  const [installBannerSnoozedUntil, setInstallBannerSnoozedUntil] = useState(0);
  const [iosManualInstallAvailable, setIosManualInstallAvailable] = useState(false);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsStandalone(isStandaloneMode());
    setIosManualInstallAvailable(isIosManualInstallAvailable());
    setNotificationBannerSnoozedUntil(getStoredTimestamp(NOTIFICATION_BANNER_SNOOZE_KEY));
    setInstallBannerSnoozedUntil(getStoredTimestamp(INSTALL_BANNER_SNOOZE_KEY));
  }, []);

  const unsubscribePushSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      setPushEnabled(false);
      return;
    }

    const registration = registrationRef.current ?? (await navigator.serviceWorker.ready.catch(() => null));
    if (!registration) {
      setPushEnabled(false);
      return;
    }

    registrationRef.current = registration;
    const subscription = await registration.pushManager.getSubscription().catch(() => null);
    if (!subscription) {
      setPushEnabled(false);
      return;
    }

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => false);
    if (endpoint) {
      await deleteSubscription(endpoint).catch(() => null);
    }
    setPushEnabled(false);
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (getNotificationPermission() !== 'granted') {
      await unsubscribePushSubscription();
      return false;
    }

    const registration = registrationRef.current ?? (await navigator.serviceWorker.ready.catch(() => null));
    if (!registration) return false;
    registrationRef.current = registration;

    setPushSyncing(true);
    try {
      const pushKey = await fetchPushPublicKey();
      setPushConfigured(pushKey.enabled);
      if (!pushKey.enabled || !pushKey.publicKey) {
        setPushEnabled(false);
        return false;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushKey.publicKey),
        });
      }

      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
        setPushEnabled(false);
        return false;
      }

      await saveSubscription(serialized);
      setPushEnabled(true);
      return true;
    } catch (error) {
      console.error('[push:sync-error]', error);
      setPushEnabled(false);
      return false;
    } finally {
      setPushSyncing(false);
    }
  }, [unsubscribePushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;
        if (getNotificationPermission() === 'granted') {
          void syncPushSubscription();
        } else {
          void fetchPushPublicKey()
            .then((pushKey) => {
              if (!cancelled) setPushConfigured(pushKey.enabled);
            })
            .catch(() => {
              if (!cancelled) setPushConfigured(false);
            });
        }
      })
      .catch((error) => {
        console.error('[sw:register-error]', error);
      });

    return () => {
      cancelled = true;
    };
  }, [syncPushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateExperience = () => {
      setNotificationPermission(getNotificationPermission());
      setIsStandalone(isStandaloneMode());
      setIosManualInstallAvailable(isIosManualInstallAvailable());
    };

    updateExperience();
    window.addEventListener('focus', updateExperience);
    document.addEventListener('visibilitychange', updateExperience);

    const media = window.matchMedia('(display-mode: standalone)');
    const onMediaChange = () => setIsStandalone(isStandaloneMode());
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);
    else media.addListener(onMediaChange);

    return () => {
      window.removeEventListener('focus', updateExperience);
      document.removeEventListener('visibilitychange', updateExperience);
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onMediaChange);
      else media.removeListener(onMediaChange);
    };
  }, []);

  useEffect(() => {
    if (notificationPermission === 'granted') {
      void syncPushSubscription();
      return;
    }
    if (notificationPermission !== 'unsupported') {
      void unsubscribePushSubscription();
    }
  }, [notificationPermission, syncPushSubscription, unsubscribePushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPromptEvent(null);
      setIsStandalone(true);
      const nextTimestamp = Date.now() + INSTALL_BANNER_SNOOZE_MS;
      setStoredTimestamp(INSTALL_BANNER_SNOOZE_KEY, nextTimestamp);
      setInstallBannerSnoozedUntil(nextTimestamp);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const requestNotifications = useCallback(async (): Promise<PermissionState> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      await syncPushSubscription();
    }
    return permission;
  }, [syncPushSubscription]);

  const dismissNotificationBanner = useCallback(() => {
    const nextTimestamp = Date.now() + ONE_DAY_MS;
    setStoredTimestamp(NOTIFICATION_BANNER_SNOOZE_KEY, nextTimestamp);
    setNotificationBannerSnoozedUntil(nextTimestamp);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const result = await installPromptEvent.userChoice.catch(() => null);
    if (result?.outcome === 'accepted') {
      const nextTimestamp = Date.now() + INSTALL_BANNER_SNOOZE_MS;
      setStoredTimestamp(INSTALL_BANNER_SNOOZE_KEY, nextTimestamp);
      setInstallBannerSnoozedUntil(nextTimestamp);
    }
    setInstallPromptEvent(null);
  }, [installPromptEvent]);

  const dismissInstallBanner = useCallback(() => {
    const nextTimestamp = Date.now() + INSTALL_BANNER_SNOOZE_MS;
    setStoredTimestamp(INSTALL_BANNER_SNOOZE_KEY, nextTimestamp);
    setInstallBannerSnoozedUntil(nextTimestamp);
  }, []);

  const value = useMemo<AppExperienceContextValue>(() => {
    const notificationSupported = notificationPermission !== 'unsupported';
    const installMode: InstallMode = isStandalone ? 'none' : installPromptEvent ? 'prompt' : iosManualInstallAvailable ? 'ios_manual' : 'none';
    const showNotificationBanner = notificationSupported && notificationPermission !== 'granted' && !isSnoozed(notificationBannerSnoozedUntil);
    const showInstallBanner = installMode !== 'none' && !isSnoozed(installBannerSnoozedUntil);

    return {
      notificationPermission,
      notificationSupported,
      pushConfigured,
      pushEnabled,
      pushSyncing,
      isStandalone,
      canInstall: installMode !== 'none',
      installMode,
      requestNotifications,
      dismissNotificationBanner,
      promptInstall,
      dismissInstallBanner,
      showNotificationBanner,
      showInstallBanner,
    };
  }, [
    dismissInstallBanner,
    dismissNotificationBanner,
    installBannerSnoozedUntil,
    installPromptEvent,
    iosManualInstallAvailable,
    isStandalone,
    notificationBannerSnoozedUntil,
    notificationPermission,
    promptInstall,
    pushConfigured,
    pushEnabled,
    pushSyncing,
    requestNotifications,
  ]);

  return <AppExperienceContext.Provider value={value}>{children}</AppExperienceContext.Provider>;
}

export function useAppExperience() {
  return useContext(AppExperienceContext);
}
