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

  const didPostStartRef = useRef(false);
  const didPostJoinRef = useRef(false);
  const didPostEndRef = useRef(false);
  const endingRef = useRef(false);
  const sessionRef = useRef(session);
  const activeCallsRef = useRef(activeCallsByChat);
  const startedAtRef = useRef<number | null>(startedAt);
  const callKindRef = useRef<CallKind>('direct');
  const dismissedIncomingRef = useRef<Set<string>>(new Set());
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
  }, [activeCallsByChat, callKind, session, startedAt]);

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

  const closeAll = useCallback((opts?: { preserveResume?: boolean }) => {
    try { window.sessionStorage.removeItem(CALL_SESSION_KEY); } catch {}
    if (!opts?.preserveResume) disarmAutoResume();
    resetRuntimeFlags();
    setStartedAt(null);
    setSession(createIdleSession());
  }, [disarmAutoResume, resetRuntimeFlags]);

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

  const openExistingCall = useCallback((targetChatId: string, callId: string, options?: { initiator?: boolean; stage?: CallStage }) => {
    resetRuntimeFlags();
    setStartedAt(null);
    dismissedIncomingRef.current.delete(callId);
    const initiator = Boolean(options?.initiator);
    const nextStage = options?.stage ?? 'connecting';
    armAutoResume({ chatId: targetChatId, callId, initiator });
    setSession({ stage: nextStage, chatId: targetChatId, callId, initiator, inviterId: '', error: '' });
    persistSession({ chatId: targetChatId, callId });
    socket?.emit('call:join', { callId });
  }, [armAutoResume, persistSession, resetRuntimeFlags, socket]);

  const startCall = useCallback((targetChatId: string) => {
    if (!socket) return;
    const nextCallId = uuid();
    resetRuntimeFlags();
    setStartedAt(null);
    armAutoResume({ chatId: targetChatId, callId: nextCallId, initiator: true });
    setSession({ stage: 'outgoing', chatId: targetChatId, callId: nextCallId, initiator: true, inviterId: '', error: '' });
    persistSession({ chatId: targetChatId, callId: nextCallId });
    socket.emit('call:invite', { chatId: targetChatId, callId: nextCallId });
  }, [armAutoResume, persistSession, resetRuntimeFlags, socket]);

  const joinCall = useCallback((targetChatId: string) => {
    if (!socket) return;
    const existing = activeCallsByChat[targetChatId];
    if (!existing?.callId) return;
    openExistingCall(targetChatId, existing.callId);
  }, [activeCallsByChat, openExistingCall, socket]);

  const getActiveCallId = useCallback((targetChatId: string) => activeCallsByChat[targetChatId]?.callId ?? null, [activeCallsByChat]);
  const hasReturnableCall = useCallback((targetChatId: string) => Boolean(activeCallsByChat[targetChatId]?.callId), [activeCallsByChat]);

  const accept = useCallback(() => {
    if (!socket || !session.chatId || !session.callId) return;
    dismissedIncomingRef.current.delete(session.callId);
    armAutoResume({ chatId: session.chatId, callId: session.callId, initiator: false });
    socket.emit('call:accept', { chatId: session.chatId, callId: session.callId });
    persistSession({ chatId: session.chatId, callId: session.callId });
    setSession((prev) => ({ ...prev, stage: 'connecting', error: '' }));
  }, [armAutoResume, persistSession, session.callId, session.chatId, socket]);

  const decline = useCallback(() => {
    if (!socket || !session.chatId || !session.callId) return;
    dismissedIncomingRef.current.add(session.callId);
    socket.emit('call:decline', { chatId: session.chatId, callId: session.callId });
    disarmAutoResume();
    if (callKind === 'direct') {
      socket.emit('call:end', { chatId: session.chatId, callId: session.callId });
      void postSystem(session.chatId, 'Missed call');
    }
    closeAll();
  }, [socket, session.chatId, session.callId, callKind, closeAll, disarmAutoResume, postSystem]);

  const hangup = useCallback(async (reason?: string) => {
    if (!session.chatId || !session.callId) return closeAll();
    if (endingRef.current) return;
    disarmAutoResume();
    endingRef.current = true;
    setSession((prev) => ({ ...prev, stage: 'ending' }));
    socket?.emit('call:leave', { callId: session.callId });
    if (callKind === 'direct') socket?.emit('call:end', { chatId: session.chatId, callId: session.callId });
    await postEndRecord(session.chatId, reason);
    closeAll();
  }, [callKind, closeAll, disarmAutoResume, postEndRecord, session.callId, session.chatId, socket]);

  useEffect(() => {
    if (!socket) return;

    const onInvite = (payload: any) => {
      const nextChatId = String(payload?.chatId ?? '');
      const nextCallId = String(payload?.callId ?? '');
      const nextFromUserId = String(payload?.fromUserId ?? '');
      if (!nextChatId || !nextCallId) return;
      const currentSession = sessionRef.current;
      if (currentSession.stage !== 'idle' && currentSession.chatId !== nextChatId) return;
      dismissedIncomingRef.current.delete(nextCallId);
      resetRuntimeFlags();
      setStartedAt(null);
      setSession({ stage: 'incoming', chatId: nextChatId, callId: nextCallId, initiator: false, inviterId: nextFromUserId, error: '' });
    };

    const onAccept = (payload: any) => {
      const currentSession = sessionRef.current;
      if (String(payload?.chatId ?? '') !== currentSession.chatId) return;
      if (String(payload?.callId ?? '') !== currentSession.callId) return;
      setSession((prev) => ({ ...prev, stage: prev.stage === 'outgoing' ? 'connecting' : prev.stage, error: '' }));
    };

    const onDecline = (payload: any) => {
      const currentSession = sessionRef.current;
      if (String(payload?.chatId ?? '') !== currentSession.chatId) return;
      if (String(payload?.callId ?? '') !== currentSession.callId) return;
      if (callKindRef.current !== 'direct' || currentSession.stage !== 'outgoing') return;
      disarmAutoResume();
      void postSystem(currentSession.chatId, 'Missed call');
      closeAll();
    };

    const onEnd = (payload: any) => {
      const payloadCallId = String(payload?.callId ?? '');
      const currentSession = sessionRef.current;
      if (!payloadCallId || payloadCallId !== currentSession.callId || currentSession.stage === 'idle') return;
      disarmAutoResume();
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
  }, [socket, closeAll, disarmAutoResume, openExistingCall, postEndRecord, postSystem, resetRuntimeFlags]);

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

    const pendingIncoming = Object.values(activeCallsByChat)
      .filter((call) => {
        if (!call.active || !call.callId) return false;
        if (dismissedIncomingRef.current.has(call.callId)) return false;
        if (call.createdBy === meId) return false;
        return !call.participants.some((participant) => participant.userId === meId);
      })
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())[0];

    if (!pendingIncoming) return;

    resetRuntimeFlags();
    setStartedAt(null);
    setSession({
      stage: 'incoming',
      chatId: pendingIncoming.chatId,
      callId: pendingIncoming.callId,
      initiator: false,
      inviterId: pendingIncoming.createdBy ?? '',
      error: '',
    });
  }, [activeCallsByChat, meId, resetRuntimeFlags, session.stage]);

  const handleConnectionPhase = useCallback((phase: 'stable' | 'signaling_reconnecting' | 'media_reconnecting') => {
    setSession((prev) => {
      if (prev.stage === 'idle' || prev.stage === 'ending' || prev.stage === 'ended' || prev.stage === 'failed') return prev;
      if (phase === 'stable') return prev.stage === 'in_call' ? prev : { ...prev, stage: 'in_call', error: '' };
      return prev.stage === 'reconnecting' ? prev : { ...prev, stage: 'reconnecting' };
    });
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onDisconnect = () => {
      if (!sessionRef.current.callId || sessionRef.current.stage === 'idle') return;
      setSession((prev) => (prev.stage === 'idle' || prev.stage === 'ending' || prev.stage === 'ended' ? prev : { ...prev, stage: 'reconnecting' }));
    };
    const onConnect = () => {
      if (!sessionRef.current.callId || sessionRef.current.stage === 'idle') return;
      setSession((prev) => (prev.stage === 'reconnecting' ? { ...prev, stage: 'connecting' } : prev));
    };
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
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
        stage={session.stage}
        chat={chat}
        callId={session.callId}
        initiator={session.initiator}
        onConnected={() => {
          setStartedAt((value) => value ?? Date.now());
          setSession((prev) => ({ ...prev, stage: 'in_call', error: '' }));
        }}
        onConnectionPhase={handleConnectionPhase}
        onHangup={(reason) => void hangup(reason)}
        onClose={closeAll}
      />
    </CallContext.Provider>
  );
}
