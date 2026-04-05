import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth, requireActiveUser, type AuthedRequest } from "../middleware/auth";
import { asyncHandler, HttpError } from "../utils/http";
import { ensureAchievementDefinitions, listPulseAchievementsForUser } from "../services/programs/achievements";

const router = Router();
router.use(requireAuth, requireActiveUser);

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ensureAchievementDefinitions();

    const userId = req.query.userId?.toString();
    const username = req.query.username?.toString();

    let targetUserId = req.user!.id;
    if (userId) {
      targetUserId = userId;
    } else if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!user) throw new HttpError(404, "User not found");
      targetUserId = user.id;
    }

    const payload = await listPulseAchievementsForUser(req.user!.id, targetUserId);
    res.json(payload);
  }),
);

export default router;
