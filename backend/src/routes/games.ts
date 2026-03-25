import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { asyncHandler, HttpError } from '../utils/http';
import { AuthedRequest, requireAuth, requireActiveUser } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireActiveUser);

const sessionActionTimers = new Map<string, NodeJS.Timeout>();
const sessionShowdownTimers = new Map<string, NodeJS.Timeout>();
let latestEmitter: { emitToChat(chatId: string, event: string, payload: any): void; getPresenceSnapshot?: (userIds: string[]) => Record<string, 'online' | 'reconnecting' | 'disconnected'> } | null = null;

router.use((req, _res, next) => {
  latestEmitter = req.app.locals.emitter ?? latestEmitter;
  next();
});

const GAME_SYSTEM_PREFIX = '__GAME_EVENT__';
const SUPPORTED_GAME_KEYS = ['POKER', 'FLAPPY', 'QUIZ', 'CHECKERS'] as const;
type SupportedGameKey = (typeof SUPPORTED_GAME_KEYS)[number];
type SessionStatus = 'CONFIG' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
type SessionRole = 'player' | 'observer';
type SessionMemberStatus = 'invited' | 'joined' | 'left';
type PokerStage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
type FlappyPlayerStatus = 'waiting' | 'playing' | 'done';

type SessionMember = {
  userId: string;
  username?: string | null;
  avatarUrl?: string | null;
  role: SessionRole;
  status: SessionMemberStatus;
  seat: number | null;
  joinedAt: string | null;
  leftAt: string | null;
  isReady?: boolean;
  connectionStatus?: 'online' | 'reconnecting' | 'disconnected';
};

type PokerConfig = {
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  allowObservers: boolean;
  timerSec: number;
  maxPlayers: number;
};

type PokerPlayerState = {
  userId: string;
  seat: number;
  cards: string[];
  stack: number;
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  handBet: number;
  actedAt?: string | null;
  lastAction?: string | null;
  lastActionAmount?: number | null;
  hasActed?: boolean;
};

type PokerActionLog = {
  id: string;
  userId: string;
  type: PokerActionType | 'system';
  amount?: number;
  createdAt: string;
  note?: string;
};

type PokerResult = {
  winners: string[];
  placements: { userId: string; amount: number; handLabel?: string }[];
  reason: 'winner' | 'cancelled' | 'everyone_left';
  endedBy?: string | null;
};

type PokerState = {
  stage: PokerStage;
  startedAt: string | null;
  endedAt: string | null;
  deck: string[];
  communityCards: string[];
  players: PokerPlayerState[];
  dealerIndex: number;
  turnUserId: string | null;
  currentBet: number;
  pot: number;
  actionLog: PokerActionLog[];
  result: PokerResult | null;
  handNumber: number;
  actionDeadlineAt: string | null;
  timerSec: number;
  lastCompletedHandResult?: PokerResult | null;
  showdownMessage?: string | null;
  showdownEndsAt?: string | null;
};

type FlappyAttempt = {
  attempt: number;
  score: number;
  createdAt: string;
};

type FlappyPlayerState = {
  userId: string;
  seat: number;
  attemptsUsed: number;
  bestScore: number;
  lastScore: number;
  lastAttemptAt: string | null;
  attempts: FlappyAttempt[];
  status: FlappyPlayerStatus;
};

type FlappyState = {
  startedAt: string | null;
  endedAt: string | null;
  maxAttempts: number;
  players: FlappyPlayerState[];
  leaderboard: { userId: string; bestScore: number; attemptsUsed: number; lastScore: number }[];
  result: PokerResult | null;
};

type GameSession = {
  version: number;
  serverNow?: string;
  idempotency?: Record<string, { scope: string; userId: string; createdAt: string }>;

  sessionId: string;
  roomId: string;
  chatId: string;
  gameKey: SupportedGameKey;
  title: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  invitedUserIds: string[];
  members: SessionMember[];
  config: Record<string, any>;
  startedAt?: string | null;
  endedAt?: string | null;
  poker?: PokerState | null;
  flappy?: FlappyState | null;
  result?: PokerResult | null;
};

const CreateSessionSchema = z.object({
  gameKey: z.enum(SUPPORTED_GAME_KEYS),
  title: z.string().min(2).max(120).optional(),
  participantUserIds: z.array(z.string().uuid()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const JoinSchema = z.object({
  role: z.enum(['player', 'observer']).optional(),
});

const ReadySchema = z.object({
  isReady: z.boolean(),
});

const PokerActionSchema = z.object({
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
  amount: z.number().int().min(0).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

const FlappyAttemptSchema = z.object({
  score: z.number().int().min(0).max(9999),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

const UpdateSessionConfigSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  participantUserIds: z.array(z.string().uuid()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});


function logGameDebug(scope: string, payload: Record<string, unknown>) {
  try {
    console.info(`[games:${scope}]`, JSON.stringify(payload));
  } catch {
    console.info(`[games:${scope}]`, payload);
  }
}

async function assertGamesSchemaReady() {
  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'GameRoom'
    `);
    const columns = new Set(rows.map((row) => row.column_name));
    const required = ['id', 'roomId', 'currentGameKey', 'createdAt', 'meta'];
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length) {
      throw new HttpError(500, 'Games schema is outdated. Run Prisma migration for GameRoom.', {
        table: 'GameRoom',
        missingColumns: missing,
      });
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, 'Failed to verify games schema readiness', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function gameRoomId(chatId: string) {
  return `game:${chatId}:${uuid()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePokerConfig(input: Record<string, any> | undefined): PokerConfig {
  const buyIn = clampInt(input?.buyIn ?? 1000, 200, 10000);
  const smallBlind = clampInt(input?.smallBlind ?? 10, 1, buyIn);
  const bigBlind = clampInt(input?.bigBlind ?? 20, smallBlind + 1, buyIn);
  return {
    buyIn,
    smallBlind,
    bigBlind,
    allowObservers: input?.allowObservers !== false,
    timerSec: clampInt(input?.timerSec ?? 25, 10, 90),
    maxPlayers: clampInt(input?.maxPlayers ?? 6, 2, 8),
  };
}

function normalizeFlappyConfig(input: Record<string, any> | undefined) {
  return {
    maxAttempts: clampInt(input?.maxAttempts ?? 5, 1, 20),
    allowObservers: input?.allowObservers !== false,
  };
}

const SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

function getSessionAgeStart(session: GameSession) {
  return new Date(session.startedAt ?? session.createdAt).getTime();
}

function sessionExpired(session: GameSession) {
  if (session.status === 'FINISHED' || session.status === 'CANCELLED') return false;
  const started = getSessionAgeStart(session);
  return Number.isFinite(started) && Date.now() - started >= SESSION_MAX_LIFETIME_MS;
}

function finalizeExpiredSession(session: GameSession) {
  if (!sessionExpired(session)) return false;
  const endedAt = nowIso();
  session.status = 'CANCELLED';
  session.endedAt = endedAt;
  session.updatedAt = endedAt;
  session.result = { winners: [], placements: [], reason: 'cancelled', endedBy: null as any };
  if (session.poker) {
    session.poker.result = session.result;
    session.poker.endedAt = endedAt;
    session.poker.stage = 'finished';
    session.poker.turnUserId = null;
    session.poker.actionDeadlineAt = null;
    session.poker.showdownEndsAt = null;
  }
  if (session.flappy) {
    session.flappy.result = session.result;
    session.flappy.endedAt = endedAt;
  }
  clearActionTimer(session.sessionId);
  clearShowdownTimer(session.sessionId);
  return true;
}

function clampInt(value: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildDeck() {
  const suits = ['s', 'h', 'd', 'c'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  return shuffle(suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`)));
}

function parseCard(card: string) {
  const rankChar = card[0];
  const suit = card[1];
  const rankMap: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
  return { rank: rankMap[rankChar] ?? 0, suit };
}

function combinations<T>(arr: T[], choose: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === choose) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      current.push(arr[i]);
      walk(i + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
}

function evaluateFive(cards: string[]) {
  const parsed = cards.map(parseCard).sort((a, b) => b.rank - a.rank);
  const counts = new Map<number, number>();
  const suits = new Map<string, number>();
  for (const card of parsed) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }
  const uniqueRanks = Array.from(new Set(parsed.map((card) => card.rank))).sort((a, b) => b - a);
  let straightHigh = 0;
  const straightRanks = [...uniqueRanks];
  if (uniqueRanks.includes(14)) straightRanks.push(1);
  for (let i = 0; i <= straightRanks.length - 5; i += 1) {
    const window = straightRanks.slice(i, i + 5);
    if (window[0] - window[4] === 4 && new Set(window).size === 5) {
      straightHigh = Math.max(straightHigh, window[0] === 1 ? 5 : window[0]);
      break;
    }
  }
  const flushSuit = Array.from(suits.entries()).find(([, count]) => count === 5)?.[0] ?? null;
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count === a.count ? b.rank - a.rank : b.count - a.count));

  const score = (category: number, values: number[]) => ({ category, values, label: handLabel(category, values) });

  if (flushSuit && straightHigh) return score(8, [straightHigh]);
  if (groups[0]?.count === 4) return score(7, [groups[0].rank, groups[1]?.rank ?? 0]);
  if (groups[0]?.count === 3 && groups[1]?.count === 2) return score(6, [groups[0].rank, groups[1].rank]);
  if (flushSuit) return score(5, parsed.map((card) => card.rank));
  if (straightHigh) return score(4, [straightHigh]);
  if (groups[0]?.count === 3) return score(3, [groups[0].rank, ...groups.slice(1).map((group) => group.rank).sort((a, b) => b - a)]);
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const pairRanks = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((a, b) => b - a);
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return score(2, [...pairRanks, kicker]);
  }
  if (groups[0]?.count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((a, b) => b - a);
    return score(1, [groups[0].rank, ...kickers]);
  }
  return score(0, parsed.map((card) => card.rank));
}

function compareEval(a: { category: number; values: number[] }, b: { category: number; values: number[] }) {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.values.length, b.values.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a.values[i] ?? 0) - (b.values[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function bestHand(cards: string[]) {
  let best: { category: number; values: number[]; label: string } | null = null;
  for (const combo of combinations(cards, 5)) {
    const current = evaluateFive(combo);
    if (!best || compareEval(current, best) > 0) best = current;
  }
  return best ?? { category: 0, values: [0], label: 'High card' };
}

function handLabel(category: number, values: number[]) {
  const top = values[0] ?? 0;
  const rankName = (rank: number) => ({ 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two' }[rank] ?? 'Card');
  if (category === 8) return top === 14 ? 'Royal flush' : `Straight flush, ${rankName(top)} high`;
  if (category === 7) return `Four of a kind, ${rankName(top)}s`;
  if (category === 6) return `Full house, ${rankName(top)}s full`;
  if (category === 5) return `Flush, ${rankName(top)} high`;
  if (category === 4) return `Straight, ${rankName(top)} high`;
  if (category === 3) return `Three of a kind, ${rankName(top)}s`;
  if (category === 2) return `Two pair, ${rankName(values[0] ?? 0)} and ${rankName(values[1] ?? 0)}`;
  if (category === 1) return `Pair of ${rankName(top)}s`;
  return `High card, ${rankName(top)}`;
}

async function ensureChatAccess(chatId: string, userId: string) {
  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, include: { user: true } });
  if (!member || member.leftAt) throw new HttpError(404, 'Chat not found');
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, username: true, avatarUrl: true, role: true } } } } },
  });
  if (!chat) throw new HttpError(404, 'Chat not found');
  return { chat, meMember: member };
}

function syncSessionMembersWithParticipants(session: GameSession, participantIds: string[]) {
  const selected = new Set(participantIds);
  for (const member of session.members) {
    const shouldBePlayer = selected.has(member.userId);
    member.role = shouldBePlayer ? 'player' : 'observer';
    member.isReady = shouldBePlayer ? Boolean(member.isReady && member.status !== 'left') : false;
    if (!shouldBePlayer && session.status === 'CONFIG') {
      member.seat = null;
      if (member.status === 'joined') member.status = 'invited';
    }
  }
  session.invitedUserIds = participantIds.filter((id) => id !== session.createdBy);
}

function getIdempotencyStore(session: GameSession) {
  if (!session.idempotency) session.idempotency = {};
  return session.idempotency;
}

function makeIdempotencyKey(scope: string, userId: string, raw?: string | null) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return `${scope}:${userId}:${value}`;
}

function hasProcessedIdempotency(session: GameSession, scope: string, userId: string, raw?: string | null) {
  const key = makeIdempotencyKey(scope, userId, raw);
  if (!key) return false;
  return Boolean(getIdempotencyStore(session)[key]);
}

function rememberIdempotency(session: GameSession, scope: string, userId: string, raw?: string | null) {
  const key = makeIdempotencyKey(scope, userId, raw);
  if (!key) return;
  const store = getIdempotencyStore(session);
  store[key] = { scope, userId, createdAt: nowIso() };
  const entries = Object.entries(store).sort((a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime());
  if (entries.length > 200) {
    for (const [oldKey] of entries.slice(200)) delete store[oldKey];
  }
}

function setSessionMemberPresence(session: GameSession) {
  const snapshot = latestEmitter?.getPresenceSnapshot?.(session.members.map((member) => member.userId)) ?? {};
  for (const member of session.members) {
    member.connectionStatus = snapshot[member.userId] ?? 'disconnected';
  }
}


function clearActionTimer(sessionId: string) {
  const timer = sessionActionTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    sessionActionTimers.delete(sessionId);
  }
}

function clearShowdownTimer(sessionId: string) {
  const timer = sessionShowdownTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    sessionShowdownTimers.delete(sessionId);
  }
}

function buildShowdownMessage(result: PokerResult) {
  const winnerLine = result.winners.length ? `Победитель раздачи: ${result.winners.join(', ')}` : 'Раздача завершена';
  const comboLine = result.placements
    .filter((item) => item.handLabel)
    .slice(0, 3)
    .map((item) => `${item.userId}: ${item.handLabel}`)
    .join(' · ');
  return comboLine ? `${winnerLine} · ${comboLine}` : winnerLine;
}

async function finalizeShowdown(sessionId: string) {
  clearShowdownTimer(sessionId);
  const { session } = await loadSession(sessionId);
  const state = session.poker;
  if (!state || state.stage !== 'showdown') return;
  state.showdownEndsAt = null;
  if (session.status === 'FINISHED') {
    session.updatedAt = nowIso();
    await saveSession(session.sessionId, session);
    emitGameUpdateDirect(session, 'game_finished_showdown');
    return;
  }
  setupNextPokerHand(session);
  session.updatedAt = nowIso();
  await saveSession(session.sessionId, session);
  emitGameUpdateDirect(session, 'next_hand_started');
}

function scheduleShowdown(session: GameSession, durationMs = 4200) {
  clearShowdownTimer(session.sessionId);
  const state = session.poker;
  if (!state) return;
  state.showdownEndsAt = new Date(Date.now() + durationMs).toISOString();
  sessionShowdownTimers.set(session.sessionId, setTimeout(() => {
    void finalizeShowdown(session.sessionId).catch(() => null);
  }, durationMs + 50));
}

function emitGameUpdateDirect(session: GameSession, reason: string, extra?: Record<string, unknown>) {
  latestEmitter?.emitToChat(session.chatId, 'game:update', {
    sessionId: session.sessionId,
    chatId: session.chatId,
    gameKey: session.gameKey,
    status: session.status,
    updatedAt: session.updatedAt,
    payload: toPublicSession(session),
    reason,
    ...extra,
  });
}

function getActionTimeoutMs(session: GameSession) {
  return Math.max(5, Number(session.config?.timerSec ?? session.poker?.timerSec ?? 20)) * 1000;
}

async function performAutoAction(sessionId: string) {
  clearActionTimer(sessionId);
  const { session } = await loadSession(sessionId);
  const state = session.poker;
  if (!state || session.status !== 'ACTIVE' || !state.turnUserId) return;
  if (state.actionDeadlineAt && new Date(state.actionDeadlineAt).getTime() - Date.now() > 250) return;
  const player = state.players.find((item) => item.userId === state.turnUserId);
  if (!player || player.folded || player.allIn) return;
  const toCall = Math.max(0, state.currentBet - player.roundBet);
  const stamp = nowIso();
  const action: PokerActionType = toCall > 0 ? 'fold' : 'check';
  if (action === 'fold') player.folded = true;
  player.actedAt = stamp;
  player.lastAction = action;
  player.lastActionAmount = toCall > 0 ? toCall : null;
  player.hasActed = true;
  state.actionLog.unshift({ id: uuid(), userId: player.userId, type: action, amount: toCall > 0 ? toCall : undefined, createdAt: stamp, note: 'Auto action by timer' });
  advancePokerState(session, player.userId);
  scheduleActionTimer(session);
  await saveSession(session.sessionId, session);
  if (session.status === 'FINISHED') {
    await postSystemGameMessage(session.chatId, session.createdBy, buildSessionMessage('SESSION_FINISHED', session, { note: 'Покерная сессия завершена' }));
  }
  emitGameUpdateDirect(session, 'poker_timeout', { userId: player.userId, action });
}

function scheduleActionTimer(session: GameSession) {
  clearActionTimer(session.sessionId);
  const state = session.poker;
  if (!state || session.status !== 'ACTIVE' || state.stage === 'showdown' || !state.turnUserId) {
    if (state) state.actionDeadlineAt = null;
    return;
  }
  const delay = getActionTimeoutMs(session);
  state.timerSec = Math.round(delay / 1000);
  state.actionDeadlineAt = new Date(Date.now() + delay).toISOString();
  sessionActionTimers.set(session.sessionId, setTimeout(() => {
    void performAutoAction(session.sessionId).catch(() => null);
  }, delay + 30));
}


async function deleteSessionRecord(sessionId: string) {
  clearActionTimer(sessionId);
  clearShowdownTimer(sessionId);
  await prisma.gameRoom.delete({ where: { roomId: sessionId } }).catch(() => null);
}

async function loadSession(sessionId: string) {
  const room = await prisma.gameRoom.findUnique({ where: { roomId: sessionId } });
  if (!room?.meta) throw new HttpError(404, 'Game session not found');
  const session = room.meta as unknown as GameSession;
  if (finalizeExpiredSession(session)) {
    setSessionMemberPresence(session);
    await saveSession(session.sessionId, session);
    return { room, session };
  }
  if (session?.status === 'ACTIVE' && session.poker) {
    if (session.poker.stage === 'showdown') {
      if (session.poker.showdownEndsAt && new Date(session.poker.showdownEndsAt).getTime() <= Date.now()) {
        queueMicrotask(() => { void finalizeShowdown(sessionId).catch(() => null); });
      } else if (session.poker.showdownEndsAt) {
        scheduleShowdown(session, Math.max(300, new Date(session.poker.showdownEndsAt).getTime() - Date.now()));
      }
    } else if (session.poker.actionDeadlineAt && new Date(session.poker.actionDeadlineAt).getTime() <= Date.now()) {
      queueMicrotask(() => { void performAutoAction(sessionId).catch(() => null); });
    } else {
      scheduleActionTimer(session);
    }
  }
  setSessionMemberPresence(session);
  return { room, session };
}

let workerStarted = false;
let workerBusy = false;

async function sweepSessionRoom(roomId: string) {
  const room = await prisma.gameRoom.findUnique({ where: { roomId } });
  if (!room?.meta) return;
  const session = room.meta as unknown as GameSession;
  if (finalizeExpiredSession(session)) {
    await saveSession(session.sessionId, session);
    emitGameUpdateDirect(session, 'session_auto_cancelled');
    return;
  }
  if (session.status !== 'ACTIVE' || !session.poker) return;
  if (session.poker.stage === 'showdown' && session.poker.showdownEndsAt && new Date(session.poker.showdownEndsAt).getTime() <= Date.now()) {
    await finalizeShowdown(session.sessionId);
    return;
  }
  if (session.poker.actionDeadlineAt && session.poker.turnUserId && new Date(session.poker.actionDeadlineAt).getTime() <= Date.now()) {
    await performAutoAction(session.sessionId);
  }
}

async function recoverGameWorkerPrismaConnection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const looksLikeDisconnect = /server has closed the connection|connection reset|can't reach database server|terminating connection|closed the connection/i.test(message);
  if (!looksLikeDisconnect) return;

  console.warn('[games-worker] Обнаружен разрыв соединения с БД, пробую переподключиться...');

  try {
    await prisma.$disconnect();
  } catch {
    // ignore disconnect errors during recovery
  }

  try {
    await prisma.$connect();
    console.info('[games-worker] Соединение с БД восстановлено.');
  } catch (reconnectError) {
    console.error('[games-worker] Не удалось восстановить соединение с БД.', reconnectError);
  }
}

function ensureGameWorkerStarted() {
  if (workerStarted) return;
  workerStarted = true;
  const tick = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      const rooms = await prisma.gameRoom.findMany({
        where: { roomId: { startsWith: 'game:' } },
        select: { roomId: true },
      });
      for (const room of rooms) {
        await sweepSessionRoom(room.roomId).catch(() => null);
      }
    } catch (error) {
      console.error('[games-worker] Ошибка фонового тика.', error);
      await recoverGameWorkerPrismaConnection(error);
    } finally {
      workerBusy = false;
    }
  };
  const timer = setInterval(() => {
    void tick().catch(async (error) => {
      console.error('[games-worker] Необработанная ошибка фонового тика.', error);
      await recoverGameWorkerPrismaConnection(error);
    });
  }, 2000);
  timer.unref?.();
}

ensureGameWorkerStarted();

function postBlind(state: PokerState, userId: string, amount: number) {
  const player = state.players.find((item) => item.userId === userId);
  if (!player) return 0;
  const posted = Math.min(player.stack, amount);
  player.stack -= posted;
  player.roundBet += posted;
  player.handBet += posted;
  if (player.stack === 0) player.allIn = true;
  state.pot += posted;
  state.currentBet = Math.max(state.currentBet, player.roundBet);
  return posted;
}

function nextActivePlayer(players: PokerPlayerState[], startIndex: number) {
  if (!players.length) return null;
  for (let step = 1; step <= players.length; step += 1) {
    const candidate = players[(startIndex + step) % players.length];
    if (!candidate.folded && !candidate.allIn) return candidate;
  }
  return null;
}

function activePlayers(players: PokerPlayerState[]) {
  return players.filter((player) => !player.folded);
}

function getFirstToActPostFlop(state: PokerState) {
  const dealerPlayer = state.players[state.dealerIndex] ?? state.players[0] ?? null;
  return dealerPlayer ? nextActivePlayer(state.players, state.dealerIndex) : null;
}

function shouldCompleteBettingRound(state: PokerState) {
  const contenders = activePlayers(state.players).filter((player) => !player.allIn);
  if (!contenders.length) return true;
  return contenders.every((player) => player.hasActed && player.roundBet === state.currentBet);
}

function resetBettingRound(state: PokerState, stage: PokerStage) {
  state.stage = stage;
  state.currentBet = 0;
  for (const player of state.players) {
    player.roundBet = 0;
    player.hasActed = false;
    if (!player.folded && player.stack > 0) player.lastAction = null;
  }
  const next = getFirstToActPostFlop(state);
  state.turnUserId = next?.userId ?? null;
}


function nextDealerIndex(players: PokerPlayerState[], currentDealerIndex: number) {
  const alive = players.filter((player) => player.stack > 0);
  if (alive.length <= 1) return currentDealerIndex;
  for (let step = 1; step <= players.length; step += 1) {
    const idx = (currentDealerIndex + step) % players.length;
    if (players[idx] && players[idx].stack > 0) return idx;
  }
  return currentDealerIndex;
}

function setupNextPokerHand(session: GameSession) {
  const state = session.poker;
  if (!state) return;
  const contenders = state.players.filter((player) => player.stack > 0);
  if (contenders.length <= 1) {
    const result: PokerResult = {
      winners: contenders.length ? [contenders[0].userId] : [],
      placements: [...state.players]
        .sort((a, b) => b.stack - a.stack)
        .map((player) => ({ userId: player.userId, amount: player.stack, handLabel: player.stack > 0 ? 'Champion stack' : 'Busted' })),
      reason: 'winner',
    };
    state.stage = 'finished';
    state.result = result;
    session.result = result;
    session.status = 'FINISHED';
    session.endedAt = nowIso();
    state.endedAt = session.endedAt;
    state.turnUserId = null;
    state.actionDeadlineAt = null;
    clearActionTimer(session.sessionId);
    return;
  }

  state.handNumber += 1;
  state.deck = buildDeck();
  state.communityCards = [];
  state.pot = 0;
  state.currentBet = 0;
  state.result = null;
  state.lastCompletedHandResult = null;
  state.showdownMessage = null;
  state.showdownEndsAt = null;
  state.stage = 'preflop';
  state.dealerIndex = nextDealerIndex(state.players, state.dealerIndex);
  for (const player of state.players) {
    player.cards = player.stack > 0 ? [state.deck.shift()!, state.deck.shift()!] : [];
    player.folded = player.stack <= 0;
    player.allIn = false;
    player.roundBet = 0;
    player.handBet = 0;
    player.actedAt = null;
    player.lastAction = null;
    player.lastActionAmount = null;
    player.hasActed = false;
  }

  const alive = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.stack > 0);
  const dealerAliveIndex = alive.findIndex(({ index }) => index === state.dealerIndex);
  const smallBlindSeat = alive.length === 2 ? alive[dealerAliveIndex] : alive[(dealerAliveIndex + 1) % alive.length];
  const bigBlindSeat = alive[(dealerAliveIndex + (alive.length === 2 ? 1 : 2)) % alive.length];
  const smallBlindPlayer = smallBlindSeat?.player ?? null;
  const bigBlindPlayer = bigBlindSeat?.player ?? null;

  const small = smallBlindPlayer ? postBlind(state, smallBlindPlayer.userId, session.config.smallBlind ?? 10) : 0;
  const big = bigBlindPlayer ? postBlind(state, bigBlindPlayer.userId, session.config.bigBlind ?? 20) : 0;
  if (smallBlindPlayer) state.actionLog.unshift({ id: uuid(), userId: smallBlindPlayer.userId, type: 'system', amount: small, createdAt: nowIso(), note: `Hand #${state.handNumber}: Small blind` });
  if (bigBlindPlayer) state.actionLog.unshift({ id: uuid(), userId: bigBlindPlayer.userId, type: 'system', amount: big, createdAt: nowIso(), note: `Hand #${state.handNumber}: Big blind` });

  const openerIndex = bigBlindPlayer ? state.players.findIndex((player) => player.userId === bigBlindPlayer.userId) : state.dealerIndex;
  state.turnUserId = nextActivePlayer(state.players, openerIndex)?.userId ?? null;
}


function determineWinner(state: PokerState): PokerResult {
  const contenders = activePlayers(state.players);
  if (contenders.length === 1) {
    const winner = contenders[0];
    winner.stack += state.pot;
    return {
      winners: [winner.userId],
      placements: [{ userId: winner.userId, amount: state.pot, handLabel: 'Last player standing' }],
      reason: 'winner',
    };
  }

  const scored = contenders.map((player) => ({
    player,
    hand: bestHand([...player.cards, ...state.communityCards]),
  }));
  scored.sort((a, b) => compareEval(b.hand, a.hand));
  const best = scored[0]?.hand;
  const winners = scored.filter((item) => best && compareEval(item.hand, best) === 0);
  const share = winners.length ? Math.floor(state.pot / winners.length) : 0;
  const remainder = winners.length ? state.pot % winners.length : 0;
  winners.forEach((winner, index) => {
    winner.player.stack += share + (index === 0 ? remainder : 0);
  });
  return {
    winners: winners.map((item) => item.player.userId),
    placements: scored.map((item) => {
      const winnerIndex = winners.findIndex((winner) => winner.player.userId === item.player.userId);
      return {
        userId: item.player.userId,
        amount: winnerIndex === -1 ? 0 : share + (winnerIndex === 0 ? remainder : 0),
        handLabel: item.hand.label,
      };
    }),
    reason: 'winner',
  };
}

function advancePokerState(session: GameSession, actorId?: string) {
  const state = session.poker;
  if (!state) return;
  const contenders = activePlayers(state.players);
  if (contenders.length <= 1) {
    const result = determineWinner(state);
    state.lastCompletedHandResult = result;
    state.result = result;
    state.stage = 'showdown';
    state.turnUserId = null;
    state.actionDeadlineAt = null;
    state.showdownMessage = buildShowdownMessage(result);
    clearActionTimer(session.sessionId);
    if (state.players.filter((player) => player.stack > 0).length <= 1) {
      session.result = result;
      session.status = 'FINISHED';
      session.endedAt = nowIso();
      state.endedAt = session.endedAt;
      scheduleShowdown(session, 5200);
    } else {
      state.actionLog.unshift({ id: uuid(), userId: result.winners[0] ?? session.createdBy, type: 'system', amount: state.pot, createdAt: nowIso(), note: `Hand #${state.handNumber}: ${result.winners.map((id) => id).join(', ')} win the pot` });
      scheduleShowdown(session, 3600);
    }
    session.updatedAt = nowIso();
    return;
  }

  if (!shouldCompleteBettingRound(state)) {
    const currentIndex = state.players.findIndex((player) => player.userId === actorId);
    state.turnUserId = nextActivePlayer(state.players, currentIndex)?.userId ?? null;
    session.updatedAt = nowIso();
    return;
  }

  if (state.stage === 'preflop') {
    state.communityCards.push(state.deck.shift()!, state.deck.shift()!, state.deck.shift()!);
    resetBettingRound(state, 'flop');
  } else if (state.stage === 'flop') {
    state.communityCards.push(state.deck.shift()!);
    resetBettingRound(state, 'turn');
  } else if (state.stage === 'turn') {
    state.communityCards.push(state.deck.shift()!);
    resetBettingRound(state, 'river');
  } else if (state.stage === 'river') {
    const result = determineWinner(state);
    state.lastCompletedHandResult = result;
    state.result = result;
    state.stage = 'showdown';
    state.turnUserId = null;
    state.actionDeadlineAt = null;
    state.showdownMessage = buildShowdownMessage(result);
    clearActionTimer(session.sessionId);
    state.actionLog.unshift({ id: uuid(), userId: result.winners[0] ?? session.createdBy, type: 'system', amount: state.pot, createdAt: nowIso(), note: `Hand #${state.handNumber}: showdown settled` });
    if (state.players.filter((player) => player.stack > 0).length <= 1) {
      session.result = result;
      session.status = 'FINISHED';
      session.endedAt = nowIso();
      state.endedAt = session.endedAt;
      scheduleShowdown(session, 5600);
    } else {
      scheduleShowdown(session, 4300);
    }
  }

  if (session.status !== 'FINISHED' && state.turnUserId) {
    const next = state.players.find((player) => player.userId === state.turnUserId);
    if (next && (next.folded || next.allIn)) {
      const idx = state.players.findIndex((player) => player.userId === next.userId);
      state.turnUserId = nextActivePlayer(state.players, idx)?.userId ?? null;
    }
  }
  session.updatedAt = nowIso();
}


function recomputeFlappyLeaderboard(state: FlappyState) {
  state.leaderboard = [...state.players]
    .sort((a, b) => (b.bestScore - a.bestScore) || (a.attemptsUsed - b.attemptsUsed) || (b.lastScore - a.lastScore))
    .map((player) => ({ userId: player.userId, bestScore: player.bestScore, attemptsUsed: player.attemptsUsed, lastScore: player.lastScore }));
}

function buildFlappyResult(state: FlappyState): PokerResult {
  const sorted = [...state.players].sort((a, b) => (b.bestScore - a.bestScore) || (a.attemptsUsed - b.attemptsUsed) || (b.lastScore - a.lastScore));
  const topScore = sorted[0]?.bestScore ?? 0;
  return {
    winners: sorted.filter((item) => item.bestScore === topScore && topScore >= 0).map((item) => item.userId),
    placements: sorted.map((item) => ({ userId: item.userId, amount: item.bestScore, handLabel: `${item.attemptsUsed}/${state.maxAttempts} попыток` })),
    reason: 'winner',
    endedBy: null as any,
  };
}

function finishFlappySession(session: GameSession) {
  if (!session.flappy) return;
  const state = session.flappy;
  recomputeFlappyLeaderboard(state);
  session.status = 'FINISHED';
  session.endedAt = nowIso();
  session.updatedAt = session.endedAt;
  session.result = buildFlappyResult(state);
  state.result = session.result;
  state.endedAt = session.endedAt;
}

function initFlappy(session: GameSession) {
  const config = normalizeFlappyConfig(session.config);
  const playersMembers = session.members.filter((member) => member.role === 'player' && member.status === 'joined' && member.isReady);
  if (playersMembers.length < 1) throw new HttpError(400, 'Хотя бы один готовый игрок нужен для старта');
  const state: FlappyState = {
    startedAt: nowIso(),
    endedAt: null,
    maxAttempts: config.maxAttempts,
    players: playersMembers.map((member, index) => ({
      userId: member.userId,
      seat: index,
      attemptsUsed: 0,
      bestScore: 0,
      lastScore: 0,
      lastAttemptAt: null,
      attempts: [],
      status: 'waiting',
    })),
    leaderboard: [],
    result: null,
  };
  playersMembers.forEach((member, index) => {
    member.seat = index;
    member.status = 'joined';
    member.joinedAt = member.joinedAt ?? nowIso();
  });
  recomputeFlappyLeaderboard(state);
  session.flappy = state;
  session.poker = null;
  session.status = 'ACTIVE';
  session.startedAt = state.startedAt;
  session.updatedAt = nowIso();
}

function initPoker(session: GameSession) {
  const config = normalizePokerConfig(session.config);
  const playersMembers = session.members.filter((member) => member.role === 'player' && member.status === 'joined' && member.isReady).slice(0, config.maxPlayers);
  if (playersMembers.length < 2) throw new HttpError(400, 'At least two ready players are required to start poker');
  const deck = buildDeck();
  const players = playersMembers.map((member, index) => ({
    userId: member.userId,
    seat: index,
    cards: [deck.shift()!, deck.shift()!],
    stack: config.buyIn,
    folded: false,
    allIn: false,
    roundBet: 0,
    handBet: 0,
    lastAction: null,
    lastActionAmount: null,
    hasActed: false,
  }));
  playersMembers.forEach((member, index) => {
    member.seat = index;
    member.status = 'joined';
    member.joinedAt = member.joinedAt ?? nowIso();
  });
  const dealerIndex = Math.floor(Math.random() * players.length);
  const smallBlindPlayer = players.length === 2 ? players[dealerIndex] : players[(dealerIndex + 1) % players.length];
  const bigBlindPlayer = players[(dealerIndex + (players.length === 2 ? 1 : 2)) % players.length];
  const poker: PokerState = {
    stage: 'preflop',
    startedAt: nowIso(),
    endedAt: null,
    deck,
    communityCards: [],
    players,
    dealerIndex,
    turnUserId: null,
    currentBet: 0,
    pot: 0,
    actionLog: [],
    result: null,
    handNumber: 1,
    actionDeadlineAt: null,
    timerSec: config.timerSec,
    lastCompletedHandResult: null,
    showdownMessage: null,
    showdownEndsAt: null,
  };
  const small = postBlind(poker, smallBlindPlayer.userId, config.smallBlind);
  const big = postBlind(poker, bigBlindPlayer.userId, config.bigBlind);
  poker.actionLog.push({ id: uuid(), userId: smallBlindPlayer.userId, type: 'system', amount: small, createdAt: nowIso(), note: 'Small blind' });
  poker.actionLog.push({ id: uuid(), userId: bigBlindPlayer.userId, type: 'system', amount: big, createdAt: nowIso(), note: 'Big blind' });
  const opener = nextActivePlayer(players, players.findIndex((player) => player.userId === bigBlindPlayer.userId));
  poker.turnUserId = opener?.userId ?? null;
  session.poker = poker;
  session.status = 'ACTIVE';
  session.startedAt = poker.startedAt;
  session.updatedAt = nowIso();
}


function toPublicSession(session: GameSession, viewerId?: string | null) {
  const presence = latestEmitter?.getPresenceSnapshot?.(session.members.map((member) => member.userId)) ?? {};
  const revealAllCards = session.status === 'FINISHED' || session.status === 'CANCELLED' || session.poker?.stage === 'showdown';
  return {
    ...session,
    serverNow: nowIso(),
    members: session.members.map((member) => ({
      ...member,
      connectionStatus: presence[member.userId] ?? member.connectionStatus ?? 'disconnected',
    })),
    poker: session.poker
      ? {
          ...session.poker,
          deck: [],
          players: session.poker.players.map((player) => ({
            ...player,
            cards: revealAllCards || (viewerId && player.userId === viewerId) ? player.cards : player.cards.map(() => '??'),
          })),
        }
      : null,
  };
}

function buildSessionMessage(kind: string, session: GameSession, extra?: Record<string, any>) {
  return `${GAME_SYSTEM_PREFIX}${JSON.stringify({
    kind,
    sessionId: session.sessionId,
    gameKey: session.gameKey,
    title: session.title,
    status: session.status,
    createdBy: session.createdBy,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    result: session.result ?? null,
    ...extra,
  })}`;
}

async function postSystemGameMessage(chatId: string, senderId: string, text: string) {
  logGameDebug('system-message:create', { chatId, senderId, hasText: Boolean(text), preview: text.slice(0, 120) });
  await prisma.message.create({
    data: {
      chatId,
      senderId,
      type: 'SYSTEM',
      text,
    },
  });
  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
}

async function persistSessionCreate(sessionId: string, gameKey: SupportedGameKey, session: GameSession) {
  logGameDebug('session:create-db', { sessionId, gameKey, chatId: session.chatId, status: session.status });
  await prisma.gameRoom.create({
    data: {
      roomId: sessionId,
      currentGameKey: gameKey,
      meta: session as any,
    },
  });
}

async function saveSession(sessionId: string, session: GameSession) {
  scheduleActionTimer(session);
  logGameDebug('session:save-db', { sessionId, gameKey: session.gameKey, status: session.status, updatedAt: session.updatedAt });
  await prisma.gameRoom.update({
    where: { roomId: sessionId },
    data: {
      currentGameKey: session.gameKey,
      meta: session as any,
    },
  });
}

async function emitGameUpdate(req: AuthedRequest, session: GameSession, event: string, extra?: Record<string, any>) {
  const emitter = (latestEmitter = req.app.locals.emitter as any);
  emitter?.emitToChat(session.chatId, event, {
    sessionId: session.sessionId,
    chatId: session.chatId,
    gameKey: session.gameKey,
    status: session.status,
    updatedAt: session.updatedAt,
    payload: toPublicSession(session),
    ...extra,
  });
}

router.get('/chat/:chatId/sessions', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chatId } = req.params;
  await ensureChatAccess(chatId, req.user!.id);
  const rooms = await prisma.gameRoom.findMany({
    where: { roomId: { startsWith: `game:${chatId}:` } },
    orderBy: { createdAt: 'desc' },
    take: 48,
  });
  const items: any[] = [];
  for (const room of rooms) {
    const session = room.meta as unknown as GameSession | null;
    if (!session) continue;
    if (finalizeExpiredSession(session)) {
      await saveSession(session.sessionId, session);
    }
    items.push(toPublicSession(session, req.user!.id));
  }
  res.json({ items });
}));

router.get('/sessions/:sessionId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/chat/:chatId/sessions', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await assertGamesSchemaReady();
  logGameDebug('create-session:start', { chatId: req.params.chatId, userId: req.user!.id, body: req.body });

  const { chat, meMember } = await ensureChatAccess(req.params.chatId, req.user!.id);
const parsed = CreateSessionSchema.safeParse(req.body);

if (!parsed.success) {
  console.error('[games:create-session] validation error', {
    issues: parsed.error.issues,
    body: req.body,
  });

  return res.status(400).json({
    message: 'Invalid game session payload',
    issues: parsed.error.issues,
  });
}

const body = parsed.data;
  const participantIds = Array.from(new Set([req.user!.id, ...(body.participantUserIds ?? [])])).filter((userId) =>
    chat.members.some((member) => member.userId === userId),
  );
  const members: SessionMember[] = chat.members.map((member) => ({
    userId: member.userId,
    username: member.user.username,
    avatarUrl: member.user.avatarUrl ?? null,
    role: participantIds.includes(member.userId) ? 'player' : 'observer',
    status: participantIds.includes(member.userId) ? (member.userId === req.user!.id ? 'joined' : 'invited') : 'invited',
    seat: null,
    joinedAt: member.userId === req.user!.id ? nowIso() : null,
    leftAt: null,
    isReady: member.userId === req.user!.id,
  }));

  const sessionId = gameRoomId(chat.id);
  const session: GameSession = {
    version: 1,
    sessionId,
    roomId: sessionId,
    chatId: chat.id,
    gameKey: body.gameKey,
    title: body.title ?? (body.gameKey === 'POKER' ? 'Poker Night' : body.gameKey === 'FLAPPY' ? 'Flappy Rush' : body.gameKey === 'QUIZ' ? 'Своя игра' : 'Шашки'),
    status: 'CONFIG',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: req.user!.id,
    invitedUserIds: participantIds.filter((id) => id !== req.user!.id),
    members,
    config: body.gameKey === 'POKER' ? normalizePokerConfig(body.config) : body.gameKey === 'FLAPPY' ? normalizeFlappyConfig(body.config) : body.config ?? {},
    poker: null,
    flappy: null,
    result: null,
  };

  const systemText = buildSessionMessage('SESSION_CREATED', session, { note: `${session.title} готова к настройке` });
  await persistSessionCreate(sessionId, body.gameKey, session);
  await postSystemGameMessage(chat.id, meMember.userId, systemText);

  logGameDebug('create-session:success', { sessionId, chatId: chat.id, gameKey: body.gameKey });
  await emitGameUpdate(req, session, 'game:update', { reason: 'created' });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.patch('/sessions/:sessionId/config', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = UpdateSessionConfigSchema.parse(req.body);
  const { session } = await loadSession(req.params.sessionId);
  const { chat } = await ensureChatAccess(session.chatId, req.user!.id);
  if (session.createdBy !== req.user!.id) throw new HttpError(403, 'Only session creator can update the session');
  if (session.status !== 'CONFIG') throw new HttpError(400, 'Only lobby sessions can be edited');

  if (body.title) session.title = body.title;
  if (body.participantUserIds) {
    const participantIds = Array.from(new Set([session.createdBy, ...body.participantUserIds])).filter((userId) =>
      chat.members.some((member) => member.userId === userId),
    );
    syncSessionMembersWithParticipants(session, participantIds);
  }
  if (body.config && session.gameKey === 'POKER') {
    session.config = normalizePokerConfig({ ...session.config, ...body.config });
  } else if (body.config && session.gameKey === 'FLAPPY') {
    session.config = normalizeFlappyConfig({ ...session.config, ...body.config });
  } else if (body.config) {
    session.config = { ...session.config, ...body.config };
  }

  session.updatedAt = nowIso();
  await saveSession(session.sessionId, session);
  await emitGameUpdate(req, session, 'game:update', { reason: 'config_updated' });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/sessions/:sessionId/join', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = JoinSchema.parse(req.body);
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  const member = session.members.find((item) => item.userId === req.user!.id);
  if (!member) throw new HttpError(404, 'Session member not found');
  if (session.status === 'FINISHED' || session.status === 'CANCELLED') throw new HttpError(400, 'Session is closed');
  if (body.role) member.role = body.role;
  if (session.gameKey === 'POKER' && session.status === 'ACTIVE') {
    member.role = 'observer';
  }
  member.status = 'joined';
  member.joinedAt = member.joinedAt ?? nowIso();
  member.leftAt = null;
  if (session.status === 'CONFIG' && member.role === 'player') member.isReady = false;
  session.updatedAt = nowIso();
  await saveSession(session.sessionId, session);
  await emitGameUpdate(req, session, 'game:update', { reason: 'joined', userId: req.user!.id });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));


router.post('/sessions/:sessionId/ready', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = ReadySchema.parse(req.body);
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.status !== 'CONFIG') throw new HttpError(400, 'Readiness can only be changed in lobby');
  const member = session.members.find((item) => item.userId === req.user!.id);
  if (!member) throw new HttpError(404, 'Session member not found');
  if (member.role !== 'player') throw new HttpError(400, 'Observers cannot set ready state');
  if (member.status === 'left') throw new HttpError(400, 'Left members cannot set ready state');
  if (member.status !== 'joined') {
    member.status = 'joined';
    member.joinedAt = member.joinedAt ?? nowIso();
    member.leftAt = null;
  }
  member.isReady = body.isReady;
  session.updatedAt = nowIso();
  await saveSession(session.sessionId, session);
  await emitGameUpdate(req, session, 'game:update', { reason: 'ready_changed', userId: req.user!.id, isReady: body.isReady });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/sessions/:sessionId/leave', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  const member = session.members.find((item) => item.userId === req.user!.id);
  if (!member) throw new HttpError(404, 'Session member not found');
  member.status = 'left';
  member.leftAt = nowIso();
  member.isReady = false;
  session.updatedAt = nowIso();
  if (session.poker?.players.some((player) => player.userId === req.user!.id) && session.status === 'ACTIVE') {
    const player = session.poker.players.find((item) => item.userId === req.user!.id)!;
    player.folded = true;
    advancePokerState(session, req.user!.id);
  }
  if (session.status === 'ACTIVE' && session.members.filter((item) => item.role === 'player' && item.status !== 'left').length <= 0) {
    session.status = 'FINISHED';
    session.endedAt = nowIso();
    session.result = { winners: [], placements: [], reason: 'everyone_left', endedBy: req.user!.id };
  }
  await saveSession(session.sessionId, session);
  await emitGameUpdate(req, session, 'game:update', { reason: 'left', userId: req.user!.id });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/sessions/:sessionId/start', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.createdBy !== req.user!.id) throw new HttpError(403, 'Only session creator can start the game');
  if (session.status !== 'CONFIG') throw new HttpError(400, 'Session already started');
  if (session.gameKey !== 'POKER' && session.gameKey !== 'FLAPPY') throw new HttpError(400, 'This game is still in development');
  const lobbyPlayers = session.members.filter((item) => item.role === 'player');
  const minPlayers = session.gameKey === 'FLAPPY' ? 1 : 2;
  if (lobbyPlayers.length < minPlayers) throw new HttpError(400, session.gameKey === 'FLAPPY' ? 'At least one player is required' : 'At least two players are required');
  const waiting = lobbyPlayers.filter((item) => item.status !== 'joined' || !item.isReady);
  if (waiting.length) throw new HttpError(400, 'All players must join and confirm readiness before start');
  if (session.gameKey === 'POKER') {
    initPoker(session);
    scheduleActionTimer(session);
  } else if (session.gameKey === 'FLAPPY') {
    initFlappy(session);
  }
  await saveSession(session.sessionId, session);
  await postSystemGameMessage(session.chatId, req.user!.id, buildSessionMessage('SESSION_STARTED', session, { note: session.gameKey === 'FLAPPY' ? 'Flappy-сессия началась' : 'Покерная сессия началась' }));
  await emitGameUpdate(req, session, 'game:update', { reason: 'started' });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/sessions/:sessionId/cancel', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.createdBy !== req.user!.id) throw new HttpError(403, 'Only session creator can cancel the game');
  if (session.status === 'FINISHED' || session.status === 'CANCELLED') throw new HttpError(400, 'Session already closed');
  session.status = 'CANCELLED';
  session.endedAt = nowIso();
  session.updatedAt = nowIso();
  session.result = { winners: [], placements: [], reason: 'cancelled', endedBy: req.user!.id };
  if (session.poker) {
    session.poker.result = session.result;
    session.poker.endedAt = session.endedAt;
    session.poker.stage = 'finished';
    session.poker.turnUserId = null;
  }
  clearActionTimer(session.sessionId);
  clearShowdownTimer(session.sessionId);
  await saveSession(session.sessionId, session);
  await postSystemGameMessage(session.chatId, req.user!.id, buildSessionMessage('SESSION_FINISHED', session, { note: 'Игровая сессия была отменена' }));
  await emitGameUpdate(req, session, 'game:update', { reason: 'cancelled' });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));


router.delete('/sessions/:sessionId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.createdBy !== req.user!.id) throw new HttpError(403, 'Only session creator can delete the session');
  if (session.status === 'ACTIVE' || session.status === 'CONFIG') throw new HttpError(400, 'Delete is only available for closed sessions');
  await deleteSessionRecord(session.sessionId);
  latestEmitter?.emitToChat(session.chatId, 'game:update', {
    sessionId: session.sessionId,
    chatId: session.chatId,
    gameKey: session.gameKey,
    status: 'DELETED',
    updatedAt: nowIso(),
    reason: 'deleted',
  });
  res.json({ ok: true });
}));

router.post('/chat/:chatId/sessions/archive/clear', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { chat } = await ensureChatAccess(req.params.chatId, req.user!.id);
  const rooms = await prisma.gameRoom.findMany({ where: { roomId: { startsWith: `game:${chat.id}:` } } });
  let removed = 0;
  for (const room of rooms) {
    const session = room.meta as unknown as GameSession | null;
    if (!session) continue;
    if (session.createdBy !== req.user!.id) continue;
    if (session.status !== 'FINISHED' && session.status !== 'CANCELLED') continue;
    await deleteSessionRecord(session.sessionId);
    removed += 1;
  }
  latestEmitter?.emitToChat(chat.id, 'game:update', { chatId: chat.id, reason: 'archive_cleared', removed, updatedAt: nowIso() });
  res.json({ ok: true, removed });
}));

router.post('/sessions/:sessionId/flappy/attempt', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = FlappyAttemptSchema.parse(req.body);
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.gameKey !== 'FLAPPY' || !session.flappy) throw new HttpError(400, 'Flappy session is not active');
  if (session.status !== 'ACTIVE') throw new HttpError(400, 'Session is not active');
  if (hasProcessedIdempotency(session, 'flappy_attempt', req.user!.id, body.idempotencyKey)) {
    return res.json({ session: toPublicSession(session, req.user!.id) });
  }
  const state = session.flappy;
  const player = state.players.find((item) => item.userId === req.user!.id);
  if (!player) throw new HttpError(404, 'Player not found in flappy session');
  if (player.attemptsUsed >= state.maxAttempts) throw new HttpError(400, 'No attempts left');
  player.attemptsUsed += 1;
  player.lastScore = body.score;
  player.bestScore = Math.max(player.bestScore, body.score);
  player.lastAttemptAt = nowIso();
  player.attempts.push({ attempt: player.attemptsUsed, score: body.score, createdAt: player.lastAttemptAt });
  player.status = player.attemptsUsed >= state.maxAttempts ? 'done' : 'waiting';
  rememberIdempotency(session, 'flappy_attempt', req.user!.id, body.idempotencyKey);
  recomputeFlappyLeaderboard(state);
  session.updatedAt = nowIso();
  const activePlayerIds = new Set(session.members.filter((item) => item.role === 'player' && item.status !== 'left').map((item) => item.userId));
  const everyoneDone = state.players.filter((item) => activePlayerIds.has(item.userId)).every((item) => item.attemptsUsed >= state.maxAttempts);
  if (everyoneDone) {
    finishFlappySession(session);
    await postSystemGameMessage(session.chatId, req.user!.id, buildSessionMessage('SESSION_FINISHED', session, { note: 'Flappy-сессия завершена' }));
  }
  await saveSession(session.sessionId, session);
  await emitGameUpdate(req, session, 'game:update', { reason: 'flappy_attempt', userId: req.user!.id, score: body.score });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

router.post('/sessions/:sessionId/poker/action', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = PokerActionSchema.parse(req.body);
  const { session } = await loadSession(req.params.sessionId);
  await ensureChatAccess(session.chatId, req.user!.id);
  if (session.gameKey !== 'POKER' || !session.poker) throw new HttpError(400, 'Poker session is not active');
  if (session.status !== 'ACTIVE') throw new HttpError(400, 'Session is not active');
  if (hasProcessedIdempotency(session, 'poker_action', req.user!.id, body.idempotencyKey)) {
    return res.json({ session: toPublicSession(session, req.user!.id) });
  }
  const state = session.poker;
  if (state.turnUserId !== req.user!.id) throw new HttpError(409, 'Not your turn');
  const player = state.players.find((item) => item.userId === req.user!.id);
  if (!player || player.folded || player.allIn) throw new HttpError(400, 'Player cannot act');
  const toCall = Math.max(0, state.currentBet - player.roundBet);
  const stamp = nowIso();

  let loggedAmount: number | undefined = undefined;
  if (body.type === 'fold') {
    player.folded = true;
  } else if (body.type === 'check') {
    if (toCall > 0) throw new HttpError(400, 'Cannot check when bet is pending');
  } else if (body.type === 'call') {
    if (toCall <= 0) throw new HttpError(400, 'Nothing to call');
    const pay = Math.min(player.stack, toCall);
    player.stack -= pay;
    player.roundBet += pay;
    player.handBet += pay;
    state.pot += pay;
    loggedAmount = pay;
    if (player.stack === 0) player.allIn = true;
  } else if (body.type === 'bet') {
    if (state.currentBet > 0) throw new HttpError(400, 'Use raise when bet already exists');
    const amount = clampInt(body.amount ?? 0, session.config.bigBlind ?? 20, player.stack + player.roundBet);
    const pay = Math.min(player.stack, amount);
    player.stack -= pay;
    player.roundBet += pay;
    player.handBet += pay;
    state.pot += pay;
    state.currentBet = player.roundBet;
    loggedAmount = player.roundBet;
    if (player.stack === 0) player.allIn = true;
  } else if (body.type === 'raise') {
    if (state.currentBet === 0) throw new HttpError(400, 'Use bet before raise');
    const minRaiseTo = state.currentBet + (session.config.bigBlind ?? 20);
    const target = clampInt(body.amount ?? minRaiseTo, minRaiseTo, player.stack + player.roundBet);
    const pay = Math.min(player.stack, target - player.roundBet);
    player.stack -= pay;
    player.roundBet += pay;
    player.handBet += pay;
    state.pot += pay;
    state.currentBet = player.roundBet;
    loggedAmount = player.roundBet;
    if (player.stack === 0) player.allIn = true;
  }

  player.actedAt = stamp;
  player.lastAction = body.type;
  player.lastActionAmount = loggedAmount ?? null;
  player.hasActed = true;
  if (body.type === 'bet' || body.type === 'raise') {
    for (const other of state.players) {
      if (other.userId !== player.userId && !other.folded && !other.allIn) other.hasActed = false;
    }
  }
  state.actionLog.unshift({ id: uuid(), userId: req.user!.id, type: body.type, amount: loggedAmount, createdAt: stamp });
  rememberIdempotency(session, 'poker_action', req.user!.id, body.idempotencyKey);
  advancePokerState(session, req.user!.id);
  scheduleActionTimer(session);
  await saveSession(session.sessionId, session);
  if (session.status === 'FINISHED') {
    await postSystemGameMessage(session.chatId, req.user!.id, buildSessionMessage('SESSION_FINISHED', session, { note: 'Покерная сессия завершена' }));
  }
  await emitGameUpdate(req, session, 'game:update', { reason: 'poker_action', action: body.type, userId: req.user!.id });
  res.json({ session: toPublicSession(session, req.user!.id) });
}));

export default router;
