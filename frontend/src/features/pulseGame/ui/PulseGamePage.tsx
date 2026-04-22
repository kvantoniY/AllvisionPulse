'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpenText,
  HeartPulse,
  LayoutGrid,
  Ruler,
  Settings2,
  SquareCheckBig,
  Wallet,
} from 'lucide-react';
import styles from './PulseGamePage.module.css';
import { useGameState } from '../model/useGameState';
import { useRoomCustomization } from '../model/useRoomCustomization';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { PulseScene } from './scene/PulseScene';
import { PulseBottomDock, type DockKey, type ExtraSection } from './dock/PulseBottomDock';
import { PulseWorkspace } from './workspace/PulseWorkspace';
import type { PanelKey, WorkspaceGroup, WorkspaceSection } from '../lib/types';
import {
  WEEKDAY_LABELS,
  fmtDate,
  getWeekDates,
  parseDate,
  scrollHorizontalChildIntoView,
} from './workspace/pulseWorkspaceUtils';

const MOBILE_TABS: Array<{ key: DockKey; label: string; Icon: typeof LayoutGrid }> = [
  { key: 'home', label: 'Пульс', Icon: LayoutGrid },
  { key: 'health', label: 'Здоровье', Icon: HeartPulse },
  { key: 'tasks', label: 'Задачи', Icon: SquareCheckBig },
  { key: 'finance', label: 'Финансы', Icon: Wallet },
  { key: 'extra', label: 'Ещё', Icon: BookOpenText },
];

const MOBILE_EXTRA_ITEMS: Array<{
  section: ExtraSection;
  label: string;
  description: string;
  Icon: typeof BookOpenText;
}> = [
  { section: 'weight', label: 'Вес и форма', description: 'Параметры тела и цель', Icon: Ruler },
  { section: 'programs', label: 'Программы', description: 'Сценарии и совместные сессии', Icon: BookOpenText },
  { section: 'analytics', label: 'Аналитика', description: 'Тренды недели и сводка', Icon: BarChart3 },
  { section: 'config', label: 'Настройки', description: 'Модули и конфигурация', Icon: Settings2 },
];

function getHeaderTabFromDock(key: DockKey) {
  if (key === 'home') return 'pulse';
  if (key === 'extra') return 'programs';
  return key;
}

export function PulseGamePage() {
  const [selectedDate, setSelectedDate] = useState(() => fmtDate(new Date()));
  const game = useGameState(selectedDate);
  const { roomTheme } = useRoomCustomization();
  const { data: meData } = useGetMeQuery();
  const nick = meData?.user?.username ?? 'Гость';

  const [dock, setDock] = useState<DockKey>('home');
  const [workspace, setWorkspace] = useState<{ group: WorkspaceGroup; section: WorkspaceSection } | null>(null);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false
  ));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const match = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(match.matches);
    update();
    match.addEventListener('change', update);
    return () => match.removeEventListener('change', update);
  }, []);

  const activeScenario = game.scenario;
  const isWorkspaceOpen = workspace != null;
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const mobileActiveTab: DockKey = workspace?.group === 'pulse' || dock === 'pulse' ? 'home' : dock;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(
      new CustomEvent('av:pulse-tab-change', {
        detail: { tab: getHeaderTabFromDock(mobileActiveTab) },
      }),
    );
  }, [mobileActiveTab]);

  const openWorkspace = useCallback((group: WorkspaceGroup, section: WorkspaceSection) => {
    setDock(group);
    setWorkspace({ group, section });
  }, []);

  const openSection = useCallback((section: WorkspaceSection) => {
    const groupBySection: Record<WorkspaceSection, WorkspaceGroup> = {
      overview: 'pulse',
      level: 'pulse',
      character: 'pulse',
      mental: 'health',
      weight: 'extra',
      nutrition: 'health',
      tasks: 'tasks',
      habits: 'tasks',
      finance: 'finance',
      programs: 'extra',
      analytics: 'extra',
      config: 'extra',
    };

    openWorkspace(groupBySection[section], section);
  }, [openWorkspace]);

  const badges = useMemo<Partial<Record<DockKey, number>>>(() => {
    const tasksLeft = Math.max(0, (game.overview?.today?.tasksTotal ?? 0) - (game.overview?.today?.tasksDone ?? 0));
    return {
      pulse: game.hints.weight || game.hints.mental ? 1 : 0,
      health: game.hints.mental || game.hints.nutrition ? 1 : 0,
      tasks: tasksLeft,
      finance: game.finance.overLimitCategories.length,
      extra: game.hints.weight ? 1 : 0,
    };
  }, [game.overview, game.finance.overLimitCategories, game.hints]);

  const handleDock = (key: DockKey) => {
    setDock(key);
    if (key === 'home') {
      setWorkspace(null);
      return;
    }

    const defaults: Record<WorkspaceGroup, WorkspaceSection> = {
      pulse: 'overview',
      health: 'mental',
      tasks: 'tasks',
      finance: 'finance',
      extra: 'programs',
    };

    const targetGroup = key as WorkspaceGroup;
    const nextSection =
      workspace?.group === targetGroup ? workspace.section : defaults[targetGroup];
    setWorkspace({ group: targetGroup, section: nextSection });
  };

  const handleScene = (key: PanelKey) => {
    if (key === 'nutrition') {
      openWorkspace('health', 'nutrition');
      return;
    }

    if (key === 'finance') {
      openWorkspace('finance', 'finance');
      return;
    }

    if (key === 'tasks') {
      openWorkspace('tasks', 'tasks');
      return;
    }

    if (key === 'habits') {
      openWorkspace('tasks', 'habits');
      return;
    }

    if (key === 'mental') {
      openWorkspace('health', 'mental');
      return;
    }

    if (key === 'weight') {
      openWorkspace('extra', 'weight');
      return;
    }

    if (key === 'level') {
      openWorkspace('pulse', 'level');
      return;
    }

    if (key === 'character') {
      openWorkspace('pulse', 'character');
    }
  };

  const handleCloseWorkspace = () => {
    setWorkspace(null);
    setDock('home');
  };

  const handleSelectExtra = (section: ExtraSection) => {
    openWorkspace('extra', section);
  };

  return (
    <div
      className={styles.game}
      data-scenario={activeScenario}
      data-room-theme={roomTheme}
      data-workspace={isWorkspaceOpen ? 'open' : 'closed'}
      data-mobile={isMobile ? 'true' : 'false'}
    >
      <div className={styles.layout} data-workspace={isWorkspaceOpen ? 'open' : 'closed'}>
        <div
          className={styles.sceneWrap}
          data-workspace={isWorkspaceOpen ? 'open' : 'closed'}
          data-mobile={isMobile ? 'true' : 'false'}
        >
          {isMobile ? (
            <div className={styles.mobileStage}>
              <PulseMobileTopbar
                selectedDate={selectedDate}
                weekDates={weekDates}
                active={mobileActiveTab}
                activeSection={workspace?.section ?? null}
                onChangeDate={setSelectedDate}
                onChangeTab={handleDock}
                onSelectExtra={handleSelectExtra}
              />

              <div className={styles.mobileSceneBody}>
                {workspace ? (
                  <PulseWorkspace
                    group={workspace.group}
                    section={workspace.section}
                    onChangeSection={openSection}
                    selectedDate={selectedDate}
                    onChangeDate={setSelectedDate}
                    onClose={handleCloseWorkspace}
                    game={game}
                    nick={nick}
                    onToast={showToast}
                    isMobile={isMobile}
                  />
                ) : (
                  <PulseScene
                    game={game}
                    nick={nick}
                    scenario={activeScenario}
                    onOpen={handleScene}
                    isMobile
                  />
                )}
              </div>
            </div>
          ) : workspace ? (
            <PulseWorkspace
              group={workspace.group}
              section={workspace.section}
              onChangeSection={openSection}
              selectedDate={selectedDate}
              onChangeDate={setSelectedDate}
              onClose={handleCloseWorkspace}
              game={game}
              nick={nick}
              onToast={showToast}
              isMobile={isMobile}
            />
          ) : (
            <PulseScene
              game={game}
              nick={nick}
              scenario={activeScenario}
              onOpen={handleScene}
              selectedDate={selectedDate}
              onChangeDate={setSelectedDate}
            />
          )}
        </div>
      </div>

      {!isMobile ? (
        <PulseBottomDock
          active={dock}
          activeSection={workspace?.section ?? null}
          onChange={handleDock}
          onSelectExtra={handleSelectExtra}
          badges={badges}
        />
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}

function PulseMobileTopbar({
  selectedDate,
  weekDates,
  active,
  activeSection,
  onChangeDate,
  onChangeTab,
  onSelectExtra,
}: {
  selectedDate: string;
  weekDates: string[];
  active: DockKey;
  activeSection: WorkspaceSection | null;
  onChangeDate: (date: string) => void;
  onChangeTab: (key: DockKey) => void;
  onSelectExtra: (section: ExtraSection) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dateRailRef = useRef<HTMLDivElement | null>(null);
  const tabRailRef = useRef<HTMLElement | null>(null);
  const activeDateRef = useRef<HTMLButtonElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const extraWrapRef = useRef<HTMLDivElement | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);

  useEffect(() => {
    scrollHorizontalChildIntoView(dateRailRef.current, activeDateRef.current, {
      behavior: 'auto',
      mode: 'center',
    });
  }, [selectedDate, weekDates]);

  useEffect(() => {
    scrollHorizontalChildIntoView(tabRailRef.current, activeTabRef.current, {
      behavior: 'auto',
      mode: 'center',
    });
  }, [active]);

  useEffect(() => {
    if (active !== 'extra') setExtraOpen(false);
  }, [active]);

  useEffect(() => {
    if (!extraOpen) return undefined;
    const handlePointer = (event: MouseEvent) => {
      if (!extraWrapRef.current?.contains(event.target as Node)) {
        setExtraOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExtraOpen(false);
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [extraOpen]);

  const extraActive = active === 'extra';
  const currentExtra = extraActive
    ? MOBILE_EXTRA_ITEMS.find((item) => item.section === activeSection)?.section ?? null
    : null;

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

  const handleTabClick = (key: DockKey) => {
    if (key === 'extra') {
      setExtraOpen((prev) => !prev);
      return;
    }
    setExtraOpen(false);
    onChangeTab(key);
  };

  return (
    <div className={styles.mobileTopbar} ref={extraWrapRef}>
      <div className={styles.mobileDateRail}>
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={(event) => onChangeDate(event.target.value)}
          className={styles.mobileHiddenDateInput}
        />

        <div ref={dateRailRef} className={styles.mobileDateScroller}>
          <div className={styles.mobileDateRow}>
            {weekDates.map((date, index) => {
              const isActive = selectedDate === date;

              return (
                <button
                  key={date}
                  type="button"
                  ref={isActive ? activeDateRef : undefined}
                  className={styles.mobileDateCell}
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

      <nav ref={tabRailRef} className={styles.mobileTabRail} aria-label="Навигация Pulse">
        <div className={styles.mobileTabTrack}>
          {MOBILE_TABS.map((item) => {
            const { Icon } = item;
            const isActive = item.key === 'extra' ? extraActive || extraOpen : active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                ref={isActive ? activeTabRef : undefined}
                className={styles.mobileTabButton}
                data-active={isActive}
                onClick={() => handleTabClick(item.key)}
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={item.key === 'extra' ? extraOpen : undefined}
              >
                <Icon className={styles.mobileTabIcon} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {extraOpen ? (
        <div className={styles.mobileExtraMenu} role="menu" aria-label="Оставшиеся вкладки Pulse">
          {MOBILE_EXTRA_ITEMS.map((item) => {
            const { Icon } = item;
            const isActive = currentExtra === item.section;

            return (
              <button
                key={item.section}
                type="button"
                className={styles.mobileExtraItem}
                data-active={isActive}
                role="menuitem"
                onClick={() => {
                  setExtraOpen(false);
                  onSelectExtra(item.section);
                }}
              >
                <span className={styles.mobileExtraIcon}>
                  <Icon strokeWidth={1.8} />
                </span>
                <span className={styles.mobileExtraCopy}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
