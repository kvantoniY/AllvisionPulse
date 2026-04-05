import type { Prisma, PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";
import { maybeAwardRunAchievements } from "./achievements";
import {
  addDays,
  buildProgramTaskSourceKey,
  clamp,
  getActionOpenPath,
  isPausedRunStatus,
  isTerminalRunStatus,
  safeInt,
  startOfDay,
  toDateKey,
  toPrismaNullableJson,
} from "./helpers";

type DbLike = PrismaClient | Prisma.TransactionClient;

type VersionGraph = Awaited<ReturnType<typeof loadVersionGraph>>;

function getScheduledActionDueDate(action: { scheduledDate: Date; payloadJson?: Record<string, unknown> | null }) {
  const base = dayjs(action.scheduledDate);
  if (!base.isValid()) return { dueDate: action.scheduledDate, endDate: null as Date | null, hasTime: false };
  const rawTime = typeof action.payloadJson?.scheduledTime === "string" ? action.payloadJson.scheduledTime.trim() : "";
  const rawEndTime = typeof action.payloadJson?.scheduledEndTime === "string" ? action.payloadJson.scheduledEndTime.trim() : "";
  if (!/^\d{2}:\d{2}$/.test(rawTime)) {
    return { dueDate: base.toDate(), endDate: null as Date | null, hasTime: false };
  }
  const [hours, minutes] = rawTime.split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return { dueDate: base.toDate(), endDate: null as Date | null, hasTime: false };
  }
  const start = base.hour(hours).minute(minutes).second(0).millisecond(0);
  const end = /^\d{2}:\d{2}$/.test(rawEndTime)
    ? (() => {
        const [endHours, endMinutes] = rawEndTime.split(":").map((value) => Number(value));
        if (!Number.isFinite(endHours) || !Number.isFinite(endMinutes)) return null;
        const nextEnd = base.hour(endHours).minute(endMinutes).second(0).millisecond(0);
        return nextEnd.isAfter(start) ? nextEnd : null;
      })()
    : null;
  return {
    dueDate: start.toDate(),
    endDate: end ? end.toDate() : null,
    hasTime: true,
  };
}

async function loadVersionGraph(db: DbLike, versionId: string) {
  const version = await db.programVersion.findUnique({
    where: { id: versionId },
    include: {
      definition: true,
      rules: true,
      stages: { orderBy: { order: "asc" } },
      days: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      actions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      milestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!version) throw new HttpError(404, "Program version not found");
  return version;
}

function getActionGroups(version: VersionGraph) {
  const byDay = new Map<string, any[]>();
  for (const action of version.actions) {
    const key = action.programDayTemplateId ?? "__orphan__";
    byDay.set(key, [...(byDay.get(key) ?? []), action]);
  }
  return byDay;
}

function resolveStageForSequence(version: VersionGraph, sequenceNumber: number, template?: { programStageId?: string | null } | null) {
  if (template?.programStageId) {
    const direct = version.stages.find((stage) => stage.id === template.programStageId);
    if (direct) return direct;
  }
  const ranged = version.stages.find((stage) => {
    const start = stage.startDay ?? 1;
    const end = stage.endDay ?? Number.MAX_SAFE_INTEGER;
    return sequenceNumber >= start && sequenceNumber <= end;
  });
  return ranged ?? version.stages[0] ?? null;
}

function getTemplateForSequence(version: VersionGraph, sequenceNumber: number) {
  const templates = version.days;
  if (!templates.length) return null;
  if (version.structureType === "FIXED_DURATION") {
    return templates.find((template) => template.dayNumber === sequenceNumber) ?? templates[sequenceNumber - 1] ?? templates[(sequenceNumber - 1) % templates.length];
  }
  return templates[(sequenceNumber - 1) % templates.length];
}

function getTargetRunLength(version: VersionGraph) {
  const baseCount = version.days.length || 1;
  if (version.structureType === "FIXED_DURATION") {
    return Math.max(version.durationDays ?? 0, baseCount);
  }
  if (version.structureType === "ROLLING") {
    return Math.max(version.durationDays ?? baseCount * 4, baseCount);
  }
  return Math.max(version.durationDays ?? baseCount, 30);
}

export async function ensureRunHorizon(db: DbLike, runId: string, minimumUpcoming = 14) {
  const run = await db.programRun.findUnique({
    where: { id: runId },
    include: {
      programVersion: true,
      days: {
        orderBy: { sequenceNumber: "asc" },
      },
    },
  });
  if (!run || run.deletedAt || run.programVersion.structureType !== "OPEN_ENDED") return run;

  const today = startOfDay().toDate();
  const upcoming = run.days.filter((day) => day.scheduledDate >= today);
  if (upcoming.length >= minimumUpcoming) return run;

  const version = await loadVersionGraph(db, run.programVersionId);
  const actionGroups = getActionGroups(version);
  const existingDays = run.days.length;
  const toCreate = minimumUpcoming - upcoming.length + 7;

  for (let index = 0; index < toCreate; index += 1) {
    const sequenceNumber = existingDays + index + 1;
    const template = getTemplateForSequence(version, sequenceNumber);
    const stage = resolveStageForSequence(version, sequenceNumber, template);
    const scheduledDate = addDays(run.startDate, sequenceNumber - 1);

    const runDay = await db.programRunDay.create({
      data: {
        programRunId: run.id,
        programStageId: stage?.id ?? null,
        programDayTemplateId: template?.id ?? null,
        sequenceNumber,
        programDayNumber: template?.dayNumber ?? sequenceNumber,
        scheduledDate,
        status: scheduledDate <= today ? "ACTIVE" : "UPCOMING",
        isRecoveryDay: false,
      },
    });

    const templateActions = template ? actionGroups.get(template.id) ?? [] : [];
    for (const action of templateActions) {
      await db.programRunAction.create({
        data: {
          programRunId: run.id,
          programRunDayId: runDay.id,
          programActionTemplateId: action.id,
          programStageId: stage?.id ?? action.programStageId ?? null,
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
          status: "PENDING",
          scheduledDate,
        },
      });
    }
  }

  return db.programRun.findUnique({ where: { id: run.id } });
}

export async function generateRunFromVersion(
  db: DbLike,
  input: {
    userId: string;
    programDefinitionId: string;
    programVersionId: string;
    startDate?: Date | null;
    sessionId?: string | null;
  },
) {
  const version = await loadVersionGraph(db, input.programVersionId);
  if (!version.days.length) throw new HttpError(400, "Program must contain at least one day");

  const logicalStartDate = startOfDay(input.startDate ?? new Date()).toDate();
  const targetLength = getTargetRunLength(version);
  const actionGroups = getActionGroups(version);

  const run = await db.programRun.create({
    data: {
      userId: input.userId,
      programDefinitionId: input.programDefinitionId,
      programVersionId: input.programVersionId,
      sessionId: input.sessionId ?? null,
      status: "ACTIVE",
      startDate: logicalStartDate,
      currentDayNumber: 1,
      currentStageId: resolveStageForSequence(version, 1, version.days[0])?.id ?? null,
      lastActivityAt: new Date(),
    },
  });

  for (let sequenceNumber = 1; sequenceNumber <= targetLength; sequenceNumber += 1) {
    const template = getTemplateForSequence(version, sequenceNumber);
    const stage = resolveStageForSequence(version, sequenceNumber, template);
    const scheduledDate = addDays(logicalStartDate, sequenceNumber - 1);

    const day = await db.programRunDay.create({
      data: {
        programRunId: run.id,
        programStageId: stage?.id ?? null,
        programDayTemplateId: template?.id ?? null,
        sequenceNumber,
        programDayNumber: template?.dayNumber ?? sequenceNumber,
        scheduledDate,
        status: sequenceNumber === 1 ? "ACTIVE" : "UPCOMING",
        isRecoveryDay: false,
      },
    });

    const templateActions = template ? actionGroups.get(template.id) ?? [] : [];
    for (const action of templateActions) {
      await db.programRunAction.create({
        data: {
          programRunId: run.id,
          programRunDayId: day.id,
          programActionTemplateId: action.id,
          programStageId: stage?.id ?? action.programStageId ?? null,
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
          status: "PENDING",
          scheduledDate,
        },
      });
    }
  }

  return db.programRun.findUnique({ where: { id: run.id } });
}

async function archiveLinkedTask(db: DbLike, taskId: string) {
  await db.task.updateMany({
    where: { id: taskId, deletedAt: null },
    data: { deletedAt: new Date(), completed: false },
  });
}

export async function syncRunActionTask(db: DbLike, actionId: string) {
  const action = await db.programRunAction.findUnique({
    where: { id: actionId },
    include: {
      run: {
        include: {
          programVersion: true,
          programDefinition: true,
        },
      },
      taskLinks: true,
    },
  });
  if (!action) return null;

  const shouldUseTaskTracker = action.integrationType === "TASK_TRACKER" || action.actionType === "TASK";
  const link = action.taskLinks[0] ?? null;

  if (!shouldUseTaskTracker) {
    if (link) {
      await archiveLinkedTask(db, link.taskId);
      await db.programTaskLink.update({ where: { id: link.id }, data: { syncState: "ARCHIVED" } });
    }
    return null;
  }

  if (action.run.status === "PAUSED") {
    if (link) {
      await archiveLinkedTask(db, link.taskId);
      await db.programTaskLink.update({ where: { id: link.id }, data: { syncState: "HIDDEN" } });
    }
    return null;
  }

  if (action.run.status !== "ACTIVE" || !["PENDING", "RESCHEDULED", "COMPLETED"].includes(action.status)) {
    if (link) {
      await archiveLinkedTask(db, link.taskId);
      await db.programTaskLink.update({ where: { id: link.id }, data: { syncState: "ARCHIVED" } });
    }
    return null;
  }

  const scheduled = getScheduledActionDueDate({
    scheduledDate: action.scheduledDate,
    payloadJson: (action.payloadJson as Record<string, unknown> | null | undefined) ?? null,
  });

  const payload = {
    userId: action.run.userId,
    title: action.title,
    notes: action.description ?? null,
    kind: "TASK" as const,
    dueDate: scheduled.dueDate,
    hasTime: scheduled.hasTime,
    completed: action.status === "COMPLETED",
    priority: action.required ? 4 : 2,
    tags: ["program", (action.run.programDefinition.category ?? "pulse").toLowerCase()],
    remindersJson: null,
    recurrenceJson: {
      taskType: "ONE_TIME",
      scheduleType: "NONE",
      source: "program",
      runId: action.programRunId,
      actionId: action.id,
      scheduledTime:
        typeof (action.payloadJson as Record<string, unknown> | null | undefined)?.scheduledTime === "string"
          ? (action.payloadJson as Record<string, unknown>).scheduledTime
          : null,
      scheduledEndTime:
        typeof (action.payloadJson as Record<string, unknown> | null | undefined)?.scheduledEndTime === "string"
          ? (action.payloadJson as Record<string, unknown>).scheduledEndTime
          : null,
    },
    sourceKey: buildProgramTaskSourceKey(action.id),
    deletedAt: null,
  };

  let taskId = link?.taskId ?? null;
  if (taskId) {
    await db.task.update({ where: { id: taskId }, data: payload as any });
  } else {
    const task = await db.task.create({ data: payload as any });
    taskId = task.id;
    await db.programTaskLink.create({
      data: {
        programRunId: action.programRunId,
        programRunActionId: action.id,
        taskId,
        syncState: "ACTIVE",
      },
    });
  }

  if (link) {
    await db.programTaskLink.update({ where: { id: link.id }, data: { syncState: "ACTIVE" } });
  }

  return taskId;
}

export async function syncRunLifecycleTasks(db: DbLike, runId: string) {
  const run = await db.programRun.findUnique({
    where: { id: runId },
    include: {
      actions: { select: { id: true } },
    },
  });
  if (!run) return;
  for (const action of run.actions) {
    await syncRunActionTask(db, action.id);
  }
}

export async function markOverdueRunState(db: DbLike, runId: string) {
  const run = await db.programRun.findUnique({ where: { id: runId } });
  if (!run || run.deletedAt || isTerminalRunStatus(run.status) || isPausedRunStatus(run.status)) return;

  const today = startOfDay().toDate();
  const overdueActions = await db.programRunAction.findMany({
    where: {
      programRunId: runId,
      scheduledDate: { lt: today },
      status: { in: ["PENDING", "RESCHEDULED"] },
    },
    select: { id: true },
  });

  for (const action of overdueActions) {
    await db.programRunAction.update({
      where: { id: action.id },
      data: { status: "MISSED" },
    });
    await syncRunActionTask(db, action.id);
  }

  const overdueDays = await db.programRunDay.findMany({
    where: {
      programRunId: runId,
      scheduledDate: { lt: today },
      status: { in: ["UPCOMING", "ACTIVE"] },
    },
    select: { id: true },
  });

  for (const day of overdueDays) {
    await db.programRunDay.update({
      where: { id: day.id },
      data: { status: "MISSED", missedAt: new Date() },
    });
  }
}

async function awardCompletedStages(db: DbLike, runId: string) {
  const run = await db.programRun.findUnique({
    where: { id: runId },
    include: {
      programVersion: {
        include: {
          stages: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!run) return;

  const groupedDays = await db.programRunDay.findMany({
    where: { programRunId: runId, programStageId: { not: null } },
    orderBy: { sequenceNumber: "asc" },
  });

  const byStage = new Map<string, any[]>();
  for (const day of groupedDays) {
    if (!day.programStageId) continue;
    byStage.set(day.programStageId, [...(byStage.get(day.programStageId) ?? []), day]);
  }

  for (const stage of run.programVersion.stages) {
    const stageDays = byStage.get(stage.id) ?? [];
    if (!stageDays.length) continue;
    const isCompleted = stageDays.every((day) => day.status === "COMPLETED");
    if (!isCompleted) continue;
    await maybeAwardRunAchievements(db, {
      runId,
      userId: run.userId,
      completionPercent: run.completionPercent,
      adherenceScore: run.adherenceScore,
      streakCount: run.streakCount,
      currentStageId: stage.id,
      stageTitle: stage.title,
      programTitle: run.programVersion.title,
      sessionId: run.sessionId,
      collaborative: Boolean(run.sessionId),
    });
  }
}

export async function recomputeRunStats(db: DbLike, runId: string) {
  const run = await db.programRun.findUnique({
    where: { id: runId },
    include: {
      programVersion: {
        include: {
          stages: { orderBy: { order: "asc" } },
          definition: true,
        },
      },
      days: {
        orderBy: { sequenceNumber: "asc" },
        include: {
          actions: { orderBy: { order: "asc" } },
          stage: true,
          dayTemplate: true,
        },
      },
    },
  });
  if (!run) throw new HttpError(404, "Run not found");

  const today = startOfDay();
  let totalRequired = 0;
  let completedRequired = 0;
  let totalOptional = 0;
  let completedOptional = 0;
  let missedDaysCount = 0;
  let skippedActionsCount = 0;
  let rescheduledActionsCount = 0;

  for (const day of run.days) {
    const requiredActions = day.actions.filter((action) => action.required);
    const optionalActions = day.actions.filter((action) => !action.required);
    const requiredCompleted = requiredActions.filter((action) => action.status === "COMPLETED").length;
    const optionalCompleted = optionalActions.filter((action) => action.status === "COMPLETED").length;
    const hasMissed = day.actions.some((action) => action.status === "MISSED");
    const hasPending = day.actions.some((action) => ["PENDING", "RESCHEDULED"].includes(action.status));

    totalRequired += requiredActions.length;
    completedRequired += requiredCompleted;
    totalOptional += optionalActions.length;
    completedOptional += optionalCompleted;
    skippedActionsCount += day.actions.filter((action) => action.status === "SKIPPED").length;
    rescheduledActionsCount += day.actions.filter((action) => action.status === "RESCHEDULED").length;

    let nextStatus = day.status;
    if (["SKIPPED", "ARCHIVED"].includes(day.status)) {
      nextStatus = day.status;
    } else if (requiredActions.length === 0 && optionalActions.length === 0) {
      nextStatus = dayjs(day.scheduledDate).isBefore(today, "day") ? "COMPLETED" : dayjs(day.scheduledDate).isSame(today, "day") ? "ACTIVE" : "UPCOMING";
    } else if (requiredActions.length > 0 && requiredCompleted >= requiredActions.length) {
      nextStatus = "COMPLETED";
    } else if (hasMissed && !day.isRecoveryDay) {
      nextStatus = "MISSED";
    } else if (hasPending) {
      if (dayjs(day.scheduledDate).isSame(today, "day")) nextStatus = day.isRecoveryDay ? "RECOVERY" : "ACTIVE";
      else if (dayjs(day.scheduledDate).isBefore(today, "day")) nextStatus = "MISSED";
      else nextStatus = "UPCOMING";
    } else {
      nextStatus = dayjs(day.scheduledDate).isBefore(today, "day") ? "COMPLETED" : dayjs(day.scheduledDate).isSame(today, "day") ? "ACTIVE" : "UPCOMING";
    }

    if (nextStatus === "MISSED") missedDaysCount += 1;

    await db.programRunDay.update({
      where: { id: day.id },
      data: {
        status: nextStatus as any,
        requiredCount: requiredActions.length,
        optionalCount: optionalActions.length,
        completedRequiredCount: requiredCompleted,
        completedOptionalCount: optionalCompleted,
        completedAt: nextStatus === "COMPLETED" ? day.completedAt ?? new Date() : null,
        missedAt: nextStatus === "MISSED" ? day.missedAt ?? new Date() : null,
      },
    });
  }

  const completionPercent = totalRequired ? Math.round((completedRequired / totalRequired) * 100) : 0;
  const adherenceBase = totalRequired + missedDaysCount + skippedActionsCount;
  const adherenceScore = adherenceBase ? clamp(Math.round((completedRequired / adherenceBase) * 100), 0, 100) : 100;
  const pastDays = run.days.filter((day) => dayjs(day.scheduledDate).isSame(today, "day") || dayjs(day.scheduledDate).isBefore(today, "day"));
  const consistentDays = pastDays.filter((day) => ["COMPLETED", "RECOVERY"].includes(day.status)).length;
  const consistencyScore = pastDays.length ? clamp(Math.round((consistentDays / pastDays.length) * 100), 0, 100) : 100;

  let streakCount = 0;
  const orderedPastDays = [...pastDays].sort((a, b) => dayjs(b.scheduledDate).valueOf() - dayjs(a.scheduledDate).valueOf());
  for (const day of orderedPastDays) {
    if (["COMPLETED", "RECOVERY"].includes(day.status)) streakCount += 1;
    else break;
  }

  const currentDay = run.days.find((day) => dayjs(day.scheduledDate).isSame(today, "day")) ??
    run.days.find((day) => ["ACTIVE", "RECOVERY", "UPCOMING"].includes(day.status)) ??
    run.days[run.days.length - 1] ??
    null;

  const currentStageId = currentDay?.programStageId ?? run.currentStageId ?? null;
  const currentStageDays = currentStageId ? run.days.filter((day) => day.programStageId === currentStageId) : [];
  const stageCompleted = currentStageDays.filter((day) => day.status === "COMPLETED").length;
  const stageCompletionPercent = currentStageDays.length ? Math.round((stageCompleted / currentStageDays.length) * 100) : 0;
  const completed = totalRequired > 0 && completedRequired >= totalRequired;

  const updatedRun = await db.programRun.update({
    where: { id: run.id },
    data: {
      currentDayNumber: currentDay?.sequenceNumber ?? run.currentDayNumber,
      currentStageId,
      completionPercent,
      adherenceScore,
      consistencyScore,
      streakCount,
      missedDaysCount,
      skippedActionsCount,
      rescheduledActionsCount,
      stageCompletionPercent,
      status: completed && run.status === "ACTIVE" ? "COMPLETED" : run.status,
      completedAt: completed && !run.completedAt ? new Date() : run.completedAt,
      lastActivityAt: new Date(),
    },
  });

  await awardCompletedStages(db, run.id);
  await maybeAwardRunAchievements(db, {
    runId: run.id,
    userId: run.userId,
    completionPercent,
    adherenceScore,
    streakCount,
    programTitle: run.programVersion.title,
    completed,
    collaborative: Boolean(run.sessionId),
    sessionId: run.sessionId,
  });

  return updatedRun;
}

async function findOrCreateRecoveryDay(db: DbLike, runId: string, date: Date) {
  const existing = await db.programRunDay.findFirst({
    where: {
      programRunId: runId,
      scheduledDate: {
        gte: startOfDay(date).toDate(),
        lte: startOfDay(date).endOf("day").toDate(),
      },
      isRecoveryDay: true,
    },
    orderBy: { sequenceNumber: "asc" },
  });
  if (existing) return existing;

  const maxSequence = await db.programRunDay.aggregate({
    where: { programRunId: runId },
    _max: { sequenceNumber: true },
  });

  return db.programRunDay.create({
    data: {
      programRunId: runId,
      sequenceNumber: safeInt(maxSequence._max.sequenceNumber, 0) + 1,
      programDayNumber: null,
      scheduledDate: startOfDay(date).toDate(),
      status: "RECOVERY",
      isRecoveryDay: true,
    },
  });
}

export async function completeRunAction(
  db: DbLike,
  input: {
    runId: string;
    actionId: string;
    userId: string;
    note?: string | null;
    reflectionText?: string | null;
  },
) {
  const action = await db.programRunAction.findUnique({
    where: { id: input.actionId },
    include: { run: true },
  });
  if (!action || action.programRunId !== input.runId) throw new HttpError(404, "Action not found");
  if (isTerminalRunStatus(action.run.status)) throw new HttpError(400, "Run is not active");

  await db.programRunAction.update({
    where: { id: action.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completionNote: input.note ?? null,
      reflectionText: input.reflectionText ?? null,
    },
  });

  await db.programRunEvent.create({
    data: {
      programRunId: input.runId,
      userId: input.userId,
      eventType: "ACTION_COMPLETED",
      message: action.title,
      payloadJson: { actionId: action.id },
    },
  });

  await syncRunActionTask(db, action.id);
  await recomputeRunStats(db, input.runId);
}

export async function skipRunAction(
  db: DbLike,
  input: {
    runId: string;
    actionId: string;
    userId: string;
    note?: string | null;
  },
) {
  const action = await db.programRunAction.findUnique({
    where: { id: input.actionId },
    include: { run: true },
  });
  if (!action || action.programRunId !== input.runId) throw new HttpError(404, "Action not found");

  await db.programRunAction.update({
    where: { id: action.id },
    data: {
      status: "SKIPPED",
      skippedAt: new Date(),
      completionNote: input.note ?? null,
    },
  });

  await db.programRunEvent.create({
    data: {
      programRunId: input.runId,
      userId: input.userId,
      eventType: "ACTION_SKIPPED",
      message: action.title,
      payloadJson: { actionId: action.id },
    },
  });

  await syncRunActionTask(db, action.id);
  await recomputeRunStats(db, input.runId);
}

export async function rescheduleRunAction(
  db: DbLike,
  input: {
    runId: string;
    actionId: string;
    userId: string;
    targetDate: string;
    note?: string | null;
  },
) {
  const action = await db.programRunAction.findUnique({
    where: { id: input.actionId },
    include: { run: true },
  });
  if (!action || action.programRunId !== input.runId) throw new HttpError(404, "Action not found");

  const targetDate = startOfDay(input.targetDate).toDate();
  const recoveryDay = await findOrCreateRecoveryDay(db, input.runId, targetDate);

  await db.programRunAction.update({
    where: { id: action.id },
    data: {
      programRunDayId: recoveryDay.id,
      scheduledDate: targetDate,
      status: "RESCHEDULED",
      rescheduledToDate: targetDate,
      completionNote: input.note ?? null,
    },
  });

  await db.programRun.update({
    where: { id: input.runId },
    data: {
      rescheduledActionsCount: { increment: 1 },
    },
  });

  await db.programRunEvent.create({
    data: {
      programRunId: input.runId,
      userId: input.userId,
      eventType: "ACTION_RESCHEDULED",
      message: action.title,
      payloadJson: { actionId: action.id, targetDate: toDateKey(targetDate) },
    },
  });

  await syncRunActionTask(db, action.id);
  await recomputeRunStats(db, input.runId);
}

export async function pauseProgramRun(db: DbLike, runId: string, userId: string) {
  await db.programRun.update({
    where: { id: runId },
    data: {
      status: "PAUSED",
      pausedAt: new Date(),
    },
  });
  await syncRunLifecycleTasks(db, runId);
  await db.programRunEvent.create({
    data: {
      programRunId: runId,
      userId,
      eventType: "RUN_PAUSED",
    },
  });
}

export async function resumeProgramRun(db: DbLike, runId: string, userId: string) {
  await db.programRun.update({
    where: { id: runId },
    data: {
      status: "ACTIVE",
      resumedAt: new Date(),
      pausedAt: null,
    },
  });
  await markOverdueRunState(db, runId);
  await syncRunLifecycleTasks(db, runId);
  await recomputeRunStats(db, runId);
  await db.programRunEvent.create({
    data: {
      programRunId: runId,
      userId,
      eventType: "RUN_RESUMED",
    },
  });
}

export async function cancelProgramRun(db: DbLike, runId: string, userId: string, reason?: string | null) {
  await db.programRun.update({
    where: { id: runId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    },
  });
  await db.programRunAction.updateMany({
    where: {
      programRunId: runId,
      status: { in: ["PENDING", "RESCHEDULED", "MISSED"] },
    },
    data: {
      status: "CANCELLED",
    },
  });
  await syncRunLifecycleTasks(db, runId);
  await db.programRunEvent.create({
    data: {
      programRunId: runId,
      userId,
      eventType: "RUN_CANCELLED",
      payloadJson: { reason: reason ?? null },
    },
  });
}

export async function archiveProgramRun(db: DbLike, runId: string, userId: string) {
  await db.programRun.update({
    where: { id: runId },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
    },
  });
  await syncRunLifecycleTasks(db, runId);
  await db.programRunEvent.create({
    data: {
      programRunId: runId,
      userId,
      eventType: "RUN_ARCHIVED",
    },
  });
}

export async function softDeleteProgramRun(db: DbLike, runId: string, userId: string) {
  await db.programRun.update({
    where: { id: runId },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
    },
  });
  await syncRunLifecycleTasks(db, runId);
  await db.programRunEvent.create({
    data: {
      programRunId: runId,
      userId,
      eventType: "RUN_ARCHIVED",
      payloadJson: { softDelete: true },
    },
  });
}

export async function applyRunRecovery(
  db: DbLike,
  input: {
    runId: string;
    userId: string;
    resolution: "CONTINUE_CURRENT_DAY" | "SOFT_CATCH_UP" | "SHIFT_FORWARD" | "RECOVERY_DAY" | "SKIP_DAY" | "COMPLETE_AS_DONE" | "COMPLETE_PARTIAL";
    reasonText?: string | null;
    actionIds?: string[];
  },
) {
  const today = startOfDay().toDate();
  const missedActions = await db.programRunAction.findMany({
    where: {
      programRunId: input.runId,
      status: "MISSED",
    },
    orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
  });
  const missedDays = await db.programRunDay.findMany({
    where: {
      programRunId: input.runId,
      status: "MISSED",
    },
    orderBy: { sequenceNumber: "asc" },
  });

  if (!missedActions.length && !missedDays.length) {
    return { recovered: false };
  }

  if (input.resolution === "COMPLETE_AS_DONE") {
    for (const action of missedActions) {
      await db.programRunAction.update({
        where: { id: action.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await syncRunActionTask(db, action.id);
    }
  } else if (input.resolution === "COMPLETE_PARTIAL") {
    const selected = new Set(input.actionIds ?? []);
    for (const action of missedActions) {
      await db.programRunAction.update({
        where: { id: action.id },
        data: {
          status: selected.has(action.id) ? "COMPLETED" : "SKIPPED",
          completedAt: selected.has(action.id) ? new Date() : null,
          skippedAt: selected.has(action.id) ? null : new Date(),
        },
      });
      await syncRunActionTask(db, action.id);
    }
  } else if (input.resolution === "SOFT_CATCH_UP" || input.resolution === "RECOVERY_DAY") {
    const recoveryDay = await findOrCreateRecoveryDay(db, input.runId, today);
    for (const action of missedActions) {
      await db.programRunAction.update({
        where: { id: action.id },
        data: {
          programRunDayId: recoveryDay.id,
          scheduledDate: today,
          status: "RESCHEDULED",
          rescheduledToDate: today,
        },
      });
      await syncRunActionTask(db, action.id);
    }
  } else if (input.resolution === "SHIFT_FORWARD") {
    const shiftBy = Math.max(1, missedDays.length);
    const futureDays = await db.programRunDay.findMany({
      where: {
        programRunId: input.runId,
        scheduledDate: { gte: today },
      },
    });
    for (const day of futureDays) {
      await db.programRunDay.update({
        where: { id: day.id },
        data: {
          scheduledDate: addDays(day.scheduledDate, shiftBy),
        },
      });
    }
    const futureActions = await db.programRunAction.findMany({
      where: {
        programRunId: input.runId,
        scheduledDate: { gte: today },
      },
    });
    for (const action of futureActions) {
      await db.programRunAction.update({
        where: { id: action.id },
        data: {
          scheduledDate: addDays(action.scheduledDate, shiftBy),
          rescheduledToDate: addDays(action.scheduledDate, shiftBy),
          status: ["COMPLETED", "SKIPPED", "CANCELLED"].includes(action.status) ? action.status : "RESCHEDULED",
        },
      });
      await syncRunActionTask(db, action.id);
    }
  } else if (input.resolution === "SKIP_DAY" || input.resolution === "CONTINUE_CURRENT_DAY") {
    for (const action of missedActions) {
      await db.programRunAction.update({
        where: { id: action.id },
        data: {
          status: input.resolution === "SKIP_DAY" ? "SKIPPED" : "MISSED",
          skippedAt: input.resolution === "SKIP_DAY" ? new Date() : action.skippedAt,
        },
      });
      await syncRunActionTask(db, action.id);
    }
  }

  for (const day of missedDays) {
    await db.programRunDay.update({
      where: { id: day.id },
      data: {
        status: input.resolution === "COMPLETE_AS_DONE" ? "COMPLETED" : input.resolution === "SKIP_DAY" ? "SKIPPED" : "ARCHIVED",
      },
    });
  }

  await db.programRecoveryEvent.create({
    data: {
      programRunId: input.runId,
      programRunDayId: missedDays[0]?.id ?? null,
      userId: input.userId,
      resolution: input.resolution,
      reasonText: input.reasonText ?? null,
      detailsJson: {
        affectedActionIds: missedActions.map((action) => action.id),
        affectedDayIds: missedDays.map((day) => day.id),
      },
    },
  });

  await db.programRun.update({
    where: { id: input.runId },
    data: {
      lastRecoveredAt: new Date(),
    },
  });

  const updated = await recomputeRunStats(db, input.runId);
  await maybeAwardRunAchievements(db, {
    runId: input.runId,
    userId: input.userId,
    completionPercent: updated.completionPercent,
    adherenceScore: updated.adherenceScore,
    streakCount: updated.streakCount,
    recovered: true,
    collaborative: Boolean(updated.sessionId),
    sessionId: updated.sessionId,
  });

  return { recovered: true };
}

export async function syncProgramActionFromTask(
  db: DbLike,
  input: {
    taskId: string;
    completed: boolean;
  },
) {
  const link = await db.programTaskLink.findUnique({
    where: { taskId: input.taskId },
    include: {
      action: true,
      run: true,
    },
  });
  if (!link) return null;

  await db.programRunAction.update({
    where: { id: link.programRunActionId },
    data: {
      status: input.completed ? "COMPLETED" : "PENDING",
      completedAt: input.completed ? new Date() : null,
    },
  });

  await db.programRunEvent.create({
    data: {
      programRunId: link.programRunId,
      userId: link.run.userId,
      eventType: input.completed ? "ACTION_COMPLETED" : "ACTION_RESCHEDULED",
      message: link.action.title,
      payloadJson: { viaTask: true, taskId: input.taskId },
    },
  });

  await recomputeRunStats(db, link.programRunId);
  return link;
}

export async function hydrateRunActionsFromLinkedTasks(db: DbLike, runId: string) {
  const links = await db.programTaskLink.findMany({
    where: { programRunId: runId },
    include: {
      task: {
        select: {
          id: true,
          completed: true,
          deletedAt: true,
        },
      },
      action: {
        select: {
          id: true,
          status: true,
          completedAt: true,
        },
      },
    },
  });

  let touched = false;
  for (const link of links) {
    if (!link.task || link.task.deletedAt) continue;

    if (link.task.completed && link.action.status !== "COMPLETED") {
      await db.programRunAction.update({
        where: { id: link.programRunActionId },
        data: {
          status: "COMPLETED",
          completedAt: link.action.completedAt ?? new Date(),
        },
      });
      touched = true;
      continue;
    }

    if (!link.task.completed && link.action.status === "COMPLETED") {
      await db.programRunAction.update({
        where: { id: link.programRunActionId },
        data: {
          status: "PENDING",
          completedAt: null,
        },
      });
      touched = true;
    }
  }

  return touched;
}

function serializeAction(action: any) {
  return {
    id: action.id,
    dayId: action.programRunDayId,
    title: action.title,
    description: action.description,
    actionType: action.actionType,
    integrationType: action.integrationType,
    required: action.required,
    estimatedMinutes: action.estimatedMinutes,
    completionPolicy: action.completionPolicy,
    reschedulePolicy: action.reschedulePolicy,
    payloadJson: action.payloadJson,
    status: action.status,
    scheduledDate: action.scheduledDate,
    completedAt: action.completedAt,
    skippedAt: action.skippedAt,
    rescheduledToDate: action.rescheduledToDate,
    reflectionText: action.reflectionText,
    openPath: getActionOpenPath(action),
  };
}

function serializeDay(day: any) {
  return {
    id: day.id,
    sequenceNumber: day.sequenceNumber,
    programDayNumber: day.programDayNumber,
    scheduledDate: day.scheduledDate,
    status: day.status,
    isRecoveryDay: day.isRecoveryDay,
    requiredCount: day.requiredCount,
    optionalCount: day.optionalCount,
    completedRequiredCount: day.completedRequiredCount,
    completedOptionalCount: day.completedOptionalCount,
    stage: day.stage
      ? {
          id: day.stage.id,
          title: day.stage.title,
          description: day.stage.description,
          milestoneText: day.stage.milestoneText,
        }
      : null,
    dayTemplate: day.dayTemplate
      ? {
          id: day.dayTemplate.id,
          title: day.dayTemplate.title,
          dayText: day.dayTemplate.dayText,
          tipOfDay: day.dayTemplate.tipOfDay,
          motivationOfDay: day.dayTemplate.motivationOfDay,
          reflectionPrompt: day.dayTemplate.reflectionPrompt,
        }
      : null,
    actions: Array.isArray(day.actions) ? day.actions.map(serializeAction) : [],
  };
}

function serializeMemberRun(run: any) {
  if (!run) return null;
  const todayDay =
    run.days?.find((day: any) => ["ACTIVE", "RECOVERY"].includes(day.status)) ??
    run.days?.find((day: any) => day.status === "UPCOMING") ??
    null;
  const completedToday = (todayDay?.actions ?? [])
    .filter((action: any) => action.status === "COMPLETED")
    .slice(0, 3)
    .map((action: any) => ({
      id: action.id,
      title: action.title,
      status: action.status,
    }));

  return {
    id: run.id,
    status: run.status,
    completionPercent: run.completionPercent,
    adherenceScore: run.adherenceScore,
    consistencyScore: run.consistencyScore,
    streakCount: run.streakCount,
    missedDaysCount: run.missedDaysCount,
    today: todayDay
      ? {
          dayNumber: todayDay.programDayNumber ?? todayDay.sequenceNumber,
          stageTitle: todayDay.stage?.title ?? run.currentStage?.title ?? null,
          totalTodayCount: todayDay.actions?.length ?? 0,
          completedTodayCount: todayDay.actions?.filter((action: any) => action.status === "COMPLETED").length ?? 0,
          requiredPendingCount:
            todayDay.actions?.filter((action: any) => action.required && !["COMPLETED", "SKIPPED"].includes(action.status)).length ?? 0,
          completedToday,
        }
      : null,
  };
}

export async function getRunDetail(runId: string) {
  await ensureRunHorizon(prisma, runId);
  await markOverdueRunState(prisma, runId);
  await hydrateRunActionsFromLinkedTasks(prisma, runId);
  const run = await recomputeRunStats(prisma, runId);

  const full = await prisma.programRun.findUnique({
    where: { id: run.id },
    include: {
      programDefinition: {
        include: {
          owner: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
      programVersion: true,
      currentStage: true,
      days: {
        orderBy: { sequenceNumber: "asc" },
        include: {
          stage: true,
          dayTemplate: true,
          actions: { orderBy: { order: "asc" } },
        },
      },
      session: {
        include: {
          host: { select: { id: true, username: true, avatarUrl: true } },
          members: {
            include: {
              user: { select: { id: true, username: true, avatarUrl: true } },
              run: {
                include: {
                  currentStage: true,
                  days: {
                    where: {
                      status: { in: ["ACTIVE", "RECOVERY", "UPCOMING"] },
                    },
                    orderBy: { sequenceNumber: "asc" },
                    take: 1,
                    include: {
                      stage: true,
                      actions: {
                        orderBy: { order: "asc" },
                        select: {
                          id: true,
                          title: true,
                          status: true,
                          required: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      recoveryEvents: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!full) throw new HttpError(404, "Run not found");

  const todayKey = toDateKey(new Date());
  const todayDay = full.days.find((day) => toDateKey(day.scheduledDate) === todayKey) ??
    full.days.find((day) => ["ACTIVE", "RECOVERY"].includes(day.status)) ??
    full.days.find((day) => ["UPCOMING", "MISSED"].includes(day.status)) ??
    full.days[full.days.length - 1];
  const historyDays = full.days.slice(Math.max(full.days.length - 14, 0));
  const missedDays = full.days.filter((day) => day.status === "MISSED");

  return {
    run: {
      id: full.id,
      status: full.status,
      startedAt: full.startedAt,
      startDate: full.startDate,
      pausedAt: full.pausedAt,
      resumedAt: full.resumedAt,
      completedAt: full.completedAt,
      cancelledAt: full.cancelledAt,
      archivedAt: full.archivedAt,
      currentDayNumber: full.currentDayNumber,
      currentStageId: full.currentStageId,
      completionPercent: full.completionPercent,
      adherenceScore: full.adherenceScore,
      consistencyScore: full.consistencyScore,
      streakCount: full.streakCount,
      missedDaysCount: full.missedDaysCount,
      skippedActionsCount: full.skippedActionsCount,
      rescheduledActionsCount: full.rescheduledActionsCount,
      stageCompletionPercent: full.stageCompletionPercent,
      milestonesEarnedCount: full.milestonesEarnedCount,
      program: {
        id: full.programDefinition.id,
        title: full.programVersion.title,
        description: full.programVersion.description,
        category: full.programVersion.category,
        theme: full.programVersion.theme,
        language: full.programVersion.language,
        coverUrl: full.programVersion.coverUrl,
        accessMode: full.programVersion.accessMode,
        structureType: full.programVersion.structureType,
        durationDays: full.programVersion.durationDays,
        collaborativeEnabled: full.programVersion.collaborativeEnabled,
        owner: full.programDefinition.owner,
      },
      currentStage: full.currentStage
        ? {
            id: full.currentStage.id,
            title: full.currentStage.title,
            description: full.currentStage.description,
            milestoneText: full.currentStage.milestoneText,
          }
        : null,
    },
    summary: {
      completion: full.completionPercent,
      adherence: full.adherenceScore,
      consistency: full.consistencyScore,
      streak: full.streakCount,
      missedDays: full.missedDaysCount,
      skippedActions: full.skippedActionsCount,
      rescheduledActions: full.rescheduledActionsCount,
      stageCompletion: full.stageCompletionPercent,
      milestones: full.milestonesEarnedCount,
    },
    today: todayDay ? serializeDay(todayDay) : null,
    history: historyDays.map(serializeDay),
    recovery: {
      needed: missedDays.length > 0,
      missedDays: missedDays.map(serializeDay),
      options: [
        "CONTINUE_CURRENT_DAY",
        "SOFT_CATCH_UP",
        "SHIFT_FORWARD",
        "RECOVERY_DAY",
        "SKIP_DAY",
        "COMPLETE_AS_DONE",
        "COMPLETE_PARTIAL",
      ],
    },
    session: full.session
      ? {
          id: full.session.id,
          title: full.session.title,
          status: full.session.status,
          host: full.session.host,
          shareStatus: full.session.shareStatus,
          shareNumbers: full.session.shareNumbers,
          shareMisses: full.session.shareMisses,
          shareMilestones: full.session.shareMilestones,
          members: full.session.members.map((member) => ({
            id: member.id,
            userId: member.userId,
            status: member.status,
            role: member.role,
            shareStatus: member.shareStatus,
            shareNumbers: member.shareNumbers,
            shareMisses: member.shareMisses,
            shareMilestones: member.shareMilestones,
            joinedAt: member.joinedAt,
            user: member.user,
            run: serializeMemberRun(member.run),
          })),
        }
      : null,
    events: full.events,
    recoveryEvents: full.recoveryEvents,
  };
}

export async function listTodayProgramActions(userId: string) {
  const activeRuns = await prisma.programRun.findMany({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });

  for (const run of activeRuns) {
    await ensureRunHorizon(prisma, run.id);
    await markOverdueRunState(prisma, run.id);
    await hydrateRunActionsFromLinkedTasks(prisma, run.id);
    await recomputeRunStats(prisma, run.id);
  }

  const today = startOfDay();
  const tomorrow = today.add(1, "day");
  const actions = await prisma.programRunAction.findMany({
    where: {
      run: {
        userId,
        status: "ACTIVE",
        deletedAt: null,
      },
      scheduledDate: {
        gte: today.toDate(),
        lt: tomorrow.toDate(),
      },
      status: { in: ["PENDING", "RESCHEDULED", "MISSED"] },
    },
    orderBy: [{ required: "desc" }, { scheduledDate: "asc" }, { order: "asc" }],
    include: {
      run: {
        include: {
          programVersion: true,
          programDefinition: true,
        },
      },
      day: {
        include: {
          stage: true,
          dayTemplate: true,
        },
      },
    },
  });

  const runIds = Array.from(new Set(actions.map((action) => action.programRunId)));
  const missedDays = await prisma.programRunDay.findMany({
    where: {
      programRunId: { in: runIds },
      status: "MISSED",
    },
    orderBy: [{ scheduledDate: "asc" }, { sequenceNumber: "asc" }],
  });

  return {
    items: actions.map((action) => ({
      ...serializeAction(action),
      runId: action.programRunId,
      runStatus: action.run.status,
      programTitle: action.run.programVersion.title,
      programId: action.run.programDefinitionId,
      category: action.run.programVersion.category,
      stageTitle: action.day.stage?.title ?? null,
      dayNumber: action.day.sequenceNumber,
    })),
    recoveryRuns: Array.from(new Set(missedDays.map((day) => day.programRunId))),
  };
}
