import { Worker } from "bullmq";
import connection from "../lib/bullmq";
import {
  ANALYTICS_JOB_NAMES,
  DisableLinkJobData,
  type SaveClickJobData,
} from "../jobs/analytics";
import trackClick from "../utils/trackClick";
import { prisma } from "../lib/prisma";
import redisClient from "../lib/redis";

const analyticsWorker = new Worker(
  "analytics",
  async (job) => {
    switch (job.name) {
      case ANALYTICS_JOB_NAMES.SAVE_CLICK: {
        const { url_id, ip, user_agent, referrer } =
          job.data as SaveClickJobData;
        await trackClick({ url_id, ip, user_agent, referrer });
        break;
      }
      case ANALYTICS_JOB_NAMES.DISABLE_LINK: {
        const { url_id, short_code } = job.data as DisableLinkJobData;
        await Promise.all([
          prisma.url.update({
            where: { id: url_id },
            data: { status: "DISABLED" },
          }),
          // Evict from Redis so redirects stop serving it
          redisClient.del(short_code),
        ]);
        break;
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  },
  { connection, concurrency: 10 },
);

analyticsWorker.on("active", (job) => {
  console.log("Job active: ", job.id);
});

analyticsWorker.on("failed", (job, err) => {
  console.error(`[Analytics Worker] Job ${job?.id} failed:`, err.message);
});

analyticsWorker.on("completed", (job) => {
  console.log(`[Analytics Worker] Job ${job.id} completed`);
});

export default analyticsWorker;
