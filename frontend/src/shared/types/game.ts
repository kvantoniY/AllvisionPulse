export type GameKey = 'POKER' | 'FLAPPY' | 'QUIZ' | 'CHECKERS';
export type GameStatus = 'CONFIG' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type GameMemberRole = 'player' | 'observer';
export type PokerStage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export type GameMember = {
  userId: string;
  username?: string | null;
  avatarUrl?: string | null;
  role: GameMemberRole;
  status: 'invited' | 'joined' | 'left';
  seat: number | null;
  joinedAt: string | null;
  leftAt: string | null;
  isReady?: boolean;
  connectionStatus?: 'online' | 'reconnecting' | 'disconnected';
};

export type PokerPlayer = {
  userId: string;
  seat: number;
  cards: string[];
  stack: number;
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  handBet: number;
  lastAction?: string | null;
  lastActionAmount?: number | null;
  hasActed?: boolean;
};

export type PokerResult = {
  winners: string[];
  placements: { userId: string; amount: number; handLabel?: string }[];
  reason: 'winner' | 'cancelled' | 'everyone_left';
  endedBy?: string | null;
};

export type PokerState = {
  stage: PokerStage;
  startedAt: string | null;
  endedAt: string | null;
  communityCards: string[];
  players: PokerPlayer[];
  dealerIndex: number;
  turnUserId: string | null;
  currentBet: number;
  pot: number;
  actionLog: { id: string; userId: string; type: string; amount?: number; createdAt: string; note?: string }[];
  result: PokerResult | null;
  handNumber?: number;
  actionDeadlineAt?: string | null;
  timerSec?: number;
  lastCompletedHandResult?: PokerResult | null;
  showdownMessage?: string | null;
  showdownEndsAt?: string | null;
};

export type FlappyAttempt = {
  attempt: number;
  score: number;
  createdAt: string;
};

export type FlappyPlayer = {
  userId: string;
  seat: number;
  attemptsUsed: number;
  bestScore: number;
  lastScore: number;
  lastAttemptAt: string | null;
  attempts: FlappyAttempt[];
  status: 'waiting' | 'playing' | 'done';
};

export type FlappyState = {
  startedAt: string | null;
  endedAt: string | null;
  maxAttempts: number;
  players: FlappyPlayer[];
  leaderboard: { userId: string; bestScore: number; attemptsUsed: number; lastScore: number }[];
  result: PokerResult | null;
};

export type GameSession = {
  version: number;
  serverNow?: string;

  sessionId: string;
  roomId: string;
  chatId: string;
  gameKey: GameKey;
  title: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  invitedUserIds: string[];
  members: GameMember[];
  config: Record<string, any>;
  startedAt?: string | null;
  endedAt?: string | null;
  poker?: PokerState | null;
  flappy?: FlappyState | null;
  result?: PokerResult | null;
};

export type GameSystemEvent = {
  kind: 'SESSION_CREATED' | 'SESSION_STARTED' | 'SESSION_FINISHED';
  sessionId: string;
  gameKey: GameKey;
  title: string;
  status: GameStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
  result?: PokerResult | null;
};
