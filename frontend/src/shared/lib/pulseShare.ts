import type { ShareArtifact } from '@/shared/types/programs';
import { isPulseFinanceRouteTarget } from '@/shared/lib/pulseArtifactDisplay';

export type PulseShareEmbedArtifact = Pick<
  ShareArtifact,
  'id' | 'kind' | 'mode' | 'actionType' | 'title' | 'description' | 'sourceType' | 'sourceId' | 'snapshotJson' | 'referenceJson' | 'payloadJson' | 'openRoute'
>;

export type PulseShareWidgetPayload = {
  type: 'pulse_share';
  artifactId: string;
  artifact: PulseShareEmbedArtifact;
};

export type PulseShareMessageMeta = {
  kind: 'pulse_share';
  artifactId: string;
  artifact: PulseShareEmbedArtifact;
};

export function toPulseShareEmbedArtifact(artifact: ShareArtifact): PulseShareEmbedArtifact {
  return {
    id: artifact.id,
    kind: artifact.kind,
    mode: artifact.mode,
    actionType: artifact.actionType ?? null,
    title: artifact.title ?? null,
    description: artifact.description ?? null,
    sourceType: artifact.sourceType,
    sourceId: artifact.sourceId ?? null,
    snapshotJson: artifact.resolvedSnapshot ?? artifact.snapshotJson ?? null,
    referenceJson: artifact.referenceJson ?? null,
    payloadJson: artifact.payloadJson ?? null,
    openRoute: artifact.openRoute ?? null,
  };
}

export function toPulseShareWidgetPayload(artifact: ShareArtifact): PulseShareWidgetPayload {
  return {
    type: 'pulse_share',
    artifactId: artifact.id,
    artifact: toPulseShareEmbedArtifact(artifact),
  };
}

export function toPulseShareMessageMeta(artifact: ShareArtifact): PulseShareMessageMeta {
  return {
    kind: 'pulse_share',
    artifactId: artifact.id,
    artifact: toPulseShareEmbedArtifact(artifact),
  };
}

export function getPulseShareRoute(artifactId?: string | null, artifact?: Partial<PulseShareEmbedArtifact> | null) {
  if (typeof artifact?.openRoute === 'string' && artifact.openRoute) {
    return artifact.openRoute;
  }

  const reference = artifact?.referenceJson as Record<string, unknown> | undefined;
  const sourceType = String(artifact?.sourceType ?? '');
  const actionType = String(artifact?.actionType ?? '');

  if (typeof reference?.inviteToken === 'string' && reference.inviteToken) {
    if (reference.inviteType === 'PROGRAM') return `/health?tab=programs&programInvite=${reference.inviteToken}`;
    return `/health?tab=programs&sessionInvite=${reference.inviteToken}`;
  }
  if (typeof reference?.runId === 'string' && reference.runId) return `/health/program-runs/${reference.runId}`;
  if (typeof reference?.sessionId === 'string' && reference.sessionId) return `/health/program-sessions/${reference.sessionId}`;
  if (typeof reference?.programId === 'string' && reference.programId) return `/health/programs/${reference.programId}`;
  if (typeof reference?.taskId === 'string' && reference.taskId) return '/health?tab=tasks';
  if (typeof reference?.financeEntryId === 'string' && reference.financeEntryId) return '/health?tab=finance';
  if (typeof reference?.debtId === 'string' && reference.debtId) return '/health?tab=finance';
  if (typeof reference?.savingsGoalId === 'string' && reference.savingsGoalId) return '/health?tab=finance';
  if (typeof reference?.achievementId === 'string' && reference.achievementId) return '/health/achievements';
  if (sourceType === 'ACHIEVEMENT') return '/health/achievements';
  if (sourceType === 'TODAY_ACTIONS') return '/health?tab=programs';
  if (sourceType === 'TASK' || sourceType === 'TASK_DAY') return '/health?tab=tasks';
  if (isPulseFinanceRouteTarget(sourceType, actionType)) return '/health?tab=finance';
  if (sourceType === 'MENTAL_DAY' || sourceType === 'NUTRITION_DAY') return '/health?tab=health';
  if (artifactId) return `/health/programs?share=${artifactId}`;
  return '/health?tab=programs';
}
