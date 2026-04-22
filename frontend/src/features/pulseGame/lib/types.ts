export type PillarKey = 'mental' | 'nutrition' | 'tasks' | 'habits' | 'finance';

export type PillarStatus = 'unknown' | 'empty' | 'warning' | 'steady' | 'good' | 'great';

export type PillarState = {
  key: PillarKey;
  label: string;
  score: number | null;
  status: PillarStatus;
  hint: string | null;
  weightShare: number;
};

export type EnergyMood = 'rested' | 'calm' | 'focused' | 'tired' | 'stretched';

export type Posture = 'straight' | 'relaxed' | 'slouched';

export type BodyShape = 'slim' | 'lean' | 'average' | 'soft' | 'solid';

export type SceneScenario = 'novice' | 'active' | 'tired';

export type AvatarGender = 'male' | 'female';

export type RoomTheme = 'default' | 'blue';

export type AvatarState = {
  gender: AvatarGender;
  bodyShape: BodyShape;
  energy: EnergyMood;
  posture: Posture;
  mood: 'calm' | 'bright' | 'focused' | 'tired';
};

export type WeightSummary = {
  current: number | null;
  target: number | null;
  start: number | null;
  deltaToGoal: number | null;
  weekDelta: number | null;
};

export type StreakSummary = {
  current: number;
  max: number;
  activeToday: boolean;
  anchorDate: string;
};

export type PanelKey =
  | 'weight'
  | 'nutrition'
  | 'finance'
  | 'tasks'
  | 'habits'
  | 'mental'
  | 'character'
  | 'level';

export type WorkspaceGroup =
  | 'pulse'
  | 'health'
  | 'tasks'
  | 'finance'
  | 'extra';

export type WorkspaceSection =
  | 'overview'
  | 'level'
  | 'character'
  | 'mental'
  | 'weight'
  | 'nutrition'
  | 'tasks'
  | 'habits'
  | 'finance'
  | 'programs'
  | 'analytics'
  | 'config';
