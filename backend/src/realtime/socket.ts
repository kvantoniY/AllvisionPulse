import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "../db/prisma";
import { getEnv } from "../config/env";

type OnlineMap = Map<string, { sockets: Set<string>; lastSeenAt: Date }>;
type PresenceRuntimeState = "online" | "reconnecting" | "disconnected";
type ParticipantRuntimeState = "joined" | "reconnecting";

type ActiveCallParticipant = {
  userId: string;
  joinedAt: string;
  state: ParticipantRuntimeState;
  sockets: Set<string>;
  leftAt: string | null;
};

type ActiveCall = {
  callId: string;
  chatId: string;
  createdBy: string;
  createdAt: string;
  kind: "direct" | "group";
  participants: Map<string, ActiveCallParticipant>;
  invitedUserIds: Set<string>;
  screenShareBy: string | null;
};

type PendingDisconnect = {
  timer: NodeJS.Timeout;
  deadlineAt: string;
};

const env = getEnv();
const MAX_CALL_PARTICIPANTS = Math.max(2, env.CALL_MAX_PARTICIPANTS);
const RECONNECT_GRACE_MS = Math.max(5000, env.CALL_RECONNECT_GRACE_MS);
const PRESENCE_RECONNECT_GRACE_MS = RECONNECT_GRACE_MS;

function logCall(scope: string, payload: Record<string, unknown>) {
  try {
    console.info(`[call:${scope}]`, JSON.stringify(payload));
  } catch {
    console.info(`[call:${scope}]`, payload);
  }
}

function logPresence(scope: string, payload: Record<string, unknown>) {
  try {
    console.info(`[presence:${scope}]`, JSON.stringify(payload));
  } catch {
    console.info(`[presence:${scope}]`, payload);
  }
}

export function createSocket(io: Server) {
  const online: OnlineMap = new Map();
  const activeCalls = new Map<string, ActiveCall>();
  const activeCallIdByChatId = new Map<string, string>();
  const pendingCallInvites = new Set<string>();
  const pendingDisconnects = new Map<string, PendingDisconnect>();
  const pendingPresenceDisconnects = new Map<string, PendingDisconnect>();

  function pendingKey(callId: string, userId: string) {
    return `${callId}:${userId}`;
  }

  async function isChatMember(chatId: string, userId: string): Promise<boolean> {
    if (!chatId || !userId) return false;
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { leftAt: true },
    });
    return Boolean(member && !member.leftAt);
  }

  async function getChatMemberUserIds(chatId: string): Promise<string[]> {
    const members = await prisma.chatMember.findMany({
      where: { chatId, leftAt: null },
      select: { userId: true },
    });
    return members.map((m: { userId: string }) => m.userId);
  }

  async function getChatType(chatId: string): Promise<"direct" | "group"> {
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
    return chat?.type === "GROUP" ? "group" : "direct";
  }

  async function emitToChatMembers(chatId: string, event: string, payload: any) {
    const userIds = await getChatMemberUserIds(chatId);
    for (const uid of userIds) io.to(`user:${uid}`).emit(event, payload);
  }

  async function emitToChatMembersExcept(chatId: string, exceptUserId: string, event: string, payload: any) {
    const userIds = await getChatMemberUserIds(chatId);
    for (const uid of userIds) {
      if (uid === exceptUserId) continue;
      io.to(`user:${uid}`).emit(event, payload);
    }
  }

  function serializeCall(call: ActiveCall | null, chatId: string) {
    return {
      chatId,
      callId: call?.callId ?? null,
      active: !!call,
      createdBy: call?.createdBy ?? null,
      createdAt: call?.createdAt ?? null,
      kind: call?.kind ?? null,
      screenShareBy: call?.screenShareBy ?? null,
      participants: call
        ? Array.from(call.participants.values()).map((participant) => ({
            userId: participant.userId,
            joinedAt: participant.joinedAt,
            state: participant.state,
            leftAt: participant.leftAt,
          }))
        : [],
    };
  }

  async function emitCallState(chatId: string, callId: string | null) {
    const call = callId ? activeCalls.get(callId) ?? null : null;
    const payload = serializeCall(call, chatId);
    io.to(`chat:${chatId}`).emit("call:state", payload);
    await emitToChatMembers(chatId, "call:state", payload);
  }

  function getRuntimeParticipant(call: ActiveCall, userId: string) {
    return call.participants.get(userId) ?? null;
  }

  function presenceStateForUser(userId: string): PresenceRuntimeState {
    const onlineEntry = online.get(userId);
    if (onlineEntry?.sockets.size) return "online";
    if (pendingPresenceDisconnects.has(userId)) return "reconnecting";
    return "disconnected";
  }

  function getPresenceSnapshot(userIds: string[]): Record<string, PresenceRuntimeState> {
    const out: Record<string, PresenceRuntimeState> = {};
    for (const userId of userIds) out[userId] = presenceStateForUser(userId);
    return out;
  }

  function emitCallError(socket: any, code: string, message: string, extra?: Record<string, unknown>) {
    socket.emit("call:error", { code, message, at: new Date().toISOString(), ...(extra ?? {}) });
  }

  async function ensureSocketChatAccess(socket: any, userId: string, chatId: string, code = "CALL_CHAT_ACCESS_DENIED") {
    const cachedChats: Set<string> | undefined = socket.data?.chatIds;
    let allowed = Boolean(cachedChats?.has(chatId));
    if (!allowed) {
      allowed = await isChatMember(chatId, userId);
      if (allowed) {
        const next = cachedChats ?? new Set<string>();
        next.add(chatId);
        socket.data.chatIds = next;
      }
    }
    if (!allowed) {
      emitCallError(socket, code, "User is not a member of this chat.", { chatId });
      logCall("auth-denied", { userId, chatId, code });
      return false;
    }
    return true;
  }

  async function ensureJoinableCall(socket: any, userId: string, callId: string, reason: string) {
    const call = activeCalls.get(callId);
    if (!call) {
      emitCallError(socket, "CALL_NOT_FOUND", "Active call not found.", { callId });
      return null;
    }
    const canAccessChat = await ensureSocketChatAccess(socket, userId, call.chatId);
    if (!canAccessChat) return null;
    const invited = call.invitedUserIds.has(userId) || call.createdBy === userId || call.participants.has(userId);
    if (!invited) {
      emitCallError(socket, "CALL_JOIN_FORBIDDEN", "User is not invited to this call.", { callId, chatId: call.chatId, reason });
      logCall("join-forbidden", { userId, callId, chatId: call.chatId, reason });
      return null;
    }
    return call;
  }

  async function ensureParticipantCall(socket: any, userId: string, callId: string, reason: string) {
    const call = activeCalls.get(callId);
    if (!call) {
      emitCallError(socket, "CALL_NOT_FOUND", "Active call not found.", { callId });
      return null;
    }
    const canAccessChat = await ensureSocketChatAccess(socket, userId, call.chatId);
    if (!canAccessChat) return null;
    const participant = getRuntimeParticipant(call, userId);
    if (!participant) {
      emitCallError(socket, "CALL_PARTICIPANT_REQUIRED", "Only active call participants can perform this action.", {
        callId,
        chatId: call.chatId,
        reason,
      });
      logCall("participant-required", { userId, callId, chatId: call.chatId, reason });
      return null;
    }
    return call;
  }

  function hasLiveSocketInRoom(callId: string, userId: string, excludeSocketId?: string): boolean {
    const room = io.sockets.adapter.rooms.get(`call:${callId}`);
    if (!room) return false;
    for (const sid of room) {
      if (excludeSocketId && sid === excludeSocketId) continue;
      const s = io.sockets.sockets.get(sid);
      const uid = (s as any)?.user?.id;
      if (uid === userId) return true;
    }
    return false;
  }

  function bindSocketToParticipant(call: ActiveCall, userId: string, socketId: string) {
    const now = new Date().toISOString();
    const existing = getRuntimeParticipant(call, userId);
    if (existing) {
      existing.sockets.add(socketId);
      existing.state = "joined";
      existing.leftAt = null;
      return existing;
    }

    const participant: ActiveCallParticipant = {
      userId,
      joinedAt: now,
      state: "joined",
      sockets: new Set([socketId]),
      leftAt: null,
    };
    call.participants.set(userId, participant);
    return participant;
  }

  function detachSocketFromParticipant(callId: string, userId: string, socketId: string) {
    const call = activeCalls.get(callId);
    if (!call) return;
    const participant = getRuntimeParticipant(call, userId);
    if (!participant) return;
    participant.sockets.delete(socketId);
  }

  async function removeParticipantFromCall(callId: string, userId: string, reason: "left" | "disconnect") {
    const key = pendingKey(callId, userId);
    const pending = pendingDisconnects.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      pendingDisconnects.delete(key);
    }

    const call = activeCalls.get(callId);
    if (!call) return;

    const participant = getRuntimeParticipant(call, userId);
    if (!participant) return;

    call.participants.delete(userId);
    if (call.screenShareBy === userId) {
      call.screenShareBy = null;
      io.to(`call:${callId}`).emit("call:screen_share_stopped", { callId, userId, at: new Date().toISOString(), reason });
    }

    if (call.participants.size === 0) {
      activeCalls.delete(callId);
      activeCallIdByChatId.delete(call.chatId);
      await emitCallState(call.chatId, null);
      io.to(`call:${callId}`).emit("call:end", { callId, chatId: call.chatId, byUserId: userId, at: new Date().toISOString() });
      logCall("ended-empty", { callId, chatId: call.chatId, byUserId: userId, reason });
      return;
    }

    await emitCallState(call.chatId, callId);
  }

  function cancelPendingDisconnect(callId: string, userId: string) {
    const key = pendingKey(callId, userId);
    const pending = pendingDisconnects.get(key);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingDisconnects.delete(key);
    io.to(`call:${callId}`).emit("call:peer_reconnected", {
      callId,
      userId,
      at: new Date().toISOString(),
      phase: "signaling_recovered",
    });
    const call = activeCalls.get(callId);
    const participant = call ? getRuntimeParticipant(call, userId) : null;
    if (participant) participant.state = "joined";
    return true;
  }

  function scheduleDisconnect(callId: string, userId: string) {
    const call = activeCalls.get(callId);
    if (!call) return;
    const key = pendingKey(callId, userId);
    if (pendingDisconnects.has(key)) return;

    const participant = getRuntimeParticipant(call, userId);
    if (!participant) return;
    participant.state = "reconnecting";

    const deadlineAt = new Date(Date.now() + RECONNECT_GRACE_MS).toISOString();
    io.to(`call:${callId}`).emit("call:peer_reconnecting", {
      callId,
      userId,
      chatId: call.chatId,
      at: new Date().toISOString(),
      deadlineAt,
      phase: "signaling_lost",
    });
    void emitCallState(call.chatId, callId);
    logCall("peer-reconnecting", { callId, chatId: call.chatId, userId, deadlineAt });

    const timer = setTimeout(() => {
      pendingDisconnects.delete(key);
      if (hasLiveSocketInRoom(callId, userId)) return;
      io.to(`call:${callId}`).emit("call:peer_left", { callId, userId, at: new Date().toISOString(), reason: "disconnect-timeout" });
      void removeParticipantFromCall(callId, userId, "disconnect");
    }, RECONNECT_GRACE_MS);

    pendingDisconnects.set(key, { timer, deadlineAt });
  }

  function clearPendingDisconnectsForCall(callId: string) {
    for (const [key, value] of pendingDisconnects.entries()) {
      if (!key.startsWith(`${callId}:`)) continue;
      clearTimeout(value.timer);
      pendingDisconnects.delete(key);
    }
  }

  function cancelPendingPresenceDisconnect(userId: string) {
    const pending = pendingPresenceDisconnects.get(userId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pendingPresenceDisconnects.delete(userId);
    return true;
  }

  function schedulePresenceOffline(userId: string) {
    if (pendingPresenceDisconnects.has(userId)) return;
    const deadlineAt = new Date(Date.now() + PRESENCE_RECONNECT_GRACE_MS).toISOString();
    io.emit("presence:reconnecting", { userId, deadlineAt, at: new Date().toISOString() });
    logPresence("reconnecting", { userId, deadlineAt });
    const timer = setTimeout(async () => {
      pendingPresenceDisconnects.delete(userId);
      const ent = online.get(userId);
      if (ent?.sockets.size) return;
      const lastSeenAt = new Date();
      if (ent) {
        ent.lastSeenAt = lastSeenAt;
        online.set(userId, ent);
      } else {
        online.set(userId, { sockets: new Set(), lastSeenAt });
      }
      await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => null);
      io.emit("presence:offline", { userId, lastSeenAt: lastSeenAt.toISOString() });
      logPresence("offline", { userId, lastSeenAt: lastSeenAt.toISOString() });
    }, PRESENCE_RECONNECT_GRACE_MS);
    pendingPresenceDisconnects.set(userId, { timer, deadlineAt });
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.toString()?.replace("Bearer ", "");
    if (!token) return next(new Error("UNAUTHORIZED"));
    try {
      const payload = verifyAccessToken(token);
      (socket as any).user = { id: payload.sub, role: payload.role };
      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", async (socket) => {
    const user = (socket as any).user as { id: string; role: string };
    const userId = user.id;

    socket.join(`user:${userId}`);

    const entry = online.get(userId) ?? { sockets: new Set(), lastSeenAt: new Date() };
    const hadNoSocketsBefore = entry.sockets.size === 0;
    entry.sockets.add(socket.id);
    online.set(userId, entry);
    const presenceRecovered = cancelPendingPresenceDisconnect(userId);
    if (hadNoSocketsBefore || presenceRecovered) {
      io.emit("presence:online", { userId, at: new Date().toISOString() });
      logPresence("online", { userId, recovered: presenceRecovered });
    }

    const memberships = await prisma.chatMember.findMany({ where: { userId, leftAt: null }, select: { chatId: true } });
    socket.data.chatIds = new Set(memberships.map((m: { chatId: string }) => m.chatId));
    memberships.forEach((m: { chatId: string }) => socket.join(`chat:${m.chatId}`));

    try {
      const chatIds = new Set(memberships.map((m: { chatId: string }) => m.chatId));
      for (const chatId of chatIds) {
        const callId = activeCallIdByChatId.get(chatId);
        const call = callId ? activeCalls.get(callId) ?? null : null;
        if (callId && !call) activeCallIdByChatId.delete(chatId);
        io.to(`user:${userId}`).emit("call:state", serializeCall(call, chatId));
      }
    } catch {
      // ignore
    }

    socket.on("chat:join", async (chatId: string) => {
      if (!(await ensureSocketChatAccess(socket, userId, String(chatId), "CHAT_JOIN_FORBIDDEN"))) return;
      socket.join(`chat:${chatId}`);
      const chats: Set<string> = socket.data.chatIds ?? new Set<string>();
      chats.add(String(chatId));
      socket.data.chatIds = chats;
    });

    socket.on("chat:leave", async (chatId: string) => {
      if (!(await ensureSocketChatAccess(socket, userId, String(chatId), "CHAT_LEAVE_FORBIDDEN"))) return;
      socket.leave(`chat:${chatId}`);
      const chats: Set<string> = socket.data.chatIds ?? new Set<string>();
      chats.delete(String(chatId));
      socket.data.chatIds = chats;
    });

    socket.on("call:invite", async (p: any) => {
      const chatId = String(p?.chatId ?? "");
      const callId = String(p?.callId ?? "");
      if (!chatId || !callId) return;
      if (!(await ensureSocketChatAccess(socket, userId, chatId))) return;

      const existingCallId = activeCallIdByChatId.get(chatId);
      if (existingCallId) {
        socket.emit("call:already_active", { chatId, callId: existingCallId, at: new Date().toISOString() });
        await emitCallState(chatId, existingCallId);
        return;
      }

      pendingCallInvites.add(callId);
      try {
        const createdAt = new Date().toISOString();
        const kind = await getChatType(chatId);
        const memberUserIds = await getChatMemberUserIds(chatId);
        const call: ActiveCall = {
          callId,
          chatId,
          createdBy: userId,
          createdAt,
          kind,
          participants: new Map(),
          invitedUserIds: new Set(memberUserIds),
          screenShareBy: null,
        };

        bindSocketToParticipant(call, userId, socket.id);
        activeCalls.set(callId, call);
        activeCallIdByChatId.set(chatId, callId);
        cancelPendingDisconnect(callId, userId);
        socket.join(`call:${callId}`);
        logCall("invite", { chatId, callId, userId, kind, invitedCount: memberUserIds.length });

        await emitToChatMembersExcept(chatId, userId, "call:invite", { chatId, callId, fromUserId: userId, createdAt, kind });
        await emitCallState(chatId, callId);
      } finally {
        pendingCallInvites.delete(callId);
      }
    });

    socket.on("call:accept", async (p: any) => {
      const chatId = String(p?.chatId ?? "");
      const callId = String(p?.callId ?? "");
      if (!chatId || !callId) return;
      if (!(await ensureSocketChatAccess(socket, userId, chatId))) return;

      const activeId = activeCallIdByChatId.get(chatId);
      if (activeId && activeId !== callId) {
        socket.emit("call:already_active", { chatId, callId: activeId, at: new Date().toISOString() });
        return;
      }

      const at = new Date().toISOString();
      const call = await ensureJoinableCall(socket, userId, callId, "accept");
      if (!call) {
        if (pendingCallInvites.has(callId)) return;
        socket.emit("call:end", { chatId, callId, byUserId: userId, at });
        return;
      }
      if (call.chatId !== chatId) {
        emitCallError(socket, "CALL_CHAT_MISMATCH", "Call does not belong to this chat.", { chatId, callId, actualChatId: call.chatId });
        return;
      }
      if (!call.participants.has(userId) && call.participants.size >= MAX_CALL_PARTICIPANTS) {
        socket.emit("call:room_full", { chatId, callId, at });
        return;
      }

      const existed = !!getRuntimeParticipant(call, userId);
      const wasPendingReconnect = cancelPendingDisconnect(callId, userId);
      bindSocketToParticipant(call, userId, socket.id);
      socket.join(`call:${callId}`);
      logCall("accept", { chatId, callId, userId, existed, wasPendingReconnect });

      if (!existed || wasPendingReconnect) {
        io.to(`call:${callId}`).emit("call:peer_joined", { callId, userId, at, phase: wasPendingReconnect ? "signaling_recovered" : "joined" });
      }
      await emitToChatMembers(chatId, "call:accept", { chatId, callId, userId, at });
      await emitCallState(chatId, callId);
    });

    socket.on("call:decline", async (p: any) => {
      const chatId = String(p?.chatId ?? "");
      const callId = String(p?.callId ?? "");
      if (!chatId || !callId) return;
      if (!(await ensureSocketChatAccess(socket, userId, chatId))) return;
      const at = new Date().toISOString();
      logCall("decline", { chatId, callId, userId });
      await emitToChatMembers(chatId, "call:decline", { chatId, callId, userId, at });
    });

    socket.on("call:join", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;

      const call = await ensureJoinableCall(socket, userId, callId, String(p?.reason ?? "join"));
      if (!call) {
        if (pendingCallInvites.has(callId)) return;
        socket.emit("call:end", { callId, byUserId: userId, at: new Date().toISOString() });
        return;
      }
      if (!call.participants.has(userId) && call.participants.size >= MAX_CALL_PARTICIPANTS) {
        socket.emit("call:room_full", { chatId: call.chatId, callId, at: new Date().toISOString() });
        return;
      }

      const existed = !!getRuntimeParticipant(call, userId);
      const wasPendingReconnect = cancelPendingDisconnect(callId, userId);
      bindSocketToParticipant(call, userId, socket.id);
      socket.join(`call:${callId}`);
      logCall("join", { callId, chatId: call.chatId, userId, existed, wasPendingReconnect, reason: String(p?.reason ?? "join") });

      if (!existed) {
        io.to(`call:${callId}`).emit("call:peer_joined", { callId, userId, at: new Date().toISOString(), phase: "joined" });
      } else if (wasPendingReconnect) {
        io.to(`call:${callId}`).emit("call:peer_reconnected", { callId, userId, at: new Date().toISOString(), phase: "signaling_recovered" });
      }
      await emitCallState(call.chatId, callId);
    });

    socket.on("call:who", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = await ensureParticipantCall(socket, userId, callId, "who");
      if (!call) return;
      const peers = Array.from(call.participants.values())
        .filter((participant) => participant.state !== "reconnecting")
        .map((participant) => participant.userId);
      socket.emit("call:peers", { callId, peers, at: new Date().toISOString() });
    });

    socket.on("call:leave", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = await ensureParticipantCall(socket, userId, callId, "leave");
      if (!call) return;
      socket.leave(`call:${callId}`);
      detachSocketFromParticipant(callId, userId, socket.id);
      cancelPendingDisconnect(callId, userId);
      logCall("leave", { callId, chatId: call.chatId, userId });
      if (!hasLiveSocketInRoom(callId, userId)) {
        io.to(`call:${callId}`).emit("call:peer_left", { callId, userId, at: new Date().toISOString(), reason: "leave" });
        await removeParticipantFromCall(callId, userId, "left");
      } else {
        await emitCallState(call.chatId, callId);
      }
    });

    socket.on("call:signal", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = await ensureParticipantCall(socket, userId, callId, "signal");
      if (!call) return;
      const toUserId = p?.toUserId ? String(p.toUserId) : null;
      const data = p?.data;
      if (toUserId) {
        if (!call.participants.has(toUserId)) {
          emitCallError(socket, "CALL_SIGNAL_FORBIDDEN", "Signal target is not part of this call.", { callId, toUserId });
          return;
        }
        io.to(`user:${toUserId}`).emit("call:signal", { callId, fromUserId: userId, data });
      } else {
        socket.to(`call:${callId}`).emit("call:signal", { callId, fromUserId: userId, data });
      }
    });

    socket.on("call:screen_share", async (p: any) => {
      const callId = String(p?.callId ?? "");
      const enabled = Boolean(p?.enabled);
      if (!callId) return;
      const call = await ensureParticipantCall(socket, userId, callId, "screen_share");
      if (!call) return;
      if (enabled) {
        if (call.screenShareBy && call.screenShareBy !== userId) {
          io.to(`user:${call.screenShareBy}`).emit("call:screen_share_force_stop", {
            callId,
            byUserId: userId,
            at: new Date().toISOString(),
          });
        }
        call.screenShareBy = userId;
        io.to(`call:${callId}`).emit("call:screen_share_started", { callId, userId, at: new Date().toISOString() });
      } else if (call.screenShareBy === userId) {
        call.screenShareBy = null;
        io.to(`call:${callId}`).emit("call:screen_share_stopped", { callId, userId, at: new Date().toISOString(), reason: "manual" });
      }
      await emitCallState(call.chatId, callId);
    });

    socket.on("call:end", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = await ensureParticipantCall(socket, userId, callId, "end");
      if (!call) return;
      const effectiveChatId = call.chatId;
      const at = new Date().toISOString();

      clearPendingDisconnectsForCall(callId);
      activeCalls.delete(callId);
      const current = activeCallIdByChatId.get(effectiveChatId);
      if (current === callId) activeCallIdByChatId.delete(effectiveChatId);
      logCall("end", { callId, chatId: effectiveChatId, userId });

      await emitToChatMembers(effectiveChatId, "call:end", { chatId: effectiveChatId, callId, byUserId: userId, at });
      await emitCallState(effectiveChatId, null);
      io.to(`call:${callId}`).emit("call:end", { callId, byUserId: userId, at });
    });

    socket.on("disconnecting", () => {
      try {
        for (const room of socket.rooms) {
          if (typeof room !== "string" || !room.startsWith("call:") || room === socket.id) continue;
          const callId = room.slice("call:".length);
          detachSocketFromParticipant(callId, userId, socket.id);
          const stillInRoom = hasLiveSocketInRoom(callId, userId, socket.id);
          if (stillInRoom) continue;
          scheduleDisconnect(callId, userId);
        }
      } catch {
        // ignore
      }
    });

    socket.on("disconnect", async (reason) => {
      const ent = online.get(userId);
      if (ent) {
        ent.sockets.delete(socket.id);
        if (ent.sockets.size === 0) {
          online.set(userId, ent);
          schedulePresenceOffline(userId);
        }
      }
      logCall("socket-disconnect", { userId, socketId: socket.id, reason });
    });
  });

  return {
    emitToUser(userId: string, event: string, payload: any) {
      io.to(`user:${userId}`).emit(event, payload);
    },
    emitToChat(chatId: string, event: string, payload: any) {
      io.to(`chat:${chatId}`).emit(event, payload);
    },
    getPresenceSnapshot(userIds: string[]) {
      return getPresenceSnapshot(userIds);
    },
  };
}
