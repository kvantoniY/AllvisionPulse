import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireActiveUser, AuthedRequest } from "../middleware/auth";
import { isProgramTaskSourceKey, toPrismaNullableJson } from "../services/programs/helpers";
import { syncProgramActionFromTask } from "../services/programs/runtime";
import {
  isArtifactTaskSourceKey,
  resolveShareArtifact,
  syncArtifactStateFromLinkedFinance,
  syncArtifactStateFromTask,
  unlinkArtifactLinkedFinance,
  unlinkArtifactLinkedTask,
} from "../services/shareArtifacts";

const router = Router();
router.use(requireAuth, requireActiveUser);

function emitShareArtifactRealtime(req: AuthedRequest, targets: Array<{ artifactId: string; originChatId?: string | null; ownerId: string; userId: string }>) {
  const emitter = req.app.locals.emitter as any;
  const uniqueTargets = new Map<string, { artifactId: string; originChatId?: string | null; ownerId: string; userId: string }>();
  for (const target of targets) {
    uniqueTargets.set(`${target.artifactId}:${target.userId}`, target);
  }

  for (const target of uniqueTargets.values()) {
    if (target.originChatId) {
      emitter?.emitToChat(target.originChatId, "share-artifact:updated", {
        artifactId: target.artifactId,
        chatId: target.originChatId,
        at: new Date().toISOString(),
      });
    }

    for (const userId of Array.from(new Set([target.ownerId, target.userId].filter(Boolean)))) {
      emitter?.emitToUser(userId, "share-artifact:updated", {
        artifactId: target.artifactId,
        chatId: target.originChatId ?? null,
        at: new Date().toISOString(),
      });
    }
  }
}

async function enrichFinanceEntitiesWithShareMeta(
  userId: string,
  role: string,
  debts: any[],
  goals: any[],
) {
  const debtIds = debts.map((item) => item.id);
  const goalIds = goals.map((item) => item.id);
  if (!debtIds.length && !goalIds.length) {
    return { debts, goals };
  }

  const acceptances = await prisma.pulseArtifactAcceptance.findMany({
    where: {
      userId,
      OR: [
        debtIds.length ? { debtId: { in: debtIds } } : undefined,
        goalIds.length ? { savingsGoalId: { in: goalIds } } : undefined,
      ].filter(Boolean) as any,
    },
    select: {
      artifactId: true,
      debtId: true,
      savingsGoalId: true,
    },
  });

  if (!acceptances.length) {
    return { debts, goals };
  }

  const resolvedArtifacts = new Map<string, any>();
  await Promise.all(
    Array.from(new Set(acceptances.map((item) => item.artifactId))).map(async (artifactId) => {
      const artifact = await resolveShareArtifact(artifactId, { id: userId, role } as any).catch(() => null);
      if (artifact) resolvedArtifacts.set(artifactId, artifact);
    }),
  );

  const buildShareMeta = (artifact: any) => {
    const snapshot = (artifact?.resolvedSnapshot ?? {}) as Record<string, any>;
    return {
      artifactId: artifact.id,
      title: artifact.title ?? null,
      actionType: artifact.actionType ?? null,
      originChatId: artifact.originChatId ?? null,
      openRoute: artifact.openRoute ?? null,
      sharingScope: typeof snapshot.sharingScope === "string" ? snapshot.sharingScope : null,
      progressPercent: typeof snapshot.progressPercent === "number" ? snapshot.progressPercent : null,
      progressLabel: typeof snapshot.progressLabel === "string" ? snapshot.progressLabel : null,
      progressCaption: typeof snapshot.progressCaption === "string" ? snapshot.progressCaption : null,
      participantSummary: artifact.participantSummary ?? null,
      participants: Array.isArray(snapshot.participants) ? snapshot.participants : [],
      viewerState: artifact.viewerState ?? null,
    };
  };

  const debtMetaById = new Map<string, ReturnType<typeof buildShareMeta>>();
  const goalMetaById = new Map<string, ReturnType<typeof buildShareMeta>>();

  for (const acceptance of acceptances) {
    const artifact = resolvedArtifacts.get(acceptance.artifactId);
    if (!artifact) continue;
    const meta = buildShareMeta(artifact);
    if (acceptance.debtId) debtMetaById.set(acceptance.debtId, meta);
    if (acceptance.savingsGoalId) goalMetaById.set(acceptance.savingsGoalId, meta);
  }

  return {
    debts: debts.map((debt) => ({
      ...debt,
      shareArtifact: debtMetaById.get(debt.id) ?? null,
    })),
    goals: goals.map((goal) => ({
      ...goal,
      shareArtifact: goalMetaById.get(goal.id) ?? null,
    })),
  };
}

const DEFAULT_FOODS = [
  { key: "fried_chicken", name: "Курица жаренная", isDish: false, defaultGrams: 150, calories: 360, protein: 32, fat: 22, carbs: 6, isHealthy: false },
  { key: "boiled_chicken", name: "Курица варенная", isDish: false, defaultGrams: 150, calories: 240, protein: 38, fat: 7, carbs: 0, isHealthy: true },
  { key: "rice", name: "Рис", isDish: false, defaultGrams: 180, calories: 230, protein: 4, fat: 1, carbs: 50, isHealthy: true },
  { key: "oatmeal", name: "Овсянка", isDish: false, defaultGrams: 220, calories: 180, protein: 6, fat: 4, carbs: 31, isHealthy: true },
  { key: "salad", name: "Овощной салат", isDish: false, defaultGrams: 200, calories: 120, protein: 3, fat: 7, carbs: 12, isHealthy: true },
  { key: "carbonara", name: "Карбонара", isDish: true, defaultGrams: 300, calories: 620, protein: 24, fat: 28, carbs: 66, isHealthy: false },
  { key: "buckwheat_chicken", name: "Гречка с курицей", isDish: true, defaultGrams: 320, calories: 470, protein: 34, fat: 12, carbs: 54, isHealthy: true },
  { key: "cottage_cheese", name: "Творог", isDish: false, defaultGrams: 180, calories: 210, protein: 30, fat: 5, carbs: 7, isHealthy: true },
  { key: "banana", name: "Банан", isDish: false, defaultGrams: 120, calories: 105, protein: 1.3, fat: 0.4, carbs: 27, isHealthy: true },
  { key: "protein_shake", name: "Протеиновый коктейль", isDish: true, defaultGrams: 350, calories: 240, protein: 32, fat: 4, carbs: 12, isHealthy: true },
] as const;

const DEFAULT_FINANCE_CATEGORIES = [
  { name: "Здоровье" },
  { name: "Досуг" },
  { name: "Дом" },
  { name: "Кафе" },
  { name: "Транспорт" },
  { name: "Продукты" },
  { name: "Подписки" },
  { name: "Другое" },
] as const;

const legacyFactorsSchema = z.object({
  date: z.string().optional(),
  sleepHours: z.number().min(0).max(24).optional().nullable(),
  sleepQuality: z.number().int().min(1).max(10).optional().nullable(),
  alcohol: z.boolean().optional(),
  coffee: z.boolean().optional(),
  wellbeing: z.number().int().min(1).max(10).optional().nullable(),
  stress: z.number().int().min(1).max(10).optional().nullable(),
  activity: z.boolean().optional(),
  productivity: z.number().int().min(1).max(10).optional().nullable(),
  nutrition: z.number().int().min(1).max(10).optional().nullable(),
  smoking: z.boolean().optional(),
  comment: z.string().max(2000).optional().nullable(),
  weightKg: z.number().min(0).max(500).optional().nullable(),
});

const profileSchema = z.object({
  heightCm: z.number().min(50).max(260).nullable().optional(),
  startWeightKg: z.number().min(20).max(500).nullable().optional(),
  currentWeightKg: z.number().min(20).max(500).nullable().optional(),
  targetWeightKg: z.number().min(20).max(500).nullable().optional(),
  age: z.number().int().min(1).max(120).nullable().optional(),
  dailyCaloriesGoal: z.number().int().min(500).max(10000).nullable().optional(),
  proteinGoal: z.number().min(0).max(1000).nullable().optional(),
  fatGoal: z.number().min(0).max(1000).nullable().optional(),
  carbsGoal: z.number().min(0).max(2000).nullable().optional(),
});

const configSchema = z.object({
  healthEnabled: z.boolean().optional(),
  mentalEnabled: z.boolean().optional(),
  nutritionEnabled: z.boolean().optional(),
  tasksEnabled: z.boolean().optional(),
  financeEnabled: z.boolean().optional(),
  duplicateRecurringExpensesToTasks: z.boolean().optional(),
  duplicateDebtPaymentsToTasks: z.boolean().optional(),
});

const mentalDaySchema = z.object({
  date: z.string().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  sleepQuality: z.number().int().min(1).max(10).nullable().optional(),
  nutrition: z.number().int().min(1).max(10).nullable().optional(),
  productivity: z.number().int().min(1).max(10).nullable().optional(),
  stress: z.number().int().min(1).max(10).nullable().optional(),
  wellbeing: z.number().int().min(1).max(10).nullable().optional(),
  alcoholLevel: z.number().int().min(0).max(3).nullable().optional(),
  activityLevel: z.number().int().min(0).max(3).nullable().optional(),
  caffeineLevel: z.number().int().min(0).max(3).nullable().optional(),
  smoking: z.boolean().optional(),
  comment: z.string().max(2000).nullable().optional(),
  weightKg: z.number().min(20).max(500).nullable().optional(),
});

const nutritionGoalSchema = z.object({
  dailyCalories: z.number().int().min(500).max(10000),
  protein: z.number().min(0).max(1000).nullable().optional(),
  fat: z.number().min(0).max(1000).nullable().optional(),
  carbs: z.number().min(0).max(2000).nullable().optional(),
});

const mealItemSchema = z.object({
  sourceFoodId: z.string().optional().nullable(),
  name: z.string().min(1).max(140),
  grams: z.number().min(1).max(5000),
  calories: z.number().min(0).max(5000),
  protein: z.number().min(0).max(500).nullable().optional(),
  fat: z.number().min(0).max(500).nullable().optional(),
  carbs: z.number().min(0).max(1000).nullable().optional(),
  isHealthy: z.boolean().optional(),
});

const mealSchema = z.object({
  date: z.string().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  title: z.string().min(1).max(140),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(mealItemSchema).min(1).max(20),
});

const foodSchema = z.object({
  name: z.string().min(1).max(140),
  isDish: z.boolean().optional(),
  defaultGrams: z.number().min(1).max(5000).nullable().optional(),
  calories: z.number().int().min(0).max(5000),
  protein: z.number().min(0).max(500).nullable().optional(),
  fat: z.number().min(0).max(500).nullable().optional(),
  carbs: z.number().min(0).max(1000).nullable().optional(),
  isHealthy: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

const pulseTaskSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).nullable().optional(),
  taskType: z.enum(["REGULAR", "ONE_TIME", "HABIT"]),
  date: z.string().optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endDate: z.string().optional().nullable(),
  scheduleType: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  daysOfMonth: z.array(z.number().int().min(1).max(31)).max(31).optional(),
  priority: z.number().int().min(0).max(5).optional(),
  tags: z.array(z.string().max(32)).max(10).optional(),
});

const goalSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().max(1000).nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  targetDate: z.string().nullable().optional(),
});

const financeCategorySchema = z.object({
  name: z.string().min(1).max(80),
  limitAmount: z.number().min(0).max(100000000).nullable().optional(),
});

const financeEntrySchema = z.object({
  date: z.string(),
  type: z.enum(["EXPENSE", "INCOME"]),
  title: z.string().min(1).max(140),
  amount: z.number().positive().max(100000000),
  categoryId: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  recurrenceJson: z.any().nullable().optional(),
});

const savingsGoalSchema = z.object({
  title: z.string().min(1).max(180),
  targetAmount: z.number().positive().max(100000000),
  savedAmount: z.number().min(0).max(100000000).optional(),
  deadline: z.string().nullable().optional(),
  items: z.array(z.object({
    title: z.string().min(1).max(120),
    amount: z.number().min(0).max(100000000),
  })).max(20).optional(),
});

const debtSchema = z.object({
  title: z.string().min(1).max(180),
  debtType: z.string().min(1).max(80),
  totalAmount: z.number().positive().max(100000000),
  paidAmount: z.number().min(0).max(100000000).optional(),
  interestRate: z.number().min(0).max(500).nullable().optional(),
  startedAt: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  paymentAmount: z.number().min(0).max(100000000).nullable().optional(),
  termMonths: z.number().int().min(1).max(1200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toDateKey(value: string | Date | dayjs.Dayjs) {
  const d = typeof value === "string" ? dayjs(value) : dayjs(value);
  return d.format("YYYY-MM-DD");
}

function parseDateOrToday(date?: string | null) {
  const d = date ? dayjs(date) : dayjs();
  if (!d.isValid()) throw new HttpError(400, "Invalid date");
  return d.startOf("day");
}

function readSingleParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseTimeParts(time?: string | null) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = String(time).split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new HttpError(400, "Invalid time");
  }
  return { hours, minutes };
}

function applyTimeToDay(base: dayjs.Dayjs, time?: string | null) {
  const parts = parseTimeParts(time);
  if (!parts) return null;
  return base.hour(parts.hours).minute(parts.minutes).second(0).millisecond(0);
}

function parseTaskDueDate(date?: string | null, time?: string | null, endTime?: string | null, endDate?: string | null) {
  if (!date) return { dueDate: null as Date | null, endDate: null as Date | null, hasTime: false };
  const base = parseDateOrToday(date);
  const endBase = endDate ? parseDateOrToday(endDate) : base;
  const start = applyTimeToDay(base, time);
  const end = applyTimeToDay(endBase, endTime);
  if (end && !start) {
    throw new HttpError(400, "End time requires start time");
  }
  if (start && end && !end.isAfter(start)) {
    throw new HttpError(400, "End time must be later than start time");
  }
  if (!start) return { dueDate: base.toDate(), endDate: null as Date | null, hasTime: false };
  return {
    dueDate: start.toDate(),
    endDate: end ? end.toDate() : null,
    hasTime: true,
  };
}

function readTaskTimeRange(task: { dueDate?: Date | null; hasTime?: boolean; recurrenceJson?: unknown }) {
  const recurrence = (task.recurrenceJson || {}) as Record<string, unknown>;
  const startTime =
    typeof recurrence.time === "string" && recurrence.time.trim()
      ? recurrence.time.trim()
      : typeof recurrence.scheduledTime === "string" && recurrence.scheduledTime.trim()
        ? recurrence.scheduledTime.trim()
        : task.hasTime && task.dueDate
          ? dayjs(task.dueDate).format("HH:mm")
          : null;
  const endTime =
    typeof recurrence.endTime === "string" && recurrence.endTime.trim()
      ? recurrence.endTime.trim()
      : typeof recurrence.scheduledEndTime === "string" && recurrence.scheduledEndTime.trim()
        ? recurrence.scheduledEndTime.trim()
        : null;
  return { startTime, endTime };
}

function readTaskEndDateValue(task: { dueDate?: Date | null; recurrenceJson?: unknown }) {
  const recurrence = (task.recurrenceJson || {}) as Record<string, unknown>;
  if (typeof recurrence.endDate === "string" && recurrence.endDate.trim()) {
    const parsed = dayjs(recurrence.endDate.trim());
    if (parsed.isValid()) return parsed.startOf("day");
  }
  if (task.dueDate) {
    return dayjs(task.dueDate).startOf("day");
  }
  return null;
}

function readArtifactSourceMeta(sourceKey?: string | null) {
  if (!sourceKey || typeof sourceKey !== "string" || !sourceKey.startsWith("artifact:")) return null;
  const raw = sourceKey.slice("artifact:".length);
  const [artifactId, kind, subtaskKey] = raw.split(":");
  return {
    artifactId: artifactId || null,
    kind: kind === "subtask" && subtaskKey ? "SUBTASK" : "PRIMARY",
    subtaskKey: kind === "subtask" && subtaskKey ? subtaskKey : null,
  } as const;
}

function formatOccurrenceTimeLabel(start: dayjs.Dayjs | null, end: dayjs.Dayjs | null) {
  if (!start) return null;
  if (end && end.isAfter(start)) {
    return `${start.format("HH:mm")}-${end.format("HH:mm")}`;
  }
  return start.format("HH:mm");
}

function resolveTaskOccurrenceRange(task: { dueDate?: Date | null; hasTime?: boolean; recurrenceJson?: unknown }, selectedDate: dayjs.Dayjs) {
  const recurrence = (task.recurrenceJson || {}) as Record<string, unknown>;
  const { startTime, endTime } = readTaskTimeRange(task);
  const taskType = recurrence.taskType || (recurrence.scheduleType && recurrence.scheduleType !== "NONE" ? "REGULAR" : "ONE_TIME");

  if (taskType === "ONE_TIME" && task.dueDate) {
    const actualStart = dayjs(task.dueDate);
    const actualEndBase = readTaskEndDateValue(task);
    const actualEnd =
      actualEndBase && endTime
        ? applyTimeToDay(actualEndBase.startOf("day"), endTime)
        : null;
    const dayStart = selectedDate.startOf("day");
    const dayEnd = selectedDate.endOf("day");

    if (!task.hasTime) {
      return {
        dueDate: selectedDate.startOf("day").toDate(),
        endDate: null as Date | null,
        timeLabel: null as string | null,
        hasTime: false,
      };
    }

    const segmentStart = actualStart.isAfter(dayStart) ? actualStart : dayStart;
    const segmentEnd = actualEnd
      ? actualEnd.isBefore(dayEnd)
        ? actualEnd
        : dayEnd
      : null;

    return {
      dueDate: segmentStart.toDate(),
      endDate: segmentEnd && segmentEnd.isAfter(segmentStart) ? segmentEnd.toDate() : null,
      timeLabel: formatOccurrenceTimeLabel(segmentStart, segmentEnd && segmentEnd.isAfter(segmentStart) ? segmentEnd : null),
      hasTime: true,
    };
  }

  const start = applyTimeToDay(selectedDate.startOf("day"), startTime);
  const end = applyTimeToDay(selectedDate.startOf("day"), endTime);
  const normalizedEnd = start && end && end.isAfter(start) ? end : null;
  const fallbackDate =
    recurrence.taskType === "ONE_TIME"
      ? task.dueDate
      : task.dueDate
        ? selectedDate.startOf("day").toDate()
        : null;

  if (!start) {
    return {
      dueDate: fallbackDate,
      endDate: null as Date | null,
      timeLabel: null as string | null,
      hasTime: false,
    };
  }

  return {
    dueDate: start.toDate(),
    endDate: normalizedEnd ? normalizedEnd.toDate() : null,
    timeLabel: formatOccurrenceTimeLabel(start, normalizedEnd),
    hasTime: true,
  };
}

function daysBetween(from: dayjs.Dayjs, to: dayjs.Dayjs) {
  return to.startOf("day").diff(from.startOf("day"), "day");
}

function ensureArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function mealTotals(items: Array<any>) {
  const totalCalories = Math.round(items.reduce((sum, item) => sum + Number(item.calories || 0), 0));
  const totalProtein = round(items.reduce((sum, item) => sum + Number(item.protein || 0), 0));
  const totalFat = round(items.reduce((sum, item) => sum + Number(item.fat || 0), 0));
  const totalCarbs = round(items.reduce((sum, item) => sum + Number(item.carbs || 0), 0));
  const healthyCount = items.filter((item) => item.isHealthy).length;
  const healthyRatio = items.length ? healthyCount / items.length : 0;
  return { totalCalories, totalProtein, totalFat, totalCarbs, healthyRatio };
}

async function getFoodUsageCounts(query?: string | null) {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const rows = await prisma.$queryRaw<Array<{ popularityKey: string | null; usageCount: number | bigint }>>(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(item->>'sourceFoodId', ''), lower(trim(item->>'name'))) AS "popularityKey",
        COUNT(*)::int AS "usageCount"
      FROM "PulseMeal"
      CROSS JOIN LATERAL jsonb_array_elements("itemsJson"::jsonb) AS item
      WHERE item ? 'name'
      ${normalizedQuery ? Prisma.sql`AND lower(item->>'name') LIKE ${`%${normalizedQuery}%`}` : Prisma.empty}
      GROUP BY 1
    `,
  );

  return new Map(
    rows
      .filter((row) => typeof row.popularityKey === "string" && row.popularityKey.trim())
      .map((row) => [String(row.popularityKey).trim(), Number(row.usageCount) || 0]),
  );
}

function computeNutritionScore(totalCalories: number, goalCalories?: number | null, healthyRatio = 0.5) {
  if (!goalCalories || goalCalories <= 0) {
    return clamp(Math.round(4 + healthyRatio * 6), 1, 10);
  }
  const ratio = totalCalories / goalCalories;
  let base = 2;
  if (ratio >= 0.92 && ratio <= 1.08) base = 9;
  else if (ratio >= 0.8 && ratio <= 1.2) base = 7;
  else if (ratio >= 0.65 && ratio <= 1.35) base = 5;
  else if (ratio >= 0.45 && ratio <= 1.6) base = 3;
  const healthyBonus = Math.round(healthyRatio * 2);
  return clamp(base + healthyBonus, 1, 10);
}

function sleepBandScore(hours?: number | null) {
  if (hours == null) return 55;
  if (hours < 4) return 10;
  if (hours < 5.5) return 28;
  if (hours < 7) return 55;
  if (hours <= 9) return 88;
  if (hours <= 10) return 72;
  if (hours <= 11) return 60;
  return 45;
}

function stressScore(value?: number | null) {
  if (value == null) return 55;
  const map = [0, 95, 88, 76, 64, 48, 40, 30, 22, 14, 8];
  return map[value] ?? 8;
}

function alcoholLevelScore(value?: number | null) {
  if (value == null) return 90;
  return [95, 78, 48, 20][value] ?? 20;
}

function activityLevelScore(value?: number | null) {
  if (value == null) return 50;
  return [44, 72, 84, 94][value] ?? 50;
}

function caffeineLevelScore(value?: number | null) {
  if (value == null) return 78;
  return [82, 78, 58, 42][value] ?? 42;
}

function computeMentalScore(f: any): number {
  const score =
    sleepBandScore(f.sleepHours) * 0.24 +
    ((f.nutrition ?? 5) * 10) * 0.14 +
    ((f.productivity ?? 5) * 10) * 0.14 +
    stressScore(f.stress) * 0.16 +
    ((f.wellbeing ?? 5) * 10) * 0.18 +
    alcoholLevelScore(f.alcoholLevel) * 0.05 +
    activityLevelScore(f.activityLevel) * 0.05 +
    caffeineLevelScore(f.caffeineLevel) * 0.02 +
    (f.smoking ? 25 : 88) * 0.02;

  return clamp(Math.round(score));
}

async function recomputePulse7(userId: string, centerDate: dayjs.Dayjs) {
  const start = centerDate.subtract(6, "day").startOf("day");
  const end = centerDate.add(6, "day").endOf("day");
  const days = await prisma.healthDay.findMany({
    where: { userId, date: { gte: start.toDate(), lte: end.toDate() } },
    orderBy: { date: "asc" },
  });

  const map = new Map(days.map((d) => [toDateKey(d.date), d.todayScore]));
  await prisma.$transaction(days.map((row) => {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 7; i += 1) {
      const key = toDateKey(dayjs(row.date).subtract(i, "day"));
      const score = map.get(key);
      if (typeof score === "number") {
        sum += score;
        count += 1;
      }
    }
    const average = count ? Math.round(sum / count) : row.todayScore;
    return prisma.healthDay.update({ where: { id: row.id }, data: { pulse7Score: average } });
  }));
}

async function getOrCreateConfig(userId: string) {
  return prisma.pulseConfig.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function getProfile(userId: string) {
  return prisma.pulseProfile.findUnique({ where: { userId } });
}

async function getNutritionGoal(userId: string) {
  const profile = await prisma.pulseProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const weight = profile.currentWeightKg ?? profile.startWeightKg ?? null;
  const height = profile.heightCm ?? null;
  const age = profile.age ?? null;
  const target = profile.targetWeightKg ?? profile.currentWeightKg ?? null;
  if (!weight || !height) return null;

  const bmi = round(weight / ((height / 100) ** 2), 1);
  let calories = Math.round(weight * 30);
  if (age && age > 35) calories -= 80;
  if (target != null && target > weight) calories += 250;
  if (target != null && target < weight) calories -= 250;

  const protein = round(weight * (target != null && target > weight ? 1.8 : 1.6), 1);
  const fat = round(weight * 0.9, 1);
  const carbs = round(Math.max(0, (calories - (protein * 4 + fat * 9)) / 4), 1);

  return {
    dailyCalories: calories,
    protein,
    fat,
    carbs,
    bmi,
  };
}

async function resolveNutritionGoal(userId: string) {
  const [profile, suggestedGoal] = await Promise.all([
    prisma.pulseProfile.findUnique({ where: { userId } }),
    getNutritionGoal(userId),
  ]);

  if (!profile) return suggestedGoal;

  const hasSavedGoal =
    profile.dailyCaloriesGoal != null
    || profile.proteinGoal != null
    || profile.fatGoal != null
    || profile.carbsGoal != null;

  if (!hasSavedGoal) {
    return suggestedGoal;
  }

  return {
    dailyCalories: profile.dailyCaloriesGoal ?? suggestedGoal?.dailyCalories ?? null,
    protein: profile.proteinGoal ?? suggestedGoal?.protein ?? null,
    fat: profile.fatGoal ?? suggestedGoal?.fat ?? null,
    carbs: profile.carbsGoal ?? suggestedGoal?.carbs ?? null,
    bmi: suggestedGoal?.bmi ?? null,
  };
}

function taskMatchesDate(task: any, selected: dayjs.Dayjs) {
  const recurrence = (task.recurrenceJson || {}) as any;
  const taskType = recurrence.taskType || (recurrence.scheduleType && recurrence.scheduleType !== "NONE" ? "REGULAR" : "ONE_TIME");
  const due = task.dueDate ? dayjs(task.dueDate).startOf("day") : null;
  const end = readTaskEndDateValue(task) ?? due;
  const weekday = (selected.day() + 6) % 7;
  const dayOfMonth = selected.date();

  if (taskType === "HABIT") return true;
  if (taskType === "REGULAR") {
    const scheduleType = recurrence.scheduleType || "WEEKLY";
    if (scheduleType === "DAILY") return true;
    if (scheduleType === "WEEKLY") {
      const days = ensureArray<number>(recurrence.daysOfWeek);
      if (days.length) return days.includes(weekday);
      return due ? weekday === ((due.day() + 6) % 7) : false;
    }
    if (scheduleType === "MONTHLY") {
      const days = ensureArray<number>(recurrence.daysOfMonth);
      if (days.length) return days.includes(dayOfMonth);
      return due ? due.date() === dayOfMonth : false;
    }
  }
  if (taskType === "ONE_TIME") {
    if (due && end) {
      return !selected.isBefore(due, "day") && !selected.isAfter(end, "day");
    }
    return true;
  }
  return due ? due.isSame(selected, "day") : false;
}

function taskSummaryForDay(tasks: any[]) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completedForDate).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const productivityScore = total ? clamp(Math.round(1 + (completed / total) * 9), 1, 10) : 5;
  return { total, completed, percent, productivityScore };
}

async function resolveTasksForDate(userId: string, date: dayjs.Dayjs) {
  const from = date.subtract(370, "day").startOf("day").toDate();
  const to = date.add(370, "day").endOf("day").toDate();
  const taskDefs = await prisma.task.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { dueDate: { gte: from, lte: to } },
        { dueDate: null },
      ],
    },
    include: { completions: { where: { date: date.toDate() } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const items = taskDefs
    .filter((task) => taskMatchesDate(task, date))
    .map((task) => {
      const recurrence = (task.recurrenceJson || {}) as any;
      const completion = task.completions[0];
      let completedForDate = Boolean(completion?.completed);
      if (!completion && recurrence.taskType === "ONE_TIME") completedForDate = Boolean(task.completed);
      const socialEventRole = typeof recurrence.socialEventRole === "string" ? recurrence.socialEventRole : null;
      const sourceEventTitle = typeof recurrence.sourceEventTitle === "string" ? recurrence.sourceEventTitle : null;
      const subtaskAssignmentMode =
        typeof recurrence.subtaskAssignmentMode === "string" ? recurrence.subtaskAssignmentMode : null;
      const subtaskAssigneeUserId =
        typeof recurrence.subtaskAssigneeUserId === "string" ? recurrence.subtaskAssigneeUserId : null;
      const artifactSourceMeta = readArtifactSourceMeta(task.sourceKey);
      const sourceArtifactId =
        typeof recurrence.parentArtifactId === "string"
          ? recurrence.parentArtifactId
          : artifactSourceMeta?.artifactId ?? null;
      const occurrence = resolveTaskOccurrenceRange(task, date);
      return {
        ...task,
        occurrenceKey: `${task.id}:${date.format("YYYY-MM-DD")}`,
        taskType: recurrence.taskType || (recurrence.scheduleType && recurrence.scheduleType !== "NONE" ? "REGULAR" : "ONE_TIME"),
        scheduleType: recurrence.scheduleType || "NONE",
        daysOfWeek: ensureArray<number>(recurrence.daysOfWeek),
        daysOfMonth: ensureArray<number>(recurrence.daysOfMonth),
        completedForDate,
        dueDate: occurrence.dueDate,
        endDate: occurrence.endDate,
        hasTime: occurrence.hasTime,
        timeLabel: occurrence.timeLabel,
        socialEventRole,
        sourceEventTitle,
        subtaskAssignmentMode,
        subtaskAssigneeUserId,
        sourceArtifactId,
      };
    });

  const programLinks = items.length
    ? await prisma.programTaskLink.findMany({
        where: {
          taskId: { in: items.map((task) => task.id) },
        },
        include: {
          run: {
            include: {
              programVersion: true,
            },
          },
        },
      })
    : [];

  const programMetaByTaskId = new Map(
    programLinks.map((link) => [
      link.taskId,
      {
        runId: link.programRunId,
        programId: link.run.programDefinitionId,
        title: link.run.programVersion.title,
      },
    ]),
  );

  const decoratedItems = items.map((task) => ({
    ...task,
    programMeta: programMetaByTaskId.get(task.id) ?? null,
  }));

  return { items: decoratedItems, summary: taskSummaryForDay(decoratedItems) };
}

async function ensureDefaultFinanceCategories(userId: string) {
  const existing = await prisma.pulseFinanceCategory.findMany({ where: { userId } });
  const existingSet = new Set(existing.map((item) => item.name.toLowerCase()));
  const missing = DEFAULT_FINANCE_CATEGORIES.filter((item) => !existingSet.has(item.name.toLowerCase()));
  if (missing.length) {
    await prisma.pulseFinanceCategory.createMany({ data: missing.map((item) => ({ userId, name: item.name })) });
  }
  return prisma.pulseFinanceCategory.findMany({ where: { userId }, orderBy: { name: "asc" } });
}

function serializeFinanceEntry(entry: any) {
  return {
    ...entry,
    categoryName: entry.category?.name ?? null,
    categoryLimitAmount: entry.category?.limitAmount ?? null,
  };
}

async function syncFinanceEntryTask(userId: string, entry: any) {
  const config = await getOrCreateConfig(userId);
  if (!config.duplicateRecurringExpensesToTasks) return;
  const sourceKey = `finance:${entry.id}`;
  const recurrence = entry.recurrenceJson as any;
  if (!recurrence) return;

  const payload = {
    userId,
    title: `Оплатить: ${entry.title}`,
    notes: entry.notes ?? null,
    kind: "TASK",
    dueDate: dayjs(entry.date).toDate(),
    hasTime: false,
    priority: 3,
    tags: [entry.type === "EXPENSE" ? "finance" : "income"],
    remindersJson: null,
    recurrenceJson: {
      taskType: "REGULAR",
      scheduleType: recurrence.scheduleType || "MONTHLY",
      daysOfWeek: recurrence.daysOfWeek ?? [],
      daysOfMonth: recurrence.daysOfMonth ?? (dayjs(entry.date).isValid() ? [dayjs(entry.date).date()] : []),
      source: "finance",
    },
    sourceKey,
  };

  const existing = await prisma.task.findFirst({ where: { userId, sourceKey, deletedAt: null } });
  if (existing) {
    const task = await prisma.task.update({ where: { id: existing.id }, data: payload as any });
    await prisma.pulseFinanceEntry.update({ where: { id: entry.id }, data: { linkedTaskId: task.id } });
  } else {
    const task = await prisma.task.create({ data: payload as any });
    await prisma.pulseFinanceEntry.update({ where: { id: entry.id }, data: { linkedTaskId: task.id } });
  }
}

async function syncDebtTask(userId: string, debt: any) {
  const config = await getOrCreateConfig(userId);
  if (!config.duplicateDebtPaymentsToTasks || !debt.paymentDay) return;
  const sourceKey = `debt:${debt.id}`;
  const dueDate = debt.dueDate ? dayjs(debt.dueDate) : dayjs().date(Math.min(Math.max(debt.paymentDay, 1), 28));
  const payload = {
    userId,
    title: `Платёж: ${debt.title}`,
    notes: debt.notes ?? null,
    kind: "TASK",
    dueDate: dueDate.toDate(),
    hasTime: false,
    priority: 4,
    tags: ["finance", "debt"],
    remindersJson: null,
    recurrenceJson: {
      taskType: "REGULAR",
      scheduleType: "MONTHLY",
      daysOfMonth: [debt.paymentDay],
      source: "debt",
    },
    sourceKey,
  };
  const existing = await prisma.task.findFirst({ where: { userId, sourceKey, deletedAt: null } });
  if (existing) await prisma.task.update({ where: { id: existing.id }, data: payload as any });
  else await prisma.task.create({ data: payload as any });
}

async function computeDayNutrition(userId: string, date: dayjs.Dayjs) {
  const meals = await prisma.pulseMeal.findMany({
    where: { userId, date: { gte: date.startOf("day").toDate(), lte: date.endOf("day").toDate() } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const profile = await getProfile(userId);
  const goal = await resolveNutritionGoal(userId);
  const targetCalories = goal?.dailyCalories ?? null;
  const targetWeight = profile?.targetWeightKg ?? null;
  const totalCalories = meals.reduce((sum, meal) => sum + meal.totalCalories, 0);
  const totalProtein = round(meals.reduce((sum, meal) => sum + Number(meal.totalProtein || 0), 0));
  const totalFat = round(meals.reduce((sum, meal) => sum + Number(meal.totalFat || 0), 0));
  const totalCarbs = round(meals.reduce((sum, meal) => sum + Number(meal.totalCarbs || 0), 0));
  const averageNutritionScore = meals.length ? Math.round(meals.reduce((sum, meal) => sum + meal.nutritionScore, 0) / meals.length) : 0;
  const remainingCalories = targetCalories != null ? targetCalories - totalCalories : null;
  return {
    meals,
    goal,
    profile,
    totalCalories,
    totalProtein,
    totalFat,
    totalCarbs,
    remainingCalories,
    averageNutritionScore,
    targetWeight,
  };
}

function buildWeightDelta(profile: any) {
  const start = profile?.startWeightKg ?? null;
  const current = profile?.currentWeightKg ?? null;
  const target = profile?.targetWeightKg ?? null;
  if (start == null || current == null) return null;
  const delta = round(current - start, 1);
  let tone: "neutral" | "success" | "danger" = "neutral";
  if (target != null) {
    if (target > current && delta >= 0) tone = "success";
    if (target < current && delta >= 0) tone = "danger";
    if (target < current && delta < 0) tone = "success";
    if (target > current && delta < 0) tone = "danger";
    if (target === current && delta === 0) tone = "success";
  }
  return { delta, tone };
}

function upcomingRecurringMatches(entry: any, selected: dayjs.Dayjs, target: dayjs.Dayjs) {
  const recurrence = (entry.recurrenceJson || {}) as any;
  if (!recurrence) return dayjs(entry.date).isSame(target, "day");
  const weekday = (target.day() + 6) % 7;
  if (recurrence.scheduleType === "DAILY") return true;
  if (recurrence.scheduleType === "WEEKLY") return ensureArray<number>(recurrence.daysOfWeek).includes(weekday);
  const dayOfMonth = target.date();
  if (recurrence.scheduleType === "MONTHLY") {
    const days = ensureArray<number>(recurrence.daysOfMonth);
    return days.length ? days.includes(dayOfMonth) : dayjs(entry.date).date() === dayOfMonth;
  }
  return dayjs(entry.date).isSame(target, "day");
}

async function buildOverview(userId: string, date: dayjs.Dayjs) {
  const config = await getOrCreateConfig(userId);
  const profile = await prisma.pulseProfile.findUnique({ where: { userId } });
  const day = await prisma.healthDay.findUnique({ where: { userId_date: { userId, date: date.toDate() } } });
  const rangeStart = date.subtract(6, "day").startOf("day");
  const mentalDays = await prisma.healthDay.findMany({
    where: { userId, date: { gte: rangeStart.toDate(), lte: date.endOf("day").toDate() } },
    orderBy: { date: "asc" },
  });
  const nutrition = await computeDayNutrition(userId, date);
  const tasks = await resolveTasksForDate(userId, date);
  const categories = await ensureDefaultFinanceCategories(userId);
  const monthStart = date.startOf("month");
  const monthEnd = date.endOf("month");
  const financeEntries = await prisma.pulseFinanceEntry.findMany({
    where: { userId, date: { gte: monthStart.toDate(), lte: monthEnd.toDate() } },
    include: { category: true },
    orderBy: { date: "asc" },
  });
  const savingsGoals = await prisma.pulseSavingsGoal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const debts = await prisma.pulseDebt.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

  const monthExpenses = financeEntries.filter((entry) => entry.type === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0);
  const monthIncome = financeEntries.filter((entry) => entry.type === "INCOME").reduce((sum, entry) => sum + entry.amount, 0);
  const todayExpenseEntries = financeEntries.filter((entry) => toDateKey(entry.date) === toDateKey(date) && entry.type === "EXPENSE");
  const todayIncomeEntries = financeEntries.filter((entry) => toDateKey(entry.date) === toDateKey(date) && entry.type === "INCOME");

  const categoryStats = categories.map((category) => {
    const spent = financeEntries.filter((entry) => entry.type === "EXPENSE" && entry.categoryId === category.id).reduce((sum, entry) => sum + entry.amount, 0);
    const percent = monthExpenses ? Math.round((spent / monthExpenses) * 100) : 0;
    const overBy = category.limitAmount != null ? Math.max(0, spent - category.limitAmount) : 0;
    return { ...category, spent: round(spent), percent, overBy: round(overBy) };
  }).sort((a, b) => b.spent - a.spent);

  const tomorrow = date.add(1, "day");
  const upcomingPayments = financeEntries
    .filter((entry) => entry.type === "EXPENSE")
    .filter((entry) => upcomingRecurringMatches(entry, date, tomorrow))
    .map((entry) => ({ kind: "finance", title: entry.title, amount: entry.amount, date: tomorrow.format("YYYY-MM-DD") }));

  debts.forEach((debt) => {
    if (debt.paymentDay && debt.paymentDay === tomorrow.date()) {
      upcomingPayments.push({ kind: "debt", title: debt.title, amount: debt.paymentAmount ?? 0, date: tomorrow.format("YYYY-MM-DD") });
    }
  });

  const recommendations: string[] = [];
  const lastTwo = mentalDays.slice(-2);
  if (lastTwo.length >= 2 && lastTwo.every((item) => (item.sleepHours ?? 0) < 5.5)) {
    recommendations.push("Мало сна 2 дня подряд — попробуй добрать хотя бы 60–90 минут уже сегодня.");
  }
  const lastThree = mentalDays.slice(-3);
  const prevThree = mentalDays.slice(-6, -3);
  if (lastThree.length === 3 && prevThree.length === 3) {
    const lastAvg = lastThree.reduce((sum, item) => sum + (item.productivity ?? 0), 0) / 3;
    const prevAvg = prevThree.reduce((sum, item) => sum + (item.productivity ?? 0), 0) / 3;
    if (lastAvg + 1.2 < prevAvg) {
      recommendations.push("Продуктивность упала за последние 3 дня — разгрузи план и начни с 1–2 коротких задач.");
    }
  }
  if ((nutrition.goal?.dailyCalories ?? null) != null && (nutrition.remainingCalories ?? 0) > 0) {
    recommendations.push(`До цели по калориям осталось ${Math.max(0, Math.round(nutrition.remainingCalories ?? 0))} ккал.`);
  }
  if (tasks.summary.total > 0) {
    recommendations.push(`Сегодня ${tasks.summary.total} задач и привычек, выполнено ${tasks.summary.completed} (${tasks.summary.percent}%).`);
  }
  if (todayExpenseEntries.length > 0 || todayIncomeEntries.length > 0) {
    recommendations.push(`Финансы за сегодня: расходы ${Math.round(todayExpenseEntries.reduce((sum, item) => sum + item.amount, 0))} ₽, доходы ${Math.round(todayIncomeEntries.reduce((sum, item) => sum + item.amount, 0))} ₽.`);
  }
  categoryStats.filter((item) => item.overBy > 0).slice(0, 2).forEach((item) => {
    recommendations.push(`Категория «${item.name}» вышла за лимит на ${Math.round(item.overBy)} ₽.`);
  });
  upcomingPayments.slice(0, 2).forEach((item) => {
    const title = item.kind === "debt" ? `Завтра платёж по ${item.title}` : `Завтра регулярный платёж: ${item.title}`;
    recommendations.push(`${title}${item.amount ? ` — ${Math.round(item.amount)} ₽` : ""}.`);
  });
  if (!recommendations.length) {
    recommendations.push("День выглядит сбалансированным — поддерживай текущий темп и не перегружай вечер.");
  }

  return {
    config,
    profile,
    weightDelta: buildWeightDelta(profile),
    today: {
      date: date.format("YYYY-MM-DD"),
      dayScore: day?.todayScore ?? 0,
      pulse7Score: day?.pulse7Score ?? (mentalDays.length ? Math.round(mentalDays.reduce((sum, item) => sum + item.todayScore, 0) / mentalDays.length) : 0),
      mental7Score: mentalDays.length ? Math.round(mentalDays.reduce((sum, item) => sum + item.todayScore, 0) / mentalDays.length) : 0,
      caloriesConsumed: nutrition.totalCalories,
      caloriesRemaining: nutrition.remainingCalories,
      tasksDone: tasks.summary.completed,
      tasksTotal: tasks.summary.total,
      tasksPercent: tasks.summary.percent,
      hasPaymentsToday: todayExpenseEntries.length > 0 || debts.some((debt) => debt.paymentDay === date.date()),
      todaysExpenses: Math.round(todayExpenseEntries.reduce((sum, item) => sum + item.amount, 0)),
      todaysIncome: Math.round(todayIncomeEntries.reduce((sum, item) => sum + item.amount, 0)),
      recommendations,
    },
    nutrition: {
      goal: nutrition.goal,
      totalCalories: nutrition.totalCalories,
      remainingCalories: nutrition.remainingCalories,
      score: nutrition.averageNutritionScore,
    },
    tasks: tasks.summary,
    finance: {
      monthIncome: round(monthIncome),
      monthExpenses: round(monthExpenses),
      balance: round(monthIncome - monthExpenses),
      overLimitCategories: categoryStats.filter((item) => item.overBy > 0),
      upcomingPayments,
    },
  };
}

async function upsertMentalDay(userId: string, payload: any) {
  const date = parseDateOrToday(payload.date);
  const todayScore = computeMentalScore(payload);
  const day = await prisma.healthDay.upsert({
    where: { userId_date: { userId, date: date.toDate() } },
    create: {
      userId,
      date: date.toDate(),
      sleepHours: payload.sleepHours ?? undefined,
      sleepQuality: payload.sleepQuality ?? undefined,
      weightKg: payload.weightKg ?? undefined,
      alcohol: (payload.alcoholLevel ?? 0) > 0,
      coffee: (payload.caffeineLevel ?? 0) > 1,
      wellbeing: payload.wellbeing ?? undefined,
      stress: payload.stress ?? undefined,
      activity: (payload.activityLevel ?? 0) > 0,
      productivity: payload.productivity ?? undefined,
      nutrition: payload.nutrition ?? undefined,
      smoking: payload.smoking ?? false,
      alcoholLevel: payload.alcoholLevel ?? undefined,
      activityLevel: payload.activityLevel ?? undefined,
      caffeineLevel: payload.caffeineLevel ?? undefined,
      comment: payload.comment ?? undefined,
      todayScore,
      pulse7Score: todayScore,
    },
    update: {
      sleepHours: payload.sleepHours ?? undefined,
      sleepQuality: payload.sleepQuality ?? undefined,
      weightKg: payload.weightKg ?? undefined,
      alcohol: payload.alcoholLevel != null ? payload.alcoholLevel > 0 : undefined,
      coffee: payload.caffeineLevel != null ? payload.caffeineLevel > 1 : undefined,
      wellbeing: payload.wellbeing ?? undefined,
      stress: payload.stress ?? undefined,
      activity: payload.activityLevel != null ? payload.activityLevel > 0 : undefined,
      productivity: payload.productivity ?? undefined,
      nutrition: payload.nutrition ?? undefined,
      smoking: payload.smoking ?? undefined,
      alcoholLevel: payload.alcoholLevel ?? undefined,
      activityLevel: payload.activityLevel ?? undefined,
      caffeineLevel: payload.caffeineLevel ?? undefined,
      comment: payload.comment ?? undefined,
      todayScore,
    },
  });
  await recomputePulse7(userId, date);
  return prisma.healthDay.findUnique({ where: { id: day.id } });
}

router.get("/today", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = dayjs().startOf("day");
  const day = await prisma.healthDay.findUnique({ where: { userId_date: { userId: req.user!.id, date: date.toDate() } } });
  res.json({ day });
}));

router.get("/day/:date", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(readSingleParam(req.params.date));
  const day = await prisma.healthDay.findUnique({ where: { userId_date: { userId: req.user!.id, date: date.toDate() } } });
  res.json({ day });
}));

router.put("/checkin", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = legacyFactorsSchema.parse(req.body);
  const day = await upsertMentalDay(req.user!.id, {
    ...body,
    alcoholLevel: body.alcohol ? 1 : 0,
    activityLevel: body.activity ? 1 : 0,
    caffeineLevel: body.coffee ? 1 : 0,
  });
  res.json({ day });
}));

router.delete("/day/:date", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(readSingleParam(req.params.date));
  await prisma.healthDay.deleteMany({ where: { userId: req.user!.id, date: date.toDate() } });
  await recomputePulse7(req.user!.id, date);
  res.json({ ok: true });
}));

router.get("/range", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const from = parseDateOrToday(req.query.from?.toString());
  const to = parseDateOrToday(req.query.to?.toString());
  const days = await prisma.healthDay.findMany({
    where: { userId: req.user!.id, date: { gte: from.toDate(), lte: to.endOf("day").toDate() } },
    orderBy: { date: "asc" },
  });
  res.json({ days });
}));

router.get("/stats", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const period = Number(req.query.days ?? 7);
  const days = [7, 14, 30].includes(period) ? period : 7;
  const to = dayjs().endOf("day");
  const from = dayjs().subtract(days - 1, "day").startOf("day");
  const rows = await prisma.healthDay.findMany({
    where: { userId: req.user!.id, date: { gte: from.toDate(), lte: to.toDate() } },
    orderBy: { date: "asc" },
  });
  const counters = {
    noAlcoholDays: rows.filter((row) => (row.alcoholLevel ?? 0) === 0).length,
    noSmokingDays: rows.filter((row) => !row.smoking).length,
    goodNutritionDays: rows.filter((row) => (row.nutrition ?? 0) >= 7).length,
  };
  const map = new Map(rows.map((row) => [toDateKey(row.date), row]));
  const streak = (pred: (row: any) => boolean) => {
    let total = 0;
    for (let i = 0; i < days; i += 1) {
      const key = dayjs().subtract(i, "day").format("YYYY-MM-DD");
      const row = map.get(key);
      if (row && pred(row)) total += 1;
      else break;
    }
    return total;
  };
  const streaks = {
    noAlcohol: streak((row) => (row.alcoholLevel ?? 0) === 0),
    noSmoking: streak((row) => !row.smoking),
    goodSleep: streak((row) => (row.sleepHours ?? 0) >= 7),
    goodNutrition: streak((row) => (row.nutrition ?? 0) >= 7),
  };
  res.json({ periodDays: days, from: from.toISOString(), to: to.toISOString(), rows, counters, streaks });
}));

router.get("/pulse/overview", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const overview = await buildOverview(req.user!.id, date);
  res.json(overview);
}));

router.get("/pulse/config", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const config = await getOrCreateConfig(req.user!.id);
  res.json({ config });
}));

router.put("/pulse/config", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = configSchema.parse(req.body);
  const config = await prisma.pulseConfig.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...body },
    update: body,
  });
  res.json({ config });
}));

router.get("/pulse/profile", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const profile = await prisma.pulseProfile.findUnique({ where: { userId: req.user!.id } });
  const suggestion = await getNutritionGoal(req.user!.id);
  res.json({ profile, suggestion, weightDelta: buildWeightDelta(profile) });
}));

router.put("/pulse/profile", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = profileSchema.parse(req.body);
  const profile = await prisma.pulseProfile.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...body },
    update: body,
  });
  if (body.currentWeightKg != null) {
    await upsertMentalDay(req.user!.id, { date: dayjs().format("YYYY-MM-DD"), weightKg: body.currentWeightKg });
  }
  const suggestion = await getNutritionGoal(req.user!.id);
  res.json({ profile, suggestion, weightDelta: buildWeightDelta(profile) });
}));

router.get("/pulse/mental/day", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const day = await prisma.healthDay.findUnique({ where: { userId_date: { userId: req.user!.id, date: date.toDate() } } });
  const tasks = await resolveTasksForDate(req.user!.id, date);
  const nutrition = await computeDayNutrition(req.user!.id, date);
  const autoProductivity = tasks.summary.productivityScore;
  const autoNutrition = nutrition.goal ? computeNutritionScore(nutrition.totalCalories, nutrition.goal.dailyCalories, nutrition.meals.length ? nutrition.meals.filter((meal) => meal.nutritionScore >= 7).length / nutrition.meals.length : 0.5) : Math.max(1, nutrition.averageNutritionScore || 5);
  res.json({ day, autoProductivity, autoNutrition });
}));

router.put("/pulse/mental/day", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = mentalDaySchema.parse(req.body);
  const day = await upsertMentalDay(req.user!.id, body);
  res.json({ day });
}));

router.put("/pulse/nutrition/goal", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = nutritionGoalSchema.parse(req.body);
  const profile = await prisma.pulseProfile.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      dailyCaloriesGoal: body.dailyCalories,
      proteinGoal: body.protein ?? null,
      fatGoal: body.fat ?? null,
      carbsGoal: body.carbs ?? null,
    },
    update: {
      dailyCaloriesGoal: body.dailyCalories,
      proteinGoal: body.protein ?? null,
      fatGoal: body.fat ?? null,
      carbsGoal: body.carbs ?? null,
    },
  });
  const goal = await resolveNutritionGoal(req.user!.id);
  res.json({ profile, goal });
}));

router.get("/pulse/nutrition", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const nutrition = await computeDayNutrition(req.user!.id, date);
  const recentMeals = await prisma.pulseMeal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 6 });
  const recentItems = recentMeals.flatMap((meal) => ensureArray<any>(meal.itemsJson as any)).slice(0, 12);
  res.json({ ...nutrition, meals: nutrition.meals, recentItems });
}));

router.post("/pulse/nutrition/meals", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = mealSchema.parse(req.body);
  const date = parseDateOrToday(body.date);
  const mealDate = applyTimeToDay(date, body.time) ?? date;
  const totals = mealTotals(body.items as any[]);
  const goal = await resolveNutritionGoal(req.user!.id);
  const nutritionScore = computeNutritionScore(totals.totalCalories, goal?.dailyCalories, totals.healthyRatio);
  const meal = await prisma.pulseMeal.create({
    data: {
      userId: req.user!.id,
      date: mealDate.toDate(),
      title: body.title,
      notes: body.notes ?? null,
      totalCalories: totals.totalCalories,
      totalProtein: totals.totalProtein,
      totalFat: totals.totalFat,
      totalCarbs: totals.totalCarbs,
      nutritionScore,
      itemsJson: body.items as any,
    },
  });
  res.json({ meal });
}));

router.patch("/pulse/nutrition/meals/:mealId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = mealSchema.partial().parse(req.body);
  const meal = await prisma.pulseMeal.findUnique({ where: { id: readSingleParam(req.params.mealId) } });
  if (!meal || meal.userId !== req.user!.id) throw new HttpError(404, "Meal not found");
  const items = body.items ? (body.items as any[]) : ensureArray<any>(meal.itemsJson as any);
  const totals = mealTotals(items);
  const goal = await resolveNutritionGoal(req.user!.id);
  const nutritionScore = computeNutritionScore(totals.totalCalories, goal?.dailyCalories, totals.healthyRatio);
  const currentMealDate = dayjs(meal.date);
  const nextDate = body.date ? parseDateOrToday(body.date) : currentMealDate.startOf("day");
  const nextTime = body.time !== undefined ? body.time : currentMealDate.format("HH:mm");
  const resolvedMealDate = (body.date !== undefined || body.time !== undefined)
    ? (applyTimeToDay(nextDate, nextTime) ?? nextDate)
    : undefined;
  const updated = await prisma.pulseMeal.update({
    where: { id: meal.id },
    data: {
      title: body.title ?? undefined,
      notes: body.notes === null ? null : body.notes ?? undefined,
      date: resolvedMealDate?.toDate(),
      itemsJson: body.items ? (body.items as any) : undefined,
      totalCalories: totals.totalCalories,
      totalProtein: totals.totalProtein,
      totalFat: totals.totalFat,
      totalCarbs: totals.totalCarbs,
      nutritionScore,
    },
  });
  res.json({ meal: updated });
}));

router.delete("/pulse/nutrition/meals/:mealId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const meal = await prisma.pulseMeal.findUnique({ where: { id: readSingleParam(req.params.mealId) } });
  if (!meal || meal.userId !== req.user!.id) throw new HttpError(404, "Meal not found");
  await prisma.pulseMeal.delete({ where: { id: meal.id } });
  res.json({ ok: true });
}));

router.get("/pulse/nutrition/foods", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const query = (req.query.query?.toString() ?? "").trim().toLowerCase();
  const usageCounts = await getFoodUsageCounts(query);
  const dbFoods = await prisma.pulseFood.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" }, isPublic: true },
            { name: { contains: query, mode: "insensitive" }, userId: req.user!.id },
          ],
        }
      : { OR: [{ userId: req.user!.id }, { isPublic: true }] },
    orderBy: [{ createdAt: "desc" }],
    take: 40,
  });
  const normalizedDefaults = DEFAULT_FOODS.filter((food) => !query || food.name.toLowerCase().includes(query)).map((food) => ({
    id: `default:${food.key}`,
    userId: null,
    name: food.name,
    isDish: food.isDish,
    defaultGrams: food.defaultGrams,
    calories: food.calories,
    protein: food.protein,
    fat: food.fat,
    carbs: food.carbs,
    isHealthy: food.isHealthy,
    isPublic: true,
    usageCount: usageCounts.get(`default:${food.key}`) ?? usageCounts.get(food.name.toLowerCase()) ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const normalizedFoods = dbFoods.map((food) => ({
    ...food,
    usageCount: usageCounts.get(food.id) ?? usageCounts.get(food.name.toLowerCase()) ?? 0,
  }));
  const queryScore = (name: string) => {
    const normalizedName = name.toLowerCase();
    if (!query) return 0;
    if (normalizedName === query) return 3;
    if (normalizedName.startsWith(query)) return 2;
    if (normalizedName.includes(query)) return 1;
    return 0;
  };
  const dedupeRank = (food: any) => {
    const ownScore = food.userId === req.user!.id ? 10_000 : 0;
    return ownScore + (Number(food.usageCount) || 0);
  };
  const finalRank = (food: any) => {
    return queryScore(food.name) * 100_000 + (Number(food.usageCount) || 0) * 10 + (food.userId === req.user!.id ? 1 : 0);
  };
  const map = new Map<string, any>();
  [...normalizedFoods, ...normalizedDefaults].forEach((food: any) => {
    const key = food.name.toLowerCase();
    const existing = map.get(key);
    if (!existing || dedupeRank(food) > dedupeRank(existing)) {
      map.set(key, food);
    }
  });
  const items = Array.from(map.values())
    .sort((a, b) => finalRank(b) - finalRank(a) || a.name.localeCompare(b.name, "ru-RU"));
  res.json({ items: items.slice(0, 25) });
}));

router.post("/pulse/nutrition/foods", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = foodSchema.parse(req.body);
  const food = await prisma.pulseFood.create({
    data: {
      userId: req.user!.id,
      name: body.name,
      isDish: body.isDish ?? false,
      defaultGrams: body.defaultGrams ?? null,
      calories: body.calories,
      protein: body.protein ?? null,
      fat: body.fat ?? null,
      carbs: body.carbs ?? null,
      isHealthy: body.isHealthy ?? false,
      isPublic: body.isPublic ?? true,
    },
  });
  res.json({ food });
}));

router.get("/pulse/tasks/day", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const data = await resolveTasksForDate(req.user!.id, date);
  const goals = await prisma.pulseGoal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({ ...data, goals });
}));

router.get("/pulse/tasks/range", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const from = parseDateOrToday(req.query.from?.toString());
  const to = parseDateOrToday(req.query.to?.toString());
  if (to.isBefore(from, "day")) throw new HttpError(400, "Invalid date range");
  const dayCount = to.diff(from, "day") + 1;
  if (dayCount > 14) throw new HttpError(400, "Range is too large");

  const days = await Promise.all(
    Array.from({ length: dayCount }, (_, index) => from.add(index, "day")).map(async (current) => {
      const data = await resolveTasksForDate(req.user!.id, current);
      return {
        date: current.format("YYYY-MM-DD"),
        items: data.items,
      };
    }),
  );

  res.json({
    from: from.format("YYYY-MM-DD"),
    to: to.format("YYYY-MM-DD"),
    days,
    items: days.flatMap((day) => day.items),
  });
}));

router.post("/pulse/tasks", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = pulseTaskSchema.parse(req.body);
  const { dueDate, endDate, hasTime } = parseTaskDueDate(body.date, body.time, body.endTime, body.endDate);
  const task = await prisma.task.create({
    data: {
      userId: req.user!.id,
      title: body.title,
      notes: body.notes ?? null,
      kind: "TASK",
      dueDate,
      hasTime,
      completed: false,
      priority: body.priority ?? 2,
      tags: body.tags ?? [],
      remindersJson: toPrismaNullableJson(null),
      recurrenceJson: toPrismaNullableJson({
        taskType: body.taskType,
        scheduleType: body.scheduleType,
        daysOfWeek: body.daysOfWeek ?? [],
        daysOfMonth: body.daysOfMonth ?? [],
        time: body.time ?? null,
        endTime: body.endTime ?? null,
        endDate: endDate ? toDateKey(endDate) : null,
      }),
    },
  });
  res.json({ task });
}));

router.patch("/pulse/tasks/:taskId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.task.findUnique({ where: { id: readSingleParam(req.params.taskId) } });
  if (!existing || existing.userId !== req.user!.id || existing.deletedAt) throw new HttpError(404, "Task not found");
  const body = pulseTaskSchema.partial().parse(req.body);
  const recurrence = { ...(existing.recurrenceJson as any || {}) };
  if (body.taskType !== undefined) recurrence.taskType = body.taskType;
  if (body.scheduleType !== undefined) recurrence.scheduleType = body.scheduleType;
  if (body.daysOfWeek !== undefined) recurrence.daysOfWeek = body.daysOfWeek;
  if (body.daysOfMonth !== undefined) recurrence.daysOfMonth = body.daysOfMonth;
  if (body.time !== undefined) recurrence.time = body.time;
  if (body.endTime !== undefined) recurrence.endTime = body.endTime;
  if (body.endDate !== undefined) recurrence.endDate = body.endDate;
  const nextDateInput = body.date !== undefined ? body.date : (existing.dueDate ? dayjs(existing.dueDate).format("YYYY-MM-DD") : null);
  const nextTimeInput = body.time !== undefined ? body.time : (existing.hasTime && existing.dueDate ? dayjs(existing.dueDate).format("HH:mm") : null);
  const nextEndDateInput =
    body.endDate !== undefined
      ? body.endDate
      : typeof recurrence.endDate === "string" && recurrence.endDate.trim()
        ? recurrence.endDate
        : null;
  const nextEndTimeInput =
    body.endTime !== undefined
      ? body.endTime
      : typeof recurrence.endTime === "string" && recurrence.endTime.trim()
        ? recurrence.endTime
        : null;
  const nextDue = body.date !== undefined || body.time !== undefined || body.endTime !== undefined || body.endDate !== undefined
    ? parseTaskDueDate(nextDateInput, nextTimeInput, nextEndTimeInput, nextEndDateInput)
    : null;
  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? undefined,
      notes: body.notes === null ? null : body.notes ?? undefined,
      dueDate: nextDue ? nextDue.dueDate : undefined,
      hasTime: nextDue ? nextDue.hasTime : undefined,
      priority: body.priority ?? undefined,
      tags: body.tags ?? undefined,
      recurrenceJson: recurrence,
    },
  });
  res.json({ task });
}));

router.post("/pulse/tasks/:taskId/toggle-date", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.body?.date);
  const task = await prisma.task.findUnique({ where: { id: readSingleParam(req.params.taskId) } });
  if (!task || task.userId !== req.user!.id || task.deletedAt) throw new HttpError(404, "Task not found");
  const recurrence = (task.recurrenceJson || {}) as any;
  if (
    recurrence?.subtaskAssignmentMode === "ANYONE" &&
    recurrence?.anyoneResolvedByUserId &&
    recurrence.anyoneResolvedByUserId !== req.user!.id
  ) {
    throw new HttpError(400, "Эта задача уже закреплена за участником и больше недоступна для изменения");
  }
  const existing = await prisma.pulseTaskCompletion.findUnique({ where: { taskId_date: { taskId: task.id, date: date.toDate() } } as any }).catch(() => null);
  let completion;
  if (existing) {
    completion = await prisma.pulseTaskCompletion.update({ where: { id: existing.id }, data: { completed: !existing.completed } });
  } else {
    completion = await prisma.pulseTaskCompletion.create({ data: { taskId: task.id, userId: req.user!.id, date: date.toDate(), completed: true } });
  }
  if ((recurrence.taskType ?? "ONE_TIME") === "ONE_TIME" && (!task.dueDate || dayjs(task.dueDate).isSame(date, "day"))) {
    const updatedTask = await prisma.task.update({ where: { id: task.id }, data: { completed: completion.completed } });
    if (isProgramTaskSourceKey(updatedTask.sourceKey)) {
      await syncProgramActionFromTask(prisma, { taskId: updatedTask.id, completed: updatedTask.completed });
    }
    if (isArtifactTaskSourceKey(updatedTask.sourceKey)) {
      const syncResult = await syncArtifactStateFromTask(updatedTask.id, updatedTask.completed);
      const emitter = req.app.locals.emitter as any;
      if (syncResult?.originChatId) {
        emitter?.emitToChat(syncResult.originChatId, "share-artifact:updated", {
          artifactId: syncResult.artifactId,
          chatId: syncResult.originChatId,
          at: new Date().toISOString(),
        });
      }
      if (syncResult?.ownerId) {
        emitter?.emitToUser(syncResult.ownerId, "share-artifact:updated", {
          artifactId: syncResult.artifactId,
          chatId: syncResult.originChatId ?? null,
          at: new Date().toISOString(),
        });
      }
    }
  }
  res.json({ completion });
}));

router.delete("/pulse/tasks/:taskId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({ where: { id: readSingleParam(req.params.taskId) } });
  if (!task || task.userId !== req.user!.id || task.deletedAt) throw new HttpError(404, "Task not found");
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  emitShareArtifactRealtime(req, await unlinkArtifactLinkedTask(task.id));
  res.json({ ok: true });
}));

router.get("/pulse/tasks/goals", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const goals = await prisma.pulseGoal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({ goals });
}));

router.post("/pulse/tasks/goals", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = goalSchema.parse(req.body);
  const goal = await prisma.pulseGoal.create({
    data: {
      userId: req.user!.id,
      title: body.title,
      description: body.description ?? null,
      progress: body.progress ?? 0,
      targetDate: body.targetDate ? parseDateOrToday(body.targetDate).toDate() : null,
    },
  });
  res.json({ goal });
}));

router.patch("/pulse/tasks/goals/:goalId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseGoal.findUnique({ where: { id: readSingleParam(req.params.goalId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Goal not found");
  const body = goalSchema.partial().parse(req.body);
  const goal = await prisma.pulseGoal.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? undefined,
      description: body.description === null ? null : body.description ?? undefined,
      progress: body.progress ?? undefined,
      targetDate: body.targetDate !== undefined ? (body.targetDate ? parseDateOrToday(body.targetDate).toDate() : null) : undefined,
    },
  });
  res.json({ goal });
}));

router.delete("/pulse/tasks/goals/:goalId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseGoal.findUnique({ where: { id: readSingleParam(req.params.goalId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Goal not found");
  await prisma.pulseGoal.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

router.get("/pulse/finance/overview", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const period = ["day", "month", "year"].includes(String(req.query.period || "")) ? String(req.query.period) : "day";
  const rangeStart = period === "year" ? date.startOf("year") : period === "month" ? date.startOf("month") : date.startOf("day");
  const rangeEnd = period === "year" ? date.endOf("year") : period === "month" ? date.endOf("month") : date.endOf("day");

  await ensureDefaultFinanceCategories(req.user!.id);
  const overview = await buildOverview(req.user!.id, date);
  const entries = await prisma.pulseFinanceEntry.findMany({
    where: { userId: req.user!.id, date: { gte: rangeStart.toDate(), lte: rangeEnd.toDate() } },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  const goalsRaw = await prisma.pulseSavingsGoal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  const debtsRaw = await prisma.pulseDebt.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  const categories = await prisma.pulseFinanceCategory.findMany({ where: { userId: req.user!.id }, orderBy: { name: "asc" } });
  const enriched = await enrichFinanceEntitiesWithShareMeta(req.user!.id, req.user!.role, debtsRaw, goalsRaw);
  res.json({ overview, entries: entries.map(serializeFinanceEntry), goals: enriched.goals, debts: enriched.debts, categories, period, range: { from: rangeStart.format("YYYY-MM-DD"), to: rangeEnd.format("YYYY-MM-DD") } });
}));

router.get("/pulse/finance/categories", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const categories = await ensureDefaultFinanceCategories(req.user!.id);
  res.json({ categories });
}));

router.post("/pulse/finance/categories", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = financeCategorySchema.parse(req.body);
  const category = await prisma.pulseFinanceCategory.upsert({
    where: { userId_name: { userId: req.user!.id, name: body.name } },
    create: { userId: req.user!.id, name: body.name, limitAmount: body.limitAmount ?? null },
    update: { limitAmount: body.limitAmount ?? null },
  });
  res.json({ category });
}));

router.patch("/pulse/finance/categories/:categoryId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseFinanceCategory.findUnique({ where: { id: readSingleParam(req.params.categoryId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Category not found");
  const body = financeCategorySchema.partial().parse(req.body);
  const category = await prisma.pulseFinanceCategory.update({
    where: { id: existing.id },
    data: {
      name: body.name ?? undefined,
      limitAmount: body.limitAmount === undefined ? undefined : body.limitAmount,
    },
  });
  res.json({ category });
}));

router.get("/pulse/finance/entries", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = parseDateOrToday(req.query.date?.toString());
  const entries = await prisma.pulseFinanceEntry.findMany({
    where: { userId: req.user!.id, date: { gte: date.startOf("day").toDate(), lte: date.endOf("day").toDate() } },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ entries: entries.map(serializeFinanceEntry) });
}));

router.post("/pulse/finance/entries", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = financeEntrySchema.parse(req.body);
  const entry = await prisma.pulseFinanceEntry.create({
    data: {
      userId: req.user!.id,
      date: parseDateOrToday(body.date).toDate(),
      type: body.type,
      title: body.title,
      amount: body.amount,
      categoryId: body.categoryId ?? null,
      notes: body.notes ?? null,
      recurrenceJson: body.recurrenceJson ?? null,
    },
    include: { category: true },
  });
  if (body.recurrenceJson) await syncFinanceEntryTask(req.user!.id, entry);
  res.json({ entry: serializeFinanceEntry(entry) });
}));

router.patch("/pulse/finance/entries/:entryId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseFinanceEntry.findUnique({ where: { id: readSingleParam(req.params.entryId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Entry not found");
  const body = financeEntrySchema.partial().parse(req.body);
  const entry = await prisma.pulseFinanceEntry.update({
    where: { id: existing.id },
    data: {
      date: body.date ? parseDateOrToday(body.date).toDate() : undefined,
      type: body.type ?? undefined,
      title: body.title ?? undefined,
      amount: body.amount ?? undefined,
      categoryId: body.categoryId === undefined ? undefined : body.categoryId,
      notes: body.notes === null ? null : body.notes ?? undefined,
      recurrenceJson: body.recurrenceJson === undefined ? undefined : body.recurrenceJson,
    },
    include: { category: true },
  });
  if (entry.recurrenceJson) await syncFinanceEntryTask(req.user!.id, entry);
  res.json({ entry: serializeFinanceEntry(entry) });
}));

router.delete("/pulse/finance/entries/:entryId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseFinanceEntry.findUnique({ where: { id: readSingleParam(req.params.entryId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Entry not found");
  await prisma.pulseFinanceEntry.delete({ where: { id: existing.id } });
  if (existing.linkedTaskId) {
    await prisma.task.updateMany({ where: { id: existing.linkedTaskId, userId: req.user!.id }, data: { deletedAt: new Date() } });
  }
  res.json({ ok: true });
}));

router.get("/pulse/finance/goals", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const goals = await prisma.pulseSavingsGoal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({ goals });
}));

router.post("/pulse/finance/goals", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = savingsGoalSchema.parse(req.body);
  const goal = await prisma.pulseSavingsGoal.create({
    data: {
      userId: req.user!.id,
      title: body.title,
      targetAmount: body.targetAmount,
      savedAmount: body.savedAmount ?? 0,
      deadline: body.deadline ? parseDateOrToday(body.deadline).toDate() : null,
      itemsJson: toPrismaNullableJson(body.items ?? null),
    },
  });
  emitShareArtifactRealtime(req, await syncArtifactStateFromLinkedFinance({ savingsGoalId: goal.id }));
  res.json({ goal });
}));

router.patch("/pulse/finance/goals/:goalId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseSavingsGoal.findUnique({ where: { id: readSingleParam(req.params.goalId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Goal not found");
  const body = savingsGoalSchema.partial().parse(req.body);
  const goal = await prisma.pulseSavingsGoal.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? undefined,
      targetAmount: body.targetAmount ?? undefined,
      savedAmount: body.savedAmount ?? undefined,
      deadline: body.deadline !== undefined ? (body.deadline ? parseDateOrToday(body.deadline).toDate() : null) : undefined,
      itemsJson: body.items === undefined ? undefined : toPrismaNullableJson(body.items ?? null),
    },
  });
  emitShareArtifactRealtime(req, await syncArtifactStateFromLinkedFinance({ savingsGoalId: goal.id }));
  res.json({ goal });
}));

router.delete("/pulse/finance/goals/:goalId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseSavingsGoal.findUnique({ where: { id: readSingleParam(req.params.goalId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Goal not found");
  const realtimeTargets = await unlinkArtifactLinkedFinance({ savingsGoalId: existing.id });
  await prisma.pulseSavingsGoal.delete({ where: { id: existing.id } });
  emitShareArtifactRealtime(req, realtimeTargets);
  res.json({ ok: true });
}));

router.get("/pulse/finance/debts", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const debts = await prisma.pulseDebt.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({ debts });
}));

router.post("/pulse/finance/debts", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = debtSchema.parse(req.body);
  const debt = await prisma.pulseDebt.create({
    data: {
      userId: req.user!.id,
      title: body.title,
      debtType: body.debtType,
      totalAmount: body.totalAmount,
      paidAmount: body.paidAmount ?? 0,
      interestRate: body.interestRate ?? null,
      startedAt: body.startedAt ? parseDateOrToday(body.startedAt).toDate() : null,
      dueDate: body.dueDate ? parseDateOrToday(body.dueDate).toDate() : null,
      paymentDay: body.paymentDay ?? null,
      paymentAmount: body.paymentAmount ?? null,
      termMonths: body.termMonths ?? null,
      notes: body.notes ?? null,
    },
  });
  if (debt.paymentDay) await syncDebtTask(req.user!.id, debt);
  emitShareArtifactRealtime(req, await syncArtifactStateFromLinkedFinance({ debtId: debt.id }));
  res.json({ debt });
}));

router.patch("/pulse/finance/debts/:debtId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseDebt.findUnique({ where: { id: readSingleParam(req.params.debtId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Debt not found");
  const body = debtSchema.partial().parse(req.body);
  const debt = await prisma.pulseDebt.update({
    where: { id: existing.id },
    data: {
      title: body.title ?? undefined,
      debtType: body.debtType ?? undefined,
      totalAmount: body.totalAmount ?? undefined,
      paidAmount: body.paidAmount ?? undefined,
      interestRate: body.interestRate === undefined ? undefined : body.interestRate,
      startedAt: body.startedAt !== undefined ? (body.startedAt ? parseDateOrToday(body.startedAt).toDate() : null) : undefined,
      dueDate: body.dueDate !== undefined ? (body.dueDate ? parseDateOrToday(body.dueDate).toDate() : null) : undefined,
      paymentDay: body.paymentDay === undefined ? undefined : body.paymentDay,
      paymentAmount: body.paymentAmount === undefined ? undefined : body.paymentAmount,
      termMonths: body.termMonths === undefined ? undefined : body.termMonths,
      notes: body.notes === null ? null : body.notes ?? undefined,
    },
  });
  if (debt.paymentDay) await syncDebtTask(req.user!.id, debt);
  emitShareArtifactRealtime(req, await syncArtifactStateFromLinkedFinance({ debtId: debt.id }));
  res.json({ debt });
}));

router.delete("/pulse/finance/debts/:debtId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const existing = await prisma.pulseDebt.findUnique({ where: { id: readSingleParam(req.params.debtId) } });
  if (!existing || existing.userId !== req.user!.id) throw new HttpError(404, "Debt not found");
  const realtimeTargets = await unlinkArtifactLinkedFinance({ debtId: existing.id });
  await prisma.pulseDebt.delete({ where: { id: existing.id } });
  await prisma.task.updateMany({ where: { userId: req.user!.id, sourceKey: `debt:${existing.id}` }, data: { deletedAt: new Date() } });
  emitShareArtifactRealtime(req, realtimeTargets);
  res.json({ ok: true });
}));

router.get("/pulse/analytics", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const days = [7, 14, 30].includes(Number(req.query.days ?? 7)) ? Number(req.query.days ?? 7) : 7;
  const to = dayjs().endOf("day");
  const from = dayjs().subtract(days - 1, "day").startOf("day");
  const healthRows = await prisma.healthDay.findMany({
    where: { userId: req.user!.id, date: { gte: from.toDate(), lte: to.toDate() } },
    orderBy: { date: "asc" },
  });
  const meals = await prisma.pulseMeal.findMany({
    where: { userId: req.user!.id, date: { gte: from.toDate(), lte: to.toDate() } },
    orderBy: { date: "asc" },
  });
  const tasksRaw = await prisma.task.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    include: { completions: { where: { date: { gte: from.toDate(), lte: to.toDate() } } } },
  });
  const profile = await prisma.pulseProfile.findUnique({ where: { userId: req.user!.id } });
  const nutritionGoal = await resolveNutritionGoal(req.user!.id);

  const taskSeries = [] as Array<{ date: string; percent: number; completed: number; total: number }>;
  const mealsByDay = new Map<string, any[]>();
  meals.forEach((meal) => {
    const key = toDateKey(meal.date);
    mealsByDay.set(key, [...(mealsByDay.get(key) ?? []), meal]);
  });
  for (let i = 0; i < days; i += 1) {
    const date = from.add(i, "day");
    const key = date.format("YYYY-MM-DD");
    const dayTasks = tasksRaw.filter((task) => taskMatchesDate(task, date)).map((task) => {
      const completion = task.completions.find((item) => toDateKey(item.date) === key);
      const recurrence = (task.recurrenceJson || {}) as any;
      return {
        completedForDate: completion?.completed ?? (((recurrence.taskType ?? "ONE_TIME") === "ONE_TIME") && task.dueDate ? Boolean(task.completed && dayjs(task.dueDate).isSame(date, "day")) : false),
      };
    });
    const summary = taskSummaryForDay(dayTasks as any[]);
    taskSeries.push({ date: key, percent: summary.percent, completed: summary.completed, total: summary.total });
  }

  const habitStreaks = tasksRaw
    .filter((task) => ((task.recurrenceJson as any)?.taskType ?? "") === "HABIT")
    .map((task) => {
      let streak = 0;
      for (let i = 0; i < 90; i += 1) {
        const date = dayjs().subtract(i, "day");
        const completion = task.completions.find((item) => toDateKey(item.date) === date.format("YYYY-MM-DD"));
        if (completion?.completed) streak += 1;
        else break;
      }
      return { id: task.id, title: task.title, streak };
    })
    .sort((a, b) => b.streak - a.streak);

  const weightLine = healthRows.map((row) => ({ date: toDateKey(row.date), value: row.weightKg ?? profile?.currentWeightKg ?? null }));
  const calorieLine = Array.from({ length: days }).map((_, index) => {
    const date = from.add(index, "day");
    const key = date.format("YYYY-MM-DD");
    const calories = (mealsByDay.get(key) ?? []).reduce((sum, meal) => sum + meal.totalCalories, 0);
    return { date: key, calories, target: nutritionGoal?.dailyCalories ?? null };
  });

  const suggestions: string[] = [];
  const lastMental = healthRows.slice(-3);
  if (lastMental.length === 3 && lastMental.every((row) => (row.stress ?? 0) >= 6)) {
    suggestions.push("Стресс держится высоким 3 дня подряд — попробуй уменьшить обязательства на ближайшие 24 часа.");
  }
  const lastTasks = taskSeries.slice(-3);
  if (lastTasks.length === 3 && lastTasks.every((row) => row.percent < 45)) {
    suggestions.push("Низкая завершённость задач за последние 3 дня — сократи количество обязательных пунктов и выдели один главный фокус.");
  }
  if (calorieLine.slice(-3).every((row) => nutritionGoal?.dailyCalories && row.calories < nutritionGoal.dailyCalories * 0.7)) {
    suggestions.push("Ты стабильно недобираешь калории — это может влиять на энергию и ментальное состояние.");
  }
  if (!suggestions.length) {
    suggestions.push("Общая динамика стабильная — продолжай вести данные, чтобы советы стали точнее.");
  }

  res.json({
    days,
    healthRows,
    taskSeries,
    calorieLine,
    weightLine,
    habitStreaks,
    suggestions,
  });
}));

export default router;
