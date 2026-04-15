export function normalizePulseArtifactToken(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function matchesToken(value?: string | null, tokens: string[] = []) {
  const normalized = normalizePulseArtifactToken(value);
  return Boolean(normalized) && tokens.includes(normalized);
}

const SHORT_DESCRIPTION_BY_TOKEN: Record<string, string> = {
  SHARED_BILL: 'Общий счёт с распределением платежей между участниками.',
  FINANCE_SPLIT: 'Общий счёт с распределением платежей между участниками.',
  SHARED_DEBT: 'Общий долг с прогрессом погашения.',
  DEBT_SHARE: 'Общий долг с прогрессом погашения.',
  SHARED_SAVINGS: 'Общее накопление с прогрессом участников.',
  SAVINGS_SHARE: 'Общее накопление с прогрессом участников.',
};

export function replacePulseArtifactTechnicalText(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return SHORT_DESCRIPTION_BY_TOKEN[normalizePulseArtifactToken(raw)] ?? raw;
}

export function getPulseArtifactKindLabel({
  value,
  actionType,
  sourceType,
}: {
  value?: string | null;
  actionType?: string | null;
  sourceType?: string | null;
}) {
  if (matchesToken(actionType, ['TASK_REQUEST', 'TASK_SUGGESTION', 'SOCIAL_EVENT', 'REMINDER_CARD'])) return 'Событие';
  if (
    matchesToken(actionType, ['FINANCE_SPLIT', 'SHARED_BILL']) ||
    matchesToken(sourceType, ['SHARED_BILL']) ||
    matchesToken(value, ['SHARED_BILL'])
  ) {
    return 'Общий счёт';
  }
  if (
    matchesToken(actionType, ['DEBT_SHARE', 'SHARED_DEBT']) ||
    matchesToken(sourceType, ['DEBT', 'SHARED_DEBT']) ||
    matchesToken(value, ['SHARED_DEBT'])
  ) {
    return 'Долг';
  }
  if (
    matchesToken(actionType, ['SAVINGS_SHARE', 'SHARED_SAVINGS']) ||
    matchesToken(sourceType, ['SAVINGS_GOAL', 'SHARED_SAVINGS']) ||
    matchesToken(value, ['SHARED_SAVINGS'])
  ) {
    return 'Накопление';
  }
  if (matchesToken(sourceType, ['MENTAL_DAY'])) return 'Пульс дня';
  if (matchesToken(sourceType, ['TASK_DAY'])) return 'Задачи дня';
  if (matchesToken(sourceType, ['NUTRITION_DAY'])) return 'Питание';
  if (matchesToken(sourceType, ['FINANCE_OVERVIEW'])) return 'Финансы дня';
  if (matchesToken(sourceType, ['PROGRAM']) || matchesToken(value, ['PROGRAM'])) return 'Программа';
  if (matchesToken(value, ['PROGRAM_PROGRESS'])) return 'Прогресс';
  if (matchesToken(value, ['SESSION_INVITE'])) return 'Приглашение';
  if (matchesToken(value, ['ACHIEVEMENT'])) return 'Достижение';
  if (matchesToken(value, ['TODAY_ACTIONS'])) return 'Сегодня';
  if (matchesToken(value, ['TASK'])) return 'Задача';
  if (matchesToken(value, ['FINANCE'])) return 'Финансы';
  if (matchesToken(value, ['DEBT'])) return 'Долг';
  if (matchesToken(value, ['SAVINGS'])) return 'Накопление';
  if (matchesToken(value, ['WIDGET', 'METRIC'])) return 'Виджет Pulse';
  return rawLabel(value);
}

function rawLabel(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Артефакт';
  if (/^[A-Z0-9_ -]+$/.test(raw)) {
    const humanized = raw
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return humanized ? humanized[0].toUpperCase() + humanized.slice(1) : 'Артефакт';
  }
  return raw;
}

export function getFinanceCategoryLabel(categoryName?: string | null) {
  return String(categoryName ?? '').trim() || 'Другое';
}

export function isPulseFinanceRouteTarget(sourceType?: string | null, actionType?: string | null) {
  return (
    matchesToken(sourceType, ['FINANCE_ENTRY', 'FINANCE_OVERVIEW', 'DEBT', 'SAVINGS_GOAL', 'SHARED_BILL', 'SHARED_DEBT', 'SHARED_SAVINGS']) ||
    matchesToken(actionType, ['FINANCE_SPLIT', 'DEBT_SHARE', 'SAVINGS_SHARE', 'SHARED_BILL', 'SHARED_DEBT', 'SHARED_SAVINGS'])
  );
}
