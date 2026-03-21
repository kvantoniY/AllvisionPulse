'use client';

import { PropsWithChildren } from 'react';
import { useGetMeQuery } from '@/shared/api/usersApi';

export function AuthGate({ children }: PropsWithChildren) {
  const { data, isLoading, isError } = useGetMeQuery();

  if (isLoading) {
    return (
      <div className="container" style={{ padding: 48 }}>
        <div className="panel" style={{ padding: 20 }}>Loading…</div>
      </div>
    );
  }

  if (isError || !data?.user) {
    // middleware should have redirected, but just in case
    return (
      <div className="container" style={{ padding: 48 }}>
        <div className="panel" style={{ padding: 20 }}>Auth required</div>
      </div>
    );
  }

  return <>{children}</>;
}
