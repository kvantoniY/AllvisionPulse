'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PulseScene.module.css';
import type { GameState } from '../../model/useGameState';
import type { PanelKey, SceneScenario } from '../../lib/types';
import { useAvatarCustomization } from '../../model/useAvatarCustomization';
import { useRoomCustomization } from '../../model/useRoomCustomization';
import { PulseAvatar } from '../avatar/PulseAvatar';
import { Icon } from '@/shared/ui/Icon/Icon';

type Props = {
  game: GameState;
  nick: string;
  scenario: SceneScenario;
  onOpen: (panel: PanelKey) => void;
  isMobile?: boolean;
  selectedDate?: string;
  onChangeDate?: (date: string) => void;
};

const WEEKDAY_SHORT = [
  '\u0412\u0421',
  '\u041f\u041d',
  '\u0412\u0422',
  '\u0421\u0420',
  '\u0427\u0422',
  '\u041f\u0422',
  '\u0421\u0411',
];

const MONTH_SHORT = [
  '\u044f\u043d\u0432',
  '\u0444\u0435\u0432',
  '\u043c\u0430\u0440',
  '\u0430\u043f\u0440',
  '\u043c\u0430\u0439',
  '\u0438\u044e\u043d',
  '\u0438\u044e\u043b',
  '\u0430\u0432\u0433',
  '\u0441\u0435\u043d',
  '\u043e\u043a\u0442',
  '\u043d\u043e\u044f',
  '\u0434\u0435\u043a',
];

const KG_LABEL = '\u043a\u0433';
const KCAL_LABEL = '\u043a\u043a\u0430\u043b';
const RUBLE_LABEL = '\u20bd';
const SHORT_THOUSAND_LABEL = '\u043a';

const COPY = {
  changeDate: '\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u0434\u0430\u0442\u0443',
  nutrition: '\u041f\u0438\u0442\u0430\u043d\u0438\u0435',
  finance: '\u0424\u0438\u043d\u0430\u043d\u0441\u044b',
  tasks: '\u0417\u0430\u0434\u0430\u0447\u0438',
  habits: '\u041f\u0440\u0438\u0432\u044b\u0447\u043a\u0438',
  weight: '\u0412\u0435\u0441 \u0438 \u0444\u043e\u0440\u043c\u0430',
  mental: '\u041d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u0438\u0435',
  mentalFull: '\u041d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u0438\u0435 \u0438 \u0441\u0430\u043c\u043e\u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0435',
  character: '\u041f\u0435\u0440\u0441\u043e\u043d\u0430\u0436',
  editCharacter: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0430\u0441\u0442\u043e\u043c\u0438\u0437\u0430\u0446\u0438\u044e \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0430',
  today: '\u0421\u0435\u0433\u043e\u0434\u043d\u044f',
  noStart: '\u043d\u0435\u0442 \u0441\u0442\u0430\u0440\u0442\u0430',
  addFirstTask: '\u0414\u043e\u0431\u0430\u0432\u044c \u043f\u0435\u0440\u0432\u0443\u044e \u0437\u0430\u0434\u0430\u0447\u0443',
  addFirstHabit: '\u0414\u043e\u0431\u0430\u0432\u044c \u043f\u0435\u0440\u0432\u0443\u044e \u043f\u0440\u0438\u0432\u044b\u0447\u043a\u0443',
};

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function truncateBoardLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function PulseScene({
  game,
  nick,
  scenario,
  onOpen,
  isMobile = false,
  selectedDate,
  onChangeDate,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { appearance } = useAvatarCustomization();
  const { roomTheme } = useRoomCustomization();
  const { weight, hints, overview, tasks, habits, finance, nutrition, profile, today } = game;

  const scaleValue =
    weight.current != null ? `${weight.current.toFixed(1)} ${KG_LABEL}` : `\u2014 ${KG_LABEL}`;

  const weightDeltaInfo = useMemo(() => {
    if (weight.current == null || weight.start == null) return null;

    const delta = Number((weight.current - weight.start).toFixed(1));
    if (delta === 0) return { label: `0 ${KG_LABEL}`, tone: 'neutral' as const };

    const sign = delta > 0 ? '+' : '-';
    const label = `${sign}${Math.abs(delta)} ${KG_LABEL}`;
    const target = weight.target ?? profile?.targetWeightKg ?? null;
    if (target == null) return { label, tone: 'neutral' as const };

    const wantsGain = target > weight.start;
    const wantsLoss = target < weight.start;
    let tone: 'good' | 'bad' | 'neutral' = 'neutral';

    if (wantsGain) tone = delta > 0 ? 'good' : 'bad';
    else if (wantsLoss) tone = delta < 0 ? 'good' : 'bad';

    return { label, tone };
  }, [weight.current, weight.start, weight.target, profile?.targetWeightKg]);

  const tasksBadge =
    (overview?.today?.tasksTotal ?? 0) > 0
      ? Math.max(0, (overview?.today?.tasksTotal ?? 0) - (overview?.today?.tasksDone ?? 0))
      : 0;

  const deltaLabel = weightDeltaInfo?.label ?? COPY.noStart;
  const deltaTone = weightDeltaInfo?.tone ?? 'neutral';

  const boardTasks = useMemo(
    () =>
      [...(tasks.items ?? [])]
        .filter((task) => task.taskType !== 'HABIT')
        .sort((left, right) => {
          const doneDiff = Number(left.completedForDate) - Number(right.completedForDate);
          if (doneDiff !== 0) return doneDiff;
          if ((right.priority ?? 0) !== (left.priority ?? 0)) {
            return (right.priority ?? 0) - (left.priority ?? 0);
          }
          return left.title.localeCompare(right.title, 'ru');
        })
        .slice(0, 3),
    [tasks.items],
  );

  const boardHabits = useMemo(
    () =>
      [...habits]
        .sort((left, right) => {
          const doneDiff =
            Number(Boolean(left.completionByDate[today])) -
            Number(Boolean(right.completionByDate[today]));
          if (doneDiff !== 0) return doneDiff;
          if (right.streak !== left.streak) return right.streak - left.streak;
          return left.task.title.localeCompare(right.task.title, 'ru');
        })
        .slice(0, 3),
    [habits, today],
  );

  const todaysExpenses = finance.todaysExpenses ?? 0;
  const expensesLabel = useMemo(() => {
    if (todaysExpenses <= 0) return `0 ${RUBLE_LABEL}`;
    if (todaysExpenses >= 1_000_000) return `${(todaysExpenses / 1_000_000).toFixed(1)}M ${RUBLE_LABEL}`;
    if (todaysExpenses >= 10_000) return `${Math.round(todaysExpenses / 1_000)}${SHORT_THOUSAND_LABEL} ${RUBLE_LABEL}`;
    return `${Math.round(todaysExpenses).toLocaleString('ru-RU')} ${RUBLE_LABEL}`;
  }, [todaysExpenses]);

  const calorieGoal = nutrition.goal?.dailyCalories ?? null;
  const caloriesToday = Math.round(nutrition.totalCalories ?? 0);
  const caloriePercent =
    calorieGoal && calorieGoal > 0
      ? Math.min(100, Math.round((caloriesToday / calorieGoal) * 100))
      : 0;
  const calorieBoardDisplay = caloriesToday.toLocaleString('ru-RU');

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const clockDate = selectedDate ? parseLocalDate(selectedDate) : parseLocalDate(today);
  const clockDay = String(clockDate.getDate()).padStart(2, '0');
  const clockMonth = MONTH_SHORT[clockDate.getMonth()] ?? '';
  const clockWeekday = WEEKDAY_SHORT[clockDate.getDay()] ?? '';
  const clockTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;

    const withPicker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === 'function') {
      withPicker.showPicker();
      return;
    }

    input.click();
  };

  const avatarDock = (
    <div className={`${styles.sceneAvatarDock} ${isMobile ? styles.sceneAvatarDockMobile : ''}`}>
      <div className={`${styles.sceneAvatarCard} ${isMobile ? styles.sceneAvatarCardMobile : ''}`}>
        <div className={styles.sceneAvatarHeader}>
          <span className={styles.sceneAvatarLevel}>
            <Icon name="flame" size={12} />
            <span>{game.streak.current}</span>
          </span>
          <strong className={styles.sceneAvatarName}>{nick}</strong>
          <span className={styles.sceneAvatarScore}>{`${game.stateScore}/100`}</span>
        </div>

        <div className={styles.sceneAvatarFigureWrap}>
          <div className={styles.sceneAvatarFigureStage} aria-hidden="true">
            <div className={styles.sceneAvatarFigureGlow} />
            <PulseAvatar appearance={appearance} className={styles.sceneAvatarFigure} />
          </div>

          <button
            type="button"
            className={styles.sceneAvatarEdit}
            onClick={() => onOpen('character')}
            aria-label={COPY.editCharacter}
          >
            <SceneEditIcon />
          </button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div
        className={styles.scene}
        data-scenario={scenario}
        data-room-theme={roomTheme}
        data-mobile="true"
      >
        <div className={styles.mobileBackdrop} aria-hidden="true" />
        <div className={styles.mobileAvatarStage}>{avatarDock}</div>
      </div>
    );
  }

  return (
    <div className={styles.scene} data-scenario={scenario} data-room-theme={roomTheme}>
      <div className={styles.wall} />
      <div className={styles.wallDots} />

      <div className={styles.floor}>
        <div className={styles.floorBricks} />
      </div>
      <div className={styles.baseboard} />
      <div className={styles.rug} aria-hidden="true" />

      <div className={styles.sideDecor} aria-hidden="true">
        <div className={styles.sideLamp} />
        <div className={styles.sideTable} />
        <div className={styles.sidePlant} />
      </div>

      <button
        type="button"
        className={styles.clock}
        onClick={openDatePicker}
        aria-label={COPY.changeDate}
      >
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate ?? today}
          onChange={(event) => onChangeDate?.(event.target.value)}
          className={styles.clockHiddenInput}
          tabIndex={-1}
        />
        <div className={styles.clockBody}>
          <div className={styles.clockTime}>{clockTime}</div>
          <div className={styles.clockDate}>
            <span>{clockWeekday}</span>
            <strong>{clockDay}</strong>
            <span>{clockMonth}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        className={styles.hotspot}
        style={{ right: '4%', top: '8.5%', width: '16%', height: '58%' }}
        onMouseEnter={() => setHovered('nutrition')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('nutrition')}
        onBlur={() => setHovered(null)}
        onClick={() => onOpen('nutrition')}
        data-attention={hints.nutrition != null ? 'true' : 'false'}
        aria-label={COPY.nutrition}
      >
        <div className={styles.fridge}>
          <div className={styles.fridgeBody} />
          <div className={styles.fridgeDivider} />
          <div className={styles.fridgeHandle} />
          <div className={styles.fridgeCalorie} aria-hidden="true">
            <svg viewBox="0 0 48 48" className={styles.fridgeCalorieRing}>
              <circle cx="24" cy="24" r="19" className={styles.fridgeCalorieTrack} />
              <circle
                cx="24"
                cy="24"
                r="19"
                className={styles.fridgeCalorieFill}
                style={{ strokeDashoffset: `${119.38 * (1 - caloriePercent / 100)}` }}
              />
            </svg>
            <div className={styles.fridgeCalorieValue}>
              <strong>{calorieBoardDisplay}</strong>
              <span>{KCAL_LABEL}</span>
            </div>
          </div>
        </div>
        {hovered === 'nutrition' || hints.nutrition ? (
          <span className={styles.hotspotHint}>{hints.nutrition ?? COPY.nutrition}</span>
        ) : null}
      </button>

      {avatarDock}

      <button
        type="button"
        className={styles.hotspot}
        style={{ right: '23%', bottom: '34.5%', width: '12%', aspectRatio: '1.08 / 1' }}
        onMouseEnter={() => setHovered('finance')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('finance')}
        onBlur={() => setHovered(null)}
        onClick={() => onOpen('finance')}
        data-attention={hints.finance != null ? 'true' : 'false'}
        aria-label={COPY.finance}
      >
        <div className={styles.safe}>
          <div className={styles.safeBody} />
          <div className={styles.safeDial} />
          <div className={styles.safeLight} />
          <div className={styles.safeExpenses} aria-hidden="true">
            <span>{COPY.today}</span>
            <strong>{expensesLabel}</strong>
          </div>
        </div>
        {hovered === 'finance' || hints.finance ? (
          <span className={styles.hotspotHint}>{hints.finance ?? COPY.finance}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={styles.hotspot}
        style={{ left: '5%', top: '8.5%', width: '20%', aspectRatio: '1.1 / 1' }}
        onMouseEnter={() => setHovered('tasks')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('tasks')}
        onBlur={() => setHovered(null)}
        onClick={() => onOpen('tasks')}
        data-attention={hints.tasks != null ? 'true' : 'false'}
        aria-label={COPY.tasks}
      >
        <div className={styles.wallFrame} style={{ position: 'absolute', inset: 0 }}>
          <span className={styles.frameLabel}>{COPY.tasks}</span>
          <div className={styles.taskBoardPaper}>
            <div className={styles.taskBoardHead} />
            {boardTasks.length ? (
              boardTasks.map((task) => (
                <div key={task.id} className={styles.taskBoardLine}>
                  <span
                    className={styles.taskBoardCheck}
                    data-checked={task.completedForDate ? 'true' : 'false'}
                  />
                  <span className={styles.taskBoardText}>
                    {truncateBoardLabel(task.title, 25)}
                  </span>
                </div>
              ))
            ) : (
              <div className={styles.taskBoardLine}>
                <span className={styles.taskBoardEmpty}>{COPY.addFirstTask}</span>
              </div>
            )}
          </div>
          {tasksBadge > 0 ? <span className={styles.taskBoardBadge}>{tasksBadge}</span> : null}
        </div>
        {hovered === 'tasks' || hints.tasks ? (
          <span className={styles.hotspotHint}>{hints.tasks ?? COPY.tasks}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={styles.hotspot}
        style={{ left: '28%', top: '8.5%', width: '18%', aspectRatio: '1.1 / 1' }}
        onMouseEnter={() => setHovered('habits')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('habits')}
        onBlur={() => setHovered(null)}
        onClick={() => onOpen('habits')}
        data-attention={hints.habits != null ? 'true' : 'false'}
        aria-label={COPY.habits}
      >
        <div className={styles.wallFrame} style={{ position: 'absolute', inset: 0 }}>
          <span className={styles.frameLabel}>{COPY.habits}</span>
          <div className={styles.habitBoardList}>
            {boardHabits.length ? (
              boardHabits.map((habit) => (
                <div key={habit.task.id} className={styles.habitBoardLine}>
                  <span
                    className={styles.habitBoardCheck}
                    data-checked={habit.completionByDate[today] ? 'true' : 'false'}
                  />
                  <span className={styles.habitBoardText}>
                    {truncateBoardLabel(habit.task.title, 23)}
                  </span>
                </div>
              ))
            ) : (
              <div className={styles.habitBoardEmpty}>{COPY.addFirstHabit}</div>
            )}
          </div>
        </div>
        {hovered === 'habits' || hints.habits ? (
          <span className={styles.hotspotHint}>{hints.habits ?? COPY.habits}</span>
        ) : null}
      </button>

      <button
        type="button"
        className={styles.hotspot}
        style={{
          left: '50%',
          bottom: isMobile ? '2.8%' : '2.2%',
          width: '18%',
          aspectRatio: '3.4 / 1',
          transform: 'translateX(-50%)',
        }}
        onMouseEnter={() => setHovered('weight')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('weight')}
        onBlur={() => setHovered(null)}
        onClick={() => onOpen('weight')}
        data-attention={hints.weight != null ? 'true' : 'false'}
        aria-label={COPY.weight}
      >
        <div className={styles.scaleBody}>
          <div className={styles.scaleDisplay}>{scaleValue}</div>
          <span className={styles.scaleDeltaTag} data-tone={deltaTone}>
            {deltaLabel}
          </span>
        </div>
        {hovered === 'weight' || hints.weight ? (
          <span className={styles.hotspotHint}>{hints.weight ?? COPY.weight}</span>
        ) : null}
      </button>
    </div>
  );
}

function SceneEditIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
