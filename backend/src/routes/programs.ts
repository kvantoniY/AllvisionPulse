import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, requireActiveUser, type AuthedRequest } from "../middleware/auth";
import { asyncHandler } from "../utils/http";
import {
  archiveProgramDefinition,
  acceptProgramInviteByToken,
  createProgramDefinition,
  getProgramInvitePreviewByToken,
  deleteProgramDefinition,
  getProgramDetail,
  listPrograms,
  publishProgramDefinition,
  updateProgramDefinition,
} from "../services/programs/programs";

const router = Router();
router.use(requireAuth, requireActiveUser);

function viewerFromReq(req: AuthedRequest) {
  return {
    id: req.user!.id,
    role: req.user!.role,
  };
}

const actionSchema = z.object({
  order: z.number().int().min(0).optional().nullable(),
  actionType: z.enum([
    "TASK",
    "HEALTH_CHECKIN",
    "NUTRITION_TARGET",
    "FINANCE_TARGET",
    "JOURNAL",
    "REFLECTION",
    "REMINDER",
    "INFO_ONLY",
    "MILESTONE",
    "CUSTOM",
  ]),
  integrationType: z
    .enum(["NONE", "TASK_TRACKER", "HEALTH", "NUTRITION", "FINANCE", "JOURNAL", "REMINDER", "PULSE_WIDGET"])
    .optional()
    .nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  required: z.boolean().optional(),
  estimatedMinutes: z.number().int().min(0).max(24 * 60).optional().nullable(),
  completionPolicy: z.string().max(200).optional().nullable(),
  reschedulePolicy: z.string().max(200).optional().nullable(),
  payloadJson: z.record(z.string(), z.any()).optional().nullable(),
});

const milestoneSchema = z.object({
  order: z.number().int().min(0).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  targetDay: z.number().int().min(1).optional().nullable(),
  metricKey: z.string().max(120).optional().nullable(),
  payloadJson: z.record(z.string(), z.any()).optional().nullable(),
});

const daySchema = z.object({
  dayNumber: z.number().int().min(1).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  dayText: z.string().max(8000).optional().nullable(),
  tipOfDay: z.string().max(4000).optional().nullable(),
  motivationOfDay: z.string().max(4000).optional().nullable(),
  reflectionPrompt: z.string().max(4000).optional().nullable(),
  isRecoveryTemplate: z.boolean().optional(),
  actions: z.array(actionSchema).optional(),
  milestones: z.array(milestoneSchema).optional(),
});

const stageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  startDay: z.number().int().min(1).optional().nullable(),
  endDay: z.number().int().min(1).optional().nullable(),
  milestoneText: z.string().max(4000).optional().nullable(),
});

const programBuilderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  theme: z.string().max(120).optional().nullable(),
  language: z.string().max(12).optional().nullable(),
  coverUrl: z.string().max(2000).optional().nullable(),
  durationDays: z.number().int().min(1).max(3650).optional().nullable(),
  accessMode: z.enum(["PRIVATE", "RESTRICTED", "PUBLIC"]),
  structureType: z.enum(["FIXED_DURATION", "ROLLING", "OPEN_ENDED"]),
  collaborativeEnabled: z.boolean().optional(),
  allowedUsernames: z.array(z.string().trim().min(1).max(60)).optional(),
  rules: z
    .object({
      allowSkip: z.boolean().optional(),
      allowPause: z.boolean().optional(),
      allowResume: z.boolean().optional(),
      allowCancel: z.boolean().optional(),
      allowRecovery: z.boolean().optional(),
      maxReschedulesPerAction: z.number().int().min(0).max(30).optional(),
      recoveryConfigJson: z.record(z.string(), z.any()).optional().nullable(),
      progressConfigJson: z.record(z.string(), z.any()).optional().nullable(),
      integrationConfigJson: z.record(z.string(), z.any()).optional().nullable(),
    })
    .optional()
    .nullable(),
  stages: z.array(stageSchema).optional(),
  days: z.array(daySchema).optional(),
});

router.get(
  "/access/users/search",
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = (req.query.q?.toString() ?? "").trim();
    if (!q) {
      res.json({ items: [] });
      return;
    }

    const items = await prisma.user.findMany({
      where: {
        username: {
          contains: q,
          mode: "insensitive",
        },
      },
      take: 10,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
      orderBy: { username: "asc" },
    });

    res.json({ items });
  }),
);

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = z.enum(["active", "library", "mine", "collaborative", "drafts"]).catch("library").parse(req.query.scope);
    const items = await listPrograms(viewerFromReq(req), scope);
    res.json({ items });
  }),
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = programBuilderSchema.parse(req.body);
    const program = await createProgramDefinition(req.user!.id, body);
    res.json({ program });
  }),
);

router.get(
  "/invites/link/:token",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.params.token.toString();
    const invite = await getProgramInvitePreviewByToken(token, viewerFromReq(req));
    res.json({ invite });
  }),
);

router.post(
  "/invites/link/:token/accept",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.params.token.toString();
    const program = await acceptProgramInviteByToken(token, viewerFromReq(req));
    res.json({ program });
  }),
);

router.get(
  "/:programId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const programId = req.params.programId.toString();
    const program = await getProgramDetail(programId, viewerFromReq(req));
    res.json({ program });
  }),
);

router.patch(
  "/:programId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const programId = req.params.programId.toString();
    const body = programBuilderSchema.parse(req.body);
    const program = await updateProgramDefinition(programId, viewerFromReq(req), body);
    res.json({ program });
  }),
);

router.post(
  "/:programId/publish",
  asyncHandler(async (req: AuthedRequest, res) => {
    const programId = req.params.programId.toString();
    const version = await publishProgramDefinition(programId, viewerFromReq(req));
    res.json({ version });
  }),
);

router.post(
  "/:programId/archive",
  asyncHandler(async (req: AuthedRequest, res) => {
    const programId = req.params.programId.toString();
    const program = await archiveProgramDefinition(programId, viewerFromReq(req));
    res.json({ program });
  }),
);

router.delete(
  "/:programId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const programId = req.params.programId.toString();
    const program = await deleteProgramDefinition(programId, viewerFromReq(req));
    res.json({ program });
  }),
);

export default router;
