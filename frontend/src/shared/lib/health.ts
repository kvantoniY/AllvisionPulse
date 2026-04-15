export type HealthDraft = {
  sleepHours: number | null;
  sleepQuality: number | null;
  alcohol: boolean;
  coffee: boolean;
  wellbeing: number | null;
  stress: number | null;
  activity: boolean;
  productivity: number | null;
  nutrition: number | null;
  smoking: boolean;
  comment: string;
};

export type MentalScoreDraft = {
  sleepHours: number | null;
  nutrition: number | null;
  productivity: number | null;
  stress: number | null;
  wellbeing: number | null;
  alcoholLevel: number | null;
  activityLevel: number | null;
  caffeineLevel: number | null;
  smoking?: boolean | null;
};

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function sleepBandScore(hours?: number | null) {
  if (hours == null) return 55;
  if (hours < 4) return 10;
  if (hours < 5.5) return 28;
  if (hours < 7) return 55;
  if (hours <= 9) return 88;
  if (hours <= 10) return 72;
  if (hours <= 11) return 60;
  return 45;
}

function stressScore(value?: number | null) {
  if (value == null) return 55;
  const map = [0, 95, 88, 76, 64, 48, 40, 30, 22, 14, 8];
  return map[value] ?? 8;
}

function alcoholLevelScore(value?: number | null) {
  if (value == null) return 90;
  return [95, 78, 48, 20][value] ?? 20;
}

function activityLevelScore(value?: number | null) {
  if (value == null) return 50;
  return [44, 72, 84, 94][value] ?? 50;
}

function caffeineLevelScore(value?: number | null) {
  if (value == null) return 78;
  return [82, 78, 58, 42][value] ?? 42;
}

export function computeTodayScore(f: Partial<HealthDraft>): number {
  const w = { sleep: 0.22, wellbeing: 0.18, stress: 0.14, activity: 0.1, productivity: 0.14, nutrition: 0.12, alcohol: 0.05, coffee: 0.03, smoking: 0.02 };
  const sleepHours = typeof f.sleepHours === 'number' ? f.sleepHours : null;
  const sleepQ = typeof f.sleepQuality === 'number' ? f.sleepQuality : null;
  let sleepScore = 60;
  if (sleepHours != null) { const d = Math.abs(sleepHours - 8); sleepScore = clamp(100 - d * 18); }
  if (sleepQ != null) sleepScore = clamp(sleepScore * 0.6 + sleepQ * 10 * 0.4);
  const wellbeingScore = f.wellbeing ? f.wellbeing * 10 : 60;
  const stressScore = f.stress ? clamp(100 - f.stress * 10) : 60;
  const activityScore = f.activity === true ? 85 : 55;
  const productivityScore = f.productivity ? f.productivity * 10 : 60;
  const nutritionScore = f.nutrition ? f.nutrition * 10 : 60;
  const alcoholScore = f.alcohol === true ? 30 : 90;
  const coffeeScore = f.coffee === true ? 70 : 80;
  const smokingScore = f.smoking === true ? 25 : 90;
  const score = sleepScore * w.sleep + wellbeingScore * w.wellbeing + stressScore * w.stress + activityScore * w.activity + productivityScore * w.productivity + nutritionScore * w.nutrition + alcoholScore * w.alcohol + coffeeScore * w.coffee + smokingScore * w.smoking;
  return clamp(Math.round(score));
}

export function computeMentalScore(f: Partial<MentalScoreDraft>): number {
  const score =
    sleepBandScore(f.sleepHours) * 0.24 +
    ((f.nutrition ?? 5) * 10) * 0.14 +
    ((f.productivity ?? 5) * 10) * 0.14 +
    stressScore(f.stress) * 0.16 +
    ((f.wellbeing ?? 5) * 10) * 0.18 +
    alcoholLevelScore(f.alcoholLevel) * 0.05 +
    activityLevelScore(f.activityLevel) * 0.05 +
    caffeineLevelScore(f.caffeineLevel) * 0.02 +
    (f.smoking ? 25 : 88) * 0.02;

  return clamp(Math.round(score));
}

export function computeMentalPulse7(currentScore: number, previousScores: number[]) {
  const usableHistory = previousScores.filter((value) => typeof value === 'number').slice(0, 6);
  const scores = [currentScore, ...usableHistory];
  if (!scores.length) return currentScore;
  return clamp(Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
}

export function computePulse7FromScores(currentScore: number, previousScores: number[]) {
  const scores = [currentScore, ...previousScores].filter((value) => typeof value === 'number');
  if (!scores.length) return currentScore;
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return clamp(Math.round(avg * 0.75 + currentScore * 0.25));
}

export function scoreTone(value: number) {
  if (value >= 80) return 'great';
  if (value >= 65) return 'good';
  if (value >= 45) return 'steady';
  return 'low';
}
