'use client';

import { useState } from 'react';
import styles from './PanelFrame.module.css';
import type { GameState } from '../../model/useGameState';
import type { WorkspaceSection } from '../../lib/types';
import { useUpdateProfileMutation } from '@/shared/api/pulseApi';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  onClose: () => void;
  onNavigate?: (section: WorkspaceSection) => void;
};

export function WeightPanel({ game, onToast, onClose, onNavigate }: Props) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [form, setForm] = useState({
    heightCm: game.profile?.heightCm?.toString() ?? '',
    currentWeightKg: game.profile?.currentWeightKg?.toString() ?? '',
    targetWeightKg: game.profile?.targetWeightKg?.toString() ?? '',
    startWeightKg: game.profile?.startWeightKg?.toString() ?? '',
  });

  const handleSave = async () => {
    const body: Record<string, number | null> = {};
    const parseNum = (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const num = Number(trimmed.replace(',', '.'));
      return Number.isFinite(num) ? num : null;
    };
    body.heightCm = parseNum(form.heightCm);
    body.currentWeightKg = parseNum(form.currentWeightKg);
    body.targetWeightKg = parseNum(form.targetWeightKg);
    body.startWeightKg = parseNum(form.startWeightKg);

    try {
      await updateProfile(body).unwrap();
      onToast('Профиль обновлён');
      onClose();
    } catch (error) {
      onToast('Не удалось сохранить');
    }
  };

  const delta = game.weight.deltaToGoal;
  const weekDelta = game.weight.weekDelta;
  const bmi = game.bmi;

  return (
    <div className={styles.frame}>
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Сейчас</span>
          <span className={styles.statValue}>{game.weight.current != null ? `${game.weight.current.toFixed(1)} кг` : '—'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Цель</span>
          <span className={styles.statValue}>{game.weight.target != null ? `${game.weight.target.toFixed(1)} кг` : '—'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>До цели</span>
          <span className={`${styles.statValue} ${delta != null && delta <= 0 ? styles.statValueSuccess : styles.statValueAccent}`}>
            {delta != null ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)} кг` : '—'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>7 дней</span>
          <span className={styles.statValue}>
            {weekDelta != null ? `${weekDelta > 0 ? '+' : weekDelta < 0 ? '−' : ''}${Math.abs(weekDelta).toFixed(1)} кг` : '—'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ИМТ</span>
          <span className={styles.statValue}>{bmi != null ? bmi.toFixed(1) : '—'}</span>
        </div>
      </div>

      <div className={styles.form}>
        <label className={styles.field}>
          <span>Текущий вес, кг</span>
          <input
            inputMode="decimal"
            value={form.currentWeightKg}
            onChange={(event) => setForm((prev) => ({ ...prev, currentWeightKg: event.target.value }))}
            placeholder="78.4"
          />
        </label>
        <label className={styles.field}>
          <span>Целевой вес, кг</span>
          <input
            inputMode="decimal"
            value={form.targetWeightKg}
            onChange={(event) => setForm((prev) => ({ ...prev, targetWeightKg: event.target.value }))}
            placeholder="76.8"
          />
        </label>
        <label className={styles.field}>
          <span>Стартовый вес, кг</span>
          <input
            inputMode="decimal"
            value={form.startWeightKg}
            onChange={(event) => setForm((prev) => ({ ...prev, startWeightKg: event.target.value }))}
            placeholder="80.0"
          />
        </label>
        <label className={styles.field}>
          <span>Рост, см</span>
          <input
            inputMode="decimal"
            value={form.heightCm}
            onChange={(event) => setForm((prev) => ({ ...prev, heightCm: event.target.value }))}
            placeholder="172"
          />
        </label>
      </div>

      <div className={styles.actionRow}>
        <button type="button" className={styles.primary} onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Сохраняю…' : 'Сохранить'}
        </button>
        {onNavigate ? (
          <button type="button" className={styles.secondary} onClick={() => onNavigate('mental')}>
            К самочувствию
          </button>
        ) : null}
      </div>
    </div>
  );
}
