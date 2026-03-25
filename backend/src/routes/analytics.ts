import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/http';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { refreshAnalyticsPresence, trackAnalyticsEvent } from '../utils/analytics';

const router = Router();
router.use(requireAuth);

const TrackEventSchema = z.object({
  sessionKey: z.string().trim().min(6).max(120),
  type: z.enum(['PAGE_VIEW', 'PAGE_LEAVE', 'HEARTBEAT', 'ACTION']),
  path: z.string().trim().min(1).max(240),
  pageLabel: z.string().trim().max(120).optional().nullable(),
  referrerPath: z.string().trim().max(240).optional().nullable(),
  actionKey: z.string().trim().max(120).optional().nullable(),
  durationSec: z.number().int().min(0).max(24 * 60 * 60).optional().nullable(),
  metadata: z.unknown().optional(),
});

router.post('/events', asyncHandler(async (req: AuthedRequest, res) => {
  const body = TrackEventSchema.parse(req.body);

  if (body.type === 'HEARTBEAT') {
    await refreshAnalyticsPresence(req.user!.id, body.sessionKey, body.path);
  }

  await trackAnalyticsEvent({
    userId: req.user!.id,
    sessionKey: body.sessionKey,
    type: body.type,
    path: body.path,
    pageLabel: body.pageLabel,
    referrerPath: body.referrerPath,
    actionKey: body.actionKey,
    durationSec: body.durationSec,
    metadata: body.metadata,
  });

  res.json({ ok: true });
}));

export default router;
