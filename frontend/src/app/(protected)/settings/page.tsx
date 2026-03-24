'use client';

import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { useLogoutMutation } from '@/shared/api/authApi';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/shared/config/app';

export default function SettingsPage() {
  const [logout, { isLoading }] = useLogoutMutation();
  const router = useRouter();

  const onLogout = async () => {
    await logout().unwrap().catch(() => null);
    router.replace(ROUTES.auth.login);
  };

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <Card>
        <CardHeader title="Настройки" />
        <CardMuted>Разделы аккаунта, приватности и чёрного списка будут добавлены следующим этапом.</CardMuted>
        <div className="hr" />
        <Button variant="ghost" onClick={onLogout} disabled={isLoading}>
          {isLoading ? 'Logging out…' : 'Logout'}
        </Button>
      </Card>
    </div>
  );
}
