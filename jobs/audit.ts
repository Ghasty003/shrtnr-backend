import { AuditEvent } from "../services/audit";

export const AUDIT_JOB_NAMES = {
  WRITE_LOG: "write-log",
} as const;

export interface WriteAuditLogJobData {
  eventType: AuditEvent;
  actorId?: number;
  actorEmail?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}
