import type { Request, Response } from "express";

import { prisma } from "../lib/prisma";
import generateShortCode from "../utils/generateShortCode";
import redisClient from "../lib/redis";
import queue from "../queues/analytics";
import { ANALYTICS_JOB_NAMES } from "../jobs/analytics";

export async function createShortUrl(req: Request, res: Response) {
  try {
    const { long_url } = req.body;

    if (!long_url || typeof long_url !== "string") {
      return res.status(400).json({ message: "Invalid URL" });
    }

    const short_code = generateShortCode();

    const url = await prisma.url.create({
      data: {
        long_url,
        short_code,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Url shortened successfully",
      data: url,
    });
  } catch (error: any) {
    console.error("[Create Short Url] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update decide criteria",
      code: "INTERNAL_ERROR",
    });
  }
}

export async function redirectUrl(req: Request, res: Response) {
  try {
    const { code } = req.params;

    // first check if the url exists in the redis database and serve the longurl from there
    const cached = await redisClient.get(code as string);

    if (cached) {
      const { long_url, id } = JSON.parse(<string>cached);

      // update the click data
      // add the click tracking analytics to queue
      queue.add(
        ANALYTICS_JOB_NAMES.SAVE_CLICK,
        {
          url_id: id,
          ip: req.ip || null,
          user_agent: req.headers["user-agent"] || null,
          referrer: req.headers["referer"] || null,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      );

      return res.redirect(long_url);
    }

    // look up the code in the database
    const url = await prisma.url.findUnique({
      where: { short_code: code as string },
    });

    if (!url)
      return res.status(404).json({
        message: "Url not found",
      });

    // at this point, the short code is valid, save it in redis
    await redisClient.set(
      <string>code,
      JSON.stringify({ id: url.id, long_url: url.long_url }),
      {
        // TODO: uncomment this and track expired url in the db too. will do this using BullMQ delayed job
        // expiration: { type: "EX", value: 60 * 60 * 24 },
      },
    );

    // update the click data
    // add the click tracking analytics to queue
    queue.add(
      "save-analytics",
      {
        url_id: url.id,
        ip: req.ip || null,
        user_agent: req.headers["user-agent"] || null,
        referrer: req.headers["referer"] || null,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );

    return res.redirect(url.long_url);
  } catch (error: any) {
    console.error("[Redirect Url] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update decide criteria",
      code: "INTERNAL_ERROR",
    });
  }
}
