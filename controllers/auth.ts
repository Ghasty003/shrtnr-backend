import type { Request, Response } from "express";
import {
  initiateRegistration,
  verifyRegistrationOtp,
  login,
  rotateRefreshToken,
  logoutOne,
  logoutAll,
} from "../services/auth";
import { handleError } from "../services/errors";

const isProd = process.env.NODE_ENV === "production";

export async function register(req: Request, res: Response) {
  try {
    const { username, email, password } = req.body;
    await initiateRegistration({
      username,
      email,
      password,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.status(200).json({
      success: true,
      message: "OTP sent. Check your email.",
    });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const { email, otp } = req.body;
    const user = await verifyRegistrationOtp(
      email,
      otp,
      req.ip,
      req.headers["user-agent"],
    );
    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      data: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const { email, password, deviceId } = req.body;
    const result = await login({
      email,
      password,
      deviceId,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    // 2FA required — return sessionKey only, no tokens yet
    if (result.requiresTwoFactor) {
      return res.status(200).json({
        success: true,
        data: {
          requiresTwoFactor: true,
          sessionKey: result.sessionKey,
        },
      });
    }

    // No 2FA — issue tokens immediately
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
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          autoCopy: result.user.autoCopy,
          twoFactorEnabled: result.user.twoFactorEnabled,
        },
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    const rawToken = req.cookies?.refreshToken;
    if (!rawToken)
      return res.status(401).json({ message: "No refresh token." });

    const tokens = await rotateRefreshToken(
      rawToken,
      req.headers["user-agent"],
      req.ip,
    );

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

export async function logout(req: Request, res: Response) {
  try {
    const rawToken = req.cookies?.refreshToken;
    if (rawToken) await logoutOne(rawToken, req.ip, req.headers["user-agent"]);
    res.clearCookie("refreshToken");
    return res.status(200).json({ success: true, message: "Logged out." });
  } catch (e) {
    return handleError(res, e);
  }
}

export async function logoutAllDevices(req: Request, res: Response) {
  try {
    await logoutAll((req as any).user.sub, req.ip, req.headers["user-agent"]);
    res.clearCookie("refreshToken");
    return res
      .status(200)
      .json({ success: true, message: "All sessions revoked." });
  } catch (e) {
    return handleError(res, e);
  }
}
