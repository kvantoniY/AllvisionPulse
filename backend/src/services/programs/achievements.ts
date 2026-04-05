import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { makeAchievementKey, toPrismaNullableJson } from "./helpers";

type DbLike = PrismaClient | Prisma.TransactionClient;

const DEFAULT_DEFINITIONS = [
  {
    slug: "pulse_program_completed",
    kind: "PROGRAM_COMPLETION",
    title: "Программа завершена",
    description: "Вы завершили программу Pulse.",
    iconKey: "target",
    badgeTone: "success",
  },
  {
    slug: "pulse_stage_completed",
    kind: "STAGE_COMPLETION",
    title: "Этап завершён",
    description: "Вы завершили один из этапов программы.",
    iconKey: "calendar",
    badgeTone: "accent",
  },
  {
    slug: "pulse_milestone_reached",
    kind: "MILESTONE",
    title: "Майлстоун достигнут",
    description: "Вы достигли важной точки в программе.",
    iconKey: "spark",
    badgeTone: "accent",
  },
  {
    slug: "pulse_streak_7",
    kind: "STREAK",
    title: "Серия 7 дней",
    description: "Вы держали серию целую неделю.",
    iconKey: "trend",
    badgeTone: "success",
    metricThreshold: 7,
  },
  {
    slug: "pulse_high_adherence",
    kind: "ADHERENCE",
    title: "Высокое следование",
    description: "Вы держали сильный уровень следования программе.",
    iconKey: "pulse",
    badgeTone: "success",
    metricThreshold: 85,
  },
  {
    slug: "pulse_recovery_return",
    kind: "RECOVERY",
    title: "Мягкий возврат",
    description: "Вы вернулись после пропусков и продолжили путь.",
    iconKey: "heart",
    badgeTone: "warning",
  },
  {
    slug: "pulse_collaborative_joined",
    kind: "COLLABORATIVE",
    title: "Командный старт",
    description: "Вы присоединились к совместному прохождению.",
    iconKey: "users",
    badgeTone: "accent",
  },
  {
    slug: "pulse_team_completion",
    kind: "TEAM_COMPLETION",
    title: "Командное завершение",
    description: "Ваша совместная сессия дошла до финиша вместе.",
    iconKey: "check",
    badgeTone: "success",
  },
];

export async function ensureAchievementDefinitions(db: DbLike = prisma) {
  for (const definition of DEFAULT_DEFINITIONS) {
    await db.achievementDefinition.upsert({
      where: { slug: definition.slug },
      create: {
        slug: definition.slug,
        domain: "PULSE",
        kind: definition.kind as any,
        title: definition.title,
        description: definition.description,
        iconKey: definition.iconKey,
        badgeTone: definition.badgeTone,
        metricThreshold: definition.metricThreshold ?? null,
      },
      update: {
        title: definition.title,
        description: definition.description,
        iconKey: definition.iconKey,
        badgeTone: definition.badgeTone,
        metricThreshold: definition.metricThreshold ?? null,
      },
    });
  }
}

export async function awardPulseAchievement(
  db: DbLike,
  input: {
    userId: string;
    slug: string;
    sourceType: string;
    sourceId?: string | null;
    programRunId?: string | null;
    programSessionId?: string | null;
    shareArtifactId?: string | null;
    titleSnapshot?: string | null;
    descriptionSnapshot?: string | null;
    progressValue?: number | null;
    progressMax?: number | null;
    resultJson?: Record<string, unknown> | null;
  },
) {
  await ensureAchievementDefinitions(db);
  const definition = await db.achievementDefinition.findUnique({ where: { slug: input.slug } });
  if (!definition) return null;

  const uniqueKey = makeAchievementKey([
    input.userId,
    input.slug,
    input.sourceType,
    input.sourceId ?? input.programRunId ?? input.programSessionId ?? "global",
  ]);

  return db.userAchievement.upsert({
    where: { uniqueKey },
    create: {
      userId: input.userId,
      achievementDefinitionId: definition.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      programRunId: input.programRunId ?? null,
      programSessionId: input.programSessionId ?? null,
      shareArtifactId: input.shareArtifactId ?? null,
      titleSnapshot: input.titleSnapshot ?? definition.title,
      descriptionSnapshot: input.descriptionSnapshot ?? definition.description,
      uniqueKey,
      progressValue: input.progressValue ?? null,
      progressMax: input.progressMax ?? null,
      resultJson: toPrismaNullableJson(input.resultJson),
    },
    update: {
      titleSnapshot: input.titleSnapshot ?? definition.title,
      descriptionSnapshot: input.descriptionSnapshot ?? definition.description,
      progressValue: input.progressValue ?? null,
      progressMax: input.progressMax ?? null,
      resultJson: toPrismaNullableJson(input.resultJson),
    },
    include: {
      definition: true,
    },
  });
}

export async function listPulseAchievementsForUser(viewerId: string, targetUserId: string) {
  const [privacy, items] = await Promise.all([
    prisma.userPrivacy.findUnique({ where: { userId: targetUserId } }),
    prisma.userAchievement.findMany({
      where: { userId: targetUserId },
      orderBy: { awardedAt: "desc" },
      include: {
        definition: true,
      },
    }),
  ]);

  const canView = viewerId === targetUserId || Boolean(privacy?.showPulseAchievements);
  return {
    canView,
    items: canView ? items : [],
  };
}

export async function maybeAwardRunAchievements(
  db: DbLike,
  input: {
    runId: string;
    userId: string;
    completionPercent: number;
    adherenceScore: number;
    streakCount: number;
    currentStageId?: string | null;
    programTitle?: string | null;
    stageTitle?: string | null;
    completed?: boolean;
    recovered?: boolean;
    collaborative?: boolean;
    sessionId?: string | null;
  },
) {
  const awards = [] as Array<any>;

  if (input.streakCount >= 7) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_streak_7",
      sourceType: "PROGRAM_RUN",
      sourceId: input.runId,
      programRunId: input.runId,
      titleSnapshot: "Серия 7 дней",
      descriptionSnapshot: input.programTitle ? `Серия в программе «${input.programTitle}».` : undefined,
      progressValue: input.streakCount,
      progressMax: 7,
    });
    if (award) awards.push(award);
  }

  if (input.adherenceScore >= 85) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_high_adherence",
      sourceType: "PROGRAM_RUN",
      sourceId: input.runId,
      programRunId: input.runId,
      progressValue: input.adherenceScore,
      progressMax: 100,
      titleSnapshot: "Высокое следование",
      descriptionSnapshot: input.programTitle ? `Следование в программе «${input.programTitle}» остаётся высоким.` : undefined,
    });
    if (award) awards.push(award);
  }

  if (input.recovered) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_recovery_return",
      sourceType: "PROGRAM_RECOVERY",
      sourceId: input.runId,
      programRunId: input.runId,
      titleSnapshot: "Мягкий возврат",
      descriptionSnapshot: input.programTitle ? `Вы вернулись к программе «${input.programTitle}».` : undefined,
    });
    if (award) awards.push(award);
  }

  if (input.collaborative) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_collaborative_joined",
      sourceType: "PROGRAM_SESSION",
      sourceId: input.sessionId ?? input.runId,
      programRunId: input.runId,
      programSessionId: input.sessionId ?? null,
      titleSnapshot: "Командный старт",
      descriptionSnapshot: input.programTitle ? `Вы начали программу «${input.programTitle}» вместе.` : undefined,
    });
    if (award) awards.push(award);
  }

  if (input.currentStageId && input.stageTitle) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_stage_completed",
      sourceType: "PROGRAM_STAGE",
      sourceId: input.currentStageId,
      programRunId: input.runId,
      titleSnapshot: input.stageTitle,
      descriptionSnapshot: input.programTitle ? `Этап программы «${input.programTitle}» завершён.` : undefined,
    });
    if (award) awards.push(award);
  }

  if (input.completed) {
    const award = await awardPulseAchievement(db, {
      userId: input.userId,
      slug: "pulse_program_completed",
      sourceType: "PROGRAM_RUN",
      sourceId: input.runId,
      programRunId: input.runId,
      programSessionId: input.sessionId ?? null,
      titleSnapshot: input.programTitle ?? "Программа завершена",
      descriptionSnapshot: input.programTitle ? `Вы завершили программу «${input.programTitle}».` : undefined,
      progressValue: input.completionPercent,
      progressMax: 100,
    });
    if (award) awards.push(award);
  }

  return awards;
}
