
import { Router } from "express";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, requireActiveUser, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireActiveUser);

const TaskSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional().nullable(),
  kind: z.enum(["TASK","EVENT"]).default("TASK"),
  dueDate: z.string().optional().nullable(), // ISO or YYYY-MM-DD
  hasTime: z.boolean().optional(),
  completed: z.boolean().optional(),
  priority: z.number().int().min(0).max(5).optional(),
  tags: z.array(z.string().max(32)).optional(),
  remindersJson: z.any().optional().nullable(),
  recurrenceJson: z.any().optional().nullable(),
});

router.get("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const fromQ = req.query.from?.toString();
  const toQ = req.query.to?.toString();
  const where: any = { userId: req.user!.id, deletedAt: null };
  if (fromQ && toQ) {
    const from = dayjs(fromQ);
    const to = dayjs(toQ);
    if (!from.isValid() || !to.isValid()) throw new HttpError(400, "Invalid from/to");
    where.dueDate = { gte: from.toDate(), lte: to.toDate() };
  }
  const tasks = await prisma.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] });
  res.json({ items: tasks });
}));

router.post("/", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = TaskSchema.parse(req.body);
  const dueDate = body.dueDate ? dayjs(body.dueDate).toDate() : undefined;
  const task = await prisma.task.create({
    data: {
      userId: req.user!.id,
      title: body.title,
      notes: body.notes ?? undefined,
      kind: body.kind,
      dueDate,
      hasTime: body.hasTime ?? (body.dueDate ? true : false),
      completed: body.completed ?? false,
      priority: body.priority ?? 0,
      tags: body.tags ?? [],
      remindersJson: body.remindersJson ?? undefined,
      recurrenceJson: body.recurrenceJson ?? undefined,
    },
  });
  res.json({ task });
}));

router.patch("/:taskId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const taskId = req.params.taskId;
  const body = TaskSchema.partial().parse(req.body);
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Task not found");
  if (req.user!.role !== "ADMIN" && existing.userId !== req.user!.id) throw new HttpError(403, "Forbidden");

  const dueDate = body.dueDate !== undefined ? (body.dueDate ? dayjs(body.dueDate).toDate() : null) : undefined;

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...body,
      notes: body.notes === null ? null : body.notes ?? undefined,
      dueDate: dueDate as any,
      remindersJson: body.remindersJson === null ? null : body.remindersJson ?? undefined,
      recurrenceJson: body.recurrenceJson === null ? null : body.recurrenceJson ?? undefined,
      tags: body.tags ?? undefined,
    } as any,
  });

  res.json({ task });
}));

router.post("/:taskId/toggle", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const taskId = req.params.taskId;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Task not found");
  if (req.user!.role !== "ADMIN" && existing.userId !== req.user!.id) throw new HttpError(403, "Forbidden");
  const task = await prisma.task.update({ where: { id: taskId }, data: { completed: !existing.completed } });
  res.json({ task });
}));

router.delete("/:taskId", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const taskId = req.params.taskId;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Task not found");
  if (req.user!.role !== "ADMIN" && existing.userId !== req.user!.id) throw new HttpError(403, "Forbidden");
  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
}));

export default router;
