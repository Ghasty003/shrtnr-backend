import type { Request, Response } from "express";
import { handleError } from "../services/errors";
import {
  getAccountStats,
  getAccountClicksOverTime,
  getTopPerformingLinks,
  getAccountCountries,
  getAccountReferrers,
  getAccountDevices,
} from "../services/url";

type AnalyticsRange = "30d" | "90d" | "ytd";

function parseRange(raw: unknown): AnalyticsRange {
  if (raw === "90d" || raw === "ytd") return raw;
  return "30d";
}

export async function getAnalyticsStats(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getAccountStats(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getAnalyticsClicks(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getAccountClicksOverTime(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getAnalyticsTopLinks(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getTopPerformingLinks(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getAnalyticsCountries(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getAccountCountries(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getAnalyticsReferrers(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getAccountReferrers(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function getAnalyticsDevices(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub as number;
    const range = parseRange(req.query.range);
    const data = await getAccountDevices(userId, range);
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return handleError(res, e);
  }
}
