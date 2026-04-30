'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import {
  useCancelGameSessionMutation,
  useClearArchivedGameSessionsMutation,
  useCreateGameSessionMutation,
  useDeleteGameSessionMutation,
  useFlappyAttemptMutation,
  useGetGameSessionQuery,
  useGetGameSessionsQuery,
  useJoinGameSessionMutation,
  useLeaveGameSessionMutation,
  usePokerActionMutation,
  useSetGameReadyMutation,
  useStartGameSessionMutation,
  useUpdateGameSessionConfigMutation,
} from '@/shared/api/gamesApi';
import { logApiError } from '@/shared/lib/apiError';
import { playUiBeep } from '@/shared/lib/audio';
import type { Chat } from '@/shared/types/chat';
import type { GameKey, GameSession, PokerResult } from '@/shared/types/game';
import styles from './GameSessionPanel.module.css';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Modal } from '@/shared/ui/Modal/Modal';
import { GameFrame } from './ui/GameFrame';
import { PokerTable } from './ui/PokerTable';
import { getGamePresentationSpec } from './lib/gamePresentation';
import type { FullscreenScope, GameViewState } from './lib/useGameFullscreen';
import { useResponsiveSurfaceSize } from './lib/useResponsiveSurfaceSize';

type GameCatalogItem = {
  key: GameKey;
  title: string;
  preview: string;
  status: 'ready' | 'beta' | 'development';
  description: string;
};

const GAME_CATALOG: GameCatalogItem[] = [
  {
    key: 'POKER',
    title: 'Покер',
    preview: '🂡',
    status: 'beta',
    description: 'Техасский холдем. Уже можно играть, но часть продвинутых сценариев ещё допиливается.',
  },
  {
    key: 'FLAPPY',
    title: 'Flappy Rush',
    preview: '🐦',
    status: 'beta',
    description: 'Аркада в духе Flappy Bird, но с более сочной сценой, понятным счётом и короткими забегами на лучший результат.',
  },
  {
    key: 'QUIZ',
    title: 'Своя игра',
    preview: '❓',
    status: 'development',
    description: 'Конструктор вопросов, категории и раунды ещё в разработке.',
  },
  {
    key: 'CHECKERS',
    title: 'Шашки',
    preview: '⚪',
    status: 'development',
    description: 'Базовая игровая механика и матчмейкинг ещё собираются.',
  },
];
const STAGES = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
const POKER_TABLE_BASE_WIDTH = 1360;
const POKER_TABLE_BASE_HEIGHT = 560;
const FLAPPY_CANVAS_BASE_WIDTH = 420;
const FLAPPY_CANVAS_BASE_HEIGHT = 720;
type GameSessionPanelMode = 'chat' | 'call';

type GameSessionPanelProps = {
  chat?: Chat;
  meId: string;
  mode?: GameSessionPanelMode;
  embedded?: boolean;
  fullscreenScope?: FullscreenScope;
  onFullscreenScopeChange?: (scope: FullscreenScope) => void;
  onViewStateChange?: (state: GameViewState) => void;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function getUser(chat: Chat | undefined, userId: string) {
  return chat?.members.find((m) => m.userId === userId)?.user;
}
function getName(chat: Chat | undefined, userId: string) {
  return getUser(chat, userId)?.username ?? 'Игрок';
}
function formatStage(stage?: string | null) {
  return ({ waiting: 'Ожидание', preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер', showdown: 'Шоудаун', finished: 'Завершена' } as Record<string, string>)[stage ?? ''] ?? '—';
}
function formatAction(type?: string | null, amount?: number | null) {
  if (!type) return 'Ожидание';
  const label = ({ fold: 'Фолд', check: 'Чек', call: 'Колл', bet: 'Бет', raise: 'Рейз', system: 'Система' } as Record<string, string>)[type] ?? type;
  return amount ? `${label} ${amount}` : label;
}
function suit(card: string) { return ({ h: '♥', d: '♦', c: '♣', s: '♠' } as Record<string, string>)[card[1]] ?? '•'; }
function red(card: string) { return card[1] === 'h' || card[1] === 'd'; }
function notifyError(setter: (v: string) => void, scope: string, error: unknown) {
  const message = logApiError(scope, error).message || 'Что-то пошло не так';
  setter(message);
}
function gameTitle(key: GameKey) {
  return GAME_CATALOG.find((item) => item.key === key)?.title ?? key;
}
function gamePreview(key?: GameKey | null) {
  return GAME_CATALOG.find((item) => item.key === key)?.preview ?? '🎮';
}
function gameConfigDefaults(gameKey: GameKey) {
  if (gameKey === 'POKER') {
    return { buyIn: 1000, smallBlind: 10, bigBlind: 20, timerSec: 20, maxPlayers: 6, allowObservers: true };
  }
  if (gameKey === 'FLAPPY') {
    return { maxAttempts: 5, allowObservers: true };
  }
  return {};
}

function formatPlayerCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} игрок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} игрока`;
  return `${count} игроков`;
}

function gameDescription(key: GameKey) {
  return GAME_CATALOG.find((item) => item.key === key)?.description ?? 'Игровое лобби готово к запуску.';
}

function lobbyRulesText(gameKey: GameKey) {
  if (gameKey === 'FLAPPY') {
    return 'Игроки заходят в лобби и подтверждают готовность. После старта каждый получает ограниченное число попыток.';
  }
  return 'Создатель выбирает состав участников. Старт доступен только после того, как все игроки войдут в лобби и подтвердят готовность.';
}

function lobbySettingItems(session: GameSession) {
  if (session.gameKey === 'POKER') {
    return [
      { label: 'BUY-IN', value: String(session.config?.buyIn ?? 1000), icon: 'sparkles' as const, tone: 'gold' as const },
      { label: 'Блайнды', value: `${session.config?.smallBlind ?? 10}/${session.config?.bigBlind ?? 20}`, icon: 'repeat' as const, tone: 'green' as const },
      { label: 'Таймер', value: `${session.config?.timerSec ?? 20} сек`, icon: 'clock' as const, tone: 'violet' as const },
      { label: 'Макс. игроков', value: String(session.config?.maxPlayers ?? 6), icon: 'users' as const, tone: 'blue' as const },
    ];
  }

  if (session.gameKey === 'FLAPPY') {
    return [
      { label: 'Попытки', value: String(session.config?.maxAttempts ?? 5), icon: 'play' as const, tone: 'gold' as const },
      { label: 'Формат', value: 'Лучший результат', icon: 'game' as const, tone: 'green' as const },
    ];
  }

  return [
    { label: 'Статус', value: 'Скоро', icon: 'game' as const, tone: 'gold' as const },
  ];
}

type HandEvaluation = {
  category: number;
  values: number[];
  label: string;
  cards: string[];
};

type FlappyMetrics = {
  scale: number;
  groundHeight: number;
  pipeWidth: number;
  pipeGap: number;
  pipeGapHalf: number;
  pipeSpawnDistance: number;
  pipeSpeed: number;
  gravity: number;
  flapVelocity: number;
  birdX: number;
  birdRadius: number;
  birdEyeX: number;
  birdEyeOffsetY: number;
  birdEyeRadius: number;
  playAreaTop: number;
  playAreaBottom: number;
  playAreaHeight: number;
  pipeMinY: number;
  pipeMaxY: number;
  scoreBoxWidth: number;
  scoreBoxHeight: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parsePokerCard(card: string) {
  const rankChar = card[0];
  const suitChar = card[1];
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
  return { rank: rankMap[rankChar] ?? 0, suit: suitChar };
}

function combinations<T>(items: T[], choose: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === choose) {
      out.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
}

function pokerHandLabel(category: number, values: number[]) {
  const top = values[0] ?? 0;
  const rankName = (rank: number) => ({
    14: 'туза',
    13: 'короля',
    12: 'даму',
    11: 'валета',
    10: 'десятку',
    9: 'девятку',
    8: 'восьмерку',
    7: 'семерку',
    6: 'шестерку',
    5: 'пятерку',
    4: 'четверку',
    3: 'тройку',
    2: 'двойку',
  }[rank] ?? 'карту');

  if (category === 8) return top === 14 ? 'Роял-флеш' : `Стрит-флеш до ${rankName(top)}`;
  if (category === 7) return `Каре ${rankName(top)}`;
  if (category === 6) return `Фулл-хаус с ${rankName(top)}`;
  if (category === 5) return `Флеш до ${rankName(top)}`;
  if (category === 4) return `Стрит до ${rankName(top)}`;
  if (category === 3) return `Сет ${rankName(top)}`;
  if (category === 2) return `Две пары: ${rankName(values[0] ?? 0)} и ${rankName(values[1] ?? 0)}`;
  if (category === 1) return `Пара ${rankName(top)}`;
  return `Старшая карта ${rankName(top)}`;
}

function evaluatePokerFive(cards: string[]): HandEvaluation {
  const parsed = cards
    .map((card) => ({ card, ...parsePokerCard(card) }))
    .sort((a, b) => b.rank - a.rank);

  const counts = new Map<number, number>();
  const suits = new Map<string, number>();
  for (const card of parsed) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  }

  const uniqueRanks = Array.from(new Set(parsed.map((card) => card.rank))).sort((a, b) => b - a);
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
    .sort((a, b) => (b.count === a.count ? b.rank - a.rank : b.count - a.count));

  const score = (category: number, values: number[]): HandEvaluation => ({
    category,
    values,
    label: pokerHandLabel(category, values),
    cards: cards.slice(),
  });

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

function comparePokerHands(a: Pick<HandEvaluation, 'category' | 'values'>, b: Pick<HandEvaluation, 'category' | 'values'>) {
  if (a.category !== b.category) return a.category - b.category;
  const length = Math.max(a.values.length, b.values.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a.values[index] ?? 0) - (b.values[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getBestPokerHand(cards: string[]) {
  let best: HandEvaluation | null = null;
  for (const combo of combinations(cards, 5)) {
    const current = evaluatePokerFive(combo);
    if (!best || comparePokerHands(current, best) > 0) best = current;
  }
  return best ?? { category: 0, values: [0], label: 'Старшая карта', cards: cards.slice(0, 5) };
}

function createFlappyMetrics(width: number, height: number): FlappyMetrics {
  const scale = width / FLAPPY_CANVAS_BASE_WIDTH;
  const groundHeight = clampNumber(height * 0.105, 42 * scale, 88 * scale);
  const maxPlayableHeight = Math.min(height - groundHeight - (20 * scale), FLAPPY_CANVAS_BASE_HEIGHT * scale);
  const playAreaHeight = clampNumber(maxPlayableHeight, 320 * scale, height - groundHeight - (18 * scale));
  const playAreaTop = Math.max(18 * scale, ((height - groundHeight) - playAreaHeight) / 2);
  const playAreaBottom = playAreaTop + playAreaHeight;
  const pipeGap = clampNumber(playAreaHeight * 0.3, 152 * scale, 214 * scale);
  const pipeGapHalf = pipeGap / 2;
  const pipeMargin = Math.max(58 * scale, pipeGapHalf + 28 * scale);
  return {
    scale,
    groundHeight,
    pipeWidth: clampNumber(58 * scale, 48 * scale, 86 * scale),
    pipeGap,
    pipeGapHalf,
    pipeSpawnDistance: clampNumber(width * 0.42, 160 * scale, 236 * scale),
    pipeSpeed: 2.72 * scale,
    gravity: 0.43 * scale,
    flapVelocity: -5.95 * scale,
    birdX: 92 * scale,
    birdRadius: 15 * scale,
    birdEyeX: 98 * scale,
    birdEyeOffsetY: 4 * scale,
    birdEyeRadius: Math.max(2, 3 * scale),
    playAreaTop,
    playAreaBottom,
    playAreaHeight,
    pipeMinY: playAreaTop + pipeMargin,
    pipeMaxY: playAreaBottom - pipeMargin,
    scoreBoxWidth: clampNumber(110 * scale, 96 * scale, 156 * scale),
    scoreBoxHeight: clampNumber(66 * scale, 58 * scale, 88 * scale),
  };
}

function playFlappySound(type: 'start' | 'flap' | 'score' | 'hit') {
  if (type === 'start') {
    void playUiBeep({ frequency: 520, durationMs: 90, gainValue: 0.028 });
    window.setTimeout(() => void playUiBeep({ frequency: 720, durationMs: 110, gainValue: 0.03 }), 78);
    return;
  }
  if (type === 'flap') {
    void playUiBeep({ frequency: 640, durationMs: 60, gainValue: 0.022 });
    return;
  }
  if (type === 'score') {
    void playUiBeep({ frequency: 860, durationMs: 74, gainValue: 0.028 });
    window.setTimeout(() => void playUiBeep({ frequency: 1120, durationMs: 90, gainValue: 0.025 }), 52);
    return;
  }
  void playUiBeep({ frequency: 220, durationMs: 130, gainValue: 0.03 });
  window.setTimeout(() => void playUiBeep({ frequency: 160, durationMs: 160, gainValue: 0.026 }), 72);
}

function formatSessionClock(session: GameSession) {
  const start = session.startedAt ?? session.createdAt;
  const end = session.endedAt ?? new Date().toISOString();
  const diff = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function sessionStageLabel(session: GameSession) {
  if (session.status === 'CONFIG') return 'Лобби';
  if (session.status === 'ACTIVE') return session.poker ? formatStage(session.poker.stage) : 'В игре';
  if (session.status === 'CANCELLED') return 'Отменена';
  return 'Завершена';
}

function connectionStatusLabel(status?: 'online' | 'reconnecting' | 'disconnected') {
  if (status === 'online') return 'online';
  if (status === 'reconnecting') return 'reconnecting';
  return 'offline';
}

function connectionStatusTone(status?: 'online' | 'reconnecting' | 'disconnected') {
  if (status === 'online') return 'online';
  if (status === 'reconnecting') return 'reconnecting';
  return 'offline';
}

function Card({ card, compact = false, highlight = false }: { card: string; compact?: boolean; highlight?: boolean }) {
  if (card === '??') return <div className={[styles.card, compact ? styles.cardSm : '', styles.cardBack].join(' ')} />;
  return (
    <div className={[styles.card, compact ? styles.cardSm : '', red(card) ? styles.cardRed : '', highlight ? styles.cardHighlight : ''].join(' ')}>
      <div className={styles.cardTop}>{card[0]}{suit(card)}</div>
      <div className={styles.cardSuit}>{suit(card)}</div>
    </div>
  );
}

function TurnTimer({ deadlineAt, duration = 20, compact = false, serverNow }: { deadlineAt?: string | null; duration?: number; compact?: boolean; serverNow?: string | null }) {
  const [left, setLeft] = useState(0);
  const stableDeadlineRef = useRef<number | null>(null);
  const clockSkewRef = useRef(0);

  useEffect(() => {
    if (!deadlineAt) {
      stableDeadlineRef.current = null;
      setLeft(0);
      return;
    }

    const incoming = new Date(deadlineAt).getTime();
    const current = stableDeadlineRef.current;
    if (!current || Math.abs(current - incoming) > 1200) {
      stableDeadlineRef.current = incoming;
    }

    if (serverNow) {
      const serverTs = new Date(serverNow).getTime();
      if (Number.isFinite(serverTs)) clockSkewRef.current = serverTs - Date.now();
    }

    let timeoutId = 0;
    const compute = () => {
      const deadline = stableDeadlineRef.current;
      if (!deadline) return 0;
      return Math.max(0, Math.ceil((deadline - (Date.now() + clockSkewRef.current)) / 1000));
    };

    const tick = () => {
      setLeft(compute());
      const msToNextSecond = 1000 - (Date.now() % 1000);
      timeoutId = window.setTimeout(tick, Math.max(120, msToNextSecond + 10));
    };

    tick();
    return () => window.clearTimeout(timeoutId);
  }, [deadlineAt, serverNow]);

  const pct = Math.max(0, Math.min(100, (left / Math.max(1, duration)) * 100));

  return (
    <div className={styles.timerWrap}>
      <div className={[styles.timerRing, compact ? styles.timerRingCompact : ''].join(' ')} style={{ ['--pct' as never]: `${pct}%` } as any}><span>{left}</span></div>
      {!compact ? (
        <div>
          <div className={styles.metaLabel}>Таймер хода</div>
          <div className={styles.metaMuted}>{duration} сек, затем auto-check или auto-fold</div>
        </div>
      ) : null}
    </div>
  );
}

function ResultBanner({ result, chat, title }: { result?: PokerResult | null; chat?: Chat; title: string }) {
  if (!result) return null;
  return (
    <div className={styles.resultBanner}>
      <div className={styles.resultTitle}>{title}</div>
      <div className={styles.resultWinners}>{result.winners.length ? result.winners.map((id) => getName(chat, id)).join(', ') : 'Без победителя'}</div>
      <div className={styles.resultPlaces}>
        {result.placements.slice(0, 4).map((item) => (
          <div key={item.userId} className={styles.resultPlace}>
            <strong>{getName(chat, item.userId)}</strong>
            <span>{item.handLabel ?? '—'}</span>
            <span>{item.amount > 0 ? `+${item.amount}` : '0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateSessionView({
  selectedGame,
  onSelectGame,
  onCreate,
  creating,
  onBack,
  showHeader = true,
}: {
  selectedGame: GameKey;
  onSelectGame: (game: GameKey) => void;
  onCreate: () => void;
  creating: boolean;
  onBack: () => void;
  showHeader?: boolean;
}) {
  const selectedMeta = GAME_CATALOG.find((item) => item.key === selectedGame) ?? GAME_CATALOG[0];
  const availableGames = GAME_CATALOG.filter((item) => item.status !== 'development').length;
  const upcomingGames = GAME_CATALOG.length - availableGames;
  return (
    <div className={[styles.directoryLobbyLayout, styles.directoryCreateLayout].join(' ')}>
      {showHeader ? <div className={styles.directoryHeader}>
        <div>
          <div className={styles.sectionTitle}>Новая сессия</div>
          <div className={styles.metaMuted}>Сначала выбери игру. Для каждой плитки показываем название, превью и текущий статус готовности.</div>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.ghostBtn} onClick={onBack} aria-label="Назад к списку сессий" title="Назад к списку сессий"><Icon name="arrowLeft" size={16} /></button>
          <button className={styles.primaryBtn} disabled={creating || selectedMeta.status === 'development'} onClick={onCreate}>{creating ? <Spinner size={16} /> : 'Создать сессию'}</button>
        </div>
      </div> : null}

      <div className={styles.gameCatalogGrid}>
        {GAME_CATALOG.map((item) => {
          const selected = item.key === selectedGame;
          return (
            <button
              type="button"
              key={item.key}
              className={[
                styles.gameCatalogTile,
                selected ? styles.gameCatalogTileActive : '',
                item.status === 'development' ? styles.gameCatalogTileDisabled : '',
                item.status === 'beta' ? styles.gameCatalogTileBeta : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectGame(item.key)}
            >
              <div className={styles.gameCatalogTop}>
                <strong>{item.title}</strong>
                <div className={styles.catalogBadgeRow}>
                  {item.status === 'development' ? <span className={styles.tagMuted}>В разработке</span> : null}
                  {item.status === 'beta' ? <span className={styles.tagWarn}>Бета версия</span> : null}
                </div>
              </div>
              <div className={styles.gamePreview}>{item.preview}</div>
              <div className={styles.metaMuted}>{item.description}</div>
            </button>
          );
        })}
      </div>

      <div className={styles.directorySection}>
        <div className={styles.sectionRow}>
          <div>
            <div className={styles.sectionTitle}>{selectedMeta.title}</div>
            <div className={styles.metaMuted}>{selectedMeta.description}</div>
          </div>
          <div className={styles.catalogBadgeRow}>
            {selectedMeta.status === 'development' ? <span className={styles.tagMuted}>Недоступно</span> : null}
            {selectedMeta.status === 'beta' ? <span className={styles.tagWarn}>Бета версия</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateSessionViewRefined({
  selectedGame,
  onSelectGame,
  onCreate,
  creating,
  onBack,
  showHeader = true,
}: {
  selectedGame: GameKey;
  onSelectGame: (game: GameKey) => void;
  onCreate: () => void;
  creating: boolean;
  onBack: () => void;
  showHeader?: boolean;
}) {
  const selectedMeta = GAME_CATALOG.find((item) => item.key === selectedGame) ?? GAME_CATALOG[0];
  const availableGames = GAME_CATALOG.filter((item) => item.status !== 'development').length;
  const upcomingGames = GAME_CATALOG.length - availableGames;

  return (
    <div className={[styles.directoryLobbyLayout, styles.directoryCreateLayout].join(' ')}>
      {showHeader ? (
        <header className={styles.directoryLobbyHero}>
          <div className={styles.directoryLobbyHeroTop}>
            <div className={styles.directoryLobbyHeroIntro}>
              <div className={styles.directoryLobbyHeroBadge}>
                <span className={styles.directoryCreateHeroGlyph}>{selectedMeta.preview}</span>
              </div>

              <div className={styles.directoryLobbyHeroCopy}>
                <h1 className={styles.directoryLobbyHeroTitle}>Новое лобби</h1>
                <div className={styles.directoryLobbyHeroSubtitle}>
                  Выберите игру и создайте лобби в той же визуальной системе и с тем же расположением кнопок, что и в каталоге лобби.
                </div>
              </div>
            </div>

            <div className={styles.directoryLobbyHeroActions}>
              <button
                type="button"
                className={[styles.ghostBtn, styles.directoryLobbyIconButton].join(' ')}
                onClick={onBack}
                aria-label="Назад к лобби"
                title="Назад к лобби"
              >
                <Icon name="arrowLeft" size={18} />
              </button>

              <button
                type="button"
                className={[styles.primaryBtn, styles.directoryLobbyCreateButton].join(' ')}
                disabled={creating || selectedMeta.status === 'development'}
                onClick={onCreate}
              >
                {creating ? <Spinner size={16} /> : 'Создать лобби'}
              </button>
            </div>
          </div>

          <div className={styles.directoryLobbyHeroStats}>
            <span className={[styles.tagReady, styles.directoryLobbyHeroStat].join(' ')}>
              <span className={styles.directoryLobbyHeroDot} />
              {availableGames} доступны
            </span>
            <span className={[styles.tagMuted, styles.directoryLobbyHeroStat].join(' ')}>
              <span className={styles.directoryLobbyHeroDotMuted} />
              {upcomingGames} скоро
            </span>
          </div>
        </header>
      ) : null}

      <section className={styles.directoryLobbySection}>
        <div className={styles.directoryLobbySectionHead}>
          <div className={styles.directoryLobbySectionHeading}>
            <span className={[styles.directoryLobbySectionIcon, styles.directoryLobbySectionIconActive].join(' ')}>
              <Icon name="game" size={18} />
            </span>
            <div className={styles.directoryLobbySectionCopy}>
              <div className={styles.directoryLobbySectionTitle}>Выбор игры</div>
              <div className={styles.directoryLobbySectionText}>
                Все режимы собраны в едином каталоге, а управляющие действия вынесены в верхнюю правую зону, как на предыдущем экране.
              </div>
            </div>
          </div>
        </div>

        <div className={[styles.gameCatalogGrid, styles.directoryCreateGrid].join(' ')}>
          {GAME_CATALOG.map((item) => {
            const selected = item.key === selectedGame;
            return (
              <button
                type="button"
                key={item.key}
                className={[
                  styles.gameCatalogTile,
                  styles.directoryCreateTile,
                  selected ? styles.gameCatalogTileActive : '',
                  selected ? styles.directoryCreateTileSelected : '',
                  item.status === 'development' ? styles.gameCatalogTileDisabled : '',
                  item.status === 'beta' ? styles.gameCatalogTileBeta : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onSelectGame(item.key)}
              >
                <div className={styles.gameCatalogTop}>
                  <strong>{item.title}</strong>
                  <div className={styles.catalogBadgeRow}>
                    {item.status === 'development' ? <span className={styles.tagMuted}>В разработке</span> : null}
                    {item.status === 'beta' ? <span className={styles.tagWarn}>Бета версия</span> : null}
                  </div>
                </div>

                <div className={[styles.gamePreview, styles.directoryCreatePreview].join(' ')}>{item.preview}</div>
                <div className={styles.metaMuted}>{item.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={[styles.directoryLobbySection, styles.directoryCreateSummary].join(' ')}>
        <div className={styles.directoryLobbySectionHead}>
          <div className={styles.directoryLobbySectionHeading}>
            <span className={[styles.directoryLobbySectionIcon, styles.directoryLobbySectionIconArchive].join(' ')}>
              <Icon name="sparkles" size={18} />
            </span>
            <div className={styles.directoryLobbySectionCopy}>
              <div className={styles.directoryLobbySectionTitle}>{selectedMeta.title}</div>
              <div className={styles.directoryLobbySectionText}>{selectedMeta.description}</div>
            </div>
          </div>

          <div className={styles.catalogBadgeRow}>
            {selectedMeta.status === 'development' ? <span className={styles.tagMuted}>Недоступно</span> : null}
            {selectedMeta.status === 'beta' ? <span className={styles.tagWarn}>Бета версия</span> : null}
          </div>
        </div>

        <div className={styles.directoryCreateSummaryBody}>
          <div className={styles.directoryCreateSummaryCopy}>
            <div className={styles.directoryCreateSummaryTitle}>Выбранная игра</div>
            <div className={styles.metaMuted}>
              {selectedMeta.status === 'development'
                ? 'Этот режим ещё в разработке, но уже встроен в общую структуру каталога и не выпадает по стилю.'
                : 'После создания откроется знакомое лобби с той же композицией, кнопками и плотностью интерфейса.'}
            </div>
          </div>

          <div className={styles.directoryCreateSummaryPreview}>
            <span>{selectedMeta.preview}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function LobbyView({ session, chat, meId, setError, compact = false }: { session: GameSession; chat?: Chat; meId: string; setError: (v: string) => void; compact?: boolean }) {
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [buyIn, setBuyIn] = useState(Number(session.config?.buyIn ?? 1000));
  const [smallBlind, setSmallBlind] = useState(Number(session.config?.smallBlind ?? 10));
  const [bigBlind, setBigBlind] = useState(Number(session.config?.bigBlind ?? 20));
  const [timerSec, setTimerSec] = useState(Number(session.config?.timerSec ?? 20));
  const [maxPlayers, setMaxPlayers] = useState(Number(session.config?.maxPlayers ?? 6));
  const [maxAttempts, setMaxAttempts] = useState(Number(session.config?.maxAttempts ?? 5));
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(session.members.filter((m) => m.role === 'player').map((m) => m.userId));
  const [updateSession, { isLoading: saving }] = useUpdateGameSessionConfigMutation();
  const [joinSession] = useJoinGameSessionMutation();
  const [leaveSession] = useLeaveGameSessionMutation();
  const [setReady, { isLoading: settingReady }] = useSetGameReadyMutation();
  const [startSession, { isLoading: starting }] = useStartGameSessionMutation();
  const [cancelSession, { isLoading: cancelling }] = useCancelGameSessionMutation();
  const meMember = session.members.find((m) => m.userId === meId);
  const isCreator = session.createdBy === meId;
  const renderField = (label: string, value: string | number, control?: any) => (
    <label className={styles.field}>
      <span>{label}</span>
      {isCreator && control ? control : <div className={styles.valueField}>{value}</div>}
    </label>
  );
  const lobbyPlayers = session.members.filter((m) => m.role === 'player');
  const waiting = lobbyPlayers.filter((m) => m.status !== 'joined' || !m.isReady);
  const everyoneReady = lobbyPlayers.length >= (session.gameKey === 'FLAPPY' ? 1 : 2) && waiting.length === 0;

  useEffect(() => {
    setDraftTitle(session.title);
    setBuyIn(Number(session.config?.buyIn ?? 1000));
    setSmallBlind(Number(session.config?.smallBlind ?? 10));
    setBigBlind(Number(session.config?.bigBlind ?? 20));
    setTimerSec(Number(session.config?.timerSec ?? 20));
    setMaxPlayers(Number(session.config?.maxPlayers ?? 6));
    setMaxAttempts(Number(session.config?.maxAttempts ?? 5));
    setSelectedPlayers(session.members.filter((m) => m.role === 'player').map((m) => m.userId));
  }, [session.updatedAt, session.sessionId, session.title, session.config, session.members]);

  const save = async () => {
    try {
      const minPlayers = session.gameKey === 'FLAPPY' ? 1 : 2;
      if (selectedPlayers.length < minPlayers) {
        setError(session.gameKey === 'FLAPPY' ? 'Нужно выбрать хотя бы одного игрока.' : 'Нужно выбрать минимум двух игроков.');
        return;
      }
      await updateSession({
        sessionId: session.sessionId,
        title: draftTitle,
        participantUserIds: selectedPlayers,
        config: session.gameKey === 'POKER'
          ? { buyIn, smallBlind, bigBlind, timerSec, maxPlayers, allowObservers: true }
          : session.gameKey === 'FLAPPY'
            ? { maxAttempts, allowObservers: true }
            : {},
      }).unwrap();
      setError('');
    } catch (error) {
      notifyError(setError, 'save-lobby', error);
    }
  };

  const handleStart = async () => {
    try {
      if (!everyoneReady) {
        setError('Не все выбранные игроки вошли в лобби и нажали «Готов».');
        return;
      }
      await startSession({ sessionId: session.sessionId }).unwrap();
      setError('');
    } catch (error) {
      notifyError(setError, 'start-game', error);
    }
  };

  return (
    <div className={[styles.lobbyLayout, compact ? styles.lobbyLayoutCompact : ''].join(' ')}>
      <div className={styles.leftPanel}>
        <div className={styles.sectionTitle}>Лобби</div>
        <div className={[styles.formGrid, compact ? styles.formGridCompact : ''].join(' ')}>
          {renderField('Название', draftTitle, <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className={styles.input} />)}
          {session.gameKey === 'POKER' ? (<>
            {renderField('Buy-in', buyIn, <input className={styles.input} type="number" value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value || 0))} />)}
            {renderField('Таймер', timerSec, <input className={styles.input} type="number" value={timerSec} onChange={(e) => setTimerSec(Number(e.target.value || 0))} />)}
            {renderField('SB', smallBlind, <input className={styles.input} type="number" value={smallBlind} onChange={(e) => setSmallBlind(Number(e.target.value || 0))} />)}
            {renderField('BB', bigBlind, <input className={styles.input} type="number" value={bigBlind} onChange={(e) => setBigBlind(Number(e.target.value || 0))} />)}
            {renderField('Макс. игроков', maxPlayers, <input className={styles.input} type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value || 0))} />)}
          </>) : null}
          {session.gameKey === 'FLAPPY' ? (
            renderField('Макс. попыток', maxAttempts, <input className={styles.input} type="number" value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value || 0))} />)
          ) : null}
        </div>
        <div className={styles.rulesCard}>
          <div className={styles.metaLabel}>Условия старта</div>
          <div className={styles.metaMuted}>{session.gameKey === 'FLAPPY' ? 'Игроки сначала заходят в лобби и подтверждают готовность. После старта каждый получает ограниченное число попыток.' : 'Создатель может выбрать только часть участников чата. Старт доступен лишь когда все выбранные игроки вошли и подтвердили готовность.'}</div>
        </div>
        <div className={styles.lobbyActions}>
          {isCreator ? <button className={styles.primaryBtn} disabled={saving} onClick={save}>Сохранить</button> : null}
          {meMember?.status !== 'joined'
            ? <button className={styles.ghostBtn} onClick={() => joinSession({ sessionId: session.sessionId, role: meMember?.role ?? 'player' })}>Войти</button>
            : <button className={styles.ghostBtn} onClick={() => leaveSession({ sessionId: session.sessionId })}>Выйти</button>}
          {meMember?.role === 'player' && meMember?.status === 'joined' ? <button className={styles.successBtn} disabled={settingReady} onClick={() => setReady({ sessionId: session.sessionId, isReady: !meMember?.isReady })}>{meMember?.isReady ? 'Не готов' : 'Готов'}</button> : null}
          {isCreator ? <button className={styles.primaryBtn} disabled={starting} onClick={handleStart}>Начать</button> : null}
          {isCreator ? <button className={styles.dangerBtn} disabled={cancelling} onClick={() => cancelSession({ sessionId: session.sessionId })}>Отменить</button> : null}
        </div>
      </div>
      <div className={styles.rightPanel}>
        <div className={styles.sectionRow}><div className={styles.sectionTitle}>Игроки</div><span className={everyoneReady ? styles.tagReady : styles.tagWarn}>{everyoneReady ? 'Все готовы' : `${waiting.length} ждём`}</span></div>
        <div className={styles.playerGrid}>
          {(chat?.members ?? []).map((member) => {
            const sessionMember = session.members.find((item) => item.userId === member.userId);
            const selected = selectedPlayers.includes(member.userId);
            return (
              <button key={member.userId} className={[styles.playerRow, selected ? styles.playerRowActive : ''].join(' ')} onClick={() => {
                if (!isCreator) return;
                setSelectedPlayers((prev) => prev.includes(member.userId) ? prev.filter((id) => id !== member.userId) : [...prev, member.userId]);
              }}>
                <Avatar url={member.user.avatarUrl ?? undefined} name={member.user.username} size={44} />
                <div className={styles.playerMeta}><strong>{member.user.username}</strong><span>{sessionMember?.status === 'joined' ? `В лобби · ${connectionStatusLabel(sessionMember?.connectionStatus)}` : 'Ожидаем вход'}</span></div>
                {selected ? <span className={styles.tag}>Игрок</span> : <span className={styles.tagMuted}>Не участвует</span>}
                {sessionMember?.isReady ? <span className={styles.tagReady}>READY</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LobbyViewRefined({
  session,
  chat,
  meId,
  setError,
  onBack,
  compact = false,
}: {
  session: GameSession;
  chat?: Chat;
  meId: string;
  setError: (v: string) => void;
  onBack: () => void;
  compact?: boolean;
}) {
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [buyIn, setBuyIn] = useState(Number(session.config?.buyIn ?? 1000));
  const [smallBlind, setSmallBlind] = useState(Number(session.config?.smallBlind ?? 10));
  const [bigBlind, setBigBlind] = useState(Number(session.config?.bigBlind ?? 20));
  const [timerSec, setTimerSec] = useState(Number(session.config?.timerSec ?? 20));
  const [maxPlayers, setMaxPlayers] = useState(Number(session.config?.maxPlayers ?? 6));
  const [maxAttempts, setMaxAttempts] = useState(Number(session.config?.maxAttempts ?? 5));
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(session.members.filter((member) => member.role === 'player').map((member) => member.userId));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateSession, { isLoading: saving }] = useUpdateGameSessionConfigMutation();
  const [joinSession] = useJoinGameSessionMutation();
  const [leaveSession] = useLeaveGameSessionMutation();
  const [setReady, { isLoading: settingReady }] = useSetGameReadyMutation();
  const [startSession, { isLoading: starting }] = useStartGameSessionMutation();
  const [cancelSession, { isLoading: cancelling }] = useCancelGameSessionMutation();

  const meMember = session.members.find((member) => member.userId === meId);
  const isCreator = session.createdBy === meId;
  const lobbyPlayers = session.members.filter((member) => member.role === 'player');
  const joinedCount = lobbyPlayers.filter((member) => member.status === 'joined').length;
  const readyCount = lobbyPlayers.filter((member) => member.status === 'joined' && member.isReady).length;
  const pendingJoinCount = lobbyPlayers.filter((member) => member.status !== 'joined').length;
  const waitingCount = lobbyPlayers.filter((member) => member.status !== 'joined' || !member.isReady).length;
  const everyoneReady = lobbyPlayers.length >= (session.gameKey === 'FLAPPY' ? 1 : 2) && lobbyPlayers.every((member) => member.status === 'joined' && member.isReady);
  const settingItems = lobbySettingItems(session);

  useEffect(() => {
    setDraftTitle(session.title);
    setBuyIn(Number(session.config?.buyIn ?? 1000));
    setSmallBlind(Number(session.config?.smallBlind ?? 10));
    setBigBlind(Number(session.config?.bigBlind ?? 20));
    setTimerSec(Number(session.config?.timerSec ?? 20));
    setMaxPlayers(Number(session.config?.maxPlayers ?? 6));
    setMaxAttempts(Number(session.config?.maxAttempts ?? 5));
    setSelectedPlayers(session.members.filter((member) => member.role === 'player').map((member) => member.userId));
  }, [session.updatedAt, session.sessionId, session.title, session.config, session.members]);

  const save = async () => {
    try {
      const minPlayers = session.gameKey === 'FLAPPY' ? 1 : 2;
      if (selectedPlayers.length < minPlayers) {
        setError(session.gameKey === 'FLAPPY' ? 'Нужно выбрать хотя бы одного игрока.' : 'Нужно выбрать минимум двух игроков.');
        return;
      }

      await updateSession({
        sessionId: session.sessionId,
        title: draftTitle,
        participantUserIds: selectedPlayers,
        config: session.gameKey === 'POKER'
          ? { buyIn, smallBlind, bigBlind, timerSec, maxPlayers, allowObservers: true }
          : session.gameKey === 'FLAPPY'
            ? { maxAttempts, allowObservers: true }
            : {},
      }).unwrap();

      setSettingsOpen(false);
      setError('');
    } catch (error) {
      notifyError(setError, 'save-lobby', error);
    }
  };

  const handleStart = async () => {
    try {
      if (!everyoneReady) {
        setError('Не все выбранные игроки вошли в лобби и подтвердили готовность.');
        return;
      }
      await startSession({ sessionId: session.sessionId }).unwrap();
      setError('');
    } catch (error) {
      notifyError(setError, 'start-game', error);
    }
  };

  const togglePlayer = (userId: string) => {
    if (!isCreator || userId === session.createdBy) return;
    setSelectedPlayers((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ));
  };

  const actionHint = everyoneReady
    ? 'Все участники готовы, лобби можно запускать.'
    : pendingJoinCount > 0
      ? `Ждём ещё ${pendingJoinCount} входов в лобби.`
      : `Нужно ещё ${Math.max(lobbyPlayers.length - readyCount, 0)} подтверждений готовности.`;
  const avatarSize = compact ? 56 : 64;

  return (
    <div className={[styles.lobbyRefinedShell, compact ? styles.lobbyRefinedShellCompact : ''].filter(Boolean).join(' ')}>
      <div className={styles.lobbyRefinedNav}>
        <button
          type="button"
          className={[styles.ghostBtn, styles.lobbyRefinedFloatingBack].join(' ')}
          onClick={onBack}
          aria-label="Назад к лобби"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <span className={styles.lobbyRefinedNavLabel}>К списку лобби</span>
      </div>
      <section className={styles.lobbyRefinedTop}>
        <div className={styles.lobbyRefinedPreview}>
          <span>{gamePreview(session.gameKey)}</span>
        </div>

        <div className={styles.lobbyRefinedHeading}>
          <div className={styles.lobbyRefinedTitle}>{session.title}</div>
          <div className={styles.lobbyRefinedSubtitle}>{gameTitle(session.gameKey)} · Лобби</div>
          <div className={styles.lobbyRefinedChips}>
            <span className={[styles.tagReady, styles.lobbyRefinedChip].join(' ')}>
              <Icon name="users" size={14} />
              {formatPlayerCount(lobbyPlayers.length)}
            </span>
            <span className={[styles.tag, styles.lobbyRefinedChip].join(' ')}>{joinedCount} в лобби</span>
            <span className={[waitingCount ? styles.tagWarn : styles.tagReady, styles.lobbyRefinedChip].join(' ')}>
              {waitingCount ? `ждём ${waitingCount}` : `${readyCount} готовы`}
            </span>
            <span className={[styles.tagMuted, styles.lobbyRefinedChip].join(' ')}>
              <Icon name="clock" size={14} />
              {formatSessionClock(session)}
            </span>
          </div>
          <div className={styles.lobbyRefinedDescription}>{gameDescription(session.gameKey)}</div>
        </div>
      </section>

      <section className={styles.lobbyRefinedMetaRow}>
        <div className={styles.lobbyRefinedMetaCard}>
          <div className={styles.lobbyRefinedSectionTitle}>Параметры стола</div>
          <div className={styles.lobbyRefinedStatGrid}>
            {settingItems.map((item) => (
              <div key={item.label} className={styles.lobbyRefinedStat}>
                <span className={[styles.lobbyRefinedStatIcon, styles[`lobbyRefinedStatIcon${item.tone}`]].join(' ')}>
                  <Icon name={item.icon} size={18} />
                </span>
                <div className={styles.lobbyRefinedStatCopy}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.lobbyRefinedPlayers}>
        <div className={styles.lobbyRefinedPlayersHeader}>
          <div>
            <div className={styles.lobbyRefinedSectionTitle}>Участники лобби</div>
          </div>
          <div className={styles.lobbyRefinedPlayerCounters}>
            <span className={styles.tagReady}>{readyCount} готовы</span>
            <span className={styles.tagMuted}>{Math.max(lobbyPlayers.length - readyCount, 0)} не готовы</span>
          </div>
        </div>

        <div className={styles.lobbyRefinedPlayerGrid}>
          {lobbyPlayers.map((member) => {
            const user = getUser(chat, member.userId);
            const isJoined = member.status === 'joined';
            const isReady = Boolean(member.isReady);
            const isWaiting = !isJoined;
            const stateTone = isWaiting
              ? styles.lobbyRefinedPlayerWaiting
              : isReady
                ? styles.lobbyRefinedPlayerReady
                : styles.lobbyRefinedPlayerIdle;

            return (
              <article
                key={member.userId}
                className={[styles.lobbyRefinedPlayerCard, stateTone].join(' ')}
              >
                <div className={styles.lobbyRefinedPlayerAvatar}>
                  <Avatar url={user?.avatarUrl ?? undefined} name={user?.username ?? 'Игрок'} size={avatarSize} />
                  {isJoined ? (
                    <span className={[styles.lobbyRefinedPresence, styles.lobbyRefinedPresenceOnline].join(' ')} />
                  ) : null}
                </div>

                <div className={styles.lobbyRefinedPlayerMain}>
                  <strong>{user?.username ?? 'Игрок'}</strong>
                  <span>{isJoined ? `В лобби · ${connectionStatusLabel(member.connectionStatus)}` : 'Ожидаем вход'}</span>
                </div>

                <div className={styles.lobbyRefinedPlayerTags}>
                  <span className={member.userId === session.createdBy ? styles.tag : styles.tagMuted}>
                    {member.userId === session.createdBy ? 'Создатель' : 'Игрок'}
                  </span>
                  <span className={!isJoined ? styles.tagMuted : isReady ? styles.tagReady : styles.tagWarn}>
                    {!isJoined ? 'Подключается' : isReady ? 'Готов' : 'Не готов'}
                  </span>
                </div>

                {!isJoined || isReady ? (
                  <div className={styles.lobbyRefinedPlayerState}>
                    {isWaiting ? <Spinner size={16} /> : <Icon name="check" size={18} />}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.lobbyRefinedFooter}>
        <div className={styles.lobbyRefinedFooterNote}>{actionHint}</div>
        <div className={styles.lobbyRefinedFooterActions}>
          {isCreator ? (
            <button className={[styles.ghostBtn, styles.lobbyRefinedActionSecondary].join(' ')} onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" size={16} />
              Настроить лобби
            </button>
          ) : null}

          {meMember?.status !== 'joined'
            ? (
              <button className={[styles.ghostBtn, styles.lobbyRefinedActionSecondary].join(' ')} onClick={() => joinSession({ sessionId: session.sessionId, role: meMember?.role ?? 'player' })}>
                Войти
              </button>
            ) : (
              <button className={[styles.ghostBtn, styles.lobbyRefinedActionSecondary, styles.lobbyRefinedActionLeave].join(' ')} onClick={() => leaveSession({ sessionId: session.sessionId })}>
                <Icon name="logout" size={16} />
                Выйти
              </button>
            )}

          {meMember?.role === 'player' && meMember?.status === 'joined' ? (
            <button
              className={[meMember.isReady ? styles.ghostBtn : styles.successBtn, styles.lobbyRefinedActionSecondary].join(' ')}
              disabled={settingReady}
              onClick={() => setReady({ sessionId: session.sessionId, isReady: !meMember?.isReady })}
            >
              {meMember.isReady ? 'Не готов' : 'Готов'}
            </button>
          ) : null}

          {isCreator ? (
            <button className={[styles.primaryBtn, styles.lobbyRefinedActionPrimary].join(' ')} disabled={starting} onClick={handleStart}>
              <Icon name="play" size={14} />
              Начать
            </button>
          ) : null}

          {isCreator ? (
            <button className={[styles.dangerBtn, styles.lobbyRefinedActionDanger].join(' ')} disabled={cancelling} onClick={() => cancelSession({ sessionId: session.sessionId })}>
              <Icon name="close" size={14} />
              Отменить
            </button>
          ) : null}
        </div>
      </section>

      {isCreator ? (
        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Настроить лобби"
          subtitle="Параметры игры и состав участников меняются здесь."
          size="lg"
        >
          <div className={styles.lobbyRefinedModalGrid}>
            <section className={styles.lobbyRefinedModalPanel}>
              <div className={styles.sectionTitle}>Параметры лобби</div>
              <div className={styles.lobbyRefinedFieldGrid}>
                <label className={styles.field}>
                  <span>Название</span>
                  <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} className={styles.input} />
                </label>

                {session.gameKey === 'POKER' ? (
                  <>
                    <label className={styles.field}>
                      <span>Buy-in</span>
                      <input className={styles.input} type="number" value={buyIn} onChange={(event) => setBuyIn(Number(event.target.value || 0))} />
                    </label>
                    <label className={styles.field}>
                      <span>SB</span>
                      <input className={styles.input} type="number" value={smallBlind} onChange={(event) => setSmallBlind(Number(event.target.value || 0))} />
                    </label>
                    <label className={styles.field}>
                      <span>BB</span>
                      <input className={styles.input} type="number" value={bigBlind} onChange={(event) => setBigBlind(Number(event.target.value || 0))} />
                    </label>
                    <label className={styles.field}>
                      <span>Таймер</span>
                      <input className={styles.input} type="number" value={timerSec} onChange={(event) => setTimerSec(Number(event.target.value || 0))} />
                    </label>
                    <label className={styles.field}>
                      <span>Макс. игроков</span>
                      <input className={styles.input} type="number" value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value || 0))} />
                    </label>
                  </>
                ) : null}

                {session.gameKey === 'FLAPPY' ? (
                  <label className={styles.field}>
                    <span>Макс. попыток</span>
                    <input className={styles.input} type="number" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value || 0))} />
                  </label>
                ) : null}
              </div>

              <div className={styles.rulesCard}>
                <div className={styles.metaLabel}>Условия старта</div>
                <div className={styles.metaMuted}>{lobbyRulesText(session.gameKey)}</div>
              </div>
            </section>

            <section className={styles.lobbyRefinedModalPanel}>
              <div className={styles.sectionRow}>
                <div className={styles.sectionTitle}>Состав игроков</div>
                <span className={styles.tag}>{selectedPlayers.length}</span>
              </div>

              <div className={styles.lobbyRefinedPickerGrid}>
                {(chat?.members ?? []).map((member) => {
                  const sessionMember = session.members.find((item) => item.userId === member.userId);
                  const selected = selectedPlayers.includes(member.userId);
                  const locked = member.userId === session.createdBy;

                  return (
                    <button
                      type="button"
                      key={member.userId}
                      className={[styles.lobbyRefinedPickerCard, selected ? styles.lobbyRefinedPickerCardSelected : ''].filter(Boolean).join(' ')}
                      onClick={() => togglePlayer(member.userId)}
                      disabled={locked}
                    >
                      <Avatar url={member.user.avatarUrl ?? undefined} name={member.user.username} size={42} />
                      <div className={styles.lobbyRefinedPickerMeta}>
                        <strong>{member.user.username}</strong>
                        <span>{sessionMember?.status === 'joined' ? `В лобби · ${connectionStatusLabel(sessionMember.connectionStatus)}` : 'Вне лобби'}</span>
                      </div>
                      <span className={selected ? styles.tagReady : styles.tagMuted}>
                        {locked ? 'Создатель' : selected ? 'Выбран' : 'Не выбран'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.lobbyRefinedModalFooter}>
                <button className={styles.ghostBtn} onClick={() => setSettingsOpen(false)}>Закрыть</button>
                <button className={styles.primaryBtn} disabled={saving} onClick={() => void save()}>
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </section>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function PokerView({
  session,
  chat,
  meId,
  setError,
  compact = false,
  immersive = false,
  mobileViewport = false,
  fullscreenActive = false,
  onToggleFullscreen,
  onBack,
  onClose,
}: {
  session: GameSession;
  chat?: Chat;
  meId: string;
  setError: (v: string) => void;
  compact?: boolean;
  immersive?: boolean;
  mobileViewport?: boolean;
  fullscreenActive?: boolean;
  onToggleFullscreen: () => Promise<void> | void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <PokerTable
      session={session}
      chat={chat}
      meId={meId}
      compact={compact}
      immersive={immersive}
      mobileViewport={mobileViewport}
      fullscreenActive={fullscreenActive}
      onToggleFullscreen={onToggleFullscreen}
      onBack={onBack}
      onClose={onClose}
      onError={setError}
    />
  );
}


function FlappyView({
  session,
  chat,
  meId,
  setError,
  compact = false,
  immersive = false,
  mobileViewport = false,
}: {
  session: GameSession;
  chat?: Chat;
  meId: string;
  setError: (v: string) => void;
  compact?: boolean;
  immersive?: boolean;
  mobileViewport?: boolean;
}) {
  const flappy = session.flappy!;
  const me = flappy.players.find((player) => player.userId === meId);
  const meMember = session.members.find((member) => member.userId === meId);
  const [submitAttempt, { isLoading: submitting }] = useFlappyAttemptMutation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const stateRef = useRef<any>(null);
  const attemptKeyRef = useRef('');
  const [playing, setPlaying] = useState(false);
  const [localScore, setLocalScore] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(true);
  const { containerRef: flappyBodyRef, size: flappySurface } = useResponsiveSurfaceSize({
    aspectRatio: FLAPPY_CANVAS_BASE_WIDTH / FLAPPY_CANVAS_BASE_HEIGHT,
    minWidth: mobileViewport ? 220 : 240,
    minHeight: mobileViewport ? 320 : 360,
  });
  const width = flappySurface.width || (mobileViewport ? Math.min(flappySurface.availableWidth || FLAPPY_CANVAS_BASE_WIDTH, FLAPPY_CANVAS_BASE_WIDTH) : (compact ? 300 : FLAPPY_CANVAS_BASE_WIDTH));
  const height = flappySurface.height || (mobileViewport ? Math.min(flappySurface.availableHeight || FLAPPY_CANVAS_BASE_HEIGHT, FLAPPY_CANVAS_BASE_HEIGHT) : (compact ? 320 : FLAPPY_CANVAS_BASE_HEIGHT));
  const flappySurfaceStyle = {
    width: `${width}px`,
    height: `${height}px`,
  } as CSSProperties;
  const flappyMetrics = useMemo(() => createFlappyMetrics(width, height), [width, height]);
  const {
    scale: flappyScale,
    groundHeight,
    pipeWidth,
    pipeGapHalf,
    birdX,
    birdRadius,
    birdEyeX,
    birdEyeOffsetY,
    birdEyeRadius,
    playAreaTop,
    playAreaBottom,
    pipeSpawnDistance,
    pipeSpeed,
    gravity,
    flapVelocity,
    pipeMinY,
    pipeMaxY,
    scoreBoxWidth,
    scoreBoxHeight,
  } = flappyMetrics;
  const attemptsLeft = Math.max(0, (flappy.maxAttempts ?? 0) - (me?.attemptsUsed ?? 0));
  const currentAttemptNumber = flappy.maxAttempts > 0
    ? Math.min(flappy.maxAttempts, (me?.attemptsUsed ?? 0) + (attemptsLeft > 0 ? 1 : 0))
    : 0;
  const canPlay = session.status === 'ACTIVE' && meMember?.role === 'player' && meMember?.status === 'joined' && attemptsLeft > 0;

  useEffect(() => {
    setOverlayOpen(!playing);
  }, [playing, session.updatedAt]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    if (!playing) drawIdle();
  }, [playing, width, height, session.updatedAt]);

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const pixelRatio = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));

    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    if (canvas.style.width !== `${width}px`) canvas.style.width = `${width}px`;
    if (canvas.style.height !== `${height}px`) canvas.style.height = `${height}px`;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return ctx;
  };

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, rectWidth: number, rectHeight: number, radius: number) => {
    const safeRadius = Math.max(0, Math.min(radius, rectWidth / 2, rectHeight / 2));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + rectWidth - safeRadius, y);
    ctx.quadraticCurveTo(x + rectWidth, y, x + rectWidth, y + safeRadius);
    ctx.lineTo(x + rectWidth, y + rectHeight - safeRadius);
    ctx.quadraticCurveTo(x + rectWidth, y + rectHeight, x + rectWidth - safeRadius, y + rectHeight);
    ctx.lineTo(x + safeRadius, y + rectHeight);
    ctx.quadraticCurveTo(x, y + rectHeight, x, y + rectHeight - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
  };

  const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.26, 0, Math.PI * 2);
    ctx.arc(x + size * 0.22, y - size * 0.08, size * 0.2, 0, Math.PI * 2);
    ctx.arc(x + size * 0.44, y, size * 0.24, 0, Math.PI * 2);
    ctx.arc(x + size * 0.24, y + size * 0.08, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, elapsed = 0) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#6ed5ff');
    sky.addColorStop(0.5, '#4fb7ff');
    sky.addColorStop(1, '#7be6c8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.78, height * 0.18, 8, width * 0.78, height * 0.18, width * 0.18);
    sun.addColorStop(0, 'rgba(255,241,176,0.95)');
    sun.addColorStop(0.48, 'rgba(255,195,104,0.34)');
    sun.addColorStop(1, 'rgba(255,195,104,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    drawCloud(ctx, width * 0.12 + Math.sin(elapsed / 1500) * (6 * flappyScale), height * 0.16, 70 * flappyScale, 0.38);
    drawCloud(ctx, width * 0.54 + Math.sin(elapsed / 1700 + 1.3) * (9 * flappyScale), height * 0.12, 92 * flappyScale, 0.28);
    drawCloud(ctx, width * 0.68 + Math.sin(elapsed / 1400 + 0.6) * (7 * flappyScale), height * 0.28, 64 * flappyScale, 0.2);

    ctx.fillStyle = 'rgba(31, 101, 131, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, playAreaBottom - (130 * flappyScale));
    ctx.quadraticCurveTo(width * 0.18, playAreaBottom - (190 * flappyScale), width * 0.36, playAreaBottom - (118 * flappyScale));
    ctx.quadraticCurveTo(width * 0.55, playAreaBottom - (210 * flappyScale), width * 0.74, playAreaBottom - (126 * flappyScale));
    ctx.quadraticCurveTo(width * 0.9, playAreaBottom - (178 * flappyScale), width, playAreaBottom - (138 * flappyScale));
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3ea95f';
    ctx.beginPath();
    ctx.moveTo(0, playAreaBottom - (58 * flappyScale));
    ctx.quadraticCurveTo(width * 0.12, playAreaBottom - (102 * flappyScale), width * 0.28, playAreaBottom - (46 * flappyScale));
    ctx.quadraticCurveTo(width * 0.5, playAreaBottom - (118 * flappyScale), width * 0.74, playAreaBottom - (56 * flappyScale));
    ctx.quadraticCurveTo(width * 0.92, playAreaBottom - (108 * flappyScale), width, playAreaBottom - (70 * flappyScale));
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    const ground = ctx.createLinearGradient(0, height - groundHeight, 0, height);
    ground.addColorStop(0, '#5d411e');
    ground.addColorStop(1, '#34220e');
    ctx.fillStyle = ground;
    ctx.fillRect(0, height - groundHeight, width, groundHeight);

    ctx.fillStyle = '#8bd84a';
    ctx.fillRect(0, height - groundHeight, width, 10 * flappyScale);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, 2 * flappyScale);
    for (let x = -((elapsed / 12) % (28 * flappyScale)); x < width + 30; x += 28 * flappyScale) {
      ctx.beginPath();
      ctx.moveTo(x, height - groundHeight + (10 * flappyScale));
      ctx.lineTo(x + (14 * flappyScale), height);
      ctx.stroke();
    }
  };

  const drawPipes = (ctx: CanvasRenderingContext2D, pipes: Array<{ x: number; gapY: number }>) => {
    for (const pipe of pipes) {
      const topHeight = pipe.gapY - pipeGapHalf;
      const bottomY = pipe.gapY + pipeGapHalf;
      const pipeGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipeWidth, 0);
      pipeGradient.addColorStop(0, '#1e7f44');
      pipeGradient.addColorStop(0.5, '#41c368');
      pipeGradient.addColorStop(1, '#155d31');
      ctx.fillStyle = pipeGradient;
      ctx.fillRect(pipe.x, 0, pipeWidth, topHeight);
      ctx.fillRect(pipe.x, bottomY, pipeWidth, height - bottomY - groundHeight);

      ctx.fillStyle = '#63d584';
      ctx.fillRect(pipe.x + (6 * flappyScale), 0, 6 * flappyScale, topHeight);
      ctx.fillRect(pipe.x + (6 * flappyScale), bottomY, 6 * flappyScale, height - bottomY - groundHeight);

      ctx.fillStyle = '#166238';
      ctx.fillRect(pipe.x - (6 * flappyScale), topHeight - (18 * flappyScale), pipeWidth + (12 * flappyScale), 18 * flappyScale);
      ctx.fillRect(pipe.x - (6 * flappyScale), bottomY, pipeWidth + (12 * flappyScale), 18 * flappyScale);
    }
  };

  const drawBird = (ctx: CanvasRenderingContext2D, state: { birdY: number; birdVelocity: number; elapsed: number }, idle = false) => {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(birdX - (6 * flappyScale), Math.min(playAreaBottom + (22 * flappyScale), state.birdY + (36 * flappyScale)), 26 * flappyScale, 10 * flappyScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(birdX - birdRadius, state.birdY - birdRadius, birdX + birdRadius, state.birdY + birdRadius);
    body.addColorStop(0, '#ffe874');
    body.addColorStop(0.52, '#ffbf38');
    body.addColorStop(1, '#ff8d1f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(birdX, state.birdY, birdRadius, 0, Math.PI * 2);
    ctx.fill();

    const wingLift = Math.sin((state.elapsed / (idle ? 240 : 120)) + 0.4) * (7 * flappyScale);
    ctx.fillStyle = '#e28b19';
    ctx.beginPath();
    ctx.ellipse(birdX - (3 * flappyScale), state.birdY + (2 * flappyScale), 10 * flappyScale, 7 * flappyScale, wingLift * 0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.moveTo(birdX + (11 * flappyScale), state.birdY + (1 * flappyScale));
    ctx.lineTo(birdX + (22 * flappyScale), state.birdY - (2 * flappyScale));
    ctx.lineTo(birdX + (11 * flappyScale), state.birdY - (7 * flappyScale));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(birdEyeX, state.birdY - birdEyeOffsetY, birdEyeRadius + (1 * flappyScale), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(birdEyeX, state.birdY - birdEyeOffsetY, birdEyeRadius, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawScoreHud = (ctx: CanvasRenderingContext2D, score: number, statusLabel?: string) => {
    const hudX = width / 2 - scoreBoxWidth / 2;
    const hudY = 16 * flappyScale;
    drawRoundedRect(ctx, hudX, hudY, scoreBoxWidth, scoreBoxHeight, 22 * flappyScale);
    ctx.fillStyle = 'rgba(5, 12, 19, 0.66)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(1, 1.5 * flappyScale);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `700 ${Math.max(10, 11 * flappyScale)}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('СЧЕТ', width / 2, hudY + (18 * flappyScale));

    ctx.fillStyle = '#fff6dd';
    ctx.font = `800 ${Math.max(26, 34 * flappyScale)}px Inter, system-ui`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18 * flappyScale;
    ctx.shadowOffsetY = 4 * flappyScale;
    ctx.fillText(String(score), width / 2, hudY + (46 * flappyScale));
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (statusLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = `600 ${Math.max(10, 12 * flappyScale)}px Inter, system-ui`;
      ctx.fillText(statusLabel, width / 2, hudY + scoreBoxHeight + (16 * flappyScale));
    }
  };

  const drawScene = (state?: { birdY: number; birdVelocity: number; pipes: Array<{ x: number; gapY: number }>; score: number; elapsed: number }, idle = false) => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, state?.elapsed ?? 0);
    drawPipes(ctx, state?.pipes ?? [{
      x: width * 0.66,
      gapY: (pipeMinY + pipeMaxY) / 2,
    }]);
    drawBird(ctx, state ?? {
      birdY: (playAreaTop + playAreaBottom) / 2,
      birdVelocity: 0,
      elapsed: 0,
      pipes: [],
      score: 0,
    }, idle);
    drawScoreHud(ctx, state?.score ?? localScore, idle ? 'Тап или Space для старта' : undefined);
  };

  const drawIdle = () => {
    drawScene(undefined, true);
  };

  const draw = () => {
    const state = stateRef.current;
    if (!state) return;
    drawScene(state);
  };

  const finishAttempt = async (score: number) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stateRef.current = null;
    setPlaying(false);
    setLocalScore(score);
    setOverlayOpen(true);
    playFlappySound('hit');
    try {
      await submitAttempt({ sessionId: session.sessionId, score, idempotencyKey: attemptKeyRef.current || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) }).unwrap();
      setError('');
    } catch (error) {
      notifyError(setError, 'flappy-attempt', error);
    }
  };

  const tick = (time: number) => {
    const state = stateRef.current;
    if (!state) return;
    if (!state.lastTime) state.lastTime = time;
    const dt = Math.min(32, time - state.lastTime) / 16.6667;
    state.lastTime = time;
    state.elapsed += dt * 16.6667;
    state.birdVelocity += gravity * dt;
    state.birdY += state.birdVelocity * dt;
    if (!state.pipes.length || state.pipes[state.pipes.length - 1].x < width - pipeSpawnDistance) {
      state.pipes.push({
        x: width + (24 * flappyScale),
        gapY: pipeMinY + Math.random() * Math.max(24 * flappyScale, pipeMaxY - pipeMinY),
        passed: false,
      });
    }
    for (const pipe of state.pipes) pipe.x -= pipeSpeed * dt;
    state.pipes = state.pipes.filter((pipe: any) => pipe.x > -(pipeWidth + (26 * flappyScale)));
    for (const pipe of state.pipes) {
      if (!pipe.passed && pipe.x + pipeWidth < birdX) {
        pipe.passed = true;
        state.score += 1;
        setLocalScore(state.score);
        playFlappySound('score');
      }
      const hitX = birdX + birdRadius > pipe.x && birdX - birdRadius < pipe.x + pipeWidth;
      const hitY = state.birdY - birdRadius < pipe.gapY - pipeGapHalf || state.birdY + birdRadius > pipe.gapY + pipeGapHalf;
      if (hitX && hitY) {
        void finishAttempt(state.score);
        return;
      }
    }
    if (state.birdY < playAreaTop + (birdRadius * 0.72) || state.birdY > playAreaBottom - birdRadius) {
      void finishAttempt(state.score);
      return;
    }
    draw();
    frameRef.current = requestAnimationFrame(tick);
  };

  const flap = () => {
    if (!stateRef.current) return;
    stateRef.current.birdVelocity = flapVelocity;
    playFlappySound('flap');
  };

  const startAttempt = () => {
    if (!canPlay || playing || submitting) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    attemptKeyRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    stateRef.current = {
      birdY: (playAreaTop + playAreaBottom) / 2 - (10 * flappyScale),
      birdVelocity: 0,
      pipes: [],
      score: 0,
      lastTime: 0,
      elapsed: 0,
    };
    setLocalScore(0);
    setPlaying(true);
    setOverlayOpen(false);
    playFlappySound('start');
    frameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (playing) flap(); else if (canPlay) startAttempt();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canPlay, flapVelocity, pipeMaxY, pipeMinY, playing, submitting]);

  const top = flappy.leaderboard[0];

  return (
    <div
      className={[
        styles.revampGameViewport,
        styles.revampGameViewportPortrait,
        compact ? styles.revampGameViewportCompact : '',
        immersive ? styles.revampGameViewportImmersive : '',
      ].filter(Boolean).join(' ')}
    >
      {!immersive && !mobileViewport ? (
        <div className={[styles.flappyTopbar, styles.revampHudTop].join(' ')}>
        <div>
          <div className={styles.pokerHandTitle}>Flappy Rush</div>
          <div className={styles.pokerHandMeta}>Попытки {flappy.maxAttempts} · Время {formatSessionClock(session)} · Участников {flappy.players.length}</div>
        </div>
        <div className={styles.flappyTopStats}>
          <span className={styles.infoChip}>Лучший {me?.bestScore ?? 0}</span>
          <span className={styles.infoChip}>Осталось {attemptsLeft}</span>
          {top ? <span className={styles.infoChip}>Лидер {getName(chat, top.userId)} · {top.bestScore}</span> : null}
          <span className={styles.tagWarn}>Arcade</span>
        </div>
      </div>
      ) : null}
      <div className={styles.revampStageArea}>
        <div ref={flappyBodyRef} className={[styles.flappyBody, styles.revampStageMeasure].join(' ')}>
          <div className={[styles.flappyArenaWrap, styles.revampFlappyStageWrap].join(' ')} style={flappySurfaceStyle}>
          <div className={[styles.flappyHud, styles.revampFlappyHudInline].join(' ')}>
            <span className={styles.infoChip}>Счёт {localScore}</span>
            <span className={styles.infoChip}>Попытка {currentAttemptNumber}/{flappy.maxAttempts}</span>
            <span className={styles.infoChip}>{playing ? 'В полёте' : attemptsLeft > 0 ? 'Готов' : 'Ждём итог'}</span>
          </div>
          <canvas
            ref={canvasRef}
            className={styles.flappyCanvas}
            onClick={() => { if (playing) flap(); else if (canPlay) startAttempt(); }}
          />
          {overlayOpen ? (
            <div className={styles.flappyOverlay}>
              <div className={[styles.flappyOverlayCard, styles.revampFlappyOverlayCard].join(' ')}>
                <div className={styles.resultTitle}>{session.status === 'FINISHED' ? 'Сессия завершена' : 'Новый забег'}</div>
                <div className={styles.resultWinners}>{session.status === 'FINISHED' ? `Финальный лучший счёт: ${me?.bestScore ?? 0}` : `Последний счёт: ${localScore}`}</div>
                <div className={styles.metaMuted}>Лучший результат: {Math.max(me?.bestScore ?? 0, localScore)} · Попыток осталось: {attemptsLeft}</div>
                <div className={styles.flappyBoardList}>
                  {flappy.leaderboard.map((entry, index) => (
                    <div key={entry.userId} className={styles.flappyBoardRow}>
                      <span>{index + 1}. {getName(chat, entry.userId)}</span>
                      <span>{entry.bestScore}</span>
                      <span>{entry.attemptsUsed}/{flappy.maxAttempts}</span>
                    </div>
                  ))}
                </div>
                {session.status === 'FINISHED' && session.result ? <ResultBanner result={session.result} chat={chat} title="Победитель" /> : null}
                {canPlay && session.status === 'ACTIVE' ? <button className={styles.primaryBtn} onClick={startAttempt}>Начать забег</button> : null}
                {!canPlay && session.status === 'ACTIVE' ? <div className={styles.metaMuted}>Лимит попыток исчерпан. Ждём остальных игроков.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}



function SessionDirectory({
  sessions,
  activeSessionId,
  mode,
  onModeChange,
  onOpen,
  onCreateRequest,
  onClearArchive,
  creating,
  clearing,
  showHeader = true,
}: {
  sessions: GameSession[];
  activeSessionId: string;
  mode: 'all' | 'byGame';
  onModeChange: (mode: 'all' | 'byGame') => void;
  onOpen: (sessionId: string) => void;
  onCreateRequest: () => void;
  onClearArchive: () => void;
  creating: boolean;
  clearing: boolean;
  showHeader?: boolean;
}) {
  const active = sessions.filter((item) => item.status === 'CONFIG' || item.status === 'ACTIVE');
  const archive = sessions.filter((item) => item.status === 'FINISHED' || item.status === 'CANCELLED');
  const grouped = GAME_CATALOG.map((game) => ({
    game,
    active: active.filter((item) => item.gameKey === game.key),
    archive: archive.filter((item) => item.gameKey === game.key),
  })).filter((bucket) => bucket.active.length || bucket.archive.length || bucket.game.status !== 'ready');

  return (
    <div className={styles.directoryLayout}>
      {showHeader ? <div className={styles.directoryHeader}>
        <div>
          <div className={styles.sectionTitle}>Игровые сессии</div>
          <div className={styles.metaMuted}>Выбери существующую сессию или создай новую. Игра выбирается только на этапе «Новая сессия».</div>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.catalogTabs}>
            <button className={[styles.catalogTab, mode === 'all' ? styles.catalogTabActive : ''].join(' ')} onClick={() => onModeChange('all')}>Все сессии</button>
            <button className={[styles.catalogTab, mode === 'byGame' ? styles.catalogTabActive : ''].join(' ')} onClick={() => onModeChange('byGame')}>По играм</button>
          </div>
          <button className={styles.primaryBtn} disabled={creating} onClick={onCreateRequest}>{creating ? <Spinner size={16} /> : 'Новая сессия'}</button>
        </div>
      </div> : null}

      {mode === 'all' ? (
        <div className={styles.directoryColumns}>
          <div className={styles.directorySection}>
            <div className={styles.sectionRow}><div className={styles.sectionTitle}>Активные</div><span className={styles.tagReady}>{active.length}</span></div>
            <div className={styles.sessionList}>
              {active.length ? active.map((item) => (
                <button key={item.sessionId} className={[styles.sessionCard, activeSessionId === item.sessionId ? styles.sessionCardActive : ''].join(' ')} onClick={() => onOpen(item.sessionId)}>
                  <div className={styles.sessionCardTop}><strong>{item.title}</strong><span className={styles.tagReady}>{sessionStageLabel(item)}</span></div>
                  <div className={styles.metaMuted}>{gameTitle(item.gameKey)} · {item.gameKey === 'POKER' ? (item.poker?.handNumber ? `Раздача #${item.poker.handNumber}` : 'Ожидание старта') : item.gameKey === 'FLAPPY' ? `Попытки ${(item.flappy?.leaderboard?.[0]?.attemptsUsed ?? 0)}/${item.flappy?.maxAttempts ?? item.config?.maxAttempts ?? 0}` : 'Ожидание старта'}</div>
                  <div className={styles.sessionCardMeta}><span>{formatSessionClock(item)}</span><span>{item.members.filter((m) => m.role === 'player').length} игроков</span></div>
                </button>
              )) : <div className={styles.empty}>Нет активных сессий</div>}
            </div>
          </div>
          <div className={[styles.directorySection, styles.archiveSection].join(' ')}>
            <div className={styles.sectionRow}><div className={styles.sectionTitle}>Архив</div><div className={styles.toolbarRight}><span className={styles.tagMuted}>{archive.length}</span><button className={styles.ghostBtn} disabled={clearing || !archive.length} onClick={onClearArchive}>Очистить архив</button></div></div>
            <div className={styles.sessionList}>
              {archive.length ? archive.map((item) => (
                <button key={item.sessionId} className={[styles.sessionCard, styles.sessionCardArchive, activeSessionId === item.sessionId ? styles.sessionCardActive : ''].join(' ')} onClick={() => onOpen(item.sessionId)}>
                  <div className={styles.sessionCardTop}><strong>{item.title}</strong><span className={item.status === 'CANCELLED' ? styles.tagWarn : styles.tagMuted}>{sessionStageLabel(item)}</span></div>
                  <div className={styles.metaMuted}>{gameTitle(item.gameKey)} · {item.result?.winners?.length ? `Победители: ${item.result.winners.length}` : 'Есть статистика'}</div>
                  <div className={styles.sessionCardMeta}><span>{formatSessionClock(item)}</span><span>{new Date(item.updatedAt).toLocaleString()}</span></div>
                </button>
              )) : <div className={styles.empty}>Архив пока пуст</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.groupedList}>
          {grouped.map((bucket) => (
            <details key={bucket.game.key} className={styles.groupCard}>
              <summary className={styles.groupSummary}>
                <span>{bucket.game.title}</span>
                <span className={styles.metaMuted}>{bucket.active.length} активных · {bucket.archive.length} в архиве</span>
              </summary>
              <div className={styles.groupSectionLabel}>Активные</div>
              <div className={styles.sessionList}>
                {bucket.active.length ? bucket.active.map((item) => <button key={item.sessionId} className={[styles.sessionCard, activeSessionId === item.sessionId ? styles.sessionCardActive : ''].join(' ')} onClick={() => onOpen(item.sessionId)}><div className={styles.sessionCardTop}><strong>{item.title}</strong><span className={styles.tagReady}>{sessionStageLabel(item)}</span></div><div className={styles.sessionCardMeta}><span>{formatSessionClock(item)}</span><span>{item.members.filter((m) => m.role === 'player').length} игроков</span></div></button>) : <div className={styles.empty}>Нет активных сессий</div>}
              </div>
              <div className={styles.groupSectionLabel}>Архив</div>
              <div className={styles.sessionList}>
                {bucket.archive.length ? bucket.archive.map((item) => <button key={item.sessionId} className={[styles.sessionCard, styles.sessionCardArchive, activeSessionId === item.sessionId ? styles.sessionCardActive : ''].join(' ')} onClick={() => onOpen(item.sessionId)}><div className={styles.sessionCardTop}><strong>{item.title}</strong><span className={item.status === 'CANCELLED' ? styles.tagWarn : styles.tagMuted}>{sessionStageLabel(item)}</span></div><div className={styles.sessionCardMeta}><span>{formatSessionClock(item)}</span><span>{new Date(item.updatedAt).toLocaleString()}</span></div></button>) : <div className={styles.empty}>Архив пуст</div>}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function directoryPlural(count: number, forms: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function directoryLobbyCountText(count: number, scope: 'active' | 'archive') {
  if (scope === 'active') return `${count} ${directoryPlural(count, ['активное лобби', 'активных лобби', 'активных лобби'])}`;
  return `${count} в архиве`;
}

function directorySessionPlayers(session: GameSession) {
  return session.members.filter((member) => member.role === 'player');
}

function directorySessionIdentity(chat: Chat | undefined, member: GameSession['members'][number]) {
  const user = getUser(chat, member.userId);
  return {
    name: member.username ?? user?.username ?? 'Игрок',
    avatarUrl: member.avatarUrl ?? user?.avatarUrl ?? undefined,
  };
}

function directorySessionSubtitle(session: GameSession) {
  if (session.status === 'CONFIG') return `${gameTitle(session.gameKey)} · Ожидание старта`;
  if (session.status === 'ACTIVE') return `${gameTitle(session.gameKey)} · ${session.poker ? formatStage(session.poker.stage) : 'Игра идёт'}`;
  if (session.status === 'CANCELLED') return `${gameTitle(session.gameKey)} · Лобби отменено`;
  return `${gameTitle(session.gameKey)} · Игра завершена`;
}

function directorySessionStatus(session: GameSession) {
  const players = directorySessionPlayers(session);
  const joinedCount = players.filter((member) => member.status === 'joined').length;
  const readyCount = players.filter((member) => member.status === 'joined' && member.isReady).length;

  if (session.status === 'CONFIG') {
    if (!players.length) return { label: 'Ждём игроков', tone: 'muted' as const };
    if (joinedCount < players.length) return { label: 'Ждём вход', tone: 'warn' as const };
    if (readyCount === players.length) return { label: 'Готово к старту', tone: 'ready' as const };
    if (readyCount > 0) return { label: 'Ждём подтверждение', tone: 'ready' as const };
    return { label: 'Собираем состав', tone: 'muted' as const };
  }

  if (session.status === 'ACTIVE') return { label: 'Игра идёт', tone: 'ready' as const };
  if (session.status === 'CANCELLED') return { label: 'Отменено', tone: 'warn' as const };
  return { label: 'Завершено', tone: 'muted' as const };
}

function directoryFormatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function directoryFormatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function DirectoryActiveCard({
  session,
  chat,
  selected,
  onOpen,
}: {
  session: GameSession;
  chat?: Chat;
  selected: boolean;
  onOpen: (sessionId: string) => void;
}) {
  const players = directorySessionPlayers(session);
  const joinedCount = players.filter((member) => member.status === 'joined').length;
  const readyCount = players.filter((member) => member.status === 'joined' && member.isReady).length;
  const statusInfo = directorySessionStatus(session);
  const previewTone = session.gameKey === 'POKER'
    ? styles.directoryLobbySessionPreviewPoker
    : session.gameKey === 'FLAPPY'
      ? styles.directoryLobbySessionPreviewFlappy
      : styles.directoryLobbySessionPreviewNeutral;
  const statusTone = statusInfo.tone === 'ready'
    ? styles.directoryLobbySessionChipSuccess
    : statusInfo.tone === 'warn'
      ? styles.directoryLobbySessionChipWarn
      : styles.directoryLobbySessionChipMuted;
  const statItems = lobbySettingItems(session).slice(0, 4);
  const visiblePlayers = players.slice(0, 3);
  const morePlayers = Math.max(players.length - visiblePlayers.length, 0);
  const names = visiblePlayers.map((member) => directorySessionIdentity(chat, member).name);
  const peopleTitle = names.length ? names.join(', ') : 'Состав пока пуст';
  const peopleMeta = players.length ? `${joinedCount} в лобби · ${readyCount} готовы` : 'Добавьте участников в лобби';

  const handleOpen = () => onOpen(session.sessionId);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <article
      className={[
        styles.directoryLobbySessionCard,
        selected ? styles.directoryLobbySessionCardSelected : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <div className={[styles.directoryLobbySessionPreview, previewTone].join(' ')}>
        <span>{gamePreview(session.gameKey)}</span>
      </div>

      <div className={styles.directoryLobbySessionBody}>
        <div className={styles.directoryLobbySessionHead}>
          <div className={styles.directoryLobbySessionTitleBlock}>
            <h3 className={styles.directoryLobbySessionTitle}>{session.title}</h3>
            <div className={styles.directoryLobbySessionSubtitle}>{directorySessionSubtitle(session)}</div>
          </div>

          <div className={styles.directoryLobbySessionChips}>
            <span className={[styles.directoryLobbySessionChip, styles.directoryLobbySessionChipPrimary].join(' ')}>
              {sessionStageLabel(session)}
            </span>
            <span className={[styles.directoryLobbySessionChip, styles.directoryLobbySessionChipNeutral].join(' ')}>
              <Icon name="users" size={16} />
              {formatPlayerCount(players.length)}
            </span>
            <span className={[styles.directoryLobbySessionChip, statusTone].join(' ')}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        <div className={styles.directoryLobbySessionTime}>
          <Icon name="clock" size={16} />
          <span>{formatSessionClock(session)}</span>
        </div>

        <div className={styles.directoryLobbySessionStats}>
          {statItems.map((item) => (
            <div key={`${session.sessionId}-${item.label}`} className={styles.directoryLobbySessionStat}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className={styles.directoryLobbySessionFoot}>
          <div className={styles.directoryLobbySessionPeople}>
            <div className={styles.directoryLobbyAvatarStack}>
              {visiblePlayers.map((member) => {
                const identity = directorySessionIdentity(chat, member);
                return (
                  <Avatar
                    key={member.userId}
                    url={identity.avatarUrl}
                    name={identity.name}
                    size={40}
                    status={member.status === 'joined' && connectionStatusTone(member.connectionStatus) === 'online' ? 'online' : 'offline'}
                    className={styles.directoryLobbyAvatar}
                  />
                );
              })}
              {morePlayers ? <span className={styles.directoryLobbyAvatarMore}>+{morePlayers}</span> : null}
            </div>

            <div className={styles.directoryLobbySessionPeopleCopy}>
              <strong>{peopleTitle}</strong>
              <span>{peopleMeta}</span>
            </div>
          </div>

          <div className={styles.directoryLobbySessionActions}>
            <button
              type="button"
              className={[styles.primaryBtn, styles.directoryLobbyOpenButton].join(' ')}
              onClick={(event) => {
                event.stopPropagation();
                handleOpen();
              }}
            >
              Открыть
            </button>
            <button
              type="button"
              className={[styles.ghostBtn, styles.directoryLobbyIconButton].join(' ')}
              onClick={(event) => {
                event.stopPropagation();
                handleOpen();
              }}
              aria-label="Подробнее"
            >
              <Icon name="dots" size={18} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function DirectoryArchiveCard({
  session,
  selected,
  onOpen,
}: {
  session: GameSession;
  selected: boolean;
  onOpen: (sessionId: string) => void;
}) {
  const players = directorySessionPlayers(session);
  const previewTone = session.gameKey === 'POKER'
    ? styles.directoryLobbySessionPreviewPoker
    : session.gameKey === 'FLAPPY'
      ? styles.directoryLobbySessionPreviewFlappy
      : styles.directoryLobbySessionPreviewNeutral;
  const stateClassName = session.status === 'CANCELLED' ? styles.tagWarn : styles.tagMuted;
  const completedAt = session.endedAt ?? session.updatedAt;

  const handleOpen = () => onOpen(session.sessionId);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <article
      className={[
        styles.directoryLobbyArchiveCard,
        selected ? styles.directoryLobbyArchiveCardSelected : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <div className={[styles.directoryLobbyArchivePreview, previewTone].join(' ')}>
        <span>{gamePreview(session.gameKey)}</span>
      </div>

      <div className={styles.directoryLobbyArchiveBody}>
        <div className={styles.directoryLobbyArchiveHead}>
          <div className={styles.directoryLobbyArchiveTitleBlock}>
            <h3 className={styles.directoryLobbyArchiveTitle}>{session.title}</h3>
            <div className={styles.directoryLobbyArchiveSubtitle}>{directorySessionSubtitle(session)}</div>
          </div>
          <span className={stateClassName}>{sessionStageLabel(session)}</span>
        </div>

        <div className={styles.directoryLobbyArchiveMeta}>
          <div className={styles.directoryLobbyArchiveMetaItem}>
            <span>Дата</span>
            <strong>{directoryFormatDate(completedAt)}</strong>
          </div>
          <div className={styles.directoryLobbyArchiveMetaItem}>
            <span>Игроки</span>
            <strong>{formatPlayerCount(players.length)}</strong>
          </div>
          <div className={styles.directoryLobbyArchiveMetaItem}>
            <span>Последнее обновление</span>
            <strong>{directoryFormatDateTime(session.updatedAt)}</strong>
          </div>
        </div>
      </div>

      <div className={styles.directoryLobbyArchiveActions}>
        <button
          type="button"
          className={[styles.ghostBtn, styles.directoryLobbyArchiveOpenButton].join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            handleOpen();
          }}
        >
          Открыть
        </button>
        <button
          type="button"
          className={[styles.ghostBtn, styles.directoryLobbyIconButton].join(' ')}
          onClick={(event) => {
            event.stopPropagation();
            handleOpen();
          }}
          aria-label="Подробнее"
        >
          <Icon name="dots" size={18} />
        </button>
      </div>
    </article>
  );
}

function SessionDirectoryRefined({
  sessions,
  activeSessionId,
  mode,
  onModeChange,
  onOpen,
  onCreateRequest,
  onClearArchive,
  creating,
  clearing,
  chat,
  showHeader = true,
}: {
  sessions: GameSession[];
  activeSessionId: string;
  mode: 'all' | 'byGame';
  onModeChange: (mode: 'all' | 'byGame') => void;
  onOpen: (sessionId: string) => void;
  onCreateRequest: () => void;
  onClearArchive: () => void;
  creating: boolean;
  clearing: boolean;
  chat?: Chat;
  showHeader?: boolean;
}) {
  const [archiveExpanded, setArchiveExpanded] = useState(true);
  const active = sessions.filter((item) => item.status === 'CONFIG' || item.status === 'ACTIVE');
  const archive = sessions.filter((item) => item.status === 'FINISHED' || item.status === 'CANCELLED');
  const grouped = GAME_CATALOG.map((game) => ({
    game,
    active: active.filter((item) => item.gameKey === game.key),
    archive: archive.filter((item) => item.gameKey === game.key),
  })).filter((bucket) => bucket.active.length || bucket.archive.length || bucket.game.status !== 'ready');

  return (
    <div className={styles.directoryLobbyLayout}>
      {showHeader ? (
        <header className={styles.directoryLobbyHero}>
          <div className={styles.directoryLobbyHeroTop}>
            <div className={styles.directoryLobbyHeroIntro}>
              <div className={styles.directoryLobbyHeroBadge}>
                <Icon name="game" size={30} />
              </div>

              <div className={styles.directoryLobbyHeroCopy}>
                <h1 className={styles.directoryLobbyHeroTitle}>Лобби</h1>
                <div className={styles.directoryLobbyHeroSubtitle}>
                  Активные игровые лобби и архив завершённых партий.
                </div>
              </div>
            </div>

            <div className={styles.directoryLobbyHeroActions}>
              <div className={styles.catalogTabs}>
                <button className={[styles.catalogTab, mode === 'all' ? styles.catalogTabActive : ''].join(' ')} onClick={() => onModeChange('all')}>
                  Все лобби
                </button>
                <button className={[styles.catalogTab, mode === 'byGame' ? styles.catalogTabActive : ''].join(' ')} onClick={() => onModeChange('byGame')}>
                  По играм
                </button>
              </div>

              <button
                type="button"
                className={[styles.primaryBtn, styles.directoryLobbyCreateButton].join(' ')}
                disabled={creating}
                onClick={onCreateRequest}
              >
                {creating ? <Spinner size={16} /> : 'Новое лобби'}
                {!creating ? <Icon name="plus" size={18} /> : null}
              </button>
            </div>
          </div>

          <div className={styles.directoryLobbyHeroStats}>
            <span className={[styles.tagReady, styles.directoryLobbyHeroStat].join(' ')}>
              <span className={styles.directoryLobbyHeroDot} />
              {directoryLobbyCountText(active.length, 'active')}
            </span>
            <span className={[styles.tagMuted, styles.directoryLobbyHeroStat].join(' ')}>
              <span className={styles.directoryLobbyHeroDotMuted} />
              {directoryLobbyCountText(archive.length, 'archive')}
            </span>
          </div>
        </header>
      ) : null}

      {mode === 'all' ? (
        <>
          <section className={styles.directoryLobbySection}>
            <div className={styles.directoryLobbySectionHead}>
              <div className={styles.directoryLobbySectionHeading}>
                <span className={[styles.directoryLobbySectionIcon, styles.directoryLobbySectionIconActive].join(' ')}>
                  <Icon name="pulse" size={18} />
                </span>
                <div className={styles.directoryLobbySectionCopy}>
                  <div className={styles.directoryLobbySectionTitle}>Активные лобби</div>
                  <div className={styles.directoryLobbySectionText}>
                    Текущие игровые сессии и лобби в ожидании старта всегда наверху.
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.directoryLobbySessionStack}>
              {active.length ? active.map((item) => (
                <DirectoryActiveCard
                  key={item.sessionId}
                  session={item}
                  chat={chat}
                  selected={activeSessionId === item.sessionId}
                  onOpen={onOpen}
                />
              )) : <div className={[styles.empty, styles.directoryLobbyEmpty].join(' ')}>Активных лобби пока нет.</div>}
            </div>
          </section>

          <section className={[styles.directoryLobbySection, styles.directoryLobbyArchiveSection].join(' ')}>
            <div className={styles.directoryLobbySectionHead}>
              <div className={styles.directoryLobbySectionHeading}>
                <span className={[styles.directoryLobbySectionIcon, styles.directoryLobbySectionIconArchive].join(' ')}>
                  <Icon name="clock" size={18} />
                </span>
                <div className={styles.directoryLobbySectionCopy}>
                  <div className={styles.directoryLobbySectionTitle}>Архив</div>
                  <div className={styles.directoryLobbySectionText}>
                    Завершённые и отменённые лобби можно открыть в любой момент.
                  </div>
                </div>
              </div>

              <div className={styles.directoryLobbyArchiveTools}>
                {archive.length ? <span className={styles.directoryLobbyArchiveCount}>{archive.length}</span> : null}
                {archive.length ? (
                  <button
                    type="button"
                    className={[styles.ghostBtn, styles.directoryLobbyArchiveClear].join(' ')}
                    disabled={clearing}
                    onClick={onClearArchive}
                  >
                    Очистить
                  </button>
                ) : null}
                <button
                  type="button"
                  className={[styles.ghostBtn, styles.directoryLobbyIconButton].join(' ')}
                  onClick={() => setArchiveExpanded((current) => !current)}
                  aria-label={archiveExpanded ? 'Свернуть архив' : 'Развернуть архив'}
                >
                  <Icon name={archiveExpanded ? 'chevronUp' : 'chevronDown'} size={18} />
                </button>
              </div>
            </div>

            {archiveExpanded ? (
              <div className={styles.directoryLobbyArchiveStack}>
                {archive.length ? archive.map((item) => (
                  <DirectoryArchiveCard
                    key={item.sessionId}
                    session={item}
                    selected={activeSessionId === item.sessionId}
                    onOpen={onOpen}
                  />
                )) : <div className={[styles.empty, styles.directoryLobbyEmpty].join(' ')}>Архив пока пуст.</div>}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <div className={styles.directoryLobbyGroupGrid}>
          {grouped.map((bucket) => (
            <section key={bucket.game.key} className={styles.directoryLobbyGroupCard}>
              <div className={styles.directoryLobbyGroupHead}>
                <div className={styles.directoryLobbyGroupIntro}>
                  <div
                    className={[
                      styles.directoryLobbyGroupPreview,
                      bucket.game.key === 'POKER'
                        ? styles.directoryLobbySessionPreviewPoker
                        : bucket.game.key === 'FLAPPY'
                          ? styles.directoryLobbySessionPreviewFlappy
                          : styles.directoryLobbySessionPreviewNeutral,
                    ].join(' ')}
                  >
                    <span>{bucket.game.preview}</span>
                  </div>

                  <div className={styles.directoryLobbyGroupCopy}>
                    <div className={styles.directoryLobbyGroupTitle}>{bucket.game.title}</div>
                    <div className={styles.directoryLobbyGroupSubtitle}>{bucket.game.description}</div>
                  </div>
                </div>

                <div className={styles.directoryLobbyGroupStats}>
                  <span className={styles.tagReady}>{bucket.active.length} активных</span>
                  <span className={styles.tagMuted}>{bucket.archive.length} в архиве</span>
                </div>
              </div>

              <div className={styles.directoryLobbyGroupBlock}>
                <div className={styles.directoryLobbyGroupLabel}>Активные</div>
                <div className={styles.directoryLobbySessionStack}>
                  {bucket.active.length ? bucket.active.map((item) => (
                    <DirectoryActiveCard
                      key={item.sessionId}
                      session={item}
                      chat={chat}
                      selected={activeSessionId === item.sessionId}
                      onOpen={onOpen}
                    />
                  )) : <div className={[styles.empty, styles.directoryLobbyEmpty].join(' ')}>Нет активных лобби.</div>}
                </div>
              </div>

              <div className={styles.directoryLobbyGroupBlock}>
                <div className={styles.directoryLobbyGroupLabel}>Архив</div>
                <div className={styles.directoryLobbyArchiveStack}>
                  {bucket.archive.length ? bucket.archive.map((item) => (
                    <DirectoryArchiveCard
                      key={item.sessionId}
                      session={item}
                      selected={activeSessionId === item.sessionId}
                      onOpen={onOpen}
                    />
                  )) : <div className={[styles.empty, styles.directoryLobbyEmpty].join(' ')}>Архив пуст.</div>}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <div className={styles.directoryLobbyHint}>
        <Icon name="sparkles" size={16} />
        <span>Совет: активные лобби отображаются вверху для быстрого доступа.</span>
      </div>
    </div>
  );
}

function SessionOverview({
  session,
  chat,
  onBack,
  onDelete,
  onCancel,
  deleting,
  cancelling,
  compact = false,
  showHeading = true,
  showActions = true,
}: {
  session: GameSession;
  chat?: Chat;
  onBack: () => void;
  onDelete: () => void;
  onCancel: () => void;
  deleting: boolean;
  cancelling: boolean;
  compact?: boolean;
  showHeading?: boolean;
  showActions?: boolean;
}) {
  const hasInteractiveStage = (session.gameKey === 'POKER' && !!session.poker) || (session.gameKey === 'FLAPPY' && !!session.flappy);
  const minimal = hasInteractiveStage || (compact && (showHeading || showActions));
  if (!showHeading && !showActions && minimal) return null;

  return (
    <div className={[styles.directorySection, styles.sessionOverviewBar, minimal ? styles.sessionOverviewBarMinimal : '', compact ? styles.directorySectionCompact : ''].join(' ')}>
      {showHeading ? <div className={styles.sectionRow}>
        <div>
          <div className={styles.sectionTitle}>{session.title}</div>
          <div className={styles.metaMuted}>{gameTitle(session.gameKey)} · {sessionStageLabel(session)} · Время {formatSessionClock(session)}</div>
        </div>
        {showActions ? <div className={styles.toolbarRight}>
          <button className={styles.ghostBtn} onClick={onBack} aria-label="К списку лобби" title="К списку лобби"><Icon name="arrowLeft" size={16} /></button>
          {(session.status === 'CONFIG' || session.status === 'ACTIVE') ? <button className={styles.dangerBtn} disabled={cancelling} onClick={onCancel}>Завершить</button> : null}
          {(session.status === 'FINISHED' || session.status === 'CANCELLED') ? <button className={styles.dangerBtn} disabled={deleting} onClick={onDelete}>Удалить</button> : null}
        </div> : null}
      </div> : null}
      {!minimal ? (
        <div className={styles.overviewGrid}>
          <div className={styles.rulesCard}><div className={styles.metaLabel}>Статус</div><div className={styles.metaMuted}>{sessionStageLabel(session)}</div></div>
          <div className={styles.rulesCard}><div className={styles.metaLabel}>Создана</div><div className={styles.metaMuted}>{new Date(session.createdAt).toLocaleString()}</div></div>
          <div className={styles.rulesCard}><div className={styles.metaLabel}>Игроки</div><div className={styles.metaMuted}>{session.members.filter((m) => m.role === 'player').length} участников · {session.members.filter((m) => m.status === 'left').length} отключились</div></div>
          <div className={styles.rulesCard}><div className={styles.metaLabel}>Результат</div><div className={styles.metaMuted}>{session.result?.winners?.length ? session.result.winners.map((id) => getName(chat, id)).join(', ') : 'Пока нет'}</div></div>
        </div>
      ) : null}
    </div>
  );
}

function RotateDevicePrompt({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.rotatePrompt}>
      <div className={styles.rotatePromptCard}>
        <div className={styles.rotatePromptGlyph}>↺</div>
        <div className={styles.rotatePromptTitle}>{title}</div>
        <div className={styles.metaMuted}>{description}</div>
      </div>
    </div>
  );
}

function GameSessionPanelRevamp({
  chat,
  meId,
  mode,
  embedded = false,
  fullscreenScope,
  onFullscreenScopeChange,
  onViewStateChange,
}: GameSessionPanelProps) {
  const sourceMode = mode ?? (embedded ? 'call' : 'chat');
  const chatId = chat?.id ?? '';
  const isCallMode = sourceMode === 'call';
  const sessionsPollingMs = isCallMode ? 5000 : 4000;
  const detailPollingMs = 3500;
  const { data: sessionsRes } = useGetGameSessionsQuery(
    { chatId },
    { skip: !chatId, pollingInterval: sessionsPollingMs, refetchOnFocus: true, refetchOnReconnect: true },
  );
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameKey>('POKER');
  const [directoryMode, setDirectoryMode] = useState<'all' | 'byGame'>('all');
  const [view, setView] = useState<'directory' | 'create' | 'session'>('directory');
  const [error, setError] = useState('');
  const [createGame, { isLoading: creating }] = useCreateGameSessionMutation();
  const [deleteSession, { isLoading: deleting }] = useDeleteGameSessionMutation();
  const [clearArchive, { isLoading: clearing }] = useClearArchivedGameSessionsMutation();
  const [cancelSession, { isLoading: cancelling }] = useCancelGameSessionMutation();
  const [localFullscreenScope, setLocalFullscreenScope] = useState<FullscreenScope>('none');
  const [mobileImmersiveDismissed, setMobileImmersiveDismissed] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const isPhoneViewport = useMediaQuery('(max-width: 720px)');
  const isPortraitViewport = useMediaQuery('(orientation: portrait)');
  const isControlledFullscreen = fullscreenScope !== undefined;

  const allSessions = sessionsRes?.items ?? [];
  const activeId = selectedSessionId || allSessions[0]?.sessionId || '';
  const { data: detailRes } = useGetGameSessionQuery(
    { sessionId: activeId },
    { skip: !activeId, pollingInterval: detailPollingMs, refetchOnFocus: true, refetchOnReconnect: true },
  );
  const session = detailRes?.session ?? allSessions.find((item) => item.sessionId === activeId) ?? null;
  const chatPlayerIds = useMemo(() => chat?.members.map((member) => member.userId) ?? [], [chat?.id, chat?.members]);
  const activeSessions = allSessions.filter((item) => item.status === 'CONFIG' || item.status === 'ACTIVE');
  const archivedSessions = allSessions.filter((item) => item.status === 'FINISHED' || item.status === 'CANCELLED');
  const selectedMeta = GAME_CATALOG.find((item) => item.key === selectedGame) ?? GAME_CATALOG[0];
  const currentGameKey = view === 'session' && session ? session.gameKey : view === 'create' ? selectedGame : null;
  const presentation = getGamePresentationSpec(currentGameKey);
  const viewportResetKey = view === 'session' && session
    ? `session:${session.sessionId}:${session.status}`
    : view === 'create'
      ? `create:${selectedGame}`
      : `directory:${directoryMode}`;
  const shouldAutoImmersive = isPhoneViewport && view === 'session' && !!session && session.status !== 'CONFIG';
  const shouldForceMobileImmersive = !isControlledFullscreen && shouldAutoImmersive && !mobileImmersiveDismissed;
  const effectiveFullscreenScope = fullscreenScope ?? (shouldForceMobileImmersive ? 'app' : localFullscreenScope);

  useEffect(() => {
    if (view === 'session' && !selectedSessionId && allSessions[0]?.sessionId) {
      setSelectedSessionId(allSessions[0].sessionId);
    }
  }, [view, allSessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId && !allSessions.some((item) => item.sessionId === selectedSessionId)) {
      setSelectedSessionId('');
      setView('directory');
    }
  }, [allSessions, selectedSessionId]);

  useEffect(() => {
    setMobileImmersiveDismissed(false);
  }, [activeId, view]);

  useEffect(() => {
    if (isControlledFullscreen) return;
    if (view !== 'session' && localFullscreenScope !== 'none') {
      setLocalFullscreenScope('none');
      return;
    }
    if (!shouldForceMobileImmersive || localFullscreenScope !== 'none') return;
    setLocalFullscreenScope('app');
  }, [isControlledFullscreen, localFullscreenScope, shouldForceMobileImmersive, view]);

  useEffect(() => {
    if (view !== 'session' || !session || session.status !== 'CONFIG') return;
    const activeScope = fullscreenScope ?? localFullscreenScope;
    if (activeScope === 'none') return;
    if (!isControlledFullscreen) {
      setLocalFullscreenScope('none');
    }
    onFullscreenScopeChange?.('none');
  }, [fullscreenScope, isControlledFullscreen, localFullscreenScope, onFullscreenScopeChange, session, view]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const anchor = scrollAnchorRef.current;
    if (!anchor) return undefined;

    const resetScroll = () => {
      anchor.scrollIntoView({ block: 'start', inline: 'nearest' });

      let node: HTMLElement | null = anchor;
      while (node) {
        const shouldReset =
          node.matches('[data-game-stage-viewport="true"]')
          || node.matches('[data-modal-game-body="true"]');

        if (shouldReset) {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        }

        node = node.parentElement;
      }
    };

    resetScroll();
    const frameId = window.requestAnimationFrame(resetScroll);
    const followUpFrameId = window.requestAnimationFrame(() => window.requestAnimationFrame(resetScroll));
    const timeoutId = window.setTimeout(resetScroll, 80);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(followUpFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [viewportResetKey]);

  const create = async () => {
    try {
      const chosen = GAME_CATALOG.find((item) => item.key === selectedGame);
      if (!chosen || chosen.status === 'development') {
        setError('\u042d\u0442\u0430 \u0438\u0433\u0440\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0434\u043b\u044f \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u043d\u043e\u0432\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438.');
        return;
      }
      const title = selectedGame === 'POKER'
        ? '\u041f\u043e\u043a\u0435\u0440\u043d\u044b\u0439 \u0441\u0442\u043e\u043b'
        : selectedGame === 'FLAPPY'
          ? 'Flappy Rush'
          : gameTitle(selectedGame);
      const res = await createGame({
        chatId,
        gameKey: selectedGame,
        title,
        participantUserIds: chatPlayerIds,
        config: gameConfigDefaults(selectedGame),
      }).unwrap();
      setSelectedSessionId(res.session.sessionId);
      setView('session');
      setError('');
    } catch (e) {
      notifyError(setError, 'create-game', e);
    }
  };

  const openSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setView('session');
    setError('');
  };

  const handleDelete = async () => {
    if (!session) return;
    try {
      await deleteSession({ sessionId: session.sessionId, chatId }).unwrap();
      setSelectedSessionId('');
      setView('directory');
      setError('');
    } catch (e) {
      notifyError(setError, 'delete-session', e);
    }
  };

  const handleClearArchive = async () => {
    try {
      await clearArchive({ chatId }).unwrap();
      if (session && (session.status === 'FINISHED' || session.status === 'CANCELLED')) {
        setSelectedSessionId('');
        setView('directory');
      }
      setError('');
    } catch (e) {
      notifyError(setError, 'clear-archive', e);
    }
  };

  const handleCancel = async () => {
    if (!session) return;
    try {
      await cancelSession({ sessionId: session.sessionId }).unwrap();
      setError('');
    } catch (e) {
      notifyError(setError, 'cancel-session', e);
    }
  };

  const handleFullscreenScopeChange = (scope: FullscreenScope) => {
    if (!isControlledFullscreen) {
      setLocalFullscreenScope(scope);
      if (isPhoneViewport && view === 'session' && scope === 'none') {
        setMobileImmersiveDismissed(true);
      }
    }
    onFullscreenScopeChange?.(scope);
  };

  const uiTitle = view === 'session' && session
    ? session.title
    : view === 'create'
      ? '\u041d\u043e\u0432\u043e\u0435 \u043b\u043e\u0431\u0431\u0438'
      : '\u041b\u043e\u0431\u0431\u0438';

  const uiSubtitle = view === 'session' && session
    ? `${gameTitle(session.gameKey)} \u00b7 ${sessionStageLabel(session)}`
    : view === 'create'
      ? selectedMeta.description
      : '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043b\u043e\u0431\u0431\u0438 \u0438 \u0430\u0440\u0445\u0438\u0432 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d\u043d\u044b\u0445 \u0438\u0433\u0440.';

  const uiMeta = view === 'session' && session ? (
    <>
      <span className={styles.tagReady}>{session.members.filter((member) => member.role === 'player').length} {'\u0438\u0433\u0440\u043e\u043a\u043e\u0432'}</span>
      <span className={styles.tagMuted}>{formatSessionClock(session)}</span>
    </>
  ) : view === 'create' ? (
    <>
      {selectedMeta.status === 'beta' ? <span className={styles.tagWarn}>{'\u0411\u0435\u0442\u0430'}</span> : null}
      {selectedMeta.status === 'development' ? <span className={styles.tagMuted}>{'\u0421\u043a\u043e\u0440\u043e'}</span> : <span className={styles.tagReady}>{'\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u0430'}</span>}
    </>
  ) : (
    <>
      <span className={styles.tagReady}>{activeSessions.length} {'\u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043b\u043e\u0431\u0431\u0438'}</span>
      <span className={styles.tagMuted}>{archivedSessions.length} {'\u0432 \u0430\u0440\u0445\u0438\u0432\u0435'}</span>
    </>
  );

  const uiHeaderActions = view === 'session' && session ? (
    <div className={styles.headerActionRail}>
      <div className={styles.headerActionCluster}>
        <button
          className={[styles.ghostBtn, styles.iconActionBtn].join(' ')}
          onClick={() => setView('directory')}
          aria-label={'\u041a \u0441\u043f\u0438\u0441\u043a\u0443 \u043b\u043e\u0431\u0431\u0438'}
          title={'\u041a \u0441\u043f\u0438\u0441\u043a\u0443 \u043b\u043e\u0431\u0431\u0438'}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        {session.status === 'ACTIVE' ? (
          <button className={[styles.dangerBtn, styles.headerPrimaryAction].join(' ')} disabled={cancelling} onClick={handleCancel}>
            {'\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c'}
          </button>
        ) : null}
        {(session.status === 'FINISHED' || session.status === 'CANCELLED') ? (
          <button className={[styles.dangerBtn, styles.headerPrimaryAction].join(' ')} disabled={deleting} onClick={handleDelete}>
            {'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}
          </button>
        ) : null}
      </div>
    </div>
  ) : view === 'create' ? (
    <div className={styles.headerActionRail}>
      <div className={styles.headerActionCluster}>
        <button
          className={[styles.ghostBtn, styles.iconActionBtn].join(' ')}
          onClick={() => setView('directory')}
          aria-label={'\u041d\u0430\u0437\u0430\u0434'}
          title={'\u041d\u0430\u0437\u0430\u0434'}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <button className={[styles.primaryBtn, styles.headerPrimaryAction].join(' ')} disabled={creating || selectedMeta.status === 'development'} onClick={() => void create()}>
          {creating ? <Spinner size={16} /> : '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043b\u043e\u0431\u0431\u0438'}
        </button>
      </div>
    </div>
  ) : (
    <div className={styles.headerActionRail}>
      <div className={styles.headerSegmentRail}>
        <div className={styles.catalogTabs}>
          <button className={[styles.catalogTab, directoryMode === 'all' ? styles.catalogTabActive : ''].join(' ')} onClick={() => setDirectoryMode('all')}>
            {'\u0412\u0441\u0435 \u043b\u043e\u0431\u0431\u0438'}
          </button>
          <button className={[styles.catalogTab, directoryMode === 'byGame' ? styles.catalogTabActive : ''].join(' ')} onClick={() => setDirectoryMode('byGame')}>
            {'\u041f\u043e \u0438\u0433\u0440\u0430\u043c'}
          </button>
        </div>
      </div>
      <div className={styles.headerUtilityRow}>
        <button className={[styles.ghostBtn, styles.headerUtilityAction, styles.headerUtilityActionSecondary].join(' ')} disabled={clearing || !archivedSessions.length} onClick={() => void handleClearArchive()}>
          {'\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0430\u0440\u0445\u0438\u0432'}
        </button>
        <button
          className={[styles.primaryBtn, styles.headerUtilityAction, styles.headerUtilityActionPrimary].join(' ')}
          disabled={creating}
          onClick={() => {
            setError('');
            setView('create');
          }}
        >
          {creating ? <Spinner size={16} /> : '\u041d\u043e\u0432\u043e\u0435 \u043b\u043e\u0431\u0431\u0438'}
        </button>
      </div>
    </div>
  );

  return (
    <GameFrame
      mode={sourceMode}
      fullscreenScope={effectiveFullscreenScope}
      onFullscreenScopeChange={handleFullscreenScopeChange}
      onViewStateChange={onViewStateChange}
      presentation={presentation}
      viewportKey={viewportResetKey}
      allowFullscreen={view === 'session' && !!session && session.status !== 'CONFIG'}
      hideHeaderInFullscreen={!(view === 'session' && !!session && session.gameKey === 'POKER')}
      hideHeader={
        view === 'directory'
        || view === 'create'
        || (view === 'session' && !!session && session.status === 'CONFIG')
        || (view === 'session' && !!session && session.gameKey === 'POKER')
      }
      flushViewport={
        view === 'directory'
        || view === 'create'
        || (view === 'session' && !!session && session.status === 'CONFIG')
      }
      eyebrow={view === 'session' && session?.status === 'CONFIG' ? undefined : (sourceMode === 'call' ? 'Игры во звонке' : 'Игры в чате')}
      title={uiTitle}
      subtitle={uiSubtitle}
      badge={currentGameKey ? gamePreview(currentGameKey) : undefined}
      meta={uiMeta}
      headerActions={uiHeaderActions}
      className={[styles.shell, isCallMode ? styles.shellCall : styles.shellChat].filter(Boolean).join(' ')}
      stageClassName={[
        styles.frameStage,
        view === 'session' ? styles.frameStageSession : styles.frameStageRevampScroll,
        view === 'session' && session?.status === 'CONFIG' ? styles.frameStageSessionConfig : '',
        isCallMode ? styles.frameStageCall : '',
      ].filter(Boolean).join(' ')}
    >
      {(frameState) => {
        const compact = frameState.stageSize.availableWidth < 1040 || frameState.stageSize.availableHeight < 760;
        const immersive = frameState.mode === 'fullscreen';
        const canRenderPokerStage = session?.gameKey === 'POKER' && !!session?.poker;
        const canRenderFlappyStage = session?.gameKey === 'FLAPPY' && !!session?.flappy;
        const shouldShowSessionOverview = !!session && !canRenderPokerStage && !canRenderFlappyStage && session.status !== 'ACTIVE';
        const needsRotatePrompt = !!session
          && session.gameKey === 'POKER'
          && session.status !== 'CONFIG'
          && (
            (isPhoneViewport && isPortraitViewport)
            || (
              frameState.stageSize.availableHeight > frameState.stageSize.availableWidth
              && frameState.stageSize.availableWidth < 960
            )
          );

        return view === 'session' && session ? (
          <div
            ref={scrollAnchorRef}
            className={[
            styles.revampSessionViewport,
            session.gameKey === 'POKER' ? styles.revampSessionViewportPoker : '',
            immersive ? styles.revampSessionViewportFullscreen : '',
            session.status === 'CONFIG' ? styles.revampSessionViewportConfig : '',
          ].filter(Boolean).join(' ')}
          >
            {error ? <div className={[styles.error, styles.revampSessionError].join(' ')}>{error}</div> : null}
            {session.status === 'CONFIG' ? (
              <div className={[styles.revampSessionConfig, styles.revampSessionConfigLobby].join(' ')}>
                <LobbyViewRefined session={session} chat={chat} meId={meId} setError={setError} onBack={() => setView('directory')} compact={compact} />
              </div>
            ) : needsRotatePrompt ? (
              <RotateDevicePrompt
                title="Поверните устройство"
                description="Для покера нужен горизонтальный экран. В ландшафтной ориентации стол займет всю доступную высоту и ширину без сжатия."
              />
            ) : canRenderPokerStage ? (
              <PokerView
                session={session}
                chat={chat}
                meId={meId}
                setError={setError}
                compact={compact || immersive || frameState.isFullscreen}
                immersive={immersive}
                mobileViewport={isPhoneViewport}
                fullscreenActive={frameState.isFullscreen}
                onToggleFullscreen={frameState.toggleFullscreen}
                onBack={() => {
                  const leaveSession = () => {
                    setError('');
                    setView('directory');
                  };

                  if (frameState.isFullscreen) {
                    void frameState.exitFullscreen().finally(leaveSession);
                    return;
                  }

                  leaveSession();
                }}
                onClose={() => {
                  const leaveSession = () => {
                    setError('');
                    setView('directory');
                  };

                  if (frameState.isFullscreen) {
                    void frameState.exitFullscreen().finally(leaveSession);
                    return;
                  }

                  leaveSession();
                }}
              />
            ) : canRenderFlappyStage ? (
              <FlappyView session={session} chat={chat} meId={meId} setError={setError} compact={compact} immersive={immersive} mobileViewport={isPhoneViewport} />
            ) : shouldShowSessionOverview ? (
              <div className={styles.revampSessionConfig}>
                <SessionOverview
                  session={session}
                  chat={chat}
                  onBack={() => setView('directory')}
                  onDelete={() => void handleDelete()}
                  onCancel={() => void handleCancel()}
                  deleting={deleting}
                  cancelling={cancelling}
                  compact={compact}
                  showHeading={false}
                  showActions={false}
                />
              </div>
            ) : (
              <div className={styles.revampRotatePrompt}>
                <div className={styles.revampRotateCard}>
                  <div className={styles.revampRotateTitle}>Не удалось открыть игру</div>
                  <div className={styles.metaMuted}>Данные игрового экрана ещё не подгрузились. Попробуйте вернуться к списку лобби и открыть его снова.</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div ref={scrollAnchorRef} className={[styles.revampStageRoot, immersive ? styles.revampStageRootFullscreen : ''].filter(Boolean).join(' ')}>
            {error ? <div className={styles.error}>{error}</div> : null}
            {view === 'create' ? (
              <CreateSessionViewRefined
                selectedGame={selectedGame}
                onSelectGame={setSelectedGame}
                onCreate={create}
                creating={creating}
                onBack={() => setView('directory')}
                showHeader
              />
            ) : (
              <SessionDirectoryRefined
                sessions={allSessions}
                activeSessionId={activeId}
                mode={directoryMode}
                onModeChange={setDirectoryMode}
                onOpen={openSession}
                onCreateRequest={() => {
                  setError('');
                  setView('create');
                }}
                onClearArchive={handleClearArchive}
                creating={creating}
                clearing={clearing}
                chat={chat}
                showHeader
              />
            )}
          </div>
        );
      }}
    </GameFrame>
  );
}

export function GameSessionPanel(props: GameSessionPanelProps) {
  return <GameSessionPanelRevamp {...props} />;
}
