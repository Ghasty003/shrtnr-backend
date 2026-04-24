import { ConnectionOptions } from "bullmq";

// Single connection config reused across all queues and workers
const connection: ConnectionOptions = {
  host: process.env.REDIS_URL || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export default connection;
