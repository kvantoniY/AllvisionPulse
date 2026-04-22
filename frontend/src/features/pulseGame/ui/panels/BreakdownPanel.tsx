'use client';

import styles from './PanelFrame.module.css';
import type { GameState } from '../../model/useGameState';

const STATUS_LABEL: Record<string, string> = {
  unknown: 'Ещё нет данных',
  empty: 'Пусто — начни сейчас',
  warning: 'Требует внимания',
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

export function BreakdownPanel({ game }: { game: GameState }) {
  const { pillars, stateScore, bootstrap } = game;

  return (
    <div className={styles.frame}>
      <section style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff7e4', borderRadius: 18, padding: 18, border: '1px solid rgba(184, 144, 80, 0.18)' }}>
        <ScoreRing value={stateScore} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8b6e', fontWeight: 700 }}>Общий пульс</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stateScore}/100</div>
          <div style={{ fontSize: 13, color: '#6b5839' }}>
            {bootstrap
              ? 'Ты в режиме освоения — счёт щадящий, пока добавляешь данные.'
              : 'Средневзвешенная оценка по 5 сферам жизни.'}
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pillars.map((p) => (
          <div key={p.key} className={styles.rowItem}>
            <div className={styles.rowItemMain}>
              <span className={styles.avatarIcon} style={{ background: STATUS_COLOR[p.status] ?? '#f0b36a' }} />
              <div className={styles.rowItemTitle}>
                <strong>{p.label}</strong>
                <span>{STATUS_LABEL[p.status]}{p.hint ? ` · ${p.hint}` : ''}</span>
              </div>
            </div>
            <div className={styles.rowItemMeta}>
              <strong>{p.score == null ? '—' : `${p.score}`}</strong>
              <span>вес {Math.round(p.weightShare * 100)}%</span>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#9a8b6e', margin: 0 }}>
        Неизвестные модули не считаются провалом — они временно исключаются из среднего. Добавь данные, чтобы они вошли в счёт.
      </p>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className={styles.scoreRing} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(184,144,80,0.22)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#breakdown-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id="breakdown-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffc054" />
            <stop offset="100%" stopColor="#ff821d" />
          </linearGradient>
        </defs>
      </svg>
      <strong>{value}</strong>
    </div>
  );
}
