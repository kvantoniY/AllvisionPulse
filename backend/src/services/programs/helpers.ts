import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import dayjs from "dayjs";
import { HttpError } from "../../utils/http";

export type ViewerContext = {
  id: string;
  role: string;
};

export function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function toDateKey(value: Date | string | dayjs.Dayjs) {
  return dayjs(value).format("YYYY-MM-DD");
}

export function startOfDay(value?: Date | string | null) {
  const parsed = value ? dayjs(value) : dayjs();
  if (!parsed.isValid()) throw new HttpError(400, "Invalid date");
  return parsed.startOf("day");
}

export function endOfDay(value?: Date | string | null) {
  return startOfDay(value).endOf("day");
}

export function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) throw new HttpError(400, "Invalid date");
  return parsed.startOf("day").toDate();
}

export function addDays(value: Date | string, days: number) {
  return startOfDay(value).add(days, "day").toDate();
}

export function safeInt(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.round(next) : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildProgramTaskSourceKey(actionId: string) {
  return `programAction:${actionId}`;
}

export function isProgramTaskSourceKey(value?: string | null) {
  return typeof value === "string" && value.startsWith("programAction:");
}

export function readProgramActionIdFromSourceKey(value?: string | null) {
  if (!isProgramTaskSourceKey(value)) return null;
  const sourceKey = value as string;
  return sourceKey.slice("programAction:".length) || null;
}

export function makeInviteToken() {
  return randomUUID();
}

export function makeAchievementKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => (typeof part === "string" ? part.trim() : String(part)))
    .filter(Boolean)
    .join(":");
}

export function isTerminalRunStatus(status: string) {
  return ["CANCELLED", "COMPLETED", "ARCHIVED", "DELETED"].includes(status);
}

export function isPausedRunStatus(status: string) {
  return status === "PAUSED";
}

export function getActionOpenPath(action: { integrationType?: string | null; actionType?: string | null }) {
  if (action.integrationType === "TASK_TRACKER" || action.actionType === "TASK") return "/health?tab=tasks";
  if (action.integrationType === "HEALTH" || action.actionType === "HEALTH_CHECKIN") return "/health?tab=health";
  if (action.integrationType === "NUTRITION" || action.actionType === "NUTRITION_TARGET") return "/health?tab=health";
  if (action.integrationType === "FINANCE" || action.actionType === "FINANCE_TARGET") return "/health?tab=finance";
  if (action.integrationType === "JOURNAL" || action.actionType === "JOURNAL" || action.actionType === "REFLECTION") return "/health?tab=programs";
  return null;
}

export function pick<T>(value: T | null | undefined, fallback: T) {
  return value ?? fallback;
}

export function toPrismaNullableJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return cloneJson(value) as Prisma.InputJsonValue;
}
