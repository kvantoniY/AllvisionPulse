'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type PermissionState = NotificationPermission | 'unsupported';
type InstallMode = 'none' | 'prompt' | 'ios_manual';
type DeviceKind = 'desktop' | 'phone' | 'tablet';
type PlatformFamily = 'ios' | 'android' | 'other';
type NotificationIssue =
  | 'unsupported'
  | 'permission_required'
  | 'permission_blocked'
  | 'config_missing'
  | 'syncing'
  | 'subscription_error'
  | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PushCapability = {
  secureContext: boolean;
  notificationsApi: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  browserSupported: boolean;
  availableInContext: boolean;
  installRequiredForPush: boolean;
  reason: string | null;
};

type AppExperienceContextValue = {
  notificationPermission: PermissionState;
  notificationSupported: boolean;
  notificationIssue: NotificationIssue;
  pushConfigured: boolean;
  pushConfigResolved: boolean;
  pushEnabled: boolean;
  pushSyncing: boolean;
  pushStatusMessage: string | null;
  pushCapability: PushCapability;
  isStandalone: boolean;
  canInstall: boolean;
  installMode: InstallMode;
  installRecommended: boolean;
  deviceKind: DeviceKind;
  platformFamily: PlatformFamily;
  canRequestNotifications: boolean;
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

const DEFAULT_PUSH_CAPABILITY: PushCapability = {
  secureContext: false,
  notificationsApi: false,
  serviceWorker: false,
  pushManager: false,
  browserSupported: false,
  availableInContext: false,
  installRequiredForPush: false,
  reason: 'Push недоступны до загрузки приложения.',
};

const AppExperienceContext = createContext<AppExperienceContextValue>({
  notificationPermission: 'unsupported',
  notificationSupported: false,
  notificationIssue: 'unsupported',
  pushConfigured: false,
  pushConfigResolved: false,
  pushEnabled: false,
  pushSyncing: false,
  pushStatusMessage: null,
  pushCapability: DEFAULT_PUSH_CAPABILITY,
  isStandalone: false,
  canInstall: false,
  installMode: 'none',
  installRecommended: false,
  deviceKind: 'desktop',
  platformFamily: 'other',
  canRequestNotifications: false,
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

function detectDeviceMeta(): { deviceKind: DeviceKind; platformFamily: PlatformFamily; iosManualInstallAvailable: boolean } {
  if (typeof window === 'undefined') {
    return { deviceKind: 'desktop', platformFamily: 'other', iosManualInstallAvailable: false };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
  const isIphone = /iphone|ipod/.test(userAgent);
  const isIpad = /ipad/.test(userAgent) || (platform === 'macintel' && maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const isMobile = /mobile/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios|opr\/|yabrowser|ya(searchbrowser)?/.test(userAgent);

  let deviceKind: DeviceKind = 'desktop';
  if (isIphone || (isAndroid && isMobile)) deviceKind = 'phone';
  else if (isIpad || isAndroid) deviceKind = 'tablet';

  const platformFamily: PlatformFamily = isIphone || isIpad ? 'ios' : isAndroid ? 'android' : 'other';
  const iosManualInstallAvailable = platformFamily === 'ios' && isSafari;

  return { deviceKind, platformFamily, iosManualInstallAvailable };
}

function getPushCapability(platformFamily: PlatformFamily, isStandalone: boolean): PushCapability {
  if (typeof window === 'undefined') return DEFAULT_PUSH_CAPABILITY;

  const secureContext = window.isSecureContext;
  const notificationsApi = 'Notification' in window;
  const serviceWorker = 'serviceWorker' in navigator;
  const pushManager = 'PushManager' in window;
  const browserSupported = secureContext && notificationsApi && serviceWorker && pushManager;
  const installRequiredForPush = platformFamily === 'ios' && !isStandalone;

  let reason: string | null = null;
  if (!secureContext) reason = 'Push работают только по HTTPS или на localhost.';
  else if (!notificationsApi) reason = 'Этот браузер не поддерживает уведомления.';
  else if (!serviceWorker || !pushManager) reason = 'В этом браузере нет полной поддержки Service Worker или Push API.';
  else if (installRequiredForPush) reason = 'На iPhone и iPad web push включаются только внутри установленного приложения с экрана Домой.';

  return {
    secureContext,
    notificationsApi,
    serviceWorker,
    pushManager,
    browserSupported,
    availableInContext: browserSupported && !installRequiredForPush,
    installRequiredForPush,
    reason,
  };
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

function uint8ArraysEqual(left: Uint8Array | null, right: Uint8Array | null) {
  if (!left || !right) return !left && !right;
  if (left.byteLength !== right.byteLength) return false;

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}

function getSubscriptionApplicationServerKey(subscription: PushSubscription) {
  const rawKey = subscription.options?.applicationServerKey;
  if (!rawKey) return null;

  try {
    return new Uint8Array(rawKey);
  } catch {
    return null;
  }
}

function subscriptionApplicationServerKeyMatches(subscription: PushSubscription, expectedKey: Uint8Array) {
  return uint8ArraysEqual(getSubscriptionApplicationServerKey(subscription), expectedKey);
}

async function fetchPushPublicKey() {
  try {
    const response = await fetch('/api/backend/notifications/push/public-key', {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn('[push:public-key] non-ok response', response.status);
      return { enabled: false, publicKey: null as string | null };
    }

    const data = await response.json().catch(() => null);
    return {
      enabled: Boolean(data?.enabled && typeof data?.publicKey === 'string' && data.publicKey.trim()),
      publicKey: typeof data?.publicKey === 'string' ? data.publicKey.trim() : null,
    };
  } catch (error) {
    console.error('[push:public-key] fetch failed', error);
    return { enabled: false, publicKey: null as string | null };
  }
}

async function saveSubscription(subscription: PushSubscriptionJSON) {
  const response = await fetch('/api/backend/notifications/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });

  if (!response.ok) {
    throw new Error(`Push subscribe failed with status ${response.status}`);
  }
}

async function deleteSubscription(endpoint: string) {
  const response = await fetch('/api/backend/notifications/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error(`Push unsubscribe failed with status ${response.status}`);
  }
}

function describePushSyncError(error: unknown, capability: PushCapability) {
  if (capability.installRequiredForPush) {
    return capability.reason;
  }

  const name =
    typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';

  if (name === 'NotAllowedError') {
    return 'Браузер отклонил подписку на push. Проверьте разрешение уведомлений и попробуйте снова.';
  }

  if (name === 'AbortError') {
    return 'Подключение push было прервано браузером. Повторите попытку.';
  }

  return 'Не удалось синхронизировать push-подписку с этим устройством.';
}

export function AppExperienceProvider({ children }: { children: React.ReactNode }) {
  const [notificationPermission, setNotificationPermission] = useState<PermissionState>(() => getNotificationPermission());
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushConfigResolved, setPushConfigResolved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSyncing, setPushSyncing] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>('desktop');
  const [platformFamily, setPlatformFamily] = useState<PlatformFamily>('other');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationBannerSnoozedUntil, setNotificationBannerSnoozedUntil] = useState(0);
  const [installBannerSnoozedUntil, setInstallBannerSnoozedUntil] = useState(0);
  const [iosManualInstallAvailable, setIosManualInstallAvailable] = useState(false);

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastSyncedPushEndpointRef = useRef<string | null>(null);
  const pushCapability = useMemo(() => getPushCapability(platformFamily, isStandalone), [isStandalone, platformFamily]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nextDeviceMeta = detectDeviceMeta();
    setIsStandalone(isStandaloneMode());
    setDeviceKind(nextDeviceMeta.deviceKind);
    setPlatformFamily(nextDeviceMeta.platformFamily);
    setIosManualInstallAvailable(nextDeviceMeta.iosManualInstallAvailable);
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
    if (!registration || !('pushManager' in registration)) {
      setPushEnabled(false);
      return;
    }

    registrationRef.current = registration;
    const subscription = await registration.pushManager.getSubscription().catch(() => null);
    if (!subscription) {
      setPushEnabled(false);
      lastSyncedPushEndpointRef.current = null;
      return;
    }

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => false);
    if (endpoint) {
      await deleteSubscription(endpoint).catch(() => null);
    }
    lastSyncedPushEndpointRef.current = null;
    setPushEnabled(false);
  }, []);

  const syncPushSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return false;

    const effectiveStandalone = isStandaloneMode();
    const effectivePlatformFamily = detectDeviceMeta().platformFamily;
    const capability = getPushCapability(effectivePlatformFamily, effectiveStandalone);
    if (!capability.browserSupported || !capability.availableInContext) {
      setPushEnabled(false);
      setPushStatusMessage(capability.reason);
      return false;
    }

    if (getNotificationPermission() !== 'granted') {
      setPushStatusMessage(null);
      await unsubscribePushSubscription();
      return false;
    }

    const registration = registrationRef.current ?? (await navigator.serviceWorker.ready.catch(() => null));
    if (!registration || !('pushManager' in registration)) {
      setPushEnabled(false);
      setPushStatusMessage('Браузер не подготовил Service Worker для push-подписки.');
      return false;
    }
    registrationRef.current = registration;

    setPushSyncing(true);
    setPushStatusMessage(null);

    try {
      const pushKey = await fetchPushPublicKey();
      setPushConfigured(pushKey.enabled);
      setPushConfigResolved(true);

      if (!pushKey.enabled || !pushKey.publicKey) {
        setPushEnabled(false);
        setPushStatusMessage('На сервере не настроены VAPID-ключи для web push.');
        return false;
      }

      const expectedApplicationServerKey = urlBase64ToUint8Array(pushKey.publicKey);
      let subscription = await registration.pushManager.getSubscription();
      let shouldSaveSubscription = false;

      if (subscription && !subscriptionApplicationServerKeyMatches(subscription, expectedApplicationServerKey)) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe().catch(() => false);
        if (endpoint) {
          await deleteSubscription(endpoint).catch(() => null);
        }
        subscription = null;
        lastSyncedPushEndpointRef.current = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedApplicationServerKey,
        });
        shouldSaveSubscription = true;
      }

      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
        setPushEnabled(false);
        setPushStatusMessage('Браузер вернул неполную push-подписку.');
        return false;
      }

      if (lastSyncedPushEndpointRef.current !== serialized.endpoint) {
        shouldSaveSubscription = true;
      }

      if (shouldSaveSubscription) {
        await saveSubscription(serialized);
      }

      lastSyncedPushEndpointRef.current = serialized.endpoint;
      setPushEnabled(true);
      setPushStatusMessage(null);
      return true;
    } catch (error) {
      console.error('[push:sync-error]', error);
      setPushEnabled(false);
      setPushStatusMessage(describePushSyncError(error, capability));
      return false;
    } finally {
      setPushSyncing(false);
    }
  }, [unsubscribePushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    void fetchPushPublicKey()
      .then((pushKey) => {
        if (cancelled) return;
        setPushConfigured(pushKey.enabled);
        setPushConfigResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPushConfigured(false);
        setPushConfigResolved(true);
      });

    if (!('serviceWorker' in navigator)) {
      return () => {
        cancelled = true;
      };
    }

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;
        void registration.update().catch(() => {});
        if (getNotificationPermission() === 'granted') {
          void syncPushSubscription();
        }
      })
      .catch((error) => {
        registrationRef.current = null;
        console.error('[sw:register-error]', error);
      });

    return () => {
      cancelled = true;
    };
  }, [syncPushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateExperience = () => {
      const nextDeviceMeta = detectDeviceMeta();
      setNotificationPermission(getNotificationPermission());
      setIsStandalone(isStandaloneMode());
      setDeviceKind(nextDeviceMeta.deviceKind);
      setPlatformFamily(nextDeviceMeta.platformFamily);
      setIosManualInstallAvailable(nextDeviceMeta.iosManualInstallAvailable);
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
    if (typeof window === 'undefined') return;

    const revalidatePush = () => {
      if (document.visibilityState !== 'visible') return;
      if (getNotificationPermission() !== 'granted') return;
      void syncPushSubscription();
    };

    const onOnline = () => {
      if (getNotificationPermission() !== 'granted') return;
      void syncPushSubscription();
    };

    document.addEventListener('visibilitychange', revalidatePush);
    window.addEventListener('focus', revalidatePush);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', revalidatePush);
      window.removeEventListener('focus', revalidatePush);
      window.removeEventListener('online', onOnline);
    };
  }, [syncPushSubscription]);

  useEffect(() => {
    if (notificationPermission === 'granted') {
      void syncPushSubscription();
      return;
    }

    if (notificationPermission !== 'unsupported') {
      void unsubscribePushSubscription();
    }
  }, [isStandalone, notificationPermission, platformFamily, syncPushSubscription, unsubscribePushSubscription]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      const nextDeviceMeta = detectDeviceMeta();

      // We defer the native prompt only on mobile/tablet where we render
      // our own install UI. On desktop we keep the browser-native flow.
      if (nextDeviceMeta.deviceKind !== 'desktop') {
        event.preventDefault();
      }

      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPromptEvent(null);
      setIsStandalone(true);
      setPushStatusMessage(null);
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
    const capability = getPushCapability(platformFamily, isStandalone);
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

    if (!capability.browserSupported || !capability.availableInContext) {
      setPushStatusMessage(capability.reason);
      return getNotificationPermission();
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      await syncPushSubscription();
    }

    return permission;
  }, [isStandalone, platformFamily, syncPushSubscription]);

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
    const installRecommended = deviceKind !== 'desktop' && !isStandalone;
    const canRequestNotifications = notificationSupported && pushCapability.availableInContext;

    let notificationIssue: NotificationIssue = null;
    if (pushCapability.installRequiredForPush) {
      notificationIssue = notificationPermission === 'denied' ? 'permission_blocked' : 'permission_required';
    } else if (!notificationSupported || !pushCapability.browserSupported) {
      notificationIssue = 'unsupported';
    } else if (notificationPermission === 'denied') {
      notificationIssue = 'permission_blocked';
    } else if (notificationPermission === 'default') {
      notificationIssue = 'permission_required';
    } else if (pushSyncing) {
      notificationIssue = 'syncing';
    } else if (pushConfigResolved && !pushConfigured) {
      notificationIssue = 'config_missing';
    } else if (pushConfigResolved && pushConfigured && !pushEnabled) {
      notificationIssue = 'subscription_error';
    }

    const showNotificationBanner =
      canRequestNotifications &&
      notificationPermission !== 'granted' &&
      !isSnoozed(notificationBannerSnoozedUntil);
    const showInstallBanner = installRecommended && !isSnoozed(installBannerSnoozedUntil);

    return {
      notificationPermission,
      notificationSupported,
      notificationIssue,
      pushConfigured,
      pushConfigResolved,
      pushEnabled,
      pushSyncing,
      pushStatusMessage: pushStatusMessage ?? (pushCapability.installRequiredForPush ? pushCapability.reason : null),
      pushCapability,
      isStandalone,
      canInstall: installMode !== 'none',
      installMode,
      installRecommended,
      deviceKind,
      platformFamily,
      canRequestNotifications,
      requestNotifications,
      dismissNotificationBanner,
      promptInstall,
      dismissInstallBanner,
      showNotificationBanner,
      showInstallBanner,
    };
  }, [
    deviceKind,
    dismissInstallBanner,
    dismissNotificationBanner,
    installBannerSnoozedUntil,
    installPromptEvent,
    iosManualInstallAvailable,
    isStandalone,
    notificationBannerSnoozedUntil,
    notificationPermission,
    promptInstall,
    pushCapability,
    pushConfigResolved,
    pushConfigured,
    pushEnabled,
    pushStatusMessage,
    pushSyncing,
    requestNotifications,
  ]);

  return <AppExperienceContext.Provider value={value}>{children}</AppExperienceContext.Provider>;
}

export function useAppExperience() {
  return useContext(AppExperienceContext);
}
