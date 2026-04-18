import type { Request, Response } from "express";
import { AuditEvent, log } from "../services/audit";
import {
  createUrl,
  getDashboardStats,
  getRecentActivity,
  getUserLinks,
  getUserLinksPaginated,
  getLinkDetail,
  getLinkStats,
  getLinkClicksOverTime,
  getLinkTopCountries,
  getLinkReferrers,
  getLinkDeviceDistribution,
} from "../services/url";
import redisClient from "../lib/redis";
import queue from "../queues/analytics";
import { ANALYTICS_JOB_NAMES } from "../jobs/analytics";
import { handleError } from "../services/errors";

export async function createShortUrl(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { long_url, alias } = req.body;

    if (!long_url || typeof long_url !== "string") {
      return res.status(400).json({ message: "Invalid URL" });
    }

    const url = await createUrl(long_url, user?.sub, alias);

    log({
      eventType: AuditEvent.URL_SHORTENED,
      actorEmail: user?.email,
      actorId: user?.sub,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { long_url },
    });

    return res.status(201).json({
      success: true,
      message: "URL shortened successfully",
      data: url,
    });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function redirectUrl(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const { code } = req.params;

    const cached = await redisClient.get(<string>code);
    if (cached) {
      const { long_url, id } = JSON.parse(cached);
      queue.add(
        ANALYTICS_JOB_NAMES.SAVE_CLICK,
        {
          url_id: id,
          ip: req.ip ?? null,
          user_agent: req.headers["user-agent"] ?? null,
          referrer: req.headers["referer"] ?? null,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
      );
      log({
        eventType: AuditEvent.URL_REDIRECTED,
        actorEmail: user?.email,
        actorId: user?.sub,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        meta: { long_url },
      });
      return res.redirect(long_url);
    }

    const { prisma } = await import("../lib/prisma");
    const url = await prisma.url.findUnique({
      where: { short_code: <string>code },
    });
    if (!url) return res.status(404).json({ message: "URL not found" });
    if (url.status === "DISABLED")
      return res.status(410).json({ message: "This link has expired." });

    await redisClient.set(
      <string>code,
      JSON.stringify({ id: url.id, long_url: url.long_url }),
    );
    queue.add(
      ANALYTICS_JOB_NAMES.SAVE_CLICK,
      {
        url_id: url.id,
        ip: req.ip ?? null,
        user_agent: req.headers["user-agent"] ?? null,
        referrer: req.headers["referer"] ?? null,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    );
    log({
      eventType: AuditEvent.URL_REDIRECTED,
      actorEmail: user?.email,
      actorId: user?.sub,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      meta: { long_url: url.long_url },
    });
    return res.redirect(url.long_url);
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinks(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const links = await getUserLinks(userId, limit);
    return res.status(200).json({ success: true, data: links });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getStats(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const stats = await getDashboardStats(userId);
    return res.status(200).json({ success: true, data: stats });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getActivity(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const activity = await getRecentActivity(userId, limit);
    return res.status(200).json({ success: true, data: activity });
  } catch (e) {
    return handleError(res, e);
  }
}

// ─── Links page ─────────────────────────────────────────────────────────────

export async function getLinksPaginated(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 15, 50);
    const filter = (req.query.filter as "ALL" | "ACTIVE" | "DISABLED") || "ALL";

    const result = await getUserLinksPaginated(userId, page, limit, filter);
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinkDetailHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const { slug } = req.params;

    const [detail, stats] = await Promise.all([
      getLinkDetail(userId, <string>slug),
      getLinkStats(userId, <string>slug),
    ]);

    if (!detail) return res.status(404).json({ message: "Link not found." });

    return res.status(200).json({ success: true, data: { ...detail, stats } });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinkClicksHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const { slug } = req.params;
    const range = (req.query.range as "7D" | "30D" | "90D") || "7D";

    const data = await getLinkClicksOverTime(userId, <string>slug, range);
    if (!data) return res.status(404).json({ message: "Link not found." });

    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinkCountriesHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const data = await getLinkTopCountries(userId, <string>req.params.slug);
    if (!data) return res.status(404).json({ message: "Link not found." });
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinkReferrersHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const data = await getLinkReferrers(userId, <string>req.params.slug);
    if (!data) return res.status(404).json({ message: "Link not found." });
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getLinkDevicesHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const data = await getLinkDeviceDistribution(
      userId,
      <string>req.params.slug,
    );
    if (!data) return res.status(404).json({ message: "Link not found." });
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}
