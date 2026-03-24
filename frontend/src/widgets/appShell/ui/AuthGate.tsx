'use client';

import { PropsWithChildren } from 'react';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

export function AuthGate({ children }: PropsWithChildren) {
  const { data, isLoading, isError } = useGetMeQuery();

  if (isLoading) {
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
    return (
      <div className="container" style={{ padding: 48 }}>
        <div className="panel" style={{ padding: 20 }}>Требуется авторизация</div>
      </div>
    );
  }

  return <>{children}</>;
}
