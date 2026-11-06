'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    title: 'Flappy Bird',
    preview: '🐦',
    status: 'beta',
    description: 'Аркада с прыгающей птицей и трубами. Считаем попытки и лучший счёт всех участников.',
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
function gameConfigDefaults(gameKey: GameKey) {
  if (gameKey === 'POKER') {
    return { buyIn: 1000, smallBlind: 10, bigBlind: 20, timerSec: 20, maxPlayers: 6, allowObservers: true };
  }
  if (gameKey === 'FLAPPY') {
    return { maxAttempts: 5, allowObservers: true };
  }
  return {};
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

function Card({ card, compact = false }: { card: string; compact?: boolean }) {
  if (card === '??') return <div className={[styles.card, compact ? styles.cardSm : '', styles.cardBack].join(' ')} />;
  return (
    <div className={[styles.card, compact ? styles.cardSm : '', red(card) ? styles.cardRed : ''].join(' ')}>
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
}: {
  selectedGame: GameKey;
  onSelectGame: (game: GameKey) => void;
  onCreate: () => void;
  creating: boolean;
  onBack: () => void;
}) {
  const selectedMeta = GAME_CATALOG.find((item) => item.key === selectedGame) ?? GAME_CATALOG[0];
  return (
    <div className={styles.directoryLayout}>
      <div className={styles.directoryHeader}>
        <div>
          <div className={styles.sectionTitle}>Новая сессия</div>
          <div className={styles.metaMuted}>Сначала выбери игру. Для каждой плитки показываем название, превью и текущий статус готовности.</div>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.ghostBtn} onClick={onBack} aria-label="Назад к списку сессий" title="Назад к списку сессий"><Icon name="arrowLeft" size={16} /></button>
          <button className={styles.primaryBtn} disabled={creating || selectedMeta.status === 'development'} onClick={onCreate}>{creating ? <Spinner size={16} /> : 'Создать сессию'}</button>
        </div>
      </div>

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

function PokerView({ session, chat, meId, setError, compact = false }: { session: GameSession; chat?: Chat; meId: string; setError: (v: string) => void; compact?: boolean }) {
  const poker = session.poker!;
  const me = poker.players.find((p) => p.userId === meId);
  const [amount, setAmount] = useState(Number(session.config?.bigBlind ?? 20));
  const [showLog, setShowLog] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [act, { isLoading }] = usePokerActionMutation();
  const prevStage = useRef<string>('');
  const prevAction = useRef<string>('');

  useEffect(() => {
    setAmount(Number(session.config?.bigBlind ?? 20));
  }, [session.sessionId, session.updatedAt, session.config]);

  useEffect(() => {
    const akey = `${poker.actionLog?.[0]?.id ?? ''}:${poker.turnUserId ?? ''}`;
    if (prevStage.current && prevStage.current !== poker.stage) playUiBeep({ frequency: 660, durationMs: 180 });
    if (prevAction.current && prevAction.current !== akey && poker.turnUserId === meId) playUiBeep({ frequency: 880, durationMs: 120 });
    prevStage.current = poker.stage ?? '';
    prevAction.current = akey;
  }, [poker.turnUserId, poker.stage, poker.actionLog, meId]);

  const toCall = me ? Math.max(0, poker.currentBet - me.roundBet) : 0;
  const myTurn = poker.turnUserId === meId;
  const canCheck = toCall === 0;
  const canBet = poker.currentBet === 0;
  const bigBlind = Number(session.config?.bigBlind ?? 20);
  const minRaiseTo = Math.max(bigBlind, poker.currentBet + bigBlind);
  const latestAction = poker.actionLog?.[0] ?? null;
  const playersBySeat = [...poker.players].sort((a, b) => a.seat - b.seat);
  const dealerUserId = playersBySeat[poker.dealerIndex % Math.max(1, playersBySeat.length)]?.userId ?? null;
  const opponents = playersBySeat.filter((p) => p.userId !== meId);
  const opponentSeatClasses = useMemo(() => {
    if (opponents.length <= 1) return [styles.seatPosHeadsUpRight];
    if (opponents.length === 2) return [styles.seatPosTopLeft, styles.seatPosTopRight];
    if (opponents.length === 3) return [styles.seatPosTop, styles.seatPosLeftLow, styles.seatPosRightLow];
    if (opponents.length === 4) return [styles.seatPosTopLeft, styles.seatPosTopRight, styles.seatPosLeftLow, styles.seatPosRightLow];
    return [styles.seatPosTop, styles.seatPosTopRight, styles.seatPosRight, styles.seatPosLeft, styles.seatPosTopLeft];
  }, [opponents.length]);
  const showOverlayResult = poker.stage === 'showdown' || session.status === 'FINISHED' || session.status === 'CANCELLED';
  const overlayResult = session.status === 'FINISHED' || session.status === 'CANCELLED'
    ? (session.result ?? poker.result)
    : (poker.lastCompletedHandResult ?? poker.result);
  const overlayTitle = session.status === 'CANCELLED'
    ? 'Игра отменена'
    : session.status === 'FINISHED'
      ? 'Победитель игры'
      : 'Победитель раздачи';

  const submit = async (type: 'fold' | 'check' | 'call' | 'bet' | 'raise', nextAmount?: number) => {
    try {
      setError('');
      await act({ sessionId: session.sessionId, type, amount: nextAmount, idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` }).unwrap();
    } catch (e) {
      notifyError(setError, 'poker-action', e);
    }
  };

  return (
    <div className={[styles.gameLayout, styles.pokerGameLayout, compact ? styles.gameLayoutCompact : ''].join(' ')}>
      <div className={[styles.pokerViewport, compact ? styles.pokerViewportCompact : ''].join(' ')}>
        <div className={styles.pokerTopline}>
          <div className={styles.pokerTopMain}>
            <div className={styles.pokerHandTitle}>Раздача #{poker.handNumber ?? 1}</div>
            <div className={styles.pokerHandMeta}>Покер · {formatStage(poker.stage)} · Банк {poker.pot} · Время {formatSessionClock(session)}</div>
          </div>
          <div className={styles.pokerTopAside}>
            <div className={styles.stageStrip}>
              {STAGES.map((stage) => {
                const currentIndex = STAGES.indexOf((poker.stage as any) ?? 'preflop');
                const itemIndex = STAGES.indexOf(stage);
                return (
                  <span
                    key={stage}
                    className={[
                      styles.stagePill,
                      poker.stage === stage ? styles.stagePillCurrent : '',
                      itemIndex < currentIndex ? styles.stagePillDone : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {compact ? formatStage(stage).slice(0, 1) : formatStage(stage)}
                  </span>
                );
              })}
            </div>
            <TurnTimer deadlineAt={poker.actionDeadlineAt} duration={poker.timerSec ?? 20} compact serverNow={session.serverNow} />
            <button className={styles.ghostBtn} onClick={() => setShowPlayers((v) => !v)}>{showPlayers ? 'Игроки ×' : 'Игроки'}</button>
            <button className={styles.ghostBtn} onClick={() => setShowLog((v) => !v)}>{showLog ? 'Лог ×' : 'Лог'}</button>
          </div>
        </div>

        <div className={styles.pokerTableViewport}>
          <div className={styles.pokerTableFrame}>
            <div className={styles.pokerTableInner}>
              {showPlayers ? (
                <div className={[styles.tableDrawer, styles.tableDrawerLeft].join(' ')}>
                  <div className={styles.tableDrawerTitle}>Игроки</div>
                  <div className={styles.drawerList}>
                    {playersBySeat.map((player) => {
                      const member = session.members.find((m) => m.userId === player.userId);
                      return (
                        <div key={player.userId} className={[styles.drawerRow, poker.turnUserId === player.userId ? styles.drawerRowTurn : ''].join(' ')}>
                          <span>{getName(chat, player.userId)}</span>
                          <span>{player.stack}</span>
                          <span>{connectionStatusLabel(member?.connectionStatus)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {showLog ? (
                <div className={[styles.tableDrawer, styles.tableDrawerRight].join(' ')}>
                  <div className={styles.tableDrawerTitle}>Лог</div>
                  <div className={styles.drawerList}>
                    {poker.actionLog.slice(0, compact ? 8 : 12).map((item) => (
                      <div key={item.id} className={styles.drawerRow}>
                        <span>{getName(chat, item.userId)}</span>
                        <span>{item.note ?? formatAction(item.type, item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {opponents.map((player, index) => {
                const member = session.members.find((m) => m.userId === player.userId);
                return (
                  <div
                    key={player.userId}
                    className={[
                      styles.seatPanel,
                      opponentSeatClasses[index] ?? styles.seatPosTop,
                      poker.turnUserId === player.userId ? styles.seatPanelTurn : '',
                      player.folded ? styles.seatPanelFolded : '',
                    ].join(' ')}
                  >
                    <div className={styles.seatPanelTop}>
                      <div className={styles.seatAvatarWrap}>
                        <Avatar url={getUser(chat, player.userId)?.avatarUrl ?? undefined} name={getName(chat, player.userId)} size={compact ? 20 : 22} />
                        {dealerUserId === player.userId ? <span className={styles.dealerChip}>D</span> : null}
                      </div>
                      <div className={styles.seatPanelMeta}>
                        <strong>{getName(chat, player.userId)}</strong>
                        <span>{player.stack}</span>
                      </div>
                      {poker.turnUserId === player.userId ? <div className={styles.seatTimerMini}><TurnTimer deadlineAt={poker.actionDeadlineAt} duration={poker.timerSec ?? 20} compact serverNow={session.serverNow} /></div> : null}
                    </div>
                    <div className={styles.seatPanelCards}>{player.cards.map((card, i) => <Card key={i} card={card} compact />)}</div>
                    <div className={styles.seatPanelBadges}>
                      <span className={styles.seatActionPill}>{player.lastAction ? formatAction(player.lastAction, player.lastActionAmount) : 'Ждёт'}</span>
                      {connectionStatusTone(member?.connectionStatus) === 'offline' ? <span className={styles.seatStatusOffline}>offline</span> : connectionStatusTone(member?.connectionStatus) === 'reconnecting' ? <span className={styles.seatStatusOffline}>reconnecting</span> : <span className={styles.seatStatusOnline}>online</span>}
                    </div>
                    {player.roundBet > 0 ? <div className={styles.seatChipBet}>{player.roundBet}</div> : null}
                  </div>
                );
              })}

              <div className={styles.boardCluster}>
                <div className={styles.boardHeaderMini}>
                  <span className={styles.potBadge}>Банк {poker.pot}</span>
                  <span className={styles.infoChip}>{poker.turnUserId ? `Ход: ${getName(chat, poker.turnUserId)}` : formatStage(poker.stage)}</span>
                  {latestAction ? <span className={styles.infoChip}>{latestAction.note ?? `${getName(chat, latestAction.userId)} · ${formatAction(latestAction.type, latestAction.amount)}`}</span> : null}
                </div>
                <div className={styles.boardCardsCompact}>
                  {Array.from({ length: 5 }).map((_, i) => <Card key={i} card={poker.communityCards[i] ?? '??'} compact={compact} />)}
                </div>
                <div className={styles.boardFooterMini}>
                  <span className={styles.infoChip}>Ставка {poker.currentBet}</span>
                  <span className={styles.infoChip}>{toCall > 0 ? `К ответу ${toCall}` : 'Можно чекать'}</span>
                </div>
              </div>

              <div className={[styles.heroSeatFlat, myTurn ? styles.heroSeatFlatTurn : ''].join(' ')}>
                <div className={styles.heroSeatInfo}>
                  <div className={styles.seatAvatarWrap}>
                    <Avatar url={getUser(chat, meId)?.avatarUrl ?? undefined} name={getName(chat, meId)} size={compact ? 22 : 24} />
                    {dealerUserId === meId ? <span className={styles.dealerChip}>D</span> : null}
                  </div>
                  <div className={styles.seatPanelMeta}>
                    <strong>{getName(chat, meId)} · Вы</strong>
                    <span>{me?.stack ?? 0} фишек</span>
                  </div>
                  {myTurn ? <div className={styles.seatTimerMini}><TurnTimer deadlineAt={poker.actionDeadlineAt} duration={poker.timerSec ?? 20} compact serverNow={session.serverNow} /></div> : null}
                  {me && me.roundBet > 0 ? <div className={styles.heroChipBet}>{me.roundBet}</div> : null}
                </div>
                <div className={styles.heroSeatCards}>{me?.cards.map((card, i) => <Card key={i} card={card} compact={false} />)}</div>
                <div className={styles.heroSeatControls}>
                  <button className={styles.dangerBtn} disabled={!myTurn || isLoading} onClick={() => submit('fold')}>Фолд</button>
                  <button className={styles.ghostBtn} disabled={!myTurn || isLoading} onClick={() => submit(canCheck ? 'check' : 'call')}>
                    {canCheck ? 'Чек' : `Колл ${toCall}`}
                  </button>
                  <div className={styles.raiseBoxInline}>
                    <input className={styles.input} type="number" value={amount} min={canBet ? bigBlind : minRaiseTo} onChange={(e) => setAmount(Number(e.target.value || 0))} />
                    <button className={styles.primaryBtn} disabled={!myTurn || isLoading || amount <= 0} onClick={() => submit(canBet ? 'bet' : 'raise', amount)}>{canBet ? 'Бет' : 'Рейз'}</button>
                  </div>
                </div>
              </div>

              {showOverlayResult && overlayResult ? (
                <div className={styles.showdownOverlay}>
                  <div className={styles.showdownCard}>
                    <div className={styles.resultTitle}>{overlayTitle}</div>
                    <div className={styles.resultWinners}>{overlayResult.winners.length ? overlayResult.winners.map((id) => getName(chat, id)).join(', ') : 'Без победителя'}</div>
                    <div className={styles.metaMuted}>{poker.showdownMessage ?? overlayResult.placements[0]?.handLabel ?? 'Результат раздачи зафиксирован'}</div>
                    <div className={styles.resultPlaces}>
                      {overlayResult.placements.slice(0, compact ? 2 : 4).map((item) => (
                        <div key={item.userId} className={styles.resultPlace}>
                          <strong>{getName(chat, item.userId)}</strong>
                          <span>{item.handLabel ?? '—'}</span>
                          <span>{item.amount > 0 ? `+${item.amount}` : '0'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.pokerBottomLine}>
          <div className={styles.heroActionState}>
            <span className={myTurn ? styles.tagReady : styles.tagMuted}>{myTurn ? 'Ваш ход' : 'Ожидание'}</span>
            <span className={styles.metaMuted}>{toCall > 0 ? `Нужно ответить ${toCall}` : 'Можно сделать check'}</span>
          </div>
          {latestAction ? <div className={styles.inlineLastAction}>{getName(chat, latestAction.userId)} · {latestAction.note ?? formatAction(latestAction.type, latestAction.amount)}</div> : <div />}
        </div>
      </div>
    </div>
  );
}


function FlappyView({ session, chat, meId, setError, compact = false }: { session: GameSession; chat?: Chat; meId: string; setError: (v: string) => void; compact?: boolean }) {
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
  const width = compact ? 300 : 420;
  const height = compact ? 320 : 440;
  const attemptsLeft = Math.max(0, (flappy.maxAttempts ?? 0) - (me?.attemptsUsed ?? 0));
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

  const drawIdle = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0f2a1d');
    sky.addColorStop(1, '#143d1e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1d5f2a';
    ctx.fillRect(0, height - 44, width, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = '700 20px Inter, system-ui';
    ctx.fillText('Tap / Space to flap', Math.max(26, width / 2 - 92), height / 2);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0f2a1d');
    sky.addColorStop(1, '#143d1e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#1d5f2a';
    ctx.fillRect(0, height - 44, width, 44);
    ctx.fillStyle = '#d6b14b';
    for (const pipe of state.pipes) {
      ctx.fillRect(pipe.x, 0, 54, pipe.gapY - 72);
      ctx.fillRect(pipe.x, pipe.gapY + 72, 54, height - pipe.gapY - 72 - 44);
    }

    ctx.fillStyle = '#f4d84d';
    ctx.beginPath();
    ctx.arc(92, state.birdY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(98, state.birdY - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(10, 10, 86, 34);
    ctx.fillStyle = '#fff';
    ctx.font = '700 18px Inter, system-ui';
    ctx.fillText(`Счёт ${state.score}`, 20, 32);
  };

  const finishAttempt = async (score: number) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stateRef.current = null;
    setPlaying(false);
    setLocalScore(score);
    setOverlayOpen(true);
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
    state.birdVelocity += 0.45 * dt;
    state.birdY += state.birdVelocity * dt;
    if (!state.pipes.length || state.pipes[state.pipes.length - 1].x < width - 170) {
      state.pipes.push({ x: width + 24, gapY: 120 + Math.random() * (height - 260), passed: false });
    }
    for (const pipe of state.pipes) pipe.x -= 2.8 * dt;
    state.pipes = state.pipes.filter((pipe: any) => pipe.x > -80);
    for (const pipe of state.pipes) {
      if (!pipe.passed && pipe.x + 54 < 92) {
        pipe.passed = true;
        state.score += 1;
        setLocalScore(state.score);
      }
      const hitX = 92 + 15 > pipe.x && 92 - 15 < pipe.x + 54;
      const hitY = state.birdY - 15 < pipe.gapY - 72 || state.birdY + 15 > pipe.gapY + 72;
      if (hitX && hitY) {
        void finishAttempt(state.score);
        return;
      }
    }
    if (state.birdY < 10 || state.birdY > height - 58) {
      void finishAttempt(state.score);
      return;
    }
    draw();
    frameRef.current = requestAnimationFrame(tick);
  };

  const flap = () => {
    if (!stateRef.current) return;
    stateRef.current.birdVelocity = -5.7;
  };

  const startAttempt = () => {
    if (!canPlay || playing || submitting) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    attemptKeyRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    stateRef.current = {
      birdY: height / 2 - 10,
      birdVelocity: 0,
      pipes: [],
      score: 0,
      lastTime: 0,
    };
    setLocalScore(0);
    setPlaying(true);
    setOverlayOpen(false);
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
  }, [playing, canPlay]);

  const top = flappy.leaderboard[0];

  return (
    <div className={[styles.gameLayout, styles.flappyLayout, compact ? styles.gameLayoutCompact : ''].join(' ')}>
      <div className={styles.flappyTopbar}>
        <div>
          <div className={styles.pokerHandTitle}>Flappy Bird</div>
          <div className={styles.pokerHandMeta}>Попытки {flappy.maxAttempts} · Время {formatSessionClock(session)} · Участников {flappy.players.length}</div>
        </div>
        <div className={styles.flappyTopStats}>
          <span className={styles.infoChip}>Лучший {me?.bestScore ?? 0}</span>
          <span className={styles.infoChip}>Осталось {attemptsLeft}</span>
          {top ? <span className={styles.infoChip}>Лидер {getName(chat, top.userId)} · {top.bestScore}</span> : null}
          <span className={styles.tagWarn}>Beta</span>
        </div>
      </div>
      <div className={styles.flappyBody}>
        <div className={styles.flappyArenaWrap}>
          <div className={styles.flappyHud}>
            <span className={styles.infoChip}>Счёт {localScore}</span>
            <span className={styles.infoChip}>Попытка {me?.attemptsUsed ?? 0}/{flappy.maxAttempts}</span>
            <span className={styles.infoChip}>{playing ? 'В полёте' : attemptsLeft > 0 ? 'Готов' : 'Ждём итог'}</span>
          </div>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={styles.flappyCanvas}
            onClick={() => { if (playing) flap(); else if (canPlay) startAttempt(); }}
          />
          {overlayOpen ? (
            <div className={styles.flappyOverlay}>
              <div className={styles.flappyOverlayCard}>
                <div className={styles.resultTitle}>{session.status === 'FINISHED' ? 'Сессия завершена' : 'Новая попытка'}</div>
                <div className={styles.resultWinners}>Последний счёт: {localScore}</div>
                <div className={styles.metaMuted}>Лучший результат: {me?.bestScore ?? 0} · Попыток осталось: {attemptsLeft}</div>
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
                {canPlay && session.status === 'ACTIVE' ? <button className={styles.primaryBtn} onClick={startAttempt}>Старт попытки</button> : null}
                {!canPlay && session.status === 'ACTIVE' ? <div className={styles.metaMuted}>Лимит попыток исчерпан. Ждём остальных игроков.</div> : null}
              </div>
            </div>
          ) : null}
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
      <div className={styles.directoryHeader}>
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
      </div>

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

function SessionOverview({ session, chat, onBack, onDelete, onCancel, deleting, cancelling, compact = false }: { session: GameSession; chat?: Chat; onBack: () => void; onDelete: () => void; onCancel: () => void; deleting: boolean; cancelling: boolean; compact?: boolean }) {
  const minimal = compact || session.gameKey === 'POKER' || session.gameKey === 'FLAPPY';

  return (
    <div className={[styles.directorySection, styles.sessionOverviewBar, minimal ? styles.sessionOverviewBarMinimal : '', compact ? styles.directorySectionCompact : ''].join(' ')}>
      <div className={styles.sectionRow}>
        <div>
          <div className={styles.sectionTitle}>{session.title}</div>
          <div className={styles.metaMuted}>{gameTitle(session.gameKey)} · {sessionStageLabel(session)} · Время {formatSessionClock(session)}</div>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.ghostBtn} onClick={onBack} aria-label="К списку сессий" title="К списку сессий"><Icon name="arrowLeft" size={16} /></button>
          {(session.status === 'CONFIG' || session.status === 'ACTIVE') ? <button className={styles.dangerBtn} disabled={cancelling} onClick={onCancel}>Завершить</button> : null}
          {(session.status === 'FINISHED' || session.status === 'CANCELLED') ? <button className={styles.dangerBtn} disabled={deleting} onClick={onDelete}>Удалить</button> : null}
        </div>
      </div>
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

export function GameSessionPanel({ chat, meId, embedded = false }: { chat?: Chat; meId: string; embedded?: boolean }) {
  const chatId = chat?.id ?? '';
  const { data: sessionsRes } = useGetGameSessionsQuery({ chatId }, { skip: !chatId, pollingInterval: embedded ? 2500 : 1600, refetchOnMountOrArgChange: true });
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameKey>('POKER');
  const [directoryMode, setDirectoryMode] = useState<'all' | 'byGame'>('all');
  const [view, setView] = useState<'directory' | 'create' | 'session'>('directory');
  const [error, setError] = useState('');
  const [createGame, { isLoading: creating }] = useCreateGameSessionMutation();
  const [deleteSession, { isLoading: deleting }] = useDeleteGameSessionMutation();
  const [clearArchive, { isLoading: clearing }] = useClearArchivedGameSessionsMutation();
  const [cancelSession, { isLoading: cancelling }] = useCancelGameSessionMutation();

  const allSessions = sessionsRes?.items ?? [];
  const activeId = selectedSessionId || allSessions[0]?.sessionId || '';
  const { data: detailRes } = useGetGameSessionQuery({ sessionId: activeId }, { skip: !activeId, pollingInterval: 1200, refetchOnMountOrArgChange: true });
  const session = detailRes?.session ?? allSessions.find((s) => s.sessionId === activeId) ?? null;
  const chatPlayerIds = useMemo(() => chat?.members.map((m) => m.userId) ?? [], [chat?.id, chat?.members]);

  useEffect(() => {
    if (view === 'session' && !selectedSessionId && allSessions[0]?.sessionId) setSelectedSessionId(allSessions[0].sessionId);
  }, [view, allSessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId && !allSessions.some((item) => item.sessionId === selectedSessionId)) {
      setSelectedSessionId('');
      setView('directory');
    }
  }, [allSessions, selectedSessionId]);

  const create = async () => {
    try {
      const chosen = GAME_CATALOG.find((item) => item.key === selectedGame);
      if (!chosen || chosen.status === 'development') {
        setError('Эта игра пока недоступна для создания новой сессии.');
        return;
      }
      const title = selectedGame === 'POKER' ? 'Покерный стол' : selectedGame === 'FLAPPY' ? 'Flappy Rush' : gameTitle(selectedGame);
      const res = await createGame({ chatId, gameKey: selectedGame, title, participantUserIds: chatPlayerIds, config: gameConfigDefaults(selectedGame) }).unwrap();
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

  return (
    <div className={[styles.shell, embedded ? styles.shellEmbedded : ''].join(' ')}>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.stageRoot}>
        {view === 'create' ? (
          <CreateSessionView
            selectedGame={selectedGame}
            onSelectGame={setSelectedGame}
            onCreate={create}
            creating={creating}
            onBack={() => setView('directory')}
          />
        ) : view === 'session' && session ? (
          <div className={styles.sessionStageLayout}>
            <SessionOverview session={session} chat={chat} onBack={() => setView('directory')} onDelete={handleDelete} onCancel={handleCancel} deleting={deleting} cancelling={cancelling} compact={embedded} />
            <div className={styles.sessionMain}>
              {session.status === 'CONFIG' ? (
                <LobbyView session={session} chat={chat} meId={meId} setError={setError} compact={embedded} />
              ) : session.gameKey === 'POKER' && session.poker ? (
                <PokerView session={session} chat={chat} meId={meId} setError={setError} compact={embedded} />
              ) : session.gameKey === 'FLAPPY' && session.flappy ? (
                <FlappyView session={session} chat={chat} meId={meId} setError={setError} compact={embedded} />
              ) : (
                <div className={styles.empty}>Эта игра ещё не готова</div>
              )}
            </div>
          </div>
        ) : (
          <SessionDirectory
            sessions={allSessions}
            activeSessionId={activeId}
            mode={directoryMode}
            onModeChange={setDirectoryMode}
            onOpen={openSession}
            onCreateRequest={() => { setError(''); setView('create'); }}
            onClearArchive={handleClearArchive}
            creating={creating}
            clearing={clearing}
          />
        )}
      </div>
    </div>
  );
}
