'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import type { PanelKey } from '../../lib/types';
import type { GameState } from '../../model/useGameState';
import { LevelPanel } from './LevelPanel';
import { CharacterPanel } from './CharacterPanel';
import { WeightPanel } from './WeightPanel';
import { NutritionPanel } from './NutritionPanel';
import { FinancePanel } from './FinancePanel';
import { TasksPanel } from './TasksPanel';
import { MentalPanel } from './MentalPanel';
import { HabitsPanel } from './HabitsPanel';

type Props = {
  open: PanelKey | null;
  onClose: () => void;
  game: GameState;
  nick: string;
  onToast: (message: string) => void;
};

const TITLES: Record<PanelKey, string> = {
  level: 'Стрик',
  character: 'Персонаж',
  weight: 'Вес и форма',
  nutrition: 'Питание',
  finance: 'Финансы',
  tasks: 'Задачи',
  habits: 'Привычки',
  mental: 'Самочувствие',
};

const SUBTITLES: Record<PanelKey, string> = {
  level: 'Как работает серия активных дней в Pulse',
  character: 'Твоё отражение в Pulse',
  weight: 'Динамика веса и цель',
  nutrition: 'Калории, макросы и сегодняшние приёмы пищи',
  finance: 'Доход, траты и маленькая цель накопить',
  tasks: 'Маленькие дела, из которых складывается день',
  habits: 'Маленькие действия каждый день',
  mental: 'Сон, настроение и стресс — коротко',
};

export function PulsePanelManager({ open, onClose, game, nick, onToast }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const match = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(match.matches);
    update();
    match.addEventListener('change', update);
    return () => match.removeEventListener('change', update);
  }, []);

  if (!open) return null;

  const title = TITLES[open];
  const subtitle = SUBTITLES[open];

  const body = (() => {
    switch (open) {
      case 'level':
        return <LevelPanel game={game} />;
      case 'character':
        return <CharacterPanel game={game} nick={nick} onOpenMental={() => onToast('Открой модуль Самочувствие из сцены')} />;
      case 'weight':
        return <WeightPanel game={game} onToast={onToast} onClose={onClose} />;
      case 'nutrition':
        return <NutritionPanel game={game} onToast={onToast} />;
      case 'finance':
        return <FinancePanel game={game} onToast={onToast} />;
      case 'tasks':
        return <TasksPanel game={game} onToast={onToast} />;
      case 'habits':
        return <HabitsPanel game={game} onToast={onToast} isMobile={isMobile} />;
      case 'mental':
        return <MentalPanel game={game} onToast={onToast} onClose={onClose} />;
      default:
        return null;
    }
  })();

  if (isMobile) {
    return (
      <MobileSheet open onClose={onClose} title={title} appearance="pulse">
        <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 15, lineHeight: 1.45, color: 'oklch(0.57 0.03 55)' }}>{subtitle}</div>
          {body}
        </div>
      </MobileSheet>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size={open === 'habits' ? 'xl' : 'md'}
      appearance="pulse"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{body}</div>
    </Modal>
  );
}
