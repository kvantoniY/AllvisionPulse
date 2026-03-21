'use client';

import { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { friendsApi } from '@/shared/api/friendsApi';
import { chatsApi, useGetChatsQuery } from '@/shared/api/chatsApi';
import { chatUiActions } from '@/entities/chat';
import { PUBLIC_BACKEND_URL } from '@/shared/config/env';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { presenceActions } from '@/entities/presence';
import { setRealtimeSocket } from '@/shared/lib/realtimeSocket';
import { bindAudioUnlock, playUiBeep } from '@/shared/lib/audio';

function playNotify() {
  void playUiBeep({ frequency: 880, durationMs: 120, gainValue: 0.04 }).catch(() => null);
}

async function getAccessToken(): Promise<string | null> {
  const r = await fetch('/api/auth/access', { method: 'GET', credentials: 'include' });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return typeof j?.access === 'string' ? j.access : null;
}

export function RealtimeProvider({ children }: PropsWithChildren) {
  const dispatch = useAppDispatch();
  const activeChatId = useAppSelector((s) => s.chatUi.activeChatId);
  const { data: meData } = useGetMeQuery();
  const meId = meData?.user?.id;
  const { data: chatsData } = useGetChatsQuery();
  const knownUsers = useMemo(() => {
    const map = new Map<string, { username?: string; lastSeenAt?: string | null }>();
    const chats = chatsData?.items ?? [];
    for (const c of chats) {
      for (const m of c.members ?? []) {
        const u = m.user;
        if (u?.id) map.set(u.id, { username: u.username, lastSeenAt: (u as any)?.lastSeenAt ?? null });
      }
    }
    if (meData?.user?.id) map.set(meData.user.id, { username: meData.user.username, lastSeenAt: (meData.user as any)?.lastSeenAt ?? null });
    return map;
  }, [chatsData, meData]);

  // hydrate lastSeen (from REST responses) so UI has something even before realtime presence events
  useEffect(() => {
    for (const [userId, info] of knownUsers.entries()) {
      dispatch(presenceActions.hydrateUser({ userId, lastSeenAt: info.lastSeenAt ?? null }));
    }
  }, [dispatch, knownUsers]);
  const activeChatIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const knownUsersRef = useRef(knownUsers);

  useEffect(() => {
    knownUsersRef.current = knownUsers;
  }, [knownUsers]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    bindAudioUnlock();
    let alive = true;

    const connect = async () => {
      const token = await getAccessToken();
      if (!alive || !token) return;

      const socket = io(PUBLIC_BACKEND_URL, {
        transports: ['websocket'],
        auth: { token },
        withCredentials: true,
      });

      socketRef.current = socket;
      setRealtimeSocket(socket);

      const refreshAndReconnect = async () => {
        const next = await getAccessToken();
        if (!next) return;
        socket.auth = { token: next } as any;
        try {
          socket.connect();
        } catch {
          // ignore
        }
      };

      socket.on('connect_error', async (_err: any) => {
        // access might be expired; try to refresh via /api/auth/access and reconnect
        await refreshAndReconnect();
      });

      socket.on('disconnect', async (reason: any) => {
        // If server drops us (often due to auth), try to refresh token and reconnect.
        // socket.io uses reason strings like: 'io server disconnect', 'transport close', 'ping timeout'
        if (reason === 'io server disconnect') {
          await refreshAndReconnect();
        }
      });

      function nameById(id?: string | null) {
        if (!id) return 'Пользователь';
        return knownUsersRef.current.get(id)?.username ?? 'Пользователь';
      }

      function pushSocialNotification(notif: any) {
        const type = notif?.type ?? 'NOTIFICATION';
        const data = notif?.data ?? {};
        const by = nameById(data?.byUserId);

        // лаконичный формат “как в соцсети”
        let title: string | undefined;
        let message: string | undefined;

        if (type === 'POST_LIKED') {
          title = `${by} поставил(а) лайк вашему посту`;
          message = data?.postId ? `Пост: ${data.postId}` : undefined;
        } else if (type === 'POST_COMMENTED') {
          title = `${by} прокомментировал(а) ваш пост`;
          message = data?.postId ? `Пост: ${data.postId}` : undefined;
        } else if (type === 'COMMENT_LIKED') {
          title = `${by} поставил(а) лайк вашему комментарию`;
          message = data?.postId ? `Пост: ${data.postId}` : undefined;
        } else if (type === 'FRIEND_REQUEST') {
          title = `${by} отправил(а) заявку в друзья`;
        } else if (type === 'FRIEND_ACCEPTED') {
          title = `${by} принял(а) заявку в друзья`;
        } else {
          title = type;
        }

        dispatch(
          notificationsActions.push({
            id: notif?.id ?? `${Date.now()}-${Math.random()}`,
            type,
            title,
            message,
            createdAt: notif?.createdAt ?? new Date().toISOString(),
            data: notif,
          }),
        );
      }

      socket.on('notification:new', (payload: any) => {
        const type = payload?.type;
        // MESSAGE-уведомления не должны попадать в общий колокол.
        // Используем их как «страховку» для realtime: обновим чат/сообщения и покажем индикаторы.
        if (type === 'MESSAGE') {
          const chatId = payload?.data?.chatId;
          if (!chatId) return;

          // если по какой-то причине не пришёл message:new из комнаты чата — подтянем с сервера
          dispatch(chatsApi.util.invalidateTags([{ type: 'Message', id: `LIST:${chatId}` }, { type: 'Chat', id: 'LIST' }]));

          if (activeChatIdRef.current !== chatId) {
            dispatch(chatUiActions.incUnread({ chatId }));
            playNotify();
          }
          return;
        }

        pushSocialNotification(payload);
        playNotify();
      });

      socket.on('message:new', (payload: any) => {
        const msg = payload?.message ?? payload;
        const chatId = msg?.chatId;
        if (!chatId) return;

        // Обновим список чатов мгновенно: последний текст, время и порядок.
        dispatch(
          chatsApi.util.updateQueryData('getChats', undefined, (draft: any) => {
            const items: any[] = draft?.items ?? [];
            const idx = items.findIndex((c) => c.id === chatId);
            if (idx === -1) return;
            const chat = items[idx];
            chat.updatedAt = msg.createdAt ?? new Date().toISOString();
            chat.lastMessage = msg;
            // move to top
            items.splice(idx, 1);
            items.unshift(chat);
            draft.items = items;
          }),
        );

        // Update messages cache (append newest) if this chat query exists
        dispatch(
          chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
            const items: any[] = draft.items ?? [];
            if (!items.some((m) => m.id === msg.id)) {
              // backend returns newest-first pages; in UI we reverse to asc.
              items.unshift(msg);
              draft.items = items;
            }
          }),
        );

        // на всякий случай (если списка нет в кеше)
        dispatch(chatsApi.util.invalidateTags([{ type: 'Chat', id: 'LIST' }]));

        if (activeChatIdRef.current && activeChatIdRef.current === chatId) return;

        // сообщения → только вкладка Messages + индикаторы/звук
        dispatch(chatUiActions.incUnread({ chatId }));
        playNotify();
      });

      socket.on('message:read', (payload: any) => {
        const chatId = payload?.chatId;
        const messageId = payload?.messageId;
        const userId = payload?.userId;
        if (!chatId || !messageId || !userId) return;

        dispatch(
          chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
            const items: any[] = draft.items ?? [];
            for (const m of items) {
              if (m.id !== messageId) continue;
              m.reads = m.reads ?? [];
              if (!m.reads.some((r: any) => r.userId === userId)) {
                m.reads.push({ id: `${Date.now()}-${Math.random()}`, userId, createdAt: new Date().toISOString() });
              }
            }
          }),
        );
      });

      // presence
      socket.on('presence:online', (p: any) => {
        const userId = p?.userId;
        if (!userId) return;
        dispatch(presenceActions.setOnline({ userId }));
      });

      socket.on('presence:offline', (p: any) => {
        const userId = p?.userId;
        if (!userId) return;
        dispatch(presenceActions.setOffline({ userId, lastSeenAt: p?.lastSeenAt ?? null }));
      });

      socket.on('disconnect', () => {
        // noop
      });

      return () => {
        setRealtimeSocket(null);
      };
    };

    const cleanupPromise = connect();

    return () => {
      alive = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setRealtimeSocket(null);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      cleanupPromise;
    };
  }, [dispatch]);

  // keep friend requests list in sync when something arrives (server emits notification:new already)
  useEffect(() => {
    const id = window.setInterval(() => {
      dispatch(friendsApi.util.invalidateTags(['Requests']));
    }, 15000);
    return () => window.clearInterval(id);
  }, [dispatch]);

  return <>{children}</>;
}
