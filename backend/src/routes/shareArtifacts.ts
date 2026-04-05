import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireActiveUser, type AuthedRequest } from "../middleware/auth";
import { asyncHandler } from "../utils/http";
import {
  addShareArtifactToPulse,
  completeShareArtifact,
  createShareArtifact,
  listRecentShareArtifacts,
  resolveShareArtifact,
  respondToShareArtifact,
  settleShareArtifact,
} from "../services/shareArtifacts";
import { deliverNotification } from "../utils/notifications";

const router = Router();
router.use(requireAuth, requireActiveUser);

function viewerFromReq(req: AuthedRequest) {
  return {
    id: req.user!.id,
    role: req.user!.role,
  };
}

function emitArtifactUpdated(req: AuthedRequest, artifact: { id: string; originChatId?: string | null; ownerId: string }, extraUserIds: string[] = []) {
  const emitter = req.app.locals.emitter as any;
  if (artifact.originChatId) {
    emitter?.emitToChat(artifact.originChatId, "share-artifact:updated", {
      artifactId: artifact.id,
      chatId: artifact.originChatId,
      at: new Date().toISOString(),
    });
  }

  const userIds = Array.from(new Set([artifact.ownerId, ...extraUserIds].filter(Boolean)));
  for (const userId of userIds) {
    emitter?.emitToUser(userId, "share-artifact:updated", {
      artifactId: artifact.id,
      chatId: artifact.originChatId ?? null,
      at: new Date().toISOString(),
    });
  }
}

function emitNotification(req: AuthedRequest, notification: any | null | undefined) {
  if (!notification) return;
  void deliverNotification(req.app, notification);
}

const createShareSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1).optional().nullable(),
  kind: z.enum(["WIDGET", "METRIC", "PROGRAM", "PROGRAM_INVITE", "SESSION_INVITE", "PROGRAM_SUMMARY", "PROGRAM_PROGRESS", "ACHIEVEMENT", "TODAY_ACTIONS", "TASK", "FINANCE", "DEBT", "SAVINGS", "ACTION"]),
  mode: z.enum(["SNAPSHOT", "REFERENCE", "INVITE"]),
  actionType: z.enum(["TASK_REQUEST", "TASK_SUGGESTION", "SOCIAL_EVENT", "REMINDER_CARD", "FINANCE_SPLIT", "DEBT_SHARE", "SAVINGS_SHARE", "PROGRAM_INVITE", "PROGRAM_SESSION_INVITE", "PROGRAM_PROGRESS_SHARE", "METRIC_SHARE"]).optional().nullable(),
  visibilityScope: z.enum(["PRIVATE", "RESTRICTED", "PUBLIC"]).optional(),
  title: z.string().max(200).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  explicitPublicShare: z.boolean().optional(),
  payload: z.record(z.string(), z.any()).optional().nullable(),
  originChatId: z.string().uuid().optional().nullable(),
  originMessageId: z.string().uuid().optional().nullable(),
  participantUserIds: z.array(z.string().uuid()).max(50).optional(),
});

const respondSchema = z.object({
  response: z.enum(["ACCEPT", "DECLINE", "FOLLOW"]),
});

const settleSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(1000).optional().nullable(),
  targetUserId: z.string().uuid().optional().nullable(),
});

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const items = await listRecentShareArtifacts(req.user!.id, limit);
    res.json({ items });
  }),
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createShareSchema.parse(req.body);
    const artifact = await createShareArtifact({
      ownerId: req.user!.id,
      sourceType: body.sourceType,
      sourceId: body.sourceId ?? null,
      kind: body.kind,
      mode: body.mode,
      actionType: body.actionType ?? null,
      visibilityScope: body.visibilityScope,
      title: body.title ?? null,
      description: body.description ?? null,
      explicitPublicShare: body.explicitPublicShare,
      payload: body.payload ?? null,
      originChatId: body.originChatId ?? null,
      originMessageId: body.originMessageId ?? null,
      participantUserIds: body.participantUserIds ?? [],
    });
    res.json({ artifact });
  }),
);

router.get(
  "/:artifactId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const artifactId = req.params.artifactId.toString();
    const artifact = await resolveShareArtifact(artifactId, viewerFromReq(req));
    res.json({ artifact });
  }),
);

router.post(
  "/:artifactId/respond",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = respondSchema.parse(req.body);
    const result = await respondToShareArtifact(req.params.artifactId.toString(), viewerFromReq(req), body.response);
    emitArtifactUpdated(req, result.artifact, [req.user!.id]);
    emitNotification(req, result.notification);
    const artifact = await resolveShareArtifact(req.params.artifactId.toString(), viewerFromReq(req));
    res.json({ artifact, acceptance: result.acceptance });
  }),
);

router.post(
  "/:artifactId/add-to-pulse",
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await addShareArtifactToPulse(req.params.artifactId.toString(), viewerFromReq(req));
    emitArtifactUpdated(req, result.artifact, [req.user!.id]);
    emitNotification(req, result.notification);
    const artifact = await resolveShareArtifact(req.params.artifactId.toString(), viewerFromReq(req));
    res.json({
      artifact,
      acceptance: result.acceptance,
      task: result.task,
      financeEntry: result.financeEntry,
      debt: result.debt,
      savingsGoal: result.savingsGoal,
    });
  }),
);

router.post(
  "/:artifactId/complete",
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await completeShareArtifact(req.params.artifactId.toString(), viewerFromReq(req));
    emitArtifactUpdated(req, result.artifact, [req.user!.id]);
    emitNotification(req, result.notification);
    const artifact = await resolveShareArtifact(req.params.artifactId.toString(), viewerFromReq(req));
    res.json({
      artifact,
      acceptance: result.acceptance,
      task: result.task,
    });
  }),
);

router.post(
  "/:artifactId/settle",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = settleSchema.parse(req.body);
    const result = await settleShareArtifact(req.params.artifactId.toString(), viewerFromReq(req), {
      amount: body.amount,
      note: body.note ?? null,
      targetUserId: body.targetUserId ?? null,
    });
    emitArtifactUpdated(req, result.artifact, [req.user!.id, ...(result.realtimeTargets ?? []).map((item) => item.userId)]);
    emitNotification(req, result.notification);
    const artifact = await resolveShareArtifact(req.params.artifactId.toString(), viewerFromReq(req));
    res.json({
      artifact,
      financeEntry: result.financeEntry,
      debt: result.debt,
      savingsGoal: result.savingsGoal,
    });
  }),
);

export default router;
