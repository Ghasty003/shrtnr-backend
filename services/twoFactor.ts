import { generateSecret, verify, generateURI } from "otplib";
import qrcode from "qrcode";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import redisClient from "../lib/redis";
import {
  signAccessToken,
  generateRefreshToken,
  refreshTokenExpiry,
} from "../utils/token";
import { AuthError, ValidationError } from "./errors";
import { log, AuditEvent } from "./audit";

const SETUP_TTL = 60 * 10;
const PENDING_TTL = 60 * 5;
const RECOVERY_CODE_COUNT = 10;
const APP_NAME = "Shrtnr";

// Helpers

function generatePlainRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const a = randomBytes(3).toString("hex").toUpperCase();
    const b = randomBytes(3).toString("hex").toUpperCase();
    return `${a}-${b}`;
  });
}

async function hashRecoveryCodes(
  codes: string[],
): Promise<{ codeHash: string }[]> {
  return Promise.all(
    codes.map(async (c) => ({ codeHash: await bcrypt.hash(c, 10) })),
  );
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export async function initiate2FASetup(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true },
  });
  if (!user) throw new AuthError("User not found.");
  if (user.twoFactorEnabled)
    throw new ValidationError("Two-factor authentication is already enabled.");

  const secret = generateSecret();
  const otpauthUri = generateURI({
    secret,
    issuer: APP_NAME,
    label: user.email,
  });
  const qrDataUrl = await qrcode.toDataURL(otpauthUri);

  await redisClient.set(`2fa_setup:${userId}`, secret, { EX: SETUP_TTL });

  return { qrDataUrl, secret, otpauthUri };
}

export async function enable2FA(
  userId: number,
  token: string,
  ip?: string,
  userAgent?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true },
  });
  if (!user) throw new AuthError("User not found.");
  if (user.twoFactorEnabled)
    throw new ValidationError("Two-factor authentication is already enabled.");

  const secret = await redisClient.get(`2fa_setup:${userId}`);
  if (!secret)
    throw new ValidationError("Setup session expired. Please start again.");

  const result = await verify({ secret, token });
  if (!result.valid) throw new ValidationError("Invalid code. Try again.");

  const plainCodes = generatePlainRecoveryCodes();
  const hashedCodes = await hashRecoveryCodes(plainCodes);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: hashedCodes.map((h) => ({ ...h, userId })),
    }),
  ]);

  await redisClient.del(`2fa_setup:${userId}`);

  log({
    eventType: AuditEvent.TWO_FA_ENABLED,
    actorId: userId,
    actorEmail: user.email,
    ip,
    userAgent,
  });

  return { recoveryCodes: plainCodes };
}

export async function disable2FA(
  userId: number,
  token: string,
  ip?: string,
  userAgent?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user) throw new AuthError("User not found.");
  if (!user.twoFactorEnabled)
    throw new ValidationError("Two-factor authentication is not enabled.");

  const result = await verify({ secret: user.twoFactorSecret!, token });
  if (!result.valid) throw new ValidationError("Invalid code.");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);

  log({
    eventType: AuditEvent.TWO_FA_DISABLED,
    actorId: userId,
    actorEmail: user.email,
    ip,
    userAgent,
  });
}

// ─── Login challenge ──────────────────────────────────────────────────────────

interface PendingSession {
  userId: number;
  email: string;
  deviceId: string;
  userAgent?: string;
  ip?: string;
}

export async function create2FAPendingSession(
  data: PendingSession,
): Promise<string> {
  const sessionKey = uuidv4();
  await redisClient.set(`2fa_pending:${sessionKey}`, JSON.stringify(data), {
    EX: PENDING_TTL,
  });
  return sessionKey;
}

export async function verify2FALogin(
  sessionKey: string,
  token: string,
  userAgent?: string,
  ip?: string,
) {
  const raw = await redisClient.get(`2fa_pending:${sessionKey}`);
  if (!raw) throw new ValidationError("Session expired. Please log in again.");

  const session: PendingSession = JSON.parse(raw);
  const { userId, email, deviceId } = session;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      autoCopy: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });
  if (!user?.twoFactorEnabled) throw new AuthError("2FA not configured.");

  // Try TOTP first, then fall back to a recovery code
  const totpResult = await verify({ secret: user.twoFactorSecret!, token });
  if (!totpResult.valid) {
    await verifyRecoveryCode(userId, token);
  }

  await redisClient.del(`2fa_pending:${sessionKey}`);

  const { raw: rawRefresh, hash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      userId,
      deviceId,
      userAgent,
      ip,
      expiresAt: refreshTokenExpiry(),
    },
  });

  const accessToken = signAccessToken({ sub: userId, email });

  log({
    eventType: AuditEvent.LOGIN_SUCCESS,
    actorId: userId,
    actorEmail: email,
    ip,
    userAgent,
    meta: { deviceId, via: "2fa" },
  });

  return {
    accessToken,
    refreshToken: rawRefresh,
    deviceId,
    // Full user object so the frontend can persist it without any prior state
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      autoCopy: user.autoCopy,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  };
}

async function verifyRecoveryCode(userId: number, plainCode: string) {
  const codes = await prisma.recoveryCode.findMany({
    where: { userId, used: false },
  });

  for (const code of codes) {
    const match = await bcrypt.compare(plainCode, code.codeHash);
    if (match) {
      await prisma.recoveryCode.update({
        where: { id: code.id },
        data: { used: true },
      });
      return;
    }
  }

  throw new ValidationError("Invalid authentication code.");
}
