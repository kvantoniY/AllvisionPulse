import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";
import type { ViewerContext } from "./helpers";
import { pick, toPrismaNullableJson } from "./helpers";
import { describeParticipationConflict, getProgramParticipationState } from "./participation";
import { ensureSystemPrograms } from "./systemPrograms";

export type ProgramBuilderInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  theme?: string | null;
  language?: string | null;
  coverUrl?: string | null;
  durationDays?: number | null;
  accessMode: "PRIVATE" | "RESTRICTED" | "PUBLIC";
  structureType: "FIXED_DURATION" | "ROLLING" | "OPEN_ENDED";
  collaborativeEnabled?: boolean;
  allowedUsernames?: string[];
  rules?: {
    allowSkip?: boolean;
    allowPause?: boolean;
    allowResume?: boolean;
    allowCancel?: boolean;
    allowRecovery?: boolean;
    maxReschedulesPerAction?: number;
    recoveryConfigJson?: Record<string, unknown> | null;
    progressConfigJson?: Record<string, unknown> | null;
    integrationConfigJson?: Record<string, unknown> | null;
  } | null;
  stages?: Array<{
    title: string;
    description?: string | null;
    startDay?: number | null;
    endDay?: number | null;
    milestoneText?: string | null;
  }>;
  days?: Array<{
    dayNumber?: number | null;
    title?: string | null;
    dayText?: string | null;
    tipOfDay?: string | null;
    motivationOfDay?: string | null;
    reflectionPrompt?: string | null;
    isRecoveryTemplate?: boolean;
    actions?: Array<{
      order?: number | null;
      actionType: string;
      integrationType?: string | null;
      title: string;
      description?: string | null;
      required?: boolean;
      estimatedMinutes?: number | null;
      completionPolicy?: string | null;
      reschedulePolicy?: string | null;
      payloadJson?: Record<string, unknown> | null;
    }>;
    milestones?: Array<{
      order?: number | null;
      title: string;
      description?: string | null;
      targetDay?: number | null;
      metricKey?: string | null;
      payloadJson?: Record<string, unknown> | null;
    }>;
  }>;
};

async function resolveAllowedUsers(ownerId: string, usernames: string[]) {
  const cleaned = Array.from(new Set(usernames.map((username) => username.trim()).filter(Boolean)));
  if (!cleaned.length) return [];
  const users = await prisma.user.findMany({
    where: {
      username: { in: cleaned },
    },
    select: { id: true, username: true },
  });
  const foundUsernames = new Set(users.map((user) => user.username));
  const missing = cleaned.filter((username) => !foundUsernames.has(username));
  if (missing.length) throw new HttpError(400, `Users not found: ${missing.join(", ")}`);
  return users.filter((user) => user.id !== ownerId);
}

function stageForDay(stages: any[], dayNumber?: number | null) {
  if (!stages.length) return null;
  if (dayNumber == null) return stages[0];
  return stages.find((stage) => {
    const start = stage.startDay ?? 1;
    const end = stage.endDay ?? Number.MAX_SAFE_INTEGER;
    return dayNumber >= start && dayNumber <= end;
  }) ?? stages[0];
}

async function syncDraftGraph(programId: string, ownerId: string, input: ProgramBuilderInput) {
  const allowedUsers = await resolveAllowedUsers(ownerId, input.allowedUsernames ?? []);

  return prisma.$transaction(async (tx) => {
    const definition = await tx.programDefinition.update({
      where: { id: programId },
      data: {
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        theme: input.theme ?? null,
        language: input.language ?? "ru",
        coverUrl: input.coverUrl ?? null,
        durationDays: input.durationDays ?? null,
        accessMode: input.accessMode,
        structureType: input.structureType,
        collaborativeEnabled: input.collaborativeEnabled ?? true,
      } as any,
    });

    await tx.programAccessGrant.deleteMany({ where: { programDefinitionId: programId } });
    await tx.programActionTemplate.deleteMany({ where: { programDefinitionId: programId } });
    await tx.programMilestoneTemplate.deleteMany({ where: { programDefinitionId: programId } });
    await tx.programDayTemplate.deleteMany({ where: { programDefinitionId: programId } });
    await tx.programStage.deleteMany({ where: { programDefinitionId: programId } });
    await tx.programRuleSet.deleteMany({ where: { programDefinitionId: programId } });

    if (allowedUsers.length) {
      await tx.programAccessGrant.createMany({
        data: allowedUsers.map((user) => ({
          programDefinitionId: programId,
          userId: user.id,
          grantedById: ownerId,
        })),
      });
    }

    const createdStages = [] as any[];
    for (const [index, stage] of (input.stages ?? []).entries()) {
      const created = await tx.programStage.create({
        data: {
          programDefinitionId: programId,
          order: index,
          title: stage.title,
          description: stage.description ?? null,
          startDay: stage.startDay ?? null,
          endDay: stage.endDay ?? null,
          milestoneText: stage.milestoneText ?? null,
        },
      });
      createdStages.push(created);
    }

    for (const [index, day] of (input.days ?? []).entries()) {
      const stage = stageForDay(createdStages, day.dayNumber ?? null);
      const createdDay = await tx.programDayTemplate.create({
        data: {
          programDefinitionId: programId,
          programStageId: stage?.id ?? null,
          dayNumber: day.dayNumber ?? index + 1,
          title: day.title ?? null,
          dayText: day.dayText ?? null,
          tipOfDay: day.tipOfDay ?? null,
          motivationOfDay: day.motivationOfDay ?? null,
          reflectionPrompt: day.reflectionPrompt ?? null,
          isRecoveryTemplate: day.isRecoveryTemplate ?? false,
          sortOrder: index,
        },
      });

      for (const [actionIndex, action] of (day.actions ?? []).entries()) {
        await tx.programActionTemplate.create({
          data: {
            programDefinitionId: programId,
            programStageId: stage?.id ?? null,
            programDayTemplateId: createdDay.id,
            order: action.order ?? actionIndex,
            actionType: action.actionType as any,
            integrationType: (action.integrationType ?? "NONE") as any,
            title: action.title,
            description: action.description ?? null,
            required: action.required ?? true,
            estimatedMinutes: action.estimatedMinutes ?? null,
            completionPolicy: action.completionPolicy ?? null,
            reschedulePolicy: action.reschedulePolicy ?? null,
            payloadJson: toPrismaNullableJson(action.payloadJson ?? null),
          },
        });
      }

      for (const [milestoneIndex, milestone] of (day.milestones ?? []).entries()) {
        await tx.programMilestoneTemplate.create({
          data: {
            programDefinitionId: programId,
            programStageId: stage?.id ?? null,
            programDayTemplateId: createdDay.id,
            order: milestone.order ?? milestoneIndex,
            title: milestone.title,
            description: milestone.description ?? null,
            targetDay: milestone.targetDay ?? day.dayNumber ?? index + 1,
            metricKey: milestone.metricKey ?? null,
            payloadJson: toPrismaNullableJson(milestone.payloadJson ?? null),
          },
        });
      }
    }

    await tx.programRuleSet.create({
      data: {
        programDefinitionId: programId,
        allowSkip: input.rules?.allowSkip ?? true,
        allowPause: input.rules?.allowPause ?? true,
        allowResume: input.rules?.allowResume ?? true,
        allowCancel: input.rules?.allowCancel ?? true,
        allowRecovery: input.rules?.allowRecovery ?? true,
        maxReschedulesPerAction: input.rules?.maxReschedulesPerAction ?? 3,
        recoveryConfigJson: toPrismaNullableJson(input.rules?.recoveryConfigJson ?? null),
        progressConfigJson: toPrismaNullableJson(input.rules?.progressConfigJson ?? null),
        integrationConfigJson: toPrismaNullableJson(input.rules?.integrationConfigJson ?? null),
      },
    });

    return definition;
  });
}

export async function createProgramDefinition(ownerId: string, input: ProgramBuilderInput) {
  const created = await prisma.programDefinition.create({
    data: {
      ownerId,
      sourceType: "USER",
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      theme: input.theme ?? null,
      language: input.language ?? "ru",
      coverUrl: input.coverUrl ?? null,
      durationDays: input.durationDays ?? null,
      accessMode: input.accessMode,
      structureType: input.structureType,
      collaborativeEnabled: input.collaborativeEnabled ?? true,
      lifecycleStatus: "DRAFT",
    } as any,
  });

  await syncDraftGraph(created.id, ownerId, input);
  return prisma.programDefinition.findUnique({
    where: { id: created.id },
    include: {
      accessGrants: { include: { user: { select: { id: true, username: true } } } },
      draftRules: true,
      draftStages: { orderBy: { order: "asc" } },
      draftDays: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      draftActions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      draftMilestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
}

export async function updateProgramDefinition(programId: string, viewer: ViewerContext, input: ProgramBuilderInput) {
  const existing = await prisma.programDefinition.findUnique({ where: { id: programId } });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Program not found");
  if (viewer.role !== "ADMIN" && existing.ownerId !== viewer.id) throw new HttpError(403, "Forbidden");
  await syncDraftGraph(programId, existing.ownerId ?? viewer.id, input);
  return prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      accessGrants: { include: { user: { select: { id: true, username: true } } } },
      draftRules: true,
      draftStages: { orderBy: { order: "asc" } },
      draftDays: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      draftActions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      draftMilestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      currentVersion: true,
    },
  });
}

export async function publishProgramDefinition(programId: string, viewer: ViewerContext) {
  const definition = await prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      draftRules: true,
      draftStages: { orderBy: { order: "asc" } },
      draftDays: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      draftActions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      draftMilestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");
  if (viewer.role !== "ADMIN" && definition.ownerId !== viewer.id) throw new HttpError(403, "Forbidden");
  if (!definition.draftDays.length) throw new HttpError(400, "Program must contain at least one day");

  return prisma.$transaction(async (tx) => {
    const versionNumber = (await tx.programVersion.count({ where: { definitionId: definition.id } })) + 1;
    const version = await tx.programVersion.create({
      data: {
        definitionId: definition.id,
        versionNumber,
        title: definition.title,
        description: definition.description ?? null,
        category: definition.category ?? null,
        theme: definition.theme ?? null,
        language: definition.language ?? "ru",
        coverUrl: definition.coverUrl ?? null,
        durationDays: definition.durationDays ?? null,
        accessMode: definition.accessMode,
        structureType: definition.structureType,
        collaborativeEnabled: definition.collaborativeEnabled,
        publishedById: viewer.id,
        publishedAt: new Date(),
      } as any,
    });

    const stageMap = new Map<string, string>();
    for (const stage of definition.draftStages) {
      const created = await tx.programStage.create({
        data: {
          programVersionId: version.id,
          order: stage.order,
          title: stage.title,
          description: stage.description ?? null,
          startDay: stage.startDay ?? null,
          endDay: stage.endDay ?? null,
          milestoneText: stage.milestoneText ?? null,
        },
      });
      stageMap.set(stage.id, created.id);
    }

    const dayMap = new Map<string, string>();
    for (const day of definition.draftDays) {
      const created = await tx.programDayTemplate.create({
        data: {
          programVersionId: version.id,
          programStageId: day.programStageId ? stageMap.get(day.programStageId) ?? null : null,
          dayNumber: day.dayNumber ?? null,
          title: day.title ?? null,
          dayText: day.dayText ?? null,
          tipOfDay: day.tipOfDay ?? null,
          motivationOfDay: day.motivationOfDay ?? null,
          reflectionPrompt: day.reflectionPrompt ?? null,
          isRecoveryTemplate: day.isRecoveryTemplate,
          sortOrder: day.sortOrder,
        },
      });
      dayMap.set(day.id, created.id);
    }

    for (const action of definition.draftActions) {
      await tx.programActionTemplate.create({
        data: {
          programVersionId: version.id,
          programStageId: action.programStageId ? stageMap.get(action.programStageId) ?? null : null,
          programDayTemplateId: action.programDayTemplateId ? dayMap.get(action.programDayTemplateId) ?? null : null,
          order: action.order,
          actionType: action.actionType,
          integrationType: action.integrationType,
          title: action.title,
          description: action.description ?? null,
          required: action.required,
          estimatedMinutes: action.estimatedMinutes ?? null,
          completionPolicy: action.completionPolicy ?? null,
          reschedulePolicy: action.reschedulePolicy ?? null,
          payloadJson: toPrismaNullableJson(action.payloadJson),
        },
      });
    }

    for (const milestone of definition.draftMilestones) {
      await tx.programMilestoneTemplate.create({
        data: {
          programVersionId: version.id,
          programStageId: milestone.programStageId ? stageMap.get(milestone.programStageId) ?? null : null,
          programDayTemplateId: milestone.programDayTemplateId ? dayMap.get(milestone.programDayTemplateId) ?? null : null,
          order: milestone.order,
          title: milestone.title,
          description: milestone.description ?? null,
          targetDay: milestone.targetDay ?? null,
          metricKey: milestone.metricKey ?? null,
          payloadJson: toPrismaNullableJson(milestone.payloadJson),
        },
      });
    }

    await tx.programRuleSet.create({
      data: {
        programVersionId: version.id,
        allowSkip: definition.draftRules?.allowSkip ?? true,
        allowPause: definition.draftRules?.allowPause ?? true,
        allowResume: definition.draftRules?.allowResume ?? true,
        allowCancel: definition.draftRules?.allowCancel ?? true,
        allowRecovery: definition.draftRules?.allowRecovery ?? true,
        maxReschedulesPerAction: definition.draftRules?.maxReschedulesPerAction ?? 3,
        recoveryConfigJson: toPrismaNullableJson(definition.draftRules?.recoveryConfigJson ?? null),
        progressConfigJson: toPrismaNullableJson(definition.draftRules?.progressConfigJson ?? null),
        integrationConfigJson: toPrismaNullableJson(definition.draftRules?.integrationConfigJson ?? null),
      },
    });

    await tx.programDefinition.update({
      where: { id: definition.id },
      data: {
        currentVersionId: version.id,
        lifecycleStatus: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    return version;
  });
}

function buildProgramSections(definition: any, version: any, useDraft = false) {
  const stages = useDraft ? definition.draftStages : version?.stages ?? [];
  const days = useDraft ? definition.draftDays : version?.days ?? [];
  const actions = useDraft ? definition.draftActions : version?.actions ?? [];
  const milestones = useDraft ? definition.draftMilestones : version?.milestones ?? [];
  const accessUsers = definition.accessGrants?.map((grant: any) => grant.user).filter(Boolean) ?? [];
  const rules = useDraft ? definition.draftRules : version?.rules ?? null;

  return {
    stages,
    days: days.map((day: any) => ({
      ...day,
      actions: actions.filter((action: any) => action.programDayTemplateId === day.id),
      milestones: milestones.filter((milestone: any) => milestone.programDayTemplateId === day.id),
    })),
    accessUsers,
    rules,
  };
}

export async function getProgramDetail(programId: string, viewer: ViewerContext) {
  const definition = await prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      owner: { select: { id: true, username: true, avatarUrl: true } },
      accessGrants: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      currentVersion: {
        include: {
          rules: true,
          stages: { orderBy: { order: "asc" } },
          days: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
          actions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
          milestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        },
      },
      draftRules: true,
      draftStages: { orderBy: { order: "asc" } },
      draftDays: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      draftActions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      draftMilestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      runs: {
        where: { userId: viewer.id, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 3,
      },
      sessions: {
        where: {
          OR: [{ hostId: viewer.id }, { members: { some: { userId: viewer.id } } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
        include: {
          host: { select: { id: true, username: true, avatarUrl: true } },
          members: {
            where: { userId: viewer.id },
            select: {
              role: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");

  const hasAccess =
    viewer.role === "ADMIN" ||
    definition.ownerId === viewer.id ||
    (definition.accessMode === "PUBLIC" && definition.currentVersionId) ||
    (definition.accessMode === "RESTRICTED" && definition.accessGrants.some((grant) => grant.userId === viewer.id));
  if (!hasAccess) throw new HttpError(403, "Forbidden");

  const useDraft = viewer.role === "ADMIN" || definition.ownerId === viewer.id;
  const sections = buildProgramSections(definition, definition.currentVersion, useDraft && !definition.currentVersion);
  const participation = await getProgramParticipationState(viewer.id, definition.id);
  const participationConflict = describeParticipationConflict(participation);
  const accessSource =
    definition.ownerId === viewer.id
      ? "OWNER"
      : definition.accessMode === "PUBLIC"
        ? "PUBLIC"
        : definition.accessMode === "RESTRICTED"
          ? "INVITED"
          : "PRIVATE_SELF";
  const activePersonalRun = definition.runs.find((run) => !run.sessionId && ["ACTIVE", "PAUSED"].includes(run.status)) ?? null;
  const activeCollaborativeRun = definition.runs.find((run) => Boolean(run.sessionId) && ["ACTIVE", "PAUSED"].includes(run.status)) ?? null;
  const activeSession =
    definition.sessions.find((session) => ["DRAFT", "SCHEDULED", "ACTIVE"].includes(session.status)) ??
    definition.sessions[0] ??
    null;
  const canStartPersonal = Boolean(definition.currentVersionId) && !activePersonalRun && !participationConflict;
  const canStartTogether =
    Boolean(definition.currentVersionId) &&
    definition.collaborativeEnabled &&
    definition.accessMode !== "PRIVATE" &&
    !activePersonalRun &&
    !participationConflict;

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    theme: definition.theme,
    language: definition.language,
    coverUrl: definition.coverUrl,
    durationDays: definition.durationDays,
    accessMode: definition.accessMode,
    structureType: definition.structureType,
    collaborativeEnabled: definition.collaborativeEnabled,
    lifecycleStatus: definition.lifecycleStatus,
    publishedAt: definition.publishedAt,
    owner: definition.owner,
    currentVersion: definition.currentVersion
      ? {
          id: definition.currentVersion.id,
          versionNumber: definition.currentVersion.versionNumber,
          publishedAt: definition.currentVersion.publishedAt,
        }
      : null,
    stages: sections.stages,
    sampleDays: sections.days.slice(0, 7),
    integrations: Array.from(new Set(sections.days.flatMap((day: any) => day.actions.map((action: any) => action.integrationType)).filter(Boolean))),
    accessUsers: sections.accessUsers,
    rules: sections.rules,
    myRuns: definition.runs.map((run) => ({
      ...run,
      sessionId: run.sessionId ?? null,
    })),
    relatedSessions: definition.sessions.map((session) => {
      const viewerMember = session.members[0] ?? null;
      return {
        id: session.id,
        status: session.status,
        title: session.title,
        updatedAt: session.updatedAt,
        startedAt: session.startedAt,
        scheduledStartAt: session.scheduledStartAt,
        host: session.host,
        viewerRole: viewerMember?.role ?? (session.hostId === viewer.id ? "HOST" : null),
        viewerStatus: viewerMember?.status ?? null,
      };
    }),
    entryState: {
      accessSource,
      isOwner: definition.ownerId === viewer.id,
      canStartPersonal,
      canStartTogether,
      personalBlockedReason:
        activePersonalRun
          ? "У вас уже запущено личное прохождение этой программы"
          : participationConflict?.message ?? null,
      collaborativeBlockedReason:
        definition.accessMode === "PRIVATE"
          ? "Приватную программу нельзя проходить вместе"
          : !definition.collaborativeEnabled
            ? "Для этой программы совместный режим выключен"
            : activePersonalRun
              ? "Сначала завершите личное прохождение этой программы"
              : participationConflict?.message ?? null,
      activePersonalRunId: activePersonalRun?.id ?? null,
      activeCollaborativeRunId: activeCollaborativeRun?.id ?? null,
      activeSessionId: activeSession?.id ?? participation.acceptedSession?.id ?? null,
    },
  };
}

export async function listPrograms(viewer: ViewerContext, scope: "active" | "library" | "mine" | "collaborative" | "drafts" = "library") {
  await ensureSystemPrograms();
  const items = [] as any[];

  if (scope === "active") {
    const runs = await prisma.programRun.findMany({
      where: {
        userId: viewer.id,
        deletedAt: null,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        programDefinition: {
          include: {
            owner: { select: { id: true, username: true, avatarUrl: true } },
          },
        },
        programVersion: true,
        currentStage: true,
        days: {
          where: {
            status: { in: ["ACTIVE", "RECOVERY", "UPCOMING"] },
          },
          orderBy: [{ sequenceNumber: "asc" }],
          take: 1,
          include: {
            stage: true,
            dayTemplate: true,
            actions: {
              select: {
                id: true,
                status: true,
                required: true,
              },
            },
          },
        },
        session: {
          include: {
            host: { select: { id: true, username: true, avatarUrl: true } },
          },
        },
      },
    });
    return runs.map((run) => {
      const today = run.days[0] ?? null;
      const totalActions = today?.actions.length ?? 0;
      const completedActions = today?.actions.filter((action) => action.status === "COMPLETED").length ?? 0;
      const requiredPending = today?.actions.filter((action) => action.required && !["COMPLETED", "SKIPPED"].includes(action.status)).length ?? 0;
      return ({
      id: run.programDefinitionId,
      runId: run.id,
      sourceType: run.programDefinition.sourceType,
      title: run.programVersion.title,
      description: run.programVersion.description,
      category: run.programVersion.category,
      theme: run.programVersion.theme,
      coverUrl: run.programVersion.coverUrl,
      accessMode: run.programVersion.accessMode,
      structureType: run.programVersion.structureType,
      status: run.status,
      owner: run.programDefinition.owner,
      progress: {
        completion: run.completionPercent,
        adherence: run.adherenceScore,
        consistency: run.consistencyScore,
        streak: run.streakCount,
      },
      today: today
        ? {
            dayNumber: today.programDayNumber ?? today.sequenceNumber,
            status: today.status,
            stageTitle: today.stage?.title ?? run.currentStage?.title ?? null,
            dayText: today.dayTemplate?.dayText ?? null,
            tipOfDay: today.dayTemplate?.tipOfDay ?? null,
            motivationOfDay: today.dayTemplate?.motivationOfDay ?? null,
            totalActions,
            completedActions,
            requiredPending,
          }
        : null,
      myRun: {
        id: run.id,
        status: run.status,
        completionPercent: run.completionPercent,
      },
      session: run.session
        ? {
            id: run.session.id,
            status: run.session.status,
            title: run.session.title,
            startedAt: run.session.startedAt,
            scheduledStartAt: run.session.scheduledStartAt,
            host: run.session.host,
          }
        : null,
      updatedAt: run.updatedAt,
    })});
  }

  if (scope === "collaborative") {
    const sessions = await prisma.programSession.findMany({
      where: {
        OR: [{ hostId: viewer.id }, { members: { some: { userId: viewer.id } } }],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        programDefinition: {
          include: {
            owner: { select: { id: true, username: true, avatarUrl: true } },
          },
        },
        programVersion: true,
        host: { select: { id: true, username: true, avatarUrl: true } },
        members: {
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } },
            run: true,
          },
        },
      },
    });
    return sessions.map((session) => ({
      id: session.programDefinitionId,
      sourceType: session.programDefinition.sourceType,
      title: session.programVersion.title,
      description: session.programVersion.description,
      category: session.programVersion.category,
      theme: session.programVersion.theme,
      coverUrl: session.programVersion.coverUrl,
      accessMode: session.programVersion.accessMode,
      structureType: session.programVersion.structureType,
      status: session.status,
      owner: session.programDefinition.owner,
      session: {
        id: session.id,
        status: session.status,
        title: session.title,
        startedAt: session.startedAt,
        scheduledStartAt: session.scheduledStartAt,
        host: session.host,
        viewerRole: session.hostId === viewer.id ? "HOST" : session.members.find((member) => member.userId === viewer.id)?.role ?? null,
        viewerStatus: session.members.find((member) => member.userId === viewer.id)?.status ?? null,
        readiness: {
          accepted: session.members.filter((member) => member.status === "ACCEPTED").length,
          pending: session.members.filter((member) => member.status === "PENDING").length,
        },
      },
      participants: session.members.length,
      members: session.members,
      updatedAt: session.updatedAt,
    }));
  }

  const definitions = await prisma.programDefinition.findMany({
    where:
      scope === "mine" || scope === "drafts"
        ? { ownerId: viewer.id, deletedAt: null, ...(scope === "drafts" ? { currentVersionId: null } : {}) }
        : {
            deletedAt: null,
            currentVersionId: { not: null },
            OR: [
              { accessMode: "PUBLIC" },
              { ownerId: viewer.id },
              { accessMode: "RESTRICTED", accessGrants: { some: { userId: viewer.id } } },
            ],
          },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, username: true, avatarUrl: true } },
      currentVersion: true,
      runs: {
        where: { userId: viewer.id, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      sessions: {
        where: {
          OR: [{ hostId: viewer.id }, { members: { some: { userId: viewer.id } } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  for (const definition of definitions) {
    const version = definition.currentVersion;
    items.push({
      id: definition.id,
      sourceType: definition.sourceType,
      title: pick(version?.title, definition.title),
      description: pick(version?.description, definition.description),
      category: pick(version?.category, definition.category),
      theme: pick(version?.theme, definition.theme),
      coverUrl: pick(version?.coverUrl, definition.coverUrl),
      accessMode: pick(version?.accessMode, definition.accessMode),
      structureType: pick(version?.structureType, definition.structureType),
      durationDays: pick(version?.durationDays, definition.durationDays),
      collaborativeEnabled: pick(version?.collaborativeEnabled, definition.collaborativeEnabled),
      lifecycleStatus: definition.lifecycleStatus,
      accessSource:
        definition.ownerId === viewer.id
          ? "OWNER"
          : definition.accessMode === "PUBLIC"
            ? "PUBLIC"
            : definition.accessMode === "RESTRICTED"
              ? "INVITED"
              : "PRIVATE_SELF",
      owner: definition.owner,
      publishedAt: version?.publishedAt ?? definition.publishedAt,
      updatedAt: definition.updatedAt,
      myRun: definition.runs[0] ?? null,
      session: definition.sessions[0]
        ? {
            id: definition.sessions[0].id,
            status: definition.sessions[0].status,
            title: definition.sessions[0].title,
            startedAt: definition.sessions[0].startedAt,
            scheduledStartAt: definition.sessions[0].scheduledStartAt,
          }
        : null,
    });
  }

  if (scope === "library") {
    items.sort((left, right) => {
      if (left.sourceType === "SYSTEM" && right.sourceType !== "SYSTEM") return -1;
      if (left.sourceType !== "SYSTEM" && right.sourceType === "SYSTEM") return 1;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }

  return items;
}

export async function getProgramInvitePreviewByToken(token: string, viewer?: ViewerContext | null) {
  const artifact = await prisma.pulseShareArtifact.findFirst({
    where: {
      inviteToken: token,
      sourceType: "PROGRAM",
      mode: "INVITE",
    },
  });
  if (!artifact?.sourceId) throw new HttpError(404, "Invite not found");

  const definition = await prisma.programDefinition.findUnique({
    where: { id: artifact.sourceId },
    include: {
      owner: { select: { id: true, username: true, avatarUrl: true } },
      currentVersion: true,
      accessGrants: { select: { id: true, userId: true } },
    },
  });
  if (!definition || definition.deletedAt || !definition.currentVersion) throw new HttpError(404, "Program not found");

  return {
    token,
    programId: definition.id,
    title: artifact.title ?? definition.currentVersion.title,
    description: artifact.description ?? definition.currentVersion.description,
    accessMode: definition.accessMode,
    collaborativeEnabled: definition.collaborativeEnabled,
    owner: definition.owner,
    program: {
      id: definition.id,
      title: definition.currentVersion.title,
      description: definition.currentVersion.description,
      category: definition.currentVersion.category,
      theme: definition.currentVersion.theme,
      coverUrl: definition.currentVersion.coverUrl,
    },
    alreadyGranted: Boolean(viewer && definition.ownerId === viewer.id) || Boolean(viewer && definition.accessGrants.some((grant) => grant.userId === viewer.id)),
    canAccept: definition.accessMode === "RESTRICTED",
  };
}

export async function acceptProgramInviteByToken(token: string, viewer: ViewerContext) {
  const artifact = await prisma.pulseShareArtifact.findFirst({
    where: {
      inviteToken: token,
      sourceType: "PROGRAM",
      mode: "INVITE",
    },
  });
  if (!artifact?.sourceId) throw new HttpError(404, "Invite not found");

  const definition = await prisma.programDefinition.findUnique({
    where: { id: artifact.sourceId },
    include: {
      currentVersion: true,
    },
  });
  if (!definition || definition.deletedAt || !definition.currentVersion) throw new HttpError(404, "Program not found");

  if (definition.accessMode === "PRIVATE" && definition.ownerId !== viewer.id) {
    throw new HttpError(403, "Приватную программу нельзя принять по ссылке");
  }

  if (definition.accessMode === "RESTRICTED" && definition.ownerId !== viewer.id) {
    await prisma.programAccessGrant.upsert({
      where: {
        programDefinitionId_userId: {
          programDefinitionId: definition.id,
          userId: viewer.id,
        },
      },
      create: {
        programDefinitionId: definition.id,
        userId: viewer.id,
        grantedById: definition.ownerId ?? viewer.id,
      },
      update: {},
    });
  }

  return getProgramDetail(definition.id, viewer);
}

export async function archiveProgramDefinition(programId: string, viewer: ViewerContext) {
  const definition = await prisma.programDefinition.findUnique({ where: { id: programId } });
  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");
  if (viewer.role !== "ADMIN" && definition.ownerId !== viewer.id) throw new HttpError(403, "Forbidden");

  return prisma.programDefinition.update({
    where: { id: programId },
    data: {
      lifecycleStatus: "ARCHIVED",
      archivedAt: new Date(),
    },
  });
}

export async function deleteProgramDefinition(programId: string, viewer: ViewerContext) {
  const definition = await prisma.programDefinition.findUnique({ where: { id: programId } });
  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");
  if (viewer.role !== "ADMIN" && definition.ownerId !== viewer.id) throw new HttpError(403, "Forbidden");

  return prisma.programDefinition.update({
    where: { id: programId },
    data: {
      deletedAt: new Date(),
      lifecycleStatus: "ARCHIVED",
    },
  });
}
