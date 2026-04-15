'use client';

import { PropsWithChildren, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { notificationsActions } from '@/entities/notification';
import { friendsApi } from '@/shared/api/friendsApi';
import { chatsApi, useGetChatsQuery } from '@/shared/api/chatsApi';
import { gamesApi } from '@/shared/api/gamesApi';
import { pulseApi } from '@/shared/api/pulseApi';
import { baseApi } from '@/shared/api/baseApi';
import { chatUiActions } from '@/entities/chat';
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
    for (let index = 0; index < input.length; index += 1) {
      input[index] = normalizeAppMediaUrlsDeep(input[index]);
    }
    return input as T;
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = normalizeAppMediaUrlsDeep(record[key]);
    }
    return input;
  }

  return input;
}

function playNotify() {
  void playUiBeep({ frequency: 880, durationMs: 120, gainValue: 0.04 }).catch(() => null);
}

const REALTIME_PATH = '/socket.io';
const LOCAL_SOCKET_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function normalizeOrigin(value?: string | null): string | null {
  const source = String(value ?? '').trim();
  if (!source) return null;
  try {
    return new URL(source).origin;
  } catch {
    return null;
  }
}

function resolveRealtimeOrigin(): string {
  if (typeof window === 'undefined') {
    return normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ?? normalizeOrigin(process.env.NEXT_PUBLIC_BACKEND_URL) ?? 'http://localhost:3000';
  }

  const currentOrigin = normalizeOrigin(window.location.origin);
  const publicAppOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const publicBackendOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_BACKEND_URL);

  if (!currentOrigin) return publicAppOrigin ?? publicBackendOrigin ?? window.location.origin;

  try {
    const currentUrl = new URL(currentOrigin);
    if (LOCAL_SOCKET_HOSTS.has(currentUrl.hostname)) {
      return publicAppOrigin ?? publicBackendOrigin ?? currentOrigin;
    }
  } catch {
    return publicAppOrigin ?? publicBackendOrigin ?? currentOrigin;
  }

  if (publicBackendOrigin && publicBackendOrigin !== currentOrigin) {
    return publicBackendOrigin;
  }

  if (publicAppOrigin && publicAppOrigin !== currentOrigin) {
    return publicAppOrigin;
  }

  return currentOrigin;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const r = await fetch('/api/auth/access', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return typeof j?.access === 'string' ? j.access : null;
  } catch {
    return null;
  }
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
    let retryTimer: number | null = null;
    let visibilityHandler: (() => void) | null = null;
    let onlineHandler: (() => void) | null = null;
    const refreshPromiseRef = { current: null as Promise<string | null> | null };

    const clearRetry = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleBootstrapRetry = (delayMs = 2500) => {
      if (!alive) return;
      clearRetry();
      retryTimer = window.setTimeout(() => {
        if (!alive) return;
        const current = socketRef.current;
        if (current?.connected || current?.active) return;
        void connect();
      }, delayMs);
    };

    const refreshAccessToken = async () => {
      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = getAccessToken().finally(() => {
          refreshPromiseRef.current = null;
        });
      }
      return refreshPromiseRef.current;
    };

    const connect = async () => {
      const currentSocket = socketRef.current;
      if (currentSocket?.connected || currentSocket?.active) return;

      const token = await refreshAccessToken();
      if (!alive) return;
      if (!token) {
        scheduleBootstrapRetry(3000);
        return;
      }

      clearRetry();

      if (currentSocket) {
        currentSocket.auth = { token } as any;
        try {
          currentSocket.connect();
        } catch {
          scheduleBootstrapRetry(3000);
        }
        return;
      }

      const socket = io(resolveRealtimeOrigin(), {
        path: REALTIME_PATH,
        transports: ['polling', 'websocket'],
        upgrade: true,
        rememberUpgrade: true,
        auth: { token },
        withCredentials: true,
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });

      socketRef.current = socket;
      setRealtimeSocket(socket);

      const refreshAndReconnect = async () => {
        const next = await refreshAccessToken();
        if (!next) {
          scheduleBootstrapRetry(3000);
          return;
        }
        socket.auth = { token: next } as any;
        if (!socket.connected) {
          try {
            socket.connect();
          } catch {
            scheduleBootstrapRetry(3000);
          }
        }
      };

      socket.io.on('reconnect_attempt', () => {
        void refreshAccessToken().then((next) => {
          if (!next) return;
          socket.auth = { token: next } as any;
        });
      });

      socket.io.on('reconnect_failed', () => {
        scheduleBootstrapRetry(3000);
      });

      socket.on('connect_error', async (err: any) => {
        const message = String(err?.message ?? '').toUpperCase();
        const status = Number(err?.description?.status ?? err?.description ?? err?.data?.status ?? 0);
        const isUnauthorized = message.includes('UNAUTHORIZED') || status === 401;

        if (isUnauthorized) {
          await refreshAndReconnect();
        }
      });

      socket.on('disconnect', async (reason: any) => {
        if (reason === 'io server disconnect') {
          await refreshAndReconnect();
        }
      });

      socket.on('notification:new', (payload: any) => {
        const type = payload?.type;
        dispatch(notificationsActions.push(payload));
        dispatch(baseApi.util.invalidateTags([{ type: 'Notification', id: 'LIST' }]));

        if (type === 'MESSAGE') {
          const chatId = payload?.meta?.chatId;
          if (!chatId) return;

          dispatch(chatsApi.util.invalidateTags([{ type: 'Message', id: `LIST:${chatId}` }, { type: 'Chat', id: 'LIST' }]));
          return;
        }

        if (type === 'FRIEND_REQUEST' || type === 'FRIEND_ACCEPTED') {
          dispatch(friendsApi.util.invalidateTags(['Requests', 'Friends', 'Followers']));
        }

        playNotify();
      });

      socket.on('message:new', (payload: any) => {
        const msg = normalizeAppMediaUrlsDeep(payload?.message ?? payload);
        const chatId = msg?.chatId;
        if (!chatId) return;

        dispatch(
          chatsApi.util.updateQueryData('getChats', undefined, (draft: any) => {
            const items: any[] = draft?.items ?? [];
            const idx = items.findIndex((c) => c.id === chatId);
            if (idx === -1) return;
            const chat = items[idx];
            chat.updatedAt = msg.createdAt ?? new Date().toISOString();
            chat.lastMessage = msg;
            items.splice(idx, 1);
            items.unshift(chat);
            draft.items = items;
          }),
        );

        /* Skip message-cache update for own messages in the active chat.
           The optimistic pending → resolvePendingMessage flow handles them;
           adding here too causes a brief duplicate (pending + real). */
        const isOwnInActiveChat =
          activeChatIdRef.current === chatId &&
          msg.senderId === meIdRef.current;

        if (!isOwnInActiveChat) {
          dispatch(
            chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
              const items: any[] = draft.items ?? [];
              if (!items.some((m) => m.id === msg.id)) {
                items.unshift(msg);
                draft.items = items;
              }
            }),
          );
        }

        dispatch(chatsApi.util.invalidateTags([{ type: 'Chat', id: 'LIST' }]));

        if (activeChatIdRef.current && activeChatIdRef.current === chatId) return;

        dispatch(chatUiActions.incUnread({ chatId }));
        playNotify();
      });

      socket.on('connect', () => {
        dispatch(chatsApi.util.invalidateTags([{ type: 'Chat', id: 'LIST' }]));
        const activeChat = activeChatIdRef.current;
        if (activeChat) {
          dispatch(chatsApi.util.invalidateTags([{ type: 'Message', id: `LIST:${activeChat}` }]));
        }
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

      socket.on('share-artifact:updated', (payload: any) => {
        const artifactId = String(payload?.artifactId ?? '');
        if (!artifactId) return;
        dispatch(baseApi.util.invalidateTags([{ type: 'ShareArtifact', id: artifactId }, { type: 'ShareArtifact', id: 'LIST' }]));
        dispatch(pulseApi.util.invalidateTags(['Pulse']));
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

      socket.connect();
    };

    visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      void connect();
    };
    onlineHandler = () => {
      void connect();
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('online', onlineHandler);
    void connect();

    return () => {
      alive = false;
      clearRetry();
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (onlineHandler) window.removeEventListener('online', onlineHandler);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setRealtimeSocket(null);
    };
  }, [dispatch]);

  return <>{children}</>;
}
