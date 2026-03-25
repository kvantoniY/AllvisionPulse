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

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
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
