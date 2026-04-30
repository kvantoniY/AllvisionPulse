'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePokerActionMutation } from '@/shared/api/gamesApi';
import { logApiError } from '@/shared/lib/apiError';
import { playUiBeep } from '@/shared/lib/audio';
import type { Chat } from '@/shared/types/chat';
import type { GameSession, PokerPlayer, PokerResult } from '@/shared/types/game';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useResponsiveSurfaceSize } from '../lib/useResponsiveSurfaceSize';
import styles from './PokerTable.module.css';

const STAGES = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
const TABLE_BASE_WIDTH = 1350;
const TABLE_BASE_HEIGHT = 720;

type PokerTableProps = {
  session: GameSession;
  chat?: Chat;
  meId: string;
  compact?: boolean;
  immersive?: boolean;
  mobileViewport?: boolean;
  fullscreenActive: boolean;
  onToggleFullscreen: () => Promise<void> | void;
  onBack: () => void;
  onClose: () => void;
  onError: (message: string) => void;
};

function getChatUser(chat: Chat | undefined, userId: string) {
  return chat?.members.find((member) => member.userId === userId)?.user;
}

function getSessionMember(session: GameSession, userId: string) {
  return session.members.find((member) => member.userId === userId);
}

function getPlayerName(session: GameSession, chat: Chat | undefined, userId: string) {
  return getSessionMember(session, userId)?.username ?? getChatUser(chat, userId)?.username ?? 'Игрок';
}

function getPlayerAvatar(session: GameSession, chat: Chat | undefined, userId: string) {
  return getSessionMember(session, userId)?.avatarUrl ?? getChatUser(chat, userId)?.avatarUrl ?? undefined;
}

function formatStage(stage?: string | null) {
  return ({
    waiting: 'Ожидание',
    preflop: 'Префлоп',
    flop: 'Флоп',
    turn: 'Тёрн',
    river: 'Ривер',
    showdown: 'Шоудаун',
    finished: 'Завершено',
  } as Record<string, string>)[stage ?? ''] ?? 'Игра';
}

function formatSessionState(session: GameSession) {
  if (session.status === 'CONFIG') return 'Ожидание старта';
  if (session.status === 'ACTIVE') return 'Активная игра';
  if (session.status === 'CANCELLED') return 'Игра отменена';
  return 'Игра завершена';
}

function formatAction(type?: string | null, amount?: number | null) {
  if (!type) return 'Ожидание';
  const label = ({
    fold: 'Фолд',
    check: 'Чек',
    call: 'Колл',
    bet: 'Бет',
    raise: 'Рейз',
    system: 'Система',
  } as Record<string, string>)[type] ?? type;

  return typeof amount === 'number' && amount > 0 ? `${label} ${amount}` : label;
}

function formatSessionClock(session: GameSession) {
  const start = session.startedAt ?? session.createdAt;
  const end = session.endedAt ?? new Date().toISOString();
  const diff = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getSuit(card: string) {
  return ({ h: '♥', d: '♦', c: '♣', s: '♠' } as Record<string, string>)[card[1]] ?? '•';
}

function isRedCard(card: string) {
  return card[1] === 'h' || card[1] === 'd';
}

function connectionTone(status?: 'online' | 'reconnecting' | 'disconnected') {
  if (status === 'online') return 'online';
  if (status === 'reconnecting') return 'reconnecting';
  return 'offline';
}

function parsePokerCard(card: string) {
  const rankMap: Record<string, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };

  return {
    rank: rankMap[card[0]] ?? 0,
    suit: card[1],
  };
}

function combinations<T>(items: T[], choose: number): T[][] {
  const output: T[][] = [];

  const walk = (start: number, current: T[]) => {
    if (current.length === choose) {
      output.push([...current]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  };

  walk(0, []);
  return output;
}

function evaluateFive(cards: string[]) {
  const parsed = cards
    .map((card) => ({ card, ...parsePokerCard(card) }))
    .sort((left, right) => right.rank - left.rank);

  const counts = new Map<number, number>();
  const suits = new Map<string, number>();

  for (const card of parsed) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }

  const uniqueRanks = Array.from(new Set(parsed.map((card) => card.rank))).sort((left, right) => right - left);
  const straightRanks = [...uniqueRanks];
  if (uniqueRanks.includes(14)) straightRanks.push(1);

  let straightHigh = 0;
  for (let index = 0; index <= straightRanks.length - 5; index += 1) {
    const window = straightRanks.slice(index, index + 5);
    if (window[0] - window[4] === 4 && new Set(window).size === 5) {
      straightHigh = Math.max(straightHigh, window[0] === 1 ? 5 : window[0]);
      break;
    }
  }

  const flushSuit = Array.from(suits.entries()).find(([, count]) => count === 5)?.[0] ?? null;
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => (right.count === left.count ? right.rank - left.rank : right.count - left.count));

  if (flushSuit && straightHigh) return { category: 8, values: [straightHigh], cards };
  if (groups[0]?.count === 4) return { category: 7, values: [groups[0].rank, groups[1]?.rank ?? 0], cards };
  if (groups[0]?.count === 3 && groups[1]?.count === 2) return { category: 6, values: [groups[0].rank, groups[1].rank], cards };
  if (flushSuit) return { category: 5, values: parsed.map((card) => card.rank), cards };
  if (straightHigh) return { category: 4, values: [straightHigh], cards };
  if (groups[0]?.count === 3) {
    return {
      category: 3,
      values: [groups[0].rank, ...groups.slice(1).map((group) => group.rank).sort((left, right) => right - left)],
      cards,
    };
  }
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const pairRanks = groups.filter((group) => group.count === 2).map((group) => group.rank).sort((left, right) => right - left);
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return { category: 2, values: [...pairRanks, kicker], cards };
  }
  if (groups[0]?.count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank).sort((left, right) => right - left);
    return { category: 1, values: [groups[0].rank, ...kickers], cards };
  }

  return { category: 0, values: parsed.map((card) => card.rank), cards };
}

function compareHands(
  left: { category: number; values: number[] },
  right: { category: number; values: number[] },
) {
  if (left.category !== right.category) return left.category - right.category;

  const length = Math.max(left.values.length, right.values.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left.values[index] ?? 0) - (right.values[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function getBestHand(cards: string[]) {
  let best: { category: number; values: number[]; cards: string[] } | null = null;

  for (const combo of combinations(cards, 5)) {
    const current = evaluateFive(combo);
    if (!best || compareHands(current, best) > 0) {
      best = current;
    }
  }

  return best;
}

function getBlindTargets(players: PokerPlayer[], dealerIndex: number) {
  const playersBySeat = [...players].sort((left, right) => left.seat - right.seat);
  const dealerUserId = playersBySeat[dealerIndex % Math.max(1, playersBySeat.length)]?.userId ?? null;

  const smallBlindUserId = playersBySeat.length <= 1
    ? null
    : playersBySeat.length === 2
      ? dealerUserId
      : playersBySeat[(dealerIndex + 1) % playersBySeat.length]?.userId ?? null;

  const bigBlindUserId = playersBySeat.length <= 1
    ? null
    : playersBySeat.length === 2
      ? playersBySeat[(dealerIndex + 1) % playersBySeat.length]?.userId ?? null
      : playersBySeat[(dealerIndex + 2) % playersBySeat.length]?.userId ?? null;

  return {
    playersBySeat,
    dealerUserId,
    smallBlindUserId,
    bigBlindUserId,
  };
}

function ActionTimer({
  deadlineAt,
  duration = 20,
  serverNow,
  compact = false,
}: {
  deadlineAt?: string | null;
  duration?: number;
  serverNow?: string | null;
  compact?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(duration);

  useEffect(() => {
    if (!deadlineAt) {
      setSecondsLeft(duration);
      return undefined;
    }

    const deadlineMs = new Date(deadlineAt).getTime();
    const serverNowMs = serverNow ? new Date(serverNow).getTime() : null;
    const skew = serverNowMs ? Date.now() - serverNowMs : 0;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadlineMs - (Date.now() - skew)) / 1000));
      setSecondsLeft(remaining);
    };

    update();
    const intervalId = window.setInterval(update, 250);
    return () => window.clearInterval(intervalId);
  }, [deadlineAt, duration, serverNow]);

  const displayed = deadlineAt ? secondsLeft : duration;
  const progress = duration > 0 ? Math.max(0, Math.min(1, displayed / duration)) : 0;
  const urgent = deadlineAt ? displayed <= 5 : false;
  const ringStyle = {
    ['--timer-progress' as never]: `${progress * 360}deg`,
  } as CSSProperties;

  return (
    <div className={[styles.timer, compact ? styles.timerCompact : '', urgent ? styles.timerUrgent : ''].filter(Boolean).join(' ')}>
      <div className={styles.timerRing} style={ringStyle}>
        <span className={styles.timerInner}>{displayed}</span>
      </div>
      {!compact ? <span className={styles.timerSuffix}>с</span> : null}
    </div>
  );
}

function PlayingCard({
  card,
  compact = false,
  highlight = false,
}: {
  card: string;
  compact?: boolean;
  highlight?: boolean;
}) {
  if (card === '??') {
    return (
      <div className={[styles.card, compact ? styles.cardCompact : '', styles.cardHidden].filter(Boolean).join(' ')}>
        <span className={styles.cardBackPattern} />
      </div>
    );
  }

  return (
    <div
      className={[
        styles.card,
        compact ? styles.cardCompact : '',
        isRedCard(card) ? styles.cardRed : '',
        highlight ? styles.cardHighlight : '',
      ].filter(Boolean).join(' ')}
    >
      <span className={styles.cardRank}>{card[0]}</span>
      <span className={styles.cardSuit}>{getSuit(card)}</span>
      <span className={styles.cardMini}>{card[0]}{getSuit(card)}</span>
    </div>
  );
}

export function PokerTable({
  session,
  chat,
  meId,
  compact = false,
  immersive = false,
  mobileViewport = false,
  fullscreenActive,
  onToggleFullscreen,
  onBack,
  onClose,
  onError,
}: PokerTableProps) {
  const poker = session.poker;
  const [submitAction, { isLoading }] = usePokerActionMutation();
  const [amount, setAmount] = useState(Number(session.config?.bigBlind ?? 20));
  const [playersOpen, setPlayersOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const stageRef = useRef('');
  const actionRef = useRef('');

  const { containerRef, size } = useResponsiveSurfaceSize({
    aspectRatio: TABLE_BASE_WIDTH / TABLE_BASE_HEIGHT,
    minWidth: mobileViewport ? 540 : 680,
    minHeight: mobileViewport ? 280 : 420,
    maxWidth: 1500,
    maxHeight: immersive ? undefined : 900,
  });

  const tableWidth = size.width || TABLE_BASE_WIDTH;
  const tableHeight = size.height || TABLE_BASE_HEIGHT;
  const tableScale = Math.max(0.6, Math.min(1.1, Math.min(tableWidth / TABLE_BASE_WIDTH, tableHeight / TABLE_BASE_HEIGHT)));
  const tableStyle = {
    ['--table-width' as never]: `${tableWidth}px`,
    ['--table-height' as never]: `${tableHeight}px`,
    ['--table-scale' as never]: tableScale,
  } as CSSProperties;

  useEffect(() => {
    if (!poker) return;
    const currentActionKey = `${poker.actionLog?.[0]?.id ?? ''}:${poker.turnUserId ?? ''}`;
    if (stageRef.current && stageRef.current !== poker.stage) {
      void playUiBeep('start');
    }
    if (actionRef.current && actionRef.current !== currentActionKey && poker.turnUserId === meId) {
      void playUiBeep('message');
    }

    stageRef.current = poker.stage ?? '';
    actionRef.current = currentActionKey;
  }, [meId, poker]);

  if (!poker) return null;

  const me = poker.players.find((player) => player.userId === meId) ?? null;
  const { playersBySeat, dealerUserId, smallBlindUserId, bigBlindUserId } = getBlindTargets(poker.players, poker.dealerIndex);
  const opponents = playersBySeat.filter((player) => player.userId !== meId);
  const timerDuration = Number(poker.timerSec ?? session.config?.timerSec ?? 20);
  const bigBlind = Number(session.config?.bigBlind ?? 20);
  const smallBlind = Number(session.config?.smallBlind ?? Math.max(1, Math.floor(bigBlind / 2)));
  const toCall = me ? Math.max(0, poker.currentBet - me.roundBet) : 0;
  const myTurn = poker.turnUserId === meId;
  const canCheck = toCall === 0;
  const canBet = poker.currentBet === 0;
  const minRaiseTo = Math.max(bigBlind, poker.currentBet + bigBlind);
  const minActionAmount = canBet ? bigBlind : minRaiseTo;
  const maxActionAmount = Math.max(minActionAmount, (me?.stack ?? 0) + (me?.roundBet ?? 0));
  const currentStageIndex = Math.max(0, STAGES.indexOf((poker.stage as (typeof STAGES)[number]) ?? 'preflop'));
  const playersJoined = session.members.filter((member) => member.role === 'player' && member.status === 'joined').length;
  const latestAction = poker.actionLog?.[0] ?? null;
  const actionSummary = latestAction
    ? (latestAction.note ?? `${getPlayerName(session, chat, latestAction.userId)} • ${formatAction(latestAction.type, latestAction.amount)}`)
    : poker.turnUserId
      ? `Ход игрока ${getPlayerName(session, chat, poker.turnUserId)}`
      : 'Ожидаем действие за столом';

  const result = session.status === 'FINISHED' || session.status === 'CANCELLED'
    ? (session.result ?? poker.result)
    : (poker.lastCompletedHandResult ?? poker.result);

  const placementByUserId = useMemo(
    () => new Map((result?.placements ?? []).map((item) => [item.userId, item])),
    [result],
  );

  const highlightCardsByUser = useMemo(() => {
    const next = new Map<string, string[]>();

    for (const player of poker.players) {
      const placement = placementByUserId.get(player.userId);
      if (placement?.bestCards?.length) {
        next.set(player.userId, placement.bestCards);
        continue;
      }

      const revealedCards = player.cards.filter((card) => card !== '??');
      if (revealedCards.length !== 2 || poker.communityCards.length < 3) continue;
      const bestHand = getBestHand([...revealedCards, ...poker.communityCards]);
      if (bestHand?.cards?.length) next.set(player.userId, bestHand.cards);
    }

    return next;
  }, [placementByUserId, poker.communityCards, poker.players]);

  const winnerIds = new Set(result?.winners ?? []);
  const showResultState = Boolean(result && (poker.stage === 'showdown' || session.status !== 'ACTIVE'));
  const topStatus = showResultState
    ? (winnerIds.size > 1
      ? `Сплит-пот: ${(result?.winners ?? []).map((userId) => getPlayerName(session, chat, userId)).join(', ')}`
      : result?.winners?.[0]
        ? `${getPlayerName(session, chat, result.winners[0])} забирает банк`
        : 'Раздача завершена')
    : myTurn
      ? (toCall > 0 ? `Нужно ответить ${toCall}` : 'Можно чекнуть или сделать ставку')
      : actionSummary;

  const topStatusLabel = showResultState
    ? (session.status === 'FINISHED' ? 'Финал' : 'Победитель раздачи')
    : (myTurn ? 'Ваш ход' : formatStage(poker.stage));

  const compactMode = compact || fullscreenActive || immersive || tableWidth < 1240 || tableHeight < 720;
  const allowAction = Boolean(myTurn && me && !me.folded && !me.allIn && session.status === 'ACTIVE');
  const canSendBet = allowAction && maxActionAmount >= minActionAmount;

  const clampAmount = (nextAmount: number) => {
    if (!Number.isFinite(nextAmount)) return minActionAmount;
    return Math.max(minActionAmount, Math.min(maxActionAmount, Math.round(nextAmount)));
  };

  useEffect(() => {
    setAmount((current) => clampAmount(current));
  }, [minActionAmount, maxActionAmount]);

  const quickAmounts = useMemo(() => {
    const items = [
      { label: 'Мин', value: minActionAmount },
      { label: '2.5x', value: Math.round(bigBlind * 2.5) },
      { label: '3x', value: Math.round(bigBlind * 3) },
      { label: 'Пот', value: poker.pot + Math.max(toCall, bigBlind) },
    ];

    const seen = new Set<number>();
    return items
      .map((item) => ({ ...item, value: clampAmount(item.value) }))
      .filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
      });
  }, [bigBlind, minActionAmount, poker.pot, toCall, maxActionAmount]);

  const togglePlayers = () => {
    setPlayersOpen((current) => {
      const next = !current;
      if (next && mobileViewport) setLogOpen(false);
      return next;
    });
  };

  const toggleLog = () => {
    setLogOpen((current) => {
      const next = !current;
      if (next && mobileViewport) setPlayersOpen(false);
      return next;
    });
  };

  const submit = async (type: 'fold' | 'check' | 'call' | 'bet' | 'raise', requestedAmount?: number) => {
    try {
      onError('');
      await submitAction({
        sessionId: session.sessionId,
        type,
        amount: typeof requestedAmount === 'number' ? clampAmount(requestedAmount) : undefined,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      }).unwrap();
    } catch (error) {
      const message = logApiError('poker-action', error).message || 'Не удалось отправить действие';
      onError(message);
    }
  };

  const blindLabelFor = (userId?: string | null) => {
    if (!userId) return null;
    if (userId === smallBlindUserId) return 'SB';
    if (userId === bigBlindUserId) return 'BB';
    return null;
  };

  const opponentPositionClasses = (() => {
    if (opponents.length <= 1) return [styles.seatHeadsUp];
    if (opponents.length === 2) return [styles.seatTopLeft, styles.seatTopRight];
    if (opponents.length === 3) return [styles.seatTop, styles.seatLowerLeft, styles.seatLowerRight];
    if (opponents.length === 4) return [styles.seatUpperLeft, styles.seatUpperRight, styles.seatLowerLeft, styles.seatLowerRight];
    return [styles.seatTop, styles.seatUpperRight, styles.seatRightMid, styles.seatLeftMid, styles.seatUpperLeft];
  })();

  return (
    <div
      className={[
        styles.root,
        compactMode ? styles.rootCompact : '',
        immersive ? styles.rootImmersive : '',
        mobileViewport ? styles.rootMobile : '',
      ].filter(Boolean).join(' ')}
    >
      <header className={styles.topChrome}>
        <div className={styles.topMain}>
          <div className={styles.titleBadge}>
            <span className={styles.titleBadgeInner}>♠</span>
          </div>

          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{session.title}</h2>
            <div className={styles.subtitle}>Покер · {formatSessionState(session)}</div>
            <div className={styles.titlePills}>
              <span className={[styles.softPill, styles.softPillSuccess].join(' ')}>{playersJoined} игрока</span>
              <span className={styles.softPill}>
                <Icon name="clock" size={14} />
                {formatSessionClock(session)}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.chromeControls}>
          <button type="button" className={styles.iconButton} onClick={onBack} aria-label="Назад" title="Назад">
            <Icon name="arrowLeft" size={18} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => void onToggleFullscreen()}
            aria-label={fullscreenActive ? 'Свернуть' : 'На весь экран'}
            title={fullscreenActive ? 'Свернуть' : 'На весь экран'}
          >
            <Icon name={fullscreenActive ? 'arrowDown' : 'expand'} size={18} />
          </button>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Закрыть" title="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <div className={styles.metaChrome}>
        <div className={styles.handMeta}>
          <strong className={styles.handNumber}>Раздача #{poker.handNumber ?? 1}</strong>
        </div>

        <div className={styles.stageRail}>
          {STAGES.map((stage, index) => (
            <span
              key={stage}
              className={[
                styles.stagePill,
                stage === poker.stage ? styles.stagePillCurrent : '',
                index < currentStageIndex ? styles.stagePillDone : '',
              ].filter(Boolean).join(' ')}
            >
              {formatStage(stage)}
            </span>
          ))}
        </div>

        <div className={styles.metricRail}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Банк</span>
            <strong className={styles.metricValue}>{poker.pot}</strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Блайнды</span>
            <strong className={styles.metricValue}>{smallBlind} / {bigBlind}</strong>
          </div>
          <div className={[styles.metricCard, styles.metricTimer].join(' ')}>
            <ActionTimer deadlineAt={poker.actionDeadlineAt} duration={timerDuration} serverNow={session.serverNow} compact />
            <div className={styles.metricTimerCopy}>
              <span className={styles.metricLabel}>Таймер</span>
              <strong className={styles.metricValue}>{timerDuration}с</strong>
            </div>
          </div>
          <button
            type="button"
            className={[styles.switchButton, playersOpen ? styles.switchButtonActive : ''].join(' ')}
            onClick={togglePlayers}
          >
            <Icon name="users" size={15} />
            Игроки
          </button>
          <button
            type="button"
            className={[styles.switchButton, logOpen ? styles.switchButtonActive : ''].join(' ')}
            onClick={toggleLog}
          >
            <Icon name="menu" size={15} />
            Лог
          </button>
        </div>
      </div>

      <div className={styles.arena}>
        {!mobileViewport ? (
          <>
            <button
              type="button"
              className={[styles.sideRailButton, styles.sideRailButtonLeft, playersOpen ? styles.sideRailButtonActive : ''].join(' ')}
              onClick={togglePlayers}
            >
              <Icon name="users" size={16} />
              <span>Игроки</span>
              <strong>{playersJoined}/{playersBySeat.length}</strong>
            </button>
            <button
              type="button"
              className={[styles.sideRailButton, styles.sideRailButtonRight, logOpen ? styles.sideRailButtonActive : ''].join(' ')}
              onClick={toggleLog}
            >
              <Icon name="menu" size={16} />
              <span>Лог</span>
              <strong>{poker.actionLog.length}</strong>
            </button>
          </>
        ) : null}

        <div ref={containerRef} className={styles.measure}>
          <div className={styles.surface} style={tableStyle}>
            <div className={styles.tableShell}>
              {playersOpen ? (
                <aside className={[styles.drawer, styles.drawerLeft].join(' ')}>
                  <div className={styles.drawerHeader}>
                    <strong>Игроки</strong>
                    <button type="button" className={styles.drawerClose} onClick={togglePlayers} aria-label="Скрыть игроков">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className={styles.drawerList}>
                    {playersBySeat.map((player) => {
                      const member = getSessionMember(session, player.userId);
                      const status = connectionTone(member?.connectionStatus);
                      return (
                        <div
                          key={player.userId}
                          className={[styles.drawerRow, poker.turnUserId === player.userId ? styles.drawerRowActive : ''].filter(Boolean).join(' ')}
                        >
                          <div className={styles.drawerIdentity}>
                            <Avatar
                              url={getPlayerAvatar(session, chat, player.userId)}
                              name={getPlayerName(session, chat, player.userId)}
                              size={28}
                              status={status === 'online' ? 'online' : 'offline'}
                            />
                            <div className={styles.drawerIdentityCopy}>
                              <strong>{getPlayerName(session, chat, player.userId)}</strong>
                              <span>
                                {blindLabelFor(player.userId) ? `${blindLabelFor(player.userId)} · ` : ''}
                                {player.folded ? 'Фолд' : player.allIn ? 'Олл-ин' : 'В игре'}
                              </span>
                            </div>
                          </div>
                          <div className={styles.drawerStats}>
                            <span>{player.stack}</span>
                            <span className={[
                              styles.connectionPill,
                              status === 'online' ? styles.connectionPillOnline : status === 'reconnecting' ? styles.connectionPillReconnect : styles.connectionPillOffline,
                            ].join(' ')}
                            >
                              {status === 'online' ? 'online' : status === 'reconnecting' ? 'reconnecting' : 'offline'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              ) : null}

              {logOpen ? (
                <aside className={[styles.drawer, styles.drawerRight].join(' ')}>
                  <div className={styles.drawerHeader}>
                    <strong>Лог</strong>
                    <button type="button" className={styles.drawerClose} onClick={toggleLog} aria-label="Скрыть лог">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className={styles.drawerList}>
                    {poker.actionLog.slice(0, compactMode ? 8 : 12).map((item) => (
                      <div key={item.id} className={styles.logRow}>
                        <div className={styles.logTitle}>{getPlayerName(session, chat, item.userId)}</div>
                        <div className={styles.logText}>{item.note ?? formatAction(item.type, item.amount)}</div>
                      </div>
                    ))}
                  </div>
                </aside>
              ) : null}

              {opponents.map((player, index) => {
                const member = getSessionMember(session, player.userId);
                const blindLabel = blindLabelFor(player.userId);
                const status = connectionTone(member?.connectionStatus);
                const highlightedCards = new Set(highlightCardsByUser.get(player.userId) ?? []);

                return (
                  <article
                    key={player.userId}
                    className={[
                      styles.seat,
                      opponentPositionClasses[index] ?? styles.seatTop,
                      poker.turnUserId === player.userId ? styles.seatActive : '',
                      player.folded ? styles.seatFolded : '',
                      winnerIds.has(player.userId) ? styles.seatWinner : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className={styles.seatTopBar}>
                      <div className={styles.avatarWrap}>
                        <Avatar
                          url={getPlayerAvatar(session, chat, player.userId)}
                          name={getPlayerName(session, chat, player.userId)}
                          size={Math.max(28, Math.round((compactMode ? 30 : 34) * tableScale))}
                          status={status === 'online' ? 'online' : 'offline'}
                        />
                        {dealerUserId === player.userId ? <span className={styles.dealerChip}>D</span> : null}
                      </div>

                      <div className={styles.seatIdentity}>
                        <strong>{getPlayerName(session, chat, player.userId)}</strong>
                        <span>{player.stack}</span>
                      </div>

                      {blindLabel ? <span className={styles.blindChip}>{blindLabel}</span> : null}
                    </div>

                    <div className={styles.seatCards}>
                      {player.cards.map((card, cardIndex) => (
                        <PlayingCard key={`${player.userId}-${cardIndex}-${card}`} card={card} compact highlight={highlightedCards.has(card)} />
                      ))}
                    </div>

                    <div className={styles.seatBadges}>
                      <span className={[styles.stateChip, player.lastAction ? styles.stateChipAction : ''].filter(Boolean).join(' ')}>
                        {player.folded ? 'Фолд' : player.allIn ? 'Олл-ин' : player.lastAction ? formatAction(player.lastAction, player.lastActionAmount) : 'В игре'}
                      </span>
                      <span className={[
                        styles.stateChip,
                        status === 'online'
                          ? styles.stateChipOnline
                          : status === 'reconnecting'
                            ? styles.stateChipReconnect
                            : styles.stateChipOffline,
                      ].join(' ')}
                      >
                        {status === 'online' ? 'online' : status === 'reconnecting' ? 'reconnecting' : 'offline'}
                      </span>
                    </div>

                    {player.roundBet > 0 ? <span className={styles.betChip}>{player.roundBet}</span> : null}
                  </article>
                );
              })}

              <div className={styles.boardCluster}>
                <div className={styles.potBadge}>Банк: {poker.pot}</div>
                <div className={styles.boardCards}>
                  {Array.from({ length: 5 }).map((_, index) => {
                    const card = poker.communityCards[index] ?? '??';
                    const highlighted = card !== '??' && Array.from(highlightCardsByUser.values()).some((cards) => cards.includes(card));
                    return <PlayingCard key={`${card}-${index}`} card={card} highlight={highlighted} />;
                  })}
                </div>
                <div className={styles.boardStatus}>
                  <span className={styles.boardStatusStage}>{formatStage(poker.stage)}</span>
                  <strong className={styles.boardStatusValue}>{topStatus}</strong>
                </div>
              </div>

              {showResultState ? (
                <div className={styles.resultBanner}>
                  <span className={styles.resultBannerLabel}>{session.status === 'FINISHED' ? 'Финал' : 'Итог раздачи'}</span>
                  <strong className={styles.resultBannerValue}>{topStatus}</strong>
                </div>
              ) : null}

              <article
                className={[
                  styles.heroSeat,
                  myTurn ? styles.heroSeatActive : '',
                  me?.folded ? styles.heroSeatFolded : '',
                  winnerIds.has(meId) ? styles.heroSeatWinner : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={styles.heroIdentity}>
                  <div className={styles.avatarWrap}>
                    <Avatar
                      url={getPlayerAvatar(session, chat, meId)}
                      name={getPlayerName(session, chat, meId)}
                      size={Math.max(32, Math.round((compactMode ? 34 : 38) * tableScale))}
                      status={connectionTone(getSessionMember(session, meId)?.connectionStatus) === 'online' ? 'online' : 'offline'}
                    />
                    {dealerUserId === meId ? <span className={styles.dealerChip}>D</span> : null}
                  </div>

                  <div className={styles.heroCopy}>
                    <strong>{getPlayerName(session, chat, meId)}</strong>
                    <span>{me?.stack ?? 0}</span>
                  </div>

                  <div className={styles.heroMeta}>
                    {blindLabelFor(meId) ? <span className={styles.blindChip}>{blindLabelFor(meId)}</span> : null}
                    <span className={[styles.stateChip, styles.stateChipAction].join(' ')}>
                      {me?.folded ? 'Фолд' : me?.allIn ? 'Олл-ин' : me?.lastAction ? formatAction(me.lastAction, me.lastActionAmount) : 'В игре'}
                    </span>
                  </div>
                </div>

                <div className={styles.heroCards}>
                  {(me?.cards ?? ['??', '??']).map((card, index) => (
                    <PlayingCard key={`${meId}-${index}-${card}`} card={card} highlight={(highlightCardsByUser.get(meId) ?? []).includes(card)} />
                  ))}
                </div>

                {me && me.roundBet > 0 ? <span className={styles.heroBetChip}>{me.roundBet}</span> : null}
              </article>
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.bottomDock}>
        <section className={styles.statusCard}>
          <ActionTimer deadlineAt={poker.actionDeadlineAt} duration={timerDuration} serverNow={session.serverNow} />
          <div className={styles.statusCopy}>
            <span className={styles.statusLabel}>{topStatusLabel}</span>
            <strong className={styles.statusValue}>{topStatus}</strong>
          </div>
        </section>

        <section className={styles.betCard}>
          <div className={styles.betCardHeader}>
            <span className={styles.betCardLabel}>Сумма ставки</span>
            <strong className={styles.betCardValue}>{amount}</strong>
          </div>

          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepButton}
              onClick={() => setAmount((current) => clampAmount(current - bigBlind))}
              disabled={!canSendBet || isLoading}
            >
              −
            </button>
            <div className={styles.amountDisplay}>{amount}</div>
            <button
              type="button"
              className={styles.stepButton}
              onClick={() => setAmount((current) => clampAmount(current + bigBlind))}
              disabled={!canSendBet || isLoading}
            >
              +
            </button>
          </div>

          <div className={styles.quickRow}>
            {quickAmounts.map((item) => (
              <button
                key={item.label}
                type="button"
                className={[styles.quickButton, amount === item.value ? styles.quickButtonActive : ''].filter(Boolean).join(' ')}
                onClick={() => setAmount(item.value)}
                disabled={!canSendBet || isLoading}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.actionsCard}>
          <button
            type="button"
            className={[styles.actionButton, styles.actionDanger].join(' ')}
            disabled={!allowAction || isLoading}
            onClick={() => void submit('fold')}
          >
            Фолд
          </button>
          <button
            type="button"
            className={[styles.actionButton, styles.actionGhost].join(' ')}
            disabled={!allowAction || isLoading || !canCheck}
            onClick={() => void submit('check')}
          >
            Чек
          </button>
          <button
            type="button"
            className={[styles.actionButton, styles.actionGhost].join(' ')}
            disabled={!allowAction || isLoading || canCheck}
            onClick={() => void submit('call')}
          >
            {canCheck ? 'Колл' : `Колл ${toCall}`}
          </button>
          <button
            type="button"
            className={[styles.actionButton, styles.actionPrimary].join(' ')}
            disabled={!canSendBet || isLoading}
            onClick={() => void submit(canBet ? 'bet' : 'raise', amount)}
          >
            {canBet ? `Бет ${amount}` : `Рейз до ${amount}`}
          </button>
        </section>
      </footer>
    </div>
  );
}
