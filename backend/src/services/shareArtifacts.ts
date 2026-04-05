import dayjs from "dayjs";
import { prisma } from "../db/prisma";
import { HttpError } from "../utils/http";
import type { ViewerContext } from "./programs/helpers";
import { cloneJson, makeInviteToken, toPrismaNullableJson } from "./programs/helpers";

type ArtifactMode = "SNAPSHOT" | "REFERENCE" | "INVITE";
type ArtifactVisibility = "PRIVATE" | "RESTRICTED" | "PUBLIC";
type ArtifactKind =
  | "WIDGET"
  | "METRIC"
  | "PROGRAM"
  | "PROGRAM_INVITE"
  | "SESSION_INVITE"
  | "PROGRAM_SUMMARY"
  | "PROGRAM_PROGRESS"
  | "ACHIEVEMENT"
  | "TODAY_ACTIONS"
  | "TASK"
  | "FINANCE"
  | "DEBT"
  | "SAVINGS"
  | "ACTION";
type ArtifactActionType =
  | "TASK_REQUEST"
  | "TASK_SUGGESTION"
  | "SOCIAL_EVENT"
  | "REMINDER_CARD"
  | "FINANCE_SPLIT"
  | "DEBT_SHARE"
  | "SAVINGS_SHARE"
  | "PROGRAM_INVITE"
  | "PROGRAM_SESSION_INVITE"
  | "PROGRAM_PROGRESS_SHARE"
  | "METRIC_SHARE";

type ArtifactAction =
  | "OPEN"
  | "ACCEPT"
  | "DECLINE"
  | "ADD_TO_SELF"
  | "MARK_COMPLETED"
  | "FOLLOW";

export type CreateShareInput = {
  ownerId: string;
  sourceType: string;
  sourceId?: string | null;
  kind: ArtifactKind;
  mode: ArtifactMode;
  actionType?: ArtifactActionType | null;
  visibilityScope?: ArtifactVisibility;
  title?: string | null;
  description?: string | null;
  explicitPublicShare?: boolean;
  payload?: Record<string, unknown> | null;
  originChatId?: string | null;
  originMessageId?: string | null;
  participantUserIds?: string[];
};

export type ArtifactResponse = "ACCEPT" | "DECLINE" | "FOLLOW";

const TASK_LIKE_ACTIONS = new Set<ArtifactActionType>([
  "TASK_REQUEST",
  "TASK_SUGGESTION",
  "SOCIAL_EVENT",
  "REMINDER_CARD",
]);

const SOURCE_TASK_TYPES = new Set(["TASK", "TASK_DAY"]);
const SOURCE_FINANCE_TYPES = new Set(["FINANCE_ENTRY", "FINANCE_OVERVIEW"]);
const ACCEPT_FIRST_FINANCE_ACTIONS = new Set<ArtifactActionType>([
  "FINANCE_SPLIT",
  "DEBT_SHARE",
  "SAVINGS_SHARE",
]);
const compactUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
} as const;

function compactUser(user: { id: string; username: string; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null; role?: string | null }) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role ?? null,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatAmount(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value);
}

function formatDateTimeLabel(value?: string | Date | null) {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) return "";
  return parsed.format(parsed.hour() || parsed.minute() ? "D MMM, HH:mm" : "D MMM");
}

function toParticipantStatusLabel(status?: string | null) {
  if (status === "COMPLETED") return "Выполнено";
  if (status === "ADDED") return "Добавлено";
  if (status === "ACCEPTED") return "Принято";
  if (status === "DECLINED") return "Отклонено";
  if (status === "FOLLOWING") return "Слежу";
  return "Ожидает";
}

function buildArtifactTaskSourceKey(artifactId: string) {
  return `artifact:${artifactId}`;
}

function buildArtifactSubtaskSourceKey(artifactId: string, subtaskKey: string) {
  return `artifact:${artifactId}:subtask:${subtaskKey}`;
}

function readArtifactTaskSourceMeta(value?: string | null) {
  if (!isArtifactTaskSourceKey(value)) return null;
  const raw = String(value).slice("artifact:".length);
  if (!raw) return null;
  const [artifactId, kind, subtaskKey] = raw.split(":");
  return {
    artifactId: artifactId || null,
    kind: kind === "subtask" && subtaskKey ? "SUBTASK" : "PRIMARY",
    subtaskKey: kind === "subtask" && subtaskKey ? subtaskKey : null,
  } as const;
}

function getArtifactPayload(artifact: any) {
  return (artifact?.payloadJson ?? {}) as Record<string, unknown>;
}

function getSharingScope(payload?: Record<string, unknown> | null) {
  return payload?.sharingScope === "SHARED" ? "SHARED" : "PERSONAL";
}

function getParticipantUserIdsFromPayload(payload?: Record<string, unknown> | null) {
  return Array.isArray(payload?.participantUserIds)
    ? payload!.participantUserIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isOwnerParticipating(artifact: any) {
  const payload = getArtifactPayload(artifact);
  return getParticipantUserIdsFromPayload(payload).includes(String(artifact?.ownerId ?? ""));
}

function isTaskLikeArtifact(artifact: any) {
  return TASK_LIKE_ACTIONS.has(artifact?.actionType as ArtifactActionType);
}

function isDebtArtifact(artifact: any) {
  return artifact?.actionType === "DEBT_SHARE" || artifact?.sourceType === "DEBT";
}

function isSavingsArtifact(artifact: any) {
  return artifact?.actionType === "SAVINGS_SHARE" || artifact?.sourceType === "SAVINGS_GOAL";
}

function requiresAcceptBeforeAdd(artifact: any) {
  return (
    isTaskLikeArtifact(artifact) ||
    ACCEPT_FIRST_FINANCE_ACTIONS.has(artifact?.actionType as ArtifactActionType) ||
    artifact?.sourceType === "DEBT" ||
    artifact?.sourceType === "SAVINGS_GOAL"
  );
}

function shouldAutoMaterializeTaskOnAccept(artifact: any) {
  return isTaskLikeArtifact(artifact);
}

function shouldAutoMaterializeFinanceOnAccept(artifact: any) {
  return artifact?.actionType === "FINANCE_SPLIT" || isDebtArtifact(artifact) || isSavingsArtifact(artifact);
}

function shouldAutoMaterializeOnAccept(artifact: any) {
  return shouldAutoMaterializeTaskOnAccept(artifact) || shouldAutoMaterializeFinanceOnAccept(artifact);
}

export function isArtifactTaskSourceKey(value?: string | null) {
  return typeof value === "string" && value.startsWith("artifact:");
}

export function readArtifactIdFromTaskSourceKey(value?: string | null) {
  return readArtifactTaskSourceMeta(value)?.artifactId ?? null;
}

function readAcceptanceMeta(acceptance: any) {
  return ((acceptance?.metaJson ?? {}) as Record<string, unknown>) || {};
}

function readAcceptanceChildTaskIds(acceptance: any) {
  const value = readAcceptanceMeta(acceptance).childTaskIds;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function withAcceptanceMeta(acceptance: any, nextMeta: Record<string, unknown>) {
  return {
    ...(readAcceptanceMeta(acceptance) ?? {}),
    ...nextMeta,
  };
}

function readEventSubtasks(payload?: Record<string, unknown> | null) {
  if (!Array.isArray(payload?.subtasks)) return [];
  return payload.subtasks
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return null;
      return {
        key: typeof row.key === "string" && row.key.trim() ? row.key.trim() : `subtask-${index + 1}`,
        title,
        description: typeof row.description === "string" && row.description.trim() ? row.description.trim() : null,
        dueAt: typeof row.dueAt === "string" && row.dueAt.trim() ? row.dueAt.trim() : null,
        time: typeof row.time === "string" && row.time.trim() ? row.time.trim() : null,
        endTime: typeof row.endTime === "string" && row.endTime.trim() ? row.endTime.trim() : null,
        assignmentMode:
          row.assignmentMode === "ALL" || row.assignmentMode === "ANYONE" || row.assignmentMode === "PERSONAL"
            ? row.assignmentMode
            : "PERSONAL",
        assigneeUserId: typeof row.assigneeUserId === "string" && row.assigneeUserId.trim() ? row.assigneeUserId.trim() : null,
      };
    })
    .filter(Boolean) as Array<{
      key: string;
      title: string;
      description: string | null;
      dueAt: string | null;
      time: string | null;
      endTime: string | null;
      assignmentMode: "PERSONAL" | "ALL" | "ANYONE";
      assigneeUserId: string | null;
    }>;
}

function getEventSubtaskAssigneeIds(
  subtask: { assignmentMode: "PERSONAL" | "ALL" | "ANYONE"; assigneeUserId: string | null },
  participantIds: string[],
) {
  if (subtask.assignmentMode === "PERSONAL") {
    return subtask.assigneeUserId ? [subtask.assigneeUserId] : [];
  }
  return participantIds;
}

function readTaskRecurrenceMeta(task: any) {
  return ((task?.recurrenceJson ?? {}) as Record<string, unknown>) || {};
}

function validateShareArtifactPayload(input: CreateShareInput) {
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const participantUserIds = Array.from(
    new Set(
      (Array.isArray(payload.participantUserIds) ? payload.participantUserIds : input.participantUserIds ?? []).filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ),
    ),
  );

  if (input.actionType === "SOCIAL_EVENT") {
    for (const subtask of readEventSubtasks(payload)) {
      if (subtask.assignmentMode === "PERSONAL" && (!subtask.assigneeUserId || !participantUserIds.includes(subtask.assigneeUserId))) {
        throw new HttpError(400, "Personal event subtasks must target a selected participant");
      }
    }
  }

  if (input.actionType === "FINANCE_SPLIT") {
    const totalAmount = roundMoney(Number(payload.totalAmount ?? 0));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new HttpError(400, "Bill total amount must be greater than zero");
    }
    if (Array.isArray(payload.shares)) {
      const seenUsers = new Set<string>();
      const assignedTotal = roundMoney(
        payload.shares.reduce((sum, item) => {
          if (!item || typeof item !== "object") return sum;
          const row = item as Record<string, unknown>;
          const userId = typeof row.userId === "string" ? row.userId.trim() : "";
          const amount = roundMoney(Number(row.amount ?? 0));
          if (!userId || !participantUserIds.includes(userId)) {
            throw new HttpError(400, "Manual bill split contains an invalid participant");
          }
          if (seenUsers.has(userId)) {
            throw new HttpError(400, "Manual bill split contains duplicate participant");
          }
          if (!Number.isFinite(amount) || amount < 0) {
            throw new HttpError(400, "Manual bill split amount must be zero or greater");
          }
          seenUsers.add(userId);
          return sum + amount;
        }, 0),
      );
      if (assignedTotal > totalAmount) {
        throw new HttpError(400, "Manual bill split cannot exceed bill total");
      }
    }
  }
}

function taskMatchesDate(task: any, selected: dayjs.Dayjs) {
  const recurrence = (task.recurrenceJson || {}) as any;
  const taskType = recurrence.taskType || (recurrence.scheduleType && recurrence.scheduleType !== "NONE" ? "REGULAR" : "ONE_TIME");
  const due = task.dueDate ? dayjs(task.dueDate).startOf("day") : null;
  const weekday = (selected.day() + 6) % 7;
  const dayOfMonth = selected.date();

  if (taskType === "HABIT") return true;
  if (taskType === "REGULAR") {
    const scheduleType = recurrence.scheduleType || "WEEKLY";
    if (scheduleType === "DAILY") return true;
    if (scheduleType === "WEEKLY") {
      const days = Array.isArray(recurrence.daysOfWeek) ? recurrence.daysOfWeek : [];
      if (days.length) return days.includes(weekday);
      return due ? weekday === ((due.day() + 6) % 7) : false;
    }
    if (scheduleType === "MONTHLY") {
      const days = Array.isArray(recurrence.daysOfMonth) ? recurrence.daysOfMonth : [];
      if (days.length) return days.includes(dayOfMonth);
      return due ? due.date() === dayOfMonth : false;
    }
  }

  return due ? due.isSame(selected, "day") : taskType === "ONE_TIME";
}

function buildProgramSnapshot(program: any) {
  return {
    label: "Программа",
    title: program.title,
    description: program.description,
    primary: program.durationDays ? `${program.durationDays} дн.` : "Без срока",
    secondary: [program.category, program.theme].filter(Boolean).join(" • "),
  };
}

function buildRunSnapshot(run: any) {
  return {
    label: "Прогресс программы",
    title: run.programVersion.title,
    description: run.programVersion.description,
    primary: `${run.completionPercent}%`,
    secondary: `Серия ${run.streakCount} • следование ${run.adherenceScore}%`,
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
    description: actions.slice(0, 3).map((action) => action.title).join(" • "),
    primary: `${actions.filter((action) => action.required).length} обязательных`,
    secondary: actions.length > 3 ? `Ещё ${actions.length - 3}` : "Без хвоста",
  };
}

function buildSessionSnapshot(session: any) {
  const statusMap: Record<string, string> = {
    ACTIVE: "Активна",
    SCHEDULED: "Запланирована",
    COMPLETED: "Завершена",
    CANCELLED: "Отменена",
    ARCHIVED: "В архиве",
    DRAFT: "Черновик",
  };
  const joinMap: Record<string, string> = {
    LINK: "По ссылке",
    OPEN: "Открытая",
    INVITE_ONLY: "По приглашению",
  };
  const startMap: Record<string, string> = {
    NOW: "Сразу",
    SCHEDULED: "По расписанию",
    AUTO_ON_ACCEPT: "Автостарт",
    HOST_MANUAL: "Стартует хост",
  };

  return {
    label: "Приглашение",
    title: session.title ?? session.programVersion.title,
    description: "Совместное прохождение",
    primary: statusMap[session.status] ?? "Черновик",
    secondary: [joinMap[session.joinMode], startMap[session.startMode]].filter(Boolean).join(" • "),
  };
}

function buildTaskSnapshot(task: any) {
  return {
    label: task.kind === "EVENT" ? "Событие" : "Задача",
    title: task.title,
    description: task.notes ?? "",
    primary: task.dueDate ? formatDateTimeLabel(task.dueDate) : "Без времени",
    secondary: task.completed ? "Уже выполнена" : task.priority ? `Приоритет ${task.priority}` : "",
  };
}

function buildTaskDaySnapshot(selectedDate: dayjs.Dayjs, tasks: any[]) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completedForDate).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return {
    label: "Задачи на день",
    title: `${completed}/${total} выполнено`,
    description: tasks.slice(0, 3).map((task) => task.title).join(" • "),
    primary: `${percent}%`,
    secondary: formatDateTimeLabel(selectedDate.toDate()),
  };
}

function buildNutritionSnapshot(totalCalories: number, goalCalories?: number | null) {
  const remaining = goalCalories != null ? Math.max(goalCalories - totalCalories, 0) : null;
  return {
    label: "Питание",
    title: "Калории за сегодня",
    description: remaining != null ? `Осталось ${remaining} ккал` : "Только снимок на сейчас",
    primary: `${Math.round(totalCalories)} ккал`,
    secondary: goalCalories ? `Цель ${goalCalories}` : "",
  };
}

function buildMentalSnapshot(day: any) {
  return {
    label: "Состояние",
    title: "Ментальное состояние",
    description: day?.comment ?? "",
    primary: day ? `${day.todayScore}%` : "Нет записи",
    secondary: day?.pulse7Score != null ? `Pulse7 ${day.pulse7Score}%` : "",
  };
}

function buildFinanceOverviewSnapshot(summary: { income: number; expenses: number; goalsCount: number; debtsCount: number }) {
  return {
    label: "Финансы",
    title: "Финансы за день",
    description: summary.goalsCount || summary.debtsCount ? `Целей ${summary.goalsCount} • долгов ${summary.debtsCount}` : "",
    primary: formatAmount(summary.expenses),
    secondary: `Доход ${formatAmount(summary.income)}`,
  };
}

function buildFinanceEntrySnapshot(entry: any) {
  return {
    label: entry.type === "INCOME" ? "Доход" : "Расход",
    title: entry.title,
    description: entry.notes ?? "",
    primary: formatAmount(entry.amount),
    secondary: [entry.category?.name, formatDateTimeLabel(entry.date)].filter(Boolean).join(" • "),
  };
}

function buildDebtSnapshot(debt: any) {
  const remaining = Math.max(Number(debt.totalAmount ?? 0) - Number(debt.paidAmount ?? 0), 0);
  return {
    label: "Долг",
    title: debt.title,
    description: debt.notes ?? debt.debtType,
    primary: `${formatAmount(remaining)} осталось`,
    secondary: debt.dueDate ? `До ${formatDateTimeLabel(debt.dueDate)}` : formatAmount(debt.totalAmount),
  };
}

function buildSavingsSnapshot(goal: any) {
  const targetAmount = Number(goal.targetAmount ?? 0);
  const savedAmount = Number(goal.savedAmount ?? 0);
  const percent = targetAmount > 0 ? Math.round((savedAmount / targetAmount) * 100) : 0;
  return {
    label: "Накопление",
    title: goal.title,
    description: goal.deadline ? `До ${formatDateTimeLabel(goal.deadline)}` : "",
    primary: `${percent}%`,
    secondary: `${formatAmount(savedAmount)} из ${formatAmount(targetAmount)}`,
  };
}

function buildActionArtifactSnapshot(actionType: ArtifactActionType, payload: Record<string, unknown> | null | undefined) {
  const data = payload ?? {};
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Без названия";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const dueAt = typeof data.dueAt === "string" ? data.dueAt : null;
  const totalAmount = typeof data.totalAmount === "number" ? data.totalAmount : null;
  const targetAmount = typeof data.targetAmount === "number" ? data.targetAmount : null;
  const savedAmount = typeof data.savedAmount === "number" ? data.savedAmount : 0;

  if (actionType === "FINANCE_SPLIT") {
    return {
      label: "Общий счёт",
      title,
      description,
      primary: totalAmount != null ? formatAmount(totalAmount) : "Сумма не указана",
      secondary: dueAt ? formatDateTimeLabel(dueAt) : "Каждый принимает счёт и получает личный долг",
    };
  }

  if (actionType === "DEBT_SHARE") {
    return {
      label: "Долг",
      title,
      description,
      primary: totalAmount != null ? formatAmount(totalAmount) : "Сумма не указана",
      secondary: dueAt ? `До ${formatDateTimeLabel(dueAt)}` : "",
    };
  }

  if (actionType === "SAVINGS_SHARE") {
    const percent = targetAmount ? Math.round((savedAmount / targetAmount) * 100) : 0;
    return {
      label: "Накопление",
      title,
      description,
      primary: targetAmount != null ? `${percent}%` : "Цель без суммы",
      secondary: targetAmount != null ? `${formatAmount(savedAmount)} из ${formatAmount(targetAmount)}` : "",
    };
  }

  if (actionType === "SOCIAL_EVENT") {
    return {
      label: "Событие",
      title,
      description,
      primary: dueAt ? formatDateTimeLabel(dueAt) : "Без даты",
      secondary: "После принятия сразу появится в задачах",
    };
  }

  if (actionType === "REMINDER_CARD") {
    return {
      label: "Событие",
      title,
      description,
      primary: dueAt ? formatDateTimeLabel(dueAt) : "Без даты",
      secondary: "После принятия сразу появится в задачах",
    };
  }

  return {
    label: "Событие",
    title,
    description,
    primary: dueAt ? formatDateTimeLabel(dueAt) : "Без даты",
    secondary: "После принятия сразу появится в задачах",
  };
}

async function loadArtifactAcceptancesWithLinks(artifact: any) {
  if (
    Array.isArray(artifact?.acceptances) &&
    artifact.acceptances.every((item: any) => item?.user)
  ) {
    return artifact.acceptances;
  }

  return prisma.pulseArtifactAcceptance.findMany({
    where: { artifactId: artifact.id },
    include: {
      user: {
        select: compactUserSelect,
      },
      task: true,
      financeEntry: true,
      debt: true,
      savingsGoal: true,
    },
    orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
  });
}

function buildArtifactStatusMeta(acceptance: any) {
  return {
    status: acceptance.status,
    statusLabel: toParticipantStatusLabel(acceptance.status),
    accepted: Boolean(acceptance.acceptedAt),
    added: Boolean(acceptance.addedAt),
    completed: Boolean(acceptance.completedAt),
  };
}

function buildProgressParticipantRow(
  acceptance: any,
  config: {
    totalAmount: number;
    currentAmount: number;
    currentLabelPrefix: string;
    emptySummary: string;
  },
) {
  const totalAmount = Math.max(config.totalAmount, 0);
  const currentAmount = Math.max(config.currentAmount, 0);
  const progressPercent = totalAmount > 0 ? clampPercent((currentAmount / totalAmount) * 100) : 0;
  const summary =
    currentAmount > 0
      ? `${config.currentLabelPrefix}: ${formatAmount(currentAmount)} из ${formatAmount(totalAmount)}`
      : config.emptySummary;

  return {
    userId: acceptance.userId,
    username: acceptance.user?.username ?? "user",
    avatarUrl: acceptance.user?.avatarUrl ?? null,
    role: acceptance.role,
    ...buildArtifactStatusMeta(acceptance),
    currentAmount,
    totalAmount,
    currentLabel: formatAmount(currentAmount),
    totalLabel: formatAmount(totalAmount),
    progressPercent,
    progressLabel: `${formatAmount(currentAmount)} из ${formatAmount(totalAmount)}`,
    summary,
  };
}

function buildBillLiveSnapshot(artifact: any, acceptances: any[]) {
  const payload = getArtifactPayload(artifact);
  const baseSnapshot = buildActionArtifactSnapshot("FINANCE_SPLIT", payload);
  const totalAmount = Math.max(Number(payload.totalAmount ?? 0), 0);
  const includeOwner = isOwnerParticipating(artifact);
  const participantAcceptances = acceptances.filter((item) => includeOwner || item.role !== "AUTHOR");
  const fallbackCount = participantAcceptances.length || 1;
  const participants = participantAcceptances.map((acceptance) => {
    const shareAmount = resolveFinanceSplitAmount(artifact, acceptance.userId, fallbackCount);
    const paidAmount = roundMoney(Number(acceptance.debt?.paidAmount ?? 0));
    return buildProgressParticipantRow(acceptance, {
      totalAmount: shareAmount,
      currentAmount: paidAmount,
      currentLabelPrefix: "Оплачено",
      emptySummary: acceptance.acceptedAt ? "Счёт принят, оплата ещё не внесена" : "Ожидает принятия счёта",
    });
  });
  const totalPaid = roundMoney(participants.reduce((sum, item) => sum + item.currentAmount, 0));
  const acceptedCount = participantAcceptances.filter((item) => item.acceptedAt).length;

  return {
    ...baseSnapshot,
    secondary: [
      typeof payload.dueAt === "string" ? formatDateTimeLabel(payload.dueAt) : "",
      participantAcceptances.length ? `${acceptedCount}/${participantAcceptances.length} приняли счёт` : "",
    ]
      .filter(Boolean)
      .join(" • "),
    progressCaption: "Общий прогресс счёта",
    progressPercent: totalAmount > 0 ? clampPercent((totalPaid / totalAmount) * 100) : 0,
    progressLabel: `${formatAmount(totalPaid)} из ${formatAmount(totalAmount)}`,
    overallCompleted: totalAmount > 0 && totalPaid >= totalAmount,
    participants,
  };
}

function buildDebtOrSavingsLiveSnapshot(artifact: any, acceptances: any[], kind: "DEBT" | "SAVINGS") {
  const payload = getArtifactPayload(artifact);
  const baseSnapshot =
    kind === "DEBT"
      ? buildActionArtifactSnapshot("DEBT_SHARE", payload)
      : buildActionArtifactSnapshot("SAVINGS_SHARE", payload);
  const sharingScope = getSharingScope(payload);
  const shouldIncludeAuthor = sharingScope === "SHARED";
  const relevantAcceptances = acceptances.filter((item) => shouldIncludeAuthor || item.role !== "AUTHOR");
  const sourceTotalAmount =
    kind === "DEBT"
      ? Math.max(Number(payload.totalAmount ?? 0), 0)
      : Math.max(Number(payload.targetAmount ?? 0), 0);
  const totalAmount =
    sourceTotalAmount ||
    Math.max(
      ...acceptances.map((item) =>
        Number(kind === "DEBT" ? item.debt?.totalAmount ?? 0 : item.savingsGoal?.targetAmount ?? 0),
      ),
      0,
    );

  const participants = relevantAcceptances.map((acceptance) => {
    const currentAmount =
      kind === "DEBT"
        ? roundMoney(Number(acceptance.debt?.paidAmount ?? 0))
        : roundMoney(Number(acceptance.savingsGoal?.savedAmount ?? 0));

    return buildProgressParticipantRow(acceptance, {
      totalAmount,
      currentAmount,
      currentLabelPrefix: kind === "DEBT" ? "Погашено" : "Накоплено",
      emptySummary:
        kind === "DEBT"
          ? acceptance.acceptedAt
            ? "Долг принят, погашений пока нет"
            : "Ожидает принятия долга"
          : acceptance.acceptedAt
            ? "Накопление принято, пополнений пока нет"
            : "Ожидает принятия накопления",
    });
  });

  const aggregatedAmount = roundMoney(participants.reduce((sum, item) => sum + item.currentAmount, 0));
  const authorAcceptance = acceptances.find((item) => item.role === "AUTHOR");
  const sourceCurrentAmount = roundMoney(
    Number(kind === "DEBT" ? authorAcceptance?.debt?.paidAmount ?? 0 : authorAcceptance?.savingsGoal?.savedAmount ?? 0),
  );
  const normalizedCurrentAmount =
    sharingScope === "SHARED"
      ? Math.min(aggregatedAmount, totalAmount || aggregatedAmount)
      : Math.max(aggregatedAmount, sourceCurrentAmount);
  const invitedCount = acceptances.filter((item) => item.role !== "AUTHOR").length;
  const acceptedCount = acceptances.filter((item) => item.role !== "AUTHOR" && item.acceptedAt).length;

  return {
    ...baseSnapshot,
    description:
      [
        baseSnapshot.description,
        sharingScope === "SHARED" ? "Общий прогресс между участниками" : "Личная цель для того, кто примет карточку",
      ]
        .filter(Boolean)
        .join(". "),
    secondary: [
      baseSnapshot.secondary,
      invitedCount ? `${acceptedCount}/${invitedCount} приняли` : "",
    ]
      .filter(Boolean)
      .join(" • "),
    progressCaption: kind === "DEBT" ? "Общий прогресс долга" : "Общий прогресс накопления",
    progressPercent: totalAmount > 0 ? clampPercent((normalizedCurrentAmount / totalAmount) * 100) : 0,
    progressLabel: `${formatAmount(normalizedCurrentAmount)} из ${formatAmount(totalAmount)}`,
    overallCompleted: totalAmount > 0 && normalizedCurrentAmount >= totalAmount,
    participants,
    sharingScope,
  };
}

async function buildTaskLikeLiveSnapshot(artifact: any, acceptances: any[]) {
  const payload = getArtifactPayload(artifact);
  const baseSnapshot = buildActionArtifactSnapshot(artifact.actionType as ArtifactActionType, payload);
  const includeOwner = isOwnerParticipating(artifact);
  const relevantAcceptances = acceptances.filter((item) => includeOwner || item.role !== "AUTHOR");
  const total = relevantAcceptances.length || 1;
  const acceptedCount = relevantAcceptances.filter((item) => item.acceptedAt).length;
  const eventSubtasks = readEventSubtasks(payload);
  const childTaskIds = Array.from(new Set(relevantAcceptances.flatMap((acceptance) => readAcceptanceChildTaskIds(acceptance))));
  const childTasks = childTaskIds.length
    ? await prisma.task.findMany({
        where: {
          id: { in: childTaskIds },
          deletedAt: null,
        },
      })
    : [];
  const childTaskMap = new Map(childTasks.map((task) => [task.id, task]));
  const completedCount = relevantAcceptances.filter((item) => item.completedAt).length;
  let aggregateSubtaskTotal = 0;
  let aggregateSubtaskCompleted = 0;

  const participants = relevantAcceptances.map((acceptance) => {
    const completed = Boolean(acceptance.completedAt);
    const added = Boolean(acceptance.addedAt || acceptance.taskId);
    const accepted = Boolean(acceptance.acceptedAt);
    const declined = Boolean(acceptance.declinedAt);
    const participantChildTaskIds = readAcceptanceChildTaskIds(acceptance);
    const participantSubtaskTotal = participantChildTaskIds.length;
    const participantSubtaskCompleted = participantChildTaskIds.filter((taskId) => Boolean(childTaskMap.get(taskId)?.completed)).length;
    const hasSubtasks = eventSubtasks.length > 0 || participantSubtaskTotal > 0;

    aggregateSubtaskTotal += participantSubtaskTotal;
    aggregateSubtaskCompleted += participantSubtaskCompleted;

    const normalizedParticipantSubtaskTotal = Math.max(participantSubtaskTotal, eventSubtasks.length);
    const progressPercent = hasSubtasks
      ? (normalizedParticipantSubtaskTotal ? clampPercent((participantSubtaskCompleted / normalizedParticipantSubtaskTotal) * 100) : 0)
      : completed
        ? 100
        : 0;
    const summary = hasSubtasks
      ? completed
        ? `Событие отмечено выполненным • ${participantSubtaskCompleted}/${normalizedParticipantSubtaskTotal} задач`
        : `${participantSubtaskCompleted}/${normalizedParticipantSubtaskTotal} задач выполнено`
      : completed
        ? "Событие завершено"
        : added
          ? "Добавил(а) в ежедневник"
          : accepted
            ? "Принял(а), но ещё не завершил(а)"
            : declined
              ? "Отказался(лась)"
              : "Ещё не принял(а)";

    return {
      userId: acceptance.userId,
      username: acceptance.user?.username ?? "user",
      avatarUrl: acceptance.user?.avatarUrl ?? null,
      role: acceptance.role,
      ...buildArtifactStatusMeta(acceptance),
      progressPercent,
      summary,
    };
  });

  const hasSubtasks = eventSubtasks.length > 0 || aggregateSubtaskTotal > 0;
  const normalizedSubtaskTotal = hasSubtasks ? Math.max(aggregateSubtaskTotal, eventSubtasks.length * total) : 0;
  const progressPercent = hasSubtasks
    ? (normalizedSubtaskTotal ? clampPercent((aggregateSubtaskCompleted / normalizedSubtaskTotal) * 100) : 0)
    : clampPercent((completedCount / total) * 100);
  const progressCaption = hasSubtasks ? "Прогресс по задачам события" : "Кто уже завершил событие";
  const progressLabel = hasSubtasks
    ? `${aggregateSubtaskCompleted}/${normalizedSubtaskTotal} задач выполнено`
    : `${completedCount}/${total} выполнили`;

  return {
    ...baseSnapshot,
    secondary: [
      baseSnapshot.primary,
      `${acceptedCount}/${total} участвуют`,
    ]
      .filter(Boolean)
      .join(" • "),
    progressCaption,
    progressPercent,
    progressLabel,
    overallCompleted: hasSubtasks ? false : total > 0 && completedCount >= total,
    participants,
    subtasksPreview: eventSubtasks.slice(0, 4).map((item) => item.title),
  };
}

async function buildTaskLikeLiveSnapshotV2(artifact: any, acceptances: any[]) {
  const payload = getArtifactPayload(artifact);
  const baseSnapshot = buildActionArtifactSnapshot(artifact.actionType as ArtifactActionType, payload);
  const includeOwner = isOwnerParticipating(artifact);
  const relevantAcceptances = acceptances.filter((item) => includeOwner || item.role !== "AUTHOR");
  const total = relevantAcceptances.length || 1;
  const acceptedCount = relevantAcceptances.filter((item) => item.acceptedAt).length;
  const completedCount = relevantAcceptances.filter((item) => item.completedAt).length;
  const eventSubtasks = readEventSubtasks(payload);
  const childTaskIds = Array.from(new Set(relevantAcceptances.flatMap((acceptance) => readAcceptanceChildTaskIds(acceptance))));
  const childTasks = childTaskIds.length
    ? await prisma.task.findMany({
        where: {
          id: { in: childTaskIds },
        },
      })
    : [];
  const childTaskMap = new Map(childTasks.map((task) => [task.id, task]));
  const childTasksBySubtaskKey = new Map<string, any[]>();

  for (const task of childTasks) {
    const recurrence = readTaskRecurrenceMeta(task);
    const subtaskKey = typeof recurrence.subtaskKey === "string" ? recurrence.subtaskKey : null;
    if (!subtaskKey) continue;
    childTasksBySubtaskKey.set(subtaskKey, [...(childTasksBySubtaskKey.get(subtaskKey) ?? []), task]);
  }

  const participantIds = relevantAcceptances.map((item) => item.userId);
  const usernamesById = new Map(
    relevantAcceptances.map((item) => [item.userId, item.user?.username ?? "user"] as const),
  );
  const subtaskProgressMap = new Map<
    string,
    {
      required: boolean;
      total: number;
      completed: number;
      winnerUserId: string | null;
      completedUserIds: string[];
    }
  >(
    eventSubtasks.map((subtask) => {
      const assigneeIds = getEventSubtaskAssigneeIds(subtask, participantIds);
      const relatedTasks = (childTasksBySubtaskKey.get(subtask.key) ?? []).filter((task) => !task.deletedAt);
      const completedTasks = relatedTasks.filter((task) => task.completed);
      const winnerTask = completedTasks[0] ?? null;
      const completedUserIds = Array.from(
        new Set(
          completedTasks
            .map((task) => (typeof task.userId === "string" ? task.userId : null))
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (subtask.assignmentMode === "ANYONE") {
        return [
          subtask.key,
          {
            required: false,
            total: assigneeIds.length ? 1 : 0,
            completed: winnerTask ? 1 : 0,
            winnerUserId: winnerTask?.userId ?? null,
            completedUserIds,
          },
        ] as const;
      }

      if (subtask.assignmentMode === "PERSONAL") {
        return [
          subtask.key,
          {
            required: true,
            total: assigneeIds.length ? 1 : 0,
            completed: completedTasks.length ? 1 : 0,
            winnerUserId: completedTasks[0]?.userId ?? null,
            completedUserIds,
          },
        ] as const;
      }

      return [
        subtask.key,
        {
          required: true,
          total: assigneeIds.length,
          completed: completedTasks.length,
          winnerUserId: null,
          completedUserIds,
        },
      ] as const;
    }),
  );
  const requiredSubtaskTotal = Array.from(subtaskProgressMap.values()).reduce(
    (sum, item) => sum + (item.required ? item.total : 0),
    0,
  );
  const requiredSubtaskCompleted = Array.from(subtaskProgressMap.values()).reduce(
    (sum, item) => sum + (item.required ? Math.min(item.completed, item.total) : 0),
    0,
  );
  const optionalSubtaskTotal = Array.from(subtaskProgressMap.values()).reduce(
    (sum, item) => sum + (!item.required ? item.total : 0),
    0,
  );
  const optionalSubtaskCompleted = Array.from(subtaskProgressMap.values()).reduce(
    (sum, item) => sum + (!item.required ? Math.min(item.completed, item.total) : 0),
    0,
  );
  const subtasks = eventSubtasks.map((subtask) => {
    const progress = subtaskProgressMap.get(subtask.key) ?? {
      required: subtask.assignmentMode !== "ANYONE",
      total: 0,
      completed: 0,
      winnerUserId: null,
      completedUserIds: [],
    };
    const relatedTasks = (childTasksBySubtaskKey.get(subtask.key) ?? []).filter((task) => !task.deletedAt);
    const completedCount = Math.min(progress.completed, progress.total || progress.completed || 0);
    const totalCount = progress.total;
    const progressPercent = totalCount ? clampPercent((completedCount / totalCount) * 100) : 0;
    const completedUsernames = progress.completedUserIds
      .map((userId) => usernamesById.get(userId))
      .filter((value): value is string => Boolean(value));
    const winnerUsername = progress.winnerUserId ? usernamesById.get(progress.winnerUserId) ?? null : null;
    const assigneeUsername =
      subtask.assignmentMode === "PERSONAL" && subtask.assigneeUserId
        ? usernamesById.get(subtask.assigneeUserId) ?? null
        : null;
    const assignmentLabel =
      subtask.assignmentMode === "PERSONAL"
        ? assigneeUsername
          ? `Для @${assigneeUsername}`
          : "Назначено участнику"
        : subtask.assignmentMode === "ALL"
          ? "Обязательно для всех"
          : "Кто-то один может взять";
    const statusLabel =
      subtask.assignmentMode === "ANYONE"
        ? winnerUsername
          ? `Взял(а) @${winnerUsername}`
          : "Пока никто не взял"
        : totalCount
          ? `${completedCount}/${totalCount} выполнено`
          : "Без исполнителей";

    return {
      key: subtask.key,
      title: subtask.title,
      description: subtask.description ?? null,
      assignmentMode: subtask.assignmentMode,
      required: progress.required,
      assigneeUserId: subtask.assigneeUserId ?? null,
      assigneeUsername,
      assignmentLabel,
      completedCount,
      totalCount,
      progressPercent,
      completedUserIds: progress.completedUserIds,
      completedUsernames,
      winnerUserId: progress.winnerUserId,
      winnerUsername,
      statusLabel,
      time: subtask.time ?? null,
      endTime: subtask.endTime ?? null,
      hasTime: Boolean(subtask.time),
      relatedTaskIds: relatedTasks.map((task) => task.id),
    };
  });

  const participants = relevantAcceptances.map((acceptance) => {
    const completed = Boolean(acceptance.completedAt);
    const added = Boolean(acceptance.addedAt || acceptance.taskId);
    const accepted = Boolean(acceptance.acceptedAt);
    const declined = Boolean(acceptance.declinedAt);
    const participantChildTaskIds = readAcceptanceChildTaskIds(acceptance);
    let participantRequiredTotal = 0;
    let participantRequiredCompleted = 0;
    let participantOptionalCompleted = 0;

    for (const subtask of eventSubtasks) {
      const progress = subtaskProgressMap.get(subtask.key);
      const ownTasks = participantChildTaskIds
        .map((taskId) => childTaskMap.get(taskId))
        .filter((task) => {
          const recurrence = readTaskRecurrenceMeta(task);
          return task && recurrence.subtaskKey === subtask.key && !task.deletedAt;
        });

      if (subtask.assignmentMode === "PERSONAL") {
        if (subtask.assigneeUserId === acceptance.userId) {
          participantRequiredTotal += 1;
          if (ownTasks.some((task) => task?.completed)) participantRequiredCompleted += 1;
        }
        continue;
      }

      if (subtask.assignmentMode === "ALL") {
        if (participantIds.includes(acceptance.userId)) {
          participantRequiredTotal += 1;
          if (ownTasks.some((task) => task?.completed)) participantRequiredCompleted += 1;
        }
        continue;
      }

      if (progress?.winnerUserId === acceptance.userId || ownTasks.some((task) => task?.completed)) {
        participantOptionalCompleted += 1;
      }
    }

    const hasSubtasks = eventSubtasks.length > 0 || participantRequiredTotal > 0 || participantOptionalCompleted > 0;
    const progressPercent = hasSubtasks
      ? participantRequiredTotal
        ? clampPercent((participantRequiredCompleted / participantRequiredTotal) * 100)
        : participantOptionalCompleted > 0
          ? 100
          : 0
      : completed
        ? 100
        : 0;
    const optionalSummary = participantOptionalCompleted ? ` • +${participantOptionalCompleted} доп.` : "";
    const summary = hasSubtasks
      ? participantRequiredTotal
        ? completed
          ? `Событие отмечено выполненным • ${participantRequiredCompleted}/${participantRequiredTotal} обязательных задач${optionalSummary}`
          : `${participantRequiredCompleted}/${participantRequiredTotal} обязательных задач${optionalSummary}`
        : completed
          ? `Событие отмечено выполненным${optionalSummary}`
          : added
            ? `Событие добавлено в ежедневник${optionalSummary}`
            : accepted
              ? `Принял(а) событие${optionalSummary}`
              : declined
                ? "Отклонил(а) событие"
                : "Ещё не ответил(а)"
      : completed
        ? "Событие завершено"
        : added
          ? "Добавил(а) в ежедневник"
          : accepted
            ? "Принял(а), но ещё не завершил(а)"
            : declined
              ? "Отклонил(а) событие"
              : "Ещё не принял(а)";

    return {
      userId: acceptance.userId,
      username: acceptance.user?.username ?? "user",
      avatarUrl: acceptance.user?.avatarUrl ?? null,
      role: acceptance.role,
      ...buildArtifactStatusMeta(acceptance),
      progressPercent,
      summary,
    };
  });

  const hasSubtasks = eventSubtasks.length > 0 || requiredSubtaskTotal > 0 || optionalSubtaskTotal > 0;
  const aggregateProgressTotal = requiredSubtaskTotal + optionalSubtaskTotal;
  const aggregateProgressCompleted = requiredSubtaskCompleted + optionalSubtaskCompleted;
  const progressPercent = hasSubtasks
    ? (aggregateProgressTotal ? clampPercent((aggregateProgressCompleted / aggregateProgressTotal) * 100) : 0)
    : clampPercent((completedCount / total) * 100);
  const progressCaption = hasSubtasks ? "Прогресс по задачам события" : "Кто уже завершил событие";
  const progressLabel = hasSubtasks
    ? `${aggregateProgressCompleted}/${aggregateProgressTotal || 0} задач выполнено`
    : `${completedCount}/${total} выполнили`;

  return {
    ...baseSnapshot,
    secondary: [baseSnapshot.primary, `${acceptedCount}/${total} участвуют`].filter(Boolean).join(" • "),
    progressCaption,
    progressPercent,
    progressLabel,
    overallCompleted: total > 0 && completedCount >= total,
    participants,
    subtasks,
    subtasksPreview: eventSubtasks.slice(0, 4).map((item) => item.title),
  };
}

function resolveArtifactTaskLabel(artifact: any) {
  if (isTaskLikeArtifact(artifact)) return "Событие";
  if (artifact.sourceType === "TASK_DAY") return "Задача дня";
  if (artifact.sourceType === "TASK") return "Задача из Pulse";
  return "Договорённость";
}

async function buildArtifactSourceContext(artifact: any, entityLabel: string) {
  const [owner, chat] = await Promise.all([
    prisma.user.findUnique({
      where: { id: artifact.ownerId },
      select: { username: true },
    }),
    artifact.originChatId
      ? prisma.chat.findUnique({
          where: { id: artifact.originChatId },
          select: { type: true, title: true },
        })
      : Promise.resolve(null),
  ]);

  const lines = [`Источник: ${entityLabel}`];
  if (owner?.username) lines.push(`От: @${owner.username}`);
  if (chat?.type === "GROUP") lines.push(`Чат: ${chat.title?.trim() || "Групповой чат"}`);
  return lines.join("\n");
}

function mergeContextText(baseText?: string | null, contextText?: string | null) {
  const cleanBase = typeof baseText === "string" ? baseText.trim() : "";
  const cleanContext = typeof contextText === "string" ? contextText.trim() : "";
  if (cleanBase && cleanContext) return `${cleanBase}\n\n${cleanContext}`;
  return cleanBase || cleanContext || null;
}

async function loadShareSource(input: CreateShareInput) {
  if (input.kind === "ACTION" || input.actionType) {
    const actionType = input.actionType;
    if (!actionType) throw new HttpError(400, "Action type is required");
    const snapshot = buildActionArtifactSnapshot(actionType, input.payload);
    const participants = Array.isArray(input.participantUserIds) ? input.participantUserIds : [];
    let sourceTitle: string | null = null;
    let sourceDescription: string | null = null;
    let sourceReferenceJson: Record<string, unknown> | null = null;

    if (input.sourceType === "TASK" && input.sourceId) {
      const task = await prisma.task.findUnique({ where: { id: input.sourceId } });
      if (!task || task.userId !== input.ownerId || task.deletedAt) throw new HttpError(404, "Task not found");
      sourceTitle = task.title;
      sourceDescription = task.notes ?? null;
      sourceReferenceJson = { taskId: task.id };
    } else if (input.sourceType === "DEBT" && input.sourceId) {
      const debt = await prisma.pulseDebt.findUnique({ where: { id: input.sourceId } });
      if (!debt || debt.userId !== input.ownerId) throw new HttpError(404, "Debt not found");
      sourceTitle = debt.title;
      sourceDescription = debt.notes ?? null;
      sourceReferenceJson = { debtId: debt.id };
    } else if (input.sourceType === "SAVINGS_GOAL" && input.sourceId) {
      const goal = await prisma.pulseSavingsGoal.findUnique({ where: { id: input.sourceId } });
      if (!goal || goal.userId !== input.ownerId) throw new HttpError(404, "Savings goal not found");
      sourceTitle = goal.title;
      sourceDescription = null;
      sourceReferenceJson = { savingsGoalId: goal.id };
    } else if (input.sourceType === "FINANCE_ENTRY" && input.sourceId) {
      const entry = await prisma.pulseFinanceEntry.findUnique({ where: { id: input.sourceId } });
      if (!entry || entry.userId !== input.ownerId) throw new HttpError(404, "Finance entry not found");
      sourceTitle = entry.title;
      sourceDescription = entry.notes ?? null;
      sourceReferenceJson = { financeEntryId: entry.id };
    }

    return {
      title: input.title ?? sourceTitle ?? snapshot.title,
      description: input.description ?? sourceDescription ?? snapshot.description ?? null,
      containsSensitiveData: actionType === "FINANCE_SPLIT" || actionType === "DEBT_SHARE" || actionType === "SAVINGS_SHARE",
      snapshot,
      referenceJson: {
        actionType,
        participantCount: participants.length,
        ...(sourceReferenceJson ?? {}),
      },
      payloadJson: cloneJson(input.payload ?? {}),
    };
  }

  if (input.sourceType === "PROGRAM") {
    const definition = await prisma.programDefinition.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { currentVersion: true },
    });
    if (!definition || !definition.currentVersion) throw new HttpError(404, "Program not found");
    if (input.mode === "INVITE" && definition.accessMode === "PRIVATE") {
      throw new HttpError(400, "Приватную программу нельзя пригласить по ссылке");
    }
    return {
      title: input.mode === "INVITE" ? `Приглашение: ${definition.currentVersion.title}` : definition.currentVersion.title,
      description: input.mode === "INVITE" ? "Ссылка даст доступ к программе внутри Pulse" : definition.currentVersion.description,
      containsSensitiveData: false,
      snapshot: buildProgramSnapshot(definition.currentVersion),
      referenceJson: { programId: definition.id, versionId: definition.currentVersionId },
      payloadJson: null,
    };
  }

  if (input.sourceType === "PROGRAM_RUN") {
    const run = await prisma.programRun.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { programVersion: true },
    });
    if (!run) throw new HttpError(404, "Run not found");
    return {
      title: run.programVersion.title,
      description: run.programVersion.description,
      containsSensitiveData: true,
      snapshot: buildRunSnapshot(run),
      referenceJson: { runId: run.id, programId: run.programDefinitionId },
      payloadJson: null,
    };
  }

  if (input.sourceType === "PROGRAM_SESSION") {
    const session = await prisma.programSession.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { programVersion: true },
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
      payloadJson: null,
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
      payloadJson: null,
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
      description: actions.slice(0, 3).map((action) => action.title).join(" • "),
      containsSensitiveData: true,
      snapshot: buildTodayActionsSnapshot(actions),
      referenceJson: { ownerId: input.ownerId, kind: "todayActions" },
      payloadJson: null,
    };
  }

  if (input.sourceType === "SESSION_INVITE") {
    const invite = await prisma.programSessionInvite.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { session: { include: { programVersion: true } } },
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
        primary: invite.session.joinMode,
        secondary: invite.session.startMode,
      },
      referenceJson: { inviteId: invite.id, sessionId: invite.programSessionId },
      payloadJson: null,
    };
  }

  if (input.sourceType === "TASK") {
    const task = await prisma.task.findUnique({
      where: { id: input.sourceId ?? "" },
    });
    if (!task || task.deletedAt) throw new HttpError(404, "Task not found");
    if (task.userId !== input.ownerId) throw new HttpError(403, "Forbidden");
    return {
      title: task.title,
      description: task.notes ?? null,
      containsSensitiveData: true,
      snapshot: buildTaskSnapshot(task),
      referenceJson: { taskId: task.id, taskKind: task.kind },
      payloadJson: null,
    };
  }

  if (input.sourceType === "TASK_DAY") {
    const selectedDate = dayjs().startOf("day");
    const from = selectedDate.subtract(370, "day").startOf("day").toDate();
    const to = selectedDate.add(370, "day").endOf("day").toDate();
    const taskDefs = await prisma.task.findMany({
      where: {
        userId: input.ownerId,
        deletedAt: null,
        OR: [{ dueDate: { gte: from, lte: to } }, { dueDate: null }],
      },
      include: { completions: { where: { date: selectedDate.toDate() } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    const items = taskDefs
      .filter((task) => taskMatchesDate(task, selectedDate))
      .map((task) => {
        const recurrence = (task.recurrenceJson || {}) as any;
        const completion = task.completions[0];
        let completedForDate = Boolean(completion?.completed);
        if (!completion && (recurrence.taskType ?? "ONE_TIME") === "ONE_TIME") completedForDate = Boolean(task.completed);
        return {
          id: task.id,
          title: task.title,
          completedForDate,
        };
      });

    return {
      title: "Мои задачи на день",
      description: items.slice(0, 3).map((task) => task.title).join(" • "),
      containsSensitiveData: true,
      snapshot: buildTaskDaySnapshot(selectedDate, items),
      referenceJson: { ownerId: input.ownerId, date: selectedDate.toISOString() },
      payloadJson: null,
    };
  }

  if (input.sourceType === "NUTRITION_DAY") {
    const selectedDate = dayjs().startOf("day");
    const meals = await prisma.pulseMeal.findMany({
      where: {
        userId: input.ownerId,
        date: {
          gte: selectedDate.startOf("day").toDate(),
          lte: selectedDate.endOf("day").toDate(),
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const profile = await prisma.pulseProfile.findUnique({ where: { userId: input.ownerId } });
    const totalCalories = meals.reduce((sum, meal) => sum + Number(meal.totalCalories || 0), 0);
    return {
      title: "Мои калории за сегодня",
      description: meals.length ? `Приёмов пищи: ${meals.length}` : "Без записей",
      containsSensitiveData: true,
      snapshot: buildNutritionSnapshot(totalCalories, profile?.dailyCaloriesGoal ?? null),
      referenceJson: { ownerId: input.ownerId, date: selectedDate.toISOString() },
      payloadJson: null,
    };
  }

  if (input.sourceType === "MENTAL_DAY") {
    const selectedDate = dayjs().startOf("day");
    const healthDay = await prisma.healthDay.findUnique({
      where: {
        userId_date: {
          userId: input.ownerId,
          date: selectedDate.toDate(),
        },
      },
    }).catch(() => null);

    return {
      title: "Моё состояние сегодня",
      description: healthDay?.comment ?? null,
      containsSensitiveData: true,
      snapshot: buildMentalSnapshot(healthDay),
      referenceJson: { ownerId: input.ownerId, date: selectedDate.toISOString() },
      payloadJson: null,
    };
  }

  if (input.sourceType === "FINANCE_OVERVIEW") {
    const selectedDate = dayjs().startOf("day");
    const entries = await prisma.pulseFinanceEntry.findMany({
      where: {
        userId: input.ownerId,
        date: {
          gte: selectedDate.startOf("day").toDate(),
          lte: selectedDate.endOf("day").toDate(),
        },
      },
    });
    const goalsCount = await prisma.pulseSavingsGoal.count({ where: { userId: input.ownerId } });
    const debtsCount = await prisma.pulseDebt.count({ where: { userId: input.ownerId } });
    const income = roundMoney(entries.filter((entry) => entry.type === "INCOME").reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const expenses = roundMoney(entries.filter((entry) => entry.type === "EXPENSE").reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    return {
      title: "Мои финансы сегодня",
      description: entries.length ? `Записей: ${entries.length}` : "Без операций",
      containsSensitiveData: true,
      snapshot: buildFinanceOverviewSnapshot({ income, expenses, goalsCount, debtsCount }),
      referenceJson: { ownerId: input.ownerId, date: selectedDate.toISOString() },
      payloadJson: null,
    };
  }

  if (input.sourceType === "FINANCE_ENTRY") {
    const entry = await prisma.pulseFinanceEntry.findUnique({
      where: { id: input.sourceId ?? "" },
      include: { category: true },
    });
    if (!entry) throw new HttpError(404, "Finance entry not found");
    if (entry.userId !== input.ownerId) throw new HttpError(403, "Forbidden");
    return {
      title: entry.title,
      description: entry.notes ?? null,
      containsSensitiveData: true,
      snapshot: buildFinanceEntrySnapshot(entry),
      referenceJson: { financeEntryId: entry.id },
      payloadJson: null,
    };
  }

  if (input.sourceType === "DEBT") {
    const debt = await prisma.pulseDebt.findUnique({ where: { id: input.sourceId ?? "" } });
    if (!debt) throw new HttpError(404, "Debt not found");
    if (debt.userId !== input.ownerId) throw new HttpError(403, "Forbidden");
    return {
      title: debt.title,
      description: debt.notes ?? null,
      containsSensitiveData: true,
      snapshot: buildDebtSnapshot(debt),
      referenceJson: { debtId: debt.id },
      payloadJson: null,
    };
  }

  if (input.sourceType === "SAVINGS_GOAL") {
    const goal = await prisma.pulseSavingsGoal.findUnique({ where: { id: input.sourceId ?? "" } });
    if (!goal) throw new HttpError(404, "Savings goal not found");
    if (goal.userId !== input.ownerId) throw new HttpError(403, "Forbidden");
    return {
      title: goal.title,
      description: null,
      containsSensitiveData: true,
      snapshot: buildSavingsSnapshot(goal),
      referenceJson: { savingsGoalId: goal.id },
      payloadJson: null,
    };
  }

  throw new HttpError(400, "Unsupported share source");
}

async function resolveParticipantIds(input: CreateShareInput) {
  const unique = Array.from(new Set((input.participantUserIds ?? []).filter(Boolean)));
  if (input.originChatId) {
    const members = await prisma.chatMember.findMany({
      where: { chatId: input.originChatId, leftAt: null },
      select: { userId: true },
    });
    const all = unique.length ? unique : members.map((member) => member.userId);
    return Array.from(new Set(all.filter((userId) => userId !== input.ownerId)));
  }
  return unique.filter((userId) => userId !== input.ownerId);
}

async function createParticipantRows(artifactId: string, input: CreateShareInput) {
  const participantUserIds = await resolveParticipantIds(input);
  const now = new Date();
  const rows: Array<{
    artifactId: string;
    userId: string;
    role: "AUTHOR" | "TARGET" | "PARTICIPANT";
    status: "PENDING" | "ACCEPTED";
    acceptedAt?: Date;
  }> = [
    {
      artifactId,
      userId: input.ownerId,
      role: "AUTHOR",
      status: "ACCEPTED",
      acceptedAt: now,
    },
  ];

  for (const userId of participantUserIds) {
    rows.push({
      artifactId,
      userId,
      role: input.actionType === "TASK_REQUEST" ? "TARGET" : "PARTICIPANT",
      status: "PENDING",
    });
  }

  if (!rows.length) return;
  await prisma.pulseArtifactAcceptance.createMany({
    data: rows.map((row) => ({
      artifactId: row.artifactId,
      userId: row.userId,
      role: row.role,
      status: row.status,
      acceptedAt: row.acceptedAt,
    })),
    skipDuplicates: true,
  });
}

async function createActivity(
  artifactId: string,
  type: "CREATED" | "SHARED_TO_CHAT" | "ACCEPTED" | "DECLINED" | "ADDED_TO_PULSE" | "COMPLETED" | "FOLLOWED" | "REMINDER_SET" | "SETTLED" | "UPDATED",
  actorId?: string | null,
  subjectUserId?: string | null,
  payload?: Record<string, unknown> | null,
) {
  await prisma.pulseArtifactActivity.create({
    data: {
      artifactId,
      actorId: actorId ?? null,
      subjectUserId: subjectUserId ?? null,
      type,
      payloadJson: toPrismaNullableJson(payload ?? null),
    },
  });
}

async function bootstrapArtifactOwnerAcceptance(artifact: any, input: CreateShareInput) {
  const acceptance = await prisma.pulseArtifactAcceptance.findUnique({
    where: {
      artifactId_userId: {
        artifactId: artifact.id,
        userId: input.ownerId,
      },
    },
  });
  if (!acceptance) return;

  const now = new Date();
  const update: Record<string, unknown> = {};

  const ownerSelected = getParticipantUserIdsFromPayload((artifact.payloadJson ?? input.payload ?? null) as Record<string, unknown> | null).includes(input.ownerId);

  if (input.sourceType === "TASK" && input.sourceId) {
    update.taskId = input.sourceId;
  } else if (input.sourceType === "FINANCE_ENTRY" && input.sourceId) {
    update.financeEntryId = input.sourceId;
  } else if (input.sourceType === "DEBT" && input.sourceId) {
    update.debtId = input.sourceId;
  } else if (input.sourceType === "SAVINGS_GOAL" && input.sourceId) {
    update.savingsGoalId = input.sourceId;
  } else if (isTaskLikeArtifact(artifact) && ownerSelected) {
    const resultTask = await materializeTaskArtifact(artifact, acceptance, input.ownerId);
    update.taskId = resultTask.id;
  } else if (artifact.actionType === "FINANCE_SPLIT" && ownerSelected) {
    const result = await materializeFinanceArtifact(artifact, acceptance, input.ownerId);
    update.debtId = result.debt?.id ?? null;
  } else if (
    (input.actionType === "DEBT_SHARE" || input.actionType === "SAVINGS_SHARE") &&
    getSharingScope((artifact.payloadJson ?? input.payload ?? null) as Record<string, unknown> | null) === "SHARED"
  ) {
    const result = await materializeFinanceArtifact(artifact, acceptance, input.ownerId);
    update.debtId = result.debt?.id ?? null;
    update.savingsGoalId = result.savingsGoal?.id ?? null;
  }

  if (!Object.keys(update).length) return;

  await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: {
      ...update,
      status: "ADDED",
      acceptedAt: acceptance.acceptedAt ?? now,
      addedAt: acceptance.addedAt ?? now,
    },
  });
}

export async function createShareArtifact(input: CreateShareInput) {
  validateShareArtifactPayload(input);
  const source = await loadShareSource(input);
  if (source.containsSensitiveData && input.visibilityScope === "PUBLIC" && !input.explicitPublicShare) {
    throw new HttpError(400, "Sensitive data requires explicit public share confirmation");
  }

  const inviteToken =
    input.mode === "INVITE" && (input.sourceType === "PROGRAM" || input.sourceType === "PROGRAM_SESSION")
      ? makeInviteToken()
      : undefined;
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

  const artifact = await prisma.pulseShareArtifact.create({
    data: {
      ownerId: input.ownerId,
      kind: input.kind,
      mode: input.mode,
      actionType: input.actionType ?? null,
      title: input.title ?? source.title,
      description: input.description ?? source.description ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      snapshotJson: toPrismaNullableJson(source.snapshot),
      referenceJson: toPrismaNullableJson(referenceJson),
      payloadJson: toPrismaNullableJson(source.payloadJson ?? input.payload ?? null),
      inviteToken,
      visibilityScope: input.visibilityScope ?? "PRIVATE",
      containsSensitiveData: source.containsSensitiveData,
      allowPublicReference: !source.containsSensitiveData,
      originChatId: input.originChatId ?? null,
      originMessageId: input.originMessageId ?? null,
    },
  });

  await createParticipantRows(artifact.id, input);
  await bootstrapArtifactOwnerAcceptance(artifact, input);
  await createActivity(artifact.id, "CREATED", input.ownerId, input.ownerId, {
    sourceType: input.sourceType,
    actionType: input.actionType ?? null,
  });
  if (input.originChatId) {
    await createActivity(artifact.id, "SHARED_TO_CHAT", input.ownerId, null, {
      chatId: input.originChatId,
    });
  }

  return artifact;
}

export async function listRecentShareArtifacts(ownerId: string, limit = 20) {
  return prisma.pulseShareArtifact.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

async function canViewerAccessArtifact(artifact: { ownerId: string; visibilityScope: ArtifactVisibility; originChatId?: string | null }, viewer?: ViewerContext | null, artifactId?: string) {
  if (!viewer) return false;
  if (viewer.role === "ADMIN" || viewer.id === artifact.ownerId) return true;
  if (artifact.visibilityScope === "PUBLIC") return true;

  if (artifact.originChatId) {
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: artifact.originChatId,
          userId: viewer.id,
        },
      },
      select: { userId: true, leftAt: true },
    }).catch(() => null);
    if (member && !member.leftAt) return true;
  }

  if (artifactId) {
    const acceptance = await prisma.pulseArtifactAcceptance.findUnique({
      where: {
        artifactId_userId: {
          artifactId,
          userId: viewer.id,
        },
      },
      select: { id: true },
    }).catch(() => null);
    if (acceptance) return true;
  }

  return artifact.visibilityScope === "RESTRICTED";
}

async function buildLiveSnapshot(artifact: any) {
  const acceptances = await loadArtifactAcceptancesWithLinks(artifact);

  if (artifact.actionType === "FINANCE_SPLIT") {
    return buildBillLiveSnapshot({ ...artifact, acceptances }, acceptances);
  }

  if (isTaskLikeArtifact(artifact)) {
    return buildTaskLikeLiveSnapshotV2({ ...artifact, acceptances }, acceptances);
  }

  if (isDebtArtifact(artifact)) {
    return buildDebtOrSavingsLiveSnapshot({ ...artifact, acceptances }, acceptances, "DEBT");
  }

  if (isSavingsArtifact(artifact)) {
    return buildDebtOrSavingsLiveSnapshot({ ...artifact, acceptances }, acceptances, "SAVINGS");
  }

  if (artifact.actionType) {
    return buildActionArtifactSnapshot(artifact.actionType, artifact.payloadJson as Record<string, unknown> | null | undefined);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "PROGRAM_RUN" && artifact.sourceId) {
    const run = await prisma.programRun.findUnique({
      where: { id: artifact.sourceId },
      include: { programVersion: true },
    });
    if (run) return buildRunSnapshot(run);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "PROGRAM" && artifact.sourceId) {
    const program = await prisma.programDefinition.findUnique({
      where: { id: artifact.sourceId },
      include: { currentVersion: true },
    });
    if (program?.currentVersion) return buildProgramSnapshot(program.currentVersion);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "TASK" && artifact.sourceId) {
    const task = await prisma.task.findUnique({ where: { id: artifact.sourceId } });
    if (task && !task.deletedAt) return buildTaskSnapshot(task);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "FINANCE_ENTRY" && artifact.sourceId) {
    const entry = await prisma.pulseFinanceEntry.findUnique({
      where: { id: artifact.sourceId },
      include: { category: true },
    });
    if (entry) return buildFinanceEntrySnapshot(entry);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "DEBT" && artifact.sourceId) {
    const debt = await prisma.pulseDebt.findUnique({ where: { id: artifact.sourceId } });
    if (debt) return buildDebtSnapshot(debt);
  }

  if (artifact.mode === "REFERENCE" && artifact.sourceType === "SAVINGS_GOAL" && artifact.sourceId) {
    const goal = await prisma.pulseSavingsGoal.findUnique({ where: { id: artifact.sourceId } });
    if (goal) return buildSavingsSnapshot(goal);
  }

  return artifact.snapshotJson as Record<string, unknown> | null;
}

function getAllowedArtifactActions(artifact: any, viewerId: string, viewerAcceptance: any | null): ArtifactAction[] {
  const actions: ArtifactAction[] = [];
  const isOwner = artifact.ownerId === viewerId;
  const isParticipant = Boolean(viewerAcceptance);
  const ownerIsParticipating = isOwnerParticipating(artifact) || ((isDebtArtifact(artifact) || isSavingsArtifact(artifact)) && getSharingScope(getArtifactPayload(artifact)) === "SHARED");
  const hasTask = Boolean(viewerAcceptance?.taskId);
  const hasFinanceEntity = Boolean(viewerAcceptance?.financeEntryId || viewerAcceptance?.debtId || viewerAcceptance?.savingsGoalId);
  const accepted = Boolean(viewerAcceptance?.acceptedAt);
  const declined = Boolean(viewerAcceptance?.declinedAt);
  const autoMaterializesOnAccept = shouldAutoMaterializeOnAccept(artifact);

  actions.push("OPEN");

  if (!isOwner && !isParticipant) {
    return actions;
  }

  if (!isOwner && !hasFinanceEntity && !accepted && !declined && requiresAcceptBeforeAdd(artifact)) {
    actions.push("ACCEPT");
    actions.push("DECLINE");
  }

  if (
    !isOwner &&
    !hasTask &&
    !hasFinanceEntity &&
    (
      (TASK_LIKE_ACTIONS.has(artifact.actionType) && !autoMaterializesOnAccept && (!requiresAcceptBeforeAdd(artifact) || accepted)) ||
      (artifact.actionType === "FINANCE_SPLIT" && accepted && !autoMaterializesOnAccept) ||
      SOURCE_TASK_TYPES.has(artifact.sourceType) ||
      SOURCE_FINANCE_TYPES.has(artifact.sourceType) ||
      ((artifact.sourceType === "DEBT" || artifact.sourceType === "SAVINGS_GOAL") && accepted && !shouldAutoMaterializeOnAccept(artifact))
    )
  ) {
    actions.push("ADD_TO_SELF");
  }

  if (!isOwner && !viewerAcceptance?.followedAt && !hasTask && !hasFinanceEntity) {
    actions.push("FOLLOW");
  }

  if (((!isOwner) || ownerIsParticipating) && !declined && (accepted || hasTask || hasFinanceEntity)) {
    actions.push("DECLINE");
  }

  if (hasTask && !viewerAcceptance?.completedAt) {
    actions.push("MARK_COMPLETED");
  }

  return Array.from(new Set(actions));
}

function buildPrimaryAction(artifact: any, allowedActions: ArtifactAction[]) {
  if (allowedActions.includes("ADD_TO_SELF")) {
    if (artifact.actionType === "DEBT_SHARE") return { key: "ADD_TO_SELF", label: "Добавить долг" };
    if (artifact.actionType === "SAVINGS_SHARE") return { key: "ADD_TO_SELF", label: "Присоединиться" };
    return { key: "ADD_TO_SELF", label: "Добавить себе" };
  }
  if (allowedActions.includes("MARK_COMPLETED")) return { key: "MARK_COMPLETED", label: "Отметить выполненным" };
  if (allowedActions.includes("ACCEPT")) {
    if (artifact.actionType === "FINANCE_SPLIT") return { key: "ACCEPT", label: "Принять счёт" };
    if (isDebtArtifact(artifact)) return { key: "ACCEPT", label: "Принять долг" };
    if (isSavingsArtifact(artifact)) return { key: "ACCEPT", label: "Принять накопление" };
    return { key: "ACCEPT", label: "Принять событие" };
  }
  if (allowedActions.includes("OPEN")) return { key: "OPEN", label: "Развернуть" };
  return null;
}

function buildParticipantSummary(artifact: any, acceptances: any[]) {
  const includeOwner = isOwnerParticipating(artifact) || ((isDebtArtifact(artifact) || isSavingsArtifact(artifact)) && getSharingScope(getArtifactPayload(artifact)) === "SHARED");
  const relevant = acceptances.filter((acceptance) => includeOwner || acceptance.role !== "AUTHOR");
  return {
    total: relevant.length,
    accepted: relevant.filter((item) => item.acceptedAt).length,
    declined: relevant.filter((item) => item.declinedAt).length,
    added: relevant.filter((item) => item.addedAt).length,
    completed: relevant.filter((item) => item.completedAt).length,
    following: relevant.filter((item) => item.followedAt).length,
  };
}

function buildViewerState(viewerAcceptance: any | null) {
  if (!viewerAcceptance) return null;
  return {
    userId: viewerAcceptance.userId,
    role: viewerAcceptance.role,
    status: viewerAcceptance.status,
    acceptedAt: viewerAcceptance.acceptedAt,
    declinedAt: viewerAcceptance.declinedAt,
    addedAt: viewerAcceptance.addedAt,
    completedAt: viewerAcceptance.completedAt,
    followedAt: viewerAcceptance.followedAt,
    taskId: viewerAcceptance.taskId,
    financeEntryId: viewerAcceptance.financeEntryId,
    debtId: viewerAcceptance.debtId,
    savingsGoalId: viewerAcceptance.savingsGoalId,
    programRunId: viewerAcceptance.programRunId,
    programSessionId: viewerAcceptance.programSessionId,
  };
}

function getArtifactOpenRoute(artifact: any) {
  const reference = artifact.referenceJson as Record<string, unknown> | null | undefined;
  const sourceType = String(artifact.sourceType ?? "");

  if (typeof reference?.inviteToken === "string" && reference.inviteToken) {
    if (reference.inviteType === "PROGRAM") return `/health?tab=programs&programInvite=${reference.inviteToken}`;
    return `/health?tab=programs&sessionInvite=${reference.inviteToken}`;
  }
  if (typeof reference?.runId === "string" && reference.runId) return `/health/program-runs/${reference.runId}`;
  if (typeof reference?.sessionId === "string" && reference.sessionId) return `/health/program-sessions/${reference.sessionId}`;
  if (typeof reference?.programId === "string" && reference.programId) return `/health/programs/${reference.programId}`;
  if (typeof reference?.taskId === "string" && reference.taskId) return "/health?tab=tasks";
  if (typeof reference?.financeEntryId === "string" && reference.financeEntryId) return "/health?tab=finance";
  if (typeof reference?.debtId === "string" && reference.debtId) return "/health?tab=finance";
  if (typeof reference?.savingsGoalId === "string" && reference.savingsGoalId) return "/health?tab=finance";
  if (typeof reference?.achievementId === "string" && reference.achievementId) return "/health/achievements";
  if (sourceType === "ACHIEVEMENT") return "/health/achievements";
  if (sourceType === "TODAY_ACTIONS") return "/health?tab=programs";
  if (sourceType === "TASK" || sourceType === "TASK_DAY") return "/health?tab=tasks";
  if (sourceType === "FINANCE_ENTRY" || sourceType === "FINANCE_OVERVIEW" || sourceType === "DEBT" || sourceType === "SAVINGS_GOAL") return "/health?tab=finance";
  if (sourceType === "MENTAL_DAY" || sourceType === "NUTRITION_DAY") return "/health?tab=health";
  if (artifact.id) return `/health/programs?share=${artifact.id}`;
  return "/health";
}

async function upsertNotification(userId: string, type: string, data: Record<string, unknown>) {
  return prisma.notification.create({
    data: {
      userId,
      type: type as any,
      data: toPrismaNullableJson(data) as any,
    },
  });
}

async function notifyArtifactOwner(artifact: any, actorId: string, verb: string) {
  if (!artifact.ownerId || artifact.ownerId === actorId) return null;
  return upsertNotification(artifact.ownerId, "ARTIFACT_ACTIVITY", {
    artifactId: artifact.id,
    actorId,
    verb,
    title: artifact.title,
    actionType: artifact.actionType,
  }).catch(() => null);
}

export async function resolveShareArtifact(artifactId: string, viewer?: ViewerContext | null) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
    include: {
      acceptances: {
        include: {
          user: {
            select: compactUserSelect,
          },
          task: true,
          financeEntry: true,
          debt: true,
          savingsGoal: true,
        },
        orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          actor: {
            select: compactUserSelect,
          },
          subjectUser: {
            select: compactUserSelect,
          },
        },
      },
    },
  });
  if (!artifact) throw new HttpError(404, "Share artifact not found");

  const allowed = await canViewerAccessArtifact(artifact as any, viewer, artifact.id);
  if (!allowed) throw new HttpError(403, "Forbidden");

  const resolvedSnapshot = await buildLiveSnapshot(artifact);
  const viewerAcceptance = viewer ? artifact.acceptances.find((item) => item.userId === viewer.id) ?? null : null;
  const allowedActions: ArtifactAction[] = viewer ? getAllowedArtifactActions(artifact, viewer.id, viewerAcceptance) : ["OPEN"];
  const participantSummary = buildParticipantSummary(artifact, artifact.acceptances);
  const primaryAction = buildPrimaryAction(artifact, allowedActions);

  return {
    ...artifact,
    resolvedSnapshot,
    viewerState: buildViewerState(viewerAcceptance),
    participantSummary,
    participantsPreview: artifact.acceptances.slice(0, 6).map((item) => ({
      user: compactUser(item.user),
      role: item.role,
      status: item.status,
      statusLabel: toParticipantStatusLabel(item.status),
      acceptedAt: item.acceptedAt,
      declinedAt: item.declinedAt,
      addedAt: item.addedAt,
      completedAt: item.completedAt,
      followedAt: item.followedAt,
    })),
    allowedActions,
    primaryAction,
    openRoute: getArtifactOpenRoute(artifact),
    recentActivity: artifact.activities.map((item) => ({
      id: item.id,
      type: item.type,
      createdAt: item.createdAt,
      actor: item.actor ? compactUser(item.actor) : null,
      subjectUser: item.subjectUser ? compactUser(item.subjectUser) : null,
      payloadJson: item.payloadJson,
    })),
  };
}

async function getOrCreateAcceptance(artifactId: string, userId: string) {
  const existing = await prisma.pulseArtifactAcceptance.findUnique({
    where: {
      artifactId_userId: {
        artifactId,
        userId,
      },
    },
  });
  if (existing) return existing;
  return prisma.pulseArtifactAcceptance.create({
    data: {
      artifactId,
      userId,
      role: "PARTICIPANT",
      status: "PENDING",
    },
  });
}

async function getExistingAcceptance(artifactId: string, userId: string) {
  return prisma.pulseArtifactAcceptance.findUnique({
    where: {
      artifactId_userId: {
        artifactId,
        userId,
      },
    },
  });
}

async function removeLinkedEntitiesForAcceptance(acceptance: any, ownerUserId: string) {
  const removed: {
    taskId?: string | null;
    childTaskIds?: string[];
    financeEntryId?: string | null;
    debtId?: string | null;
    savingsGoalId?: string | null;
  } = {};

  if (acceptance.taskId) {
    const task = await prisma.task.findUnique({ where: { id: acceptance.taskId } });
    if (task && task.userId === ownerUserId && !task.deletedAt) {
      await prisma.task.update({
        where: { id: task.id },
        data: { deletedAt: new Date(), completed: false },
      });
      removed.taskId = task.id;
    }
  }

  const childTaskIds = readAcceptanceChildTaskIds(acceptance);
  if (childTaskIds.length) {
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: childTaskIds },
        userId: ownerUserId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (tasks.length) {
      await prisma.task.updateMany({
        where: { id: { in: tasks.map((task) => task.id) } },
        data: { deletedAt: new Date(), completed: false },
      });
      removed.childTaskIds = tasks.map((task) => task.id);
    }
  }

  if (acceptance.financeEntryId) {
    const entry = await prisma.pulseFinanceEntry.findUnique({ where: { id: acceptance.financeEntryId } });
    if (entry && entry.userId === ownerUserId) {
      await prisma.pulseFinanceEntry.delete({ where: { id: entry.id } });
      removed.financeEntryId = entry.id;
    }
  }

  if (acceptance.debtId) {
    const debt = await prisma.pulseDebt.findUnique({ where: { id: acceptance.debtId } });
    if (debt && debt.userId === ownerUserId) {
      await prisma.pulseDebt.delete({ where: { id: debt.id } });
      removed.debtId = debt.id;
    }
  }

  if (acceptance.savingsGoalId) {
    const goal = await prisma.pulseSavingsGoal.findUnique({ where: { id: acceptance.savingsGoalId } });
    if (goal && goal.userId === ownerUserId) {
      await prisma.pulseSavingsGoal.delete({ where: { id: goal.id } });
      removed.savingsGoalId = goal.id;
    }
  }

  return removed;
}

async function declineAcceptanceAndClearLinks(
  acceptance: any,
  payload?: Record<string, unknown> | null,
) {
  const now = new Date();
  const nextAcceptance = await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: {
      status: "DECLINED",
      acceptedAt: null,
      declinedAt: now,
      addedAt: null,
      completedAt: null,
      followedAt: null,
      taskId: null,
      financeEntryId: null,
      debtId: null,
      savingsGoalId: null,
      programRunId: null,
      programSessionId: null,
      metaJson: toPrismaNullableJson({
        ...(readAcceptanceMeta(acceptance) ?? {}),
        childTaskIds: [],
        childTasksTotal: 0,
      }),
    },
  });

  await createActivity(acceptance.artifactId, "DECLINED", acceptance.userId, acceptance.userId, payload ?? null);
  return nextAcceptance;
}

function parseDueAt(payload: Record<string, unknown> | null | undefined) {
  const dueAt = typeof payload?.dueAt === "string" ? dayjs(payload.dueAt) : null;
  if (!dueAt || !dueAt.isValid()) return null;
  return dueAt.toDate();
}

function parseDateWithOptionalTime(dateValue?: Date | null, timeValue?: string | null) {
  if (!dateValue) return { dueDate: null as Date | null, endDate: null as Date | null, hasTime: false };
  const base = dayjs(dateValue);
  if (!base.isValid() || !timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) {
    return { dueDate: base.isValid() ? base.toDate() : null, endDate: null as Date | null, hasTime: false };
  }
  const [hours, minutes] = timeValue.split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return { dueDate: base.toDate(), endDate: null as Date | null, hasTime: false };
  }
  return {
    dueDate: base.hour(hours).minute(minutes).second(0).millisecond(0).toDate(),
    endDate: null as Date | null,
    hasTime: true,
  };
}

function applyEndTimeToSchedule(baseDate: Date | null, dueDate: Date | null, endTime?: string | null) {
  if (!baseDate || !dueDate || !endTime || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  const base = dayjs(baseDate);
  const start = dayjs(dueDate);
  const [hours, minutes] = endTime.split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const nextEnd = base.hour(hours).minute(minutes).second(0).millisecond(0);
  return nextEnd.isAfter(start) ? nextEnd.toDate() : null;
}

function resolveEventSubtaskSchedule(
  subtask: { dueAt?: string | null; time?: string | null; endTime?: string | null },
  eventDueDate: Date | null,
) {
  const explicitDueAt = subtask.dueAt ? dayjs(subtask.dueAt) : null;
  if (explicitDueAt && explicitDueAt.isValid()) {
    return {
      dueDate: explicitDueAt.toDate(),
      endDate: applyEndTimeToSchedule(explicitDueAt.toDate(), explicitDueAt.toDate(), subtask.endTime ?? null),
      hasTime: Boolean(explicitDueAt.hour() || explicitDueAt.minute()),
    };
  }
  if (!eventDueDate) return { dueDate: null as Date | null, endDate: null as Date | null, hasTime: false };
  const scheduled = parseDateWithOptionalTime(eventDueDate, subtask.time ?? null);
  return {
    ...scheduled,
    endDate: applyEndTimeToSchedule(eventDueDate, scheduled.dueDate, subtask.endTime ?? null),
  };
}

function parseReminderPayload(payload: Record<string, unknown> | null | undefined, dueDate: Date | null) {
  const minutes = Number(payload?.reminderMinutesBefore ?? 0);
  if (!minutes || !dueDate) return null;
  return [
    {
      type: "relative",
      minutesBefore: minutes,
    },
  ];
}

async function materializeTaskArtifact(artifact: any, acceptance: any, viewerId: string) {
  const payload = (artifact.payloadJson ?? {}) as Record<string, unknown>;
  const dueDate = parseDueAt(payload);
  const rawTime = typeof payload.time === "string" ? payload.time.trim() : "";
  const rawEndTime = typeof payload.endTime === "string" ? payload.endTime.trim() : "";
  const parsedDueAt = typeof payload.dueAt === "string" ? dayjs(payload.dueAt) : null;
  const hasTime =
    (Boolean(rawTime) && /^\d{2}:\d{2}$/.test(rawTime)) ||
    Boolean(parsedDueAt?.isValid() && (parsedDueAt.hour() !== 0 || parsedDueAt.minute() !== 0));
  const remindersJson = parseReminderPayload(payload, dueDate);
  const eventSubtasks = artifact.actionType === "SOCIAL_EVENT" ? readEventSubtasks(payload) : [];
  const eventParticipantIds = getParticipantUserIdsFromPayload(payload);
  const sourceContext = await buildArtifactSourceContext(artifact, resolveArtifactTaskLabel(artifact));
  const existingTaskId =
    acceptance.taskId ||
    (
      await prisma.task.findFirst({
        where: {
          userId: viewerId,
          sourceKey: buildArtifactTaskSourceKey(artifact.id),
          deletedAt: null,
        },
        select: { id: true },
      })
    )?.id;

  if (existingTaskId) {
    const task = await prisma.task.findUnique({ where: { id: existingTaskId } });
    if (task) return task;
  }

  if (artifact.sourceType === "TASK" && artifact.sourceId) {
    const sourceTask = await prisma.task.findUnique({ where: { id: artifact.sourceId } });
    if (sourceTask && !sourceTask.deletedAt) {
      return prisma.task.create({
        data: {
          userId: viewerId,
          title: sourceTask.title,
          notes: mergeContextText(sourceTask.notes ?? null, sourceContext),
          kind: sourceTask.kind,
          dueDate: sourceTask.dueDate,
          hasTime: sourceTask.hasTime,
          completed: false,
          priority: sourceTask.priority,
          tags: sourceTask.tags,
          remindersJson: toPrismaNullableJson(sourceTask.remindersJson ?? null),
          recurrenceJson: toPrismaNullableJson(sourceTask.recurrenceJson ?? null),
          sourceKey: buildArtifactTaskSourceKey(artifact.id),
        },
      });
    }
  }

  const kind = "TASK";
  const createdTask = await prisma.task.create({
    data: {
      userId: viewerId,
      title: typeof payload.title === "string" ? payload.title : artifact.title ?? "Задача",
      notes: mergeContextText(typeof payload.description === "string" ? payload.description : artifact.description ?? null, sourceContext),
      kind,
      dueDate,
      hasTime,
      completed: false,
      priority: Number(payload.priority ?? 2) || 2,
      tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : [],
      remindersJson: toPrismaNullableJson(remindersJson),
      recurrenceJson: toPrismaNullableJson(
        artifact.actionType === "SOCIAL_EVENT"
          ? {
              taskType: "ONE_TIME",
              scheduleType: "NONE",
              socialEventRole: "EVENT",
              subtaskCount: eventSubtasks.length,
              time: rawTime || null,
              endTime: rawEndTime || null,
            }
          : null,
      ),
      sourceKey: buildArtifactTaskSourceKey(artifact.id),
    },
  });

  if (artifact.actionType === "SOCIAL_EVENT" && eventSubtasks.length) {
    const subtasksForViewer = eventSubtasks.filter((subtask) =>
      getEventSubtaskAssigneeIds(subtask, eventParticipantIds).includes(viewerId),
    );
    const childTasks = await Promise.all(
      subtasksForViewer.map((subtask) => {
        const subtaskSchedule = resolveEventSubtaskSchedule(subtask, dueDate);
        return prisma.task.create({
          data: {
            userId: viewerId,
            title: subtask.title,
            notes: mergeContextText(subtask.description, `Событие: ${createdTask.title}\n${sourceContext}`),
            kind: "TASK",
            dueDate: subtaskSchedule.dueDate,
            hasTime: subtaskSchedule.hasTime,
            completed: false,
            priority: Number(payload.priority ?? 2) || 2,
            tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 10) : [],
            remindersJson: toPrismaNullableJson(subtaskSchedule.dueDate ? parseReminderPayload(payload, subtaskSchedule.dueDate) : null),
            recurrenceJson: toPrismaNullableJson({
              taskType: "ONE_TIME",
              scheduleType: "NONE",
              socialEventRole: "SUBTASK",
              sourceEventTitle: createdTask.title,
              parentArtifactId: artifact.id,
              parentTaskId: createdTask.id,
              subtaskKey: subtask.key,
              time: subtask.time ?? null,
              endTime: subtask.endTime ?? null,
              subtaskAssignmentMode: subtask.assignmentMode,
              subtaskAssigneeUserId: subtask.assigneeUserId ?? null,
            }),
            sourceKey: buildArtifactSubtaskSourceKey(artifact.id, subtask.key),
          },
        });
      }),
    );

    await prisma.pulseArtifactAcceptance.update({
      where: { id: acceptance.id },
      data: {
        metaJson: toPrismaNullableJson(
          withAcceptanceMeta(acceptance, {
            childTaskIds: childTasks.map((task) => task.id),
            childTasksTotal: childTasks.length,
          }),
        ),
      },
    });
  }

  return createdTask;
}

function resolveFinanceSplitAmount(artifact: any, viewerId: string, fallbackCount = 0) {
  const payload = getArtifactPayload(artifact);
  const totalAmount = Number(payload.totalAmount ?? 0);
  const shares = Array.isArray(payload.shares) ? payload.shares : [];
  const explicit = shares.find((item: any) => item && item.userId === viewerId && Number.isFinite(Number(item.amount)));
  if (explicit) return roundMoney(Number(explicit.amount));
  const participantIds = Array.isArray(payload.participantUserIds)
    ? payload.participantUserIds.filter((item): item is string => typeof item === "string")
    : [];
  const acceptanceCount = Array.isArray(artifact.acceptances) ? artifact.acceptances.filter((item: any) => item.role !== "AUTHOR").length : 0;
  const count = participantIds.length || fallbackCount || acceptanceCount || 1;
  return roundMoney(totalAmount / count);
}

async function materializeFinanceArtifact(artifact: any, acceptance: any, viewerId: string) {
  if (acceptance.financeEntryId) {
    const existing = await prisma.pulseFinanceEntry.findUnique({ where: { id: acceptance.financeEntryId } });
    if (existing) return { financeEntry: existing, debt: null, savingsGoal: null };
  }
  if (acceptance.debtId) {
    const existing = await prisma.pulseDebt.findUnique({ where: { id: acceptance.debtId } });
    if (existing) return { financeEntry: null, debt: existing, savingsGoal: null };
  }
  if (acceptance.savingsGoalId) {
    const existing = await prisma.pulseSavingsGoal.findUnique({ where: { id: acceptance.savingsGoalId } });
    if (existing) return { financeEntry: null, debt: null, savingsGoal: existing };
  }

  const payload = getArtifactPayload(artifact);

  if (artifact.actionType === "FINANCE_SPLIT") {
    const shareAmount = resolveFinanceSplitAmount(artifact, viewerId);
    const sourceContext = await buildArtifactSourceContext(artifact, "общий счёт из чата");
    const debt = await prisma.pulseDebt.create({
      data: {
        userId: viewerId,
        title: typeof payload.title === "string" ? payload.title : artifact.title ?? "Общий счёт",
        debtType: "shared_bill",
        totalAmount: shareAmount,
        paidAmount: 0,
        interestRate: null,
        startedAt: null,
        dueDate: parseDueAt(payload),
        paymentDay: null,
        paymentAmount: null,
        termMonths: null,
        notes: mergeContextText(typeof payload.description === "string" ? payload.description : artifact.description ?? null, sourceContext),
      },
    });
    return { financeEntry: null, debt, savingsGoal: null };
  }

  if (artifact.actionType === "DEBT_SHARE" || artifact.sourceType === "DEBT") {
    const sourceDebt = artifact.sourceType === "DEBT" && artifact.sourceId
      ? await prisma.pulseDebt.findUnique({ where: { id: artifact.sourceId } })
      : null;
    if (artifact.sourceType === "DEBT" && artifact.sourceId && !sourceDebt) throw new HttpError(404, "Debt not found");

    const sharingScope = getSharingScope(payload);
    const totalAmount = Number(sourceDebt?.totalAmount ?? payload.totalAmount ?? 0);
    const paidAmount =
      artifact.sourceType === "DEBT"
        ? sharingScope === "SHARED"
          ? 0
          : Number(sourceDebt?.paidAmount ?? 0)
        : Number(payload.paidAmount ?? 0);
    const sourceContext = await buildArtifactSourceContext(artifact, "долг из чата");
    const debt = await prisma.pulseDebt.create({
      data: {
        userId: viewerId,
        title: typeof payload.title === "string" ? payload.title : artifact.title ?? sourceDebt?.title ?? "Долг",
        debtType: typeof payload.debtType === "string" ? payload.debtType : sourceDebt?.debtType ?? "shared",
        totalAmount,
        paidAmount,
        interestRate: sourceDebt?.interestRate ?? null,
        startedAt: sourceDebt?.startedAt ?? null,
        dueDate: sourceDebt?.dueDate ?? parseDueAt(payload),
        paymentDay: sourceDebt?.paymentDay ?? null,
        paymentAmount: sourceDebt?.paymentAmount ?? null,
        termMonths: sourceDebt?.termMonths ?? null,
        notes: mergeContextText(typeof payload.description === "string" ? payload.description : artifact.description ?? sourceDebt?.notes ?? null, sourceContext),
      },
    });
    return { financeEntry: null, debt, savingsGoal: null };
  }

  if (artifact.actionType === "SAVINGS_SHARE" || artifact.sourceType === "SAVINGS_GOAL") {
    const sourceGoal = artifact.sourceType === "SAVINGS_GOAL" && artifact.sourceId
      ? await prisma.pulseSavingsGoal.findUnique({ where: { id: artifact.sourceId } })
      : null;
    if (artifact.sourceType === "SAVINGS_GOAL" && artifact.sourceId && !sourceGoal) throw new HttpError(404, "Savings goal not found");

    const sharingScope = getSharingScope(payload);
    const targetAmount = Number(sourceGoal?.targetAmount ?? payload.targetAmount ?? 0);
    const savedAmount =
      artifact.sourceType === "SAVINGS_GOAL"
        ? sharingScope === "SHARED"
          ? 0
          : Number(sourceGoal?.savedAmount ?? 0)
        : Number(payload.savedAmount ?? 0);
    const savingsGoal = await prisma.pulseSavingsGoal.create({
      data: {
        userId: viewerId,
        title: typeof payload.title === "string" ? payload.title : artifact.title ?? sourceGoal?.title ?? "Накопление",
        targetAmount,
        savedAmount,
        deadline: sourceGoal?.deadline ?? parseDueAt({ dueAt: payload.deadline }),
        itemsJson: toPrismaNullableJson(sourceGoal?.itemsJson ?? null),
      },
    });
    return { financeEntry: null, debt: null, savingsGoal };
  }

  if (artifact.sourceType === "FINANCE_ENTRY" && artifact.sourceId) {
    const sourceEntry = await prisma.pulseFinanceEntry.findUnique({ where: { id: artifact.sourceId } });
    if (!sourceEntry) throw new HttpError(404, "Finance entry not found");
    const sourceContext = await buildArtifactSourceContext(artifact, "финансовая запись из чата");
    const financeEntry = await prisma.pulseFinanceEntry.create({
      data: {
        userId: viewerId,
        date: sourceEntry.date,
        type: sourceEntry.type,
        title: sourceEntry.title,
        amount: sourceEntry.amount,
        categoryId: sourceEntry.categoryId,
        notes: mergeContextText(sourceEntry.notes, sourceContext),
        recurrenceJson: toPrismaNullableJson(sourceEntry.recurrenceJson ?? null),
      },
    });
    return { financeEntry, debt: null, savingsGoal: null };
  }

  throw new HttpError(400, "This artifact cannot be added to finance");
}

export async function respondToShareArtifact(artifactId: string, actor: ViewerContext, response: ArtifactResponse) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) throw new HttpError(404, "Artifact not found");
  const allowed = await canViewerAccessArtifact(artifact as any, actor, artifact.id);
  if (!allowed) throw new HttpError(403, "Forbidden");

  const acceptance = await getExistingAcceptance(artifact.id, actor.id);
  if (!acceptance) throw new HttpError(403, "Viewer can only view this card");
  const allowedActions = getAllowedArtifactActions(artifact, actor.id, acceptance);
  const requiredAction = response === "ACCEPT" ? "ACCEPT" : response === "DECLINE" ? "DECLINE" : "FOLLOW";
  if (!allowedActions.includes(requiredAction)) {
    throw new HttpError(400, "This action is not available");
  }
  const now = new Date();
  const update: Record<string, unknown> = {};
  let task: any = null;
  let financeEntry: any = null;
  let debt: any = null;
  let savingsGoal: any = null;
  let finalAcceptance = acceptance;

  if (response === "ACCEPT") {
    update.status = acceptance.completedAt ? "COMPLETED" : acceptance.addedAt ? "ADDED" : "ACCEPTED";
    update.acceptedAt = now;
    update.declinedAt = null;
  } else if (response === "DECLINE") {
    const removedLinks = await removeLinkedEntitiesForAcceptance(acceptance, actor.id);
    finalAcceptance = await declineAcceptanceAndClearLinks(acceptance, {
      ...removedLinks,
      leftAfterAcceptance: Boolean(
        acceptance.acceptedAt ||
          acceptance.addedAt ||
          acceptance.completedAt ||
          acceptance.taskId ||
          acceptance.financeEntryId ||
          acceptance.debtId ||
          acceptance.savingsGoalId,
      ),
      declinedVia: "artifact_response",
    });
    const notification = await notifyArtifactOwner(artifact, actor.id, "declined");
    return {
      acceptance: finalAcceptance,
      artifact,
      notification,
      task,
      financeEntry,
      debt,
      savingsGoal,
    };
  } else {
    update.status = "FOLLOWING";
    update.followedAt = now;
  }

  const next = await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: update,
  });
  finalAcceptance = next;

  await createActivity(artifact.id, response === "ACCEPT" ? "ACCEPTED" : "FOLLOWED", actor.id, actor.id, null);

  if (response === "ACCEPT" && shouldAutoMaterializeOnAccept(artifact)) {
    if (shouldAutoMaterializeTaskOnAccept(artifact)) {
      task = await materializeTaskArtifact(artifact, next, actor.id);
    }

    if (shouldAutoMaterializeFinanceOnAccept(artifact)) {
      const result = await materializeFinanceArtifact(artifact, next, actor.id);
      financeEntry = result.financeEntry;
      debt = result.debt;
      savingsGoal = result.savingsGoal;
    }

    finalAcceptance = await prisma.pulseArtifactAcceptance.update({
      where: { id: next.id },
      data: {
        status: "ADDED",
        acceptedAt: next.acceptedAt ?? now,
        addedAt: next.addedAt ?? now,
        taskId: task?.id ?? next.taskId ?? null,
        financeEntryId: financeEntry?.id ?? next.financeEntryId ?? null,
        debtId: debt?.id ?? next.debtId ?? null,
        savingsGoalId: savingsGoal?.id ?? next.savingsGoalId ?? null,
      },
    });

    await createActivity(artifact.id, "ADDED_TO_PULSE", actor.id, actor.id, {
      taskId: task?.id ?? null,
      financeEntryId: financeEntry?.id ?? null,
      debtId: debt?.id ?? null,
      savingsGoalId: savingsGoal?.id ?? null,
    });
  }
  const notification = await notifyArtifactOwner(artifact, actor.id, response.toLowerCase());

  return {
    acceptance: finalAcceptance,
    artifact,
    notification,
    task,
    financeEntry,
    debt,
    savingsGoal,
  };
}

export async function addShareArtifactToPulse(artifactId: string, actor: ViewerContext) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) throw new HttpError(404, "Artifact not found");
  const allowed = await canViewerAccessArtifact(artifact as any, actor, artifact.id);
  if (!allowed) throw new HttpError(403, "Forbidden");

  const acceptance = await getExistingAcceptance(artifact.id, actor.id);
  if (!acceptance) throw new HttpError(403, "Viewer can only view this card");
  const allowedActions = getAllowedArtifactActions(artifact, actor.id, acceptance);
  if (!allowedActions.includes("ADD_TO_SELF")) {
    throw new HttpError(400, "This action is not available");
  }
  if (requiresAcceptBeforeAdd(artifact) && !acceptance.acceptedAt && !acceptance.addedAt) {
    throw new HttpError(400, artifact.actionType === "FINANCE_SPLIT" ? "Сначала примите счёт" : "Сначала примите карточку");
  }
  let task: any = null;
  let financeEntry: any = null;
  let debt: any = null;
  let savingsGoal: any = null;

  if (TASK_LIKE_ACTIONS.has(artifact.actionType as ArtifactActionType) || SOURCE_TASK_TYPES.has(artifact.sourceType)) {
    task = await materializeTaskArtifact(artifact, acceptance, actor.id);
  } else if (
    artifact.actionType === "FINANCE_SPLIT" ||
    artifact.actionType === "DEBT_SHARE" ||
    artifact.actionType === "SAVINGS_SHARE" ||
    SOURCE_FINANCE_TYPES.has(artifact.sourceType) ||
    artifact.sourceType === "DEBT" ||
    artifact.sourceType === "SAVINGS_GOAL"
  ) {
    const result = await materializeFinanceArtifact(artifact, acceptance, actor.id);
    financeEntry = result.financeEntry;
    debt = result.debt;
    savingsGoal = result.savingsGoal;
  } else {
    throw new HttpError(400, "This artifact cannot be added to Pulse");
  }

  const now = new Date();
  const nextAcceptance = await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: {
      status: "ADDED",
      acceptedAt: acceptance.acceptedAt ?? now,
      addedAt: now,
      taskId: task?.id ?? acceptance.taskId ?? null,
      financeEntryId: financeEntry?.id ?? acceptance.financeEntryId ?? null,
      debtId: debt?.id ?? acceptance.debtId ?? null,
      savingsGoalId: savingsGoal?.id ?? acceptance.savingsGoalId ?? null,
    },
  });

  await createActivity(artifact.id, "ADDED_TO_PULSE", actor.id, actor.id, {
    taskId: task?.id ?? null,
    financeEntryId: financeEntry?.id ?? null,
    debtId: debt?.id ?? null,
    savingsGoalId: savingsGoal?.id ?? null,
  });
  const notification = await notifyArtifactOwner(artifact, actor.id, "added");

  return {
    artifact,
    acceptance: nextAcceptance,
    task,
    financeEntry,
    debt,
    savingsGoal,
    notification,
  };
}

export async function completeShareArtifact(artifactId: string, actor: ViewerContext) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) throw new HttpError(404, "Artifact not found");
  const allowed = await canViewerAccessArtifact(artifact as any, actor, artifact.id);
  if (!allowed) throw new HttpError(403, "Forbidden");

  const acceptance = await getExistingAcceptance(artifact.id, actor.id);
  if (!acceptance) throw new HttpError(403, "Viewer can only view this card");
  const allowedActions = getAllowedArtifactActions(artifact, actor.id, acceptance);
  if (!allowedActions.includes("MARK_COMPLETED")) {
    throw new HttpError(400, "This action is not available");
  }
  if (!acceptance.taskId) throw new HttpError(400, "No linked task to complete");

  const task = await prisma.task.findUnique({ where: { id: acceptance.taskId } });
  if (!task || task.userId !== actor.id || task.deletedAt) throw new HttpError(404, "Task not found");

  const now = new Date();
  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: { completed: true },
  });
  const nextAcceptance = await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: {
      status: "COMPLETED",
      acceptedAt: acceptance.acceptedAt ?? now,
      addedAt: acceptance.addedAt ?? now,
      completedAt: now,
    },
  });

  await createActivity(artifact.id, "COMPLETED", actor.id, actor.id, {
    taskId: updatedTask.id,
  });
  const notification = await notifyArtifactOwner(artifact, actor.id, "completed");

  return {
    artifact,
    acceptance: nextAcceptance,
    task: updatedTask,
    notification,
  };
}

export async function settleShareArtifact(
  artifactId: string,
  actor: ViewerContext,
  input: {
    amount: number;
    note?: string | null;
    targetUserId?: string | null;
  },
) {
  const artifact = await prisma.pulseShareArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) throw new HttpError(404, "Artifact not found");
  const allowed = await canViewerAccessArtifact(artifact as any, actor, artifact.id);
  if (!allowed) throw new HttpError(403, "Forbidden");

  const amount = roundMoney(Number(input.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Amount must be greater than zero");
  }

  const isBillArtifact = artifact.actionType === "FINANCE_SPLIT";
  const targetUserId = typeof input.targetUserId === "string" && input.targetUserId.trim() ? input.targetUserId.trim() : actor.id;
  if (!isBillArtifact && targetUserId !== actor.id) {
    throw new HttpError(400, "Only shared bill allows paying for another participant");
  }

  const acceptance = await getExistingAcceptance(artifact.id, targetUserId);
  if (!acceptance) throw new HttpError(403, "Viewer can only view this card");
  if (acceptance.role === "AUTHOR" && targetUserId === artifact.ownerId && !isOwnerParticipating(artifact) && isBillArtifact) {
    throw new HttpError(400, "Owner is not participating in this bill");
  }
  if (!acceptance.acceptedAt && !acceptance.addedAt) {
    throw new HttpError(400, "Participant has not accepted this card yet");
  }

  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  const targetUser = targetUserId === actor.id
    ? null
    : await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true },
      });

  let debt: any = null;
  let savingsGoal: any = null;
  let financeEntry: any = null;
  let realtimeTargets: Array<{ artifactId: string; originChatId?: string | null; ownerId: string; userId: string }> = [];

  let hydratedAcceptance = acceptance;
  if (!acceptance.debtId && !acceptance.savingsGoalId && shouldAutoMaterializeFinanceOnAccept(artifact)) {
    const result = await materializeFinanceArtifact(artifact, acceptance, targetUserId);
    hydratedAcceptance = await prisma.pulseArtifactAcceptance.update({
      where: { id: acceptance.id },
      data: {
        status: "ADDED",
        acceptedAt: acceptance.acceptedAt ?? new Date(),
        addedAt: acceptance.addedAt ?? new Date(),
        debtId: result.debt?.id ?? acceptance.debtId ?? null,
        savingsGoalId: result.savingsGoal?.id ?? acceptance.savingsGoalId ?? null,
        financeEntryId: result.financeEntry?.id ?? acceptance.financeEntryId ?? null,
      },
    });
  }

  if (isBillArtifact || isDebtArtifact(artifact)) {
    if (!hydratedAcceptance.debtId) throw new HttpError(400, "Linked debt not found");
    const existingDebt = await prisma.pulseDebt.findUnique({ where: { id: hydratedAcceptance.debtId } });
    if (!existingDebt || existingDebt.userId !== targetUserId) throw new HttpError(404, "Debt not found");
    const remainingAmount = roundMoney(Math.max(0, Number(existingDebt.totalAmount ?? 0) - Number(existingDebt.paidAmount ?? 0)));
    if (amount > remainingAmount) {
      throw new HttpError(400, "Amount exceeds the remaining debt");
    }

    debt = await prisma.pulseDebt.update({
      where: { id: existingDebt.id },
      data: {
        paidAmount: Math.min(Number(existingDebt.totalAmount ?? 0), roundMoney(Number(existingDebt.paidAmount ?? 0) + amount)),
      },
    });

    financeEntry = await prisma.pulseFinanceEntry.create({
      data: {
        userId: actor.id,
        date: new Date(),
        type: "EXPENSE",
        title: targetUserId === actor.id
          ? `Погашение долга · ${artifact.title ?? existingDebt.title}`
          : `Оплата за @${targetUser?.username ?? "участника"} · ${artifact.title ?? existingDebt.title}`,
        amount,
        categoryId: null,
        notes:
          note ??
          (targetUserId === actor.id
            ? `Платёж из карточки «${artifact.title ?? existingDebt.title}».`
            : `Оплата за @${targetUser?.username ?? "участника"} из карточки «${artifact.title ?? existingDebt.title}».`),
        recurrenceJson: toPrismaNullableJson(null),
      },
    });

    realtimeTargets = await syncArtifactStateFromLinkedFinance({ debtId: debt.id });
  } else if (isSavingsArtifact(artifact)) {
    if (!hydratedAcceptance.savingsGoalId) throw new HttpError(400, "Linked savings goal not found");
    const existingGoal = await prisma.pulseSavingsGoal.findUnique({ where: { id: hydratedAcceptance.savingsGoalId } });
    if (!existingGoal || existingGoal.userId !== targetUserId) throw new HttpError(404, "Savings goal not found");
    const remainingAmount = roundMoney(Math.max(0, Number(existingGoal.targetAmount ?? 0) - Number(existingGoal.savedAmount ?? 0)));
    if (amount > remainingAmount) {
      throw new HttpError(400, "Amount exceeds the remaining goal");
    }

    savingsGoal = await prisma.pulseSavingsGoal.update({
      where: { id: existingGoal.id },
      data: {
        savedAmount: roundMoney(Number(existingGoal.savedAmount ?? 0) + amount),
      },
    });

    financeEntry = await prisma.pulseFinanceEntry.create({
      data: {
        userId: actor.id,
        date: new Date(),
        type: "EXPENSE",
        title: `Пополнение накопления · ${artifact.title ?? existingGoal.title}`,
        amount,
        categoryId: null,
        notes: note ?? `Пополнение из карточки «${artifact.title ?? existingGoal.title}».`,
        recurrenceJson: toPrismaNullableJson(null),
      },
    });

    realtimeTargets = await syncArtifactStateFromLinkedFinance({ savingsGoalId: savingsGoal.id });
  } else {
    throw new HttpError(400, "This artifact does not support settlements");
  }

  await createActivity(artifact.id, "SETTLED", actor.id, targetUserId, {
    amount,
    note,
    financeEntryId: financeEntry?.id ?? null,
    debtId: debt?.id ?? null,
    savingsGoalId: savingsGoal?.id ?? null,
    paidForUserId: targetUserId !== actor.id ? targetUserId : null,
  });

  const notification = await notifyArtifactOwner(artifact, actor.id, "settled");

  return {
    artifact,
    financeEntry,
    debt,
    savingsGoal,
    realtimeTargets,
    notification,
  };
}

export async function syncArtifactStateFromTask(taskId: string, completed: boolean) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const sourceMeta = readArtifactTaskSourceMeta(task?.sourceKey ?? null);
  const acceptance =
    (await prisma.pulseArtifactAcceptance.findFirst({
      where: { taskId },
      include: { artifact: true },
    })) ||
    (
      sourceMeta?.artifactId && task
        ? await prisma.pulseArtifactAcceptance.findFirst({
            where: {
              artifactId: sourceMeta.artifactId,
              userId: task.userId,
            },
            include: { artifact: true },
          })
        : null
    );
  if (!acceptance) return null;

  if (sourceMeta?.kind === "SUBTASK") {
    const recurrence = readTaskRecurrenceMeta(task);
    if (sourceMeta.artifactId && sourceMeta.subtaskKey && recurrence.subtaskAssignmentMode === "ANYONE") {
      const siblingTasks = await prisma.task.findMany({
        where: {
          sourceKey: buildArtifactSubtaskSourceKey(sourceMeta.artifactId, sourceMeta.subtaskKey),
          deletedAt: null,
        },
      });

      if (completed) {
        await Promise.all(
          siblingTasks.map((siblingTask) =>
            prisma.task.update({
              where: { id: siblingTask.id },
              data: {
                completed: true,
                recurrenceJson: toPrismaNullableJson({
                  ...readTaskRecurrenceMeta(siblingTask),
                  anyoneResolvedByUserId: acceptance.userId,
                  anyoneResolvedByTaskId: taskId,
                }),
              },
            }),
          ),
        );
      } else if (recurrence.anyoneResolvedByUserId === acceptance.userId) {
        await Promise.all(
          siblingTasks.map((siblingTask) => {
            const siblingRecurrence = readTaskRecurrenceMeta(siblingTask);
            const { anyoneResolvedByTaskId: _ignoredTaskId, anyoneResolvedByUserId: _ignoredUserId, ...nextRecurrence } = siblingRecurrence;
            return prisma.task.update({
              where: { id: siblingTask.id },
              data: {
                completed: false,
                recurrenceJson: toPrismaNullableJson(nextRecurrence),
              },
            });
          }),
        );
      }
    }

    await createActivity(acceptance.artifactId, "UPDATED", acceptance.userId, acceptance.userId, {
      taskId,
      completed,
      subtask: true,
    });

    return {
      artifactId: acceptance.artifactId,
      originChatId: acceptance.artifact.originChatId,
      ownerId: acceptance.artifact.ownerId,
      userId: acceptance.userId,
      acceptance,
    };
  }

  const now = new Date();
  const nextAcceptance = await prisma.pulseArtifactAcceptance.update({
    where: { id: acceptance.id },
    data: {
      status: completed ? "COMPLETED" : acceptance.addedAt ? "ADDED" : acceptance.acceptedAt ? "ACCEPTED" : "PENDING",
      completedAt: completed ? now : null,
    },
  });

  await createActivity(acceptance.artifactId, completed ? "COMPLETED" : "UPDATED", acceptance.userId, acceptance.userId, {
    taskId,
    completed,
  });

  return {
    artifactId: acceptance.artifactId,
    originChatId: acceptance.artifact.originChatId,
    ownerId: acceptance.artifact.ownerId,
    userId: acceptance.userId,
    acceptance: nextAcceptance,
  };
}

export async function syncArtifactStateFromLinkedFinance(input: { debtId?: string | null; savingsGoalId?: string | null }) {
  const where = input.debtId
    ? { debtId: input.debtId }
    : input.savingsGoalId
      ? { savingsGoalId: input.savingsGoalId }
      : null;
  if (!where) return [];

  const acceptances = await prisma.pulseArtifactAcceptance.findMany({
    where,
    include: {
      artifact: true,
      debt: true,
      savingsGoal: true,
    },
  });

  const results: Array<{
    artifactId: string;
    originChatId?: string | null;
    ownerId: string;
    userId: string;
  }> = [];

  for (const acceptance of acceptances) {
    const totalAmount = acceptance.debt
      ? Number(acceptance.debt.totalAmount ?? 0)
      : Number(acceptance.savingsGoal?.targetAmount ?? 0);
    const currentAmount = acceptance.debt
      ? Number(acceptance.debt.paidAmount ?? 0)
      : Number(acceptance.savingsGoal?.savedAmount ?? 0);
    const completed = totalAmount > 0 && currentAmount >= totalAmount;
    const nextStatus = completed ? "COMPLETED" : acceptance.addedAt ? "ADDED" : acceptance.acceptedAt ? "ACCEPTED" : "PENDING";
    const nextCompletedAt = completed ? acceptance.completedAt ?? new Date() : null;

    if (acceptance.status !== nextStatus || String(acceptance.completedAt ?? "") !== String(nextCompletedAt ?? "")) {
      await prisma.pulseArtifactAcceptance.update({
        where: { id: acceptance.id },
        data: {
          status: nextStatus as any,
          completedAt: nextCompletedAt,
        },
      });

      await createActivity(
        acceptance.artifactId,
        completed ? "SETTLED" : "UPDATED",
        acceptance.userId,
        acceptance.userId,
        {
          debtId: acceptance.debtId,
          savingsGoalId: acceptance.savingsGoalId,
          currentAmount,
          totalAmount,
        },
      );
    }

    results.push({
      artifactId: acceptance.artifactId,
      originChatId: acceptance.artifact.originChatId,
      ownerId: acceptance.artifact.ownerId,
      userId: acceptance.userId,
    });
  }

  return results;
}

export async function unlinkArtifactLinkedFinance(input: { debtId?: string | null; savingsGoalId?: string | null }) {
  const where = input.debtId
    ? { debtId: input.debtId }
    : input.savingsGoalId
      ? { savingsGoalId: input.savingsGoalId }
      : null;
  if (!where) return [];

  const acceptances = await prisma.pulseArtifactAcceptance.findMany({
    where,
    include: {
      artifact: true,
    },
  });

  const results: Array<{
    artifactId: string;
    originChatId?: string | null;
    ownerId: string;
    userId: string;
  }> = [];

  for (const acceptance of acceptances) {
    await declineAcceptanceAndClearLinks(acceptance, {
      removedDebtId: input.debtId ?? null,
      removedSavingsGoalId: input.savingsGoalId ?? null,
      leftAfterAcceptance: true,
      declinedVia: "tracker_delete",
    });

    results.push({
      artifactId: acceptance.artifactId,
      originChatId: acceptance.artifact.originChatId,
      ownerId: acceptance.artifact.ownerId,
      userId: acceptance.userId,
    });
  }

  return results;
}

export async function unlinkArtifactLinkedTask(taskId: string) {
  const directAcceptances = await prisma.pulseArtifactAcceptance.findMany({
    where: { taskId },
    include: {
      artifact: true,
    },
  });
  const task = directAcceptances.length ? null : await prisma.task.findUnique({ where: { id: taskId } });
  const sourceMeta = readArtifactTaskSourceMeta(task?.sourceKey ?? null);
  const acceptances =
    directAcceptances.length
      ? directAcceptances
      : sourceMeta?.artifactId && task
        ? await prisma.pulseArtifactAcceptance.findMany({
            where: {
              artifactId: sourceMeta.artifactId,
              userId: task.userId,
            },
            include: {
              artifact: true,
            },
          })
        : [];

  const results: Array<{
    artifactId: string;
    originChatId?: string | null;
    ownerId: string;
    userId: string;
  }> = [];

  for (const acceptance of acceptances) {
    const removedLinks = await removeLinkedEntitiesForAcceptance(acceptance, acceptance.userId);
    await declineAcceptanceAndClearLinks(acceptance, {
      ...removedLinks,
      removedTaskId: taskId,
      leftAfterAcceptance: true,
      declinedVia: "tracker_delete",
    });

    results.push({
      artifactId: acceptance.artifactId,
      originChatId: acceptance.artifact.originChatId,
      ownerId: acceptance.artifact.ownerId,
      userId: acceptance.userId,
    });
  }

  return results;
}
