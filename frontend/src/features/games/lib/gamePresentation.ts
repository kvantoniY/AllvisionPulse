import type { GameKey } from '@/shared/types/game';

export type GameOrientation = 'portrait' | 'landscape' | 'flex';
export type GameFit = 'contain' | 'cover';

export type GamePresentationSpec = {
  orientation: GameOrientation;
  preferredAspect: number;
  minPlayableWidth?: number;
  minPlayableHeight?: number;
  maxStageWidth?: number;
  maxStageHeight?: number;
  fit: GameFit;
  allowFullscreen: boolean;
};

const DEFAULT_SPEC: GamePresentationSpec = {
  orientation: 'flex',
  preferredAspect: 1.3,
  minPlayableWidth: 280,
  minPlayableHeight: 280,
  maxStageWidth: 1180,
  maxStageHeight: 900,
  fit: 'contain',
  allowFullscreen: true,
};

const GAME_PRESENTATION: Record<GameKey, GamePresentationSpec> = {
  POKER: {
    orientation: 'landscape',
    preferredAspect: 820 / 470,
    minPlayableWidth: 720,
    minPlayableHeight: 420,
    maxStageWidth: 1640,
    maxStageHeight: 1100,
    fit: 'contain',
    allowFullscreen: true,
  },
  FLAPPY: {
    orientation: 'portrait',
    preferredAspect: 420 / 720,
    minPlayableWidth: 320,
    minPlayableHeight: 560,
    maxStageWidth: 620,
    maxStageHeight: 1280,
    fit: 'contain',
    allowFullscreen: true,
  },
  QUIZ: {
    orientation: 'flex',
    preferredAspect: 1.25,
    minPlayableWidth: 360,
    minPlayableHeight: 360,
    maxStageWidth: 1240,
    maxStageHeight: 920,
    fit: 'contain',
    allowFullscreen: true,
  },
  CHECKERS: {
    orientation: 'flex',
    preferredAspect: 1,
    minPlayableWidth: 360,
    minPlayableHeight: 360,
    maxStageWidth: 1040,
    maxStageHeight: 960,
    fit: 'contain',
    allowFullscreen: true,
  },
};

export function getGamePresentationSpec(gameKey?: GameKey | null): GamePresentationSpec {
  if (!gameKey) return DEFAULT_SPEC;
  return GAME_PRESENTATION[gameKey] ?? DEFAULT_SPEC;
}
