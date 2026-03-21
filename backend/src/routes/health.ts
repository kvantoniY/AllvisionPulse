
import { Router } from "express";
import { z } from "zod";
import dayjs from "dayjs";
import { prisma } from "../db/prisma";
import { asyncHandler, HttpError } from "../utils/http";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const FactorsSchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD (defaults today)
  sleepHours: z.number().min(0).max(24).optional().nullable(),
  sleepQuality: z.number().int().min(1).max(10).optional().nullable(),
  alcohol: z.boolean().optional(),
  coffee: z.boolean().optional(),
  wellbeing: z.number().int().min(1).max(10).optional().nullable(),
  stress: z.number().int().min(1).max(10).optional().nullable(),
  activity: z.boolean().optional(),
  productivity: z.number().int().min(1).max(10).optional().nullable(),
  nutrition: z.number().int().min(1).max(10).optional().nullable(),
  smoking: z.boolean().optional(),
  comment: z.string().max(2000).optional().nullable(),
});

function clamp(n: number, a=0, b=100) { return Math.max(a, Math.min(b, n)); }

function computeTodayScore(f: any): number {
  // weights sum to 1.0
  const w = {
    sleep: 0.22,
    wellbeing: 0.18,
    stress: 0.14,
    activity: 0.10,
    productivity: 0.14,
    nutrition: 0.12,
    alcohol: 0.05,
    coffee: 0.03,
    smoking: 0.02,
  };

  const sleepHours = typeof f.sleepHours === "number" ? f.sleepHours : null;
  const sleepQ = typeof f.sleepQuality === "number" ? f.sleepQuality : null;
  // ideal 7-9h
  let sleepScore = 60;
  if (sleepHours != null) {
    const d = Math.abs(sleepHours - 8);
    sleepScore = clamp(100 - d * 18);
  }
  if (sleepQ != null) sleepScore = clamp((sleepScore * 0.6) + (sleepQ * 10 * 0.4));

  const wellbeingScore = f.wellbeing ? f.wellbeing * 10 : 60;
  const stressScore = f.stress ? clamp(100 - f.stress * 10) : 60;
  const activityScore = f.activity === true ? 85 : 55;
  const productivityScore = f.productivity ? f.productivity * 10 : 60;
  const nutritionScore = f.nutrition ? f.nutrition * 10 : 60;
  const alcoholScore = f.alcohol === true ? 30 : 90;
  const coffeeScore = f.coffee === true ? 70 : 80;
  const smokingScore = f.smoking === true ? 25 : 90;

  const score =
    sleepScore * w.sleep +
    wellbeingScore * w.wellbeing +
    stressScore * w.stress +
    activityScore * w.activity +
    productivityScore * w.productivity +
    nutritionScore * w.nutrition +
    alcoholScore * w.alcohol +
    coffeeScore * w.coffee +
    smokingScore * w.smoking;

  return clamp(Math.round(score));
}

async function recomputePulse7(userId: string, centerDate: dayjs.Dayjs) {
  // recompute in window center-6 .. center+6 so that any affected rolling windows update
  const start = centerDate.subtract(6, "day").startOf("day");
  const end = centerDate.add(6, "day").endOf("day");
  const days = await prisma.healthDay.findMany({
    where: { userId, date: { gte: start.toDate(), lte: end.toDate() } },
    orderBy: { date: "asc" },
  });

  // helper to get todayScore for a date from fetched days
  const map = new Map<string, number>();
  days.forEach(d => map.set(dayjs(d.date).format("YYYY-MM-DD"), d.todayScore));

  const updates: { id: string; pulse7Score: number }[] = [];
  for (const d of days) {
    const date = dayjs(d.date);
    let sum = 0, cnt = 0;
    for (let i=0;i<7;i++){
      const key = date.subtract(i,"day").format("YYYY-MM-DD");
      const sc = map.get(key);
      if (typeof sc === "number") { sum += sc; cnt++; }
    }
    const avg = cnt ? sum / cnt : d.todayScore;
    // inertia: blend with todayScore
    const pulse = clamp(Math.round(avg * 0.75 + d.todayScore * 0.25));
    updates.push({ id: d.id, pulse7Score: pulse });
  }

  await prisma.$transaction(
    updates.map(u => prisma.healthDay.update({ where: { id: u.id }, data: { pulse7Score: u.pulse7Score } }))
  );
}

router.get("/today", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = dayjs().startOf("day");
  const day = await prisma.healthDay.findUnique({
    where: { userId_date: { userId: req.user!.id, date: date.toDate() } },
  });
  res.json({ day });
}));

router.get("/day/:date", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = dayjs(req.params.date, "YYYY-MM-DD", true);
  if (!date.isValid()) throw new HttpError(400, "Invalid date");
  const day = await prisma.healthDay.findUnique({
    where: { userId_date: { userId: req.user!.id, date: date.startOf("day").toDate() } },
  });
  res.json({ day });
}));

router.put("/checkin", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const body = FactorsSchema.parse(req.body);
  const date = body.date ? dayjs(body.date, "YYYY-MM-DD", true) : dayjs();
  if (!date.isValid()) throw new HttpError(400, "Invalid date");

  const normalizedDate = date.startOf("day");

  const todayScore = computeTodayScore(body);

  const day = await prisma.healthDay.upsert({
    where: { userId_date: { userId: req.user!.id, date: normalizedDate.toDate() } },
    create: {
      userId: req.user!.id,
      date: normalizedDate.toDate(),
      sleepHours: body.sleepHours ?? undefined,
      sleepQuality: body.sleepQuality ?? undefined,
      alcohol: body.alcohol ?? false,
      coffee: body.coffee ?? false,
      wellbeing: body.wellbeing ?? undefined,
      stress: body.stress ?? undefined,
      activity: body.activity ?? false,
      productivity: body.productivity ?? undefined,
      nutrition: body.nutrition ?? undefined,
      smoking: body.smoking ?? false,
      comment: body.comment ?? undefined,
      todayScore,
      pulse7Score: todayScore,
    },
    update: {
      sleepHours: body.sleepHours ?? undefined,
      sleepQuality: body.sleepQuality ?? undefined,
      alcohol: body.alcohol ?? undefined,
      coffee: body.coffee ?? undefined,
      wellbeing: body.wellbeing ?? undefined,
      stress: body.stress ?? undefined,
      activity: body.activity ?? undefined,
      productivity: body.productivity ?? undefined,
      nutrition: body.nutrition ?? undefined,
      smoking: body.smoking ?? undefined,
      comment: body.comment ?? undefined,
      todayScore,
    },
  });

  await recomputePulse7(req.user!.id, normalizedDate);

  const updated = await prisma.healthDay.findUnique({ where: { id: day.id } });

  res.json({ day: updated });
}));

router.delete("/day/:date", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const date = dayjs(req.params.date, "YYYY-MM-DD", true);
  if (!date.isValid()) throw new HttpError(400, "Invalid date");
  const normalized = date.startOf("day");
  await prisma.healthDay.deleteMany({ where: { userId: req.user!.id, date: normalized.toDate() } });
  await recomputePulse7(req.user!.id, normalized);
  res.json({ ok: true });
}));

router.get("/range", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const from = dayjs(req.query.from?.toString(), "YYYY-MM-DD", true);
  const to = dayjs(req.query.to?.toString(), "YYYY-MM-DD", true);
  if (!from.isValid() || !to.isValid()) throw new HttpError(400, "from/to required YYYY-MM-DD");

  const days = await prisma.healthDay.findMany({
    where: { userId: req.user!.id, date: { gte: from.startOf("day").toDate(), lte: to.endOf("day").toDate() } },
    orderBy: { date: "asc" },
  });
  res.json({ days });
}));

router.get("/stats", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const period = Number(req.query.days ?? 7);
  const days = [7,14,30].includes(period) ? period : 7;
  const to = dayjs().endOf("day");
  const from = dayjs().subtract(days - 1, "day").startOf("day");

  const rows = await prisma.healthDay.findMany({
    where: { userId: req.user!.id, date: { gte: from.toDate(), lte: to.toDate() } },
    orderBy: { date: "asc" },
  });

  const counters = {
    noAlcoholDays: rows.filter(r => !r.alcohol).length,
    noSmokingDays: rows.filter(r => !r.smoking).length,
    goodNutritionDays: rows.filter(r => (r.nutrition ?? 0) >= 7).length,
  };

  // streaks (simple current streak)
  const sorted = [...rows].sort((a,b)=>+a.date-+b.date);
  const lastKey = dayjs().format("YYYY-MM-DD");
  const map = new Map(sorted.map(r => [dayjs(r.date).format("YYYY-MM-DD"), r]));
  function streak(pred: (r:any)=>boolean) {
    let s=0;
    for (let i=0;i<days;i++){
      const key = dayjs().subtract(i,"day").format("YYYY-MM-DD");
      const r = map.get(key);
      if (r && pred(r)) s++; else break;
    }
    return s;
  }

  const streaks = {
    noAlcohol: streak(r=>!r.alcohol),
    noSmoking: streak(r=>!r.smoking),
    goodSleep: streak(r=>(r.sleepHours ?? 0) >= 7 && (r.sleepQuality ?? 0) >= 7),
    goodNutrition: streak(r=>(r.nutrition ?? 0) >= 7),
  };

  res.json({ periodDays: days, from: from.toISOString(), to: to.toISOString(), rows, counters, streaks });
}));

export default router;
