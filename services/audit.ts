import { AUDIT_JOB_NAMES, WriteAuditLogJobData } from "../jobs/audit";
import auditQueue from "../queues/audit";

export enum AuditEvent {
  // Registration
  REGISTRATION_INITIATED = "REGISTRATION_INITIATED",
  USER_CREATED = "USER_CREATED",
  OTP_INVALID = "OTP_INVALID",
  OTP_MAX_ATTEMPTS = "OTP_MAX_ATTEMPTS",
  OTP_SESSION_EXPIRED = "OTP_SESSION_EXPIRED",

  // Auth
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGIN_FAILED = "LOGIN_FAILED",
  TOKEN_REFRESHED = "TOKEN_REFRESHED",
  TOKEN_REUSE_DETECTED = "TOKEN_REUSE_DETECTED",
  LOGOUT = "LOGOUT",
  LOGOUT_ALL = "LOGOUT_ALL",

  // App events (wire these up later as you build)
  URL_SHORTENED = "URL_SHORTENED",
}

export async function log(payload: WriteAuditLogJobData): Promise<void> {
  try {
    auditQueue.add(AUDIT_JOB_NAMES.WRITE_LOG, payload, {
      attempts: 5,
      backoff: { type: "exponential", delay: 500 },
      // Audit jobs are low priority — don't let a backlog affect other queues
      priority: 10,
    });
  } catch (err) {
    // Queue failure should never crash the main flow
    console.error("[Audit] Failed to enqueue log:", err);
  }
}
