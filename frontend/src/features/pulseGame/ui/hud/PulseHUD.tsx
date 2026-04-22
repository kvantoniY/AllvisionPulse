'use client';

import { Flame, Settings2, Info } from 'lucide-react';
import styles from './PulseHUD.module.css';
import type { GameState } from '../../model/useGameState';

type Props = {
  nick: string;
  game: GameState;
  onOpenLevel: () => void;
  onOpenBreakdown: () => void;
  onOpenCharacter: () => void;
  isDemo: boolean;
};

export function PulseHUD({
  nick,
  game,
  onOpenLevel,
  onOpenBreakdown,
  onOpenCharacter,
  isDemo,
}: Props) {
  const { streak, activity, stateScore } = game;

  return (
    <div className={styles.hud}>
      <button type="button" className={styles.levelBadge} onClick={onOpenLevel} aria-label={`Стрик ${streak.current}`}>
        <span>
          <em>Стрик</em>
          <strong>{streak.current}</strong>
        </span>
        <Flame className={styles.levelSpark} strokeWidth={1.8} />
      </button>

      <div className={styles.identity}>
        <div className={styles.identityHeader}>
          <div className={styles.nick}>{nick}</div>
          <span className={styles.scorePill}>
            <strong>{stateScore}</strong>
            <span>/100</span>
          </span>
        </div>
        <div
          role="button"
          tabIndex={0}
          className={styles.progressBar}
          onClick={onOpenBreakdown}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenBreakdown();
            }
          }}
          aria-label="Открыть расшифровку состояния"
        >
          <span className={styles.progressFill} style={{ ['--p' as never]: `${stateScore}%` }} />
        </div>
        <div className={styles.scenarioTag}>
          Активный · В ритме и в форме · активность {activity}/10
        </div>
      </div>

      <div className={styles.hudActions}>
        <button type="button" className={styles.iconBtn} onClick={onOpenCharacter} aria-label="Персонаж">
          <Settings2 strokeWidth={1.8} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onOpenLevel} aria-label="Как работает стрик">
          <Info strokeWidth={1.8} />
        </button>
      </div>

      {isDemo ? <span className={styles.demoTag}>демо режим</span> : null}
    </div>
  );
}
