import { env } from "env";
import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Per-call Gemini transcription cost estimate (US$). Calibrated against
// google/gemini-2.5-flash audio pricing — adjust here if the model changes.
// Used only for back-of-envelope cost rollups in the dashboard.
const VOICE_COST_USD = 0.003;

function isAdmin(email: string | null): boolean {
  if (!email) return false;
  const allowed = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

interface VoiceUsageRow {
  bucket: string;
  users: bigint | number;
}

interface DayCountRow {
  day: string;
  count: bigint | number;
}

interface EventTotalRow {
  event: string;
  count: bigint | number;
}

function toNumber(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

export default handler(async ({ user }) => {
  requireAuth(user);
  if (!isAdmin(user.email)) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  // 30-day window for DAU / activity rollups.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, signedInUsers, anonymousUsers, totalTasks, eventTotalsRaw] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { email: { not: null } } }),
    prisma.user.count({ where: { email: null } }),
    prisma.task.count({ where: { deletedAt: null } }),
    prisma.$queryRaw<EventTotalRow[]>`
        SELECT event, COUNT(*) AS count
        FROM "AnalyticsEvent"
        WHERE "createdAt" >= ${since.toISOString()}
        GROUP BY event
        ORDER BY count DESC
      `,
  ]);

  // Daily active users from any tracked event in the last 30 days.
  const dauRaw = await prisma.$queryRaw<DayCountRow[]>`
    SELECT DATE("createdAt") AS day, COUNT(DISTINCT "userId") AS count
    FROM "AnalyticsEvent"
    WHERE "createdAt" >= ${since.toISOString()} AND "userId" IS NOT NULL
    GROUP BY day
    ORDER BY day DESC
    LIMIT 30
  `;

  // Voice usage per user per day, then bucket users so we can read the
  // pricing distribution at a glance. Each row is "in the last 30 days,
  // how many distinct users had a max-day-voice-count in this bucket".
  const voiceUsageRaw = await prisma.$queryRaw<VoiceUsageRow[]>`
    WITH per_day AS (
      SELECT "userId", DATE("createdAt") AS day, COUNT(*) AS calls
      FROM "AnalyticsEvent"
      WHERE event = 'voice_used' AND "createdAt" >= ${since.toISOString()} AND "userId" IS NOT NULL
      GROUP BY "userId", day
    ),
    per_user_max AS (
      SELECT "userId", MAX(calls) AS max_day
      FROM per_day
      GROUP BY "userId"
    )
    SELECT
      CASE
        WHEN max_day = 0 THEN '0'
        WHEN max_day <= 3 THEN '1-3'
        WHEN max_day <= 10 THEN '4-10'
        WHEN max_day <= 25 THEN '11-25'
        WHEN max_day <= 50 THEN '26-50'
        ELSE '50+'
      END AS bucket,
      COUNT(*) AS users
    FROM per_user_max
    GROUP BY bucket
    ORDER BY bucket
  `;

  const voiceCallsTotal = toNumber(eventTotalsRaw.find((r) => r.event === "voice_used")?.count);
  const voiceFailedTotal = toNumber(eventTotalsRaw.find((r) => r.event === "voice_failed")?.count);

  // p90 voice calls/day from the same per-user-max distribution.
  const voicePerUserMaxRaw = await prisma.$queryRaw<{ max_day: bigint | number }[]>`
    WITH per_day AS (
      SELECT "userId", DATE("createdAt") AS day, COUNT(*) AS calls
      FROM "AnalyticsEvent"
      WHERE event = 'voice_used' AND "createdAt" >= ${since.toISOString()} AND "userId" IS NOT NULL
      GROUP BY "userId", day
    )
    SELECT MAX(calls) AS max_day
    FROM per_day
    GROUP BY "userId"
    ORDER BY max_day ASC
  `;
  const sortedMax = voicePerUserMaxRaw.map((r) => toNumber(r.max_day));
  const p50 = sortedMax.length ? sortedMax[Math.floor(sortedMax.length * 0.5)] : 0;
  const p90 = sortedMax.length ? sortedMax[Math.floor(sortedMax.length * 0.9)] : 0;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: 30,
    users: {
      total: totalUsers,
      signedIn: signedInUsers,
      anonymous: anonymousUsers,
    },
    tasks: {
      activeTotal: totalTasks,
    },
    activity: {
      dau: dauRaw.map((r) => ({ day: r.day, users: toNumber(r.count) })),
    },
    voice: {
      callsTotal: voiceCallsTotal,
      failedTotal: voiceFailedTotal,
      estimatedCostUsd: Number((voiceCallsTotal * VOICE_COST_USD).toFixed(2)),
      perUserPerDayP50: p50,
      perUserPerDayP90: p90,
      // Pricing read: if p90 ≤ proposed cap (10), the cap is barely
      // binding; if p50 > cap, cap drives meaningful conversion.
      proposedFreeCap: 10,
      distribution: voiceUsageRaw.map((r) => ({ bucket: r.bucket, users: toNumber(r.users) })),
    },
    events: eventTotalsRaw.map((r) => ({ event: r.event, count: toNumber(r.count) })),
  };
});
