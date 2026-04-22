'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Bolt,
  Brain,
  Coffee,
  Dumbbell,
  HeartPulse,
  MoonStar,
  Salad,
  Sparkles,
  TriangleAlert,
  Wine,
} from 'lucide-react';
import frameStyles from './PanelFrame.module.css';
import styles from './MentalPanel.module.css';
import type { GameState } from '../../model/useGameState';
import type { WorkspaceSection } from '../../lib/types';
import { useSaveMentalDayMutation } from '@/shared/api/pulseApi';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  onClose: () => void;
  onNavigate?: (section: WorkspaceSection) => void;
};

function describeScore(score: number) {
  if (score >= 80) return 'Ритм собран и устойчив';
  if (score >= 60) return 'Состояние ровное';
  if (score >= 40) return 'Нужна мягкая разгрузка';
  return 'День просит восстановления';
}

function trendLabel(score: number) {
  if (score >= 80) return 'Неделя держится сильно';
  if (score >= 60) return 'Неделя в рабочем темпе';
  if (score >= 40) return 'Есть колебания';
  return 'Стоит выровнять базу';
}

function asNumber(value: string, fallback = 0) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function MentalPanel({ game, onToast, onNavigate }: Props) {
  const [saveDay, { isLoading }] = useSaveMentalDayMutation();
  const initial = game.mentalDay;

  const [sleepHours, setSleepHours] = useState<string>(initial?.sleepHours?.toString() ?? '7.5');
  const [sleepQuality, setSleepQuality] = useState<string>(String(initial?.sleepQuality ?? 7));
  const [wellbeing, setWellbeing] = useState<string>(String(initial?.wellbeing ?? 7));
  const [stress, setStress] = useState<string>(String(initial?.stress ?? 3));
  const [nutrition, setNutrition] = useState<string>(String(initial?.nutrition ?? Math.round(game.mental.autoNutrition ?? 7)));
  const [productivity, setProductivity] = useState<string>(
    String(initial?.productivity ?? Math.round(game.mental.autoProductivity ?? 7)),
  );
  const [activityLevel, setActivityLevel] = useState<string>(String(initial?.activityLevel ?? 1));
  const [alcoholLevel, setAlcoholLevel] = useState<string>(String(initial?.alcoholLevel ?? 0));
  const [caffeineLevel, setCaffeineLevel] = useState<string>(String(initial?.caffeineLevel ?? 1));
  const [comment, setComment] = useState<string>(initial?.comment ?? '');

  const todayScore = Math.max(0, Math.round(initial?.todayScore ?? game.mental.score ?? 0));
  const weekScore = Math.max(0, Math.round(initial?.pulse7Score ?? game.overview?.today?.mental7Score ?? todayScore));

  const insights = useMemo(() => {
    const sleep = asNumber(sleepHours, 0);
    const stressValue = asNumber(stress, 0);
    const productivityValue = asNumber(productivity, 0);
    const nutritionValue = asNumber(nutrition, 0);

    return [
      sleep < 7 ? 'Сон ниже комфортной зоны: попробуй вернуть 7–8 часов.' : 'Сон держится в рабочей зоне.',
      stressValue >= 7
        ? 'Стресс высокий, лучше не перегружать день новыми задачами.'
        : 'Стресс под контролем, можно держать ровный темп.',
      productivityValue >= 7
        ? 'Продуктивность сильная, день ощущается собранным.'
        : 'Продуктивность пока ниже желаемой, стоит упростить план.',
      nutritionValue >= 7
        ? 'Питание поддерживает состояние, это уже работает на общий Pulse.'
        : 'Питание просит внимания: можно быстро улучшить день одним ровным приёмом пищи.',
    ];
  }, [nutrition, productivity, sleepHours, stress]);

  const handleSave = async () => {
    const parseFloatOrNull = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseIntOrNull = (value: string) => {
      const parsed = parseFloatOrNull(value);
      return parsed == null ? null : Math.round(parsed);
    };

    try {
      await saveDay({
        date: game.today,
        sleepHours: parseFloatOrNull(sleepHours),
        sleepQuality: parseIntOrNull(sleepQuality),
        wellbeing: parseIntOrNull(wellbeing),
        stress: parseIntOrNull(stress),
        nutrition: parseIntOrNull(nutrition),
        productivity: parseIntOrNull(productivity),
        activityLevel: parseIntOrNull(activityLevel),
        alcoholLevel: parseIntOrNull(alcoholLevel),
        caffeineLevel: parseIntOrNull(caffeineLevel),
        comment: comment.trim() || null,
      }).unwrap();
      onToast('Самочувствие сохранено');
    } catch {
      onToast('Не удалось сохранить чек-ин');
    }
  };

  return (
    <div className={frameStyles.frame}>
      <div className={styles.topGrid}>
        <section className={styles.surface}>
          <div className={styles.sectionHead}>
            <span className={frameStyles.heroLabel}>Состояние</span>
          </div>

          <div className={styles.ringsRow}>
            <RingMetric
              value={todayScore}
              label="Сегодня"
              caption={describeScore(todayScore)}
              tone="accent"
            />
            <RingMetric
              value={weekScore}
              label="За 7 дней"
              caption={trendLabel(weekScore)}
              tone="success"
            />
          </div>
        </section>

        <aside className={styles.surface}>
          <div className={styles.sectionHead}>
            <span className={frameStyles.heroLabel}>Инсайты</span>
          </div>

          <div className={styles.insightList}>
            {insights.map((item) => (
              <div key={item} className={styles.insightItem}>
                <Sparkles width={16} height={16} strokeWidth={1.9} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className={styles.surface}>
        <div className={styles.sectionHead}>
          <span className={frameStyles.heroLabel}>Параметры дня</span>
          <div className={frameStyles.actionRow}>
            <button
              type="button"
              className={frameStyles.secondary}
              onClick={() => {
                setNutrition(String(Math.round(game.mental.autoNutrition ?? 7)));
                setProductivity(String(Math.round(game.mental.autoProductivity ?? 7)));
              }}
            >
              Применить автооценки
            </button>
            {onNavigate ? (
              <button type="button" className={frameStyles.secondary} onClick={() => onNavigate('nutrition')}>
                К питанию
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.sliderGrid}>
          <RangeField
            icon={<MoonStar width={16} height={16} strokeWidth={1.9} />}
            label="Сон"
            value={sleepHours}
            min={0}
            max={12}
            step={0.5}
            suffix=" ч"
            helper="7–9 ч — комфортная зона"
            tone="info"
            onChange={setSleepHours}
          />
          <RangeField
            icon={<Brain width={16} height={16} strokeWidth={1.9} />}
            label="Качество сна"
            value={sleepQuality}
            min={1}
            max={10}
            helper="Личное ощущение после сна"
            tone="info"
            onChange={setSleepQuality}
          />
          <RangeField
            icon={<HeartPulse width={16} height={16} strokeWidth={1.9} />}
            label="Самочувствие"
            value={wellbeing}
            min={1}
            max={10}
            tone="purple"
            onChange={setWellbeing}
          />
          <RangeField
            icon={<TriangleAlert width={16} height={16} strokeWidth={1.9} />}
            label="Стресс"
            value={stress}
            min={1}
            max={10}
            helper="1–2 — норма, 7+ — уже тяжело"
            tone="danger"
            onChange={setStress}
          />
          <RangeField
            icon={<Salad width={16} height={16} strokeWidth={1.9} />}
            label="Питание"
            value={nutrition}
            min={1}
            max={10}
            helper="Вклад рациона в общее состояние"
            tone="success"
            onChange={setNutrition}
          />
          <RangeField
            icon={<Bolt width={16} height={16} strokeWidth={1.9} />}
            label="Продуктивность"
            value={productivity}
            min={1}
            max={10}
            helper="Как ощущалась отдача от дня"
            tone="accent"
            onChange={setProductivity}
          />
          <RangeField
            icon={<Dumbbell width={16} height={16} strokeWidth={1.9} />}
            label="Физ. активность"
            value={activityLevel}
            min={0}
            max={3}
            tone="accent"
            onChange={setActivityLevel}
          />
          <RangeField
            icon={<Wine width={16} height={16} strokeWidth={1.9} />}
            label="Алкоголь"
            value={alcoholLevel}
            min={0}
            max={3}
            tone="danger"
            onChange={setAlcoholLevel}
          />
          <RangeField
            icon={<Coffee width={16} height={16} strokeWidth={1.9} />}
            label="Кофеин"
            value={caffeineLevel}
            min={0}
            max={3}
            tone="warning"
            onChange={setCaffeineLevel}
          />
        </div>
      </section>

      <section className={styles.surface}>
        <div className={styles.sectionHead}>
          <span className={frameStyles.heroLabel}>Комментарий дня</span>
        </div>

        <label className={frameStyles.field}>
          <span>Что важно запомнить</span>
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Что поддержало сегодня, а что выбило из ритма"
          />
        </label>

        <div className={frameStyles.actionRow}>
          <button type="button" className={frameStyles.primary} onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Сохраняю…' : 'Сохранить чек-ин'}
          </button>
        </div>
      </section>
    </div>
  );
}

function RingMetric({
  value,
  label,
  caption,
  tone,
}: {
  value: number;
  label: string;
  caption: string;
  tone: 'accent' | 'success';
}) {
  return (
    <div className={styles.ringMetric}>
      <ScoreRing value={value} tone={tone} />
      <div className={styles.ringMeta}>
        <strong>{label}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

function ScoreRing({ value, tone }: { value: number; tone: 'accent' | 'success' }) {
  const size = 108;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const offset = circumference * (1 - safeValue / 100);
  const color = tone === 'success' ? 'oklch(0.72 0.11 145)' : 'oklch(0.7 0.15 48)';

  return (
    <div className={styles.ring}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(183, 145, 97, 0.16)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong>{safeValue}</strong>
    </div>
  );
}

function RangeField({
  icon,
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  helper,
  tone,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  helper?: string;
  tone: 'accent' | 'success' | 'info' | 'danger' | 'purple' | 'warning';
  onChange: (value: string) => void;
}) {
  const numericValue = asNumber(value, min);
  const percent = ((numericValue - min) / Math.max(max - min, 1)) * 100;

  return (
    <div className={styles.sliderCard}>
      <div className={styles.sliderHead}>
        <div className={styles.sliderTitle}>
          <span className={styles.sliderIcon} data-tone={tone}>
            {icon}
          </span>
          <span>{label}</span>
        </div>
        <strong className={styles.sliderValue}>
          {numericValue}
          {suffix}
        </strong>
      </div>

      <div className={styles.rangeWrap} style={{ ['--range-progress' as never]: `${percent}%` }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={styles.rangeInput}
        />
      </div>

      {helper ? <div className={styles.rangeHelper}>{helper}</div> : null}
    </div>
  );
}
