import { Router } from "express";
import { getEnv } from "../config/env";
import { requireActiveUser, requireAuth, type AuthedRequest } from "../middleware/auth";
import { buildTurnCredentials } from "../utils/turn";

const router = Router();

router.use(requireAuth, requireActiveUser);

router.get("/turn-credentials", (req: AuthedRequest, res) => {
  const env = getEnv();
  const secret = env.TURN_SECRET?.trim();
  const host = env.TURN_HOST.trim();

  res.setHeader("Cache-Control", "no-store");

  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!secret || !host) {
    return res.status(503).json({
      enabled: false,
      message: "TURN is not configured",
    });
  }

  return res.json(
    buildTurnCredentials({
      userId: req.user.id,
      secret,
      host,
      port: env.TURN_PORT,
      ttlSec: env.TURN_TTL_SEC,
    }),
  );
});

export default router;
