import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireActiveUser, type AuthedRequest } from "../middleware/auth";
import { asyncHandler } from "../utils/http";
import { requireProgramInviteAccess, requireProgramSessionAccess, requireProgramSessionHost } from "../services/programs/access";
import {
  acceptProgramInvite,
  acceptProgramInviteByToken,
  createProgramSession,
  declineProgramInvite,
  getProgramSessionInvitePreviewByToken,
  getProgramSessionDetail,
  leaveProgramSession,
  listIncomingProgramInvites,
  startProgramSession,
} from "../services/programs/sessions";

const router = Router();
router.use(requireAuth, requireActiveUser);

function viewerFromReq(req: AuthedRequest) {
  return {
    id: req.user!.id,
    role: req.user!.role,
  };
}

const createSessionSchema = z.object({
  programId: z.string().min(1),
  title: z.string().max(200).optional().nullable(),
  participantUsernames: z.array(z.string().trim().min(1).max(60)).optional(),
  joinMode: z.enum(["INVITE_ONLY", "LINK", "OPEN"]).optional(),
  startMode: z.enum(["NOW", "SCHEDULED", "HOST_MANUAL", "AUTO_ON_ACCEPT"]).optional(),
  scheduledStartAt: z.string().optional().nullable(),
  shareStatus: z.boolean().optional(),
  shareNumbers: z.boolean().optional(),
  shareMisses: z.boolean().optional(),
  shareMilestones: z.boolean().optional(),
  metricsVisibleJson: z.record(z.string(), z.any()).optional().nullable(),
});

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSessionSchema.parse(req.body);
    const session = await createProgramSession(body.programId, viewerFromReq(req), {
      title: body.title ?? null,
      participantUsernames: body.participantUsernames,
      joinMode: body.joinMode,
      startMode: body.startMode,
      scheduledStartAt: body.scheduledStartAt ?? null,
      shareStatus: body.shareStatus,
      shareNumbers: body.shareNumbers,
      shareMisses: body.shareMisses,
      shareMilestones: body.shareMilestones,
      metricsVisibleJson: body.metricsVisibleJson ?? null,
    });
    res.json({ session });
  }),
);

router.get(
  "/invites/inbox",
  asyncHandler(async (req: AuthedRequest, res) => {
    const items = await listIncomingProgramInvites(viewerFromReq(req));
    res.json({ items });
  }),
);

router.get(
  "/:sessionId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const sessionId = req.params.sessionId.toString();
    await requireProgramSessionAccess(viewerFromReq(req), sessionId);
    const session = await getProgramSessionDetail(sessionId, viewerFromReq(req));
    res.json({ session });
  }),
);

router.post(
  "/:sessionId/start",
  asyncHandler(async (req: AuthedRequest, res) => {
    const sessionId = req.params.sessionId.toString();
    await requireProgramSessionHost(viewerFromReq(req), sessionId);
    const session = await startProgramSession(sessionId, viewerFromReq(req));
    res.json({ session });
  }),
);

router.get(
  "/invites/link/:token",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.params.token.toString();
    const invite = await getProgramSessionInvitePreviewByToken(token, viewerFromReq(req));
    res.json({ invite });
  }),
);

router.post(
  "/:sessionId/leave",
  asyncHandler(async (req: AuthedRequest, res) => {
    const sessionId = req.params.sessionId.toString();
    await requireProgramSessionAccess(viewerFromReq(req), sessionId);
    const session = await leaveProgramSession(sessionId, viewerFromReq(req));
    res.json({ session });
  }),
);

router.post(
  "/invites/link/:token/accept",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.params.token.toString();
    const session = await acceptProgramInviteByToken(token, viewerFromReq(req));
    res.json({ session });
  }),
);

router.post(
  "/invites/:inviteId/accept",
  asyncHandler(async (req: AuthedRequest, res) => {
    const inviteId = req.params.inviteId.toString();
    await requireProgramInviteAccess(viewerFromReq(req), inviteId);
    const session = await acceptProgramInvite(inviteId, viewerFromReq(req));
    res.json({ session });
  }),
);

router.post(
  "/invites/:inviteId/decline",
  asyncHandler(async (req: AuthedRequest, res) => {
    const inviteId = req.params.inviteId.toString();
    await requireProgramInviteAccess(viewerFromReq(req), inviteId);
    const session = await declineProgramInvite(inviteId, viewerFromReq(req));
    res.json({ session });
  }),
);

export default router;
