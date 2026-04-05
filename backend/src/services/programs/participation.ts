import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";

const BLOCKING_RUN_STATUSES = ["ACTIVE", "PAUSED"] as const;
const BLOCKING_SESSION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE"] as const;

type ParticipationOptions = {
  excludeSessionId?: string | null;
};

export async function getProgramParticipationState(
  userId: string,
  programDefinitionId: string,
  options: ParticipationOptions = {},
) {
  const [activePersonalRun, activeCollaborativeRun, acceptedSession] = await Promise.all([
    prisma.programRun.findFirst({
      where: {
        userId,
        programDefinitionId,
        deletedAt: null,
        sessionId: null,
        status: { in: [...BLOCKING_RUN_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.programRun.findFirst({
      where: {
        userId,
        programDefinitionId,
        deletedAt: null,
        AND: [
          { sessionId: { not: null } },
          ...(options.excludeSessionId ? [{ sessionId: { not: options.excludeSessionId } }] : []),
        ],
        status: { in: [...BLOCKING_RUN_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        sessionId: true,
        updatedAt: true,
      },
    }),
    prisma.programSession.findFirst({
      where: {
        programDefinitionId,
        archivedAt: null,
        cancelledAt: null,
        status: { in: [...BLOCKING_SESSION_STATUSES] },
        ...(options.excludeSessionId ? { id: { not: options.excludeSessionId } } : {}),
        members: {
          some: {
            userId,
            status: "ACCEPTED",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        hostId: true,
        startedAt: true,
        scheduledStartAt: true,
        host: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ]);

  return {
    activePersonalRun,
    activeCollaborativeRun,
    acceptedSession,
  };
}

export function describeParticipationConflict(state: Awaited<ReturnType<typeof getProgramParticipationState>>) {
  if (state.activePersonalRun) {
    return {
      code: "ACTIVE_PERSONAL_RUN",
      message: "У вас уже есть личное прохождение этой программы",
      runId: state.activePersonalRun.id,
      sessionId: null,
    };
  }

  if (state.activeCollaborativeRun) {
    return {
      code: "ACTIVE_COLLABORATIVE_RUN",
      message: "Сначала завершите или покиньте совместную сессию по этой программе",
      runId: state.activeCollaborativeRun.id,
      sessionId: state.activeCollaborativeRun.sessionId ?? state.acceptedSession?.id ?? null,
    };
  }

  if (state.acceptedSession) {
    return {
      code: "ACTIVE_COLLABORATIVE_SESSION",
      message: "Сначала завершите или покиньте совместную сессию по этой программе",
      runId: null,
      sessionId: state.acceptedSession.id,
    };
  }

  return null;
}

export async function assertUserHasNoProgramConflict(
  userId: string,
  programDefinitionId: string,
  options: ParticipationOptions = {},
) {
  const state = await getProgramParticipationState(userId, programDefinitionId, options);
  const conflict = describeParticipationConflict(state);
  if (conflict) {
    throw new HttpError(400, conflict.message, {
      conflict,
    });
  }
  return state;
}

export async function assertUserCanStartPersonalProgramRun(userId: string, programDefinitionId: string) {
  const state = await getProgramParticipationState(userId, programDefinitionId);
  if (state.activePersonalRun) {
    throw new HttpError(400, "У вас уже есть личное прохождение этой программы", {
      conflict: {
        code: "ACTIVE_PERSONAL_RUN",
        runId: state.activePersonalRun.id,
      },
    });
  }

  if (state.activeCollaborativeRun || state.acceptedSession) {
    throw new HttpError(400, "Сначала завершите или покиньте совместную сессию по этой программе", {
      conflict: {
        code: state.activeCollaborativeRun ? "ACTIVE_COLLABORATIVE_RUN" : "ACTIVE_COLLABORATIVE_SESSION",
        runId: state.activeCollaborativeRun?.id ?? null,
        sessionId: state.activeCollaborativeRun?.sessionId ?? state.acceptedSession?.id ?? null,
      },
    });
  }

  return state;
}
