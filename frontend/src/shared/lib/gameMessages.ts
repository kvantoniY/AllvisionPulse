import type { GameKey, GameSystemEvent } from '@/shared/types/game';

export const GAME_SYSTEM_PREFIX = '__GAME_EVENT__';

export function parseGameSystemMessage(text?: string | null): GameSystemEvent | null {
  if (!text?.startsWith(GAME_SYSTEM_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(GAME_SYSTEM_PREFIX.length)) as GameSystemEvent;
  } catch {
    return null;
  }
}

export function gameLabel(gameKey: GameKey) {
  if (gameKey === 'POKER') return 'Покер';
  if (gameKey === 'FLAPPY') return 'Flappy Bird';
  if (gameKey === 'QUIZ') return 'Своя игра';
  return 'Шашки';
}

export function gameStatusLabel(status: string) {
  if (status === 'CONFIG') return 'В игре · настройка';
  if (status === 'ACTIVE') return 'В игре';
  if (status === 'FINISHED') return 'Завершена';
  if (status === 'CANCELLED') return 'Отменена';
  return status;
}
