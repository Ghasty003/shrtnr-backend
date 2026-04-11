import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import redisClient from "../lib/redis";
import { generateOtp, hashOtp, verifyOtp } from "../utils/otp";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../utils/token";
import { ConflictError, AuthError, ValidationError } from "./errors";
import { log, AuditEvent } from "./audit";
import notificationQueue from "../queues/notification";
import { NOTIFICATION_JOB_NAMES } from "../jobs/notification";

const OTP_TTL = 60 * 10; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

// Shared retry options for notification jobs
const notificationJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
};

// Registration

interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export async function initiateRegistration(payload: RegisterPayload) {
  const { username, email, password, ip, userAgent } = payload;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    const field = existing.email === email ? "email" : "username";

    log({
      eventType: AuditEvent.REGISTRATION_INITIATED,
      actorEmail: email,
      ip,
      userAgent,
      meta: { reason: `${field}_already_exists` },
    });

    throw new ConflictError(`This ${field} is already in use.`);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateOtp();
  const hashedOtp = await hashOtp(otp);

  // Hold registration data in Redis until OTP is verified
  const pendingKey = `pending:${email}`;
  const otpKey = `otp:${email}`;

  await redisClient.set(
    pendingKey,
    JSON.stringify({ username, email, password: hashedPassword }),
    { EX: OTP_TTL },
  );
  await redisClient.set(
    otpKey,
    JSON.stringify({ hash: hashedOtp, attempts: 0 }),
    { EX: OTP_TTL },
  );

  notificationQueue
    .add(
      NOTIFICATION_JOB_NAMES.SEND_OTP,
      { to: email, username, otp },
      notificationJobOptions,
    )
    .catch((err) => console.error("[Queue] Failed to enqueue OTP email:", err));

  log({
    eventType: AuditEvent.REGISTRATION_INITIATED,
    actorEmail: email,
    ip,
    userAgent,
    meta: { username },
  });
}

export async function verifyRegistrationOtp(
  email: string,
  otp: string,
  ip?: string,
  userAgent?: string,
) {
  const otpKey = `otp:${email}`;
  const pendingKey = `pending:${email}`;

  const raw = await redisClient.get(otpKey);
  if (!raw) {
    await log({
      eventType: AuditEvent.OTP_SESSION_EXPIRED,
      actorEmail: email,
      ip,
      userAgent,
    });
    throw new ValidationError("OTP expired or not found.");
  }

  const { hash, attempts } = JSON.parse(raw);

  if (attempts >= MAX_OTP_ATTEMPTS) {
    await redisClient.del([otpKey, pendingKey]);
    await log({
      eventType: AuditEvent.OTP_MAX_ATTEMPTS,
      actorEmail: email,
      ip,
      userAgent,
      meta: { attempts },
    });
    throw new ValidationError("Too many attempts. Please register again.");
  }

  const valid = await verifyOtp(otp, hash);

  if (!valid) {
    // increment attempt count
    await redisClient.set(
      otpKey,
      JSON.stringify({ hash, attempts: attempts + 1 }),
      { KEEPTTL: true },
    );

    log({
      eventType: AuditEvent.OTP_INVALID,
      actorEmail: email,
      ip,
      userAgent,
      meta: { attempts: attempts + 1 },
    });

    throw new ValidationError("Invalid OTP.");
  }

  const pendingRaw = await redisClient.get(pendingKey);
  if (!pendingRaw) {
    await log({
      eventType: AuditEvent.OTP_SESSION_EXPIRED,
      actorEmail: email,
      ip,
      userAgent,
      meta: { reason: "pending_data_missing_after_valid_otp" },
    });

    throw new ValidationError("Registration session expired.");
  }

  const { username, password } = JSON.parse(pendingRaw);

  const user = await prisma.user.create({
    data: { username, email, password, verified: true },
  });

  // clean up Redis
  await redisClient.del([otpKey, pendingKey]);

  notificationQueue
    .add(
      NOTIFICATION_JOB_NAMES.SEND_WELCOME,
      { to: email, username },
      notificationJobOptions,
    )
    .catch((err) => console.error("[Queue] Failed to enqueue OTP email:", err));

  log({
    eventType: AuditEvent.USER_CREATED,
    actorId: user.id,
    actorEmail: email,
    ip,
    userAgent,
    meta: { username },
  });

  return user;
}

// Login

interface LoginPayload {
  email: string;
  password: string;
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}

export async function login(payload: LoginPayload) {
  const { email, password, userAgent, ip } = payload;

  const user = await prisma.user.findUnique({ where: { email } });
  // same error for missing user and wrong password — don't leak which
  if (!user) {
    await log({
      eventType: AuditEvent.LOGIN_FAILED,
      actorEmail: email,
      ip,
      userAgent,
      meta: { reason: "user_not_found" },
    });
    throw new AuthError("Invalid credentials.");
  }

  if (!user.verified) {
    await log({
      eventType: AuditEvent.LOGIN_FAILED,
      actorId: user.id,
      actorEmail: email,
      ip,
      userAgent,
      meta: { reason: "email_not_verified" },
    });
    throw new AuthError("Email not verified.");
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    await log({
      eventType: AuditEvent.LOGIN_FAILED,
      actorId: user.id,
      actorEmail: email,
      ip,
      userAgent,
      meta: { reason: "wrong_password" },
    });
    throw new AuthError("Invalid credentials.");
  }

  const deviceId = payload.deviceId || uuidv4();

  const { raw, hash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      userId: user.id,
      deviceId,
      userAgent,
      ip,
      expiresAt: refreshTokenExpiry(),
    },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });

  await log({
    eventType: AuditEvent.LOGIN_SUCCESS,
    actorId: user.id,
    actorEmail: email,
    ip,
    userAgent,
    meta: { deviceId },
  });

  return { accessToken, refreshToken: raw, deviceId, user };
}

// Token Rotation

export async function rotateRefreshToken(
  rawToken: string,
  userAgent?: string,
  ip?: string,
) {
  const incomingHash = hashRefreshToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: incomingHash },
    include: { user: true },
  });

  if (!existing) throw new AuthError("Invalid refresh token.");

  // Reuse detected — this token was already rotated
  if (existing.replacedBy) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId },
      data: { revokedAt: new Date() },
    });

    await log({
      eventType: AuditEvent.TOKEN_REUSE_DETECTED,
      actorId: existing.userId,
      actorEmail: existing.user.email,
      ip,
      userAgent,
      meta: { deviceId: existing.deviceId },
    });

    throw new AuthError("Token reuse detected. All sessions revoked.");
  }

  if (existing.revokedAt || existing.expiresAt < new Date()) {
    throw new AuthError("Refresh token is no longer valid.");
  }

  const { raw: newRaw, hash: newHash } = generateRefreshToken();

  // Rotate: mark old token as replaced, issue new one
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { replacedBy: newHash, revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: newHash,
        userId: existing.userId,
        deviceId: existing.deviceId,
        userAgent,
        ip,
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: existing.user.id,
    email: existing.user.email,
  });

  await log({
    eventType: AuditEvent.TOKEN_REFRESHED,
    actorId: existing.userId,
    actorEmail: existing.user.email,
    ip,
    userAgent,
    meta: { deviceId: existing.deviceId },
  });

  return { accessToken, refreshToken: newRaw };
}

// Logout

export async function logoutOne(
  rawToken: string,
  ip?: string,
  userAgent?: string,
) {
  const hash = hashRefreshToken(rawToken);

  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
  });

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash },
    data: { revokedAt: new Date() },
  });

  if (token) {
    await log({
      eventType: AuditEvent.LOGOUT,
      actorId: token.userId,
      ip,
      userAgent,
      meta: { deviceId: token.deviceId },
    });
  }
}

export async function logoutAll(
  userId: number,
  ip?: string,
  userAgent?: string,
) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await log({
    eventType: AuditEvent.LOGOUT_ALL,
    actorId: userId,
    ip,
    userAgent,
  });
}
