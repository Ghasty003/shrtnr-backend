import type { Request, Response } from "express";
import {
  initiate2FASetup,
  enable2FA,
  disable2FA,
  verify2FALogin,
} from "../services/twoFactor";
import { handleError } from "../services/errors";

const isProd = process.env.NODE_ENV === "production";

export async function setup2FAHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const result = await initiate2FASetup(userId);
    return res.status(200).json({ success: true, data: result });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function enable2FAHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { token } = req.body;
    const result = await enable2FA(
      userId,
      token,
      req.ip,
      req.headers["user-agent"],
    );
    return res.status(200).json({ success: true, data: result });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function disable2FAHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { token } = req.body;
    await disable2FA(userId, token, req.ip, req.headers["user-agent"]);
    return res.status(200).json({ success: true, message: "2FA disabled." });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function verify2FAHandler(req: Request, res: Response) {
  try {
    const { sessionKey, token } = req.body;
    const result = await verify2FALogin(
      sessionKey,
      token,
      req.headers["user-agent"],
      req.ip,
    );

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      data: {
        requiresTwoFactor: false,
        accessToken: result.accessToken,
        deviceId: result.deviceId,
        user: result.user,
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
}
