'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './Settings.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Switch } from '@/shared/ui/Switch/Switch';
import {
  useLogoutMutation,
  useChangePasswordMutation,
  useGetSessionsQuery,
  useRevokeSessionMutation,
  useRevokeOtherSessionsMutation,
  type AuthSession,
} from '@/shared/api/authApi';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery, useUpdatePrivacyMutation } from '@/shared/api/usersApi';
import { useGetBlacklistQuery, useUnblockUserMutation } from '@/shared/api/friendsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import type { ContactPrivacy, ProfileVisibility } from '@/shared/types/models';
import { useAppExperience } from '@/app/providers/AppExperienceProvider';

type SettingsTab = 'privacy' | 'security' | 'blacklist' | 'app';

const profileOptions: { value: ProfileVisibility; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Открытый', hint: 'Профиль и список публикаций видны всем.' },
  { value: 'followers', label: 'Для подписчиков', hint: 'Полный профиль увидят только подписчики.' },
  { value: 'private', label: 'Закрытый', hint: 'Новые подписчики ждут подтверждения.' },
];

const contactOptions: { value: ContactPrivacy; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Все', hint: 'Свободный вход в диалоги и звонки.' },
  { value: 'followers', label: 'Подписчики', hint: 'Писать и звонить смогут только подписчики.' },
  { value: 'none', label: 'Никто', hint: 'Только вы сможете инициировать общение.' },
];

function normalizeSettingsTab(value: string | null): SettingsTab {
  if (value === 'security' || value === 'blacklist' || value === 'app') return value;
  return 'privacy';
}

function SettingsSegment({ value, onChange }: { value: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  const options: Array<{ value: SettingsTab; label: string }> = [
    { value: 'privacy', label: 'Приватность' },
    { value: 'security', label: 'Безопасность' },
    { value: 'blacklist', label: 'Чёрный список' },
    { value: 'app', label: 'Скачать приложение' },
  ];

  return (
    <div className={styles.segmented}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[styles.segmentedItem, value === option.value ? styles.segmentedItemActive : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChoicePills<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.choicePills}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[styles.choicePill, value === option.value ? styles.choicePillActive : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatSessionDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function describeDevice(userAgent?: string | null) {
  const ua = String(userAgent ?? '').toLowerCase();
  const browser =
    ua.includes('edg/') ? 'Microsoft Edge'
    : ua.includes('opr/') || ua.includes('opera') ? 'Opera'
    : ua.includes('chrome/') && !ua.includes('edg/') ? 'Google Chrome'
    : ua.includes('firefox/') ? 'Mozilla Firefox'
    : ua.includes('safari/') && !ua.includes('chrome/') ? 'Safari'
    : 'Браузер';

  const os =
    ua.includes('windows') ? 'Windows'
    : ua.includes('android') ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios') ? 'iOS'
    : ua.includes('mac os x') || ua.includes('macintosh') ? 'macOS'
    : ua.includes('linux') ? 'Linux'
    : 'Неизвестная ОС';

  const device = ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') ? 'Мобильное устройство' : 'Компьютер';
  return { title: `${browser} • ${os}`, subtitle: device };
}

function permissionLabel(permission: ReturnType<typeof useAppExperience>['notificationPermission']) {
  if (permission === 'granted') return 'Разрешены';
  if (permission === 'denied') return 'Отключены';
  if (permission === 'default') return 'Не настроены';
  return 'Недоступны';
}

function pushLabel(experience: ReturnType<typeof useAppExperience>) {
  if (experience.pushSyncing) return 'Подключаем';
  if (experience.pushEnabled) return 'Подключены';
  if (experience.notificationIssue === 'config_missing') return 'Сервер не настроен';
  if (experience.notificationIssue === 'unsupported') return 'Недоступны';
  if (experience.notificationIssue === 'permission_required') return 'Ждут разрешения';
  if (experience.notificationIssue === 'permission_blocked') return 'Заблокированы';
  if (experience.notificationIssue === 'subscription_error') return 'Есть ошибка';
  return 'Ожидают настройки';
}

function deviceLabel(experience: ReturnType<typeof useAppExperience>) {
  if (experience.platformFamily === 'ios') {
    return experience.deviceKind === 'tablet' ? 'iPad / iPadOS' : 'iPhone / iOS';
  }
  if (experience.platformFamily === 'android') {
    return experience.deviceKind === 'tablet' ? 'Android-планшет' : 'Android';
  }
  return experience.deviceKind === 'desktop' ? 'Компьютер' : 'Мобильный браузер';
}

function installSteps(experience: ReturnType<typeof useAppExperience>) {
  if (experience.platformFamily === 'ios') {
    return [
      'Откройте Allvision Pulse в Safari.',
      'Нажмите "Поделиться" и выберите "На экран Домой".',
      'Запустите приложение с новой иконки на домашнем экране.',
      'Внутри установленного приложения разрешите уведомления.',
    ];
  }

  if (experience.platformFamily === 'android') {
    return [
      'Откройте Allvision Pulse в Chrome или Edge.',
      'Нажмите "Установить" или выберите "Добавить на главный экран" в меню браузера.',
      'Запустите приложение с иконки на телефоне.',
      'Разрешите уведомления при запросе браузера.',
    ];
  }

  return [
    'Откройте Allvision Pulse в поддерживаемом браузере по HTTPS.',
    'Разрешите уведомления для сайта.',
    'Используйте один канонический домен, чтобы не плодить разные push-подписки.',
  ];
}

function SessionRow({ session, isCurrent, busy, onRevoke }: { session: AuthSession; isCurrent: boolean; busy: boolean; onRevoke: () => void }) {
  const device = describeDevice(session.userAgent);
  const isRevoked = Boolean(session.revokedAt);

  return (
    <div className={[styles.sessionRow, isCurrent ? styles.sessionRowCurrent : ''].filter(Boolean).join(' ')}>
      <div className={styles.sessionMeta}>
        <div className={styles.sessionTopLine}>
          <div className={styles.sessionTitle}>{device.title}</div>
          <div className={styles.sessionBadges}>
            {isCurrent ? <span className={styles.sessionBadgeCurrent}>Текущая</span> : null}
            {isRevoked ? <span className={styles.sessionBadgeMuted}>Завершена</span> : null}
          </div>
        </div>
        <div className={styles.sessionHint}>{device.subtitle}</div>
        <div className={styles.sessionFacts}>
          <span>IP: {session.ip || 'не определён'}</span>
          <span>Последняя активность: {formatSessionDate(session.lastUsedAt)}</span>
          <span>Вход: {formatSessionDate(session.createdAt)}</span>
        </div>
      </div>
      {!isCurrent && !isRevoked ? <Button variant="ghost" onClick={onRevoke} loading={busy}>Завершить</Button> : null}
    </div>
  );
}

function AppSettingsTab() {
  const experience = useAppExperience();
  const steps = installSteps(experience);
  const showInstallAction = experience.installMode === 'prompt';
  const showEnableNotifications = experience.notificationPermission === 'default' && experience.canRequestNotifications;

  return (
    <div className={styles.stack}>
      <Card>
        <CardHeader title="Скачать приложение и push" />
        <CardMuted>
          На мобильных устройствах стабильные push-уведомления складываются из трёх частей: установленный PWA,
          разрешение уведомлений и живая push-подписка именно на этом устройстве.
        </CardMuted>

        <div className={styles.appStatusGrid}>
          <div className={styles.appStatusCard}>
            <div className={styles.appStatusLabel}>Устройство</div>
            <div className={styles.appStatusValue}>{deviceLabel(experience)}</div>
          </div>
          <div className={styles.appStatusCard}>
            <div className={styles.appStatusLabel}>Режим</div>
            <div className={styles.appStatusValue}>{experience.isStandalone ? 'Установленное приложение' : 'Открыто в браузере'}</div>
          </div>
          <div className={styles.appStatusCard}>
            <div className={styles.appStatusLabel}>Уведомления</div>
            <div className={styles.appStatusValue}>{permissionLabel(experience.notificationPermission)}</div>
          </div>
          <div className={styles.appStatusCard}>
            <div className={styles.appStatusLabel}>Push</div>
            <div className={styles.appStatusValue}>{pushLabel(experience)}</div>
          </div>
        </div>

        {experience.pushStatusMessage ? <div className={styles.appWarning}>{experience.pushStatusMessage}</div> : null}

        <div className={styles.appActions}>
          {showInstallAction ? (
            <Button variant="primary" onClick={() => void experience.promptInstall()}>
              Установить приложение
            </Button>
          ) : null}
          {showEnableNotifications ? (
            <Button variant="ghost" onClick={() => void experience.requestNotifications()}>
              Включить уведомления
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Что сделать на мобильном устройстве" />
        <div className={styles.appSteps}>
          {steps.map((step, index) => (
            <div key={step} className={styles.appStep}>
              <div className={styles.appStepIndex}>{index + 1}</div>
              <div className={styles.appStepText}>{step}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Подводные камни" />
        <div className={styles.appChecklist}>
          <div className={styles.appChecklistItem}>На iPhone и iPad web push включаются только внутри установленного приложения с экрана Домой, а не в обычной вкладке браузера.</div>
          <div className={styles.appChecklistItem}>Если сервер не отдаёт VAPID public key, сайт не сможет создать push-подписку даже при выданном разрешении.</div>
          <div className={styles.appChecklistItem}>Каждый домен, staging и альтернативный host создают отдельные подписки. Для продакшена нужен один канонический адрес.</div>
          <div className={styles.appChecklistItem}>Push работают только по HTTPS или на localhost. На небезопасном адресе браузер заблокирует подписку полностью.</div>
          <div className={styles.appChecklistItem}>Если уведомления были заблокированы в браузере или системе, одной переустановки иконки недостаточно: разрешение нужно вернуть в настройках сайта или ОС.</div>
        </div>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeSettingsTab(searchParams.get('tab'));

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const privacy = me?.privacy;

  const [updatePrivacy, { isLoading: savingPrivacy }] = useUpdatePrivacyMutation();
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();
  const { data: blacklistData } = useGetBlacklistQuery();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();
  const [changePassword, { isLoading: changingPassword }] = useChangePasswordMutation();
  const { data: sessionsData, isFetching: sessionsFetching, refetch: refetchSessions } = useGetSessionsQuery(undefined, {
    skip: tab !== 'security',
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [revokeSession, revokeSessionState] = useRevokeSessionMutation();
  const [revokeOtherSessions, revokeOtherSessionsState] = useRevokeOtherSessionsMutation();

  const summary = useMemo(() => {
    const profileLabel =
      privacy?.profileVisibility === 'private' ? 'Закрытый профиль'
      : privacy?.profileVisibility === 'followers' ? 'Профиль для подписчиков'
      : 'Открытый профиль';
    const messagesLabel =
      privacy?.allowMessagesFrom === 'none' ? 'Сообщения выключены'
      : privacy?.allowMessagesFrom === 'followers' ? 'Сообщения от подписчиков'
      : 'Сообщения от всех';
    const callsLabel =
      privacy?.allowCallsFrom === 'none' ? 'Звонки выключены'
      : privacy?.allowCallsFrom === 'followers' ? 'Звонки от подписчиков'
      : 'Звонки от всех';
    return [profileLabel, messagesLabel, callsLabel];
  }, [privacy?.allowCallsFrom, privacy?.allowMessagesFrom, privacy?.profileVisibility]);

  const sessions = sessionsData?.sessions ?? [];
  const currentSessionId = sessionsData?.currentSessionId ?? null;
  const activeSessionsCount = sessions.filter((session) => !session.revokedAt).length;

  const setTab = (nextTab: SettingsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'privacy') params.delete('tab');
    else params.set('tab', nextTab);
    const query = params.toString();
    router.replace(query ? `/settings?${query}` : '/settings', { scroll: false });
  };

  const updatePrivacyField = async (patch: Record<string, unknown>) => {
    await updatePrivacy(patch as never).unwrap().catch(() => null);
  };

  const onLogout = async () => {
    await logout().unwrap().catch(() => null);
    router.replace(ROUTES.auth.login);
  };

  const submitPassword = async () => {
    setPasswordMessage(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordMessage('Заполните текущий и новый пароль.');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage('Новый пароль должен содержать минимум 8 символов.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('Подтверждение пароля не совпадает.');
      return;
    }

    const ok = await changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
      .unwrap()
      .then(() => true)
      .catch(() => false);

    setPasswordMessage(ok ? 'Пароль обновлён. Остальные сессии завершены.' : 'Не удалось обновить пароль. Проверьте текущий пароль.');

    if (ok) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      refetchSessions();
    }
  };

  return (
    <div className={`container appPage ${styles.page}`}>
      <Card>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTitle}>Настройки</div>
            <div className={styles.heroText}>Простое управление приватностью, безопасностью, устройствами и установкой приложения без перегруженных экранов.</div>
          </div>
          <div className={styles.heroChips}>
            {summary.map((item) => (
              <span key={item} className={styles.heroChip}>{item}</span>
            ))}
          </div>
        </div>
      </Card>

      <SettingsSegment value={tab} onChange={setTab} />

      {tab === 'privacy' ? (
        <div className={styles.stack}>
          <Card>
            <CardHeader title="Кто видит профиль" />
            <CardMuted>Это влияет и на страницу пользователя, и на доступ к подписчикам и подпискам.</CardMuted>
            <div className={styles.optionList}>
              {profileOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[styles.optionRow, privacy?.profileVisibility === option.value ? styles.optionRowActive : ''].filter(Boolean).join(' ')}
                  onClick={() => updatePrivacyField({ profileVisibility: option.value })}
                  disabled={savingPrivacy}
                >
                  <div>
                    <div className={styles.optionTitle}>{option.label}</div>
                    <div className={styles.optionHint}>{option.hint}</div>
                  </div>
                  {privacy?.profileVisibility === option.value ? <Icon name="check" size={16} /> : null}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Кто может писать и звонить" />
            <div className={styles.settingRows}>
              <div className={styles.settingRow}>
                <div className={styles.settingCopy}>
                  <div className={styles.settingTitle}>Сообщения</div>
                  <div className={styles.settingHint}>Если запретить сообщения, кнопки старта диалога и composer будут заблокированы.</div>
                </div>
                <ChoicePills
                  value={privacy?.allowMessagesFrom}
                  options={contactOptions.map(({ value, label }) => ({ value, label }))}
                  onChange={(next) => updatePrivacyField({ allowMessagesFrom: next })}
                  disabled={savingPrivacy}
                />
              </div>
              <div className={styles.settingRow}>
                <div className={styles.settingCopy}>
                  <div className={styles.settingTitle}>Звонки</div>
                  <div className={styles.settingHint}>Логика совпадает с диалогами: если пользователь в чёрном списке, звонок недоступен всегда.</div>
                </div>
                <ChoicePills
                  value={privacy?.allowCallsFrom}
                  options={contactOptions.map(({ value, label }) => ({ value, label }))}
                  onChange={(next) => updatePrivacyField({ allowCallsFrom: next })}
                  disabled={savingPrivacy}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Что видно на твоей странице" />
            <div className={styles.switchRows}>
              <Switch label="Показывать health-виджеты" description="Например настроение, сон, вес и другие публичные блоки." checked={privacy?.showHealthWidgets ?? true} onChange={(next) => updatePrivacyField({ showHealthWidgets: next })} />
              <Switch label="Показывать задачи" description="Открывает блок задач и привычек на странице профиля." checked={privacy?.showTasks ?? false} onChange={(next) => updatePrivacyField({ showTasks: next })} />
              <Switch label="Показывать события" description="Планы, напоминания и личные события на странице пользователя." checked={privacy?.showEvents ?? false} onChange={(next) => updatePrivacyField({ showEvents: next })} />
              <Switch label="Показывать Pulse achievements" description="Разрешает отображать достижения Pulse в профиле." checked={privacy?.showPulseAchievements ?? false} onChange={(next) => updatePrivacyField({ showPulseAchievements: next })} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className={styles.stack}>
          <Card>
            <CardHeader title="Смена пароля" />
            <CardMuted>После обновления пароля все другие активные сессии будут завершены.</CardMuted>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Текущий пароль</span>
                <input type="password" className={styles.input} value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Новый пароль</span>
                <input type="password" className={styles.input} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Подтверждение</span>
                <input type="password" className={styles.input} value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} />
              </label>
            </div>
            {passwordMessage ? <div className={passwordMessage.includes('обновлён') ? styles.success : styles.error}>{passwordMessage}</div> : null}
            <div className={styles.footerActions}>
              <Button variant="primary" onClick={submitPassword} loading={changingPassword}>Обновить пароль</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Активные сессии" />
            <CardMuted>Здесь видно, где сейчас выполнен вход. Используйте один канонический адрес сайта, чтобы не плодить отдельные сессии на разных host.</CardMuted>
            <div className={styles.sessionSummaryRow}>
              <div className={styles.sessionSummaryCard}>
                <div className={styles.sessionSummaryValue}>{activeSessionsCount}</div>
                <div className={styles.sessionSummaryLabel}>Активно сейчас</div>
              </div>
              <div className={styles.sessionSummaryActions}>
                <Button variant="ghost" onClick={() => refetchSessions()} loading={sessionsFetching}>Обновить список</Button>
                <Button
                  variant="ghost"
                  onClick={() => revokeOtherSessions().unwrap().then(() => refetchSessions()).catch(() => null)}
                  loading={revokeOtherSessionsState.isLoading}
                  disabled={activeSessionsCount <= 1 || Boolean(revokingSessionId)}
                >
                  Завершить остальные
                </Button>
              </div>
            </div>
            <div className={styles.sessionList}>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isCurrent={session.id === currentSessionId}
                  busy={revokeSessionState.isLoading && revokingSessionId === session.id}
                  onRevoke={() => {
                    setRevokingSessionId(session.id);
                    revokeSession({ sessionId: session.id })
                      .unwrap()
                      .then(() => refetchSessions())
                      .catch(() => null)
                      .finally(() => setRevokingSessionId(null));
                  }}
                />
              ))}
              {!sessions.length ? <div className={styles.empty}>Сессии пока не найдены.</div> : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Аккаунт" />
            <div className={styles.accountBox}>
              <div className={styles.accountMeta}>
                <div className={styles.accountName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  @{me?.username}
                  <AdminBadge role={me?.role} />
                </div>
                <div className={styles.accountHint}>{me?.followersCount ?? 0} подписчиков • {me?.followingCount ?? 0} подписок</div>
              </div>
              <Button onClick={onLogout} loading={loggingOut}>Выйти из аккаунта</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'blacklist' ? (
        <Card>
          <CardHeader title="Чёрный список" />
          <CardMuted>Заблокированные пользователи не смогут писать, звонить, подписываться и смотреть ограниченный профиль.</CardMuted>
          <div className={styles.blacklist}>
            {(blacklistData?.blacklist ?? []).map((entry: any) => {
              const user = entry.blocked;
              if (!user) return null;

              return (
                <div key={entry.id} className={styles.blacklistRow}>
                  <div className={styles.userBox}>
                    <div className={styles.avatar}>{user.username?.slice(0, 1)?.toUpperCase()}</div>
                    <div className={styles.userInfo}>
                      <div className={styles.userName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {user.username}
                        <AdminBadge role={user.role} />
                      </div>
                      <div className={styles.userHint}>{user.bio || 'Пользователь скрыт из общения и рекомендаций.'}</div>
                    </div>
                  </div>
                  <Button onClick={() => unblockUser({ userId: user.id }).unwrap().catch(() => null)} loading={unblocking}>Убрать из ЧС</Button>
                </div>
              );
            })}
            {!(blacklistData?.blacklist ?? []).length ? <div className={styles.empty}>Чёрный список пуст. Пользователя можно заблокировать прямо из профиля или списка подписок.</div> : null}
          </div>
        </Card>
      ) : null}

      {tab === 'app' ? <AppSettingsTab /> : null}
    </div>
  );
}
