'use client';

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket, subscribeRealtimeSocket } from '@/shared/lib/realtimeSocket';
import { useGetChatsQuery, useSendMessageMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import type { Chat } from '@/shared/types/chat';
import { IncomingCallToast } from '@/features/call/IncomingCallToast';
import { CallScreen } from '@/features/call/CallScreen';

type CallStage = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'in_call' | 'reconnecting' | 'ending' | 'ended' | 'failed';
type CallKind = 'direct' | 'group';
type ParticipantState = 'joined' | 'reconnecting';

type RuntimeParticipant = {
  userId: string;
  joinedAt: string | null;
  state: ParticipantState;
  leftAt: string | null;
};

type ActiveCallState = {
  chatId: string;
  callId: string;
  active: boolean;
  createdBy: string | null;
  createdAt: string | null;
  kind: CallKind;
  screenShareBy: string | null;
  participants: RuntimeParticipant[];
};

type SessionState = {
  stage: CallStage;
  chatId: string;
  callId: string;
  initiator: boolean;
  inviterId: string;
  error: string;
};

const CALL_SESSION_KEY = 'av:active-call';
const CALL_INTENT_KEY = 'av:incoming-call-intent';
const CALL_UI_KEY = 'av:call-ui';
const CALL_INTENT_TTL_MS = 20_000;

type IncomingCallIntentSource = 'service_worker' | 'push' | 'url' | 'storage';

type IncomingCallIntent = {
  chatId: string;
  callId: string;
  fromUserId: string;
  kind: CallKind;
  receivedAt: number;
  source: IncomingCallIntentSource;
};

type QueuedCallAction = {
  type: 'accept' | 'decline';
  chatId: string;
  callId: string;
  direct: boolean;
};

export type CallContextValue = {
  startCall: (chatId: string) => void;
  joinCall: (chatId: string) => void;
  getActiveCallId: (chatId: string) => string | null;
  hasReturnableCall: (chatId: string) => boolean;
};

export const CallContext = createContext<CallContextValue>({
  startCall: () => {},
  joinCall: () => {},
  getActiveCallId: () => null,
  hasReturnableCall: () => false,
});

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createIdleSession(): SessionState {
  return { stage: 'idle', chatId: '', callId: '', initiator: false, inviterId: '', error: '' };
}

function formatDuration(startedAt: number | null) {
  if (!startedAt) return '0:00';
  const diff = Math.max(0, Date.now() - startedAt);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function normalizeCallState(payload: any): ActiveCallState | null {
  const chatId = String(payload?.chatId ?? '');
  const callId = String(payload?.callId ?? '');
  if (!chatId || !callId || !payload?.active) return null;

  return {
    chatId,
    callId,
    active: true,
    createdBy: payload?.createdBy ? String(payload.createdBy) : null,
    createdAt: payload?.createdAt ? String(payload.createdAt) : null,
    kind: payload?.kind === 'group' ? 'group' : 'direct',
    screenShareBy: payload?.screenShareBy ? String(payload.screenShareBy) : null,
    participants: Array.isArray(payload?.participants)
      ? payload.participants.map((participant: any) => ({
          userId: String(participant?.userId ?? ''),
          joinedAt: participant?.joinedAt ? String(participant.joinedAt) : null,
          state: participant?.state === 'reconnecting' ? 'reconnecting' : 'joined',
          leftAt: participant?.leftAt ? String(participant.leftAt) : null,
        }))
      : [],
  };
}

function normalizeIncomingIntent(payload: any, source: IncomingCallIntentSource): IncomingCallIntent | null {
  const chatId = String(payload?.chatId ?? '').trim();
  const callId = String(payload?.callId ?? '').trim();
  if (!chatId || !callId) return null;

  return {
    chatId,
    callId,
    fromUserId: String(payload?.fromUserId ?? '').trim(),
    kind: payload?.kind === 'group' ? 'group' : 'direct',
    receivedAt:
      typeof payload?.receivedAt === 'number' && Number.isFinite(payload.receivedAt)
        ? payload.receivedAt
        : Date.now(),
    source,
  };
}

function readIncomingIntentFromUrl(): IncomingCallIntent | null {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  if (url.searchParams.get('incomingCall') !== '1') return null;

  return normalizeIncomingIntent(
    {
      chatId: url.searchParams.get('chatId'),
      callId: url.searchParams.get('callId'),
      fromUserId: url.searchParams.get('fromUserId'),
      kind: url.searchParams.get('callKind'),
      receivedAt: Number(url.searchParams.get('callIntentAt') ?? Date.now()),
    },
    'url',
  );
}

function stripIncomingIntentFromUrl() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const params = ['incomingCall', 'chatId', 'callId', 'fromUserId', 'callKind', 'callIntentAt'];
  let changed = false;

  for (const param of params) {
    if (!url.searchParams.has(param)) continue;
    url.searchParams.delete(param);
    changed = true;
  }

  if (!changed) return;

  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, document.title, next);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { data: chatsRes } = useGetChatsQuery();
  const { data: meRes } = useGetMeQuery();
  const meId = meRes?.user?.id ?? '';
  const chats = chatsRes?.items ?? [];
  const [sendMessage] = useSendMessageMutation();

  const [session, setSession] = useState<SessionState>(createIdleSession);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [activeCallsByChat, setActiveCallsByChat] = useState<Record<string, ActiveCallState>>({});
  const [incomingIntent, setIncomingIntent] = useState<IncomingCallIntent | null>(null);
  const [callUiMinimized, setCallUiMinimized] = useState(false);

  const didPostStartRef = useRef(false);
  const didPostJoinRef = useRef(false);
  const didPostEndRef = useRef(false);
  const endingRef = useRef(false);
  const sessionRef = useRef(session);
  const activeCallsRef = useRef(activeCallsByChat);
  const startedAtRef = useRef<number | null>(startedAt);
  const callKindRef = useRef<CallKind>('direct');
  const dismissedIncomingRef = useRef<Set<string>>(new Set());
  const incomingIntentRef = useRef<IncomingCallIntent | null>(null);
  const queuedActionRef = useRef<QueuedCallAction | null>(null);
  const autoResumeRef = useRef<{ enabled: boolean; chatId: string; callId: string; initiator: boolean }>({
    enabled: false,
    chatId: '',
    callId: '',
    initiator: false,
  });

  const chat = useMemo<Chat | undefined>(() => chats.find((item) => item.id === session.chatId), [chats, session.chatId]);
  const callKind: CallKind = chat?.type === 'GROUP' ? 'group' : 'direct';
  const activeCall = session.chatId ? activeCallsByChat[session.chatId] ?? null : null;

  useEffect(() => {
    sessionRef.current = session;
    activeCallsRef.current = activeCallsByChat;
    startedAtRef.current = startedAt;
    callKindRef.current = callKind;
    incomingIntentRef.current = incomingIntent;
  }, [activeCallsByChat, callKind, incomingIntent, session, startedAt]);

  useEffect(() => {
    const initialSocket = getRealtimeSocket();
    if (initialSocket) {
      setSocket(initialSocket);
    }
    return subscribeRealtimeSocket(setSocket);
  }, []);

  const persistSession = useCallback((next: { chatId: string; callId: string }) => {
    try { window.sessionStorage.setItem(CALL_SESSION_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const persistCallUi = useCallback((next: { minimized: boolean }) => {
    try { window.sessionStorage.setItem(CALL_UI_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const updateCallUiMinimized = useCallback((next: boolean) => {
    setCallUiMinimized(next);
    persistCallUi({ minimized: next });
  }, [persistCallUi]);

  const persistIncomingIntent = useCallback((next: IncomingCallIntent | null) => {
    try {
      if (!next) {
        window.sessionStorage.removeItem(CALL_INTENT_KEY);
        return;
      }
      window.sessionStorage.setItem(CALL_INTENT_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const clearIncomingIntent = useCallback((callId?: string) => {
    const current = incomingIntentRef.current;
    if (callId && current?.callId && current.callId !== callId) return;
    incomingIntentRef.current = null;
    setIncomingIntent(null);
    persistIncomingIntent(null);
  }, [persistIncomingIntent]);

  const armAutoResume = useCallback((next: { chatId: string; callId: string; initiator: boolean }) => {
    autoResumeRef.current = { enabled: true, ...next };
  }, []);

  const disarmAutoResume = useCallback(() => {
    autoResumeRef.current = { enabled: false, chatId: '', callId: '', initiator: false };
  }, []);

  const resetRuntimeFlags = useCallback(() => {
    didPostStartRef.current = false;
    didPostJoinRef.current = false;
    didPostEndRef.current = false;
    endingRef.current = false;
  }, []);

  const captureIncomingIntent = useCallback((next: IncomingCallIntent | null) => {
    if (!next) return;
    if (Date.now() - next.receivedAt > CALL_INTENT_TTL_MS) return;

    incomingIntentRef.current = next;
    setIncomingIntent(next);
    persistIncomingIntent(next);
    dismissedIncomingRef.current.delete(next.callId);

    const currentSession = sessionRef.current;
    if (currentSession.stage === 'idle' || currentSession.callId === next.callId) {
      resetRuntimeFlags();
      setStartedAt(null);
      updateCallUiMinimized(false);
      setSession((prev) => {
        if (prev.stage !== 'idle' && prev.callId !== next.callId) return prev;
        return {
          stage: 'incoming',
          chatId: next.chatId,
          callId: next.callId,
          initiator: false,
          inviterId: next.fromUserId,
          error: '',
        };
      });
    }

    const currentSocket = socket ?? getRealtimeSocket();
    if (currentSocket && !currentSocket.connected) {
      currentSocket.connect();
    }
  }, [persistIncomingIntent, resetRuntimeFlags, socket, updateCallUiMinimized]);

  const flushQueuedAction = useCallback((targetSocket: Socket | null) => {
    const pending = queuedActionRef.current;
    if (!pending || !targetSocket) return;
    if (!targetSocket.connected) targetSocket.connect();
    if (pending.type === 'accept') {
      targetSocket.emit('call:accept', { chatId: pending.chatId, callId: pending.callId });
    } else {
      targetSocket.emit('call:decline', { chatId: pending.chatId, callId: pending.callId });
      if (pending.direct) {
        targetSocket.emit('call:end', { chatId: pending.chatId, callId: pending.callId });
      }
    }
    queuedActionRef.current = null;
  }, []);

  const closeAll = useCallback((opts?: { preserveResume?: boolean; keepIncomingIntent?: boolean }) => {
    try { window.sessionStorage.removeItem(CALL_SESSION_KEY); } catch {}
    if (!opts?.preserveResume) disarmAutoResume();
    if (!opts?.keepIncomingIntent) {
      const activeCallId = sessionRef.current.callId || undefined;
      clearIncomingIntent(activeCallId);
    }
    resetRuntimeFlags();
    updateCallUiMinimized(false);
    setStartedAt(null);
    setSession(createIdleSession());
  }, [clearIncomingIntent, disarmAutoResume, resetRuntimeFlags, updateCallUiMinimized]);

  useEffect(() => {
    try {
      const rawUi = window.sessionStorage.getItem(CALL_UI_KEY);
      if (rawUi) {
        const savedUi = JSON.parse(rawUi) as { minimized?: boolean };
        setCallUiMinimized(Boolean(savedUi?.minimized));
      }
    } catch {}

    try {
      const rawIntent = window.sessionStorage.getItem(CALL_INTENT_KEY);
      if (rawIntent) {
        const savedIntent = normalizeIncomingIntent(JSON.parse(rawIntent), 'storage');
        if (savedIntent) {
          captureIncomingIntent(savedIntent);
        } else {
          window.sessionStorage.removeItem(CALL_INTENT_KEY);
        }
      }
    } catch {}

    const urlIntent = readIncomingIntentFromUrl();
    if (urlIntent) {
      captureIncomingIntent(urlIntent);
      stripIncomingIntentFromUrl();
    }
  }, [captureIncomingIntent]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const type = String(event.data?.type ?? '');
      if (type !== 'incoming_call_notification_click' && type !== 'incoming_call_push') return;

      const source: IncomingCallIntentSource = type === 'incoming_call_notification_click' ? 'service_worker' : 'push';
      const intent = normalizeIncomingIntent(event.data?.intent, source);
      if (!intent) return;
      captureIncomingIntent(intent);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [captureIncomingIntent]);

  useEffect(() => {
    if (!socket) return;
    flushQueuedAction(socket);
  }, [flushQueuedAction, socket]);

  const postSystem = useCallback(async (targetChatId: string, text: string) => {
    if (!targetChatId) return;
    try { await sendMessage({ chatId: targetChatId, type: 'SYSTEM', text }).unwrap(); } catch {}
  }, [sendMessage]);

  const postEndRecord = useCallback(async (targetChatId: string, reason?: string) => {
    if (!targetChatId || didPostEndRef.current) return;
    didPostEndRef.current = true;
    const startedAtValue = startedAtRef.current;
    const duration = formatDuration(startedAtValue);
    const text = startedAtValue ? `Call ended${reason ? `: ${reason}` : ''} (duration: ${duration})` : `Call ended${reason ? `: ${reason}` : ''}`;
    await postSystem(targetChatId, text);
  }, [postSystem]);

  const openExistingCall = useCallback((
    targetChatId: string,
    callId: string,
    options?: { initiator?: boolean; stage?: CallStage; inviterId?: string },
  ) => {
    resetRuntimeFlags();
    setStartedAt(null);
    dismissedIncomingRef.current.delete(callId);
    const initiator = Boolean(options?.initiator);
    const nextStage = options?.stage ?? 'connecting';
    updateCallUiMinimized(false);
    if (nextStage !== 'incoming') clearIncomingIntent(callId);
    armAutoResume({ chatId: targetChatId, callId, initiator });
    setSession({
      stage: nextStage,
      chatId: targetChatId,
      callId,
      initiator,
      inviterId: options?.inviterId ?? '',
      error: '',
    });
    persistSession({ chatId: targetChatId, callId });
    socket?.emit('call:join', { callId });
  }, [armAutoResume, clearIncomingIntent, persistSession, resetRuntimeFlags, socket, updateCallUiMinimized]);

  const startCall = useCallback((targetChatId: string) => {
    if (!socket) return;
    const nextCallId = uuid();
    resetRuntimeFlags();
    setStartedAt(null);
    clearIncomingIntent();
    updateCallUiMinimized(false);
    armAutoResume({ chatId: targetChatId, callId: nextCallId, initiator: true });
    setSession({ stage: 'outgoing', chatId: targetChatId, callId: nextCallId, initiator: true, inviterId: '', error: '' });
    persistSession({ chatId: targetChatId, callId: nextCallId });
    socket.emit('call:invite', { chatId: targetChatId, callId: nextCallId });
  }, [armAutoResume, clearIncomingIntent, persistSession, resetRuntimeFlags, socket, updateCallUiMinimized]);

  const joinCall = useCallback((targetChatId: string) => {
    if (!socket) return;
    const existing = activeCallsByChat[targetChatId];
    if (!existing?.callId) return;
    openExistingCall(targetChatId, existing.callId);
  }, [activeCallsByChat, openExistingCall, socket]);

  const getActiveCallId = useCallback((targetChatId: string) => activeCallsByChat[targetChatId]?.callId ?? null, [activeCallsByChat]);
  const hasReturnableCall = useCallback((targetChatId: string) => Boolean(activeCallsByChat[targetChatId]?.callId), [activeCallsByChat]);

  const accept = useCallback(() => {
    if (!session.chatId || !session.callId) return;
    dismissedIncomingRef.current.delete(session.callId);
    armAutoResume({ chatId: session.chatId, callId: session.callId, initiator: false });
    clearIncomingIntent(session.callId);
    updateCallUiMinimized(false);
    persistSession({ chatId: session.chatId, callId: session.callId });
    setSession((prev) => ({ ...prev, stage: 'connecting', error: '' }));
    if (!socket) {
      queuedActionRef.current = { type: 'accept', chatId: session.chatId, callId: session.callId, direct: false };
      return;
    }
    if (!socket.connected) socket.connect();
    socket.emit('call:accept', { chatId: session.chatId, callId: session.callId });
  }, [armAutoResume, clearIncomingIntent, persistSession, session.callId, session.chatId, socket, updateCallUiMinimized]);

  const decline = useCallback(() => {
    if (!session.chatId || !session.callId) return;
    dismissedIncomingRef.current.add(session.callId);
    clearIncomingIntent(session.callId);
    updateCallUiMinimized(false);
    if (!socket) {
      queuedActionRef.current = { type: 'decline', chatId: session.chatId, callId: session.callId, direct: callKind === 'direct' };
    } else {
      if (!socket.connected) socket.connect();
      socket.emit('call:decline', { chatId: session.chatId, callId: session.callId });
    }
    disarmAutoResume();
    if (callKind === 'direct') {
      socket?.emit('call:end', { chatId: session.chatId, callId: session.callId });
      void postSystem(session.chatId, 'Missed call');
    }
    closeAll();
  }, [socket, session.chatId, session.callId, callKind, clearIncomingIntent, closeAll, disarmAutoResume, postSystem, updateCallUiMinimized]);

  const hangup = useCallback(async (reason?: string) => {
    if (!session.chatId || !session.callId) return closeAll();
    if (endingRef.current) return;
    clearIncomingIntent(session.callId);
    disarmAutoResume();
    updateCallUiMinimized(false);
    endingRef.current = true;
    setSession((prev) => ({ ...prev, stage: 'ending' }));
    socket?.emit('call:leave', { callId: session.callId });
    if (callKind === 'direct') socket?.emit('call:end', { chatId: session.chatId, callId: session.callId });
    await postEndRecord(session.chatId, reason);
    closeAll();
  }, [callKind, clearIncomingIntent, closeAll, disarmAutoResume, postEndRecord, session.callId, session.chatId, socket, updateCallUiMinimized]);

  useEffect(() => {
    if (!socket) return;

    const onInvite = (payload: any) => {
      const nextChatId = String(payload?.chatId ?? '');
      const nextCallId = String(payload?.callId ?? '');
      const nextFromUserId = String(payload?.fromUserId ?? '');
      const nextKind: CallKind = payload?.kind === 'group' ? 'group' : 'direct';
      if (!nextChatId || !nextCallId) return;
      const currentSession = sessionRef.current;
      if (currentSession.stage !== 'idle' && currentSession.chatId !== nextChatId) return;
      dismissedIncomingRef.current.delete(nextCallId);
      resetRuntimeFlags();
      setStartedAt(null);
      updateCallUiMinimized(false);
      captureIncomingIntent({
        chatId: nextChatId,
        callId: nextCallId,
        fromUserId: nextFromUserId,
        kind: nextKind,
        receivedAt: Date.now(),
        source: 'push',
      });
      setSession({ stage: 'incoming', chatId: nextChatId, callId: nextCallId, initiator: false, inviterId: nextFromUserId, error: '' });
    };

    const onAccept = (payload: any) => {
      const currentSession = sessionRef.current;
      if (String(payload?.chatId ?? '') !== currentSession.chatId) return;
      if (String(payload?.callId ?? '') !== currentSession.callId) return;
      clearIncomingIntent(currentSession.callId);
      setSession((prev) => ({ ...prev, stage: prev.stage === 'outgoing' ? 'connecting' : prev.stage, error: '' }));
    };

    const onDecline = (payload: any) => {
      const currentSession = sessionRef.current;
      if (String(payload?.chatId ?? '') !== currentSession.chatId) return;
      if (String(payload?.callId ?? '') !== currentSession.callId) return;
      if (callKindRef.current !== 'direct' || currentSession.stage !== 'outgoing') return;
      disarmAutoResume();
      clearIncomingIntent(currentSession.callId);
      void postSystem(currentSession.chatId, 'Missed call');
      closeAll();
    };

    const onEnd = (payload: any) => {
      const payloadCallId = String(payload?.callId ?? '');
      const currentSession = sessionRef.current;
      if (!payloadCallId || payloadCallId !== currentSession.callId || currentSession.stage === 'idle') return;
      disarmAutoResume();
      clearIncomingIntent(payloadCallId);
      if (endingRef.current) return closeAll();
      endingRef.current = true;
      void postEndRecord(currentSession.chatId);
      closeAll();
    };

    const onState = (payload: any) => {
      const nextChatId = String(payload?.chatId ?? '');
      if (!nextChatId) return;
      const normalized = normalizeCallState(payload);
      setActiveCallsByChat((prev) => {
        if (!normalized) {
          if (!prev[nextChatId]) return prev;
          const next = { ...prev };
          delete next[nextChatId];
          return next;
        }
        return { ...prev, [nextChatId]: normalized };
      });
    };

    const onAlreadyActive = (payload: any) => {
      const nextChatId = String(payload?.chatId ?? '');
      const existingCallId = String(payload?.callId ?? '');
      if (!nextChatId || !existingCallId) return;
      openExistingCall(nextChatId, existingCallId);
    };

    const onRoomFull = (payload: any) => {
      const currentSession = sessionRef.current;
      if (String(payload?.chatId ?? '') !== currentSession.chatId) return;
      if (String(payload?.callId ?? '') !== currentSession.callId) return;
      disarmAutoResume();
      clearIncomingIntent(currentSession.callId);
      setSession((prev) => ({ ...prev, stage: 'failed', error: 'Call room is full' }));
      void postSystem(currentSession.chatId, 'Call room is full');
      window.setTimeout(() => closeAll(), 1200);
    };

    const onCallError = (payload: any) => {
      const currentSession = sessionRef.current;
      const payloadCallId = String(payload?.callId ?? '');
      const payloadChatId = String(payload?.chatId ?? '');
      if (currentSession.callId && payloadCallId && payloadCallId !== currentSession.callId) return;
      if (currentSession.chatId && payloadChatId && payloadChatId !== currentSession.chatId) return;
      const message = String(payload?.message ?? 'Call action failed');
      setSession((prev) => (prev.stage === 'idle' ? prev : { ...prev, error: message }));
    };

    socket.on('call:invite', onInvite);
    socket.on('call:accept', onAccept);
    socket.on('call:decline', onDecline);
    socket.on('call:end', onEnd);
    socket.on('call:state', onState);
    socket.on('call:already_active', onAlreadyActive);
    socket.on('call:room_full', onRoomFull);
    socket.on('call:error', onCallError);
    return () => {
      socket.off('call:invite', onInvite);
      socket.off('call:accept', onAccept);
      socket.off('call:decline', onDecline);
      socket.off('call:end', onEnd);
      socket.off('call:state', onState);
      socket.off('call:already_active', onAlreadyActive);
      socket.off('call:room_full', onRoomFull);
      socket.off('call:error', onCallError);
    };
  }, [socket, captureIncomingIntent, clearIncomingIntent, closeAll, disarmAutoResume, openExistingCall, postEndRecord, postSystem, resetRuntimeFlags, updateCallUiMinimized]);

  useEffect(() => {
    if (session.stage !== 'outgoing' || !session.initiator || didPostStartRef.current) return;
    if (activeCallsByChat[session.chatId]?.callId !== session.callId) return;
    didPostStartRef.current = true;
    void postSystem(session.chatId, callKind === 'group' ? 'Started a group call' : 'Started a call');
  }, [activeCallsByChat, session, callKind, postSystem]);

  useEffect(() => {
    if (!activeCall || didPostJoinRef.current || session.stage !== 'connecting' || session.initiator) return;
    didPostJoinRef.current = true;
    void postSystem(session.chatId, 'Joined the call');
  }, [activeCall, postSystem, session]);

  useEffect(() => {
    if (!socket || session.stage !== 'idle') return;
    try {
      const raw = window.sessionStorage.getItem(CALL_SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { chatId?: string; callId?: string };
      const savedChatId = typeof saved?.chatId === 'string' ? saved.chatId : '';
      const savedCallId = typeof saved?.callId === 'string' ? saved.callId : '';
      if (!savedChatId || !savedCallId) return;
      const active = activeCallsByChat[savedChatId];
      if (active?.callId === savedCallId) {
        openExistingCall(savedChatId, savedCallId);
        return;
      }
      if (!socket.connected) socket.connect();
      socket.emit('call:join', { callId: savedCallId, reason: 'refresh_restore' });
    } catch {}
  }, [activeCallsByChat, openExistingCall, session.stage, socket]);


  useEffect(() => {
    if (session.stage !== 'idle') return;
    const pending = autoResumeRef.current;
    if (!pending.enabled || !socket) return;
    const active = activeCallsByChat[pending.chatId];
    if (!active || active.callId !== pending.callId) return;
    const stage: CallStage = pending.initiator && active.kind === 'direct' && active.participants.length <= 1 ? 'outgoing' : 'connecting';
    const timer = window.setTimeout(() => {
      const current = sessionRef.current;
      const latest = activeCallsRef.current[pending.chatId];
      if (current.stage !== 'idle') return;
      if (!autoResumeRef.current.enabled) return;
      if (!latest || latest.callId !== pending.callId) return;
      openExistingCall(pending.chatId, pending.callId, { initiator: pending.initiator, stage });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeCallsByChat, openExistingCall, session.stage, socket]);

  useEffect(() => {
    if (!meId || session.stage !== 'idle') return;

    const pendingCalls = Object.values(activeCallsByChat)
      .filter((call) => {
        if (!call.active || !call.callId) return false;
        if (dismissedIncomingRef.current.has(call.callId)) return false;
        if (call.createdBy === meId) return false;
        return !call.participants.some((participant) => participant.userId === meId);
      })
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime());

    const intentMatch = incomingIntentRef.current
      ? pendingCalls.find((call) => (
          call.chatId === incomingIntentRef.current?.chatId &&
          call.callId === incomingIntentRef.current?.callId
        )) ?? null
      : null;
    const pendingIncoming = intentMatch ?? pendingCalls[0] ?? null;

    if (!pendingIncoming) return;

    resetRuntimeFlags();
    setStartedAt(null);
    updateCallUiMinimized(false);
    setSession({
      stage: 'incoming',
      chatId: pendingIncoming.chatId,
      callId: pendingIncoming.callId,
      initiator: false,
      inviterId: pendingIncoming.createdBy ?? '',
      error: '',
    });
  }, [activeCallsByChat, meId, resetRuntimeFlags, session.stage, updateCallUiMinimized]);

  useEffect(() => {
    if (!incomingIntent) return;
    const active = activeCallsByChat[incomingIntent.chatId];
    if (active?.callId === incomingIntent.callId) return;
    if (session.stage !== 'incoming' || session.callId !== incomingIntent.callId) return;

    const remaining = Math.max(0, CALL_INTENT_TTL_MS - (Date.now() - incomingIntent.receivedAt));
    const timer = window.setTimeout(() => {
      const latestIntent = incomingIntentRef.current;
      const latestSession = sessionRef.current;
      const latestActive = activeCallsRef.current[incomingIntent.chatId];
      if (!latestIntent || latestIntent.callId !== incomingIntent.callId) return;
      if (latestActive?.callId === incomingIntent.callId) return;
      if (latestSession.stage === 'incoming' && latestSession.callId === incomingIntent.callId) {
        clearIncomingIntent(incomingIntent.callId);
        resetRuntimeFlags();
        updateCallUiMinimized(false);
        setStartedAt(null);
        setSession(createIdleSession());
      }
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [activeCallsByChat, clearIncomingIntent, incomingIntent, resetRuntimeFlags, session.callId, session.stage, updateCallUiMinimized]);

  const handleConnectionPhase = useCallback((phase: 'stable' | 'signaling_reconnecting' | 'media_reconnecting') => {
    setSession((prev) => {
      if (prev.stage === 'idle' || prev.stage === 'ending' || prev.stage === 'ended' || prev.stage === 'failed') return prev;
      if (phase === 'stable') return prev.stage === 'in_call' ? prev : { ...prev, stage: 'in_call', error: '' };
      return prev.stage === 'reconnecting' ? prev : { ...prev, stage: 'reconnecting' };
    });
  }, []);

  useEffect(() => {
    if (!socket) return;
    flushQueuedAction(socket);
    const onDisconnect = () => {
      if (!sessionRef.current.callId || sessionRef.current.stage === 'idle') return;
      setSession((prev) => (prev.stage === 'idle' || prev.stage === 'ending' || prev.stage === 'ended' ? prev : { ...prev, stage: 'reconnecting' }));
    };
    const onConnect = () => {
      flushQueuedAction(socket);
      if (!sessionRef.current.callId || sessionRef.current.stage === 'idle') return;
      setSession((prev) => (prev.stage === 'reconnecting' ? { ...prev, stage: 'connecting' } : prev));
    };
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [flushQueuedAction, socket]);

  useEffect(() => {
    if (!socket) return;

    const ensureRealtime = () => {
      const currentSession = sessionRef.current;
      if (!currentSession.callId && !incomingIntentRef.current) return;
      if (!socket.connected) socket.connect();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      ensureRealtime();
    };

    const onPageShow = () => {
      ensureRealtime();
    };

    const onOnline = () => {
      ensureRealtime();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, [socket]);

  const ctx = useMemo<CallContextValue>(() => ({ startCall, joinCall, getActiveCallId, hasReturnableCall }), [startCall, joinCall, getActiveCallId, hasReturnableCall]);

  return (
    <CallContext.Provider value={ctx}>
      {children}
      <IncomingCallToast
        open={session.stage === 'incoming'}
        chat={chat}
        fromUserId={session.inviterId}
        participantIds={(activeCall?.participants ?? []).map((participant) => participant.userId)}
        onAccept={accept}
        onDecline={decline}
      />
      <CallScreen
        open={['outgoing', 'connecting', 'in_call', 'reconnecting', 'ending', 'failed'].includes(session.stage)}
        minimized={callUiMinimized}
        stage={session.stage}
        chat={chat}
        callId={session.callId}
        initiator={session.initiator}
        onConnected={() => {
          clearIncomingIntent(session.callId);
          setStartedAt((value) => value ?? Date.now());
          setSession((prev) => ({ ...prev, stage: 'in_call', error: '' }));
        }}
        onConnectionPhase={handleConnectionPhase}
        onMinimize={() => updateCallUiMinimized(true)}
        onRestore={() => updateCallUiMinimized(false)}
        onHangup={(reason) => void hangup(reason)}
        onClose={closeAll}
      />
    </CallContext.Provider>
  );
}
