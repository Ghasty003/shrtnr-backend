import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../utils/token";
import { AuthError, ConflictError, ValidationError } from "./errors";
import { log, AuditEvent } from "./audit";

export async function updateUsername(
  userId: number,
  newUsername: string,
  ip?: string,
  userAgent?: string,
) {
  const existing = await prisma.user.findUnique({
    where: { username: newUsername },
  });

  if (existing && existing.id !== userId) {
    throw new ConflictError("This username is already taken.");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { username: newUsername },
    select: { id: true, username: true, email: true },
  });

  log({
    eventType: AuditEvent.USERNAME_CHANGED,
    actorId: userId,
    actorEmail: updated.email,
    ip,
    userAgent,
    meta: { newUsername },
  });

  return updated;
}

interface ChangePasswordPayload {
  userId: number;
  currentPassword: string;
  newPassword: string;
  rawRefreshToken: string; // current device's token — kept alive, all others revoked
  ip?: string;
  userAgent?: string;
}

export async function changePassword(payload: ChangePasswordPayload) {
  const {
    userId,
    currentPassword,
    newPassword,
    rawRefreshToken,
    ip,
    userAgent,
  } = payload;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError("User not found.");

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) {
    log({
      eventType: AuditEvent.PASSWORD_CHANGE_FAILED,
      actorId: userId,
      actorEmail: user.email,
      ip,
      userAgent,
      meta: { reason: "wrong_current_password" },
    });
    throw new AuthError("Current password is incorrect.");
  }

  const samePassword = await bcrypt.compare(newPassword, user.password);
  if (samePassword) {
    throw new ValidationError(
      "New password must be different from your current password.",
    );
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  const currentTokenHash = hashRefreshToken(rawRefreshToken);

  // Need the deviceId before the transaction wipes the token
  const currentToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: currentTokenHash },
    select: { deviceId: true },
  });

  const { raw: newRaw, hash: newRefreshHash } = generateRefreshToken();

  await prisma.$transaction([
    // 1. Update password
    prisma.user.update({
      where: { id: userId },
      data: { password: newPasswordHash },
    }),
    // 2. Revoke all other sessions
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, NOT: { tokenHash: currentTokenHash } },
      data: { revokedAt: new Date() },
    }),
    // 3. Mark current token as rotated
    prisma.refreshToken.updateMany({
      where: { tokenHash: currentTokenHash },
      data: { replacedBy: newRefreshHash, revokedAt: new Date() },
    }),
    // 4. Issue fresh token for current device
    prisma.refreshToken.create({
      data: {
        tokenHash: newRefreshHash,
        userId,
        deviceId: currentToken?.deviceId ?? "unknown",
        userAgent,
        ip,
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  log({
    eventType: AuditEvent.PASSWORD_CHANGED,
    actorId: userId,
    actorEmail: user.email,
    ip,
    userAgent,
  });

  return { accessToken, refreshToken: newRaw };
}
