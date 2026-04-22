import type { AvatarGender, AvatarState, BodyShape, SceneScenario } from './types';

export function pickScenario(params: {
  bootstrap: boolean;
  stateScore: number;
  mentalScore: number | null;
  sleepHours: number | null;
  activity: number;
}): SceneScenario {
  if (params.bootstrap) return 'novice';

  const tiredSignal =
    (params.mentalScore != null && params.mentalScore < 48) ||
    (params.sleepHours != null && params.sleepHours < 6) ||
    params.stateScore < 50 ||
    params.activity <= 2;

  if (tiredSignal) return 'tired';
  return 'active';
}

export function computeBodyShape(bmi: number | null, deltaToGoal: number | null): BodyShape {
  if (bmi == null) return 'average';
  if (bmi < 17.5) return 'slim';
  if (bmi < 20) return 'lean';
  if (bmi < 25.5) return 'average';
  if (bmi < 29) return 'soft';
  return 'solid';
}

export function computeAvatarState(params: {
  scenario: SceneScenario;
  stateScore: number;
  mentalScore: number | null;
  bmi: number | null;
  deltaToGoal: number | null;
  gender?: AvatarGender;
}): AvatarState {
  const bodyShape = computeBodyShape(params.bmi, params.deltaToGoal);
  const gender: AvatarGender = params.gender ?? 'male';
  if (params.scenario === 'tired') {
    return { gender, bodyShape, energy: 'tired', posture: 'slouched', mood: 'tired' };
  }
  if (params.scenario === 'novice') {
    return { gender, bodyShape, energy: 'calm', posture: 'straight', mood: 'calm' };
  }
  if (params.stateScore >= 78) {
    return { gender, bodyShape, energy: 'rested', posture: 'straight', mood: 'bright' };
  }
  if ((params.mentalScore ?? 0) >= 68) {
    return { gender, bodyShape, energy: 'focused', posture: 'straight', mood: 'focused' };
  }
  return { gender, bodyShape, energy: 'calm', posture: 'relaxed', mood: 'calm' };
}

export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  if (h <= 0) return null;
  return weightKg / (h * h);
}

export function scenarioMeta(scenario: SceneScenario): {
  label: string;
  tone: string;
  accent: string;
  tagline: string;
} {
  switch (scenario) {
    case 'novice':
      return {
        label: 'Новичок',
        tone: 'warm',
        accent: '#ff821d',
        tagline: 'Осваивается, день за днём',
      };
    case 'tired':
      return {
        label: 'Уставший',
        tone: 'cool',
        accent: '#7f8cff',
        tagline: 'Нужен отдых и спокойный ритм',
      };
    default:
      return {
        label: 'Активный',
        tone: 'bright',
        accent: '#22c784',
        tagline: 'В ритме и в форме',
      };
  }
}
