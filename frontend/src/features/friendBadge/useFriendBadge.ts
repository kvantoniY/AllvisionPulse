'use client';

import { useGetFriendRequestsQuery } from '@/shared/api/friendsApi';

export function useFriendBadge() {
  const { data } = useGetFriendRequestsQuery();
  const incoming = data?.incoming ?? [];
  return { incomingCount: incoming.length };
}
