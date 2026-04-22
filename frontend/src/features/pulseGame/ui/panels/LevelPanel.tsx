'use client';

import { Flame } from 'lucide-react';

import styles from './PanelFrame.module.css';
import type { GameState } from '../../model/useGameState';

export function LevelPanel({ game }: { game: GameState }) {
  const { streak } = game;
  const progress = Math.max(0, Math.min(100, Math.round((streak.current / streak.max) * 100)));

  const surfaceStyle = {
    gap: 16,
    borderColor: 'rgba(206, 130, 46, 0.26)',
    background: 'linear-gradient(180deg, #ffc86e 0%, #ffaf63 100%)',
  } as const;

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid rgba(148, 88, 28, 0.22)',
    background: 'rgba(255, 240, 214, 0.52)',
    color: '#6a3c16',
    fontSize: 13,
    fontWeight: 700,
  } as const;

  return (
    <div className={styles.frame}>
      <section className={styles.sectionCard} style={surfaceStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className={styles.heroLabel} style={{ color: 'rgba(106, 60, 22, 0.78)' }}>
              Стрик
            </span>
            <div
              className={styles.heroValue}
              style={{
                color: '#4a2810',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Flame width={28} height={28} strokeWidth={2} />
              <span>{streak.current}</span>
            </div>
            <div style={{ fontSize: 15, color: 'rgba(92, 54, 27, 0.84)' }}>
              {streak.activeToday
                ? 'Сегодня уже есть активность в Pulse'
                : 'Сегодня активность еще не засчитана'}
            </div>
          </div>

          <div style={pillStyle}>
            <Flame width={16} height={16} strokeWidth={1.9} />
            <span>{`${streak.current} из ${streak.max}`}</span>
          </div>
        </div>

        <div
          className={styles.progressBar}
          style={{
            height: 10,
            background: 'rgba(171, 108, 39, 0.18)',
            borderColor: 'rgba(171, 108, 39, 0.12)',
          }}
        >
          <span
            className={styles.progressFill}
            style={{ width: `${progress}%`, background: '#db7a2e' }}
          />
        </div>
      </section>

      <section className={styles.sectionCard}>
        <span className={styles.statLabel}>Что дает стрик?</span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            color: 'var(--pulse-ink-soft)',
            fontSize: 15,
          }}
        >
          <div>
            Цифра стрика равна проценту скидки на Про Подписку Пульс. Сейчас твой стрик{' '}
            {streak.current}, значит скидка составляет {streak.current}%.
          </div>
        </div>
      </section>

      <section className={styles.sectionCard}>
        <span className={styles.statLabel}>Как работает стрик</span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            color: 'var(--pulse-ink-soft)',
            fontSize: 15,
          }}
        >
          <div>День становится активным, если в Pulse было хотя бы одно действие.</div>
          <div>Каждый следующий активный день подряд увеличивает серию на 1.</div>
          <div>Если день пропущен, стрик сбрасывается и снова начинается с 1.</div>
          <div>Серия ограничена 30 днями и дальше может использоваться для бонусов.</div>
        </div>
      </section>
    </div>
  );
}
