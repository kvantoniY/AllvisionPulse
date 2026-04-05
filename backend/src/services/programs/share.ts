import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";
import type { ViewerContext } from "./helpers";
import { makeInviteToken, toPrismaNullableJson } from "./helpers";

type ShareSourceType =
  | "PROGRAM"
  | "PROGRAM_RUN"
  | "PROGRAM_SESSION"
  | "TODAY_ACTIONS"
  | "ACHIEVEMENT"
  | "SESSION_INVITE";

export type CreateShareInput = {
  ownerId: string;
  sourceType: ShareSourceType;
  sourceId?: string | null;
  kind: "WIDGET" | "METRIC" | "PROGRAM" | "PROGRAM_INVITE" | "SESSION_INVITE" | "PROGRAM_SUMMARY" | "PROGRAM_PROGRESS" | "ACHIEVEMENT" | "TODAY_ACTIONS";
  mode: "SNAPSHOT" | "REFERENCE" | "INVITE";
  visibilityScope?: "PRIVATE" | "RESTRICTED" | "PUBLIC";
  title?: string | null;
  description?: string | null;
  explicitPublicShare?: boolean;
};

function sessionStatusLabel(value: string) {
  if (value === "ACTIVE") return "Активна";
  if (value === "SCHEDULED") return "Запланирована";
  if (value === "COMPLETED") return "Завершена";
  if (value === "CANCELLED") return "Отменена";
  if (value === "ARCHIVED") return "В архиве";
  return "Черновик";
}

function joinModeLabel(value: string) {
  if (value === "LINK") return "По ссылке";
  if (value === "OPEN") return "Открытая";
  return "По приглашению";
}

function startModeLabel(value: string) {
  if (value === "NOW") return "Сразу";
  if (value === "SCHEDULED") return "По расписанию";
  if (value === "AUTO_ON_ACCEPT") return "Автостарт";
  return "Стартует хост";
}

function buildProgramSnapshot(program: any) {
  return {
    label: "Программа",
    title: program.title,
    description: program.description,
    primary: program.durationDays ? `${program.durationDays} дн.` : "Без срока",
    secondary: [program.category, program.theme].filter(Boolean).join(" | "),
  };
}

function buildRunSnapshot(run: any) {
  return {
    label: "Прогресс программы",
    title: run.programVersion.title,
    description: run.programVersion.description,
    primary: `${run.completionPercent}%`,
    secondary: `Серия ${run.streakCount} | следование ${run.adherenceScore}%`,
    stats: {
      completion: run.completionPercent,
      adherence: run.adherenceScore,
      consistency: run.consistencyScore,
      streak: run.streakCount,
    },
  };
}

function buildAchievementSnapshot(achievement: any) {
  return {
    label: "Достижение",
    title: achievement.titleSnapshot ?? achievement.definition.title,
    description: achievement.descriptionSnapshot ?? achievement.definition.description,
    primary:
      achievement.progressValue != null && achievement.progressMax != null
        ? `${achievement.progressValue}/${achievement.progressMax}`
        : "Получено",
    secondary: achievement.definition.kind,
  };
}

function buildTodayActionsSnapshot(actions: any[]) {
  return {
    label: "Сегодня по программам",
    title: `Действий: ${actions.length}`,
    description: actions.slice(0, 3).map((action) => action.title).join(" | "),
    primary: `${actions.filter((action) => action.required).length} обязательных`,
    secondary: actions.length > 3 ? `Еще ${actions.length - 3}` : "Без хвоста",
  };
}

function buildSessionSnapshot(session: any) {
  return {
    label: "Приглашение",
    title: session.title ?? session.programVersion.title,
    description: "Совместное прохождение",
    primary: sessionStatusLabel(session.status),
    secondary: [joinModeLabel(session.joinMode), startModeLabel(session.startMode)].filter(Boolean).join(" | "),
  };
}

async function loadShareSource(input: CreateShareInput) {
  if (input.sourceType === "PROGRAM") {
    const definition = await prisma.programDefinition.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { currentVersion: true },
    });
    if (!definition || !definition.currentVersion) throw new HttpError(404, "Program not found");
    if (input.mode === "INVITE" && definition.accessMode === "PRIVATE") {
      throw new HttpError(400, "Приватную программу нельзя приглашать по ссылке");
    }
    return {
      title: input.mode === "INVITE" ? `Приглашение: ${definition.currentVersion.title}` : definition.currentVersion.title,
      description: input.mode === "INVITE" ? "Ссылка даст доступ к программе внутри Pulse" : definition.currentVersion.description,
      containsSensitiveData: false,
      snapshot: buildProgramSnapshot(definition.currentVersion),
      referenceJson: { programId: definition.id, versionId: definition.currentVersionId },
    };
  }

  if (input.sourceType === "PROGRAM_RUN") {
    const run = await prisma.programRun.findUnique({
      where: { id: input.sourceId ?? "" },
      include: {
        programVersion: true,
      },
    });
    if (!run) throw new HttpError(404, "Run not found");
    return {
      title: run.programVersion.title,
      description: run.programVersion.description,
      containsSensitiveData: true,
      snapshot: buildRunSnapshot(run),
      referenceJson: { runId: run.id, programId: run.programDefinitionId },
    };
  }

  if (input.sourceType === "PROGRAM_SESSION") {
    const session = await prisma.programSession.findUnique({
      where: { id: input.sourceId ?? "" },
      include: {
        programVersion: true,
      },
    });
    if (!session) throw new HttpError(404, "Session not found");

    const inviteToken = session.inviteLinkToken ?? makeInviteToken();
    if (!session.inviteLinkToken) {
      await prisma.programSession.update({
        where: { id: session.id },
        data: {
          inviteLinkToken: inviteToken,
          joinMode: session.joinMode === "INVITE_ONLY" ? "LINK" : session.joinMode,
        },
      });
    }

    return {
      title: session.title ?? session.programVersion.title,
      description: "Приглашение в совместную программу",
      containsSensitiveData: false,
      snapshot: buildSessionSnapshot(session),
      referenceJson: {
        sessionId: session.id,
        inviteToken,
      },
    };
  }

  if (input.sourceType === "ACHIEVEMENT") {
    const achievement = await prisma.userAchievement.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { definition: true },
    });
    if (!achievement) throw new HttpError(404, "Achievement not found");
    return {
      title: achievement.titleSnapshot ?? achievement.definition.title,
      description: achievement.descriptionSnapshot ?? achievement.definition.description,
      containsSensitiveData: false,
      snapshot: buildAchievementSnapshot(achievement),
      referenceJson: { achievementId: achievement.id, userId: achievement.userId },
    };
  }

  if (input.sourceType === "TODAY_ACTIONS") {
    const actions = await prisma.programRunAction.findMany({
      where: {
        run: {
          userId: input.ownerId,
          status: "ACTIVE",
          deletedAt: null,
        },
      },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      take: 12,
    });
    return {
      title: "Сегодня по программам",
      description: actions.slice(0, 3).map((action) => action.title).join(" | "),
      containsSensitiveData: true,
      snapshot: buildTodayActionsSnapshot(actions),
      referenceJson: { ownerId: input.ownerId, kind: "todayActions" },
    };
  }

  if (input.sourceType === "SESSION_INVITE") {
    const invite = await prisma.programSessionInvite.findUnique({
      where: { id: input.sourceId ?? "" },
      include: {
        session: { include: { programVersion: true } },
      },
    });
    if (!invite) throw new HttpError(404, "Invite not found");
    return {
      title: invite.session.programVersion.title,
      description: "Приглашение в совместную программу",
      containsSensitiveData: false,
      snapshot: {
        label: "Приглашение",
        title: invite.session.programVersion.title,
        description: "Совместное прохождение",
        primary: joinModeLabel(invite.session.joinMode),
        secondary: startModeLabel(invite.session.startMode),
      },
      referenceJson: { inviteId: invite.id, sessionId: invite.programSessionId },
    };
  }

  throw new HttpError(400, "Unsupported share source");
}

export async function createShareArtifact(input: CreateShareInput) {
  const source = await loadShareSource(input);
  if (source.containsSensitiveData && input.visibilityScope === "PUBLIC" && !input.explicitPublicShare) {
    throw new HttpError(400, "Sensitive data requires explicit public share confirmation");
  }

  const inviteToken = input.mode === "INVITE" ? makeInviteToken() : undefined;
  const referenceJson =
    input.mode === "INVITE" && input.sourceType === "PROGRAM"
      ? {
          ...(source.referenceJson ?? {}),
          inviteToken,
          inviteType: "PROGRAM",
        }
      : input.mode === "INVITE" && input.sourceType === "PROGRAM_SESSION"
        ? {
            ...(source.referenceJson ?? {}),
            inviteType: "SESSION",
          }
        : source.referenceJson;

  return prisma.pulseShareArtifact.create({
    data: {
      ownerId: input.ownerId,
      kind: input.kind as any,
      mode: input.mode as any,
      title: input.title ?? source.title,
      description: input.description ?? source.description ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      snapshotJson: toPrismaNullableJson(source.snapshot),
      referenceJson: toPrismaNullableJson(referenceJson),
      inviteToken,
      visibilityScope: (input.visibilityScope ?? "PRIVATE") as any,
      containsSensitiveData: source.containsSensitiveData,
      allowPublicReference: !source.containsSensitiveData,
    },
  });
}

export async function listRecentShareArtifacts(ownerId: string, limit = 20) {
  return prisma.pulseShareArtifact.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function resolveShareArtifact(artifactId: string, viewer?: ViewerContext | null) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) throw new HttpError(404, "Share artifact not found");

  const canView =
    viewer?.role === "ADMIN" ||
    viewer?.id === artifact.ownerId ||
    artifact.visibilityScope === "PUBLIC" ||
    (artifact.visibilityScope === "RESTRICTED" && Boolean(viewer));
  if (!canView) throw new HttpError(403, "Forbidden");

  let resolved = artifact.snapshotJson as any;

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "PROGRAM_RUN" && artifact.sourceId) {
    const run = await prisma.programRun.findUnique({
      where: { id: artifact.sourceId },
      include: { programVersion: true },
    });
    if (run) resolved = buildRunSnapshot(run);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "PROGRAM" && artifact.sourceId) {
    const program = await prisma.programDefinition.findUnique({
      where: { id: artifact.sourceId },
      include: { currentVersion: true },
    });
    if (program?.currentVersion) resolved = buildProgramSnapshot(program.currentVersion);
  }

  return {
    ...artifact,
    resolvedSnapshot: resolved,
  };
}

export async function listVisibleShareArtifactsForViewer(ownerId: string, viewer: ViewerContext) {
  const items = await prisma.pulseShareArtifact.findMany({
    where: {
      ownerId,
      OR: [
        { visibilityScope: "PUBLIC" },
        { ownerId: viewer.id },
        { visibilityScope: "RESTRICTED" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return items.filter((artifact) => artifact.visibilityScope !== "PRIVATE" || artifact.ownerId === viewer.id);
}
