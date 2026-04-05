import { baseApi } from './baseApi';
import type { AppNotification, NotificationsResponse } from '@/shared/types/notification';

type PushSubscriptionBody = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query<NotificationsResponse, { take?: number; cursor?: string | null } | void>({
      query: (arg) => {
        const take = arg && typeof arg === 'object' && arg.take ? arg.take : 30;
        const cursor = arg && typeof arg === 'object' && 'cursor' in arg ? arg.cursor : null;
        const params = new URLSearchParams();
        params.set('take', String(take));
        if (cursor) params.set('cursor', cursor);
        return { url: `/backend/notifications?${params.toString()}`, method: 'GET' };
      },
      providesTags: (result) =>
        result?.items?.length
          ? [
              { type: 'Notification' as const, id: 'LIST' },
              ...result.items.map((item) => ({ type: 'Notification' as const, id: item.id })),
            ]
          : [{ type: 'Notification' as const, id: 'LIST' }],
    }),

    readNotifications: build.mutation<{ ok: true }, { ids: string[] }>({
      query: (body) => ({
        url: '/backend/notifications/read',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, body) => [
        { type: 'Notification', id: 'LIST' },
        ...body.ids.map((id) => ({ type: 'Notification' as const, id })),
      ],
    }),

    readAllNotifications: build.mutation<{ ok: true }, void>({
      query: () => ({
        url: '/backend/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    clearNotifications: build.mutation<{ ok: true }, void>({
      query: () => ({
        url: '/backend/notifications',
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Notification', id: 'LIST' }],
    }),

    getPushPublicKey: build.query<{ enabled: boolean; publicKey?: string | null; message?: string }, void>({
      query: () => ({
        url: '/backend/notifications/push/public-key',
        method: 'GET',
      }),
    }),

    subscribeToPush: build.mutation<{ ok: true; subscriptionId?: string }, { subscription: PushSubscriptionBody }>({
      query: (body) => ({
        url: '/backend/notifications/push/subscribe',
        method: 'POST',
        body,
      }),
    }),

    unsubscribeFromPush: build.mutation<{ ok: true }, { endpoint: string }>({
      query: (body) => ({
        url: '/backend/notifications/push/subscribe',
        method: 'DELETE',
        body,
      }),
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useLazyGetNotificationsQuery,
  useReadNotificationsMutation,
  useReadAllNotificationsMutation,
  useClearNotificationsMutation,
  useGetPushPublicKeyQuery,
  useLazyGetPushPublicKeyQuery,
  useSubscribeToPushMutation,
  useUnsubscribeFromPushMutation,
} = notificationsApi;

export type { AppNotification };
