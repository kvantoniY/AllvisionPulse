import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireActiveUser, type AuthedRequest } from "../middleware/auth";
import { asyncHandler, HttpError } from "../utils/http";
import { requireProgramDefinitionAccess, requireProgramRunAccess, requireProgramRunOwnership } from "../services/programs/access";
import {
  applyRunRecovery,
  archiveProgramRun,
  cancelProgramRun,
  completeRunAction,
  generateRunFromVersion,
  getRunDetail,
  listTodayProgramActions,
  pauseProgramRun,
  recomputeRunStats,
  resumeProgramRun,
  rescheduleRunAction,
  skipRunAction,
  softDeleteProgramRun,
  syncRunLifecycleTasks,
} from "../services/programs/runtime";
import { parseOptionalDate } from "../services/programs/helpers";
import { assertUserCanStartPersonalProgramRun, assertUserHasNoProgramConflict } from "../services/programs/participation";

const router = Router();
router.use(requireAuth, requireActiveUser);

function viewerFromReq(req: AuthedRequest) {
  return {
    id: req.user!.id,
    role: req.user!.role,
  };
}

const startRunSchema = z.object({
  programId: z.string().min(1),
  versionId: z.string().min(1).optional().nullable(),
  startDate: z.string().optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
});

const completeActionSchema = z.object({
  note: z.string().max(4000).optional().nullable(),
  reflectionText: z.string().max(8000).optional().nullable(),
});

const skipActionSchema = z.object({
  note: z.string().max(4000).optional().nullable(),
});

const rescheduleActionSchema = z.object({
  targetDate: z.string().min(1),
  note: z.string().max(4000).optional().nullable(),
});

const recoverySchema = z.object({
  resolution: z.enum([
    "CONTINUE_CURRENT_DAY",
    "SOFT_CATCH_UP",
    "SHIFT_FORWARD",
    "RECOVERY_DAY",
    "SKIP_DAY",
    "COMPLETE_AS_DONE",
    "COMPLETE_PARTIAL",
  ]),
  reasonText: z.string().max(4000).optional().nullable(),
  actionIds: z.array(z.string().min(1)).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(4000).optional().nullable(),
});

router.get(
  "/today",
  asyncHandler(async (req: AuthedRequest, res) => {
    const today = await listTodayProgramActions(req.user!.id);
    res.json(today);
  }),
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = startRunSchema.parse(req.body);
    const viewer = viewerFromReq(req);
    const definition = await requireProgramDefinitionAccess(viewer, body.programId);
    const versionId = body.versionId ?? definition.currentVersionId;
    if (!versionId) throw new HttpError(400, "Program must be published before starting");

    if (body.sessionId) {
      await assertUserHasNoProgramConflict(req.user!.id, definition.id, { excludeSessionId: body.sessionId });
    } else {
      await assertUserCanStartPersonalProgramRun(req.user!.id, definition.id);
    }

    if (body.versionId && body.versionId !== definition.currentVersionId && viewer.role !== "ADMIN" && definition.ownerId !== viewer.id) {
      throw new HttpError(403, "Only the author can start a non-current version");
    }

    const version = await prisma.programVersion.findUnique({
      where: { id: versionId },
      select: { id: true, definitionId: true },
    });
    if (!version || version.definitionId !== definition.id) throw new HttpError(404, "Program version not found");

    const run = await prisma.$transaction(async (tx) => {
      const created = await generateRunFromVersion(tx, {
        userId: req.user!.id,
        programDefinitionId: definition.id,
        programVersionId: version.id,
        sessionId: body.sessionId ?? null,
        startDate: parseOptionalDate(body.startDate) ?? undefined,
      });
      if (!created) throw new HttpError(500, "Run was not created");
      await syncRunLifecycleTasks(tx, created.id);
      return recomputeRunStats(tx, created.id);
    });

    const detail = await getRunDetail(run.id);
    res.json(detail);
  }),
);

router.get(
  "/:runId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    await requireProgramRunAccess(viewerFromReq(req), runId);
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/actions/:actionId/complete",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    const actionId = req.params.actionId.toString();
    const body = completeActionSchema.parse(req.body);
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await completeRunAction(prisma, {
      runId,
      actionId,
      userId: req.user!.id,
      note: body.note ?? null,
      reflectionText: body.reflectionText ?? null,
    });
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/actions/:actionId/skip",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    const actionId = req.params.actionId.toString();
    const body = skipActionSchema.parse(req.body);
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await skipRunAction(prisma, {
      runId,
      actionId,
      userId: req.user!.id,
      note: body.note ?? null,
    });
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/actions/:actionId/reschedule",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    const actionId = req.params.actionId.toString();
    const body = rescheduleActionSchema.parse(req.body);
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await rescheduleRunAction(prisma, {
      runId,
      actionId,
      userId: req.user!.id,
      targetDate: body.targetDate,
      note: body.note ?? null,
    });
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/recovery",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    const body = recoverySchema.parse(req.body);
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    const recovery = await applyRunRecovery(prisma, {
      runId,
      userId: req.user!.id,
      resolution: body.resolution,
      reasonText: body.reasonText ?? null,
      actionIds: body.actionIds,
    });
    const detail = await getRunDetail(runId);
    res.json({ ...detail, recoveryApplied: recovery });
  }),
);

router.post(
  "/:runId/pause",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await pauseProgramRun(prisma, runId, req.user!.id);
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/resume",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await resumeProgramRun(prisma, runId, req.user!.id);
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/cancel",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    const body = cancelSchema.parse(req.body);
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await cancelProgramRun(prisma, runId, req.user!.id, body.reason ?? null);
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.post(
  "/:runId/archive",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await archiveProgramRun(prisma, runId, req.user!.id);
    const detail = await getRunDetail(runId);
    res.json(detail);
  }),
);

router.delete(
  "/:runId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const runId = req.params.runId.toString();
    await requireProgramRunOwnership(viewerFromReq(req), runId);
    await softDeleteProgramRun(prisma, runId, req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;
