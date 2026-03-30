'use client';

import { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { friendsApi } from '@/shared/api/friendsApi';
import { chatsApi, useGetChatsQuery } from '@/shared/api/chatsApi';
import { gamesApi } from '@/shared/api/gamesApi';
import { chatUiActions } from '@/entities/chat';
import { PUBLIC_BACKEND_URL } from '@/shared/config/env';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { presenceActions } from '@/entities/presence';
import { setRealtimeSocket } from '@/shared/lib/realtimeSocket';
import { bindAudioUnlock, playUiBeep } from '@/shared/lib/audio';


function normalizeAppMediaUrl(value?: string | null): string | null {
  if (typeof value !== 'string') return value ?? null;
  const source = value.trim();
  if (!source) return null;

  if (source.startsWith('/uploads/')) return source;
  if (source.startsWith('uploads/')) return `/${source}`;

  try {
    const parsed = new URL(source);
    if (parsed.pathname.startsWith('/uploads/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return source;
  } catch {
    const uploadIndex = source.indexOf('/uploads/');
    if (uploadIndex >= 0) return source.slice(uploadIndex);
    return source;
  }
}

function normalizeAppMediaUrlsDeep<T>(input: T): T {
  if (typeof input === 'string') {
    return normalizeAppMediaUrl(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeAppMediaUrlsDeep(item)) as T;
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, normalizeAppMediaUrlsDeep(value)]);
    return Object.fromEntries(entries) as T;
  }

  return input;
}

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
  const meIdRef = useRef<string | undefined>(meId);
  const chatsRef = useRef(chatsData);

  const mergeGameSession = (prevSession: any, nextSession: any) => {
    if (!prevSession) return nextSession;
    const viewerId = meIdRef.current;
    if (nextSession?.gameKey !== 'POKER' || !prevSession?.poker || !nextSession?.poker || !viewerId) return nextSession;
    const prevPlayer = prevSession.poker.players?.find((player: any) => player.userId === viewerId);
    if (!prevPlayer?.cards?.length) return nextSession;
    return {
      ...nextSession,
      poker: {
        ...nextSession.poker,
        players: (nextSession.poker.players ?? []).map((player: any) => {
          if (player.userId !== viewerId) return player;
          const hidden = Array.isArray(player.cards) && player.cards.every((card: string) => card === '??');
          return hidden ? { ...player, cards: prevPlayer.cards } : player;
        }),
      },
    };
  };

  const applyGameSessionCache = (chatId: string, sessionId: string, sessionPayload: any | null, deleted = false) => {
    if (!chatId) return;
    dispatch(
      gamesApi.util.updateQueryData('getGameSessions', { chatId }, (draft: any) => {
        draft.items = Array.isArray(draft?.items) ? draft.items : [];
        if (deleted) {
          draft.items = draft.items.filter((item: any) => item.sessionId !== sessionId);
          return;
        }
        if (!sessionPayload || !sessionId) return;
        const idx = draft.items.findIndex((item: any) => item.sessionId === sessionId);
        if (idx === -1) draft.items.unshift(sessionPayload);
        else draft.items[idx] = sessionPayload;
        draft.items.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }),
    );
    if (deleted || !sessionPayload || !sessionId) return;
    dispatch(
      gamesApi.util.updateQueryData('getGameSession', { sessionId }, (draft: any) => {
        if (!draft) return;
        draft.session = mergeGameSession(draft.session, sessionPayload);
      }),
    );
  };

  useEffect(() => {
    knownUsersRef.current = knownUsers;
  }, [knownUsers]);

  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  useEffect(() => {
    chatsRef.current = chatsData;
  }, [chatsData]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    bindAudioUnlock();
    let alive = true;

    const connect = async () => {
      const token = await getAccessToken();
      if (!alive || !token) return;

      const realtimeBaseUrl = typeof window === 'undefined' ? PUBLIC_BACKEND_URL : window.location.origin;

      const socket = io(realtimeBaseUrl, {
        transports: ['websocket'],
        auth: { token },
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
        timeout: 20000,
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
          title = `${by} запросил(а) подписку`;
        } else if (type === 'FRIEND_ACCEPTED') {
          title = `${by} подтвердил(а) подписку`;
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
        const msg = normalizeAppMediaUrlsDeep(payload?.message ?? payload);
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

      socket.on('connect', () => {
        dispatch(chatsApi.util.invalidateTags([{ type: 'Chat', id: 'LIST' }]));
        const gameTags = (chatsRef.current?.items ?? []).map((chat: any) => ({ type: 'Game', id: `LIST:${chat.id}` }));
        if (gameTags.length) dispatch(gamesApi.util.invalidateTags(gameTags as any));
      });

      socket.on('game:update', (payload: any) => {
        const chatId = String(payload?.chatId ?? '');
        const sessionId = String(payload?.sessionId ?? '');
        if (!chatId) return;
        const deleted = String(payload?.status ?? '') === 'DELETED' || String(payload?.reason ?? '') === 'deleted';
        const sessionPayload = payload?.payload ?? null;
        if (sessionId) {
          if (sessionPayload) applyGameSessionCache(chatId, sessionId, sessionPayload, false);
          else if (deleted) applyGameSessionCache(chatId, sessionId, null, true);
        }
        dispatch(gamesApi.util.invalidateTags([{ type: 'Game', id: `LIST:${chatId}` }]));
        if (sessionId && !sessionPayload) dispatch(gamesApi.util.invalidateTags([{ type: 'Game', id: sessionId }]));
        dispatch(chatsApi.util.invalidateTags([{ type: 'Message', id: `LIST:${chatId}` }, { type: 'Chat', id: 'LIST' }]));
      });


      socket.on('message:updated', (payload: any) => {
        const chatId = payload?.chatId;
        const msg = normalizeAppMediaUrlsDeep(payload?.message);
        if (!chatId || !msg?.id) return;

        dispatch(
          chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
            const items: any[] = draft.items ?? [];
            const index = items.findIndex((m) => m.id === msg.id);
            if (index !== -1) items[index] = msg;
          }),
        );

        dispatch(
          chatsApi.util.updateQueryData('getChats', undefined, (draft: any) => {
            const items: any[] = draft?.items ?? [];
            const chat = items.find((c) => c.id === chatId);
            if (chat?.lastMessage?.id === msg.id) {
              chat.lastMessage = msg;
            }
          }),
        );
      });

      socket.on('message:deleted', (payload: any) => {
        const chatId = payload?.chatId;
        const messageId = payload?.messageId;
        if (!chatId || !messageId) return;

        dispatch(
          chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
            const items: any[] = draft.items ?? [];
            draft.items = items.filter((m) => m.id !== messageId);
          }),
        );

        dispatch(chatsApi.util.invalidateTags([{ type: 'Chat', id: 'LIST' }]));
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

      socket.on('presence:reconnecting', (p: any) => {
        const userId = p?.userId;
        if (!userId) return;
        dispatch(presenceActions.setReconnecting({ userId }));
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
