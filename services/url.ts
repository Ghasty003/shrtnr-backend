import { prisma } from "../lib/prisma";
import generateShortCode from "../utils/generateShortCode";
import { ConflictError } from "./errors";
import queue from "../queues/analytics";
import { ANALYTICS_JOB_NAMES } from "../jobs/analytics";

const LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createUrl(
  longUrl: string,
  userId?: number,
  alias?: string,
) {
  const short_code = alias?.trim() || generateShortCode();

  if (alias?.trim()) {
    const existing = await prisma.url.findUnique({
      where: { short_code: alias.trim() },
    });
    if (existing) throw new ConflictError("This alias is already taken.");
  }

  const expires_at = new Date(Date.now() + LINK_TTL_MS);

  const url = await prisma.url.create({
    data: {
      long_url: longUrl,
      short_code,
      user_id: userId ?? null,
      expires_at,
    },
  });

  // Schedule automatic expiry — delay matches the TTL exactly
  await queue.add(
    ANALYTICS_JOB_NAMES.DISABLE_LINK,
    { url_id: url.id, short_code: url.short_code },
    {
      delay: LINK_TTL_MS,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  );

  return url;
}

export async function getUserLinks(userId: number, limit = 5) {
  return prisma.url.findMany({
    where: { user_id: userId },
    include: { _count: { select: { clicks: true } } },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

export async function getDashboardStats(userId: number) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalLinks, totalClicks, clicksToday, mostClicked] = await Promise.all(
    [
      prisma.url.count({ where: { user_id: userId } }),
      prisma.click.count({ where: { url: { user_id: userId } } }),
      prisma.click.count({
        where: { url: { user_id: userId }, clicked_at: { gte: startOfDay } },
      }),
      prisma.url.findFirst({
        where: { user_id: userId },
        include: { _count: { select: { clicks: true } } },
        orderBy: { clicks: { _count: "desc" } },
      }),
    ],
  );

  const mostClickedCount = mostClicked?._count.clicks ?? 0;
  const percentage =
    totalClicks > 0 ? Math.round((mostClickedCount / totalClicks) * 100) : 0;

  return {
    totalLinks,
    totalClicks,
    clicksToday,
    mostClicked: mostClicked
      ? {
          short_code: mostClicked.short_code,
          clicks: mostClickedCount,
          percentage,
        }
      : null,
  };
}

export async function getRecentActivity(userId: number, limit = 5) {
  return prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUserLinksPaginated(
  userId: number,
  page: number = 1,
  limit: number = 15,
  filter: "ALL" | "ACTIVE" | "DISABLED" = "ALL",
) {
  const skip = (page - 1) * limit;
  const where = {
    user_id: userId,
    ...(filter !== "ALL" && { status: filter }),
  };

  const [data, totalCount] = await Promise.all([
    prisma.url.findMany({
      where,
      include: { _count: { select: { clicks: true } } },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.url.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    data,
    totalCount,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    limit,
  };
}

export async function getLinkDetail(userId: number, shortCode: string) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    include: { _count: { select: { clicks: true } } },
  });
  return url ?? null;
}

export async function getLinkStats(userId: number, shortCode: string) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    select: { id: true },
  });
  if (!url) return null;

  const [totalClicks, uniqueResult] = await Promise.all([
    prisma.click.count({ where: { url_id: url.id } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT ip)::bigint AS count
      FROM "Click"
      WHERE url_id = ${url.id}
    `,
  ]);

  return {
    totalClicks,
    uniqueVisitors: Number(uniqueResult[0]?.count ?? 0),
    avgRedirectTime: 142, // hardcoded — no measurement in schema yet
    bounceRate: 4.2, // hardcoded — no measurement in schema yet
  };
}

export async function getLinkClicksOverTime(
  userId: number,
  shortCode: string,
  range: "7D" | "30D" | "90D",
) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    select: { id: true },
  });
  if (!url) return null;

  const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;

  const result = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT
      TO_CHAR(clicked_at AT TIME ZONE 'UTC', 'Mon DD') AS date,
      COUNT(*)::bigint AS count
    FROM "Click"
    WHERE url_id = ${url.id}
      AND clicked_at >= NOW() - (${days} || ' days')::INTERVAL
    GROUP BY DATE(clicked_at AT TIME ZONE 'UTC'),
             TO_CHAR(clicked_at AT TIME ZONE 'UTC', 'Mon DD')
    ORDER BY DATE(clicked_at AT TIME ZONE 'UTC') ASC
  `;

  return result.map((r) => ({ date: r.date, clicks: Number(r.count) }));
}

export async function getLinkTopCountries(userId: number, shortCode: string) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    select: { id: true },
  });
  if (!url) return null;

  const [totalClicks, countries] = await Promise.all([
    prisma.click.count({ where: { url_id: url.id } }),
    prisma.click.groupBy({
      by: ["country"],
      where: { url_id: url.id, country: { not: null } },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
      take: 5,
    }),
  ]);

  return countries.map((c) => ({
    country: c.country!,
    count: c._count.country,
    pct:
      totalClicks > 0 ? Math.round((c._count.country / totalClicks) * 100) : 0,
  }));
}

export async function getLinkReferrers(userId: number, shortCode: string) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    select: { id: true },
  });
  if (!url) return null;

  const [totalClicks, referrers] = await Promise.all([
    prisma.click.count({ where: { url_id: url.id } }),
    prisma.click.groupBy({
      by: ["referrer"],
      where: { url_id: url.id },
      _count: { referrer: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 5,
    }),
  ]);

  return referrers.map((r) => ({
    referrer: r.referrer ?? null,
    count: r._count.referrer,
    pct:
      totalClicks > 0 ? Math.round((r._count.referrer / totalClicks) * 100) : 0,
  }));
}

export async function getLinkDeviceDistribution(
  userId: number,
  shortCode: string,
) {
  const url = await prisma.url.findFirst({
    where: { short_code: shortCode, user_id: userId },
    select: { id: true },
  });
  if (!url) return null;

  const [totalClicks, devices] = await Promise.all([
    prisma.click.count({ where: { url_id: url.id } }),
    prisma.click.groupBy({
      by: ["device"],
      where: { url_id: url.id },
      _count: { device: true },
      orderBy: { _count: { device: "desc" } },
    }),
  ]);

  return devices.map((d) => ({
    device: d.device ?? "Desktop",
    count: d._count.device,
    pct:
      totalClicks > 0 ? Math.round((d._count.device / totalClicks) * 100) : 0,
  }));
}

type AnalyticsRange = "30d" | "90d" | "ytd";

function getDateRange(range: AnalyticsRange): Date {
  const now = new Date();
  if (range === "30d") return new Date(now.setDate(now.getDate() - 30));
  if (range === "90d") return new Date(now.setDate(now.getDate() - 90));
  // ytd — Jan 1 of current year
  return new Date(new Date().getFullYear(), 0, 1);
}

function getRangeDays(range: AnalyticsRange): number {
  const now = new Date();
  const start = getDateRange(range);
  return Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getAccountStats(userId: number, range: AnalyticsRange) {
  const since = getDateRange(range);

  const [totalClicks, activeLinks, uniqueResult] = await Promise.all([
    prisma.click.count({
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
    }),
    prisma.url.count({
      where: { user_id: userId, status: "ACTIVE" },
    }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT c.ip)::bigint AS count
      FROM "Click" c
      JOIN "Url" u ON u.id = c.url_id
      WHERE u.user_id = ${userId}
        AND c.clicked_at >= ${since}
    `,
  ]);

  return {
    totalClicks,
    uniqueVisitors: Number(uniqueResult[0]?.count ?? 0),
    avgCtr: 4.2, // hardcoded — no impression data in schema
    activeLinks,
  };
}

export async function getAccountClicksOverTime(
  userId: number,
  range: AnalyticsRange,
) {
  const since = getDateRange(range);

  const result = await prisma.$queryRaw<
    { date: string; direct: bigint; referred: bigint }[]
  >`
    SELECT
      TO_CHAR(c.clicked_at AT TIME ZONE 'UTC', 'Mon DD') AS date,
      COUNT(*) FILTER (WHERE c.referrer IS NULL)::bigint   AS direct,
      COUNT(*) FILTER (WHERE c.referrer IS NOT NULL)::bigint AS referred
    FROM "Click" c
    JOIN "Url" u ON u.id = c.url_id
    WHERE u.user_id = ${userId}
      AND c.clicked_at >= ${since}
    GROUP BY DATE(c.clicked_at AT TIME ZONE 'UTC'),
             TO_CHAR(c.clicked_at AT TIME ZONE 'UTC', 'Mon DD')
    ORDER BY DATE(c.clicked_at AT TIME ZONE 'UTC') ASC
  `;

  return result.map((r) => ({
    date: r.date,
    direct: Number(r.direct),
    referred: Number(r.referred),
  }));
}

export async function getTopPerformingLinks(
  userId: number,
  range: AnalyticsRange,
  limit = 5,
) {
  const since = getDateRange(range);
  const days = getRangeDays(range);
  // Previous period starts 2x days back, ends at the range start
  const prevStart = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  // Get top links by clicks in current period
  const topLinks = await prisma.url.findMany({
    where: { user_id: userId },
    include: {
      _count: { select: { clicks: true } },
      clicks: {
        where: { clicked_at: { gte: since } },
        select: { id: true },
      },
    },
    orderBy: { clicks: { _count: "desc" } },
    take: limit,
  });

  // Get previous period click counts for those same links in one query
  const linkIds = topLinks.map((l) => l.id);
  const prevCounts = await prisma.click.groupBy({
    by: ["url_id"],
    where: {
      url_id: { in: linkIds },
      clicked_at: { gte: prevStart, lt: since },
    },
    _count: { id: true },
  });

  const prevMap = new Map(prevCounts.map((p) => [p.url_id, p._count.id]));

  return topLinks.map((link, i) => {
    const current = link.clicks.length;
    const previous = prevMap.get(link.id) ?? 0;
    const delta =
      previous > 0
        ? Math.round(((current - previous) / previous) * 100)
        : current > 0
          ? 100
          : 0;

    return {
      rank: i + 1,
      short_code: link.short_code,
      long_url: link.long_url,
      created_at: link.created_at,
      clicks: current,
      delta,
      positive: delta >= 0,
    };
  });
}

export async function getAccountCountries(
  userId: number,
  range: AnalyticsRange,
) {
  const since = getDateRange(range);

  const [total, countries] = await Promise.all([
    prisma.click.count({
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
    }),
    prisma.click.groupBy({
      by: ["country"],
      where: {
        url: { user_id: userId },
        country: { not: null },
        clicked_at: { gte: since },
      },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
      take: 6,
    }),
  ]);

  return countries.map((c) => ({
    country: c.country!,
    count: c._count.country,
    pct: total > 0 ? Math.round((c._count.country / total) * 100) : 0,
  }));
}

export async function getAccountReferrers(
  userId: number,
  range: AnalyticsRange,
) {
  const since = getDateRange(range);

  const [total, referrers] = await Promise.all([
    prisma.click.count({
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
    }),
    prisma.click.groupBy({
      by: ["referrer"],
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
      _count: { referrer: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 5,
    }),
  ]);

  return referrers.map((r) => ({
    referrer: r.referrer ?? null,
    count: r._count.referrer,
    pct: total > 0 ? Math.round((r._count.referrer / total) * 100) : 0,
  }));
}

export async function getAccountDevices(userId: number, range: AnalyticsRange) {
  const since = getDateRange(range);

  const [total, devices] = await Promise.all([
    prisma.click.count({
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
    }),
    prisma.click.groupBy({
      by: ["device"],
      where: { url: { user_id: userId }, clicked_at: { gte: since } },
      _count: { device: true },
      orderBy: { _count: { device: "desc" } },
    }),
  ]);

  return devices.map((d) => ({
    device: d.device ?? "Desktop",
    count: d._count.device,
    pct: total > 0 ? Math.round((d._count.device / total) * 100) : 0,
  }));
}
