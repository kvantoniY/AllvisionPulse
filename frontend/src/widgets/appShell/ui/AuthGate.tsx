'use client';

import { PropsWithChildren } from 'react';
import { useRouter } from 'next/navigation';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useLogoutMutation } from '@/shared/api/authApi';
import { Button } from '@/shared/ui/Button/Button';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

function buildSuspensionText(user: any) {
  const reason = typeof user?.suspensionReason === 'string' && user.suspensionReason.trim() ? user.suspensionReason.trim() : null;
  if (user?.suspendedPermanent) {
    return {
      title: 'Вы заблокированы администрацией бессрочно',
      subtitle: reason ? `Причина: ${reason}` : 'Причина блокировки не указана.',
    };
  }

  const until = user?.suspendedUntil ? new Date(user.suspendedUntil) : null;
  const untilLabel = until && Number.isFinite(until.getTime())
    ? until.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })
    : 'неизвестный срок';

  return {
    title: `Вы заблокированы администрацией до ${untilLabel}`,
    subtitle: reason ? `Причина: ${reason}` : 'Причина блокировки не указана.',
  };
}

export function AuthGate({ children }: PropsWithChildren) {
  const router = useRouter();
  const { data, error, isLoading, isFetching, isError, refetch } = useGetMeQuery(undefined, {
    pollingInterval: 30_000,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [logout, { isLoading: loggingOut }] = useLogoutMutation();

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Skeleton style={{ width: '100%', height: 120 }} />
          <Skeleton style={{ width: '100%', height: 360 }} />
          <div style={{ display: 'grid', gap: 12 }}>
            <SkeletonText lines={3} />
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data?.user) {
    const status = typeof (error as any)?.status === 'number' ? Number((error as any).status) : null;
    const isUnauthorized = status === 401 || (!data?.user && !status);

    return (
      <div className="container" style={{ padding: 48 }}>
        <div className="panel" style={{ padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 700 }}>{isUnauthorized ? 'Требуется авторизация' : 'Не удалось проверить сессию'}</div>
          <div style={{ color: 'var(--muted)' }}>
            {isUnauthorized ? 'Сессия недействительна или истекла. Войдите снова.' : 'Похоже, сервер временно не ответил. Попробуйте повторить.'}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isUnauthorized ? (
              <Button variant="primary" onClick={() => router.replace('/auth/login')}>Перейти ко входу</Button>
            ) : (
              <Button variant="primary" onClick={() => refetch()}>Повторить</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const user = data.user;
  const isSuspended = Boolean(user.suspendedPermanent || (user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()));
  if (isSuspended) {
    const text = buildSuspensionText(user);
    return (
      <div className="container" style={{ minHeight: '100vh', display: 'grid', alignItems: 'center', paddingTop: 24, paddingBottom: 24 }}>
        <div className="panel" style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{text.title}</div>
            <div style={{ color: 'var(--muted)' }}>{text.subtitle}</div>
            <div style={{ color: 'var(--muted)' }}>Вход в аккаунт доступен, но пользоваться функциями приложения во время блокировки нельзя.</div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              loading={loggingOut}
              onClick={async () => {
                await logout().unwrap().catch(() => null);
                router.replace('/auth/login');
              }}
            >
              Выйти из аккаунта
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
