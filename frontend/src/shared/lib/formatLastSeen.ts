export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'был(а) давно';
  const dt = new Date(lastSeenAt);
  if (Number.isNaN(dt.getTime())) return 'был(а) давно';
  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min <= 0) return 'только что';
  if (min < 60) return `был(а) ${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `был(а) ${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `был(а) ${d} дн назад`;
  return `был(а) ${dt.toLocaleDateString()}`;
}
