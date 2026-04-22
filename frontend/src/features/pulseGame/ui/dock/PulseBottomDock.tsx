'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpenText,
  HeartPulse,
  House,
  LayoutGrid,
  Ruler,
  Settings2,
  SquareCheckBig,
  Wallet,
} from 'lucide-react';
import styles from './PulseBottomDock.module.css';
import type { WorkspaceGroup, WorkspaceSection } from '../../lib/types';

type DockKey = 'home' | WorkspaceGroup;

type ExtraSection = Extract<WorkspaceSection, 'weight' | 'programs' | 'analytics' | 'config'>;

type Props = {
  active: DockKey;
  activeSection: WorkspaceSection | null;
  onChange: (key: DockKey) => void;
  onSelectExtra: (section: ExtraSection) => void;
  badges: Partial<Record<DockKey, number>>;
};

const ITEMS: Array<{ key: DockKey; label: string; Icon: typeof House }> = [
  { key: 'home', label: 'Дом', Icon: House },
  { key: 'pulse', label: 'Пульс', Icon: LayoutGrid },
  { key: 'health', label: 'Здоровье', Icon: HeartPulse },
  { key: 'tasks', label: 'Задачи', Icon: SquareCheckBig },
  { key: 'finance', label: 'Финансы', Icon: Wallet },
  { key: 'extra', label: 'Ещё', Icon: BookOpenText },
];

const EXTRA_ITEMS: Array<{ section: ExtraSection; label: string; description: string; Icon: typeof House }> = [
  { section: 'weight', label: 'Вес и форма', description: 'Параметры тела и цель', Icon: Ruler },
  { section: 'programs', label: 'Программы', description: 'Сценарии и совместные сессии', Icon: BookOpenText },
  { section: 'analytics', label: 'Аналитика', description: 'Тренды недели и сводка', Icon: BarChart3 },
  { section: 'config', label: 'Настройки', description: 'Модули и конфигурация', Icon: Settings2 },
];

export function PulseBottomDock({ active, activeSection, onChange, onSelectExtra, badges }: Props) {
  const [extraOpen, setExtraOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const extraActiveSection = useMemo(
    () => EXTRA_ITEMS.find((item) => item.section === activeSection)?.section ?? null,
    [activeSection],
  );

  useEffect(() => {
    if (active !== 'extra') {
      setExtraOpen(false);
    }
  }, [active]);

  useEffect(() => {
    if (!extraOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setExtraOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExtraOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [extraOpen]);

  return (
    <div className={styles.dockWrap} ref={wrapRef}>
      <div className={styles.dockStack}>
        {extraOpen ? (
          <div className={styles.extraMenu} role="menu" aria-label="Оставшиеся вкладки Pulse">
            {EXTRA_ITEMS.map((item) => {
              const { Icon } = item;
              const isActive = active === 'extra' && extraActiveSection === item.section;

              return (
                <button
                  key={item.section}
                  type="button"
                  className={styles.extraItem}
                  data-active={isActive}
                  onClick={() => {
                    setExtraOpen(false);
                    onSelectExtra(item.section);
                  }}
                  role="menuitem"
                >
                  <span className={styles.extraIcon}>
                    <Icon strokeWidth={1.8} />
                  </span>
                  <span className={styles.extraCopy}>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <nav className={styles.dock} aria-label="Модули Pulse">
          {ITEMS.map((item) => {
            const { Icon } = item;
            const badge = badges[item.key] ?? 0;
            const isActive = item.key === 'extra' ? active === 'extra' || extraOpen : active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={styles.item}
                data-active={isActive}
                onClick={() => {
                  if (item.key === 'extra') {
                    setExtraOpen((prev) => !prev);
                    return;
                  }

                  setExtraOpen(false);
                  onChange(item.key);
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={item.key === 'extra' ? extraOpen : undefined}
              >
                <Icon strokeWidth={1.8} />
                <span>{item.label}</span>
                {badge > 0 ? <span className={styles.badge}>{badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export type { DockKey, ExtraSection };
export { ITEMS as DOCK_ITEMS, EXTRA_ITEMS };
