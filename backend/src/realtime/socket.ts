import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "../db/prisma";

type OnlineMap = Map<string, { sockets: Set<string>; lastSeenAt: Date }>;

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

const MAX_CALL_PARTICIPANTS = 10;
const RECONNECT_GRACE_MS = 12000;

export function createSocket(io: Server) {
  const online: OnlineMap = new Map();
  const activeCalls = new Map<string, ActiveCall>();
  const activeCallIdByChatId = new Map<string, string>();
  const pendingCallInvites = new Set<string>();
  const pendingDisconnects = new Map<string, PendingDisconnect>();

  function pendingKey(callId: string, userId: string) {
    return `${callId}:${userId}`;
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
    });
    void emitCallState(call.chatId, callId);

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
    entry.sockets.add(socket.id);
    online.set(userId, entry);

    io.emit("presence:online", { userId });

    const memberships = await prisma.chatMember.findMany({ where: { userId, leftAt: null }, select: { chatId: true } });
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

    socket.on("chat:join", (chatId: string) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on("chat:leave", (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on("call:invite", async (p: any) => {
      const chatId = String(p?.chatId ?? "");
      const callId = String(p?.callId ?? "");
      if (!chatId || !callId) return;

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

      const activeId = activeCallIdByChatId.get(chatId);
      if (activeId && activeId !== callId) {
        socket.emit("call:already_active", { chatId, callId: activeId, at: new Date().toISOString() });
        return;
      }

      const at = new Date().toISOString();
      const call = activeCalls.get(callId);
      if (!call) {
        if (pendingCallInvites.has(callId)) return;
        socket.emit("call:end", { chatId, callId, byUserId: userId, at });
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

      if (!existed || wasPendingReconnect) {
        io.to(`call:${callId}`).emit("call:peer_joined", { callId, userId, at });
      }
      await emitToChatMembers(chatId, "call:accept", { chatId, callId, userId, at });
      await emitCallState(chatId, callId);
    });

    socket.on("call:decline", async (p: any) => {
      const chatId = String(p?.chatId ?? "");
      const callId = String(p?.callId ?? "");
      if (!chatId || !callId) return;
      const at = new Date().toISOString();
      await emitToChatMembers(chatId, "call:decline", { chatId, callId, userId, at });
    });

    socket.on("call:join", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;

      const call = activeCalls.get(callId);
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

      if (!existed) {
        io.to(`call:${callId}`).emit("call:peer_joined", { callId, userId, at: new Date().toISOString() });
      } else if (wasPendingReconnect) {
        io.to(`call:${callId}`).emit("call:peer_reconnected", { callId, userId, at: new Date().toISOString() });
      }
      await emitCallState(call.chatId, callId);
    });

    socket.on("call:who", (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = activeCalls.get(callId);
      const peers = call
        ? Array.from(call.participants.values())
            .filter((participant) => participant.state !== "reconnecting")
            .map((participant) => participant.userId)
        : [];
      socket.emit("call:peers", { callId, peers, at: new Date().toISOString() });
    });

    socket.on("call:leave", async (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const call = activeCalls.get(callId);
      socket.leave(`call:${callId}`);
      detachSocketFromParticipant(callId, userId, socket.id);
      cancelPendingDisconnect(callId, userId);
      if (!hasLiveSocketInRoom(callId, userId)) {
        io.to(`call:${callId}`).emit("call:peer_left", { callId, userId, at: new Date().toISOString(), reason: "leave" });
        await removeParticipantFromCall(callId, userId, "left");
      } else if (call) {
        await emitCallState(call.chatId, callId);
      }
    });

    socket.on("call:signal", (p: any) => {
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const toUserId = p?.toUserId ? String(p.toUserId) : null;
      const data = p?.data;
      if (toUserId) {
        io.to(`user:${toUserId}`).emit("call:signal", { callId, fromUserId: userId, data });
      } else {
        socket.to(`call:${callId}`).emit("call:signal", { callId, fromUserId: userId, data });
      }
    });

    socket.on("call:screen_share", async (p: any) => {
      const callId = String(p?.callId ?? "");
      const enabled = Boolean(p?.enabled);
      if (!callId) return;
      const call = activeCalls.get(callId);
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
      const chatId = p?.chatId ? String(p.chatId) : null;
      const callId = String(p?.callId ?? "");
      if (!callId) return;
      const at = new Date().toISOString();
      const call = activeCalls.get(callId);
      const effectiveChatId = chatId ?? call?.chatId ?? null;

      clearPendingDisconnectsForCall(callId);
      activeCalls.delete(callId);
      if (effectiveChatId) {
        const current = activeCallIdByChatId.get(effectiveChatId);
        if (current === callId) activeCallIdByChatId.delete(effectiveChatId);
      }

      if (effectiveChatId) {
        await emitToChatMembers(effectiveChatId, "call:end", { chatId: effectiveChatId, callId, byUserId: userId, at });
        await emitCallState(effectiveChatId, null);
      }
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

    socket.on("disconnect", async () => {
      const ent = online.get(userId);
      if (ent) {
        ent.sockets.delete(socket.id);
        if (ent.sockets.size === 0) {
          ent.lastSeenAt = new Date();
          online.set(userId, ent);
          await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: ent.lastSeenAt } });
          io.emit("presence:offline", { userId, lastSeenAt: ent.lastSeenAt.toISOString() });
        }
      }
    });
  });

  return {
    emitToUser(userId: string, event: string, payload: any) {
      io.to(`user:${userId}`).emit(event, payload);
    },
    emitToChat(chatId: string, event: string, payload: any) {
      io.to(`chat:${chatId}`).emit(event, payload);
    },
  };
}




