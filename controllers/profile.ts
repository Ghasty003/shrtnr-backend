import type { Request, Response } from "express";
import { updateUsername, changePassword } from "../services/profile";
import { handleError } from "../services/errors";

const isProd = process.env.NODE_ENV === "production";

export async function updateUsernameHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { username } = req.body;

    const updated = await updateUsername(
      userId,
      username,
      req.ip,
      req.headers["user-agent"],
    );

    return res.status(200).json({ success: true, data: { user: updated } });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function changePasswordHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { currentPassword, newPassword } = req.body;
    const rawRefreshToken = req.cookies?.refreshToken;

    if (!rawRefreshToken) {
      return res.status(401).json({ message: "No refresh token present." });
    }

    const tokens = await changePassword({
      userId,
      currentPassword,
      newPassword,
      rawRefreshToken,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Rotate the cookie with the fresh refresh token
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (e) {
    return handleError(res, e);
  }
}
