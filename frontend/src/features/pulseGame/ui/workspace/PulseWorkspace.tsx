'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import styles from './PulseWorkspace.module.css';
import type { GameState } from '../../model/useGameState';
import type { PillarKey, WorkspaceGroup, WorkspaceSection } from '../../lib/types';
import { LevelPanel } from '../panels/LevelPanel';
import { CharacterPanel } from '../panels/CharacterPanel';
import { WeightPanel } from '../panels/WeightPanel';
import { NutritionPanel } from '../panels/NutritionPanel';
import { FinancePanel } from '../panels/FinancePanel';
import { TasksPanel } from '../panels/TasksPanel';
import { MentalPanel } from '../panels/MentalPanel';
import { HabitsPanel } from '../panels/HabitsPanel';
import { ProgramTodayWidget } from '@/features/programs/ui/ProgramTodayWidget';
import { ProgramsPulseTab } from '@/features/programs/ui/ProgramsPulseTab';
import { AnalyticsTab } from '@/features/pulse/ui/AnalyticsTab';
import { ConfigTab } from '@/features/pulse/ui/ConfigTab';
import { useGetConfigQuery, useUpdateConfigMutation } from '@/shared/api/pulseApi';
import {
  WEEKDAY_LABELS,
  getWeekDates,
  parseDate,
  scrollHorizontalChildIntoView,
} from './pulseWorkspaceUtils';

type Props = {
  group: WorkspaceGroup;
  section: WorkspaceSection;
  onChangeSection: (section: WorkspaceSection) => void;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  onClose: () => void;
  game: GameState;
  nick: string;
  onToast: (message: string) => void;
  isMobile: boolean;
};

const GROUP_SECTIONS: Record<WorkspaceGroup, WorkspaceSection[]> = {
  pulse: ['overview', 'level', 'character'],
  health: ['mental', 'nutrition'],
  tasks: ['tasks', 'habits'],
  finance: ['finance'],
  extra: ['weight', 'programs', 'analytics', 'config'],
};

const GROUP_META: Record<WorkspaceGroup, { label: string; subtitle: string }> = {
  pulse: {
    label: 'Пульс',
    subtitle: 'Главный центр состояния, прогресса и внутренних модулей Pulse.',
  },
  health: {
    label: 'Здоровье',
    subtitle: 'Самочувствие, питание и ключевые показатели в одном контуре без лишних переходов.',
  },
  tasks: {
    label: 'Ритм дня',
    subtitle: 'Задачи и привычки живут как один рабочий контур, а не как разрозненные окна.',
  },
  finance: {
    label: 'Финансы',
    subtitle: 'Доходы, траты, накопления и платежи в рамках той же игровой сцены.',
  },
  extra: {
    label: 'Ещё',
    subtitle: 'Вес, программы, аналитика и настройки в отдельных вкладках внутри того же окна.',
  },
};

const SECTION_META: Record<WorkspaceSection, { label: string; subtitle: string }> = {
  overview: {
    label: 'Обзор',
    subtitle: 'Общий пульс, сферы дня, программа и инсайты в одном окне.',
  },
  level: {
    label: 'Стрик',
    subtitle: 'Серия активных дней, которая растет вместе с твоим ритмом в Pulse.',
  },
  character: {
    label: 'Персонаж',
    subtitle: 'Твоё текущее отражение внутри комнаты Pulse.',
  },
  mental: {
    label: 'Самочувствие',
    subtitle: 'Сон, стресс, энергия и дневной чек-ин.',
  },
  weight: {
    label: 'Вес и форма',
    subtitle: 'Вес, цель, ИМТ и опорные параметры профиля.',
  },
  nutrition: {
    label: 'Питание',
    subtitle: 'Приёмы пищи, поиск продуктов, БЖУ и цели по калориям.',
  },
  tasks: {
    label: 'Задачи',
    subtitle: 'Дневные дела, приоритеты и контроль выполнения.',
  },
  habits: {
    label: 'Привычки',
    subtitle: 'Повторяемые действия и сетка отметок по неделе.',
  },
  finance: {
    label: 'Финансы',
    subtitle: 'Траты, доходы, накопления, долги и ключевые срезы.',
  },
  programs: {
    label: 'Программы',
    subtitle: 'Текущие программы, приглашения и действия на сегодня.',
  },
  analytics: {
    label: 'Аналитика',
    subtitle: 'Тренды недели по состоянию, питанию, задачам и весу.',
  },
  config: {
    label: 'Настройки',
    subtitle: 'Включение модулей и базовая конфигурация Pulse.',
  },
};

const STATUS_LABEL: Record<string, string> = {
  unknown: 'Пока нет данных',
  empty: 'Пора включиться',
  warning: 'Нужно внимание',
  steady: 'Ровный ритм',
  good: 'Хорошо',
  great: 'Отлично',
};

const STATUS_COLOR: Record<string, string> = {
  unknown: '#c9b38a',
  empty: '#c9b38a',
  warning: '#d66a3e',
  steady: '#e3ad3c',
  good: '#6fa24a',
  great: '#2ea06a',
};

const PILLAR_SECTION_MAP: Record<PillarKey, WorkspaceSection> = {
  mental: 'mental',
  nutrition: 'nutrition',
  tasks: 'tasks',
  habits: 'habits',
  finance: 'finance',
};

const EMPTY_PILLAR_HINT: Record<PillarKey, string> = {
  mental: 'Добавь чек-ин, чтобы увидеть состояние ментала.',
  nutrition: 'Добавь приём пищи или дневную цель по калориям.',
  tasks: 'Закрой хотя бы одну задачу, чтобы сфера вошла в пульс.',
  habits: 'Отметь привычку, чтобы серия вошла в общий пульс.',
  finance: 'Добавь трату или доход, чтобы увидеть финансовый ритм.',
};

const INTEGER_FORMAT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

const DECIMAL_FORMAT = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatWhole(value: number): string {
  return INTEGER_FORMAT.format(Math.round(value));
}

function formatOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? INTEGER_FORMAT.format(rounded) : DECIMAL_FORMAT.format(rounded);
}

function getPillarMetric(game: GameState, pillarKey: PillarKey): string {
  switch (pillarKey) {
    case 'mental': {
      const sleepHours = game.mentalDay?.sleepHours;
      if (sleepHours != null) return `Сон ${formatOneDecimal(sleepHours)} ч`;
      return game.mentalDay ? 'Чек-ин заполнен' : 'Нет чек-ина';
    }
    case 'nutrition': {
      const totalCalories = game.nutrition.totalCalories ?? 0;
      const caloriesGoal =
        game.nutrition.goal?.dailyCalories ?? game.profile?.dailyCaloriesGoal ?? null;

      if (caloriesGoal != null && caloriesGoal > 0) {
        return `${formatWhole(totalCalories)}/${formatWhole(caloriesGoal)} ккал`;
      }

      return `${formatWhole(totalCalories)} ккал`;
    }
    case 'tasks': {
      const completed = game.tasks.summary.completed ?? 0;
      const total = game.tasks.summary.total ?? 0;
      return `${formatWhole(completed)}/${formatWhole(total)}`;
    }
    case 'habits': {
      const total = game.habits.length;
      const completed = game.habits.filter((habit) => habit.completionByDate[game.today]).length;
      return `${formatWhole(completed)}/${formatWhole(total)}`;
    }
    case 'finance': {
      const todaysExpenses = Math.max(0, game.finance.todaysExpenses ?? 0);
      const todaysIncome = Math.max(0, game.finance.todaysIncome ?? 0);

      if (todaysExpenses > 0) return `${formatWhole(todaysExpenses)} ₽`;
      if (todaysIncome > 0) return `${formatWhole(todaysIncome)} ₽`;
      return '0 ₽';
    }
    default:
      return '—';
  }
}

export function PulseWorkspace({
  group,
  section,
  onChangeSection,
  selectedDate,
  onChangeDate,
  onClose,
  game,
  nick,
  onToast,
  isMobile,
}: Props) {
  const { data: configData } = useGetConfigQuery();
  const [updateConfig, { isLoading: configSaving }] = useUpdateConfigMutation();
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const sectionTabsRef = useRef<HTMLDivElement | null>(null);
  const activeSectionRef = useRef<HTMLButtonElement | null>(null);

  const groupSections = GROUP_SECTIONS[group];
  const safeSection = groupSections.includes(section) ? section : groupSections[0];
  const groupMeta = GROUP_META[group];
  const sectionMeta = SECTION_META[safeSection];
  const config = configData?.config;
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const financeActiveModules = [
    config?.healthEnabled ? 'Здоровье' : null,
    config?.mentalEnabled ? 'Ментальное' : null,
    config?.nutritionEnabled ? 'Питание' : null,
    config?.tasksEnabled ? 'Задачи' : null,
    config?.financeEnabled ? 'Финансы' : null,
    'Аналитика',
  ].filter(Boolean) as string[];

  const handleConfigToggle = (key: 'healthEnabled' | 'mentalEnabled' | 'nutritionEnabled' | 'tasksEnabled') => {
    if (!config) return;
    updateConfig({ [key]: !Boolean(config[key]) });
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }
    input.click();
  };

  useEffect(() => {
    if (!isMobile) return;

    scrollHorizontalChildIntoView(sectionTabsRef.current, activeSectionRef.current, {
      behavior: 'auto',
      mode: 'center',
    });
  }, [group, isMobile, safeSection]);

  const content = (() => {
    switch (safeSection) {
      case 'overview':
        return <PulseOverviewSection game={game} onChangeSection={onChangeSection} />;
      case 'level':
        return <LevelPanel game={game} />;
      case 'character':
        return <CharacterPanel game={game} nick={nick} onOpenMental={() => onChangeSection('mental')} />;
      case 'mental':
        return <MentalPanel game={game} onToast={onToast} onClose={() => undefined} onNavigate={onChangeSection} />;
      case 'weight':
        return <WeightPanel game={game} onToast={onToast} onClose={() => undefined} onNavigate={onChangeSection} />;
      case 'nutrition':
        return <NutritionPanel game={game} onToast={onToast} onNavigate={onChangeSection} />;
      case 'tasks':
        return <TasksPanel game={game} onToast={onToast} onNavigate={onChangeSection} />;
      case 'habits':
        return <HabitsPanel game={game} onToast={onToast} isMobile={isMobile} />;
      case 'finance':
        return <FinancePanel game={game} onToast={onToast} onNavigate={onChangeSection} />;
      case 'programs':
        return (
          <div className={styles.legacySurface} data-panel="programs">
            <ProgramsPulseTab />
          </div>
        );
      case 'analytics':
        return (
          <div className={styles.legacySurface} data-panel="analytics">
            <AnalyticsTab analyticsData={game.analytics} pulseDay={game.overview?.today} />
          </div>
        );
      case 'config':
        return (
          <div className={styles.legacySurface} data-panel="config">
            <ConfigTab
              config={config}
              configSaving={configSaving}
              financeActiveModules={financeActiveModules}
              handleConfigToggle={handleConfigToggle}
            />
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <div className={styles.workspace}>
      <div className={styles.shell}>
        {!isMobile ? (
          <div className={styles.header}>
            <div className={styles.headerCopy}>
              <span className={styles.eyebrow}>{groupMeta.label}</span>
              <h2 className={styles.title}>{sectionMeta.label}</h2>
              <div className={styles.subtitle}>{sectionMeta.subtitle || groupMeta.subtitle}</div>
            </div>

            <div className={styles.headerTools}>
              <div className={styles.dateRail}>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={(event) => onChangeDate(event.target.value)}
                  className={styles.hiddenDateInput}
                />

                <div className={styles.dateScroller}>
                  <div className={styles.dateRow}>
                    {weekDates.map((date, index) => {
                      const isActive = selectedDate === date;

                      return (
                        <button
                          key={date}
                          type="button"
                          className={styles.dateCell}
                          data-active={isActive}
                          onClick={() => {
                            if (isActive) {
                              openDatePicker();
                              return;
                            }
                            onChangeDate(date);
                          }}
                        >
                          <span>{WEEKDAY_LABELS[index]}</span>
                          <strong>{(parseDate(date) ?? new Date()).getDate()}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Вернуться в комнату">
                <X width={18} height={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : null}

        {groupSections.length > 1 ? (
          <div ref={sectionTabsRef} className={styles.sectionTabs} aria-label={`${groupMeta.label}: подпункты`}>
            {groupSections.map((item) => (
              <button
                key={item}
                type="button"
                ref={safeSection === item ? activeSectionRef : undefined}
                className={styles.sectionTab}
                data-active={safeSection === item}
                onClick={() => onChangeSection(item)}
              >
                {SECTION_META[item].label}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.body}>
          <div className={styles.scroll}>{content}</div>
        </div>
      </div>
    </div>
  );
}

function PulseOverviewSection({
  game,
  onChangeSection,
}: {
  game: GameState;
  onChangeSection: (section: WorkspaceSection) => void;
}) {
  const knownPillars = game.pillars.filter((pillar) => pillar.score != null).length;

  return (
    <div className={styles.overview}>
      <div className={styles.overviewTop}>
        <section className={`${styles.overviewCard} ${styles.overviewPulseCard}`}>
          <span className={styles.eyebrow}>Общий пульс</span>
          <div className={styles.overviewPulseBody}>
            <OverviewScoreRing value={game.stateScore} />

            <div className={styles.overviewPulseSummary}>
              <div className={styles.overviewPulseMeta}>
                <div className={styles.overviewPulseMetaItem}>
                  <span>Активность</span>
                  <strong>{game.activity}/10</strong>
                </div>
                <div className={styles.overviewPulseMetaItem}>
                  <span>Стрик</span>
                  <strong>{game.streak.current}/{game.streak.max}</strong>
                </div>
                <div className={styles.overviewPulseMetaItem}>
                  <span>Сферы</span>
                  <strong>{knownPillars}/{game.pillars.length}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.overviewPulseFooter}>
            <span className={styles.eyebrow}>Сферы состояния</span>
            <div className={styles.overviewStatusGrid}>
              {game.pillars.map((pillar) => (
                <button
                  key={pillar.key}
                  type="button"
                  className={styles.overviewStatusCard}
                  onClick={() => onChangeSection(PILLAR_SECTION_MAP[pillar.key])}
                >
                  <div className={styles.overviewStatusHead}>
                    <div className={styles.overviewStatusRowMain}>
                      <span
                        className={styles.overviewStatusDot}
                        style={{ backgroundColor: STATUS_COLOR[pillar.status] ?? '#c9b38a' }}
                      />
                      <div className={styles.overviewStatusRowCopy}>
                        <strong>{pillar.label}</strong>
                        <span>
                          {STATUS_LABEL[pillar.status] ?? 'Без статуса'}
                          {pillar.hint ? ` · ${pillar.hint}` : ` · ${EMPTY_PILLAR_HINT[pillar.key]}`}
                        </span>
                      </div>
                    </div>
                    <span className={styles.overviewStatusMetric}>
                      {getPillarMetric(game, pillar.key)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.overviewCard}>
          <span className={styles.eyebrow}>Инсайты</span>
          {game.hints.tasks ? (
            <ActionCard
              title="Задачи"
              description={game.hints.tasks}
              onClick={() => onChangeSection('tasks')}
            />
          ) : null}
          {game.hints.nutrition ? (
            <ActionCard
              title="Питание"
              description={game.hints.nutrition}
              onClick={() => onChangeSection('nutrition')}
            />
          ) : null}
          {game.hints.finance ? (
            <ActionCard
              title="Финансы"
              description={game.hints.finance}
              onClick={() => onChangeSection('finance')}
            />
          ) : null}
          {game.hints.mental ? (
            <ActionCard
              title="Ментал"
              description={game.hints.mental}
              onClick={() => onChangeSection('mental')}
            />
          ) : null}
          {!game.hints.tasks && !game.hints.nutrition && !game.hints.finance && !game.hints.mental ? (
            <div className={styles.actionButton}>
              <div>
                <strong>Ритм держится</strong>
                <span>Сегодня нет явных критичных сигналов. Можно спокойно идти по плану.</span>
              </div>
              <Sparkles width={18} height={18} strokeWidth={1.9} />
            </div>
          ) : null}
        </section>
      </div>

      <div className={styles.overviewProgramRow}>
        <section className={styles.overviewCard}>
          <span className={styles.eyebrow}>Программа на сегодня</span>
          <ProgramTodayWidget compact variant="pulse" onOpenPrograms={() => onChangeSection('programs')} />
        </section>
      </div>
    </div>
  );
}

function OverviewScoreRing({ value }: { value: number }) {
  const size = 120;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className={styles.overviewScoreRing} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(184, 144, 80, 0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#overview-score-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id="overview-score-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffc054" />
            <stop offset="100%" stopColor="#ff821d" />
          </linearGradient>
        </defs>
      </svg>
      <strong>{value}</strong>
    </div>
  );
}

function ActionCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.actionButton} onClick={onClick}>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <ArrowRight width={18} height={18} strokeWidth={1.9} />
    </button>
  );
}

