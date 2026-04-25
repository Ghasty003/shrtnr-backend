import { ConnectionOptions } from "bullmq";

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.password && { password: decodeURIComponent(parsed.password) }),
    ...(parsed.username &&
      parsed.username !== "default" && { username: parsed.username }),
  };
}

const connection: ConnectionOptions = process.env.REDIS_URL
  ? parseRedisUrl(process.env.REDIS_URL)
  : { host: "127.0.0.1", port: 6379 };

export default connection;
