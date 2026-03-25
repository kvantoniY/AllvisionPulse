export type SuspendedUserLike = {
  suspendedAt?: Date | string | null;
  suspendedUntil?: Date | string | null;
  suspendedPermanent?: boolean | null;
  suspensionReason?: string | null;
};

export function isUserSuspended(user: SuspendedUserLike | null | undefined, now = new Date()) {
  if (!user) return false;
  if (user.suspendedPermanent) return true;
  if (!user.suspendedUntil) return false;
  const until = user.suspendedUntil instanceof Date ? user.suspendedUntil : new Date(user.suspendedUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > now.getTime();
}

export function getSuspensionState(user: SuspendedUserLike | null | undefined, now = new Date()) {
  const suspended = isUserSuspended(user, now);
  const until = user?.suspendedUntil
    ? user.suspendedUntil instanceof Date
      ? user.suspendedUntil
      : new Date(user.suspendedUntil)
    : null;

  return {
    isSuspended: suspended,
    suspendedPermanent: Boolean(user?.suspendedPermanent),
    suspendedUntil: until && Number.isFinite(until.getTime()) ? until : null,
    suspensionReason: user?.suspensionReason ?? null,
  };
}

export function activeUserWhere(now = new Date()) {
  return {
    OR: [
      { suspendedPermanent: false, suspendedUntil: null },
      { suspendedPermanent: false, suspendedUntil: { lte: now } },
    ],
  };
}
