import { Worker } from "bullmq";
import connection from "../lib/bullmq";
import { AUDIT_JOB_NAMES, WriteAuditLogJobData } from "../jobs/audit";
import { prisma } from "../lib/prisma";

const auditWorker = new Worker(
  "audit",
  async (job) => {
    switch (job.name) {
      case AUDIT_JOB_NAMES.WRITE_LOG: {
        const data = job.data as WriteAuditLogJobData;
        await prisma.auditLog.create({ data: <any>data });
        break;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 20, // pure DB writes, can handle higher concurrency
  },
);

auditWorker.on("failed", (job, err) => {
  // Log to console only — can't write to audit log from the audit worker itself
  console.error(`[Audit Worker] Job ${job?.id} failed:`, err.message);
});

export default auditWorker;
