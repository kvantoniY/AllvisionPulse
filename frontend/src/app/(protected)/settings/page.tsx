'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './Settings.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Switch } from '@/shared/ui/Switch/Switch';
import { useLogoutMutation, useChangePasswordMutation } from '@/shared/api/authApi';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery, useUpdatePrivacyMutation } from '@/shared/api/usersApi';
import { useGetBlacklistQuery, useUnblockUserMutation } from '@/shared/api/friendsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import type { ContactPrivacy, ProfileVisibility } from '@/shared/types/models';

type SettingsTab = 'privacy' | 'security' | 'blacklist';

const profileOptions: { value: ProfileVisibility; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Открытый', hint: 'Профиль и список публикаций видны всем.' },
  { value: 'followers', label: 'Для подписчиков', hint: 'Полный профиль увидят только подписчики.' },
  { value: 'private', label: 'Закрытый', hint: 'Новые подписчики ждут подтверждения.' },
];

const contactOptions: { value: ContactPrivacy; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Все', hint: 'Свободный вход в диалоги и звонки.' },
  { value: 'followers', label: 'Подписчики', hint: 'Писать и звонить смогут только подписчики.' },
  { value: 'none', label: 'Никто', hint: 'Только ты сможешь инициировать общение.' },
];

function SettingsSegment({
  value,
  onChange,
}: {
  value: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const options: Array<{ value: SettingsTab; label: string }> = [
    { value: 'privacy', label: 'Приватность' },
    { value: 'security', label: 'Безопасность' },
    { value: 'blacklist', label: 'Чёрный список' },
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

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>('privacy');
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const privacy = me?.privacy;
  const [updatePrivacy, { isLoading: savingPrivacy }] = useUpdatePrivacyMutation();
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();
  const { data: blacklistData } = useGetBlacklistQuery();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();
  const [changePassword, { isLoading: changingPassword }] = useChangePasswordMutation();
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    const profileLabel = privacy?.profileVisibility === 'private' ? 'Закрытый профиль' : privacy?.profileVisibility === 'followers' ? 'Профиль для подписчиков' : 'Открытый профиль';
    const messagesLabel = privacy?.allowMessagesFrom === 'none' ? 'Сообщения выключены' : privacy?.allowMessagesFrom === 'followers' ? 'Сообщения от подписчиков' : 'Сообщения от всех';
    const callsLabel = privacy?.allowCallsFrom === 'none' ? 'Звонки выключены' : privacy?.allowCallsFrom === 'followers' ? 'Звонки от подписчиков' : 'Звонки от всех';
    return [profileLabel, messagesLabel, callsLabel];
  }, [privacy?.allowCallsFrom, privacy?.allowMessagesFrom, privacy?.profileVisibility]);

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
      setPasswordMessage('Заполни текущий и новый пароль.');
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
    const ok = await changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      .unwrap()
      .then(() => true)
      .catch(() => false);
    setPasswordMessage(ok ? 'Пароль обновлён. Остальные сессии завершены.' : 'Не удалось обновить пароль. Проверь текущий пароль.');
    if (ok) setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  return (
    <div className={`container appPage ${styles.page}`}>
      <Card>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroTitle}>Настройки</div>
            <div className={styles.heroText}>Простое управление приватностью, безопасностью и чёрным списком без перегруженных экранов и лишнего шума.</div>
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
                <ChoicePills value={privacy?.allowMessagesFrom} options={contactOptions.map(({ value, label }) => ({ value, label }))} onChange={(next) => updatePrivacyField({ allowMessagesFrom: next })} disabled={savingPrivacy} />
              </div>
              <div className={styles.settingRow}>
                <div className={styles.settingCopy}>
                  <div className={styles.settingTitle}>Звонки</div>
                  <div className={styles.settingHint}>Логика совпадает с диалогами: если пользователь в чёрном списке, звонок недоступен всегда.</div>
                </div>
                <ChoicePills value={privacy?.allowCallsFrom} options={contactOptions.map(({ value, label }) => ({ value, label }))} onChange={(next) => updatePrivacyField({ allowCallsFrom: next })} disabled={savingPrivacy} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Что видно на твоей странице" />
            <div className={styles.switchRows}>
              <Switch label="Показывать health-виджеты" description="Например настроение, сон, вес и другие публичные блоки." checked={privacy?.showHealthWidgets ?? true} onChange={(next) => updatePrivacyField({ showHealthWidgets: next })} />
              <Switch label="Показывать задачи" description="Открывает блок задач и привычек на странице профиля." checked={privacy?.showTasks ?? false} onChange={(next) => updatePrivacyField({ showTasks: next })} />
              <Switch label="Показывать события" description="Планы, напоминания и личные события на странице пользователя." checked={privacy?.showEvents ?? false} onChange={(next) => updatePrivacyField({ showEvents: next })} />
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
                <input type="password" className={styles.input} value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Новый пароль</span>
                <input type="password" className={styles.input} value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>Подтверждение</span>
                <input type="password" className={styles.input} value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} />
              </label>
            </div>
            {passwordMessage ? <div className={passwordMessage.includes('обновлён') ? styles.success : styles.error}>{passwordMessage}</div> : null}
            <div className={styles.footerActions}>
              <Button variant="primary" onClick={submitPassword} loading={changingPassword}>Обновить пароль</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Аккаунт" />
            <div className={styles.accountBox}>
              <div className={styles.accountMeta}>
                <div className={styles.accountName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>@{me?.username}<AdminBadge role={me?.role} /></div>
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
                      <div className={styles.userName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{user.username}<AdminBadge role={user.role} /></div>
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
    </div>
  );
}
