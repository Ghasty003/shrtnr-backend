import { Worker } from "bullmq";
import trackClick from "./trackClick";

const worker = new Worker(
  "analytics",
  async (job) => {
    console.log("Worker got job: ", job.id);

    switch (job.name) {
      case "save-analytics":
        const { url_id, ip, user_agent, referrer } = job.data;

        // do the analytics job here
        await trackClick({ ip, referrer, url_id, user_agent });
        break;
      default:
        throw new Error("Unknown job type");
    }
  },
  {
    connection: {
      host: "127.0.0.1",
      port: 6379,
    },
    concurrency: 10,
  },
);

worker.on("active", (job) => {
  console.log("Job active: ", job.id);
});

worker.on("completed", (job) => {
  console.log("Job completed. Job id: ", job.id);
});

worker.on("failed", (job, err) => {
  console.log("Job failed. Job id: ", job?.id, "Error: ", err.message);
});
