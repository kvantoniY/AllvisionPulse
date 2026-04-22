import type { PillarKey, PillarState, PillarStatus } from './types';

export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  mental: 0.3,
  nutrition: 0.2,
  tasks: 0.2,
  habits: 0.2,
  finance: 0.1,
};

export const PILLAR_LABELS: Record<PillarKey, string> = {
  mental: 'Ментал',
  nutrition: 'Питание',
  tasks: 'Задачи',
  habits: 'Привычки',
  finance: 'Финансы',
};

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function statusFromScore(score: number | null, isBootstrap: boolean): PillarStatus {
  if (score == null) return 'unknown';
  if (isBootstrap && score < 50) return 'steady';
  if (score >= 80) return 'great';
  if (score >= 65) return 'good';
  if (score >= 45) return 'steady';
  if (score >= 25) return 'warning';
  return 'empty';
}

export function combineStateScore(pillars: PillarState[], isBootstrap: boolean): number {
  const known = pillars.filter((pillar) => pillar.score != null);
  const totalWeight = known.reduce((sum, pillar) => sum + pillar.weightShare, 0);
  if (!totalWeight) return isBootstrap ? 55 : 0;

  const weighted = known.reduce((sum, pillar) => sum + (pillar.score ?? 0) * pillar.weightShare, 0);
  const raw = weighted / totalWeight;

  if (isBootstrap) {
    const blended = raw * 0.55 + 55 * 0.45;
    return clampScore(blended);
  }

  return clampScore(raw);
}

export function computeActivityLevel(
  stateScore: number,
  knownPillars: number,
  totalPillars: number,
): number {
  const coverage = totalPillars === 0 ? 0 : knownPillars / totalPillars;
  const base = stateScore / 10;
  const scaled = base * 0.7 + coverage * 3;
  return Math.max(0, Math.min(10, Math.round(scaled)));
}

function shiftIsoDate(value: string, delta: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function computeStreak(
  activeDates: Iterable<string>,
  anchorDate: string,
  maxDays = 30,
): { current: number; max: number; activeToday: boolean } {
  const knownDates = activeDates instanceof Set ? activeDates : new Set(activeDates);
  const activeToday = knownDates.has(anchorDate);

  if (!activeToday) {
    return {
      current: 1,
      max: maxDays,
      activeToday: false,
    };
  }

  let current = 1;
  while (current < maxDays) {
    const previousDate = shiftIsoDate(anchorDate, -current);
    if (!knownDates.has(previousDate)) break;
    current += 1;
  }

  return {
    current,
    max: maxDays,
    activeToday: true,
  };
}

export { clampScore };
